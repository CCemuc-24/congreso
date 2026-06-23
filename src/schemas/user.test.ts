// src/schemas/user.test.ts
import { describe, it, expect } from 'vitest';
import { userCreateSchema, userUpdateSchema } from './user';

const valid = {
  names: 'Ada',
  lastNames: 'Lovelace',
  rut: '12345678-5',
  email: 'ada@example.com',
  university: 'PUC',
  carrerYear: 3,
};

describe('userCreateSchema', () => {
  it('accepts a fully valid user', () => {
    expect(userCreateSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects a missing required field (names)', () => {
    const { names, ...rest } = valid;
    const r = userCreateSchema.safeParse(rest);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['names']);
  });
  it('rejects a non-number carrerYear', () => {
    const r = userCreateSchema.safeParse({ ...valid, carrerYear: 'three' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['carrerYear']);
  });
  it('rejects a malformed email', () => {
    const r = userCreateSchema.safeParse({ ...valid, email: 'nope' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['email']);
  });
  it('rejects an invalid RUT via the shared validator, on the rut path', () => {
    const r = userCreateSchema.safeParse({ ...valid, rut: '12345678-9' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(['rut']);
      expect(r.error.issues[0].message).toBe('Invalid DV. Expected: 5');
    }
  });
  it('rejects a RUT with dots, surfacing the validator message', () => {
    const r = userCreateSchema.safeParse({ ...valid, rut: '12.345.678-5' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('RUT must not contain dots Format: XX.XXX.XXX-X');
    }
  });
});

describe('userUpdateSchema', () => {
  it('accepts a partial update', () => {
    expect(userUpdateSchema.safeParse({ university: 'UCH' }).success).toBe(true);
  });
  it('still validates a provided rut', () => {
    expect(userUpdateSchema.safeParse({ rut: '12345678-9' }).success).toBe(false);
  });
});
