# CCemuc Monolith

Next.js 15 (App Router) full-stack monolith — replaces the separate Koa API
(`../ccemuc-api`) and static Next frontend (`../frontend`). Data layer is Prisma on
Neon serverless Postgres. Backend is exposed via Server Actions, plus one Route Handler
for the Transbank Webpay return URL.

## Setup

```bash
npm install            # runs `prisma generate` via postinstall
cp .env.example .env   # then fill in Neon + Transbank + SMTP values
npx prisma migrate dev # apply schema to Neon (uses DIRECT_URL)
npm run db:seed        # seed the course catalog
npm run dev            # http://localhost:3000
```

## Scripts

- `npm run dev` / `build` / `start` — Next.js
- `npm run test` — Vitest (run once)
- `npm run db:seed` — seed course catalog
- `npx prisma migrate dev` — create/apply migrations (DIRECT_URL)

## Env

See `.env.example`. `ADMIN_SECRET` is server-only and gates admin/mutation actions.
`REGISTRATION_OPEN` toggles the /pricing selection UI. Transbank switches on
`WEBPAY_ENVIRONMENT` (`integration` | `production`).
