// The single Webpay commit point. Reachable ONLY from the /api/webpay/return
// Route Handler — deliberately not a 'use server' action, because a server action
// is an addressable RPC endpoint any browser can call, and letting a client hand
// us a (purchaseId, token_ws) pair is exactly the hole this module closes.
import { prisma } from '@/lib/prisma';
import { commitWebpayTransaction } from '@/lib/webpay';
import { sendPurchaseConfirmation } from '@/lib/purchaseEmail';
import { PaymentStatus } from '@/domain/paymentStatus';
import { CourseType } from '@/domain/courseType';
import type { WebpayReturnParams } from '@/lib/webpayReturnParams';

/** Webpay Plus commit response. The SDK types commit() as any, so we declare our own. */
export type WebpayCommitResponse = {
  status?: string;
  buy_order?: string;
  amount?: number;
  response_code?: number;
  authorization_code?: string;
  payment_type_code?: string;
  transaction_date?: string;
  error?: unknown;
};

export type ConfirmOutcome =
  | { outcome: 'success'; purchaseId: string }
  | { outcome: 'error'; purchaseId: string | null; message: string };

const ABORT_MESSAGE = 'Error en la compra';
const OVERSOLD_MESSAGE =
  'Tu pago fue aprobado pero uno de los cursos se llenó. Contáctanos para gestionar tu reembolso o cambio de curso.';

/** Both conditions are required. Neither alone means the card was charged. */
export function isApproved(commit: WebpayCommitResponse): boolean {
  return commit.status === 'AUTHORIZED' && commit.response_code === 0;
}

/** Integer CLP comparison against the amount we froze before redirecting. */
export function amountsMatch(committed: number | undefined, expected: number | null): boolean {
  if (committed == null || expected == null) return false;
  return Math.round(committed) === Math.round(expected);
}

/**
 * Flip a still-PENDING purchase to a terminal failure status. Best-effort and
 * idempotent: only PENDING rows are touched, so a replayed abort return can never
 * downgrade a purchase that has already been paid. Returns the row id for the
 * /error redirect, or null when nothing matched.
 */
async function failPending(
  buyOrder: string | undefined,
  status: PaymentStatus,
): Promise<string | null> {
  if (!buyOrder) return null;
  const purchase = await prisma.purchase.findUnique({ where: { buyOrder } });
  if (!purchase) return null;
  if (purchase.status === PaymentStatus.PENDING) {
    await prisma.purchase.update({ where: { id: purchase.id }, data: { status } });
  }
  return purchase.id;
}

export async function confirmWebpayReturn(params: WebpayReturnParams): Promise<ConfirmOutcome> {
  const { token_ws: tokenWs, TBK_TOKEN: tbkToken, TBK_ORDEN_COMPRA: tbkOrden } = params;

  // No success token. Two Transbank flows land here, told apart only by TBK_TOKEN:
  //   • buyer pressed "Anular compra"  -> TBK_TOKEN + TBK_ORDEN_COMPRA + TBK_ID_SESION
  //   • form sat idle (~10 min)        -> TBK_ORDEN_COMPRA + TBK_ID_SESION, no TBK_TOKEN
  if (!tokenWs) {
    const id = await failPending(
      tbkOrden,
      tbkToken ? PaymentStatus.ABORTED : PaymentStatus.TIMEOUT,
    );
    return { outcome: 'error', purchaseId: id ?? params.purchaseId ?? null, message: ABORT_MESSAGE };
  }

  // token_ws AND TBK_TOKEN both present => Transbank form error (e.g. the payment
  // tab was closed and later recovered). Transbank mandates NOT committing here.
  if (tbkToken) {
    const id = await failPending(tbkOrden, PaymentStatus.ERROR);
    return { outcome: 'error', purchaseId: id ?? params.purchaseId ?? null, message: ABORT_MESSAGE };
  }

  // Normal flow.
  const commit = (await commitWebpayTransaction(tokenWs)) as WebpayCommitResponse;

  if (commit.status === 'ERROR') {
    return {
      outcome: 'error',
      purchaseId: params.purchaseId ?? null,
      message: 'Error en la transacción',
    };
  }

  // Select the row by the buy_order Transbank echoes back. NEVER by a
  // client-supplied purchaseId — otherwise a cheap token could be replayed
  // against an expensive purchase.
  if (!commit.buy_order) {
    return { outcome: 'error', purchaseId: params.purchaseId ?? null, message: ABORT_MESSAGE };
  }
  const purchase = await prisma.purchase.findUnique({ where: { buyOrder: commit.buy_order } });
  if (!purchase) {
    return { outcome: 'error', purchaseId: null, message: 'La compra no fue encontrada' };
  }

  // Idempotent: a refreshed or re-POSTed return short-circuits before any write.
  if (purchase.status === PaymentStatus.PAID) {
    return { outcome: 'success', purchaseId: purchase.id };
  }

  const approved = isApproved(commit);
  const amountOk = amountsMatch(commit.amount, purchase.amount);
  if (!approved || !amountOk) {
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { status: PaymentStatus.REJECTED, token: tokenWs },
    });
    return {
      outcome: 'error',
      purchaseId: purchase.id,
      message: approved
        ? 'El monto pagado no coincide con la compra'
        : 'Transacción no autorizada',
    };
  }

  try {
    // One atomic transaction: mark paid -> enroll -> decrement capacity.
    const settled = await prisma.$transaction(async (tx) => {
      const marked = await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          isPaid: true,
          status: PaymentStatus.PAID,
          token: tokenWs,
          authorizationCode: commit.authorization_code ?? null,
          paymentTypeCode: commit.payment_type_code ?? null,
          paidAt: commit.transaction_date ? new Date(commit.transaction_date) : new Date(),
        },
      });

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
        // applies to BOTH, but only PURCHASED courses roll the transaction back
        // when full — a full core course must never block confirmation.
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

    // Best-effort receipt. A committed payment must never be reported as a
    // failure because SMTP was down.
    try {
      await sendPurchaseConfirmation(settled.id);
    } catch (error) {
      console.error('purchase confirmation email failed', error);
    }

    return { outcome: 'success', purchaseId: settled.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transaction failed';
    const oversold = message === 'One or more courses are full';

    // The card WAS charged but we could not seat the student, and the transaction
    // rolled back. Persist the payment facts outside it so the money is visible to
    // an admin instead of vanishing into a PENDING row. Best-effort: if even this
    // write fails we still return the outcome below, so the buyer is never left
    // staring at an unhandled exception on a card that was charged.
    try {
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          status: PaymentStatus.ERROR,
          token: tokenWs,
          authorizationCode: commit.authorization_code ?? null,
          paymentTypeCode: commit.payment_type_code ?? null,
        },
      });
    } catch (updateError) {
      console.error('failed to record a charged-but-unsettled payment', updateError);
    }

    return {
      outcome: 'error',
      purchaseId: purchase.id,
      message: oversold ? OVERSOLD_MESSAGE : message,
    };
  }
}
