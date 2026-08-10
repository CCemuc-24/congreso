import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// Spied for the whole file, restored in afterEach — not inline — because a throwing
// assertion would otherwise leave console.error stubbed for every later test.
// Mirrors the convention established in src/lib/webpayConfirm.test.ts.
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_BASE_URL = BASE;
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
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

  it('redirects to /error instead of throwing when confirmation blows up, and logs why', async () => {
    const thrown = new Error('db offline');
    mockConfirm.mockRejectedValue(thrown);
    const res = await POST(postReq(`${BASE}/api/webpay/return?purchaseId=pur-3`, { token_ws: 'tok' }));

    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/error');
    expect(loc.searchParams.get('message')).toBe('Error en la compra');
    expect(loc.searchParams.get('purchaseId')).toBe('pur-3');
    // Pin the log-and-degrade behavior instead of merely muting its stderr output.
    expect(consoleError).toHaveBeenCalledWith('Webpay return processing failed', thrown);
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

  it('falls back to the request origin when NEXT_PUBLIC_BASE_URL is malformed (success outcome)', async () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'not a valid url';
    mockConfirm.mockResolvedValue({ outcome: 'success', purchaseId: 'pur-8' });
    const origin = 'https://request-origin.example';
    const res = await POST(postReq(`${origin}/api/webpay/return`, { token_ws: 'tok' }));

    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin).toBe(origin);
    expect(loc.pathname).toBe('/confirmation');
    expect(loc.searchParams.get('purchaseId')).toBe('pur-8');
  });

  it('falls back to the request origin when NEXT_PUBLIC_BASE_URL is malformed (error outcome)', async () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'not a valid url';
    mockConfirm.mockResolvedValue({ outcome: 'error', purchaseId: 'pur-9', message: 'Error en la compra' });
    const origin = 'https://request-origin.example';
    const res = await POST(postReq(`${origin}/api/webpay/return`, { token_ws: 'tok' }));

    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin).toBe(origin);
    expect(loc.pathname).toBe('/error');
    expect(loc.searchParams.get('purchaseId')).toBe('pur-9');
  });

  it('falls back to the request origin when NEXT_PUBLIC_BASE_URL is an opaque-path scheme (javascript:, success outcome)', async () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'javascript:alert(1)';
    mockConfirm.mockResolvedValue({ outcome: 'success', purchaseId: 'pur-11' });
    const origin = 'https://request-origin.example';
    const res = await POST(postReq(`${origin}/api/webpay/return`, { token_ws: 'tok' }));

    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin).toBe(origin);
    expect(loc.pathname).toBe('/confirmation');
    expect(loc.searchParams.get('purchaseId')).toBe('pur-11');
  });

  it('falls back to the request origin when NEXT_PUBLIC_BASE_URL is an opaque-path scheme (javascript:, error outcome)', async () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'javascript:alert(1)';
    mockConfirm.mockResolvedValue({ outcome: 'error', purchaseId: 'pur-12', message: 'Error en la compra' });
    const origin = 'https://request-origin.example';
    const res = await POST(postReq(`${origin}/api/webpay/return`, { token_ws: 'tok' }));

    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin).toBe(origin);
    expect(loc.pathname).toBe('/error');
    expect(loc.searchParams.get('purchaseId')).toBe('pur-12');
  });

  it('falls back to the request origin when NEXT_PUBLIC_BASE_URL is an opaque-path scheme (data:, success outcome)', async () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'data:text/plain,hello';
    mockConfirm.mockResolvedValue({ outcome: 'success', purchaseId: 'pur-13' });
    const origin = 'https://request-origin.example';
    const res = await POST(postReq(`${origin}/api/webpay/return`, { token_ws: 'tok' }));

    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin).toBe(origin);
    expect(loc.pathname).toBe('/confirmation');
    expect(loc.searchParams.get('purchaseId')).toBe('pur-13');
  });

  it('falls back to the request origin when NEXT_PUBLIC_BASE_URL is an opaque-path scheme (data:, error outcome)', async () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'data:text/plain,hello';
    mockConfirm.mockResolvedValue({ outcome: 'error', purchaseId: 'pur-14', message: 'Error en la compra' });
    const origin = 'https://request-origin.example';
    const res = await POST(postReq(`${origin}/api/webpay/return`, { token_ws: 'tok' }));

    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin).toBe(origin);
    expect(loc.pathname).toBe('/error');
    expect(loc.searchParams.get('purchaseId')).toBe('pur-14');
  });

  it('lets the form value win when an attacker shadows token_ws on the query string', async () => {
    mockConfirm.mockResolvedValue({ outcome: 'success', purchaseId: 'pur-10' });
    // Query carries an attacker-supplied token_ws (our own returnUrl never puts one
    // there, but nothing stops a crafted URL from adding it); the form body carries
    // Transbank's real token. The merge order must let the form win.
    const req = postReq(`${BASE}/api/webpay/return?token_ws=attacker-supplied`, {
      token_ws: 'real-transbank-token',
    });
    await POST(req);

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ token_ws: 'real-transbank-token' }),
    );
  });
});
