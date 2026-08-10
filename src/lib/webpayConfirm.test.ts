import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    purchase: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/webpay', () => ({ commitWebpayTransaction: vi.fn() }));
vi.mock('@/lib/purchaseEmail', () => ({ sendPurchaseConfirmation: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { commitWebpayTransaction } from '@/lib/webpay';
import { sendPurchaseConfirmation } from '@/lib/purchaseEmail';
import { confirmWebpayReturn } from './webpayConfirm';
import { PaymentStatus } from '@/domain/paymentStatus';

const prismaMock = prisma as unknown as {
  purchase: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};
const mockCommit = commitWebpayTransaction as unknown as ReturnType<typeof vi.fn>;
const mockEmail = sendPurchaseConfirmation as unknown as ReturnType<typeof vi.fn>;

const USER = 'u-1';
const PURCHASED = 'course-elective';
const CORE = 'course-core';
const BUY_ORDER = 'ORDER123';

const PENDING = {
  id: 'p1', userId: USER, buyOrder: BUY_ORDER, isPaid: false,
  coursesIds: [PURCHASED], amount: 25900, status: PaymentStatus.PENDING,
};

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    purchase: {
      update: vi.fn().mockResolvedValue({ ...PENDING, isPaid: true, status: PaymentStatus.PAID }),
    },
    course: {
      findMany: vi.fn().mockResolvedValue([{ id: CORE }]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    enrollment: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'e1' }),
    },
    ...overrides,
  };
}

