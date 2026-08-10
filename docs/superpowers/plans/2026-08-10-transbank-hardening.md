# Transbank Webpay Plus Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the payment-verification hole in the existing Webpay Plus flow by moving the commit server-side into the return route, verifying `buy_order` and `amount` against a persisted quote, and recording a real payment audit trail on `Purchase`.

**Architecture:** The commit moves out of the client-callable `confirmPurchase` server action and into `src/lib/webpayConfirm.ts`, called only by the `/api/webpay/return` Route Handler. The purchase is located by the `buy_order` Transbank echoes back — never by a client-supplied `purchaseId` — and the committed amount is checked against an `amount` column written before the redirect. `Purchase` gains a `PaymentStatus` enum plus token/authorization/paidAt audit fields so the four distinct Transbank return outcomes (authorized, aborted, timed out, form error) are each recorded instead of collapsed into one. `/pricing → /form → Webpay` routing is unchanged; `/confirmation` becomes a read-only receipt.

**Tech Stack:** Next.js 15.5.19 (App Router), React 19, TypeScript, Prisma 6 on Neon Postgres, `transbank-sdk@5.0.0`, zod 3, Vitest 3 + jsdom, nodemailer, Tailwind v4.

## Global Constraints

- **Amounts are integer CLP.** No decimals, no cents. `Course.price` and `Purchase.amount` are `Int`.
- **The commit may only ever happen server-side**, reachable from the Route Handler. No `'use server'` action may accept a `token_ws` from the client after this plan lands.
- **Locate purchases by `buyOrder`** on any Transbank return path. A client-supplied `purchaseId` is display-only and must never select the row that gets marked paid.
- **Never commit when `token_ws` and `TBK_TOKEN` both arrive.** This is the Transbank-mandated "form error" case.
- **All redirects out of the return handler use HTTP 303**, so the browser converts Transbank's cross-site POST into a same-site GET.
- **`token_ws` must not appear in any redirect URL.** It currently leaks into browser history via `/confirmation?token_ws=…`; this plan removes that.
- **Action return shape is `ActionResult<T>`** from `src/domain/result.ts` — `ok(data)` / `fail(message, status, field?)`. Actions never throw to the client.
- **Validation is zod `safeParse`**, and only the first issue is surfaced: `fail(issue.message, 400, issue.path[0]?.toString())`.
- **User-facing copy is Spanish.** Code, comments, and identifiers are English.
- **Existing test conventions:** colocated `*.test.ts`, `vi.mock` at module boundaries, `if (res.ok)` narrowing before touching `res.data`. Never touch a real DB, SMTP server, or the Transbank network in tests.
- **Full suite must stay green:** `npm run test` — 219 tests / 39 files pass at plan time. Tests this plan intentionally rewrites are named in the tasks that rewrite them.

---

## File Structure

**Create:**
- `src/domain/paymentStatus.ts` — the `PaymentStatus` const-object + type, mirroring the `src/domain/courseType.ts` pattern. Kept in sync with the Prisma enum by hand.
- `prisma/migrations/20260810000000_add_purchase_payment_fields/migration.sql` — enum, columns, backfill, unique index on `buyOrder`.
- `src/lib/webpayReturnParams.ts` — pure `FormData | URLSearchParams → WebpayReturnParams`. Split out so the four-case logic is unit-testable without HTTP.
- `src/lib/webpayReturnParams.test.ts`
- `src/lib/webpayConfirm.ts` — **the single commit point.** Four-case dispatch, commit, `buy_order` + `amount` verification, settlement transaction, status writes.
- `src/lib/webpayConfirm.test.ts`
- `src/lib/purchaseEmail.ts` — `sendPurchaseConfirmation(purchaseId)`. Resolves the recipient from the purchase's own user, so no caller can choose an arbitrary address.
- `src/lib/purchaseEmail.test.ts`

**Modify:**
- `prisma/schema.prisma:49-60` — `Purchase` gains `status`, `amount`, `token`, `authorizationCode`, `paymentTypeCode`, `paidAt`; `buyOrder` becomes `@unique`.
- `prisma/schema.test.ts:21-23` — extend the `Purchase` type-level `Pick`.
- `src/schemas/purchase.ts:19-22` — `updatePurchaseSchema` accepts `status`; `sendConfirmationSchema` loses its `email` field.
- `src/actions/purchases.ts:47-69` — `createPurchase` persists the quoted `amount`.
- `src/actions/purchases.ts:134-239` — delete `confirmPurchase`; replace `sendConfirmation` with `resendConfirmation`; add `getPurchaseReceipt`.
- `src/app/api/webpay/return/route.ts` — becomes the commit caller instead of a param-forwarding shim.
- `src/app/api/webpay/return/route.test.ts` — rewritten for the new contract.
- `src/actions/purchases.confirm.test.ts` — becomes `getPurchaseReceipt` coverage; the commit tests move to `src/lib/webpayConfirm.test.ts`.
- `src/actions/purchases.create.test.ts:…` — assert the persisted `amount`.
- `src/actions/purchases.email.test.ts` — rewritten for `resendConfirmation`.
- `src/components/inscriptions/useConfirmation.ts` — stops driving the commit; loads the receipt in one call.
- `src/app/confirmation/page.tsx:14-21` — no longer reads `token_ws`/`TBK_*`.
- `.env` — add the `WEBPAY_*` / `NEXT_PUBLIC_BASE_URL` vars the flow needs to run locally at all.

**Why `webpayConfirm.ts` is a lib and not an action:** a `'use server'` export is an addressable RPC endpoint any browser can call. Putting the commit there is precisely the current vulnerability. As a plain module imported by the Route Handler, it is unreachable from the client.

---

### Task 1: PaymentStatus enum and the Purchase audit columns

**Files:**
- Create: `src/domain/paymentStatus.ts`
- Modify: `prisma/schema.prisma:12-16` (add enum), `prisma/schema.prisma:49-60` (Purchase model)
- Create: `prisma/migrations/20260810000000_add_purchase_payment_fields/migration.sql`
- Test: `prisma/schema.test.ts:21-23`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `PaymentStatus` const-object and type from `@/domain/paymentStatus`, with members `PENDING | PAID | REJECTED | ABORTED | TIMEOUT | ERROR`. `Purchase.amount: number | null`, `Purchase.status: PaymentStatus`, `Purchase.token: string | null`, `Purchase.authorizationCode: string | null`, `Purchase.paymentTypeCode: string | null`, `Purchase.paidAt: Date | null`. `Purchase.buyOrder` is now uniquely indexed, making `prisma.purchase.findUnique({ where: { buyOrder } })` legal.

- [ ] **Step 1: Pre-flight — confirm no duplicate buyOrder values exist**

The migration adds a `UNIQUE` index. If production data already contains duplicates it will fail — and `vercel-build` swallows migration failures with `|| echo 'WARN: …'`, so a broken deploy would look green. Check first.

`$DIRECT_URL` is not exported into your shell by default — `.env` is only read by the Prisma CLI itself. Source it first, and do that in every step below that uses `--url`:

```bash
set -a; . ./.env; set +a
npx prisma db execute --url "$DIRECT_URL" --stdin <<'SQL'
SELECT "buyOrder", COUNT(*) FROM "Purchase"
WHERE "buyOrder" IS NOT NULL
GROUP BY "buyOrder" HAVING COUNT(*) > 1;
SQL
```
Expected: zero rows. `generateBuyOrder()` is a sha256 prefix so collisions are not expected, but verify rather than assume. If rows come back, stop and resolve them with the user before continuing — do not drop the unique index from the plan, it is load-bearing for the security fix.

- [ ] **Step 2: Write the failing type-level test**

`prisma/schema.test.ts` asserts field presence at compile time. Extend the `Purchase` pick — replace lines 21-23:

```typescript
    const purchase: Pick<
      Purchase,
      'userId' | 'buyOrder' | 'isPaid' | 'coursesIds' | 'status' | 'amount' | 'token' | 'authorizationCode' | 'paymentTypeCode' | 'paidAt'
    > = {
      userId: 'u', buyOrder: 'b', isPaid: false, coursesIds: [],
      status: 'PENDING', amount: 25900, token: null,
      authorizationCode: null, paymentTypeCode: null, paidAt: null,
    };
```

And add a case asserting the domain enum stays in sync with the Prisma enum. Add this `it` block inside the existing `describe('prisma generated types', …)`:

```typescript
  it('PaymentStatus domain enum matches the generated Prisma enum', () => {
    const all: PaymentStatus[] = [
      PaymentStatus.PENDING, PaymentStatus.PAID, PaymentStatus.REJECTED,
      PaymentStatus.ABORTED, PaymentStatus.TIMEOUT, PaymentStatus.ERROR,
    ];
    // Assignability to the generated Prisma enum is the real assertion here:
    // if the two drift, this file stops compiling.
    const asPrisma: PrismaPaymentStatus[] = all;
    expect(asPrisma).toHaveLength(6);
  });
```

Add to the imports at the top of `prisma/schema.test.ts`:

```typescript
import type { PaymentStatus as PrismaPaymentStatus } from '@prisma/client';
import { PaymentStatus } from '../src/domain/paymentStatus';
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run prisma/schema.test.ts`
Expected: FAIL — TypeScript cannot resolve `../src/domain/paymentStatus`, and `Purchase` has no `status`/`amount`/`token`/`authorizationCode`/`paymentTypeCode`/`paidAt` properties.

- [ ] **Step 4: Create the domain enum**

`src/domain/paymentStatus.ts`:

```typescript
// src/domain/paymentStatus.ts
// Values must stay in sync with prisma enum PaymentStatus.
// PENDING  — created, not yet settled (the state every purchase starts in)
// PAID     — commit returned AUTHORIZED and the amount matched
// REJECTED — commit succeeded but was not authorized, or the amount did not match
// ABORTED  — the buyer pressed "Anular compra" on the Transbank form
// TIMEOUT  — the Transbank form sat idle (~10 min) and expired
// ERROR    — Transbank form error, or the card was charged but settlement failed
export const PaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  REJECTED: 'REJECTED',
  ABORTED: 'ABORTED',
  TIMEOUT: 'TIMEOUT',
  ERROR: 'ERROR',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const paymentStatusValues = [
  'PENDING',
  'PAID',
  'REJECTED',
  'ABORTED',
  'TIMEOUT',
  'ERROR',
] as const;
```

- [ ] **Step 5: Add the enum and columns to the Prisma schema**

In `prisma/schema.prisma`, add after the `CourseType` enum (line 16):

```prisma
enum PaymentStatus {
  PENDING
  PAID
  REJECTED
  ABORTED
  TIMEOUT
  ERROR
}
```

