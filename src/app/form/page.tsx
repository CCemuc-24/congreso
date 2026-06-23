import { Suspense } from 'react';
import FormClient from './FormClient';

export default function FormPage() {
  return (
    <Suspense fallback={<h2 className="text-lg p-12">Cargando...</h2>}>
      <FormClient />
    </Suspense>
  );
}
