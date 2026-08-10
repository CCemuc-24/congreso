import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    course: { findMany: vi.fn() },
    purchase: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
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
  purchase: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
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
    const created = {
      id: 'pur-1', userId: USER, buyOrder: 'BUYORDER0000000000000000AB',
      isPaid: false, coursesIds: [C1, C2], amount: 3000, status: 'PENDING',
    };
    prismaMock.purchase.create.mockResolvedValue(created);
    mockCreateWebpay.mockResolvedValue({ token: 'tok-123', url: 'https://webpay/redirect' });

    const res = await createPurchase({ userId: USER, coursesIds: [C1, C2] });

    expect(res.ok).toBe(true);
    if (res.ok) {
      // The returned purchase is projected onto the public column set: buyOrder is
      // the key the return handler trusts to identify a row, and a Server Action
      // serializes its whole return value to the browser, so it must not ride along.
      expect(res.data.purchase).toEqual({
        id: 'pur-1', userId: USER, isPaid: false, coursesIds: [C1, C2],
        amount: 3000, status: 'PENDING',
      });
      expect('buyOrder' in res.data.purchase).toBe(false);
      expect(res.data.webPayResponse).toEqual({ token: 'tok-123', url: 'https://webpay/redirect' });
    }
    expect(prismaMock.purchase.create).toHaveBeenCalledWith({
      data: {
        userId: USER,
        coursesIds: [C1, C2],
        buyOrder: 'BUYORDER0000000000000000AB',
        amount: 3000,
        status: 'PENDING',
      },
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
    const existing = {
      id: 'pur-9', userId: USER, buyOrder: 'OLD', isPaid: false, coursesIds: [C1],
      amount: 1000, status: 'PENDING',
      // A retrieved row can carry a PREVIOUS attempt's audit trail — this is the
      // case where returning the raw row would hand the browser a real token.
      token: 'stale-token-ws', authorizationCode: 'AUTH-1', paymentTypeCode: 'VN',
    };
    prismaMock.purchase.findFirst.mockResolvedValue(existing);
    mockCreateWebpay.mockResolvedValue({ token: 'tok-9', url: 'https://webpay/9' });

    const res = await createPurchase({ userId: USER, coursesIds: [C1] });

    expect(prismaMock.purchase.create).not.toHaveBeenCalled();
    expect(prismaMock.purchase.update).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.purchase).toEqual({
        id: 'pur-9', userId: USER, isPaid: false, coursesIds: [C1],
        amount: 1000, status: 'PENDING',
      });
      expect('token' in res.data.purchase).toBe(false);
      expect('authorizationCode' in res.data.purchase).toBe(false);
      expect('paymentTypeCode' in res.data.purchase).toBe(false);
    }
    // The internal read stays unnarrowed: buyOrder is needed to open the transaction.
    expect(mockCreateWebpay).toHaveBeenCalledWith('OLD', USER, 1000, expect.any(String));
  });

  it('returns only the purchase (no webPayResponse) when it is already paid', async () => {
    // amount/status already match totalAmount/PENDING so the re-quote branch
    // does not fire — this test isolates the isPaid short-circuit alone. (The
    // re-quote branch's own payload is covered by the dedicated re-quote
    // tests below.) isPaid: true can never actually come back from findFirst
    // in production (it filters on isPaid: false); that part of the fixture
    // remains synthetic, same as before.
    prismaMock.course.findMany.mockResolvedValue([{ id: C1, price: 1000, capacity: 10 }]);
    const existing = {
      id: 'pur-paid', userId: USER, buyOrder: 'OLD', isPaid: true, coursesIds: [C1],
      amount: 1000, status: 'PENDING',
    };
    prismaMock.purchase.findFirst.mockResolvedValue(existing);

    const res = await createPurchase({ userId: USER, coursesIds: [C1] });

    expect(prismaMock.purchase.update).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.purchase).toEqual({
        id: 'pur-paid', userId: USER, isPaid: true, coursesIds: [C1],
        amount: 1000, status: 'PENDING',
      });
      expect(res.data.webPayResponse).toBeUndefined();
    }
    expect(mockCreateWebpay).not.toHaveBeenCalled();
  });

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

  it('re-quotes a legacy row with amount: null even though status is already PENDING', async () => {
    // Every row created before Task 1's migration looks exactly like this:
    // amount is null (the column didn't exist yet) and status defaults to
    // PENDING. Only the amount operand of the re-quote OR-condition fires.
    prismaMock.course.findMany.mockResolvedValue([{ id: C1, price: 1000, capacity: 10 }]);
    prismaMock.purchase.findFirst.mockResolvedValue({
      id: 'pur-legacy', userId: USER, buyOrder: 'LEGACYORDER', isPaid: false,
      coursesIds: [C1], amount: null, status: 'PENDING',
    });
    prismaMock.purchase.update.mockResolvedValue({
      id: 'pur-legacy', userId: USER, buyOrder: 'LEGACYORDER', isPaid: false,
      coursesIds: [C1], amount: 1000, status: 'PENDING',
    });
    mockCreateWebpay.mockResolvedValue({ token: 'tok-legacy', url: 'https://webpay/redirect' });

    await createPurchase({ userId: USER, coursesIds: [C1] });

    expect(prismaMock.purchase.update).toHaveBeenCalledWith({
      where: { id: 'pur-legacy' },
      data: { amount: 1000, status: 'PENDING' },
    });
    expect(mockCreateWebpay).toHaveBeenCalledWith('LEGACYORDER', USER, 1000, expect.any(String));
  });

  it('re-quotes an aborted purchase whose amount was already correct', async () => {
    // Mirror of the legacy case: amount already matches totalAmount, so only
    // the status operand of the re-quote OR-condition fires.
    prismaMock.course.findMany.mockResolvedValue([{ id: C1, price: 1000, capacity: 10 }]);
    prismaMock.purchase.findFirst.mockResolvedValue({
      id: 'pur-aborted', userId: USER, buyOrder: 'ABORTEDORDER', isPaid: false,
      coursesIds: [C1], amount: 1000, status: 'ABORTED',
    });
    prismaMock.purchase.update.mockResolvedValue({
      id: 'pur-aborted', userId: USER, buyOrder: 'ABORTEDORDER', isPaid: false,
      coursesIds: [C1], amount: 1000, status: 'PENDING',
    });
    mockCreateWebpay.mockResolvedValue({ token: 'tok-aborted', url: 'https://webpay/redirect' });

    await createPurchase({ userId: USER, coursesIds: [C1] });

    expect(prismaMock.purchase.update).toHaveBeenCalledWith({
      where: { id: 'pur-aborted' },
      data: { amount: 1000, status: 'PENDING' },
    });
    expect(mockCreateWebpay).toHaveBeenCalledWith('ABORTEDORDER', USER, 1000, expect.any(String));
  });
});
