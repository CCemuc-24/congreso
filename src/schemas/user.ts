// src/schemas/user.ts
import { z } from 'zod';
import { isRut } from '../domain/rut';

// Mirrors ccemuc-api/src/interfaces/user.interfaces.ts (UserAttributes, minus id).
export const userCreateSchema = z.object({
  names: z.string().min(1),
  lastNames: z.string().min(1),
  rut: z.string().min(1).refine(
    (value) => isRut(value).status,
    (value) => ({ message: isRut(value).message }),
  ),
  email: z.string().email(),
  university: z.string().min(1),
  carrerYear: z.number().int(),
});

export const userUpdateSchema = userCreateSchema.partial();

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
