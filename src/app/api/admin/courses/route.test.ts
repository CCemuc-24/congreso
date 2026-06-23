import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the course actions so this test stays unit-level (no DB/Prisma).
vi.mock('@/actions/courses', () => ({
  getCourses: vi.fn(),
  createCourse: vi.fn(),
}));

import { getCourses, createCourse } from '@/actions/courses';
import { GET, POST } from './route';

const mockGetCourses = getCourses as ReturnType<typeof vi.fn>;
const mockCreateCourse = createCourse as ReturnType<typeof vi.fn>;

const sampleCourse = {
  id: 'c-1',
  title: 'Cirugía I',
  module: 1,
  type: 'core',
  price: 15000,
  capacity: 30,
  week: 1,
  features: {},
  topics: [],
};

function makeRequest(
  method: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {},
): NextRequest {
  const url = 'http://localhost/api/admin/courses';
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }
  return new NextRequest(url, init);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/admin/courses', () => {
  it('returns 200 with course list on success', async () => {
    mockGetCourses.mockResolvedValue({ ok: true, data: [sampleCourse] });
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([sampleCourse]);
  });

  it('returns the action error status when getCourses fails', async () => {
    mockGetCourses.mockResolvedValue({ ok: false, error: 'DB error', status: 500 });
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ error: 'DB error' });
  });
});

describe('POST /api/admin/courses', () => {
  it('returns 201 with created course when admin secret is valid', async () => {
    mockCreateCourse.mockResolvedValue({ ok: true, data: sampleCourse });
    const res = await POST(
      makeRequest('POST', {
        headers: { 'x-admin-secret': 'valid-secret' },
        body: sampleCourse,
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual(sampleCourse);
    expect(mockCreateCourse).toHaveBeenCalledWith(sampleCourse, 'valid-secret');
  });

  it('returns 403 when admin secret is missing or wrong', async () => {
    mockCreateCourse.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 403 });
    const res = await POST(
      makeRequest('POST', {
        // no x-admin-secret header → action will throw → action returns fail(403)
        body: sampleCourse,
      }),
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 on invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/admin/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'secret' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ error: 'Invalid JSON body' });
  });

  it('returns 400 when createCourse rejects with a validation error', async () => {
    mockCreateCourse.mockResolvedValue({
      ok: false,
      error: 'price must be a positive number',
      status: 400,
      field: 'price',
    });
    const res = await POST(
      makeRequest('POST', {
        headers: { 'x-admin-secret': 'valid-secret' },
        body: { ...sampleCourse, price: -1 },
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ error: 'price must be a positive number' });
  });
});
