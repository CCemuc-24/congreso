'use server';

import { prisma } from '@/lib/prisma';
import { assertAdmin } from '@/lib/auth';
import { ActionResult, ok, fail } from '@/domain/result';
import {
  courseCreateSchema,
  courseUpdateSchema,
  type CourseCreateInput,
  type CourseUpdateInput,
} from '@/schemas/course';
import type { Course } from '@prisma/client';

// Re-export the Prisma Course type so consumers (e.g. /form, inscription components)
// can `import type { Course } from '@/actions/courses'`.
export type { Course } from '@prisma/client';

function isPrismaNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2025'
  );
}

export async function createCourse(
  input: CourseCreateInput,
  adminSecret: string,
): Promise<ActionResult<Course>> {
  try {
    assertAdmin(adminSecret);
  } catch {
    return fail('Unauthorized', 403);
  }

  const parsed = courseCreateSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue.message, 400, issue.path[0] as string | undefined);
  }

  try {
    const course = await prisma.course.create({ data: parsed.data });
    return ok(course);
  } catch (error) {
    return fail((error as Error).message, 400);
  }
}

export async function getCourses(): Promise<ActionResult<Course[]>> {
  try {
    const courses = await prisma.course.findMany();
    return ok(courses);
  } catch (error) {
    return fail((error as Error).message, 500);
  }
}

export async function getCourseById(id: string): Promise<ActionResult<Course>> {
  try {
    const course = await prisma.course.findUnique({ where: { id } });
    if (!course) return fail('Course not found', 404);
    return ok(course);
  } catch (error) {
    return fail((error as Error).message, 500);
  }
}

export async function updateCourse(
  id: string,
  input: CourseUpdateInput,
  adminSecret: string,
): Promise<ActionResult<Course>> {
  try {
    assertAdmin(adminSecret);
  } catch {
    return fail('Unauthorized', 403);
  }

  const parsed = courseUpdateSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue.message, 400, issue.path[0] as string | undefined);
  }

  try {
    const course = await prisma.course.update({ where: { id }, data: parsed.data });
    return ok(course);
  } catch (error) {
    if (isPrismaNotFound(error)) return fail('Course not found', 404);
    return fail((error as Error).message, 500);
  }
}

export async function deleteCourse(
  id: string,
  adminSecret: string,
): Promise<ActionResult<null>> {
  try {
    assertAdmin(adminSecret);
  } catch {
    return fail('Unauthorized', 403);
  }

  try {
    await prisma.course.delete({ where: { id } });
    return ok(null);
  } catch (error) {
    if (isPrismaNotFound(error)) return fail('Course not found', 404);
    return fail((error as Error).message, 500);
  }
}
