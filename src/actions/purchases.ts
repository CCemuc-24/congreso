'use server';

import type { Purchase, Course, User } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createWebpayTransaction } from '@/lib/webpay';
import { generateBuyOrder } from '@/domain/buyOrder';
import { type ActionResult, ok, fail } from '@/domain/result';
import { CourseType } from '@/domain/courseType';
import { PaymentStatus } from '@/domain/paymentStatus';
import { assertAdmin } from '@/lib/auth';
import { sendPurchaseConfirmation, PurchaseNotFoundError } from '@/lib/purchaseEmail';
import {
  purchaseCreateSchema,
  type PurchaseCreateInput,
  updatePurchaseSchema,
  type UpdatePurchaseInput,
  resendConfirmationSchema,
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

  // The amount is frozen here, before the redirect, because the return handler
  // verifies Transbank's committed amount against it. Recomputing at commit time
  // would reject legitimate payments whenever a price changed mid-checkout.
  const totalAmount = courses.reduce((sum, c) => sum + c.price, 0);

  // Create-or-retrieve an unpaid purchase by (userId, coursesIds).
  let purchase = await prisma.purchase.findFirst({
    where: { userId, coursesIds: { equals: coursesIds }, isPaid: false },
  });
  if (!purchase) {
    purchase = await prisma.purchase.create({
      data: {
        userId,
        coursesIds,
        buyOrder: generateBuyOrder(),
        amount: totalAmount,
        status: PaymentStatus.PENDING,
      },
    });
  } else if (purchase.amount !== totalAmount || purchase.status !== PaymentStatus.PENDING) {
    // Re-quote a retrieved attempt: prices may have moved, and a previously
    // ABORTED/TIMEOUT row must return to PENDING so the return handler is
    // willing to settle it.
    purchase = await prisma.purchase.update({
      where: { id: purchase.id },
      data: { amount: totalAmount, status: PaymentStatus.PENDING },
    });
  }

  if (purchase.isPaid) {
    return ok({ purchase });
  }

  const webPayResponse = await createWebpayTransaction(
    purchase.buyOrder!,
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

export async function getPurchaseReceipt(purchaseId: string): Promise<
  ActionResult<{ purchase: Purchase; courses: Course[]; user: User | null }>
> {
  const parsed = resendConfirmationSchema.safeParse({ purchaseId });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue.message, 400, issue.path[0]?.toString());
  }

  const purchase = await prisma.purchase.findUnique({ where: { id: parsed.data.purchaseId } });
  if (!purchase) return fail('La compra no fue encontrada', 404);

  try {
    // One round trip instead of the page's old per-course loop. The buyer is
    // enrolled in the purchased courses PLUS every core course. The three
    // queries are independent of each other (only the purchase lookup above
    // gates them), so they run in parallel rather than as three sequential
    // round trips on a page the buyer is actively waiting on.
    const [coreCourses, purchasedCourses, user] = await Promise.all([
      prisma.course.findMany({ where: { type: CourseType.core } }),
      prisma.course.findMany({ where: { id: { in: purchase.coursesIds } } }),
      prisma.user.findUnique({ where: { id: purchase.userId } }),
    ]);
    const seen = new Set<string>();
    const courses = [...coreCourses, ...purchasedCourses].filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    return ok({ purchase, courses, user });
  } catch (error) {
    return fail((error as Error).message, 500);
  }
}

export async function resendConfirmation(purchaseId: string): Promise<ActionResult<null>> {
  const parsed = resendConfirmationSchema.safeParse({ purchaseId });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue.message, 400, issue.path[0]?.toString());
  }

  try {
    await sendPurchaseConfirmation(parsed.data.purchaseId);
    return ok(null);
  } catch (error) {
    // Distinguished by type, not by matching this string against whatever
    // sendPurchaseConfirmation happens to throw today — a typed error can't
    // silently drift out of sync the way a copy-pasted message could.
    if (error instanceof PurchaseNotFoundError) {
      // The typed error's own message embeds the purchase id for logs; never
      // forward that (or any other internal detail) to the client.
      return fail('Purchase not found', 404);
    }
    const message = error instanceof Error ? error.message : 'Send failed';
    return fail(message, 500);
  }
}