Then replace the whole `Purchase` model (lines 49-60) with:

```prisma
model Purchase {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId      String   @db.Uuid
  // UNIQUE because buyOrder is the ONLY key that links a Transbank callback back
  // to a row. The session cookie is not sent on Transbank's cross-site POST, so
  // this is the sole trustworthy join key.
  buyOrder    String?  @unique
  isPaid      Boolean  @default(false)
  coursesIds  String[] @db.Uuid

  // Amount quoted at creation, in integer CLP. The return handler verifies the
  // committed amount against this, so it must be written BEFORE redirecting.
  amount            Int?
  status            PaymentStatus @default(PENDING)
  token             String?   // token_ws, kept for refunds/audit
  authorizationCode String?
  paymentTypeCode   String?
  paidAt            DateTime?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  enrollments Enrollment[]

  @@index([status])
}
```

`isPaid` is deliberately kept alongside `status`. `FormClient.checkIfUserAlreadyPaid` and `PricingClient` read it, and dropping it would widen this plan into unrelated call sites. `status` is the authoritative field; `isPaid` is maintained as a mirror of `status === 'PAID'`.

- [ ] **Step 6: Write the migration SQL**

Create `prisma/migrations/20260810000000_add_purchase_payment_fields/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'REJECTED', 'ABORTED', 'TIMEOUT', 'ERROR');

-- AlterTable
ALTER TABLE "Purchase"
  ADD COLUMN "amount" INTEGER,
  ADD COLUMN "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "token" TEXT,
  ADD COLUMN "authorizationCode" TEXT,
  ADD COLUMN "paymentTypeCode" TEXT,
  ADD COLUMN "paidAt" TIMESTAMP(3);

-- Backfill: rows already settled under the old boolean become PAID. updatedAt is
-- the closest available proxy for when they were paid.
UPDATE "Purchase" SET "status" = 'PAID', "paidAt" = "updatedAt" WHERE "isPaid" = true;

-- CreateIndex: buyOrder is the join key from the Transbank callback. Postgres
-- permits multiple NULLs in a unique index, so legacy rows without a buyOrder
-- are unaffected.
CREATE UNIQUE INDEX "Purchase_buyOrder_key" ON "Purchase"("buyOrder");

-- CreateIndex
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");
```

- [ ] **Step 7: Apply the migration and regenerate the client**

Run:
```bash
npx prisma migrate deploy && npx prisma generate
```
Expected: `1 migration found` / applied cleanly, then `Generated Prisma Client`.

Confirm it registered:
```bash
npx prisma migrate status
```
Expected: "Database schema is up to date!" with the new migration listed as applied.

Then confirm the hand-written SQL actually produced the schema Prisma expects, by reading the live table back:
```bash
set -a; . ./.env; set +a
npx prisma db execute --url "$DIRECT_URL" --stdin <<'SQL'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'Purchase'
  AND column_name IN ('amount','status','token','authorizationCode','paymentTypeCode','paidAt')
ORDER BY column_name;
SQL
```
Expected: six rows. `status` must be `NOT NULL` with default `'PENDING'::"PaymentStatus"`; the other five nullable.

**Do NOT run `prisma migrate diff --shadow-database-url "$DIRECT_URL"`.** A shadow database is created and dropped by Prisma; aiming it at the real database is destructive. If you want that check, it needs a genuinely disposable Postgres, which this task does not provision.

Also verify the two indexes exist:
```bash
npx prisma db execute --url "$DIRECT_URL" --stdin <<'SQL'
SELECT indexname FROM pg_indexes
WHERE tablename = 'Purchase' AND indexname IN ('Purchase_buyOrder_key','Purchase_status_idx');
SQL
```
Expected: both rows present.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run prisma/schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Run the full suite**

Run: `npm run test`
Expected: all 219 tests still pass. This task is additive — nothing should break yet.

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma prisma/schema.test.ts prisma/migrations/20260810000000_add_purchase_payment_fields src/domain/paymentStatus.ts
git commit -m "feat(db): add PaymentStatus enum and payment audit fields to Purchase"
```

---

### Task 2: Persist the quoted amount at purchase creation

**Files:**
- Modify: `src/actions/purchases.ts:47-69`
- Test: `src/actions/purchases.create.test.ts`

**Interfaces:**
- Consumes: `PaymentStatus` from `@/domain/paymentStatus` (Task 1); the `amount` column (Task 1).
- Produces: every `Purchase` handed to Webpay carries `amount` equal to the integer CLP sum sent as the transaction amount, and `status = 'PENDING'`. Task 4's verification depends on this invariant.

The verification in Task 4 compares Transbank's committed amount against a *server-recorded* expectation. Recomputing from `Course.price` at commit time would instead fail legitimate payments whenever a price changed mid-checkout. So the quote is frozen here, before the redirect.

- [ ] **Step 1: Write the failing tests**

Add to `src/actions/purchases.create.test.ts`:

```typescript
  it('persists the quoted amount and PENDING status on the new purchase', async () => {
    prismaMock.course.findMany.mockResolvedValue([
      { id: C1, price: 1000, capacity: 10 },
      { id: C2, price: 2000, capacity: 5 },
    ]);
    prismaMock.purchase.findFirst.mockResolvedValue(null);
    prismaMock.purchase.create.mockResolvedValue({
      id: 'pur-1', userId: USER, buyOrder: 'BUYORDER0000000000000000AB',
      isPaid: false, coursesIds: [C1, C2], amount: 3000, status: 'PENDING',
    });
    mockCreateWebpay.mockResolvedValue({ token: 'tok-123', url: 'https://webpay/redirect' });

    await createPurchase({ userId: USER, coursesIds: [C1, C2] });

    expect(prismaMock.purchase.create).toHaveBeenCalledWith({
      data: {
        userId: USER,
        coursesIds: [C1, C2],
        buyOrder: 'BUYORDER0000000000000000AB',
        amount: 3000,
        status: 'PENDING',
      },
    });
  });

  it('re-quotes a retrieved unpaid purchase when course prices have changed', async () => {
    // An abandoned attempt quoted 3000; the elective has since been repriced to 4000.
    prismaMock.course.findMany.mockResolvedValue([
      { id: C1, price: 4000, capacity: 10 },
    ]);
    prismaMock.purchase.findFirst.mockResolvedValue({
      id: 'pur-old', userId: USER, buyOrder: 'OLDORDER', isPaid: false,
      coursesIds: [C1], amount: 3000, status: 'ABORTED',
    });
    prismaMock.purchase.update.mockResolvedValue({
      id: 'pur-old', userId: USER, buyOrder: 'OLDORDER', isPaid: false,
      coursesIds: [C1], amount: 4000, status: 'PENDING',
    });
    mockCreateWebpay.mockResolvedValue({ token: 'tok-re', url: 'https://webpay/redirect' });

    await createPurchase({ userId: USER, coursesIds: [C1] });

    // The stored amount MUST match what we send to Transbank, or the return
    // handler's amount check would reject a legitimate payment.
    expect(prismaMock.purchase.update).toHaveBeenCalledWith({
      where: { id: 'pur-old' },
      data: { amount: 4000, status: 'PENDING' },
    });
    expect(mockCreateWebpay).toHaveBeenCalledWith('OLDORDER', USER, 4000, expect.any(String));
  });
```

`purchase.update` is not in this file's Prisma mock yet. Extend the `vi.mock('@/lib/prisma', …)` factory at the top of the file so `purchase` includes `update: vi.fn()`, and add `update: ReturnType<typeof vi.fn>` to the `prismaMock` cast's `purchase` type.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/actions/purchases.create.test.ts`
Expected: FAIL — `purchase.create` is called without `amount`/`status`, and `purchase.update` is never called.

- [ ] **Step 3: Implement**

In `src/actions/purchases.ts`, add to the imports:

```typescript
import { PaymentStatus } from '@/domain/paymentStatus';
```

Replace lines 47-67 (from `// Create-or-retrieve` through the `createWebpayTransaction` call) with:

```typescript
  // The amount is frozen here, before the redirect, because the return handler
  // verifies Transbank's committed amount against it. Recomputing at commit time
  // would reject legitimate payments whenever a price changed mid-checkout.
  const totalAmount = courses.reduce((sum, c) => sum + c.price, 0);

  // Create-or-retrieve an unpaid purchase by (userId, coursesIds).
  let purchase = await prisma.purchase.findFirst({
    where: { userId, coursesIds: { equals: coursesIds }, isPaid: false },
  });
  if (!purchase) {
    purchase = await prisma.purchase.create({
      data: {
        userId,
        coursesIds,
        buyOrder: generateBuyOrder(),
        amount: totalAmount,
        status: PaymentStatus.PENDING,
      },
    });
  } else if (purchase.amount !== totalAmount || purchase.status !== PaymentStatus.PENDING) {
    // Re-quote a retrieved attempt: prices may have moved, and a previously
    // ABORTED/TIMEOUT row must return to PENDING so the return handler is
    // willing to settle it.
    purchase = await prisma.purchase.update({
      where: { id: purchase.id },
      data: { amount: totalAmount, status: PaymentStatus.PENDING },
    });
  }

  if (purchase.isPaid) {
    return ok({ purchase });
  }

  const webPayResponse = await createWebpayTransaction(
    purchase.buyOrder!,
    purchase.userId,
    totalAmount,
    returnUrlFor(purchase.id),
  );
```

Note the `else if` also resets a previously failed attempt to `PENDING`. Without that, a buyer who aborted once and retried would hit a purchase stuck in `ABORTED`, and Task 4's settlement — which only advances `PENDING` rows — would refuse to mark it paid.

`returnUrlFor(purchase.id)` keeps passing `purchaseId`. It is retained only so the `/error` page can name the order; Task 4 never uses it to select a row.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/actions/purchases.create.test.ts`
Expected: PASS — all cases, including the pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/actions/purchases.ts src/actions/purchases.create.test.ts
git commit -m "feat(payments): freeze the quoted amount on Purchase before redirecting to Webpay"
```

---

### Task 3: Return-parameter parser

**Files:**
- Create: `src/lib/webpayReturnParams.ts`
- Test: `src/lib/webpayReturnParams.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type WebpayReturnParams = { token_ws?: string; TBK_TOKEN?: string; TBK_ORDEN_COMPRA?: string; TBK_ID_SESION?: string; purchaseId?: string }` and `extractReturnParams(src: FormData | URLSearchParams): WebpayReturnParams`. Task 4 consumes the type; Task 5 calls the function.

Transbank returns via a form-encoded POST, but re-issues a GET on some abort paths. Both `FormData` and `URLSearchParams` expose `.get(key)`, so one pure function covers both — and pulling it out of the handler makes the four-case logic testable without constructing HTTP requests.

