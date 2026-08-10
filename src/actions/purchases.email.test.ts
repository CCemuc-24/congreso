import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/purchaseEmail', () => ({ sendPurchaseConfirmation: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { purchase: { findUnique: vi.fn() } } }));
vi.mock('@/lib/webpay', () => ({
  createWebpayTransaction: vi.fn(),
  commitWebpayTransaction: vi.fn(),
}));
vi.mock('@/domain/buyOrder', () => ({ generateBuyOrder: vi.fn() }));
vi.mock('@/lib/auth', () => ({ assertAdmin: vi.fn() }));

import { sendPurchaseConfirmation } from '@/lib/purchaseEmail';
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

  it('maps a missing purchase to 404', async () => {
    mockSend.mockRejectedValue(new Error('Purchase not found'));
    const res = await resendConfirmation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it('maps a mailer failure to 500', async () => {
    mockSend.mockRejectedValue(new Error('smtp down'));
    const res = await resendConfirmation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(500);
  });
});
