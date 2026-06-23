'use server';

import { prisma } from '@/lib/prisma';
import { assertAdmin } from '@/lib/auth';
import { ActionResult, ok, fail } from '@/domain/result';
import {
  enrollmentCreateSchema,
  type EnrollmentCreateInput,
} from '@/schemas/enrollment';
import type { Enrollment } from '@prisma/client';

function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return (error as { code?: unknown }).code as string | undefined;
  }
  return undefined;
}

function uniqueTargetField(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'meta' in error) {
    const target = (error as { meta?: { target?: unknown } }).meta?.target;
    if (Array.isArray(target) && typeof target[0] === 'string') return target[0];
  }
  return undefined;
}

export async function createEnrollment(
  input: EnrollmentCreateInput,
): Promise<ActionResult<Enrollment>> {
  const parsed = enrollmentCreateSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue.message, 400, issue.path[0] as string | undefined);
  }

  const { userId, courseId } = parsed.data;
  try {
    const existing = await prisma.enrollment.findUnique({
      where: { UserCourseUnique: { userId, courseId } },
    });
    if (existing) return ok(existing);

    const enrollment = await prisma.enrollment.create({ data: parsed.data });
    return ok(enrollment);
  } catch (error) {
    if (prismaErrorCode(error) === 'P2002') {
      return fail((error as Error).message, 409, uniqueTargetField(error));
    }
    return fail((error as Error).message, 400);
  }
}

export async function getEnrollments(): Promise<ActionResult<Enrollment[]>> {
  try {
    const enrollments = await prisma.enrollment.findMany();
    return ok(enrollments);
  } catch (error) {
    return fail((error as Error).message, 500);
  }
}

export async function getEnrollmentById(id: string): Promise<ActionResult<Enrollment>> {
  try {
    const enrollment = await prisma.enrollment.findUnique({ where: { id } });
    if (!enrollment) return fail('Enrollment not found', 404);
    return ok(enrollment);
  } catch (error) {
    return fail((error as Error).message, 500);
  }
}

export async function updateEnrollment(
  id: string,
  input: EnrollmentCreateInput,
  adminSecret: string,
): Promise<ActionResult<Enrollment>> {
  try {
    assertAdmin(adminSecret);
  } catch {
    return fail('Unauthorized', 403);
  }

  const parsed = enrollmentCreateSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue.message, 400, issue.path[0] as string | undefined);
  }

  try {
    const enrollment = await prisma.enrollment.update({
      where: { id },
      data: parsed.data,
    });
    return ok(enrollment);
  } catch (error) {
    if (prismaErrorCode(error) === 'P2025') return fail('Enrollment not found', 404);
    return fail((error as Error).message, 500);
  }
}

export async function deleteEnrollment(
  id: string,
  adminSecret: string,
): Promise<ActionResult<null>> {
  try {
    assertAdmin(adminSecret);
  } catch {
    return fail('Unauthorized', 403);
  }

  try {
    await prisma.enrollment.delete({ where: { id } });
    return ok(null);
  } catch (error) {
    if (prismaErrorCode(error) === 'P2025') return fail('Enrollment not found', 404);
    return fail((error as Error).message, 500);
  }
}
