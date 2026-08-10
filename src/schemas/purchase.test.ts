// src/schemas/purchase.test.ts
import { describe, it, expect } from 'vitest';
import { purchaseCreateSchema, resendConfirmationSchema, updatePurchaseSchema } from './purchase';

describe('purchaseCreateSchema', () => {
  const valid = {
    userId: '11111111-1111-1111-1111-111111111111',
    coursesIds: ['22222222-2222-2222-2222-222222222222'],
  };
  it('accepts a valid purchase', () => {
    expect(purchaseCreateSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects a missing userId', () => {
    const r = purchaseCreateSchema.safeParse({ coursesIds: valid.coursesIds });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['userId']);
  });
  it('rejects a non-uuid in coursesIds', () => {
    const r = purchaseCreateSchema.safeParse({ ...valid, coursesIds: ['nope'] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['coursesIds', 0]);
  });
  it('rejects an empty coursesIds array', () => {
    const r = purchaseCreateSchema.safeParse({ ...valid, coursesIds: [] });
    expect(r.success).toBe(false);
  });
});

describe('resendConfirmationSchema', () => {
  const valid = { purchaseId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' };

  it('accepts a uuid purchaseId', () => {
    expect(resendConfirmationSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a non-uuid purchaseId', () => {
    const r = resendConfirmationSchema.safeParse({ purchaseId: 'nope' });
    expect(r.success).toBe(false);
  });

  it('rejects a missing purchaseId', () => {
    const r = resendConfirmationSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('no longer accepts a caller-supplied recipient', () => {
    // The recipient is resolved from the purchase owner. An extra email key is
    // stripped by zod rather than honoured — assert it never reaches parsed output.
    const r = resendConfirmationSchema.safeParse({ ...valid, email: 'attacker@evil.cl' });
    expect(r.success).toBe(true);
    if (r.success) expect('email' in r.data).toBe(false);
  });
});

describe('updatePurchaseSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    expect(updatePurchaseSchema.safeParse({}).success).toBe(true);
  });
  it('accepts isPaid + buyOrder', () => {
    expect(updatePurchaseSchema.safeParse({ isPaid: true, buyOrder: 'BO-1' }).success).toBe(true);
  });
  it('rejects a non-boolean isPaid', () => {
    const r = updatePurchaseSchema.safeParse({ isPaid: 'yes' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['isPaid']);
  });
});
