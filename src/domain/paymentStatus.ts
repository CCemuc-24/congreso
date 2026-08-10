// src/domain/paymentStatus.ts
// Values must stay in sync with prisma enum PaymentStatus.
// PENDING  — created, not yet settled (the state every purchase starts in)
// PAID     — commit returned AUTHORIZED and the amount matched
// REJECTED — commit succeeded but was not authorized, or the amount did not match
// ABORTED  — the buyer pressed "Anular compra" on the Transbank form
// TIMEOUT  — the Transbank form sat idle (~10 min) and expired
// ERROR    — Transbank form error, or the card was charged but settlement failed
export const PaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  REJECTED: 'REJECTED',
  ABORTED: 'ABORTED',
  TIMEOUT: 'TIMEOUT',
  ERROR: 'ERROR',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const paymentStatusValues = [
  'PENDING',
  'PAID',
  'REJECTED',
  'ABORTED',
  'TIMEOUT',
  'ERROR',
] as const;
