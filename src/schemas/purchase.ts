// src/schemas/purchase.ts
import { z } from 'zod';
import { paymentStatusValues } from '@/domain/paymentStatus';

// Mirrors ccemuc-api/src/interfaces/purchase.interface.ts (PurchaseAttributes, minus id).
// buyOrder and isPaid are server-generated, never client input.
export const purchaseCreateSchema = z.object({
  userId: z.string().uuid(),
  coursesIds: z.array(z.string().uuid()).min(1),
});

// The recipient is resolved server-side from the purchase owner, so the only
// input is which purchase to re-send.
export const resendConfirmationSchema = z.object({
  purchaseId: z.string().uuid(),
});

// Fix 9: updatePurchase input validation (replaces casting to Prisma.PurchaseUpdateInput).
export const updatePurchaseSchema = z.object({
  isPaid: z.boolean().optional(),
  buyOrder: z.string().optional(),
  status: z.enum(paymentStatusValues).optional(),
});

export type PurchaseCreateInput = z.infer<typeof purchaseCreateSchema>;
export type ResendConfirmationInput = z.infer<typeof resendConfirmationSchema>;
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseSchema>;
