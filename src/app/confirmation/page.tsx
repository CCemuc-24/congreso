'use client';
import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import Header from '@/components/header';
import BuyInfo from '@/components/buyInfo';
import { useConfirmation } from '@/components/inscriptions/useConfirmation';

const ConfirmationContent: React.FC = () => {
  const searchParams = useSearchParams();
  const purchaseId = searchParams.get('purchaseId');

  // No token_ws, no TBK_* handling: /api/webpay/return already committed the
  // payment and redirected failures straight to /error.
  const { confirmed, courses, user, resendEmail } = useConfirmation({ purchaseId });

  const removeLocalStorage = () => localStorage.removeItem('user_id');

  return (
    <div className="mx-auto max-w-2xl px-6">
      <div className="mb-2 flex items-center gap-3">
        {confirmed && <CheckCircle2 className="h-7 w-7 text-primary" />}
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">Confirmación de Orden</h2>
      </div>
      {confirmed ? (
        <p className="mb-8 text-muted-foreground">
          Tu número de orden es <span className="font-mono font-medium text-foreground">{purchaseId}</span>. Recuerda que te llegará una copia al correo electrónico que hayas indicado en el formulario.
        </p>
      ) : (
        <p className="mb-8 text-muted-foreground">Confirmando tu compra...</p>
      )}
      <BuyInfo courses={courses} user={user} />
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
          onClick={() => void resendEmail()}
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Reenviar correo
        </button>
      </div>
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
