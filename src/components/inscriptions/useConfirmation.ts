'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Course, User } from '@prisma/client';
import { getPurchaseReceipt, resendConfirmation } from '@/actions/purchases';

interface UseConfirmationParams {
  purchaseId: string | null;
}

// Four distinguishable states, not just confirmed/not: the receipt call can
// still be in flight ('loading'), can come back for a purchase that exists
// but hasn't settled yet ('pending' — a stale link, or a purchase reversed
// after settlement), or can fail to resolve to a purchase at all
// ('not_found' — bad id, deleted row). Collapsing 'pending' and 'not_found'
// into "not confirmed" was the bug: both rendered "Confirmando tu compra..."
// forever, with no way for the reader to tell a slow page from a dead link.
export type ReceiptStatus = 'loading' | 'confirmed' | 'pending' | 'not_found';

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
    if (ranRef.current || !purchaseId) return;
    ranRef.current = true;

    void (async () => {
      const res = await getPurchaseReceipt(purchaseId);
      if (!res.ok) {
        setStatus('not_found');
        return;
      }
      setCourses(res.data.courses);
      setUser(res.data.user);
      // The receipt email is sent server-side on commit; treat a settled purchase
      // as already mailed.
      const paid = res.data.purchase.status === 'PAID';
      setStatus(paid ? 'confirmed' : 'pending');
      setIsMailSent(paid);
    })();
  }, [purchaseId]);

  const resendEmail = useCallback(async () => {
    if (!purchaseId) return;
    const res = await resendConfirmation(purchaseId);
    if (res.ok) setIsMailSent(true);
  }, [purchaseId]);

  return { status, courses, user, isMailSent, resendEmail };
}
