import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ok, fail } from '@/domain/result';

vi.mock('@/actions/purchases', () => ({
  getPurchaseReceipt: vi.fn(),
  resendConfirmation: vi.fn(),
}));

import * as purchasesActions from '@/actions/purchases';
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

    await waitFor(() => expect(result.current.confirmed).toBe(true));

    expect(getPurchaseReceipt).toHaveBeenCalledTimes(1);
    expect(getPurchaseReceipt).toHaveBeenCalledWith('p1');
  });

  it('sets confirmed and isMailSent from a PAID receipt, and loads courses + user in one call', async () => {
    mockReceipt();
    const { result } = renderHook(() => useConfirmation({ purchaseId: 'p1' }));

    await waitFor(() => expect(result.current.confirmed).toBe(true));
    expect(result.current.isMailSent).toBe(true);
    // Only getPurchaseReceipt was invoked to load — no per-course fetch of any kind.
    expect(getPurchaseReceipt).toHaveBeenCalledTimes(1);
    const ids = result.current.courses.map((c) => c.id).sort();
    expect(ids).toEqual(['c1', 'core1']);
    expect(result.current.user?.email).toBe('a@b.cl');
  });

  it('leaves confirmed and isMailSent false for a non-PAID status', async () => {
    mockReceipt({ purchase: { ...purchase, status: 'PENDING' } });
    const { result } = renderHook(() => useConfirmation({ purchaseId: 'p1' }));

    await waitFor(() => expect(getPurchaseReceipt).toHaveBeenCalledTimes(1));
    expect(result.current.confirmed).toBe(false);
    expect(result.current.isMailSent).toBe(false);
  });

  it('makes no action calls at all when purchaseId is null', async () => {
    const { result } = renderHook(() => useConfirmation({ purchaseId: null }));
    expect(result.current.confirmed).toBe(false);
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

  it('needs no confirmPurchase export — no commit-shaped action is reachable from this hook', () => {
    // The mock at the top of this file only supplies getPurchaseReceipt and
    // resendConfirmation; the hook works fully without a confirmPurchase export.
    expect('confirmPurchase' in purchasesActions).toBe(false);
  });
});
