import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    purchase: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/webpay', () => ({ commitWebpayTransaction: vi.fn() }));
vi.mock('@/lib/purchaseEmail', () => ({ sendPurchaseConfirmation: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { commitWebpayTransaction } from '@/lib/webpay';
import { sendPurchaseConfirmation } from '@/lib/purchaseEmail';
import { confirmWebpayReturn, isApproved, amountsMatch } from './webpayConfirm';
import { PaymentStatus } from '@/domain/paymentStatus';

const prismaMock = prisma as unknown as {
  purchase: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
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

/**
 * Route the two distinct lookups the module makes: the pre-commit guard reads by
 * `{ id }`, settlement reads by `{ buyOrder }`. A single mockResolvedValue cannot tell
 * them apart, and conflating them is how a test accidentally passes.
 */
function routeFindUnique(byId: unknown, byBuyOrder: unknown) {
  prismaMock.purchase.findUnique.mockImplementation(
    async ({ where }: { where: { id?: string; buyOrder?: string } }) =>
      where.buyOrder !== undefined ? byBuyOrder : byId,
  );
}

// Spied for the whole file, restored in afterEach. Restoring inline is unsafe: an
// assertion that throws before mockRestore() leaves console.error stubbed for every
// later test, because implementations survive vi.clearAllMocks().
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
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
    // The hostile id resolves to a real but unrelated PENDING row, so the pre-commit
    // skip guard cannot fire and the only question left is which row gets settled.
    routeFindUnique({ ...PENDING, id: 'someone-elses-purchase' }, PENDING);
    mockCommit.mockResolvedValue(AUTHORIZED);
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const res = await confirmWebpayReturn({ token_ws: 'tok', purchaseId: 'someone-elses-purchase' });

    expect(prismaMock.purchase.findUnique).toHaveBeenCalledWith({ where: { buyOrder: BUY_ORDER } });
    // The row actually marked paid is the buy_order row, never the supplied id.
    expect(tx.purchase.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' } }),
    );
    if (res.outcome === 'success') expect(res.purchaseId).toBe('p1');
  });

  it('rejects when the committed amount does not match the frozen quote', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING); // amount 25900
    mockCommit.mockResolvedValue({ ...AUTHORIZED, amount: 50 }); // paid only 50
    const res = await confirmWebpayReturn({ token_ws: 'tok' });

    expect(res.outcome).toBe('error');
    // The commit was AUTHORIZED with response_code 0, so the card WAS charged and only
    // the amount failed to match. The refund facts must be kept on the rejected row, and
    // the not-PAID guard must stop a lost race from clobbering a settled row's facts.
    expect(prismaMock.purchase.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: { not: PaymentStatus.PAID } },
      data: {
        status: PaymentStatus.REJECTED,
        token: 'tok',
        authorizationCode: '123456',
        paymentTypeCode: 'VN',
      },
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

  it('records no authorization facts when the commit was never approved', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    // Not approved => no capture happened => there is nothing to refund, so writing an
    // authorization code here would invent an audit trail for a charge that never was.
    mockCommit.mockResolvedValue({ ...AUTHORIZED, response_code: -1 });
    await confirmWebpayReturn({ token_ws: 'tok' });
    expect(prismaMock.purchase.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: { not: PaymentStatus.PAID } },
      data: { status: PaymentStatus.REJECTED, token: 'tok' },
    });
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
    // Explicit rather than inherited: this test passes a purchaseId, so the skip guard
    // queries. Relying on a previous test's leaked implementation would make it
    // order-dependent — the leak class flagged twice in review.
    prismaMock.purchase.findUnique.mockResolvedValue(null);
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

    const res = await confirmWebpayReturn({ token_ws: 'tok' });

    expect(res.outcome).toBe('success');
    // Swallowed, but not silently: an unsent receipt must leave a trace.
    expect(consoleError).toHaveBeenCalledWith(
      'purchase confirmation email failed',
      expect.objectContaining({ message: 'smtp down' }),
    );
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
    // admin can find and refund it. Guarded on not-PAID so a concurrent duplicate
    // return cannot stamp ERROR over a row another request just settled.
    expect(prismaMock.purchase.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: { not: PaymentStatus.PAID } },
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

describe('confirmWebpayReturn — pre-commit idempotency guard', () => {
  // createPurchase mints a fresh token per attempt but never regenerates buyOrder, so a
  // back-button retry leaves two live tokens for one row. Committing the stale one after
  // the row is settled charges the card a second time.
  it('skips the commit entirely when the supplied purchaseId is already PAID', async () => {
    routeFindUnique({ ...PENDING, status: PaymentStatus.PAID, isPaid: true }, PENDING);

    const res = await confirmWebpayReturn({ token_ws: 'stale-token', purchaseId: 'p1' });

    expect(res.outcome).toBe('success');
    if (res.outcome === 'success') expect(res.purchaseId).toBe('p1');
    // The whole point: no second capture.
    expect(mockCommit).not.toHaveBeenCalled();
    expect(prismaMock.purchase.update).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('proceeds to commit normally when the supplied purchaseId is not PAID', async () => {
    routeFindUnique(PENDING, PENDING);
    mockCommit.mockResolvedValue(AUTHORIZED);
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()));

    const res = await confirmWebpayReturn({ token_ws: 'tok', purchaseId: 'p1' });

    expect(res.outcome).toBe('success');
    expect(mockCommit).toHaveBeenCalledWith('tok');
  });

  it('proceeds to commit normally when no purchaseId is supplied at all', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(PENDING);
    mockCommit.mockResolvedValue(AUTHORIZED);
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()));

    const res = await confirmWebpayReturn({ token_ws: 'tok' });

    expect(res.outcome).toBe('success');
    expect(mockCommit).toHaveBeenCalledWith('tok');
    // No id lookup happened — only the buy_order one.
    expect(prismaMock.purchase.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.purchase.findUnique).toHaveBeenCalledWith({ where: { buyOrder: BUY_ORDER } });
  });

  it('still settles by buy_order when the purchaseId is malformed and Prisma throws', async () => {
    // Purchase.id is @db.Uuid and purchaseId arrives raw from the return POST, so a
    // non-UUID reaches Prisma and throws P2023. That throw happens BEFORE the commit, so
    // without a .catch it would abort a legitimate payment that should have settled.
    prismaMock.purchase.findUnique.mockImplementation(
      async ({ where }: { where: { id?: string; buyOrder?: string } }) => {
        if (where.buyOrder !== undefined) return PENDING;
        throw Object.assign(new Error('Inconsistent column data: Malformed UUID'), {
          code: 'P2023',
        });
      },
    );
    mockCommit.mockResolvedValue(AUTHORIZED);
    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const res = await confirmWebpayReturn({ token_ws: 'tok', purchaseId: 'not-a-uuid' });

    // The skip guard is an optimization; it must never PREVENT a real settlement.
    expect(res.outcome).toBe('success');
    if (res.outcome === 'success') expect(res.purchaseId).toBe('p1');
    expect(mockCommit).toHaveBeenCalledWith('tok');
    expect(tx.purchase.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' } }),
    );
  });

  it('does not skip when the purchaseId names a different, unpaid row', async () => {
    routeFindUnique({ ...PENDING, id: 'other', status: PaymentStatus.ABORTED }, PENDING);
    mockCommit.mockResolvedValue(AUTHORIZED);
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()));

    await confirmWebpayReturn({ token_ws: 'tok', purchaseId: 'other' });

    expect(mockCommit).toHaveBeenCalled();
  });
});

