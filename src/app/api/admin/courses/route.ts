/**
 * Admin Route Handler — /api/admin/courses
 *
 * Why a Route Handler here (and not only Server Actions):
 *   Server Actions require form / RSC invocation; they cannot be addressed by
 *   external HTTP clients such as admin CLIs, Postman, or CI scripts.
 *   This thin Route Handler lets any external admin tool call the same
 *   server-side actions via HTTP, passing the ADMIN_SECRET in the
 *   `x-admin-secret` request header — never in a URL query param.
 *
 * Security contract:
 *   The header is read server-side only.  The underlying actions call
 *   assertAdmin() themselves, so this handler is just delegation glue;
 *   it never bypasses the gate.
 *
 * Usage example (curl):
 *   curl -X POST https://<domain>/api/admin/courses \
 *     -H "Content-Type: application/json" \
 *     -H "x-admin-secret: $ADMIN_SECRET" \
 *     -d '{"title":"Cirugía II","module":2,"type":"elective","price":15000,"capacity":30,"week":2,"features":{},"topics":[]}'
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getCourses, createCourse } from '@/actions/courses';

function adminSecret(req: NextRequest): string {
  return req.headers.get('x-admin-secret') ?? '';
}

/** GET /api/admin/courses — list all courses (admin-only) */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // getCourses is public (no admin gate), but we wrap it here under the
  // admin namespace so the admin client uses a single base URL for all ops.
  // If you want to gate even reads, add assertAdmin here.
  void req; // unused — included for consistent handler signature
  const result = await getCourses();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: 200 });
}

/** POST /api/admin/courses — create a course (admin-only via x-admin-secret header) */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await createCourse(body as Parameters<typeof createCourse>[0], adminSecret(req));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: 201 });
}
