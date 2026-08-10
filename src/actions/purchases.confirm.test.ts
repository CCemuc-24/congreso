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
