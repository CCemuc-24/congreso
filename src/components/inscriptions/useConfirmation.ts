'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Course, User } from '@prisma/client';
import { getPurchaseReceipt, resendConfirmation } from '@/actions/purchases';
import { PaymentStatus } from '@/domain/paymentStatus';

interface UseConfirmationParams {
  purchaseId: string | null;
}

// Five distinguishable states, not just confirmed/not: the receipt call can
// still be in flight ('loading'), can come back for a purchase that exists
// but hasn't settled yet ('pending' — a stale link, or a payment still being
// processed), can come back for one that reached a TERMINAL failure
// ('failed' — REJECTED/ABORTED/TIMEOUT/ERROR, where "wait a few minutes" is
// simply false), or can fail to resolve to a purchase at all ('not_found' —
// bad id, deleted row, or no id in the URL at all). Collapsing these into
// "not confirmed" was the bug: they all rendered "Confirmando tu compra..."
// forever, with no way for the reader to tell a slow page from a dead link.
export type ReceiptStatus = 'loading' | 'confirmed' | 'pending' | 'failed' | 'not_found';

interface UseConfirmationResult {
  status: ReceiptStatus;
  courses: Course[];
  user: User | null;
  isMailSent: boolean;
  resendEmail: () => Promise<void>;
}

/**
 * Read-only receipt loader. The payment was already committed server-side by
 * /api/webpay/return before this page rendered — this hook only displays the
 * result, and never sees a Webpay token.
 */
export function useConfirmation({ purchaseId }: UseConfirmationParams): UseConfirmationResult {
  const [status, setStatus] = useState<ReceiptStatus>('loading');
  const [courses, setCourses] = useState<Course[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isMailSent, setIsMailSent] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    if (!purchaseId) {
      // No id in the URL: there is nothing to load and nothing will ever arrive,
      // so this is the same dead end as a receipt that fails to resolve. Leaving
      // the state at 'loading' left /confirmation saying "Confirmando tu
      // compra..." forever — the defect already fixed for the other two cases.
      // ranRef is deliberately NOT set here, so a purchaseId that shows up on a
      // later render (Suspense-resolved search params) still gets loaded.
      setStatus('not_found');
      return;
    }
    ranRef.current = true;

    void (async () => {
      const res = await getPurchaseReceipt(purchaseId);
      if (!res.ok) {
        setStatus('not_found');
        return;
      }
      setCourses(res.data.courses);
      setUser(res.data.user);
      // isPaid OR status: they are mirrors, but they can disagree in exactly one
      // direction. Only new code writes both — the pre-hardening confirmPurchase
      // wrote isPaid alone — so a purchase settled while this branch was rolled
      // back sits at isPaid: true, status: 'PENDING'. Gating on status alone would
      // tell that payer their paid purchase "aún no ha sido confirmada" forever.
      // Same reasoning covers rows predating the migration, whose status defaulted
      // to PENDING. Never the reverse: nothing writes status: 'PAID' without isPaid.
      // See DEPLOY.md for the SQL that repairs such rows.
      const paid = res.data.purchase.isPaid || res.data.purchase.status === PaymentStatus.PAID;
      // The receipt email is sent server-side on commit; treat a settled purchase
      // as already mailed.
      setIsMailSent(paid);
      if (paid) {
        setStatus('confirmed');
        return;
      }
      // Unsettled splits two ways: PENDING may still complete, everything else is
      // terminal and must not be described as "give it a few minutes".
      setStatus(res.data.purchase.status === PaymentStatus.PENDING ? 'pending' : 'failed');
    })();
  }, [purchaseId]);

  const resendEmail = useCallback(async () => {
    if (!purchaseId) return;
    const res = await resendConfirmation(purchaseId);
    if (res.ok) setIsMailSent(true);
  }, [purchaseId]);

  return { status, courses, user, isMailSent, resendEmail };
}