describe('confirmWebpayReturn — orphan authorization on an already-settled purchase', () => {
  const SETTLED = {
    ...PENDING,
    status: PaymentStatus.PAID,
    isPaid: true,
    authorizationCode: 'FIRST-999',
    paidAt: new Date('2026-08-09T10:00:00.000Z'),
  };

  it('logs the orphan authorization without touching the first charge record', async () => {
    // No purchaseId, so the pre-commit guard cannot fire; the commit lands on a row that
    // is already PAID with a DIFFERENT authorization code => a genuine second capture.
    prismaMock.purchase.findUnique.mockResolvedValue(SETTLED);
    mockCommit.mockResolvedValue(AUTHORIZED); // authorization_code '123456'

    const res = await confirmWebpayReturn({ token_ws: 'second-token' });

    expect(res.outcome).toBe('success');
    // The original authorizationCode/paidAt must survive: they are what a refund of the
    // FIRST charge needs. No column can hold the orphan, so nothing is written at all.
    expect(prismaMock.purchase.update).not.toHaveBeenCalled();
    expect(prismaMock.purchase.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('ORPHAN AUTHORIZATION'),
      expect.objectContaining({
        purchaseId: 'p1',
        buyOrder: BUY_ORDER,
        settledAuthorizationCode: 'FIRST-999',
        orphanAuthorizationCode: '123456',
        orphanToken: 'second-token',
        orphanAmount: 25900,
      }),
    );
  });

  it('stays silent on a true replay, where the authorization code is the same', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue({ ...SETTLED, authorizationCode: '123456' });
    mockCommit.mockResolvedValue(AUTHORIZED);

    const res = await confirmWebpayReturn({ token_ws: 'tok' });

    expect(res.outcome).toBe('success');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('stays silent when the replayed commit was not approved', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(SETTLED);
    // Not approved => no second capture => nothing orphaned.
    mockCommit.mockResolvedValue({ ...AUTHORIZED, response_code: -1 });

    const res = await confirmWebpayReturn({ token_ws: 'tok' });

    expect(res.outcome).toBe('success');
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('isApproved', () => {
  const base = { status: 'AUTHORIZED', response_code: 0 };

  it('requires both AUTHORIZED and response_code 0', () => {
    expect(isApproved(base)).toBe(true);
  });

  it('fails closed on a non-zero response_code', () => {
    expect(isApproved({ ...base, response_code: -1 })).toBe(false);
    expect(isApproved({ ...base, response_code: 1 })).toBe(false);
  });

  it('fails closed on any status other than AUTHORIZED', () => {
    expect(isApproved({ ...base, status: 'FAILED' })).toBe(false);
    expect(isApproved({ ...base, status: 'REVERSED' })).toBe(false);
  });

  it('fails closed when either field is missing', () => {
    expect(isApproved({ status: 'AUTHORIZED' })).toBe(false);
    expect(isApproved({ response_code: 0 })).toBe(false);
    expect(isApproved({})).toBe(false);
  });
});

describe('amountsMatch', () => {
  it('matches equal integer CLP amounts', () => {
    expect(amountsMatch(25900, 25900)).toBe(true);
    expect(amountsMatch(0, 0)).toBe(true);
  });

  it('rejects any difference, including one peso', () => {
    expect(amountsMatch(25899, 25900)).toBe(false);
    expect(amountsMatch(50, 25900)).toBe(false);
  });

  it('fails closed on a null expected amount, as legacy rows have', () => {
    // Purchase.amount is nullable: rows created before the amount was frozen carry
    // null, and those must never be settleable by an unverifiable amount.
    expect(amountsMatch(25900, null)).toBe(false);
  });

  it('fails closed on an undefined committed amount', () => {
    expect(amountsMatch(undefined, 25900)).toBe(false);
    expect(amountsMatch(undefined, null)).toBe(false);
  });

  it('fails closed on NaN from either side', () => {
    expect(amountsMatch(NaN, 25900)).toBe(false);
    expect(amountsMatch(25900, NaN)).toBe(false);
    expect(amountsMatch(NaN, NaN)).toBe(false);
  });
});
