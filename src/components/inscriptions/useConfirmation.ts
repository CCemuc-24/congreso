'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Course, User } from '@prisma/client';
import { getPurchaseReceipt, resendConfirmation } from '@/actions/purchases';

interface UseConfirmationParams {
  purchaseId: string | null;
}

interface UseConfirmationResult {
  confirmed: boolean;
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
  const [confirmed, setConfirmed] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isMailSent, setIsMailSent] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current || !purchaseId) return;
    ranRef.current = true;

    void (async () => {
      const res = await getPurchaseReceipt(purchaseId);
      if (!res.ok) return;
      setCourses(res.data.courses);
      setUser(res.data.user);
      // The receipt email is sent server-side on commit; treat a settled purchase
      // as already mailed.
      setConfirmed(res.data.purchase.status === 'PAID');
      setIsMailSent(res.data.purchase.status === 'PAID');
    })();
  }, [purchaseId]);

  const resendEmail = useCallback(async () => {
    if (!purchaseId) return;
    const res = await resendConfirmation(purchaseId);
    if (res.ok) setIsMailSent(true);
  }, [purchaseId]);

  return { confirmed, courses, user, isMailSent, resendEmail };
}
