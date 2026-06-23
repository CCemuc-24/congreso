'use server';

import type { Purchase } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createWebpayTransaction, commitWebpayTransaction } from '@/lib/webpay';
import { generateBuyOrder } from '@/domain/buyOrder';
import { type ActionResult, ok, fail } from '@/domain/result';
import { CourseType } from '@/domain/courseType';
import { assertAdmin } from '@/lib/auth';
import { sendMail } from '@/lib/mailer';
import { buildConfirmationEmailHtml } from '@/lib/confirmationEmail';
import {
  purchaseCreateSchema,
  type PurchaseCreateInput,
  updatePurchaseSchema,
  type UpdatePurchaseInput,
  sendConfirmationSchema,
  type SendConfirmationInput,
} from '@/schemas/purchase';

function returnUrlFor(purchaseId: string): string {
  const base =
    process.env.WEBPAY_RETURN_URL ??
    `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/webpay/return`;
  return `${base}?purchaseId=${purchaseId}`;
}

export async function createPurchase(
  input: PurchaseCreateInput,
): Promise<ActionResult<{ purchase: Purchase; webPayResponse?: { token: string; url: string } }>> {
  const parsed = purchaseCreateSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue.message, 400, issue.path[0]?.toString());
  }
  const { userId, coursesIds } = parsed.data;

  // Validate all courses exist + have capacity (port of validatePurchase).
  const courses = await prisma.course.findMany({ where: { id: { in: coursesIds } } });
  if (courses.length !== coursesIds.length) {
    return fail('One or more courses not found', 400);
  }
  if (courses.some((c) => c.capacity <= 0)) {
    return fail('One or more courses are full', 400);
  }

  // Create-or-retrieve an unpaid purchase by (userId, coursesIds).
  let purchase = await prisma.purchase.findFirst({ where: { userId, coursesIds: { equals: coursesIds } } });
  if (!purchase) {
    purchase = await prisma.purchase.create({
      data: { userId, coursesIds, buyOrder: generateBuyOrder() },
    });
  }

  if (purchase.isPaid) {
    return ok({ purchase });
  }

  const totalAmount = courses.reduce((sum, c) => sum + c.price, 0);
  const webPayResponse = await createWebpayTransaction(
    purchase.buyOrder ?? generateBuyOrder(),
    purchase.userId,
    totalAmount,
    returnUrlFor(purchase.id),
  );

  return ok({ purchase, webPayResponse });
}

export async function getPurchases(adminSecret: string): Promise<ActionResult<Purchase[]>> {
  try {
    assertAdmin(adminSecret);
  } catch {
    return fail('Unauthorized', 403);
  }
  const purchases = await prisma.purchase.findMany();
  return ok(purchases);
}

export async function getPurchaseById(id: string): Promise<ActionResult<Purchase>> {
  const purchase = await prisma.purchase.findUnique({ where: { id } });
  if (!purchase) return fail('Purchase not found', 404);
  return ok(purchase);
}

export async function getUserPurchases(userId: string): Promise<ActionResult<Purchase[]>> {
  const purchases = await prisma.purchase.findMany({ where: { userId } });
  return ok(purchases);
}

export async function updatePurchase(
  id: string,
  input: UpdatePurchaseInput,
  adminSecret: string,
): Promise<ActionResult<Purchase>> {
  try {
    assertAdmin(adminSecret);
  } catch {
    return fail('Unauthorized', 403);
  }
  // Validate the input with updatePurchaseSchema instead of casting.
  const parsed = updatePurchaseSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue.message, 400, issue.path[0]?.toString());
  }
  try {
    const purchase = await prisma.purchase.update({
      where: { id },
      data: parsed.data,
    });
    return ok(purchase);
  } catch {
    return fail('Purchase not found', 404);
  }
}

export async function deletePurchase(id: string, adminSecret: string): Promise<ActionResult<null>> {
  try {
    assertAdmin(adminSecret);
  } catch {
    return fail('Unauthorized', 403);
  }
  try {
    await prisma.purchase.delete({ where: { id } });
    return ok(null);
  } catch {
    return fail('Purchase not found', 404);
  }
}

export async function confirmPurchase(
  purchaseId: string,
  tokenWs: string,
): Promise<ActionResult<{ purchase: Purchase; transactionStatus: unknown }>> {
  if (!tokenWs) {
    return fail('Transbank no devolvió el código de confirmación', 400);
  }

  const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) {
    return fail('La compra no fue encontrada', 404);
  }

  // Idempotent BEFORE committing — a double-submit on an already-paid purchase
  // short-circuits to ok() without re-committing the Webpay transaction or re-running
  // any side effects.
  if (purchase.isPaid) {
    return ok({ purchase, transactionStatus: { status: 'AUTHORIZED' } });
  }

  const transactionStatus = await commitWebpayTransaction(tokenWs);

  if (transactionStatus.status === 'ERROR') {
    return fail(String(transactionStatus.error ?? 'Error en la transacción'), 402);
  }

  if (transactionStatus.status !== 'AUTHORIZED') {
    return fail('Transacción no autorizada', 400);
  }

  try {
    // Single atomic transaction (mark paid -> enroll -> decrement capacity).
    const updated = await prisma.$transaction(async (tx) => {
      const marked = await tx.purchase.update({ where: { id: purchase.id }, data: { isPaid: true } });

      // Enroll in the purchased courses PLUS every core course.
      const coreCourses = await tx.course.findMany({ where: { type: CourseType.core } });
      const coreIds = coreCourses.map((c) => c.id);
      const purchasedIds = new Set(purchase.coursesIds);
      // Purchased courses first so the oversell guard runs on them before core courses.
      const allCourseIds = Array.from(new Set([...purchase.coursesIds, ...coreIds]));

      for (const courseId of allCourseIds) {
        const existing = await tx.enrollment.findUnique({
          where: { UserCourseUnique: { userId: purchase.userId, courseId } },
        });
        if (existing) continue;

        await tx.enrollment.create({
          data: { userId: purchase.userId, courseId, purchaseId: purchase.id },
        });

        // Conditional decrement closes the oversell window. The capacity guard
        // (capacity > 0) applies to BOTH, but only PURCHASED courses roll back the
        // transaction when full. CORE courses are auto-enrolled: decrement only if
        // capacity remains, and NEVER throw (a full core course must not block confirmation).
        const dec = await tx.course.updateMany({
          where: { id: courseId, capacity: { gt: 0 } },
          data: { capacity: { decrement: 1 } },
        });
        if (dec.count === 0 && purchasedIds.has(courseId)) {
          throw new Error('One or more courses are full');
        }
      }

      return marked;
    });

    return ok({ purchase: updated, transactionStatus });
  } catch (error) {
    return fail((error as Error).message, 400);
  }
}

export async function sendConfirmation(input: SendConfirmationInput): Promise<ActionResult<null>> {
  const parsed = sendConfirmationSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue.message, 400, issue.path[0]?.toString());
  }
  const { purchaseId, email } = parsed.data;

  const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return fail('Purchase not found', 404);

  try {
    // Load the purchased courses PLUS every core course (these are the courses the buyer is enrolled in).
    const coreCourses = await prisma.course.findMany({ where: { type: CourseType.core } });
    const purchasedCourses = await prisma.course.findMany({ where: { id: { in: purchase.coursesIds } } });
    const seen = new Set<string>();
    const courses = [...coreCourses, ...purchasedCourses].filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    const html = buildConfirmationEmailHtml({ id: purchaseId, courses });
    await sendMail(email, 'Confirmación de compra', html);
    return ok(null);
  } catch (error) {
    return fail((error as Error).message, 500);
  }
}
