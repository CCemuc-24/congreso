'use client';
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import Header from '@/components/header';
import BuyInfo from '@/components/buyInfo';
import { useConfirmation } from '@/components/inscriptions/useConfirmation';

// How long the "¡Correo enviado!" acknowledgement stays up before the button
// switches to a plain countdown, and how long that countdown blocks re-sends
// (avoids hammering the mail action with repeat clicks).
const SENT_ACK_MS = 1800;
const RESEND_COOLDOWN_SECONDS = 30;

type ResendPhase = 'idle' | 'sending' | 'sent' | 'cooldown';

const ConfirmationContent: React.FC = () => {
  const searchParams = useSearchParams();
  const purchaseId = searchParams.get('purchaseId');

  // No token_ws, no TBK_* handling: /api/webpay/return already committed the
  // payment and redirected failures straight to /error.
  const { status, courses, user, resendEmail } = useConfirmation({ purchaseId });

  const [resendPhase, setResendPhase] = useState<ResendPhase>('idle');
  const [cooldown, setCooldown] = useState(0);
  const sentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (sentTimeoutRef.current) clearTimeout(sentTimeoutRef.current);
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    },
    [],
  );

  const handleResend = useCallback(async () => {
    if (resendPhase !== 'idle') return;
    setResendPhase('sending');
    await resendEmail();
    setResendPhase('sent');
    sentTimeoutRef.current = setTimeout(() => {
      setResendPhase('cooldown');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      cooldownIntervalRef.current = setInterval(() => {
        setCooldown((seconds) => {
          if (seconds <= 1) {
            if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
            setResendPhase('idle');
            return 0;
          }
          return seconds - 1;
        });
      }, 1000);
    }, SENT_ACK_MS);
  }, [resendPhase, resendEmail]);

  const removeLocalStorage = () => localStorage.removeItem('user_id');

  return (
    <div className="mx-auto max-w-2xl px-6">
      <div className="mb-2 flex items-center gap-3">
        {status === 'confirmed' && <CheckCircle2 className="h-7 w-7 text-primary" />}
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">Confirmación de Orden</h2>
      </div>
      {status === 'confirmed' && (
        <p className="mb-8 text-muted-foreground">
          Tu número de orden es <span className="font-mono font-medium text-foreground">{purchaseId}</span>. Recuerda que te llegará una copia al correo electrónico que hayas indicado en el formulario.
        </p>
      )}
      {status === 'not_found' && (
        <p className="mb-8 text-muted-foreground">
          No encontramos esta compra. Revisa el enlace o contáctanos si crees que es un error.
        </p>
      )}
      {status === 'pending' && (
        <p className="mb-8 text-muted-foreground">
          Tu compra aún no ha sido confirmada. Si ya realizaste el pago, puede tardar unos minutos en reflejarse aquí.
        </p>
      )}
      {/* Terminal statuses (rechazada, anulada, expirada, error) get their own copy:
          telling someone whose payment was rejected to wait a few minutes is false. */}
      {status === 'failed' && (
        <p className="mb-8 text-muted-foreground">
          El pago de esta compra no se completó. Puedes intentarlo nuevamente desde el inicio, o contáctanos si crees que es un error.
        </p>
      )}
      {status === 'loading' && (
        <p className="mb-8 text-muted-foreground">Confirmando tu compra...</p>
      )}
      {/* Only once the receipt has actually loaded. BuyInfo renders "Cargando..."
          whenever courses is empty, so rendering it unconditionally put a loading
          message directly underneath "No encontramos esta compra". */}
      {(status === 'confirmed' || status === 'pending' || status === 'failed') && (
        <BuyInfo courses={courses} user={user} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/"
          onClick={removeLocalStorage}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-700"
        >
          Volver al inicio
        </Link>
        <button
          type="button"
          onClick={() => void handleResend()}
          disabled={resendPhase !== 'idle'}
          className={`inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors duration-300 ${
            resendPhase === 'sent'
              ? 'border-primary bg-primary-50 text-primary-700'
              : resendPhase === 'idle'
                ? 'border-border text-foreground hover:bg-muted'
                : 'cursor-not-allowed border-border text-muted-foreground'
          }`}
        >
          {resendPhase === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
          {resendPhase === 'sent' && (
            <CheckCircle2 className="h-4 w-4 animate-in zoom-in-50 duration-300" />
          )}
          <span>
            {resendPhase === 'idle' && 'Reenviar correo'}
            {resendPhase === 'sending' && 'Enviando...'}
            {resendPhase === 'sent' && '¡Correo enviado!'}
            {resendPhase === 'cooldown' && `Reenviar correo (${cooldown}s)`}
          </span>
        </button>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        ¿Tienes problemas? Escríbenos a{' '}
        <a href="mailto:contacto@ccem.cl" className="font-medium text-foreground underline-offset-4 hover:underline">
          contacto@ccem.cl
        </a>
        .
      </p>
    </div>
  );
};

const OrderConfirmation: React.FC = () => {
  return (
    <div>
      <Header />
      <section className="bg-background py-12 md:py-16">
        <Suspense fallback={<p className="px-6">Cargando...</p>}>
          <ConfirmationContent />
        </Suspense>
      </section>
    </div>
  );
};

export default OrderConfirmation;