- [ ] **Step 1: Write the failing test**

`src/lib/webpayReturnParams.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractReturnParams } from './webpayReturnParams';

describe('extractReturnParams', () => {
  it('reads every known key from FormData (the POST return)', () => {
    const fd = new FormData();
    fd.set('token_ws', 'tok-abc');
    fd.set('TBK_TOKEN', 'tbk-1');
    fd.set('TBK_ORDEN_COMPRA', 'order-1');
    fd.set('TBK_ID_SESION', 'sess-1');
    fd.set('purchaseId', 'pur-1');

    expect(extractReturnParams(fd)).toEqual({
      token_ws: 'tok-abc',
      TBK_TOKEN: 'tbk-1',
      TBK_ORDEN_COMPRA: 'order-1',
      TBK_ID_SESION: 'sess-1',
      purchaseId: 'pur-1',
    });
  });

  it('reads the same keys from URLSearchParams (the GET return)', () => {
    const qs = new URLSearchParams('token_ws=tok-get&purchaseId=pur-2');
    expect(extractReturnParams(qs)).toEqual({
      token_ws: 'tok-get',
      TBK_TOKEN: undefined,
      TBK_ORDEN_COMPRA: undefined,
      TBK_ID_SESION: undefined,
      purchaseId: 'pur-2',
    });
  });

  it('maps absent keys to undefined, not empty string', () => {
    // The four-case dispatch branches on presence, so "" and undefined must not blur.
    const params = extractReturnParams(new URLSearchParams(''));
    expect(params.token_ws).toBeUndefined();
    expect(params.TBK_TOKEN).toBeUndefined();
  });

  it('treats an explicitly empty value as absent', () => {
    // The old handler could emit `purchaseId=`; an empty token must not read as present.
    const params = extractReturnParams(new URLSearchParams('token_ws=&purchaseId='));
    expect(params.token_ws).toBeUndefined();
    expect(params.purchaseId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/webpayReturnParams.test.ts`
Expected: FAIL — cannot resolve `./webpayReturnParams`.

- [ ] **Step 3: Implement**

`src/lib/webpayReturnParams.ts`:

```typescript
// Transbank returns the browser to our returnUrl via a form-encoded POST, and
// re-issues a GET on some abort paths. Both FormData and URLSearchParams expose
// .get(key), so one parser covers both. Kept pure and separate from the Route
// Handler so the four-case dispatch in webpayConfirm.ts is testable without HTTP.
export type WebpayReturnParams = {
  token_ws?: string;
  TBK_TOKEN?: string;
  TBK_ORDEN_COMPRA?: string;
  TBK_ID_SESION?: string;
  /** Our own round-tripped id. Display-only — never used to select the row to settle. */
  purchaseId?: string;
};

export function extractReturnParams(src: FormData | URLSearchParams): WebpayReturnParams {
  // Empty string collapses to undefined: the dispatch branches on presence, so a
  // blank value must not read as "the key arrived".
  const get = (key: string): string | undefined => {
    const value = src.get(key);
    if (value == null) return undefined;
    const text = String(value);
    return text === '' ? undefined : text;
  };

  return {
    token_ws: get('token_ws'),
    TBK_TOKEN: get('TBK_TOKEN'),
    TBK_ORDEN_COMPRA: get('TBK_ORDEN_COMPRA'),
    TBK_ID_SESION: get('TBK_ID_SESION'),
    purchaseId: get('purchaseId'),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/webpayReturnParams.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/webpayReturnParams.ts src/lib/webpayReturnParams.test.ts
git commit -m "feat(payments): add pure Webpay return-parameter parser"
```

---

### Task 4: Server-side commit with buy_order and amount verification

