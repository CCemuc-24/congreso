// Receipt email for a settled purchase. The recipient is resolved from the
// purchase's own owner — never passed in — so no caller can mail one buyer's
// receipt to an address of their choosing.
//
// A plain lib rather than a 'use server' action because webpayConfirm.ts (called
// from the Route Handler) needs it, and keeping it out of the action layer means
// there is no client-reachable endpoint here at all.
import { prisma } from '@/lib/prisma';
import { sendMail } from '@/lib/mailer';
import { buildConfirmationEmailHtml } from '@/lib/confirmationEmail';
import { CourseType } from '@/domain/courseType';

const SUBJECT = 'Confirmación de compra';

// Typed so callers can distinguish "no such purchase" from any other failure
// (mailer down, missing owner email, etc.) without coupling to this message's
// exact wording — the id-bearing detail here is for logs only, never surfaced
// to a client.
export class PurchaseNotFoundError extends Error {
  constructor(purchaseId: string) {
    super(`Purchase not found: ${purchaseId}`);
    this.name = 'PurchaseNotFoundError';
  }
}

export async function sendPurchaseConfirmation(purchaseId: string): Promise<void> {
  const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) throw new PurchaseNotFoundError(purchaseId);

  const user = await prisma.user.findUnique({ where: { id: purchase.userId } });
  if (!user?.email) throw new Error('Purchase owner has no email');

  // The buyer is enrolled in the purchased courses PLUS every core course.
  const coreCourses = await prisma.course.findMany({ where: { type: CourseType.core } });
  const purchasedCourses = await prisma.course.findMany({
    where: { id: { in: purchase.coursesIds } },
  });
  const seen = new Set<string>();
  const courses = [...coreCourses, ...purchasedCourses].filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  const html = buildConfirmationEmailHtml({ id: purchaseId, courses, user });
  await sendMail(user.email, SUBJECT, html);
}
