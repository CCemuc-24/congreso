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
 *
 * Recording a status at all is conditional on Transbank supplying TBK_ORDEN_COMPRA:
 * buyOrder is the only key that links a tokenless callback back to a row, so when it
 * is absent we return null without any lookup and the row simply stays PENDING. The
 * per-case status distinction is therefore a best effort, not a guarantee.
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

  // Pre-commit idempotency guard, restoring a property the previous confirmPurchase
  // had: never commit a token against a purchase that is already settled.
  //
  // createPurchase mints a FRESH Webpay transaction on every call for a retrieved
  // unpaid row but never regenerates buyOrder, so a buyer who clicks pay, presses
  // back, and clicks pay again holds two live tokens for one buyOrder. Committing the
  // stale one after the other settled is a second, distinct Transbank transaction —
  // it authorizes, and the card is charged twice.
  //
  // This is the ONE safe use of the client-supplied purchaseId, and the distinction is
  // the whole point: using it to SKIP a commit can only ever result in not charging a
  // card. It can never mark a row paid, which is the property this module defends.
  // Using it to SELECT A ROW TO SETTLE remains forbidden — that is the vulnerability.
  //
  // .catch(() => null) is load-bearing, not defensive noise: Purchase.id is @db.Uuid and
  // purchaseId arrives raw from the return POST (webpayReturnParams only collapses '' to
  // undefined), so any non-UUID reaches Prisma and throws P2023. An uncaught throw here
  // would abort before the commit and strand a legitimate payment that would otherwise
  // have settled via buy_order. This guard is an optimization; it must never be able to
  // PREVENT a settlement. A malformed or unknown id simply means "no claim found".
  if (params.purchaseId) {
    const claimed = await prisma.purchase
      .findUnique({ where: { id: params.purchaseId } })
      .catch(() => null);
    if (claimed?.status === PaymentStatus.PAID) {
      return { outcome: 'success', purchaseId: claimed.id };
    }
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
    // The guard above could not fire (no purchaseId on the request, or it named a
    // different row) yet this commit authorized against an already-settled purchase:
    // a real second capture. The money is gone from the buyer's card and there is no
    // column to park it in — token/authorizationCode/paymentTypeCode/paidAt all hold
    // the FIRST charge's facts, which are what a refund of that charge needs, so
    // overwriting any of them would destroy the original record. Log everything a
    // human needs to find and reverse it manually.
    if (
      isApproved(commit) &&
      commit.authorization_code != null &&
      commit.authorization_code !== purchase.authorizationCode
    ) {
      console.error(
        'ORPHAN AUTHORIZATION: a second Webpay capture authorized against an ' +
          'already-PAID purchase. The card was charged again. This authorization is ' +
          'NOT stored on the row and must be refunded manually.',
        {
          purchaseId: purchase.id,
          buyOrder: purchase.buyOrder,
          settledAuthorizationCode: purchase.authorizationCode,
          settledPaidAt: purchase.paidAt,
          orphanAuthorizationCode: commit.authorization_code,
          orphanPaymentTypeCode: commit.payment_type_code,
          orphanToken: tokenWs,
          orphanAmount: commit.amount,
          orphanTransactionDate: commit.transaction_date,
        },
      );
    }
    return { outcome: 'success', purchaseId: purchase.id };
  }

  const approved = isApproved(commit);
  const amountOk = amountsMatch(commit.amount, purchase.amount);
  if (!approved || !amountOk) {
    // Guarded on not-PAID for the same reason as the rollback-recovery write below, and
    // it matters more here: two live tokens for one buyOrder against a re-quoted amount
    // can both pass the PAID check above before either writes. Losing that race with a
    // bare update would overwrite the winner's authorizationCode/paymentTypeCode with
    // this second transaction's values, destroying the settled charge's refund facts —
    // exactly the harm the orphan-authorization branch above exists to prevent.
    await prisma.purchase.updateMany({
      where: { id: purchase.id, status: { not: PaymentStatus.PAID } },
      data: {
        status: PaymentStatus.REJECTED,
        token: tokenWs,
        // When `approved` holds, the commit returned AUTHORIZED with response_code 0,
        // so the capture HAPPENED and only the amount failed to match — reachable with
        // no attacker at all, because createPurchase re-quotes `amount` while keeping
        // the same buyOrder, so a still-live older token commits the old amount against
        // a re-quoted row. These two fields are exactly what a refund needs, and this
        // is the tamper-detection path, so it is where the audit trail matters most.
        ...(approved
          ? {
              authorizationCode: commit.authorization_code ?? null,
              paymentTypeCode: commit.payment_type_code ?? null,
            }
          : {}),
      },
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
    // updateMany with a not-PAID guard, mirroring failPending: under a concurrent
    // duplicate return this must not stamp ERROR on a row another request just settled,
    // which would leave isPaid: true alongside status: ERROR and break that mirror.
    try {
      await prisma.purchase.updateMany({
        where: { id: purchase.id, status: { not: PaymentStatus.PAID } },
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
