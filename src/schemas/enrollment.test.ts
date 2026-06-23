// src/schemas/enrollment.test.ts
import { describe, it, expect } from 'vitest';
import { enrollmentCreateSchema } from './enrollment';

const valid = {
  userId: '11111111-1111-1111-1111-111111111111',
  courseId: '22222222-2222-2222-2222-222222222222',
  purchaseId: '33333333-3333-3333-3333-333333333333',
};

describe('enrollmentCreateSchema', () => {
  it('accepts three valid uuids', () => {
    expect(enrollmentCreateSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects a missing courseId', () => {
    const { courseId, ...rest } = valid;
    const r = enrollmentCreateSchema.safeParse(rest);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['courseId']);
  });
  it('rejects a non-uuid userId', () => {
    const r = enrollmentCreateSchema.safeParse({ ...valid, userId: 'abc' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['userId']);
  });
});
