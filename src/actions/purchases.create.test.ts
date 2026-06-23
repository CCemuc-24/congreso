import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    course: { findMany: vi.fn() },
    purchase: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('@/lib/webpay', () => ({
  createWebpayTransaction: vi.fn(),
  commitWebpayTransaction: vi.fn(),
}));

vi.mock('@/domain/buyOrder', () => ({ generateBuyOrder: () => 'BUYORDER0000000000000000AB' }));

vi.mock('@/lib/auth', () => ({ assertAdmin: vi.fn() }));
vi.mock('@/lib/mailer', () => ({ sendMail: vi.fn() }));
vi.mock('@/lib/confirmationEmail', () => ({ buildConfirmationEmailHtml: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { createWebpayTransaction } from '@/lib/webpay';
import { createPurchase } from './purchases';

const prismaMock = prisma as unknown as {
  course: { findMany: ReturnType<typeof vi.fn> };
  purchase: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};
const mockCreateWebpay = createWebpayTransaction as unknown as ReturnType<typeof vi.fn>;

const USER = '11111111-1111-1111-1111-111111111111';
const C1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const C2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WEBPAY_RETURN_URL = 'https://ccemuc.cl/api/webpay/return';
});

describe('createPurchase', () => {
  it('fails validation when coursesIds is empty', async () => {
    const res = await createPurchase({ userId: USER, coursesIds: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.field).toBe('coursesIds');
    }
    expect(prismaMock.course.findMany).not.toHaveBeenCalled();
  });

  it('fails with 400 when one or more courses do not exist', async () => {
    prismaMock.course.findMany.mockResolvedValue([{ id: C1, price: 1000, capacity: 10 }]);
    const res = await createPurchase({ userId: USER, coursesIds: [C1, C2] });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('One or more courses not found');
      expect(res.status).toBe(400);
    }
    expect(mockCreateWebpay).not.toHaveBeenCalled();
  });

  it('fails with 400 when one or more courses are full', async () => {
    prismaMock.course.findMany.mockResolvedValue([
      { id: C1, price: 1000, capacity: 10 },
      { id: C2, price: 2000, capacity: 0 },
    ]);
    const res = await createPurchase({ userId: USER, coursesIds: [C1, C2] });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('One or more courses are full');
      expect(res.status).toBe(400);
    }
  });

  it('creates a new purchase, sums prices, and opens a webpay transaction', async () => {
    prismaMock.course.findMany.mockResolvedValue([
      { id: C1, price: 1000, capacity: 10 },
      { id: C2, price: 2000, capacity: 5 },
    ]);
    prismaMock.purchase.findFirst.mockResolvedValue(null);
    const created = { id: 'pur-1', userId: USER, buyOrder: 'BUYORDER0000000000000000AB', isPaid: false, coursesIds: [C1, C2] };
    prismaMock.purchase.create.mockResolvedValue(created);
    mockCreateWebpay.mockResolvedValue({ token: 'tok-123', url: 'https://webpay/redirect' });

    const res = await createPurchase({ userId: USER, coursesIds: [C1, C2] });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.purchase).toEqual(created);
      expect(res.data.webPayResponse).toEqual({ token: 'tok-123', url: 'https://webpay/redirect' });
    }
    expect(prismaMock.purchase.create).toHaveBeenCalledWith({
      data: { userId: USER, coursesIds: [C1, C2], buyOrder: 'BUYORDER0000000000000000AB' },
    });
    expect(mockCreateWebpay).toHaveBeenCalledWith(
      'BUYORDER0000000000000000AB',
      USER,
      3000,
      'https://ccemuc.cl/api/webpay/return?purchaseId=pur-1',
    );
  });

  it('retrieves an existing unpaid purchase instead of creating a new one', async () => {
    prismaMock.course.findMany.mockResolvedValue([{ id: C1, price: 1000, capacity: 10 }]);
    const existing = { id: 'pur-9', userId: USER, buyOrder: 'OLD', isPaid: false, coursesIds: [C1] };
    prismaMock.purchase.findFirst.mockResolvedValue(existing);
    mockCreateWebpay.mockResolvedValue({ token: 'tok-9', url: 'https://webpay/9' });

    const res = await createPurchase({ userId: USER, coursesIds: [C1] });

    expect(prismaMock.purchase.create).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.purchase).toEqual(existing);
  });

  it('returns only the purchase (no webPayResponse) when it is already paid', async () => {
    prismaMock.course.findMany.mockResolvedValue([{ id: C1, price: 1000, capacity: 10 }]);
    const existing = { id: 'pur-paid', userId: USER, buyOrder: 'OLD', isPaid: true, coursesIds: [C1] };
    prismaMock.purchase.findFirst.mockResolvedValue(existing);

    const res = await createPurchase({ userId: USER, coursesIds: [C1] });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.purchase).toEqual(existing);
      expect(res.data.webPayResponse).toBeUndefined();
    }
    expect(mockCreateWebpay).not.toHaveBeenCalled();
  });
});
