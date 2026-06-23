import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    purchase: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/webpay', () => ({
  createWebpayTransaction: vi.fn(),
  commitWebpayTransaction: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ assertAdmin: vi.fn() }));
vi.mock('@/domain/buyOrder', () => ({ generateBuyOrder: vi.fn() }));
vi.mock('@/lib/mailer', () => ({ sendMail: vi.fn() }));
vi.mock('@/lib/confirmationEmail', () => ({ buildConfirmationEmailHtml: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { commitWebpayTransaction } from '@/lib/webpay';
import { confirmPurchase } from './purchases';

const prismaMock = prisma as unknown as {
  purchase: { findUnique: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};
const mockCommitWebpay = commitWebpayTransaction as unknown as ReturnType<typeof vi.fn>;

const USER = 'u-1';
const PURCHASED = 'course-elective';
const CORE = 'course-core';

// Build a fake tx client whose enrollment.findUnique returns null (no existing)
// and whose course.updateMany reports 1 row affected (capacity available).
function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    purchase: { update: vi.fn().mockResolvedValue({ id: 'p1', userId: USER, isPaid: true, coursesIds: [PURCHASED] }) },
    course: {
      findMany: vi.fn().mockResolvedValue([{ id: CORE }]), // core courses
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    enrollment: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'e1' }),
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('confirmPurchase', () => {
  it('returns 404 when the purchase does not exist', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(null);
    const res = await confirmPurchase('missing', 'tok');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('La compra no fue encontrada');
      expect(res.status).toBe(404);
    }
    expect(mockCommitWebpay).not.toHaveBeenCalled();
  });

  it('returns 402 when the webpay commit errors', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue({ id: 'p1', userId: USER, isPaid: false, coursesIds: [PURCHASED] });
    mockCommitWebpay.mockResolvedValue({ status: 'ERROR', error: 'boom' });
    const res = await confirmPurchase('p1', 'tok');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(402);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('is idempotent: returns ok WITHOUT committing or a transaction when already paid', async () => {
    const paid = { id: 'p1', userId: USER, isPaid: true, coursesIds: [PURCHASED] };
    prismaMock.purchase.findUnique.mockResolvedValue(paid);
    const res = await confirmPurchase('p1', 'tok');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.purchase).toEqual(paid);
      // A paid purchase short-circuits BEFORE commit, with a synthesized AUTHORIZED status.
      expect(res.data.transactionStatus).toEqual({ status: 'AUTHORIZED' });
    }
    expect(mockCommitWebpay).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns 400 when the transaction status is not AUTHORIZED', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue({ id: 'p1', userId: USER, isPaid: false, coursesIds: [PURCHASED] });
    mockCommitWebpay.mockResolvedValue({ status: 'FAILED' });
    const res = await confirmPurchase('p1', 'tok');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('Transacción no autorizada');
      expect(res.status).toBe(400);
    }
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('on AUTHORIZED runs ONE transaction: marks paid, enrolls purchased+core, decrements capacity', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue({ id: 'p1', userId: USER, isPaid: false, coursesIds: [PURCHASED] });
    mockCommitWebpay.mockResolvedValue({ status: 'AUTHORIZED', amount: 1000 });

    const tx = makeTx();
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx));

    const res = await confirmPurchase('p1', 'tok');

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.purchase.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { isPaid: true } });
    // Enrolled in BOTH the purchased course and the core course.
    expect(tx.enrollment.create).toHaveBeenCalledTimes(2);
    const enrolledCourseIds = tx.enrollment.create.mock.calls.map((c: unknown[]) => (c[0] as { data: { courseId: string } }).data.courseId).sort();
    expect(enrolledCourseIds).toEqual([CORE, PURCHASED].sort());
    // Capacity decremented with the oversell guard (capacity > 0) for each new enrollment.
    expect(tx.course.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.course.updateMany).toHaveBeenCalledWith({
      where: { id: PURCHASED, capacity: { gt: 0 } },
      data: { capacity: { decrement: 1 } },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.transactionStatus).toEqual({ status: 'AUTHORIZED', amount: 1000 });
  });

  it('skips enrollment + capacity decrement when an enrollment already exists', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue({ id: 'p1', userId: USER, isPaid: false, coursesIds: [PURCHASED] });
    mockCommitWebpay.mockResolvedValue({ status: 'AUTHORIZED' });

    const tx = makeTx({
      course: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      enrollment: {
        findUnique: vi.fn().mockResolvedValue({ id: 'existing' }),
        create: vi.fn(),
      },
    });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx));

    const res = await confirmPurchase('p1', 'tok');

    expect(tx.enrollment.create).not.toHaveBeenCalled();
    expect(tx.course.updateMany).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
  });

  it('rolls back (fails) when a PURCHASED course is full at decrement time (oversell guard)', async () => {
    prismaMock.purchase.findUnique.mockResolvedValue({ id: 'p1', userId: USER, isPaid: false, coursesIds: [PURCHASED] });
    mockCommitWebpay.mockResolvedValue({ status: 'AUTHORIZED' });

    const tx = makeTx({
      course: {
        findMany: vi.fn().mockResolvedValue([]), // no core courses for this case
        updateMany: vi.fn().mockResolvedValue({ count: 0 }), // purchased course full -> 0 rows affected
      },
    });
    // $transaction propagates the thrown error (real Prisma would roll back).
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx));

    const res = await confirmPurchase('p1', 'tok');

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it('does NOT block confirmation when only a CORE course is full (core decrement never throws)', async () => {
    // Purchased course has capacity; the auto-enrolled CORE course is full (updateMany count 0)
    // but must not roll back the transaction.
    prismaMock.purchase.findUnique.mockResolvedValue({ id: 'p1', userId: USER, isPaid: false, coursesIds: [PURCHASED] });
    mockCommitWebpay.mockResolvedValue({ status: 'AUTHORIZED' });

    const updateMany = vi
      .fn()
      // first call: the purchased course (capacity available)
      .mockResolvedValueOnce({ count: 1 })
      // second call: the full CORE course (0 rows affected) — must NOT throw
      .mockResolvedValueOnce({ count: 0 });

    const tx = makeTx({
      course: {
        findMany: vi.fn().mockResolvedValue([{ id: CORE }]),
        updateMany,
      },
      enrollment: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'e1' }),
      },
    });
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx));

    const res = await confirmPurchase('p1', 'tok');

    expect(res.ok).toBe(true);
    expect(tx.enrollment.create).toHaveBeenCalledTimes(2); // purchased + core both enrolled
  });
});
