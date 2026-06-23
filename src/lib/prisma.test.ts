import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the generated client so the test never opens a real connection.
const constructed: unknown[] = [];
vi.mock('@prisma/client', () => {
  class PrismaClient {
    constructor() {
      constructed.push(this);
    }
  }
  return { PrismaClient };
});

describe('prisma singleton', () => {
  beforeEach(() => {
    constructed.length = 0;
    // Clear the globalThis cache between runs so we control construction count.
    // @ts-expect-error test-only global key
    delete globalThis.__ccemucPrisma;
    vi.resetModules();
  });

  it('exports a prisma client instance', async () => {
    const mod = await import('./prisma');
    expect(mod.prisma).toBeTruthy();
  });

  it('reuses the same instance across imports (no new connection per import)', async () => {
    const a = await import('./prisma');
    vi.resetModules(); // simulate a second module evaluation (e.g. HMR / serverless reuse)
    const b = await import('./prisma');
    expect(a.prisma).toBe(b.prisma);
    // Only ONE PrismaClient was ever constructed.
    expect(constructed.length).toBe(1);
  });
});
