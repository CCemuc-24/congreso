// src/domain/result.test.ts
import { describe, it, expect } from 'vitest';
import { ok, fail } from './result';

describe('ok', () => {
  it('wraps data with ok:true', () => {
    expect(ok({ id: '1' })).toEqual({ ok: true, data: { id: '1' } });
  });
});

describe('fail', () => {
  it('defaults to status 400 and omits field', () => {
    const r = fail('bad input');
    expect(r).toEqual({ ok: false, error: 'bad input', status: 400 });
    expect(r.field).toBeUndefined();
  });
  it('carries an explicit status and field (409 conflict shape)', () => {
    expect(fail('email already in use', 409, 'email')).toEqual({
      ok: false,
      error: 'email already in use',
      status: 409,
      field: 'email',
    });
  });
  it('supports a 404 not-found shape', () => {
    expect(fail('User not found', 404)).toEqual({
      ok: false,
      error: 'User not found',
      status: 404,
    });
  });
});
