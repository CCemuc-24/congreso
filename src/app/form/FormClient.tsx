'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Header from '@/components/header';
import CourseInfo from '@/components/courseInfo';
import { isRut } from '@/domain/rut';
import { getUserByRut, getUserById, createUser } from '@/actions/users';
import { getUserPurchases, createPurchase } from '@/actions/purchases';
import universities from '@/utils/universities.json';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Fix 14: the shared validator (src/domain/rut.ts) returns ENGLISH messages; map the
// known ones to Spanish for display. Unknown messages fall through unchanged.
const RUT_MESSAGE_ES: Record<string, string> = {
  'RUT must not contain dots Format: XX.XXX.XXX-X': 'RUT no debe contener puntos. Formato: XX.XXX.XXX-X',
  'RUT must contain dashes': 'RUT debe contener guión',
  'RUT without DV must have 9 or 10 digits': 'El RUT sin dígito verificador debe tener 7 u 8 dígitos',
};

const translateRutMessage = (message: string): string => {
  if (message.startsWith('Invalid DV. Expected:')) {
    return message.replace('Invalid DV. Expected:', 'Dígito verificador inválido. Esperado:');
  }
  return RUT_MESSAGE_ES[message] ?? message;
};

const FormClient: React.FC = () => {
  const [name, setName] = useState('');
  const [showErrorName, setShowErrorName] = useState(false);
  const [lastName, setLastName] = useState('');
  const [showErrorLastName, setShowErrorLastName] = useState(false);
  const [email, setEmail] = useState('');
  const [showErrorEmail, setShowErrorEmail] = useState(false);
  const [rut, setRut] = useState('');
  const [showErrorRut, setShowErrorRut] = useState(false);
  const [errorMessageRut, setErrorMessageRut] = useState('');
  const [university, setUniversity] = useState('');
  const [showErrorUniversity, setShowErrorUniversity] = useState(false);
  const [year, setYear] = useState('');
  const [showErrorYear, setShowErrorYear] = useState(false);

  const [search, setSearch] = useState<string[]>([]);

  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const params = [
      searchParams.get('w1id') ?? '',
      searchParams.get('w2id') ?? '',
      searchParams.get('w3id') ?? '',
    ].filter((p) => p !== '');
    setSearch(params);
  }, [searchParams]);

  const preLoadInfoUser = async () => {
    const storedId = localStorage.getItem('user_id');
    if (!storedId) return;
    const res = await getUserById(storedId);
    if (res.ok) {
      const user = res.data;
      setName(user.names);
      setLastName(user.lastNames);
      setRut(user.rut);
      setEmail(user.email);
      setUniversity(user.university);
      setYear(String(user.carrerYear));
    } else if (res.status === 404) {
      localStorage.removeItem('user_id');
    }
  };

  useEffect(() => {
    preLoadInfoUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleError = () => {
    setShowErrorName(!name);
    setShowErrorLastName(!lastName);
    setShowErrorEmail(!email);
    setShowErrorRut(!rut);
    setShowErrorUniversity(!university);
    setShowErrorYear(!year);

    if (!rut) setErrorMessageRut('Falta tu RUT');

    const rutValidation = isRut(rut);
    if (rut && !rutValidation.status) {
      setShowErrorRut(true);
      setErrorMessageRut(translateRutMessage(rutValidation.message));
    }

    if (!(name && lastName && email && rut && university && year && rutValidation.status)) {
      return;
    }

    sendForms();
  };

  const sendForms = async () => {
    let userId = await getUserIdFromRut(rut);
    if (userId === '') userId = await createUserAndGetId();
    if (userId === '') return;

    if (await checkIfUserAlreadyPaid(userId)) return;
    await createPurchaseAndRedirect(userId);
  };

  const getUserIdFromRut = async (value: string): Promise<string> => {
    const res = await getUserByRut(value);
    if (res.ok) {
      localStorage.setItem('user_id', res.data.id);
      return res.data.id;
    }
    // 404 (not found) is the expected "new user" branch.
    return '';
  };

  const createUserAndGetId = async (): Promise<string> => {
    const res = await createUser({
      names: name,
      lastNames: lastName,
      rut,
      email,
      university,
      carrerYear: Number(year),
    });
    if (res.ok) {
      localStorage.setItem('user_id', res.data.id);
      return res.data.id;
    }
    if (res.status === 409) {
      alert('El correo ya se encuentra asociado a otro RUT registrado');
    }
    return '';
  };

  const checkIfUserAlreadyPaid = async (userId: string): Promise<boolean> => {
    const res = await getUserPurchases(userId);
    if (!res.ok) return false;
    const purchases = res.data;
    const paid = purchases.find((p) => p.isPaid);
    if (paid) {
      router.push(`/error/?message=Codigo de confirmacion ${paid.id}&alreadyPaid=true&purchaseId=${paid.id}`);
      return true;
    }
    return false;
  };

  const createPurchaseAndRedirect = async (userId: string) => {
    // Operator-only: ?testCode=… quotes the purchase at PAYMENT_TEST_AMOUNT_CLP so
    // the live payment path can be exercised with a real card. Forwarded blindly
    // and never validated here — the server decides, and it is inert unless
    // PAYMENT_TEST_CODE is set there, so a visitor guessing at the param just pays
    // the normal price. `?? undefined` because get() returns null when absent and
    // the action's schema types the field as optional.
    const testCode = searchParams.get('testCode') ?? undefined;
    const res = await createPurchase({ userId, coursesIds: search, testCode });
    if (!res.ok) {
      router.push(`/error/?message=${encodeURIComponent(res.error)}`);
      return;
    }
    const { purchase, webPayResponse } = res.data;
    if (webPayResponse) {
      redirectToWebPay(webPayResponse.url, webPayResponse.token);
    } else {
      router.push(`/confirmation/?purchaseId=${purchase.id}`);
    }
  };

  const redirectToWebPay = (url: string, token: string) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    const hiddenField = document.createElement('input');
    hiddenField.type = 'hidden';
    hiddenField.name = 'token_ws';
    hiddenField.value = token;
    form.appendChild(hiddenField);
    document.body.appendChild(form);
    form.submit();
  };

  return (
    <div>
      <Header />
      <div className="min-h-screen bg-background px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card px-6 py-10 shadow-sm sm:px-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Inscripción a curso</h1>
          <div className="mb-8 mt-2">
            <CourseInfo />
          </div>
          <form id="form" noValidate className="space-y-5">
            <div>
              <Input
                type="text"
                name="name"
                placeholder="Ingresa tus nombres"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                aria-invalid={showErrorName}
                className={cn(showErrorName && 'border-destructive')}
              />
              <span className={cn('mt-1 block text-sm text-destructive', !showErrorName && 'hidden')}>Faltan tus nombres</span>
            </div>

            <div>
              <Input
                type="text"
                name="lastname"
                placeholder="Ingresa tus apellidos"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                aria-invalid={showErrorLastName}
                className={cn(showErrorLastName && 'border-destructive')}
              />
              <span className={cn('mt-1 block text-sm text-destructive', !showErrorLastName && 'hidden')}>Faltan tus apellidos</span>
            </div>

            <div>
              <Input
                type="text"
                name="rut"
                placeholder="Ingresa tu RUT"
                value={rut}
                onChange={(e) => setRut(e.target.value)}
                required
                aria-invalid={showErrorRut}
                className={cn(showErrorRut && 'border-destructive')}
              />
              <span className={cn('mt-1 block text-sm text-destructive', !showErrorRut && 'hidden')}>{errorMessageRut}</span>
            </div>

            <div>
              <Input
                type="email"
                name="email"
                placeholder="Ingresa tu correo"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-invalid={showErrorEmail}
                className={cn(showErrorEmail && 'border-destructive')}
              />
              <span className={cn('mt-1 block text-sm text-destructive', !showErrorEmail && 'hidden')}>Falta tu correo</span>
            </div>

            <div>
              <select
                name="university"
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
                className={cn(
                  'h-10 w-full rounded-lg border bg-card px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring',
                  showErrorUniversity ? 'border-destructive' : 'border-input',
                )}
              >
                <option value="" disabled hidden></option>
                {universities.universidades.map((uni) => (
                  <option key={uni} value={uni}>{uni}</option>
                ))}
              </select>
              {!university && <Label className="mt-1 block text-muted-foreground">Selecciona tu Universidad</Label>}
              <span className={cn('mt-1 block text-sm text-destructive', !showErrorUniversity && 'hidden')}>Falta tu Universidad</span>
            </div>

            <div>
              <select
                name="year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className={cn(
                  'h-10 w-full rounded-lg border bg-card px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring',
                  showErrorYear ? 'border-destructive' : 'border-input',
                )}
              >
                <option value="" disabled hidden></option>
                {['1', '2', '3', '4', '5', '6', '7'].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              {!year && <Label className="mt-1 block text-muted-foreground">Selecciona el año de tu carrera</Label>}
              <span className={cn('mt-1 block text-sm text-destructive', !showErrorYear && 'hidden')}>
                Falta seleccionar el año de tu carrera
              </span>
            </div>

            <Button type="button" onClick={toggleError} className="w-full">Inscribir y pagar</Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default FormClient;