**Files:**
- Create: `src/lib/purchaseEmail.ts` (Step 0 — must exist before the rest of this task's tests can even load)
- Test: `src/lib/purchaseEmail.test.ts`
- Create: `src/lib/webpayConfirm.ts`
- Test: `src/lib/webpayConfirm.test.ts`

**Interfaces:**
- Consumes: `WebpayReturnParams` from `@/lib/webpayReturnParams` (Task 3); `PaymentStatus` from `@/domain/paymentStatus` and the `amount`/`status`/`buyOrder @unique` columns (Task 1); `commitWebpayTransaction` from `@/lib/webpay` (existing); `CourseType` from `@/domain/courseType` (existing); `sendMail` from `@/lib/mailer` and `buildConfirmationEmailHtml` from `@/lib/confirmationEmail` (existing).
- Produces: `confirmWebpayReturn(params: WebpayReturnParams): Promise<ConfirmOutcome>` where `ConfirmOutcome = { outcome: 'success'; purchaseId: string } | { outcome: 'error'; purchaseId: string | null; message: string }`. Task 5 calls this. Also exports `type WebpayCommitResponse` and the `isApproved` / `amountsMatch` predicates for direct unit testing.

This is the heart of the plan. Three things change versus today's `confirmPurchase`:

1. The row is selected by `commit.buy_order`, not by a client-supplied `purchaseId`. Today `/confirmation?purchaseId=<expensive>&token_ws=<cheap>` marks an unrelated purchase paid.
2. `commit.amount` is checked against the frozen `Purchase.amount`, and `response_code === 0` is required in addition to `status === 'AUTHORIZED'`.
3. Abort, timeout, and form-error are recorded as distinct statuses rather than all becoming a generic `/error` redirect.

The settlement transaction body (mark paid → enroll purchased + core → conditional capacity decrement) is lifted from the existing `confirmPurchase` unchanged, including its asymmetry: a full *purchased* course rolls the transaction back, a full *core* course does not.

- [ ] **Step 0: Create the receipt-email module first**

`webpayConfirm.ts` calls `sendPurchaseConfirmation`, and `webpayConfirm.test.ts` mocks `@/lib/purchaseEmail`. **`vi.mock` with a factory does not work for a module that is absent from disk** — Vite's resolver fails at transform time with "Failed to resolve import", and the test file never loads. (Verified empirically before this task was dispatched.) So this module must exist before anything else here.

Create `src/lib/purchaseEmail.ts`:

```typescript
// Receipt email for a settled purchase. The recipient is resolved from the
// purchase's own owner — never passed in — so no caller can mail one buyer's
// receipt to an address of their choosing.
//
// A plain lib rather than a 'use server' action because webpayConfirm.ts (called
// from the Route Handler) needs it, and keeping it out of the action layer means
// there is no client-reachable endpoint here at all.
import { prisma } from '@/lib/prisma';
import { sendMail } from '@/lib/mailer';
import { buildConfirmationEmailHtml } from '@/lib/confirmationEmail';
import { CourseType } from '@/domain/courseType';

const SUBJECT = 'Confirmación de compra';

export async function sendPurchaseConfirmation(purchaseId: string): Promise<void> {
  const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) throw new Error('Purchase not found');

  const user = await prisma.user.findUnique({ where: { id: purchase.userId } });
  if (!user?.email) throw new Error('Purchase owner has no email');

  // The buyer is enrolled in the purchased courses PLUS every core course.
  const coreCourses = await prisma.course.findMany({ where: { type: CourseType.core } });
  const purchasedCourses = await prisma.course.findMany({
    where: { id: { in: purchase.coursesIds } },
  });
  const seen = new Set<string>();
  const courses = [...coreCourses, ...purchasedCourses].filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  const html = buildConfirmationEmailHtml({ id: purchaseId, courses });
  await sendMail(user.email, SUBJECT, html);
}
```

Write its test at `src/lib/purchaseEmail.test.ts` covering: the recipient is resolved via `prisma.user.findUnique({ where: { id: purchase.userId } })` and passed to `sendMail` positionally as `(email, 'Confirmación de compra', html)`; a missing purchase throws `'Purchase not found'` without sending; an owner with a falsy email throws `'Purchase owner has no email'` without sending; and core courses are merged with purchased ones without duplicates. Mock `@/lib/prisma`, `@/lib/mailer`, and `@/lib/confirmationEmail` at the module boundary per house convention.

Note this module is deliberately NOT a `'use server'` action. The existing `sendConfirmation` action takes an arbitrary `email` argument, letting any caller mail any purchase's receipt anywhere; Task 6 deletes that action. Keeping the sender as a plain lib means the Route Handler can call it while no client-reachable endpoint exists.

Run: `npx vitest run src/lib/purchaseEmail.test.ts` — must pass before continuing.

- [ ] **Step 1: Write the failing tests**

`src/lib/webpayConfirm.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    purchase: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/webpay', () => ({ commitWebpayTransaction: vi.fn() }));
vi.mock('@/lib/purchaseEmail', () => ({ sendPurchaseConfirmation: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { commitWebpayTransaction } from '@/lib/webpay';
import { sendPurchaseConfirmation } from '@/lib/purchaseEmail';
import { confirmWebpayReturn } from './webpayConfirm';
import { PaymentStatus } from '@/domain/paymentStatus';

const prismaMock = prisma as unknown as {
  purchase: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};
const mockCommit = commitWebpayTransaction as unknown as ReturnType<typeof vi.fn>;
const mockEmail = sendPurchaseConfirmation as unknown as ReturnType<typeof vi.fn>;

const USER = 'u-1';
const PURCHASED = 'course-elective';
const CORE = 'course-core';
const BUY_ORDER = 'ORDER123';

const PENDING = {
  id: 'p1', userId: USER, buyOrder: BUY_ORDER, isPaid: false,
  coursesIds: [PURCHASED], amount: 25900, status: PaymentStatus.PENDING,
};

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    purchase: {
      update: vi.fn().mockResolvedValue({ ...PENDING, isPaid: true, status: PaymentStatus.PAID }),
    },
    course: {
      findMany: vi.fn().mockResolvedValue([{ id: CORE }]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    enrollment: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'e1' }),
    },
    ...overrides,
  };
}

const AUTHORIZED = {
  status: 'AUTHORIZED',
  response_code: 0,
  buy_order: BUY_ORDER,
  amount: 25900,
  authorization_code: '123456',
  payment_type_code: 'VN',
  transaction_date: '2026-08-10T12:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('confirmWebpayReturn — the four Transbank return flows', () => {
  it('timeout (no token_ws, no TBK_TOKEN) records TIMEOUT and never commits', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    const res = await confirmWebpayReturn({
      TBK_ORDEN_COMPRA: BUY_ORDER, TBK_ID_SESION: 'sess',
    });
    expect(res.outcome).toBe('error');
    expect(prismaMock.purchase.update).toHaveBeenCalledWith({
      where: { id: 'p1' }, data: { status: PaymentStatus.TIMEOUT },
    });
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it('user abort (TBK_TOKEN, no token_ws) records ABORTED and never commits', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    const res = await confirmWebpayReturn({
      TBK_TOKEN: 'tbk-1', TBK_ORDEN_COMPRA: BUY_ORDER, TBK_ID_SESION: 'sess',
    });
    expect(res.outcome).toBe('error');
    expect(prismaMock.purchase.update).toHaveBeenCalledWith({
      where: { id: 'p1' }, data: { status: PaymentStatus.ABORTED },
    });
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it('form error (BOTH token_ws and TBK_TOKEN) records ERROR and must NOT commit', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    const res = await confirmWebpayReturn({
      token_ws: 'tok', TBK_TOKEN: 'tbk-1', TBK_ORDEN_COMPRA: BUY_ORDER,
    });
    expect(res.outcome).toBe('error');
    expect(prismaMock.purchase.update).toHaveBeenCalledWith({
      where: { id: 'p1' }, data: { status: PaymentStatus.ERROR },
    });
    // Transbank mandates not committing this case.
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it('never downgrades an already-PAID purchase on a replayed failure return', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue({ ...PENDING, status: PaymentStatus.PAID, isPaid: true });
    await confirmWebpayReturn({ TBK_TOKEN: 'tbk-1', TBK_ORDEN_COMPRA: BUY_ORDER });
    expect(prismaMock.purchase.update).not.toHaveBeenCalled();
  });

  it('does no lookup or write when there is no token and no buy order', async () => {
    const res = await confirmWebpayReturn({});
    expect(res.outcome).toBe('error');
    expect(prismaMock.purchase.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.purchase.update).not.toHaveBeenCalled();
  });
});

describe('confirmWebpayReturn — verification', () => {
  it('locates the purchase by the committed buy_order, NOT by the supplied purchaseId', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    mockCommit.mockResolvedValue(AUTHORIZED);
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()));

    // A hostile purchaseId is supplied; it must be ignored for row selection.
    await confirmWebpayReturn({ token_ws: 'tok', purchaseId: 'someone-elses-purchase' });

    expect(prismaMock.purchase.findUnique).toHaveBeenCalledWith({ where: { buyOrder: BUY_ORDER } });
  });

  it('rejects when the committed amount does not match the frozen quote', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING); // amount 25900
    mockCommit.mockResolvedValue({ ...AUTHORIZED, amount: 50 }); // paid only 50
    const res = await confirmWebpayReturn({ token_ws: 'tok' });

    expect(res.outcome).toBe('error');
    expect(prismaMock.purchase.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: PaymentStatus.REJECTED, token: 'tok' },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an AUTHORIZED status carrying a non-zero response_code', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    mockCommit.mockResolvedValue({ ...AUTHORIZED, response_code: -1 });
    const res = await confirmWebpayReturn({ token_ws: 'tok' });
    expect(res.outcome).toBe('error');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('errors without any write when the buy_order matches no purchase', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(null);
    mockCommit.mockResolvedValue(AUTHORIZED);
    const res = await confirmWebpayReturn({ token_ws: 'tok' });
    expect(res.outcome).toBe('error');
    expect(prismaMock.purchase.update).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns error when the SDK commit itself fails', async () => {
    mockCommit.mockResolvedValue({ status: 'ERROR', error: 'boom' });
    const res = await confirmWebpayReturn({ token_ws: 'tok', purchaseId: 'pur-9' });
    expect(res.outcome).toBe('error');
    if (res.outcome === 'error') expect(res.purchaseId).toBe('pur-9');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('confirmWebpayReturn — settlement', () => {
  it('on a verified payment marks PAID with the audit fields and enrolls purchased + core', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    mockCommit.mockResolvedValue(AUTHORIZED);
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const res = await confirmWebpayReturn({ token_ws: 'tok' });

    expect(res.outcome).toBe('success');
    if (res.outcome === 'success') expect(res.purchaseId).toBe('p1');
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.purchase.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        isPaid: true,
        status: PaymentStatus.PAID,
        token: 'tok',
        authorizationCode: '123456',
        paymentTypeCode: 'VN',
        paidAt: new Date('2026-08-10T12:00:00.000Z'),
      },
    });
    expect(tx.enrollment.create).toHaveBeenCalledTimes(2);
    expect(tx.course.updateMany).toHaveBeenCalledWith({
      where: { id: PURCHASED, capacity: { gt: 0 } },
      data: { capacity: { decrement: 1 } },
    });
  });

  it('replays an already-PAID purchase as success without re-settling', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue({ ...PENDING, status: PaymentStatus.PAID, isPaid: true });
    mockCommit.mockResolvedValue(AUTHORIZED);
    const res = await confirmWebpayReturn({ token_ws: 'tok' });
    expect(res.outcome).toBe('success');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(mockEmail).not.toHaveBeenCalled();
  });

  it('does not fail a settled payment when the receipt email throws', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    mockCommit.mockResolvedValue(AUTHORIZED);
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()));
    mockEmail.mockRejectedValue(new Error('smtp down'));

    const res = await confirmWebpayReturn({ token_ws: 'tok' });

    expect(res.outcome).toBe('success');
  });

  it('records the charge as ERROR when the card was charged but a purchased course is full', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    mockCommit.mockResolvedValue(AUTHORIZED);
    const tx = makeTx({
      course: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }), // full
      },
    });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const res = await confirmWebpayReturn({ token_ws: 'tok' });

    expect(res.outcome).toBe('error');
    // The money left the card. The payment facts must survive the rollback so an
    // admin can find and refund it.
    expect(prismaMock.purchase.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        status: PaymentStatus.ERROR,
        token: 'tok',
        authorizationCode: '123456',
        paymentTypeCode: 'VN',
      },
    });
    if (res.outcome === 'error') expect(res.message).toContain('reembolso');
  });

  it('does not block settlement when only a CORE course is full', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    mockCommit.mockResolvedValue(AUTHORIZED);
    const updateMany = vi.fn()
      .mockResolvedValueOnce({ count: 1 })  // purchased course has room
      .mockResolvedValueOnce({ count: 0 }); // core course full — must not throw
    const tx = makeTx({
      course: { findMany: vi.fn().mockResolvedValue([{ id: CORE }]), updateMany },
    });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const res = await confirmWebpayReturn({ token_ws: 'tok' });

    expect(res.outcome).toBe('success');
    expect(tx.enrollment.create).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/webpayConfirm.test.ts`
Expected: FAIL — cannot resolve `./webpayConfirm`. `@/lib/purchaseEmail` must already resolve, because Step 0 created it; if you see a resolution error for *that* module instead, Step 0 was skipped or misplaced.

- [ ] **Step 3: Implement**

`src/lib/webpayConfirm.ts`:

```typescript
// The single Webpay commit point. Reachable ONLY from the /api/webpay/return
// Route Handler — deliberately not a 'use server' action, because a server action
// is an addressable RPC endpoint any browser can call, and letting a client hand
// us a (purchaseId, token_ws) pair is exactly the hole this module closes.
import { prisma } from '@/lib/prisma';
import { commitWebpayTransaction } from '@/lib/webpay';
import { sendPurchaseConfirmation } from '@/lib/purchaseEmail';
import { PaymentStatus } from '@/domain/paymentStatus';
import { CourseType } from '@/domain/courseType';
import type { WebpayReturnParams } from '@/lib/webpayReturnParams';

/** Webpay Plus commit response. The SDK types commit() as any, so we declare our own. */
export type WebpayCommitResponse = {
  status?: string;
  buy_order?: string;
  amount?: number;
  response_code?: number;
  authorization_code?: string;
  payment_type_code?: string;
  transaction_date?: string;
  error?: unknown;
};

export type ConfirmOutcome =
  | { outcome: 'success'; purchaseId: string }
  | { outcome: 'error'; purchaseId: string | null; message: string };

const ABORT_MESSAGE = 'Error en la compra';
const OVERSOLD_MESSAGE =
  'Tu pago fue aprobado pero uno de los cursos se llenó. Contáctanos para gestionar tu reembolso o cambio de curso.';

/** Both conditions are required. Neither alone means the card was charged. */
export function isApproved(commit: WebpayCommitResponse): boolean {
  return commit.status === 'AUTHORIZED' && commit.response_code === 0;
}

/** Integer CLP comparison against the amount we froze before redirecting. */
export function amountsMatch(committed: number | undefined, expected: number | null): boolean {
  if (committed == null || expected == null) return false;
  return Math.round(committed) === Math.round(expected);
}

/**
 * Flip a still-PENDING purchase to a terminal failure status. Best-effort and
 * idempotent: only PENDING rows are touched, so a replayed abort return can never
 * downgrade a purchase that has already been paid. Returns the row id for the
 * /error redirect, or null when nothing matched.
 */
async function failPending(
  buyOrder: string | undefined,
  status: PaymentStatus,
): Promise<string | null> {
  if (!buyOrder) return null;
  const purchase = await prisma.purchase.findUnique({ where: { buyOrder } });
  if (!purchase) return null;
  if (purchase.status === PaymentStatus.PENDING) {
    await prisma.purchase.update({ where: { id: purchase.id }, data: { status } });
  }
  return purchase.id;
}

export async function confirmWebpayReturn(params: WebpayReturnParams): Promise<ConfirmOutcome> {
  const { token_ws: tokenWs, TBK_TOKEN: tbkToken, TBK_ORDEN_COMPRA: tbkOrden } = params;

  // No success token. Two Transbank flows land here, told apart only by TBK_TOKEN:
  //   • buyer pressed "Anular compra"  -> TBK_TOKEN + TBK_ORDEN_COMPRA + TBK_ID_SESION
  //   • form sat idle (~10 min)        -> TBK_ORDEN_COMPRA + TBK_ID_SESION, no TBK_TOKEN
  if (!tokenWs) {
    const id = await failPending(
      tbkOrden,
      tbkToken ? PaymentStatus.ABORTED : PaymentStatus.TIMEOUT,
    );
    return { outcome: 'error', purchaseId: id ?? params.purchaseId ?? null, message: ABORT_MESSAGE };
  }

  // token_ws AND TBK_TOKEN both present => Transbank form error (e.g. the payment
  // tab was closed and later recovered). Transbank mandates NOT committing here.
  if (tbkToken) {
    const id = await failPending(tbkOrden, PaymentStatus.ERROR);
    return { outcome: 'error', purchaseId: id ?? params.purchaseId ?? null, message: ABORT_MESSAGE };
  }

  // Normal flow.
  const commit = (await commitWebpayTransaction(tokenWs)) as WebpayCommitResponse;

  if (commit.status === 'ERROR') {
    return {
      outcome: 'error',
      purchaseId: params.purchaseId ?? null,
      message: 'Error en la transacción',
    };
  }

  // Select the row by the buy_order Transbank echoes back. NEVER by a
  // client-supplied purchaseId — otherwise a cheap token could be replayed
  // against an expensive purchase.
  if (!commit.buy_order) {
    return { outcome: 'error', purchaseId: params.purchaseId ?? null, message: ABORT_MESSAGE };
  }
  const purchase = await prisma.purchase.findUnique({ where: { buyOrder: commit.buy_order } });
  if (!purchase) {
    return { outcome: 'error', purchaseId: null, message: 'La compra no fue encontrada' };
  }

  // Idempotent: a refreshed or re-POSTed return short-circuits before any write.
  if (purchase.status === PaymentStatus.PAID) {
    return { outcome: 'success', purchaseId: purchase.id };
  }

  const approved = isApproved(commit);
  const amountOk = amountsMatch(commit.amount, purchase.amount);
  if (!approved || !amountOk) {
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { status: PaymentStatus.REJECTED, token: tokenWs },
    });
    return {
      outcome: 'error',
      purchaseId: purchase.id,
      message: approved
        ? 'El monto pagado no coincide con la compra'
        : 'Transacción no autorizada',
    };
  }

  try {
    // One atomic transaction: mark paid -> enroll -> decrement capacity.
    const settled = await prisma.$transaction(async (tx) => {
      const marked = await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          isPaid: true,
          status: PaymentStatus.PAID,
          token: tokenWs,
          authorizationCode: commit.authorization_code ?? null,
          paymentTypeCode: commit.payment_type_code ?? null,
          paidAt: commit.transaction_date ? new Date(commit.transaction_date) : new Date(),
        },
      });

      // Enroll in the purchased courses PLUS every core course.
      const coreCourses = await tx.course.findMany({ where: { type: CourseType.core } });
      const coreIds = coreCourses.map((c) => c.id);
      const purchasedIds = new Set(purchase.coursesIds);
      // Purchased courses first so the oversell guard runs on them before core courses.
      const allCourseIds = Array.from(new Set([...purchase.coursesIds, ...coreIds]));

      for (const courseId of allCourseIds) {
        const existing = await tx.enrollment.findUnique({
          where: { UserCourseUnique: { userId: purchase.userId, courseId } },
        });
        if (existing) continue;

        await tx.enrollment.create({
          data: { userId: purchase.userId, courseId, purchaseId: purchase.id },
        });

        // Conditional decrement closes the oversell window. The capacity guard
        // applies to BOTH, but only PURCHASED courses roll the transaction back
        // when full — a full core course must never block confirmation.
        const dec = await tx.course.updateMany({
          where: { id: courseId, capacity: { gt: 0 } },
          data: { capacity: { decrement: 1 } },
        });
        if (dec.count === 0 && purchasedIds.has(courseId)) {
          throw new Error('One or more courses are full');
        }
      }

      return marked;
    });

    // Best-effort receipt. A committed payment must never be reported as a
    // failure because SMTP was down.
    try {
      await sendPurchaseConfirmation(settled.id);
    } catch (error) {
      console.error('purchase confirmation email failed', error);
    }

    return { outcome: 'success', purchaseId: settled.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transaction failed';
    const oversold = message === 'One or more courses are full';

    // The card WAS charged but we could not seat the student, and the transaction
    // rolled back. Persist the payment facts outside it so the money is visible to
    // an admin instead of vanishing into a PENDING row.
    await prisma.purchase
      .update({
        where: { id: purchase.id },
        data: {
          status: PaymentStatus.ERROR,
          token: tokenWs,
          authorizationCode: commit.authorization_code ?? null,
          paymentTypeCode: commit.payment_type_code ?? null,
        },
      })
      .catch((updateError) => {
        console.error('failed to record a charged-but-unsettled payment', updateError);
      });

    return {
      outcome: 'error',
      purchaseId: purchase.id,
      message: oversold ? OVERSOLD_MESSAGE : message,
    };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/webpayConfirm.test.ts`
Expected: PASS (14 tests), on top of Step 0's `purchaseEmail` tests also passing.

Then run `npx tsc --noEmit` — it must be clean. Every module this task imports now exists, so there is no reason for a type error here; one would mean a genuine mistake.

- [ ] **Step 5: Commit**

```bash
git add src/lib/purchaseEmail.ts src/lib/purchaseEmail.test.ts src/lib/webpayConfirm.ts src/lib/webpayConfirm.test.ts
git commit -m "feat(payments): verify buy_order and amount in a server-side Webpay commit"
```

---

### Task 5: Rewire the return Route Handler to commit server-side

**Files:**
- Modify: `src/app/api/webpay/return/route.ts` (full rewrite)
- Test: `src/app/api/webpay/return/route.test.ts` (full rewrite)

**Interfaces:**
- Consumes: `extractReturnParams` (Task 3), `confirmWebpayReturn` (Task 4).
- Produces: `POST` / `GET` handlers that always 303-redirect — to `/confirmation?purchaseId=<id>` on success, or `/error?message=<msg>&purchaseId=<id>` on failure. `token_ws` no longer appears in any redirect URL.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/app/api/webpay/return/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/webpayConfirm', () => ({ confirmWebpayReturn: vi.fn() }));

import { confirmWebpayReturn } from '@/lib/webpayConfirm';
import { POST, GET } from './route';

const mockConfirm = confirmWebpayReturn as unknown as ReturnType<typeof vi.fn>;
const BASE = 'https://ccemuc.cl';

function postReq(url: string, form: Record<string, string>): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_BASE_URL = BASE;
});

