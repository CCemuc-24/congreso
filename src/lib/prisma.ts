import { PrismaClient } from '@prisma/client';

// Cache the client on globalThis so that:
//  - in dev, Next.js HMR reloads don't spawn a new client (and a new pool) each time;
//  - on serverless (Vercel), a warm lambda reuses the existing client.
const globalForPrisma = globalThis as unknown as {
  __ccemucPrisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.__ccemucPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__ccemucPrisma = prisma;
}
