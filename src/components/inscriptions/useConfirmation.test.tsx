import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ok, fail } from '@/domain/result';

vi.mock('@/actions/purchases', () => ({
  getPurchaseReceipt: vi.fn(),
  resendConfirmation: vi.fn(),
}));

import { getPurchaseReceipt, resendConfirmation } from '@/actions/purchases';
import { useConfirmation } from './useConfirmation';

const purchase = { id: 'p1', userId: 'u1', buyOrder: 'bo', isPaid: true, coursesIds: ['c1'], status: 'PAID', createdAt: new Date(), updatedAt: new Date() };
const coreCourse = { id: 'core1', title: 'Base', module: 1, type: 'core', price: 0, capacity: 5, features: null, week: 0, topics: [], createdAt: new Date(), updatedAt: new Date() };
const boughtCourse = { id: 'c1', title: 'Elec', module: 2, type: 'elective', price: 15000, capacity: 5, features: null, week: 1, topics: [], createdAt: new Date(), updatedAt: new Date() };
const user = { id: 'u1', names: 'Ada', lastNames: 'L', rut: '1-9', email: 'a@b.cl', university: 'UC', carrerYear: 3, createdAt: new Date(), updatedAt: new Date() };

beforeEach(() => {
  vi.clearAllMocks();
});

function mockReceipt(overrides: Record<string, unknown> = {}) {
  vi.mocked(getPurchaseReceipt).mockResolvedValue(
    ok({ purchase, courses: [coreCourse, boughtCourse], user, ...overrides }) as any,
  );
}

describe('useConfirmation', () => {
  it('loads the receipt in exactly one call, even across a StrictMode double-render', async () => {
    mockReceipt();
    const { result, rerender } = renderHook(() => useConfirmation({ purchaseId: 'p1' }));
    rerender(); // simulate the StrictMode double-invocation the ranRef guard defends against

    await waitFor(() => expect(result.current.status).toBe('confirmed'));

    expect(getPurchaseReceipt).toHaveBeenCalledTimes(1);
    expect(getPurchaseReceipt).toHaveBeenCalledWith('p1');
  });

  it('starts in the loading state before the receipt resolves', () => {
    // A promise that never resolves: proves the initial synchronous state
    // without leaving a dangling async state update to fire after the test
    // ends (which would otherwise trip an act(...) warning in a later test).
    vi.mocked(getPurchaseReceipt).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useConfirmation({ purchaseId: 'p1' }));
    expect(result.current.status).toBe('loading');
  });

  it('sets status to confirmed and isMailSent from a PAID receipt, and loads courses + user in one call', async () => {
    mockReceipt();
    const { result } = renderHook(() => useConfirmation({ purchaseId: 'p1' }));

    await waitFor(() => expect(result.current.status).toBe('confirmed'));
    expect(result.current.isMailSent).toBe(true);
    // Only getPurchaseReceipt was invoked to load — no per-course fetch of any kind.
    expect(getPurchaseReceipt).toHaveBeenCalledTimes(1);
    const ids = result.current.courses.map((c) => c.id).sort();
    expect(ids).toEqual(['c1', 'core1']);
    expect(result.current.user?.email).toBe('a@b.cl');
  });

  it('sets status to pending (not confirmed) for a purchase that exists but has not settled', async () => {
    mockReceipt({ purchase: { ...purchase, status: 'PENDING' } });
    const { result } = renderHook(() => useConfirmation({ purchaseId: 'p1' }));

    await waitFor(() => expect(getPurchaseReceipt).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.status).toBe('pending'));
    expect(result.current.isMailSent).toBe(false);
    // The receipt still loaded — courses/user are populated even though the
    // purchase hasn't settled. This is the state a stale-but-real link lands on.
    expect(result.current.courses.length).toBeGreaterThan(0);
  });

  it('sets status to not_found — distinct from pending — when the receipt fails to load', async () => {
    vi.mocked(getPurchaseReceipt).mockResolvedValue(fail('La compra no fue encontrada', 404) as any);
    const { result } = renderHook(() => useConfirmation({ purchaseId: 'p1' }));

    await waitFor(() => expect(result.current.status).toBe('not_found'));
    expect(result.current.isMailSent).toBe(false);
    expect(result.current.courses).toEqual([]);
    expect(result.current.user).toBeNull();
  });

  it('makes no action calls at all when purchaseId is null, and stays in loading', () => {
    const { result } = renderHook(() => useConfirmation({ purchaseId: null }));
    expect(result.current.status).toBe('loading');
    expect(getPurchaseReceipt).not.toHaveBeenCalled();
    expect(resendConfirmation).not.toHaveBeenCalled();
  });

  it('resendEmail calls resendConfirmation with the id alone and sets isMailSent on success', async () => {
    mockReceipt({ purchase: { ...purchase, status: 'PENDING' } });
    vi.mocked(resendConfirmation).mockResolvedValue(ok(null) as any);
    const { result } = renderHook(() => useConfirmation({ purchaseId: 'p1' }));

    await waitFor(() => expect(getPurchaseReceipt).toHaveBeenCalledTimes(1));
    expect(result.current.isMailSent).toBe(false);

    await act(async () => {
      await result.current.resendEmail();
    });

    expect(resendConfirmation).toHaveBeenCalledWith('p1');
    expect(resendConfirmation).toHaveBeenCalledTimes(1);
    expect(result.current.isMailSent).toBe(true);
  });

  it('resendEmail leaves isMailSent false when resendConfirmation fails, regardless of receipt load outcome', async () => {
    vi.mocked(getPurchaseReceipt).mockResolvedValue(fail('La compra no fue encontrada', 404) as any);
    vi.mocked(resendConfirmation).mockResolvedValue(fail('boom', 500) as any);
    const { result } = renderHook(() => useConfirmation({ purchaseId: 'p1' }));

    await waitFor(() => expect(getPurchaseReceipt).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.resendEmail();
    });
    expect(resendConfirmation).toHaveBeenCalledWith('p1');
    expect(result.current.isMailSent).toBe(false);
  });
});
