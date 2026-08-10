// Covers the operator-only test-payment hatch end to end through createPurchase:
// that it is unreachable when dormant, that the token amount is FROZEN ON THE ROW
// (which is what the return handler validates against), and that the re-quote
// branch moves an existing row in both directions.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
const SECRET = 'operator-only-secret-value';
const FULL_PRICE = 25900;

const ORIGINAL = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WEBPAY_RETURN_URL = 'https://www.ccem.cl/api/webpay/return';
  delete process.env.PAYMENT_TEST_CODE;
  delete process.env.PAYMENT_TEST_AMOUNT_CLP;
  prismaMock.course.findMany.mockResolvedValue([{ id: C1, price: FULL_PRICE, capacity: 10 }]);
  mockCreateWebpay.mockResolvedValue({ token: 'tok', url: 'https://webpay/redirect' });
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pur-1',
    userId: USER,
    buyOrder: 'BUYORDER0000000000000000AB',
    isPaid: false,
    coursesIds: [C1],
    amount: FULL_PRICE,
    status: 'PENDING',
    ...overrides,
  };
}

describe('createPurchase with a test code', () => {
  it('ignores a supplied code entirely when PAYMENT_TEST_CODE is unset', async () => {
    prismaMock.purchase.findFirst.mockResolvedValue(null);
    prismaMock.purchase.create.mockResolvedValue(row());

    await createPurchase({ userId: USER, coursesIds: [C1], testCode: SECRET });

    expect(prismaMock.purchase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: FULL_PRICE }),
    });
  });

  it('freezes the test amount on a new row and charges exactly that', async () => {
    process.env.PAYMENT_TEST_CODE = SECRET;
    prismaMock.purchase.findFirst.mockResolvedValue(null);
    prismaMock.purchase.create.mockResolvedValue(row({ amount: 50 }));

    await createPurchase({ userId: USER, coursesIds: [C1], testCode: SECRET });

    expect(prismaMock.purchase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 50 }),
    });
    // The amount handed to Transbank must be the one persisted on the row, since
    // that is the value webpayConfirm.amountsMatch will compare the commit against.
    expect(mockCreateWebpay).toHaveBeenCalledWith(
      'BUYORDER0000000000000000AB',
      USER,
      50,
      'https://www.ccem.cl/api/webpay/return?purchaseId=pur-1',
    );
  });

  it('charges full price when the supplied code does not match', async () => {
    process.env.PAYMENT_TEST_CODE = SECRET;
    prismaMock.purchase.findFirst.mockResolvedValue(null);
    prismaMock.purchase.create.mockResolvedValue(row());

    await createPurchase({ userId: USER, coursesIds: [C1], testCode: 'wrong' });

    expect(prismaMock.purchase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: FULL_PRICE }),
    });
  });

  it('re-quotes an existing full-price row down when the code is supplied', async () => {
    process.env.PAYMENT_TEST_CODE = SECRET;
    prismaMock.purchase.findFirst.mockResolvedValue(row());
    prismaMock.purchase.update.mockResolvedValue(row({ amount: 50 }));

    await createPurchase({ userId: USER, coursesIds: [C1], testCode: SECRET });

    expect(prismaMock.purchase.update).toHaveBeenCalledWith({
      where: { id: 'pur-1' },
      data: { amount: 50, status: 'PENDING' },
    });
    expect(mockCreateWebpay).toHaveBeenCalledWith(expect.anything(), USER, 50, expect.anything());
  });

  // The property that keeps the hatch from leaking: a cheap quote must not outlive
  // the request that earned it. An abandoned 50-peso row retried WITHOUT the code
  // has to go back to full price before Transbank is ever contacted.
  it('re-quotes an abandoned test row back up to full price without the code', async () => {
    process.env.PAYMENT_TEST_CODE = SECRET;
    prismaMock.purchase.findFirst.mockResolvedValue(row({ amount: 50, status: 'ABORTED' }));
    prismaMock.purchase.update.mockResolvedValue(row());

    await createPurchase({ userId: USER, coursesIds: [C1] });

    expect(prismaMock.purchase.update).toHaveBeenCalledWith({
      where: { id: 'pur-1' },
      data: { amount: FULL_PRICE, status: 'PENDING' },
    });
    expect(mockCreateWebpay).toHaveBeenCalledWith(
      expect.anything(),
      USER,
      FULL_PRICE,
      expect.anything(),
    );
  });

  it('never echoes the supplied code back to the browser', async () => {
    process.env.PAYMENT_TEST_CODE = SECRET;
    prismaMock.purchase.findFirst.mockResolvedValue(null);
    prismaMock.purchase.create.mockResolvedValue(row({ amount: 50 }));

    const res = await createPurchase({ userId: USER, coursesIds: [C1], testCode: SECRET });

    expect(res.ok).toBe(true);
    expect(JSON.stringify(res)).not.toContain(SECRET);
  });

  it('refuses to open a transaction when the row carries no amount', async () => {
    // An ABORTED row forces the re-quote branch, and the update comes back with a
    // null amount — the shape a legacy row degrades to. Transbank must never be
    // handed NaN, so the action has to bail before createWebpayTransaction.
    prismaMock.purchase.findFirst.mockResolvedValue(row({ amount: 1, status: 'ABORTED' }));
    prismaMock.purchase.update.mockResolvedValue(row({ amount: null, status: 'PENDING' }));

    const res = await createPurchase({ userId: USER, coursesIds: [C1] });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(500);
    expect(mockCreateWebpay).not.toHaveBeenCalled();
  });
});
