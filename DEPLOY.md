# CCemuc Deploy Runbook

> **OPERATOR STEPS** — This document describes the manual steps a human operator
> must perform to connect and configure the live deployment. Claude Code does NOT
> execute any of these steps automatically; it cannot reach Vercel, Neon, or
> Transbank.

---

## ⚠️ Deploy the Webpay-hardening branch as a whole

The `feat/transbank-hardening` branch changes the Webpay Plus payment flow across
several interdependent commits: the transaction **commit** moves server-side into
`/api/webpay/return` (locating the purchase by the `buy_order` Transbank echoes
back, never by a client-supplied id), the committed **amount is verified** against
a quote frozen before redirect, and `/confirmation` becomes **read-only** — it no
longer commits anything itself and no longer receives `token_ws`. The old
client-callable `confirmPurchase` action is gone entirely; `/confirmation` now
reads state through `getPurchaseReceipt` instead.

**These pieces only work together.** Deploying a partial slice of this branch —
for example, the server-side commit route without the read-only confirmation page,
or vice versa — leaves a real failure mode: a payer's card is charged and the
purchase is committed successfully on the server, but the confirmation page the
browser lands on either errors out or is looking for a `token_ws` that will never
arrive. The purchase is **settled** but the payer sees a **broken confirmation**,
with no way to tell from the UI that they were actually charged.

**Deploy this branch as a single atomic release.** Do not cherry-pick individual
commits from it into production, and do not deploy it partially across multiple
releases.

### ⚠️ If you roll this branch back, repair the data before rolling forward again

`Purchase.isPaid` and `Purchase.status` are mirrors of each other, but only the
code on this branch writes **both**. The old `confirmPurchase` sets `isPaid: true`
alone. So this exact sequence leaves damaged rows:

1. This branch is deployed to production.
2. It is reverted (rolled back to the previous release).
3. **A payment settles during that rollback window** — the old code marks it
   `isPaid: true` and leaves `status` at its default `'PENDING'`.

Those rows are wrong in two ways once you roll forward again:
`createPurchase`'s create-or-retrieve `findFirst` filters on `isPaid: false`, so it
will never select them for repair, and until the fix in
`useConfirmation.ts` shipped they would have shown the payer
"aún no ha sido confirmada" forever. (`/confirmation` now treats `isPaid` **or**
`status = 'PAID'` as settled, so the payer sees a correct receipt either way — but
the `status` column, the `@@index([status])`, and every report built on it stay
wrong until repaired.)

**This applies only if all three of the above happened.** If the branch was never
reverted, or no payment settled during the window, there is nothing to repair.

Run this **before** rolling forward, from a machine with `DIRECT_URL` set:

```bash
set -a; . ./.env; set +a
# 1. Look first — expect zero rows if no payment settled during the rollback window:
npx prisma db execute --url "$DIRECT_URL" --stdin <<'SQL'
SELECT id, "userId", amount, "updatedAt" FROM "Purchase"
WHERE "isPaid" AND status = 'PENDING';
SQL

# 2. Repair. updatedAt is the closest available stand-in for the settlement time:
#    the old code's write is the last thing that touched the row.
npx prisma db execute --url "$DIRECT_URL" --stdin <<'SQL'
UPDATE "Purchase" SET status='PAID', "paidAt"="updatedAt" WHERE "isPaid" AND status='PENDING';
SQL
```

The repaired rows will have no `token`, `authorizationCode`, or `paymentTypeCode`
— the old code never recorded them. Reconcile those against the Transbank portal
by hand if a refund is ever needed for one of them.

---

## Task 47 — Vercel Project & Build Config

### 1. Connect the repository