const AUTHORIZED = {
  status: 'AUTHORIZED',
  response_code: 0,
  buy_order: BUY_ORDER,
  amount: 25900,
  authorization_code: '123456',
  payment_type_code: 'VN',
  transaction_date: '2026-08-10T12:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('confirmWebpayReturn — the four Transbank return flows', () => {
  it('timeout (no token_ws, no TBK_TOKEN) records TIMEOUT and never commits', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    const res = await confirmWebpayReturn({
      TBK_ORDEN_COMPRA: BUY_ORDER, TBK_ID_SESION: 'sess',
    });
    expect(res.outcome).toBe('error');
    expect(prismaMock.purchase.update).toHaveBeenCalledWith({
      where: { id: 'p1' }, data: { status: PaymentStatus.TIMEOUT },
    });
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it('user abort (TBK_TOKEN, no token_ws) records ABORTED and never commits', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    const res = await confirmWebpayReturn({
      TBK_TOKEN: 'tbk-1', TBK_ORDEN_COMPRA: BUY_ORDER, TBK_ID_SESION: 'sess',
    });
    expect(res.outcome).toBe('error');
    expect(prismaMock.purchase.update).toHaveBeenCalledWith({
      where: { id: 'p1' }, data: { status: PaymentStatus.ABORTED },
    });
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it('form error (BOTH token_ws and TBK_TOKEN) records ERROR and must NOT commit', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    const res = await confirmWebpayReturn({
      token_ws: 'tok', TBK_TOKEN: 'tbk-1', TBK_ORDEN_COMPRA: BUY_ORDER,
    });
    expect(res.outcome).toBe('error');
    expect(prismaMock.purchase.update).toHaveBeenCalledWith({
      where: { id: 'p1' }, data: { status: PaymentStatus.ERROR },
    });
    // Transbank mandates not committing this case.
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it('never downgrades an already-PAID purchase on a replayed failure return', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue({ ...PENDING, status: PaymentStatus.PAID, isPaid: true });
    await confirmWebpayReturn({ TBK_TOKEN: 'tbk-1', TBK_ORDEN_COMPRA: BUY_ORDER });
    expect(prismaMock.purchase.update).not.toHaveBeenCalled();
  });

  it('does no lookup or write when there is no token and no buy order', async () => {
    const res = await confirmWebpayReturn({});
    expect(res.outcome).toBe('error');
    expect(prismaMock.purchase.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.purchase.update).not.toHaveBeenCalled();
  });
});

describe('confirmWebpayReturn — verification', () => {
  it('locates the purchase by the committed buy_order, NOT by the supplied purchaseId', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    mockCommit.mockResolvedValue(AUTHORIZED);
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()));

    // A hostile purchaseId is supplied; it must be ignored for row selection.
    await confirmWebpayReturn({ token_ws: 'tok', purchaseId: 'someone-elses-purchase' });

    expect(prismaMock.purchase.findUnique).toHaveBeenCalledWith({ where: { buyOrder: BUY_ORDER } });
  });

  it('rejects when the committed amount does not match the frozen quote', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING); // amount 25900
    mockCommit.mockResolvedValue({ ...AUTHORIZED, amount: 50 }); // paid only 50
    const res = await confirmWebpayReturn({ token_ws: 'tok' });

    expect(res.outcome).toBe('error');
    expect(prismaMock.purchase.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: PaymentStatus.REJECTED, token: 'tok' },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an AUTHORIZED status carrying a non-zero response_code', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    mockCommit.mockResolvedValue({ ...AUTHORIZED, response_code: -1 });
    const res = await confirmWebpayReturn({ token_ws: 'tok' });
    expect(res.outcome).toBe('error');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('errors without any write when the buy_order matches no purchase', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(null);
    mockCommit.mockResolvedValue(AUTHORIZED);
    const res = await confirmWebpayReturn({ token_ws: 'tok' });
    expect(res.outcome).toBe('error');
    expect(prismaMock.purchase.update).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns error when the SDK commit itself fails', async () => {
    mockCommit.mockResolvedValue({ status: 'ERROR', error: 'boom' });
    const res = await confirmWebpayReturn({ token_ws: 'tok', purchaseId: 'pur-9' });
    expect(res.outcome).toBe('error');
    if (res.outcome === 'error') expect(res.purchaseId).toBe('pur-9');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('confirmWebpayReturn — settlement', () => {
  it('on a verified payment marks PAID with the audit fields and enrolls purchased + core', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    mockCommit.mockResolvedValue(AUTHORIZED);
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const res = await confirmWebpayReturn({ token_ws: 'tok' });

    expect(res.outcome).toBe('success');
    if (res.outcome === 'success') expect(res.purchaseId).toBe('p1');
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.purchase.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        isPaid: true,
        status: PaymentStatus.PAID,
        token: 'tok',
        authorizationCode: '123456',
        paymentTypeCode: 'VN',
        paidAt: new Date('2026-08-10T12:00:00.000Z'),
      },
    });
    expect(tx.enrollment.create).toHaveBeenCalledTimes(2);
    expect(tx.course.updateMany).toHaveBeenCalledWith({
      where: { id: PURCHASED, capacity: { gt: 0 } },
      data: { capacity: { decrement: 1 } },
    });
  });

  it('replays an already-PAID purchase as success without re-settling', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue({ ...PENDING, status: PaymentStatus.PAID, isPaid: true });
    mockCommit.mockResolvedValue(AUTHORIZED);
    const res = await confirmWebpayReturn({ token_ws: 'tok' });
    expect(res.outcome).toBe('success');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(mockEmail).not.toHaveBeenCalled();
  });

  it('does not fail a settled payment when the receipt email throws', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    mockCommit.mockResolvedValue(AUTHORIZED);
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()));
    // Once, not persistently: a leaked rejection would silently exercise this
    // failure path in later tests and pollute their output.
    mockEmail.mockRejectedValueOnce(new Error('smtp down'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await confirmWebpayReturn({ token_ws: 'tok' });

    expect(res.outcome).toBe('success');
    // Swallowed, but not silently: an unsent receipt must leave a trace.
    expect(logged).toHaveBeenCalledWith(
      'purchase confirmation email failed',
      expect.objectContaining({ message: 'smtp down' }),
    );
    logged.mockRestore();
  });

  it('records the charge as ERROR when the card was charged but a purchased course is full', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    mockCommit.mockResolvedValue(AUTHORIZED);
    const tx = makeTx({
      course: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }), // full
      },
    });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const res = await confirmWebpayReturn({ token_ws: 'tok' });

    expect(res.outcome).toBe('error');
    // The money left the card. The payment facts must survive the rollback so an
    // admin can find and refund it.
    expect(prismaMock.purchase.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        status: PaymentStatus.ERROR,
        token: 'tok',
        authorizationCode: '123456',
        paymentTypeCode: 'VN',
      },
    });
    if (res.outcome === 'error') expect(res.message).toContain('reembolso');
  });

  it('does not block settlement when only a CORE course is full', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    mockCommit.mockResolvedValue(AUTHORIZED);
    const updateMany = vi.fn()
      .mockResolvedValueOnce({ count: 1 })  // purchased course has room
      .mockResolvedValueOnce({ count: 0 }); // core course full — must not throw
    const tx = makeTx({
      course: { findMany: vi.fn().mockResolvedValue([{ id: CORE }]), updateMany },
    });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const res = await confirmWebpayReturn({ token_ws: 'tok' });

    expect(res.outcome).toBe('success');
    expect(tx.enrollment.create).toHaveBeenCalledTimes(2);
  });
});
