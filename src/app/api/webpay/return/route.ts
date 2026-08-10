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

// Fall back to the request origin when NEXT_PUBLIC_BASE_URL is unset, so the
// live Webpay return never 500s on `new URL('/confirmation', '')`.
function baseUrl(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;
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
