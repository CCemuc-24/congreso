# CCemuc Monolith — agent guide

Next.js 15 (App Router, `src/`) full-stack monolith. Standard, well-known Next 15 APIs — no exotic breaking changes. Data layer: Prisma on Neon Postgres. Backend = Server Actions (`'use server'`) in `src/actions/*`, plus one Route Handler at `src/app/api/webpay/return/route.ts`. Styling: Tailwind v4 (theme configured in CSS, not a JS config file). Tests: Vitest, with Prisma/Transbank/nodemailer mocked.

Commands: `npm run dev` · `npm run build` · `npm run test` · `npm run db:seed`.
Env: see `.env.example`. `ADMIN_SECRET` is server-only.
