import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    purchase: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock('@/lib/auth', () => ({
  assertAdmin: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

vi.mock('@/lib/webpay', () => ({
  createWebpayTransaction: vi.fn(),
  commitWebpayTransaction: vi.fn(),
}));
vi.mock('@/domain/buyOrder', () => ({ generateBuyOrder: vi.fn() }));
vi.mock('@/lib/mailer', () => ({ sendMail: vi.fn() }));
vi.mock('@/lib/confirmationEmail', () => ({ buildConfirmationEmailHtml: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { assertAdmin, UnauthorizedError } from '@/lib/auth';
import {
  getPurchases,
  getPurchaseById,
  getUserPurchases,
  updatePurchase,
  deletePurchase,
} from './purchases';

const prismaMock = prisma as unknown as {
  purchase: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};
const mockAssertAdmin = assertAdmin as unknown as ReturnType<typeof vi.fn>;

// The exact column set the ungated reads may return. Asserted literally (not with
// objectContaining) so that adding `token: true`, `authorizationCode: true`,
// `paymentTypeCode: true` or `buyOrder: true` to the select breaks this test: a
// Server Action serializes its whole return value to the browser, so widening the
// select silently ships the payment audit trail to anyone holding an id.
const PUBLIC_SELECT = {
  id: true,
  userId: true,
  coursesIds: true,
  status: true,
  amount: true,
  isPaid: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertAdmin.mockReturnValue(undefined);
});

describe('getPurchases (admin)', () => {
  it('rejects when admin secret is invalid', async () => {
    mockAssertAdmin.mockImplementation(() => {
      throw new UnauthorizedError('Unauthorized');
    });
    const res = await getPurchases('wrong');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
    expect(prismaMock.purchase.findMany).not.toHaveBeenCalled();
  });

  it('returns all purchases for a valid admin secret', async () => {
    const rows = [{ id: 'p1' }, { id: 'p2' }];
    prismaMock.purchase.findMany.mockResolvedValue(rows);
    const res = await getPurchases('right');
    expect(mockAssertAdmin).toHaveBeenCalledWith('right');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual(rows);
    // Deliberately NOT narrowed, unlike the ungated reads above: this one is gated
    // on ADMIN_SECRET, and token/authorizationCode/paymentTypeCode exist precisely
    // so an operator can reconcile and refund. No select at all is passed.
    expect(prismaMock.purchase.findMany).toHaveBeenCalledWith();
  });
});

describe('getPurchaseById', () => {
  it('returns 404 when not found', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(null);
    const res = await getPurchaseById('nope');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('Purchase not found');
      expect(res.status).toBe(404);
    }
  });

  it('returns the purchase when found', async () => {
    const row = { id: 'p1' };
    prismaMock.purchase.findUnique.mockResolvedValue(row);
    const res = await getPurchaseById('p1');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual(row);
  });

  it('reads only the public columns — never the payment audit trail', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue({ id: 'p1' });
    await getPurchaseById('p1');
    expect(prismaMock.purchase.findUnique).toHaveBeenCalledWith({
      where: { id: 'p1' },
      select: PUBLIC_SELECT,
    });
  });
});

describe('getUserPurchases', () => {
  it('returns the user purchases', async () => {
    const rows = [{ id: 'p1', userId: 'u1' }];
    prismaMock.purchase.findMany.mockResolvedValue(rows);
    const res = await getUserPurchases('u1');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual(rows);
  });

  it('reads only the public columns — this action takes any userId and is ungated', async () => {
    prismaMock.purchase.findMany.mockResolvedValue([]);
    await getUserPurchases('u1');
    expect(prismaMock.purchase.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      select: PUBLIC_SELECT,
    });
  });
});

describe('updatePurchase (admin)', () => {
  it('rejects when admin secret invalid', async () => {
    mockAssertAdmin.mockImplementation(() => {
      throw new UnauthorizedError('Unauthorized');
    });
    const res = await updatePurchase('p1', { isPaid: true }, 'wrong');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
    expect(prismaMock.purchase.update).not.toHaveBeenCalled();
  });

  it('updates and returns the purchase', async () => {
    const row = { id: 'p1', isPaid: true };
    prismaMock.purchase.update.mockResolvedValue(row);
    const res = await updatePurchase('p1', { isPaid: true }, 'right');
    expect(prismaMock.purchase.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { isPaid: true } });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual(row);
  });
});

describe('deletePurchase (admin)', () => {
  it('rejects when admin secret is invalid', async () => {
    mockAssertAdmin.mockImplementation(() => {
      throw new UnauthorizedError('Unauthorized');
    });
    const res = await deletePurchase('p1', 'wrong');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
    expect(prismaMock.purchase.delete).not.toHaveBeenCalled();
  });

  it('deletes and returns ok(null)', async () => {
    prismaMock.purchase.delete.mockResolvedValue({ id: 'p1' });
    const res = await deletePurchase('p1', 'right');
    expect(prismaMock.purchase.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toBeNull();
  });
});