1. Log in to [vercel.com](https://vercel.com) and click **Add New → Project**.
2. Import the GitHub repository (CCemuc-24 org, monorepo root).
3. **Root directory**: set to `app/` (the Next.js app lives there, NOT the repo root).
4. **Framework preset**: Next.js (auto-detected from `app/`).

### 2. Build & output settings

| Setting | Value |
|---------|-------|
| Build Command | *(leave blank — uses `next build` from package.json)* |
| Output Directory | *(leave blank — Next.js default `.next`)* |
| Install Command | `npm ci` |
| Node.js Version | **20.x** (LTS; matches the project's `engines` field if set, or safe default) |

**Why `prisma generate` runs automatically**: the `postinstall` script in
`app/package.json` runs `prisma generate`, so Vercel's install step triggers it
without any extra configuration.

### 3. Database migration (runs automatically on every build)

Prisma migrations **are** run automatically by the build. The `vercel-build`
script in `package.json` is:

```bash
prisma generate && (export DATABASE_URL="${DATABASE_URL:-${CCEM_POSTGRES_PRISMA_URL:-$CCEM_DATABASE_URL}}" DIRECT_URL="${DIRECT_URL:-${CCEM_DATABASE_URL_UNPOOLED:-$CCEM_POSTGRES_URL_NON_POOLING}}" && prisma migrate deploy && tsx prisma/seed.ts || echo 'WARN: prisma migrate/seed skipped — check Vercel DB env vars') && next build
```

So `prisma migrate deploy` (and the seed script) run on every Vercel build,
resolving `DATABASE_URL`/`DIRECT_URL` from either the plain names or the
Neon-Vercel integration's `CCEM_`-prefixed equivalents.

> **⚠️ This step silently swallows failures.** The `&&` chain is wrapped in
> `(... || echo 'WARN: ...')`, so if `prisma migrate deploy` or the seed script
> fails — for example a `CREATE UNIQUE INDEX` that can't apply because of
> existing duplicate data — the build does **not** fail. It prints a `WARN:`
> line to the build log and proceeds straight to `next build`, which can
> succeed and deploy even though the migration never ran.
>
> **After every deploy that includes a new migration, open the Vercel build
> log and search for `WARN`.** A clean-looking green deployment is not
> sufficient evidence the migration applied — grep the log explicitly:
>
> ```bash
> vercel inspect --logs <deployment-url> | grep WARN
> ```
>
> If you cannot rule out a swallowed failure from the log, re-run the migration
> by hand from a machine with `DATABASE_URL` / `DIRECT_URL` set:
>
> ```bash
> npx prisma migrate deploy
> ```

### 4. Re-deployments

Push to the `main` branch (or merge a PR) — Vercel's Git integration auto-deploys.

---

## Task 48 — Vercel Environment Variables

Set these in **Project Settings → Environment Variables**.
Unless noted, all values are **Server-only** (no `NEXT_PUBLIC_` prefix) and must
**never** be exposed to the browser bundle.

### Database (Neon)

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | Pooled PgBouncer connection string from Neon dashboard | Main runtime connection — use the `-pooler` host; append `?sslmode=require&pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Direct (non-pooled) connection string from Neon dashboard | Used only by `prisma migrate` / `prisma db seed`; use the non-pooler host |

### Transbank Webpay Plus

| Variable | Value | Notes |
|----------|-------|-------|
| `WEBPAY_ENVIRONMENT` | `production` | Set to `integration` only for staging/preview |
| `WEBPAY_COMMERCE_CODE` | Your real Transbank commerce code | Obtained from Transbank Portal |
| `WEBPAY_API_KEY` | Your real Transbank API key | Obtained from Transbank Portal |
| `WEBPAY_RETURN_URL` | `https://<your-domain>/api/webpay/return` | Must match the production domain exactly; Transbank's POST return target |

### Email (SMTP / nodemailer)

| Variable | Value | Notes |
|----------|-------|-------|
| `EMAIL_HOST` | e.g. `smtp.sendgrid.net` | Your SMTP provider host |
| `EMAIL_PORT` | e.g. `587` | Standard TLS submission port |
| `EMAIL_USER` | SMTP username / API key user | |
| `EMAIL_PASS` | SMTP password / API key | **Secret** — mark as sensitive in Vercel |
| `EMAIL_FROM` | `CCemuc <no-reply@ccemuc.cl>` | Display name + sender address |

### App auth & flags

| Variable | Value | Notes |
|----------|-------|-------|
| `ADMIN_SECRET` | Long random string (e.g. `openssl rand -hex 32`) | **Server-only**, **Secret** — NEVER prefix with `NEXT_PUBLIC_`; gates all admin actions |
| `REGISTRATION_OPEN` | `true` or `false` | `true` shows the /pricing UI; anything else shows "No disponible" |
| `NEXT_PUBLIC_BASE_URL` | `https://<your-domain>` | **Public** — safe to expose; used for return-URL derivation and links in emails |

> **Checklist before go-live:**
> - [ ] All variables set in Vercel → Environment Variables (Production scope)
> - [ ] `WEBPAY_ENVIRONMENT=production` confirmed
> - [ ] `ADMIN_SECRET` is a strong random value (not the placeholder `change-me-in-prod`)
> - [ ] `WEBPAY_RETURN_URL` matches the live domain exactly
> - [ ] `DATABASE_URL` uses the pooler host; `DIRECT_URL` uses the direct host

---

## Task 49 — Live Smoke Test Checklist

Run after the first production deploy with all env vars set.

### Public purchase flow (happy path)

The flow is: `/pricing` → `/form` → Webpay's hosted payment page →
`/api/webpay/return` (the transaction is **committed here**, server-side, by
`buy_order`) → `/confirmation` (**read-only** — it does not commit anything and
does not receive `token_ws`) or `/error`.

- [ ] **`/modules`** — page loads, all course modules render correctly with Spanish copy intact
- [ ] **`/pricing`** — course selection UI appears (not "No disponible"); price totals calculate correctly
- [ ] **`/form`** — registration form submits without errors; RUT validation accepts a valid RUT and rejects an invalid one
- [ ] **Webpay redirect** — clicking pay redirects to Transbank's production payment page (not the integration sandbox)
- [ ] **Complete payment** — use a real test card or perform a small live transaction; Transbank POSTs back to `/api/webpay/return`, which commits the transaction and 303-redirects the browser
- [ ] **`/confirmation`** — lands on `/confirmation?purchaseId=<uuid>` with **no `token_ws` in the URL**; page shows "Confirmación de pago" with correct purchase details; no errors in browser console
- [ ] **Confirmation email** — target email inbox receives the confirmation email from `EMAIL_FROM` with correct course list
- [ ] **`/error`** — navigate to `/error?message=test` to confirm the error page renders; simulate an aborted Webpay flow (press "Anular compra" on Transbank's form) to confirm it redirects to `/error?message=...&purchaseId=...` and the purchase is recorded as `ABORTED`, not merely "not paid"

### Admin smoke test (via the Route Handler)

```bash
# Verify the admin courses endpoint is live and protected:
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://<your-domain>/api/admin/courses \
  -H "Content-Type: application/json" \
  -d '{}' \
  # expects 403 (no x-admin-secret header)

curl -s -o /dev/null -w "%{http_code}" \
  -X GET https://<your-domain>/api/admin/courses \
  -H "x-admin-secret: $ADMIN_SECRET"
  # expects 200 with JSON array
```

### Checks after smoke test

- [ ] No `console.error` output in Vercel function logs (Vercel dashboard → Deployments → Functions)
- [ ] Database has a new `Purchase` row with `isPaid = true` **and** `status = 'PAID'`
- [ ] Enrolled courses show decremented `capacity` in DB

### ⚠️ Recurring check: grep the logs for charged-but-unsettled payments

Two conditions are detected **only** by a `console.error` in
`src/lib/webpayConfirm.ts`. Nothing else surfaces them — no email, no admin
screen, no database column — so if nobody greps the logs, nobody ever finds out.
Both mean **a card was charged and the buyer did not get what they paid for**, and
both need a human to reverse or complete the transaction manually.

```bash
# A second Webpay capture authorized against an already-PAID purchase. The card was
# charged twice; the second authorization is deliberately NOT stored on the row
# (overwriting the first charge's facts would destroy what a refund of it needs), so
# the log line is the ONLY record of it. Refund manually.
vercel inspect --logs <deployment-url> | grep 'ORPHAN AUTHORIZATION'

# The commit was approved and the amount verified, but the settlement transaction
# rolled back (a full course, or a database error). The row is marked ERROR with the
# payment facts attached; the buyer was shown a fixed Spanish message. Complete the
# enrolment or refund.
vercel inspect --logs <deployment-url> | grep 'webpay settlement failed'
```

Both markers can also be found under a status query, which is the more reliable
check because it does not depend on log retention:

```sql
SELECT id, "userId", amount, "authorizationCode", "updatedAt"
FROM "Purchase" WHERE status = 'ERROR';
```

(The orphan-authorization case is the exception: it has **no** row of its own — the
purchase stays `PAID` — so only the log line records it.)

---

## AWS Migration Note (future)

When the team is ready to move off Vercel:

### Option A — EC2 + Docker + nginx (mirrors legacy setup)

- Build a Docker image: `FROM node:20-alpine`, `COPY app/ .`, `RUN npm ci && npm run build`, `CMD ["node", "server.js"]` (or `next start`).
- Push to ECR; run on EC2 (t3.small or similar).
- Put nginx in front as a reverse proxy + TLS terminator (same pattern as the old Express backend).
- Use a `systemd` service or Docker Compose for process management.
- **Prisma note**: `prisma generate` must run at image build time; `prisma migrate deploy` is a separate step or entrypoint hook.

### Option B — AWS Amplify Hosting

- Amplify has native Next.js App Router support (SSR, Route Handlers, Server Actions all work).
- Connect the GitHub repo; set the app root to `app/`; Amplify handles build + deploy.
- Simpler ops than EC2 but less control over runtime environment.

### Database portability

Neon Postgres is provider-agnostic — the `DATABASE_URL` / `DIRECT_URL` connection strings
work identically whether the app runs on Vercel, EC2, or Amplify. No DB migration needed
when changing hosting; only update the env vars in the new platform.