describe('Webpay return Route Handler', () => {
  it('passes the merged query + form params to confirmWebpayReturn', async () => {
    mockConfirm.mockResolvedValue({ outcome: 'success', purchaseId: 'pur-1' });
    await POST(postReq(`${BASE}/api/webpay/return?purchaseId=pur-1`, { token_ws: 'tok-abc' }));

    expect(mockConfirm).toHaveBeenCalledWith({
      token_ws: 'tok-abc',
      TBK_TOKEN: undefined,
      TBK_ORDEN_COMPRA: undefined,
      TBK_ID_SESION: undefined,
      purchaseId: 'pur-1',
    });
  });

  it('303-redirects to /confirmation WITHOUT the token on success', async () => {
    mockConfirm.mockResolvedValue({ outcome: 'success', purchaseId: 'pur-1' });
    const res = await POST(postReq(`${BASE}/api/webpay/return`, { token_ws: 'tok-abc' }));

    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/confirmation');
    expect(loc.searchParams.get('purchaseId')).toBe('pur-1');
    // The token must not leak into browser history or referrers.
    expect(loc.searchParams.has('token_ws')).toBe(false);
  });

  it('303-redirects to /error with the outcome message on failure', async () => {
    mockConfirm.mockResolvedValue({
      outcome: 'error', purchaseId: 'pur-2', message: 'Transacción no autorizada',
    });
    const res = await POST(postReq(`${BASE}/api/webpay/return`, { token_ws: 'tok' }));

    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/error');
    expect(loc.searchParams.get('message')).toBe('Transacción no autorizada');
    expect(loc.searchParams.get('purchaseId')).toBe('pur-2');
    expect(loc.searchParams.has('token_ws')).toBe(false);
  });

  it('omits purchaseId from /error when the outcome could not identify one', async () => {
    mockConfirm.mockResolvedValue({ outcome: 'error', purchaseId: null, message: 'Error en la compra' });
    const res = await POST(postReq(`${BASE}/api/webpay/return`, {}));
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/error');
    expect(loc.searchParams.has('purchaseId')).toBe(false);
  });

  it('redirects to /error instead of throwing when confirmation blows up', async () => {
    mockConfirm.mockRejectedValue(new Error('db offline'));
    const res = await POST(postReq(`${BASE}/api/webpay/return?purchaseId=pur-3`, { token_ws: 'tok' }));

    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/error');
    expect(loc.searchParams.get('message')).toBe('Error en la compra');
    expect(loc.searchParams.get('purchaseId')).toBe('pur-3');
  });

  it('handles the GET return path, reading params from the query string', async () => {
    mockConfirm.mockResolvedValue({ outcome: 'success', purchaseId: 'pur-5' });
    const res = await GET(new NextRequest(`${BASE}/api/webpay/return?token_ws=tok-get&purchaseId=pur-5`));

    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ token_ws: 'tok-get' }));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/confirmation');
  });

  it('falls back to the request origin when NEXT_PUBLIC_BASE_URL is unset', async () => {
    delete process.env.NEXT_PUBLIC_BASE_URL;
    mockConfirm.mockResolvedValue({ outcome: 'success', purchaseId: 'pur-7' });
    const origin = 'https://request-origin.example';
    const res = await POST(postReq(`${origin}/api/webpay/return`, { token_ws: 'tok' }));

    expect(new URL(res.headers.get('location')!).origin).toBe(origin);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/api/webpay/return/route.test.ts`
Expected: FAIL — the current handler never calls `confirmWebpayReturn` and still puts `token_ws` in the `/confirmation` URL.

- [ ] **Step 3: Implement**

Replace the entire contents of `src/app/api/webpay/return/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { extractReturnParams } from '@/lib/webpayReturnParams';
import { confirmWebpayReturn, type ConfirmOutcome } from '@/lib/webpayConfirm';

// Why a Route Handler (and not a Server Action): Transbank Webpay returns the
// browser to our configured returnUrl via an HTTP POST carrying token_ws in a
// form body (and re-issues a GET on some abort paths). A Server Action is not an
// addressable URL an external system can POST a form to.
//
// This handler is also the ONLY place the commit happens. It runs before any
// page renders, so the browser never holds a token it could replay, and the
// commit is unreachable from client code.
//
// The route must stay public: Transbank's POST is cross-site, so no session
// cookie accompanies it. That is why the purchase is located by buy_order.

const FALLBACK_MESSAGE = 'Error en la compra';

// Fall back to the request origin when NEXT_PUBLIC_BASE_URL is unset, so the
// live Webpay return never 500s on `new URL('/confirmation', '')`.
function baseUrl(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;
}

// 303 See Other so the browser turns Transbank's cross-site POST into a
// same-site GET of the result page.
function redirect(base: string, result: ConfirmOutcome): NextResponse {
  if (result.outcome === 'success') {
    const url = new URL('/confirmation', base);
    url.searchParams.set('purchaseId', result.purchaseId);
    return NextResponse.redirect(url, 303);
  }

  const url = new URL('/error', base);
  url.searchParams.set('message', result.message);
  if (result.purchaseId) url.searchParams.set('purchaseId', result.purchaseId);
  return NextResponse.redirect(url, 303);
}

async function handle(req: NextRequest): Promise<NextResponse> {
  // Merge the query string with the form body: Transbank POSTs the tokens while
  // our own purchaseId rides on the returnUrl query.
  const merged = new URLSearchParams(req.nextUrl.searchParams);
  if (req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    if (form) {
      for (const [key, value] of form.entries()) {
        if (typeof value === 'string') merged.set(key, value);
      }
    }
  }
  const params = extractReturnParams(merged);

  let result: ConfirmOutcome;
  try {
    result = await confirmWebpayReturn(params);
  } catch (error) {
    // Never surface a stack trace to Transbank's browser hop — log and degrade.
    console.error('Webpay return processing failed', error);
    result = {
      outcome: 'error',
      purchaseId: params.purchaseId ?? null,
      message: FALLBACK_MESSAGE,
    };
  }

  return redirect(baseUrl(req), result);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/webpay/return/route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webpay/return/route.ts src/app/api/webpay/return/route.test.ts
git commit -m "feat(payments): commit Webpay transactions in the return route handler"
```

---

### Task 6: Server-resolved receipt email

**Files:**
- Modify: `src/schemas/purchase.ts:13-16`
- Modify: `src/actions/purchases.ts:211-239` (replace `sendConfirmation`)
- Test: `src/actions/purchases.email.test.ts` (full rewrite)
- Test: `src/schemas/purchase.test.ts:3,29-46` — its `sendConfirmationSchema` describe block must be retargeted at `resendConfirmationSchema`

**Interfaces:**
- Consumes: `sendPurchaseConfirmation(purchaseId: string): Promise<void>` from `@/lib/purchaseEmail` — **already created in Task 4 Step 0**, along with its test. Do not recreate it; this task only wires the action layer to it.
- Produces: `resendConfirmation(purchaseId: string): Promise<ActionResult<null>>` from `@/actions/purchases`, replacing `sendConfirmation`. And `resendConfirmationSchema` from `@/schemas/purchase`, replacing `sendConfirmationSchema`.

Today `sendConfirmation({ purchaseId, email })` accepts an arbitrary recipient, so any caller can mail any purchase's receipt anywhere. The recipient is derivable from `purchase.userId`, so it should never have been an input.

**Expect a temporarily broken typecheck.** Deleting `sendConfirmation` leaves `src/components/inscriptions/useConfirmation.ts:4,43` importing and calling a function that no longer exists. Task 7 rewrites that hook. So `npx tsc --noEmit` and `npm run build` will fail at the end of this task and only go green again at the end of Task 7 — that is expected and is not a defect to chase. `npm run test` must still pass, because the hook's own test is rewritten in Task 7 and its current version mocks the action module wholesale. If `npm run test` fails here, that IS a real signal.

- [ ] **Step 1: Write the failing tests**

The receipt-email module and its test were already created in Task 4 Step 0. This task only rewires the action layer to it, so there is no new lib to write here.

Replace the entire contents of `src/actions/purchases.email.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/purchaseEmail', () => ({ sendPurchaseConfirmation: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { purchase: { findUnique: vi.fn() } } }));
vi.mock('@/lib/webpay', () => ({
  createWebpayTransaction: vi.fn(),
  commitWebpayTransaction: vi.fn(),
}));
vi.mock('@/domain/buyOrder', () => ({ generateBuyOrder: vi.fn() }));
vi.mock('@/lib/auth', () => ({ assertAdmin: vi.fn() }));

import { sendPurchaseConfirmation } from '@/lib/purchaseEmail';
import { resendConfirmation } from './purchases';

const mockSend = sendPurchaseConfirmation as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resendConfirmation', () => {
  it('rejects a non-uuid purchaseId before touching the mailer', async () => {
    const res = await resendConfirmation('not-a-uuid');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.field).toBe('purchaseId');
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('takes no recipient argument — the address comes from the purchase owner', async () => {
    mockSend.mockResolvedValue(undefined);
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const res = await resendConfirmation(id);
    expect(res.ok).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(id);
  });

  it('maps a missing purchase to 404', async () => {
    mockSend.mockRejectedValue(new Error('Purchase not found'));
    const res = await resendConfirmation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it('maps a mailer failure to 500', async () => {
    mockSend.mockRejectedValue(new Error('smtp down'));
    const res = await resendConfirmation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/actions/purchases.email.test.ts`
Expected: FAIL — `resendConfirmation` is not exported from `./purchases`.

- [ ] **Step 3: Narrow the schema**

In `src/schemas/purchase.ts`, replace `sendConfirmationSchema` (lines 12-16) with:

```typescript
// The recipient is resolved server-side from the purchase owner, so the only
// input is which purchase to re-send.
export const resendConfirmationSchema = z.object({
  purchaseId: z.string().uuid(),
});
```

and add `status` to `updatePurchaseSchema` so admins can correct a payment state:

```typescript
// Fix 9: updatePurchase input validation (replaces casting to Prisma.PurchaseUpdateInput).
export const updatePurchaseSchema = z.object({
  isPaid: z.boolean().optional(),
  buyOrder: z.string().optional(),
  status: z.enum(paymentStatusValues).optional(),
});
```

Update the type exports at the bottom of the file — replace the `SendConfirmationInput` line with:

```typescript
export type ResendConfirmationInput = z.infer<typeof resendConfirmationSchema>;
```

and add to the imports at the top:

```typescript
import { paymentStatusValues } from '@/domain/paymentStatus';
```

- [ ] **Step 4: Replace the action**

In `src/actions/purchases.ts`, delete the whole `sendConfirmation` function (lines 211-239) and add in its place:

```typescript
export async function resendConfirmation(purchaseId: string): Promise<ActionResult<null>> {
  const parsed = resendConfirmationSchema.safeParse({ purchaseId });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue.message, 400, issue.path[0]?.toString());
  }

  try {
    await sendPurchaseConfirmation(parsed.data.purchaseId);
    return ok(null);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Send failed';
    return fail(message, message === 'Purchase not found' ? 404 : 500);
  }
}
```

Update the imports in `src/actions/purchases.ts`: drop `sendMail`, `buildConfirmationEmailHtml`, `sendConfirmationSchema`, and `SendConfirmationInput`; add:

```typescript
import { sendPurchaseConfirmation } from '@/lib/purchaseEmail';
import { resendConfirmationSchema } from '@/schemas/purchase';
```

`CourseType` stays imported only if still referenced — after Task 7 removes `confirmPurchase` it is no longer used in this file, so remove it then and let `npm run lint` confirm.

- [ ] **Step 5: Retarget the schema test**

`src/schemas/purchase.test.ts` imports `sendConfirmationSchema` on line 3 and exercises it in a `describe` block at lines 29-46, including an "email is malformed" case that no longer has a field to reject. Replace that import and that whole describe block:

```typescript
import { purchaseCreateSchema, resendConfirmationSchema, updatePurchaseSchema } from './purchase';
```

```typescript
describe('resendConfirmationSchema', () => {
  const valid = { purchaseId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' };

  it('accepts a uuid purchaseId', () => {
    expect(resendConfirmationSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a non-uuid purchaseId', () => {
    const r = resendConfirmationSchema.safeParse({ purchaseId: 'nope' });
    expect(r.success).toBe(false);
  });

  it('rejects a missing purchaseId', () => {
    const r = resendConfirmationSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('no longer accepts a caller-supplied recipient', () => {
    // The recipient is resolved from the purchase owner. An extra email key is
    // stripped by zod rather than honoured — assert it never reaches parsed output.
    const r = resendConfirmationSchema.safeParse({ ...valid, email: 'attacker@evil.cl' });
    expect(r.success).toBe(true);
    if (r.success) expect('email' in r.data).toBe(false);
  });
});
```

Read the file before editing to preserve its existing import and describe ordering.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/actions/purchases.email.test.ts src/schemas/purchase.test.ts src/lib/purchaseEmail.test.ts src/lib/webpayConfirm.test.ts`
Expected: PASS. The last two are Task 4's files, included as a regression check that removing `sendConfirmation` did not disturb the receipt sender or the commit path.

Then run the full suite: `npm run test` — must be green.

Do **not** expect `npx tsc --noEmit` to pass at the end of this task. `src/components/inscriptions/useConfirmation.ts:4,43` still imports and calls the deleted `sendConfirmation`; Task 7 rewrites that hook. Record the typecheck failure in your report and confirm the *only* errors are that missing export in that one file. Any other type error is a real problem and must be reported.

- [ ] **Step 7: Commit**

```bash
git add src/schemas/purchase.ts src/schemas/purchase.test.ts src/actions/purchases.ts src/actions/purchases.email.test.ts
git commit -m "feat(payments): resolve receipt recipient server-side, drop caller-supplied email"
```

---

### Task 7: Make /confirmation a read-only receipt and delete confirmPurchase

**Files:**
- Modify: `src/actions/purchases.ts` (delete `confirmPurchase`, add `getPurchaseReceipt`)
- Modify: `src/actions/purchases.confirm.test.ts` (full rewrite as `getPurchaseReceipt` coverage)
- Modify: `src/components/inscriptions/useConfirmation.ts`
- Modify: `src/app/confirmation/page.tsx:14-21`
- Test: `src/components/inscriptions/useConfirmation.test.tsx` (full rewrite — it currently mocks `confirmPurchase`/`getPurchaseById`/`sendConfirmation`, all three of which change or disappear)
- Test: `src/app/confirmation/page.test.tsx` (adjust to the new props)

**Interfaces:**
- Consumes: `resendConfirmation` (Task 6); the settled `Purchase` written by Task 4.
- Produces: `getPurchaseReceipt(purchaseId: string): Promise<ActionResult<{ purchase: Purchase; courses: Course[]; user: User | null }>>`. `confirmPurchase` no longer exists. `useConfirmation({ purchaseId })` returns `{ confirmed, courses, user, isMailSent, resendEmail }` — no `tokenWs`, no `aborted`, no `errorRedirect`.

Deleting `confirmPurchase` is the point of this task: while it exists as a `'use server'` export, the commit stays reachable from any browser. The page also drops its N+1 `getCourseById` loop in favour of one round trip.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/actions/purchases.confirm.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    purchase: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    course: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/webpay', () => ({
  createWebpayTransaction: vi.fn(),
  commitWebpayTransaction: vi.fn(),
}));
vi.mock('@/domain/buyOrder', () => ({ generateBuyOrder: vi.fn() }));
vi.mock('@/lib/auth', () => ({ assertAdmin: vi.fn() }));
vi.mock('@/lib/purchaseEmail', () => ({ sendPurchaseConfirmation: vi.fn() }));

import { prisma } from '@/lib/prisma';
import * as purchases from './purchases';
import { getPurchaseReceipt } from './purchases';

const prismaMock = prisma as unknown as {
  purchase: { findUnique: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
  course: { findMany: ReturnType<typeof vi.fn> };
};

const ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('confirmPurchase removal', () => {
  it('is no longer exported — the commit is not reachable from the client', () => {
    // A 'use server' export is an addressable RPC endpoint. Committing a Webpay
    // transaction must only happen inside the return Route Handler.
    expect('confirmPurchase' in purchases).toBe(false);
  });
});

describe('getPurchaseReceipt', () => {
  it('rejects a non-uuid id', async () => {
    const res = await getPurchaseReceipt('nope');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
    expect(prismaMock.purchase.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when the purchase does not exist', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(null);
    const res = await getPurchaseReceipt(ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it('returns the purchase, its courses (purchased + core, deduped) and the buyer in one call', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue({
      id: ID, userId: 'u1', coursesIds: ['c1'], isPaid: true, status: 'PAID', amount: 25900,
    });
    prismaMock.course.findMany
      .mockResolvedValueOnce([{ id: 'core1', title: 'Base', type: 'core', week: 0, price: 0 }])
      .mockResolvedValueOnce([{ id: 'c1', title: 'Elec', type: 'elective', week: 1, price: 25900 }]);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@uc.cl', names: 'Ana' });

    const res = await getPurchaseReceipt(ID);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.courses.map((c) => c.id).sort()).toEqual(['c1', 'core1']);
      expect(res.data.user?.email).toBe('a@uc.cl');
      expect(res.data.purchase.status).toBe('PAID');
    }
  });

  it('still returns the receipt when the buyer record cannot be loaded', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue({
      id: ID, userId: 'u1', coursesIds: [], isPaid: true, status: 'PAID', amount: 0,
    });
    prismaMock.course.findMany.mockResolvedValue([]);
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await getPurchaseReceipt(ID);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.user).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/actions/purchases.confirm.test.ts`
Expected: FAIL — `confirmPurchase` is still exported and `getPurchaseReceipt` does not exist.

- [ ] **Step 3: Implement the action**

In `src/actions/purchases.ts`, delete the entire `confirmPurchase` function (lines 134-209) and add:

```typescript
export async function getPurchaseReceipt(purchaseId: string): Promise<
  ActionResult<{ purchase: Purchase; courses: Course[]; user: User | null }>
> {
  const parsed = resendConfirmationSchema.safeParse({ purchaseId });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue.message, 400, issue.path[0]?.toString());
  }

  const purchase = await prisma.purchase.findUnique({ where: { id: parsed.data.purchaseId } });
  if (!purchase) return fail('La compra no fue encontrada', 404);

  try {
    // One round trip instead of the page's old per-course loop. The buyer is
    // enrolled in the purchased courses PLUS every core course.
    const coreCourses = await prisma.course.findMany({ where: { type: CourseType.core } });
    const purchasedCourses = await prisma.course.findMany({
      where: { id: { in: purchase.coursesIds } },
    });
    const seen = new Set<string>();
    const courses = [...coreCourses, ...purchasedCourses].filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    const user = await prisma.user.findUnique({ where: { id: purchase.userId } });
    return ok({ purchase, courses, user });
  } catch (error) {
    return fail((error as Error).message, 500);
  }
}
```

Add the needed types to the imports of `src/actions/purchases.ts`:

```typescript
import type { Purchase, Course, User } from '@prisma/client';
```

`CourseType` is still used here, so keep that import (it is no longer used by the deleted `confirmPurchase`, but `getPurchaseReceipt` needs it).

- [ ] **Step 4: Run the action tests to verify they pass**

Run: `npx vitest run src/actions/purchases.confirm.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Rewrite the confirmation hook**

Replace the entire contents of `src/components/inscriptions/useConfirmation.ts`:

```typescript
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Course, User } from '@prisma/client';
import { getPurchaseReceipt, resendConfirmation } from '@/actions/purchases';

interface UseConfirmationParams {
  purchaseId: string | null;
}

interface UseConfirmationResult {
  confirmed: boolean;
  courses: Course[];
  user: User | null;
  isMailSent: boolean;
  resendEmail: () => Promise<void>;
}

/**
 * Read-only receipt loader. The payment was already committed server-side by
 * /api/webpay/return before this page rendered — this hook only displays the
 * result, and never sees a Webpay token.
 */
export function useConfirmation({ purchaseId }: UseConfirmationParams): UseConfirmationResult {
  const [confirmed, setConfirmed] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isMailSent, setIsMailSent] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current || !purchaseId) return;
    ranRef.current = true;

    void (async () => {
      const res = await getPurchaseReceipt(purchaseId);
      if (!res.ok) return;
      setCourses(res.data.courses);
      setUser(res.data.user);
      // The receipt email is sent server-side on commit; treat a settled purchase
      // as already mailed.
      setConfirmed(res.data.purchase.status === 'PAID');
      setIsMailSent(res.data.purchase.status === 'PAID');
    })();
  }, [purchaseId]);

  const resendEmail = useCallback(async () => {
    if (!purchaseId) return;
    const res = await resendConfirmation(purchaseId);
    if (res.ok) setIsMailSent(true);
  }, [purchaseId]);

  return { confirmed, courses, user, isMailSent, resendEmail };
}
```

- [ ] **Step 6: Simplify the confirmation page**

In `src/app/confirmation/page.tsx`, replace lines 10-25 (the top of `ConfirmationContent` through the `errorRedirect` effect) with:

```typescript
const ConfirmationContent: React.FC = () => {
  const searchParams = useSearchParams();
  const purchaseId = searchParams.get('purchaseId');

  // No token_ws, no TBK_* handling: /api/webpay/return already committed the
  // payment and redirected failures straight to /error.
  const { confirmed, courses, user, resendEmail } = useConfirmation({ purchaseId });
```

Then remove the now-unused imports `useRouter` and `useEffect` from the file's import block — the first line becomes:

```typescript
import React, { Suspense } from 'react';
```

and `import { useRouter, useSearchParams } from 'next/navigation';` becomes:

```typescript
import { useSearchParams } from 'next/navigation';
```

- [ ] **Step 6b: Rewrite the hook's own test**

`src/components/inscriptions/useConfirmation.test.tsx` mocks `confirmPurchase`, `getPurchaseById`, and `sendConfirmation` — the first is deleted, the second is superseded, the third was renamed in Task 6. Read the file, then rewrite it against the new contract. It must cover:

- `useConfirmation({ purchaseId: 'p1' })` calls `getPurchaseReceipt('p1')` exactly once, even across a StrictMode double-render (the `ranRef` guard).
- `confirmed` and `isMailSent` become `true` when the receipt's `purchase.status === 'PAID'`, and stay `false` for any other status.
- `courses` and `user` are populated from the receipt in one call — assert `getPurchaseReceipt` is the only action invoked for loading, and that no per-course fetch happens.
- `resendEmail()` calls `resendConfirmation('p1')` with the id alone and sets `isMailSent` on success.
- A null `purchaseId` triggers no action calls at all.
- **No commit-shaped action is reachable:** the mocked `@/actions/purchases` module must not need a `confirmPurchase` export for the hook to work.

Preserve the file's existing `renderHook`/`waitFor` style and its `ok(...)` result-helper usage.

Run: `npx vitest run src/components/inscriptions/useConfirmation.test.tsx`
Expected: PASS.

- [ ] **Step 7: Update the page test**

`src/app/confirmation/page.test.tsx` mocks `confirmPurchase` and asserts the commit is driven from the page. Update it: mock `@/actions/purchases` with `getPurchaseReceipt` and `resendConfirmation` instead, drive it with only `?purchaseId=…`, and assert that the receipt renders and that **no** commit-shaped action is called. Read the file first and preserve its existing render/assertion style.

Run: `npx vitest run src/app/confirmation/page.test.tsx`
Expected: PASS.

- [ ] **Step 8: Run the full suite and the linter**

Run: `npm run test && npm run lint`
Expected: all tests pass; lint clean. Lint is what catches leftover unused imports in `src/actions/purchases.ts` and `src/app/confirmation/page.tsx`.

- [ ] **Step 9: Typecheck the production build**

Run: `npm run build`
Expected: build succeeds. This is the step that catches any remaining reference to the deleted `confirmPurchase` or the removed `sendConfirmation`.

- [ ] **Step 10: Commit**

```bash
git add src/actions/purchases.ts src/actions/purchases.confirm.test.ts src/components/inscriptions/useConfirmation.ts src/components/inscriptions/useConfirmation.test.tsx src/app/confirmation/page.tsx src/app/confirmation/page.test.tsx
git commit -m "refactor(payments): delete client-callable confirmPurchase, make /confirmation read-only"
```

---

### Task 8: Local environment and end-to-end sandbox verification

**Files:**
- Modify: `.env` (add the Webpay vars; never commit real secrets)
- Modify: `DEPLOY.md` (correct the stale migration note, document the new flow)

**Interfaces:**
- Consumes: everything above.
- Produces: a verified working payment against Transbank's integration environment, and an updated runbook.

The flow is currently untestable locally: `.env` holds only `DATABASE_URL` and `DIRECT_URL`, so `WEBPAY_RETURN_URL` and `NEXT_PUBLIC_BASE_URL` are unset and `returnUrlFor` produces the relative `/api/webpay/return?purchaseId=…`, which Transbank rejects.

- [ ] **Step 1: Add the local Webpay variables**

Append to `.env`:

```bash
# ---- Transbank Webpay Plus (integration sandbox) ----
# Left blank in integration: src/lib/webpay.ts falls back to the SDK's public
# integration commerce code / API key.
WEBPAY_ENVIRONMENT=integration
WEBPAY_COMMERCE_CODE=
WEBPAY_API_KEY=
# MUST be absolute — Transbank rejects a relative returnUrl.
WEBPAY_RETURN_URL=http://localhost:3000/api/webpay/return
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# ---- App flags ----
ADMIN_SECRET=change-me-locally
REGISTRATION_OPEN=true
```

Note `src/lib/webpay.ts` uses `??` for its fallbacks, so an **empty string** is *not* replaced by the SDK constant. Blank `WEBPAY_COMMERCE_CODE=` therefore reaches the SDK as `''`. Verify this in the next step; if the create call fails, either delete those two lines from `.env` entirely or change the fallbacks in `src/lib/webpay.ts:17-23` to `||`. Prefer switching to `||`, because `vercel env pull` writes empty strings rather than omitting keys, so the same trap exists in deployed environments.

- [ ] **Step 2: Confirm the SDK receives usable integration credentials**

Run:
```bash
npx tsx -e "
import { getWebpayTransaction } from '@/lib/webpay';
const tx = getWebpayTransaction() as any;
console.log('commerceCode:', tx.options?.commerceCode);
console.log('environment :', tx.options?.environment);
"
```
Expected: `commerceCode: 597055555532` and an integration host (`https://webpay3gint.transbank.cl`). If `commerceCode` prints empty, apply the `||` change described in Step 1 and re-run before continuing.

- [ ] **Step 2b: Prove the create path works against the live integration endpoint**

This is the strongest fully-automatable check available, and it is worth more than the credential inspection in Step 2: it makes a real HTTPS call to `https://webpay3gint.transbank.cl` and proves the commerce code, API key, amount, `buyOrder` length rules, and `returnUrl` are all acceptable to Transbank — everything up to the point where a human must type a card number.

```bash
npx tsx -e "
import { createWebpayTransaction } from '@/lib/webpay';
import { generateBuyOrder } from '@/domain/buyOrder';
void (async () => {
  const buyOrder = generateBuyOrder();
  const res = await createWebpayTransaction(buyOrder, 'sandbox-session', 23000, 'http://localhost:3000/api/webpay/return');
  console.log('buyOrder   :', buyOrder, '(len ' + buyOrder.length + ')');
  console.log('token      :', res.token, '(len ' + res.token.length + ')');
  console.log('form URL   :', res.url);
})();
"
```
Expected: a 64-character token and a `url` on `webpay3gint.transbank.cl`. A `TransbankError` here means the credentials or the request shape are wrong and no amount of browser clicking will help — fix it before going further.

Note this creates a real (uncommitted, abandoned) integration transaction. That is harmless in the sandbox and costs nothing.

- [ ] **Step 3: Walk the happy path against the sandbox** — ⚠️ OWNER-EXECUTED, NOT AGENT-EXECUTABLE

**This step and Step 4 require a human.** Completing Transbank's hosted payment form means typing a card number and bank credentials into pages on `transbank.cl`, which no tooling available to this project can drive. An implementing agent must **not** claim to have performed these steps, must not simulate them, and must not substitute a unit test and call it equivalent.

Instead, the agent's deliverable for Steps 3 and 4 is:
1. Start the dev server and confirm it boots (`npm run dev`, check `/pricing` returns 200).
2. Write the exact click-by-click checklist below into the task report, with the specific values to enter and the specific things to look for, so the owner can execute it in a few minutes.
3. Provide the ready-to-run verification command for after each walkthrough.
4. Report status `DONE_WITH_CONCERNS`, naming the manual steps as outstanding.

The checklist the owner will execute:

Run `npm run dev`, then in a browser:

1. `/pricing` → select 1 synchronous module + 2 workshops → **Confirmar**.
2. `/form` → fill names, apellidos, a valid RUT, email, universidad, año → **Inscribir y pagar**.
3. On the Transbank form pay with the integration test card:
   - VISA **4051 8856 0044 6623**, CVV **123**, any future expiry
   - Bank auth: RUT **11.111.111-1**, password **123**
4. Expect to land on `/confirmation?purchaseId=<uuid>` — **and confirm the URL contains no `token_ws`.**

Then verify the database recorded the payment.

**Do not use `npx prisma db execute` to inspect rows.** It always reports "Script executed successfully" and never prints `SELECT` output, so it cannot distinguish zero rows from many — it will silently tell you a check passed when you have learned nothing. (Discovered during Task 1.) Sourcing `.env` into your shell also fails: the connection strings contain unquoted `&`, which bash parses as a background operator, so `set -a; . ./.env; set +a` leaves `$DIRECT_URL` empty.

Query through the Prisma client instead — it reads `.env` itself and prints real values. Note `npx tsx -e` compiles to CJS here, so **top-level `await` fails** with "Top-level await is currently not supported with the cjs output format"; wrap the body in an async IIFE as below. Use the `@/` alias, not a relative path.

```bash
npx tsx -e "
import { prisma } from '@/lib/prisma';
void (async () => {
  const p = await prisma.purchase.findFirst({ orderBy: { createdAt: 'desc' } });
  console.log(JSON.stringify({
    id: p?.id, status: p?.status, isPaid: p?.isPaid, amount: p?.amount,
    authorizationCode: p?.authorizationCode, paymentTypeCode: p?.paymentTypeCode,
    paidAt: p?.paidAt, token: p?.token ? '(set, ' + p.token.length + ' chars)' : null,
  }, null, 2));
  await prisma.\$disconnect();
})();
"
```
Expected: `status: "PAID"`, `isPaid: true`, `amount` equal to the priced module's current `Course.price` (23000 at time of writing — confirm against the DB rather than hardcoding), a 6-character `authorizationCode`, a non-null `paidAt`, and `token` set to a 64-character value.

- [ ] **Step 4: Verify the abort path records ABORTED** — ⚠️ OWNER-EXECUTED, NOT AGENT-EXECUTABLE

Same rule as Step 3: the agent writes this into the report as a checklist and does not claim to have run it.

Repeat steps 1-2 with a different RUT, then on the Transbank form press **"Anular compra"**.

Expected: redirected to `/error?message=Error%20en%20la%20compra&purchaseId=…`, and:
```bash
npx tsx -e "
import { prisma } from '@/lib/prisma';
void (async () => {
  const p = await prisma.purchase.findFirst({ orderBy: { createdAt: 'desc' } });
  console.log({ status: p?.status, isPaid: p?.isPaid, token: p?.token, paidAt: p?.paidAt });
  await prisma.\$disconnect();
})();
"
```
Expected: `status: 'ABORTED'`, `isPaid: false`, `token: null`, `paidAt: null`. Under the old code this was indistinguishable from every other failure — that distinction is the point of the task.

- [ ] **Step 5: Verify the amount check rejects a tampered payment**

This is the hole the plan exists to close, so prove it is shut. With the dev server running, pick a real `PENDING` purchase's `buyOrder` and simulate a commit that returns a smaller amount by temporarily forcing the SDK response — the cheapest safe way is a unit-level assertion rather than a live tamper, so confirm the dedicated test covers it:

Run: `npx vitest run src/lib/webpayConfirm.test.ts -t 'does not match the frozen quote'`
Expected: PASS.

Then confirm the replay vector is dead by hand: with a `PAID` purchase id and any string as a token, there is no longer any endpoint to POST them to — `confirmPurchase` does not exist. Verify:
```bash
grep -rn "confirmPurchase" src/ || echo "confirmPurchase fully removed"
```
Expected: `confirmPurchase fully removed`.

- [ ] **Step 6: Update the deployment runbook**

In `DEPLOY.md`, make three corrections:

1. §3 currently states migrations are **not** run by the build. That is stale — `vercel-build` runs `prisma migrate deploy`. Fix the text.
2. Add a warning that `vercel-build` swallows migration failures (`|| echo 'WARN: …'`), so after deploying this plan's migration the Vercel build log must be checked for `WARN` — a failed `CREATE UNIQUE INDEX` would otherwise ship silently.
3. Update the smoke-test checklist: the flow is now `/pricing → /form →` Webpay `→ /api/webpay/return` (commit happens here) `→ /confirmation` (read-only) or `/error`, and `/confirmation` no longer receives `token_ws`.

- [ ] **Step 7: Final full verification**

Run: `npm run test && npm run lint && npm run build`
Expected: all pass. State the actual test count in the commit body rather than assuming it is still 219 — this plan adds and removes tests.

- [ ] **Step 8: Commit**

```bash
git add DEPLOY.md
git commit -m "docs: update deploy runbook for the server-side Webpay commit flow"
```

`.env` is gitignored and must not be committed.

---

## Self-Review

**Spec coverage** — the three gaps that motivated this plan, and the two decisions taken:

| Requirement | Task |
|---|---|
| Verify `buy_order` on commit (locate row by it, never by client `purchaseId`) | Task 4 |
| Verify `amount` against a server-recorded quote | Tasks 2 + 4 |
| Require `response_code === 0` in addition to `AUTHORIZED` | Task 4 |
| Four-case return handling (authorized / aborted / timeout / form error) | Tasks 3 + 4 |
| Never commit when `token_ws` + `TBK_TOKEN` both present | Task 4 |
| `PaymentStatus` enum + audit fields on `Purchase` (chosen over a separate `Payment` model) | Task 1 |
| Commit moves server-side; routing unchanged | Tasks 5 + 7 |
| `/pricing → /form → Webpay` preserved | untouched by design |
| Make the flow runnable locally | Task 8 |

**Deliberately out of scope**, and why — these came up in the analysis but are not part of the chosen scope:

- **Unauthenticated read actions.** `getPurchaseById`, `getUserPurchases`, `getUserById`, `getUserByRut`, and the new `getPurchaseReceipt` are all ungated, so anyone holding a UUID can read purchase and PII records. This is a real issue, but the app has no user authentication at all, so fixing it means introducing an identity mechanism — a separate project.
- **No reconciliation net.** A browser that dies between the Webpay form and the return leaves a `PENDING` purchase and a charged card. `Transaction.status(token)` is the missing piece; the SDK exposes it and nothing calls it.
- **`TICKET_PRICE = '$25.900'`** in `PricingClient.tsx:14` is still hardcoded independently of `Course.price`. The charged amount is now verified end-to-end, but the *displayed* price can still drift from it.
- **No admin UI** for the new statuses. `updatePurchase` accepts `status` after Task 6, but only via the secret-header API route.
- **`REFUNDED`** is intentionally absent from `PaymentStatus`; nothing in the codebase performs refunds, so adding it would be a field no code writes.

**Known behaviour changes a reviewer should expect:**
- `/confirmation` URLs no longer carry `token_ws`. Any bookmark or log-scraper depending on it breaks.
- `confirmPurchase` and `sendConfirmation` are gone from the public action surface, replaced by `getPurchaseReceipt` and `resendConfirmation(purchaseId)`.
- A retried purchase is reset to `PENDING` (Task 2, Step 3), which is required for the settlement guard in Task 4 to accept it.
- `createPurchase`'s `if (purchase.isPaid)` branch remains unreachable (the `findFirst` filters on `isPaid: false`). It is left in place to avoid changing `FormClient`'s contract, which routes to `/confirmation` when `webPayResponse` is absent.

**Type consistency check:** `PaymentStatus` members are spelled identically in `src/domain/paymentStatus.ts`, the Prisma enum, and the migration SQL. `ConfirmOutcome` is produced in Task 4 and consumed in Task 5 with matching shape. `WebpayReturnParams` is produced in Task 3 and consumed in Tasks 4 and 5. `sendPurchaseConfirmation(purchaseId)` is mocked in Task 4 and implemented with that exact signature in Task 6. `getPurchaseReceipt` returns `{ purchase, courses, user }` in Task 7 and is destructured the same way in `useConfirmation`.
