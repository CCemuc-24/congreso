'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Header from '@/components/header';
import CourseInfo from '@/components/courseInfo';
import { isRut } from '@/domain/rut';
import { getUserByRut, getUserById, createUser } from '@/actions/users';
import { getUserPurchases, createPurchase } from '@/actions/purchases';
import universities from '@/utils/universities.json';

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
    if (!rutValidation.status) {
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
      router.push(`/error/?message=Codigo de confirmacion ${paid.id}&alreadyPaid=true`);
      return true;
    }
    return false;
  };

  const createPurchaseAndRedirect = async (userId: string) => {
    const res = await createPurchase({ userId, coursesIds: search });
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
      <div className="min-h-screen bg-gray-100 p-0 sm:p-12">
        <div className="mx-auto max-w-md px-6 py-12 bg-white border-0 shadow-lg sm:rounded-3xl">
          <h1 className="text-2xl font-bold mb-4">Inscripción a curso</h1>
          <div className="mb-8">
            <CourseInfo />
          </div>
          <form id="form" noValidate>
            <div className="relative z-0 w-full mb-5">
              <input
                type="text"
                name="name"
                placeholder="Ingresa tus nombres"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={`pt-3 pb-2 block w-full px-0 mt-0 bg-transparent border-0 border-b-2 appearance-none focus:outline-none focus:ring-0 ${showErrorName ? 'border-red-600' : 'border-gray-200'}`}
              />
              <span className={`text-sm ${showErrorName ? 'text-red-600' : 'hidden'}`}>Faltan tus nombres</span>
            </div>

            <div className="relative z-0 w-full mb-5">
              <input
                type="text"
                name="lastname"
                placeholder="Ingresa tus apellidos"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className={`pt-3 pb-2 block w-full px-0 mt-0 bg-transparent border-0 border-b-2 appearance-none focus:outline-none focus:ring-0 ${showErrorLastName ? 'border-red-600' : 'border-gray-200'}`}
              />
              <span className={`text-sm ${showErrorLastName ? 'text-red-600' : 'hidden'}`}>Faltan tus apellidos</span>
            </div>

            <div className="relative z-0 w-full mb-5">
              <input
                type="text"
                name="rut"
                placeholder="Ingresa tu RUT"
                value={rut}
                onChange={(e) => setRut(e.target.value)}
                required
                className={`pt-3 pb-2 block w-full px-0 mt-0 bg-transparent border-0 border-b-2 appearance-none focus:outline-none focus:ring-0 ${showErrorRut ? 'border-red-600' : 'border-gray-200'}`}
              />
              <span className={`text-sm ${showErrorRut ? 'text-red-600' : 'hidden'}`}>{errorMessageRut}</span>
            </div>

            <div className="relative z-0 w-full mb-5">
              <input
                type="email"
                name="email"
                placeholder="Ingresa tu correo"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={`pt-3 pb-2 block w-full px-0 mt-0 bg-transparent border-0 border-b-2 appearance-none focus:outline-none focus:ring-0 ${showErrorEmail ? 'border-red-600' : 'border-gray-200'}`}
              />
              <span className={`text-sm ${showErrorEmail ? 'text-red-600' : 'hidden'}`}>Falta tu correo</span>
            </div>

            <div className="relative z-0 w-full mb-5">
              <select
                name="university"
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
                className={`pt-3 pb-2 block w-full px-0 mt-0 bg-transparent border-0 border-b-2 appearance-none focus:outline-none focus:ring-0 ${showErrorUniversity ? 'border-red-600' : 'border-gray-200'}`}
              >
                <option value="" disabled hidden></option>
                {universities.universidades.map((uni) => (
                  <option key={uni} value={uni}>
                    {uni}
                  </option>
                ))}
              </select>
              {!university && (
                <label className="absolute duration-300 top-3 -z-1 origin-0 text-gray-500">
                  Selecciona tu Universidad
                </label>
              )}
              <span className={`text-sm ${showErrorUniversity ? 'text-red-600' : 'hidden'}`}>Falta tu Universidad</span>
            </div>

            <div className="relative z-0 w-full mb-5">
              <select
                name="year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className={`pt-3 pb-2 block w-full px-0 mt-0 bg-transparent border-0 border-b-2 appearance-none z-1 focus:outline-none focus:ring-0 ${showErrorYear ? 'border-red-600' : 'border-gray-200'}`}
              >
                <option value="" disabled hidden></option>
                {['1', '2', '3', '4', '5', '6', '7'].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              {!year && (
                <label className="absolute duration-300 top-3 -z-1 origin-0 text-gray-500">
                  Selecciona el año de tu carrera
                </label>
              )}
              <span className={`text-sm ${showErrorYear ? 'text-red-600' : 'hidden'}`}>
                Falta seleccionar el año de tu carrera
              </span>
            </div>

            <button
              id="button"
              type="button"
              onClick={toggleError}
              className="w-full px-6 py-3 mt-3 text-lg text-white transition-all duration-150 ease-linear rounded-lg shadow outline-none bg-pink-500 hover:bg-pink-600 hover:shadow-lg focus:outline-none"
            >
              Inscribir y pagar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default FormClient;
