// src/schemas/enrollment.ts
import { z } from 'zod';

// Mirrors ccemuc-api/src/interfaces/enrollment.interfaces.ts (EnrollmentAttributes, minus id).
export const enrollmentCreateSchema = z.object({
  userId: z.string().uuid(),
  courseId: z.string().uuid(),
  purchaseId: z.string().uuid(),
});

export type EnrollmentCreateInput = z.infer<typeof enrollmentCreateSchema>;
