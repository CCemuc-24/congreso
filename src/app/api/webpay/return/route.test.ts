import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/webpayConfirm', () => ({ confirmWebpayReturn: vi.fn() }));

import { confirmWebpayReturn } from '@/lib/webpayConfirm';
import { POST, GET } from './route';

const mockConfirm = confirmWebpayReturn as unknown as ReturnType<typeof vi.fn>;
const BASE = 'https://ccemuc.cl';

function postReq(url: string, form: Record<string, string>): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_BASE_URL = BASE;
});

describe('Webpay return Route Handler', () => {
  it('passes the merged query + form params to confirmWebpayReturn', async () => {
    mockConfirm.mockResolvedValue({ outcome: 'success', purchaseId: 'pur-1' });
    await POST(postReq(`${BASE}/api/webpay/return?purchaseId=pur-1`, { token_ws: 'tok-abc' }));

    expect(mockConfirm).toHaveBeenCalledWith({
      token_ws: 'tok-abc',
      TBK_TOKEN: undefined,
      TBK_ORDEN_COMPRA: undefined,
      TBK_ID_SESION: undefined,
      purchaseId: 'pur-1',
    });
  });

  it('303-redirects to /confirmation WITHOUT the token on success', async () => {
    mockConfirm.mockResolvedValue({ outcome: 'success', purchaseId: 'pur-1' });
    const res = await POST(postReq(`${BASE}/api/webpay/return`, { token_ws: 'tok-abc' }));

    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/confirmation');
    expect(loc.searchParams.get('purchaseId')).toBe('pur-1');
    // The token must not leak into browser history or referrers.
    expect(loc.searchParams.has('token_ws')).toBe(false);
  });

  it('303-redirects to /error with the outcome message on failure', async () => {
    mockConfirm.mockResolvedValue({
      outcome: 'error', purchaseId: 'pur-2', message: 'Transacción no autorizada',
    });
    const res = await POST(postReq(`${BASE}/api/webpay/return`, { token_ws: 'tok' }));

    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/error');
    expect(loc.searchParams.get('message')).toBe('Transacción no autorizada');
    expect(loc.searchParams.get('purchaseId')).toBe('pur-2');
    expect(loc.searchParams.has('token_ws')).toBe(false);
  });

  it('omits purchaseId from /error when the outcome could not identify one', async () => {
    mockConfirm.mockResolvedValue({ outcome: 'error', purchaseId: null, message: 'Error en la compra' });
    const res = await POST(postReq(`${BASE}/api/webpay/return`, {}));
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/error');
    expect(loc.searchParams.has('purchaseId')).toBe(false);
  });

  it('redirects to /error instead of throwing when confirmation blows up', async () => {
    mockConfirm.mockRejectedValue(new Error('db offline'));
    const res = await POST(postReq(`${BASE}/api/webpay/return?purchaseId=pur-3`, { token_ws: 'tok' }));

    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/error');
    expect(loc.searchParams.get('message')).toBe('Error en la compra');
    expect(loc.searchParams.get('purchaseId')).toBe('pur-3');
  });

  it('handles the GET return path, reading params from the query string', async () => {
    mockConfirm.mockResolvedValue({ outcome: 'success', purchaseId: 'pur-5' });
    const res = await GET(new NextRequest(`${BASE}/api/webpay/return?token_ws=tok-get&purchaseId=pur-5`));

    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ token_ws: 'tok-get' }));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/confirmation');
  });

  it('falls back to the request origin when NEXT_PUBLIC_BASE_URL is unset', async () => {
    delete process.env.NEXT_PUBLIC_BASE_URL;
    mockConfirm.mockResolvedValue({ outcome: 'success', purchaseId: 'pur-7' });
    const origin = 'https://request-origin.example';
    const res = await POST(postReq(`${origin}/api/webpay/return`, { token_ws: 'tok' }));

    expect(new URL(res.headers.get('location')!).origin).toBe(origin);
  });
});
