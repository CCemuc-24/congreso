'use server';

import type { User } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ok, fail, type ActionResult } from '@/domain/result';
import { isRut } from '@/domain/rut';
import {
  userCreateSchema,
  type UserCreateInput,
} from '@/schemas/user';

export type { User };

/**
 * Inspect an unknown error for a Prisma unique-constraint violation (P2002).
 * Returns the offending field name (from meta.target) or null if it is not a
 * P2002 error. Duck-typed by `code` so this module does not import the Prisma
 * error class at runtime (keeps tests dependency-free).
 */
function prismaUniqueField(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  ) {
    const meta = (error as { meta?: { target?: unknown } }).meta;
    const target = meta?.target;
    if (Array.isArray(target) && typeof target[0] === 'string') return target[0];
    if (typeof target === 'string') return target;
  }
  return null;
}

export async function createUser(input: UserCreateInput): Promise<ActionResult<User>> {
  const parsed = userCreateSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue.message, 400, issue.path[0]?.toString());
  }
  const data = parsed.data;

  const rutCheck = isRut(data.rut);
  if (!rutCheck.status) {
    return fail(rutCheck.message, 400, 'rut');
  }

  // Find-or-return-existing by rut (mirrors the old controller's 200 branch).
  const existing = await prisma.user.findUnique({ where: { rut: data.rut } });
  if (existing) {
    return ok(existing);
  }

  try {
    const user = await prisma.user.create({ data });
    return ok(user);
  } catch (error) {
    const field = prismaUniqueField(error);
    if (field) {
      return fail(`${field} must be unique`, 409, field);
    }
    return fail((error as Error).message ?? 'Failed to create user', 400);
  }
}

export async function getUsers(): Promise<ActionResult<User[]>> {
  const users = await prisma.user.findMany();
  return ok(users);
}

export async function getUserById(id: string): Promise<ActionResult<User>> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return fail('User not found', 404);
  return ok(user);
}
