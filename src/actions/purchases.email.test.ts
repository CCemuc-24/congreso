import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/purchaseEmail', async () => {
  // Keep the real PurchaseNotFoundError class so `instanceof` checks in the
  // action line up with instances constructed here — only the network-calling
  // function itself needs mocking.
  const actual = await vi.importActual<typeof import('@/lib/purchaseEmail')>('@/lib/purchaseEmail');
  return { ...actual, sendPurchaseConfirmation: vi.fn() };
});
vi.mock('@/lib/prisma', () => ({ prisma: { purchase: { findUnique: vi.fn() } } }));
vi.mock('@/lib/webpay', () => ({
  createWebpayTransaction: vi.fn(),
  commitWebpayTransaction: vi.fn(),
}));
vi.mock('@/domain/buyOrder', () => ({ generateBuyOrder: vi.fn() }));
vi.mock('@/lib/auth', () => ({ assertAdmin: vi.fn() }));

import { sendPurchaseConfirmation, PurchaseNotFoundError } from '@/lib/purchaseEmail';
import { resendConfirmation } from './purchases';

const mockSend = sendPurchaseConfirmation as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resendConfirmation', () => {
  it('rejects a non-uuid purchaseId before touching the mailer', async () => {
    const res = await resendConfirmation('not-a-uuid');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.field).toBe('purchaseId');
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('takes no recipient argument — the address comes from the purchase owner', async () => {
    mockSend.mockResolvedValue(undefined);
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const res = await resendConfirmation(id);
    expect(res.ok).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(id);
  });

  it('maps a missing purchase to 404 via the typed error, without leaking its id-bearing message', async () => {
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    mockSend.mockRejectedValue(new PurchaseNotFoundError(id));
    const res = await resendConfirmation(id);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(404);
      expect(res.error).toBe('Purchase not found');
      expect(res.error).not.toContain(id);
    }
  });

  it('does NOT map to 404 on message text alone — a plain Error with the same wording is a 500', async () => {
    // Guards against regressing to string-matching: only PurchaseNotFoundError
    // should trigger the 404 branch, no matter what a thrown error says.
    mockSend.mockRejectedValue(new Error('Purchase not found'));
    const res = await resendConfirmation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(500);
  });

  it('maps a mailer failure to 500', async () => {
    mockSend.mockRejectedValue(new Error('smtp down'));
    const res = await resendConfirmation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(500);
  });
});
