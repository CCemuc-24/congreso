import { NextRequest, NextResponse } from 'next/server';
import { extractReturnParams } from '@/lib/webpayReturnParams';
import { confirmWebpayReturn, type ConfirmOutcome } from '@/lib/webpayConfirm';

// Why a Route Handler (and not a Server Action): Transbank Webpay returns the
// browser to our configured returnUrl via an HTTP POST carrying token_ws in a
// form body (and re-issues a GET on some abort paths). A Server Action is not an
// addressable URL an external system can POST a form to.
//
// This handler is also the ONLY place the commit happens. It runs before any
// page renders, so the browser never holds a token it could replay, and the
// commit is unreachable from client code.
//
// The route must stay public: Transbank's POST is cross-site, so no session
// cookie accompanies it. That is why the purchase is located by buy_order.

const FALLBACK_MESSAGE = 'Error en la compra';

// Only http(s) may serve as the base for the redirects below. Parsing `configured`
// standalone is NOT sufficient: opaque-path schemes such as javascript:, data:,
// mailto:, and tel: all parse fine on their own yet throw when later used as a base
// in `new URL(path, base)` — the exact two-argument form `redirect()` performs. An
// explicit allowlist validates the property that actually matters ("can this serve
// as a base for our two known paths") and, as a bonus, guarantees we never hand a
// browser a Location header it can't sensibly navigate to.
const ALLOWED_BASE_PROTOCOLS = new Set(['http:', 'https:']);

// Fall back to the request origin when NEXT_PUBLIC_BASE_URL is unset, malformed, or
// not an http(s) URL, so the live Webpay return never 500s on
// `new URL('/confirmation', base)`. Validating here — rather than merely catching at
// the call sites — makes a bad base URL impossible to propagate: every downstream
// `new URL(path, base)` call is guaranteed a value already proven to work as a base.
function baseUrl(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL;
  if (!configured) return req.nextUrl.origin;
  try {
    const parsed = new URL(configured);
    if (!ALLOWED_BASE_PROTOCOLS.has(parsed.protocol)) return req.nextUrl.origin;
    return configured;
  } catch {
    return req.nextUrl.origin;
  }
}

// 303 See Other so the browser turns Transbank's cross-site POST into a
// same-site GET of the result page.
function redirect(base: string, result: ConfirmOutcome): NextResponse {
  if (result.outcome === 'success') {
    const url = new URL('/confirmation', base);
    url.searchParams.set('purchaseId', result.purchaseId);
    return NextResponse.redirect(url, 303);
  }

  const url = new URL('/error', base);
  url.searchParams.set('message', result.message);
  if (result.purchaseId) url.searchParams.set('purchaseId', result.purchaseId);
  return NextResponse.redirect(url, 303);
}

async function handle(req: NextRequest): Promise<NextResponse> {
  // Merge the query string with the form body: Transbank POSTs the tokens while
  // our own purchaseId rides on the returnUrl query.
  const merged = new URLSearchParams(req.nextUrl.searchParams);
  if (req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    if (form) {
      for (const [key, value] of form.entries()) {
        if (typeof value === 'string') merged.set(key, value);
      }
    }
  }
  const params = extractReturnParams(merged);

  let result: ConfirmOutcome;
  try {
    result = await confirmWebpayReturn(params);
  } catch (error) {
    // Never surface a stack trace to Transbank's browser hop — log and degrade.
    console.error('Webpay return processing failed', error);
    result = {
      outcome: 'error',
      purchaseId: params.purchaseId ?? null,
      message: FALLBACK_MESSAGE,
    };
  }

  return redirect(baseUrl(req), result);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}
