import { PrismaClient } from '@prisma/client';

// Resolve the runtime connection string.
//
// Locally we use DATABASE_URL (from .env). On Vercel the Neon integration may
// inject the connection under a *prefixed* name (e.g. CCEM_DATABASE_URL,
// CCEM_POSTGRES_PRISMA_URL) instead of the bare DATABASE_URL the Prisma schema
// expects, which would otherwise leave the client unconfigured. Prefer the
// Prisma-optimized pooled URL (pgbouncer=true) on serverless, then fall back to
// scanning for any "<PREFIX>_POSTGRES_PRISMA_URL" / "<PREFIX>_DATABASE_URL".
function resolveDatabaseUrl(): string | undefined {
  const env = process.env;
  const preferred =
    env.DATABASE_URL ||
    env.POSTGRES_PRISMA_URL ||
    env.CCEM_POSTGRES_PRISMA_URL ||
    env.CCEM_DATABASE_URL;
  if (preferred) return preferred;

  const key = Object.keys(env).find(
    (k) => /(^|_)POSTGRES_PRISMA_URL$/.test(k) || /(^|_)DATABASE_URL$/.test(k),
  );
  return key ? env[key] : undefined;
}

// Cache the client on globalThis so that:
//  - in dev, Next.js HMR reloads don't spawn a new client (and a new pool) each time;
//  - on serverless (Vercel), a warm lambda reuses the existing client.
const globalForPrisma = globalThis as unknown as {
  __ccemucPrisma?: PrismaClient;
};

function createClient(): PrismaClient {
  const url = resolveDatabaseUrl();
  return url ? new PrismaClient({ datasourceUrl: url }) : new PrismaClient();
}

export const prisma: PrismaClient = globalForPrisma.__ccemucPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__ccemucPrisma = prisma;
}
