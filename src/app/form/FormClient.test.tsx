import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ok, fail } from '@/domain/result';

const getUserByRut = vi.fn();
const getUserById = vi.fn();
const createUser = vi.fn();
vi.mock('@/actions/users', () => ({
  getUserByRut: (rut: string) => getUserByRut(rut),
  getUserById: (id: string) => getUserById(id),
  createUser: (input: unknown) => createUser(input),
}));

const getUserPurchases = vi.fn();
const createPurchase = vi.fn();
vi.mock('@/actions/purchases', () => ({
  getUserPurchases: (id: string) => getUserPurchases(id),
  createPurchase: (input: unknown) => createPurchase(input),
}));

const push = vi.fn();
let params = new URLSearchParams('w1id=c1&w2id=c2');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => params,
}));

vi.mock('@/components/header', () => ({ default: () => <div data-testid="header" /> }));
vi.mock('@/components/courseInfo', () => ({ default: () => <div data-testid="courseinfo" /> }));

import FormClient from './FormClient';

const fillValidForm = () => {
  fireEvent.change(screen.getByPlaceholderText('Ingresa tus nombres'), { target: { value: 'Ada' } });
  fireEvent.change(screen.getByPlaceholderText('Ingresa tus apellidos'), { target: { value: 'Lovelace' } });
  fireEvent.change(screen.getByPlaceholderText('Ingresa tu RUT'), { target: { value: '11111111-1' } });
  fireEvent.change(screen.getByPlaceholderText('Ingresa tu correo'), { target: { value: 'ada@uc.cl' } });
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'Pontificia Universidad Católica de Chile' } });
  fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '3' } });
};

describe('FormClient', () => {
  beforeEach(() => {
    [getUserByRut, getUserById, createUser, getUserPurchases, createPurchase, push].forEach((m) => m.mockReset());
    params = new URLSearchParams('w1id=c1&w2id=c2');
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
    // jsdom does not implement form.submit; stub it.
    HTMLFormElement.prototype.submit = vi.fn();
  });

  it('blocks submit and shows an error when the RUT is invalid', async () => {
    render(<FormClient />);
    fillValidForm();
    fireEvent.change(screen.getByPlaceholderText('Ingresa tu RUT'), { target: { value: '12345678' } });
    fireEvent.click(screen.getByText('Inscribir y pagar'));
    // Fix 14: isRut returns English ('RUT must contain dashes'); the form maps it to Spanish for display.
    await waitFor(() => expect(screen.getByText('RUT debe contener guión')).toBeInTheDocument());
    expect(createPurchase).not.toHaveBeenCalled();
  });

  it('blocks submit and shows "Falta tu RUT" (not "RUT debe contener guión") when RUT is blank', async () => {
    render(<FormClient />);
    fillValidForm();
    fireEvent.change(screen.getByPlaceholderText('Ingresa tu RUT'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Inscribir y pagar'));
    await waitFor(() => expect(screen.getByText('Falta tu RUT')).toBeInTheDocument());
    expect(screen.queryByText('RUT debe contener guión')).not.toBeInTheDocument();
    expect(createPurchase).not.toHaveBeenCalled();
  });

  it('existing user (found by RUT) → skips createUser, no prior paid purchase → createPurchase → webpay redirect', async () => {
    getUserByRut.mockResolvedValue(ok({ id: 'u1', names: 'Ada' }));
    getUserPurchases.mockResolvedValue(ok([]));
    createPurchase.mockResolvedValue(ok({ purchase: { id: 'p1' }, webPayResponse: { token: 'tkn', url: 'https://wp.test/pay' } }));
    render(<FormClient />);
    fillValidForm();
    fireEvent.click(screen.getByText('Inscribir y pagar'));
    await waitFor(() => expect(createPurchase).toHaveBeenCalledWith({ userId: 'u1', coursesIds: ['c1', 'c2'] }));
    expect(createUser).not.toHaveBeenCalled();
    expect(HTMLFormElement.prototype.submit).toHaveBeenCalled();
  });

  it('new user (RUT not found) → createUser → createPurchase', async () => {
    getUserByRut.mockResolvedValue(fail('User not found', 404));
    createUser.mockResolvedValue(ok({ id: 'u2' }));
    getUserPurchases.mockResolvedValue(ok([]));
    createPurchase.mockResolvedValue(ok({ purchase: { id: 'p2' }, webPayResponse: { token: 't', url: 'https://wp.test/pay' } }));
    render(<FormClient />);
    fillValidForm();
    fireEvent.click(screen.getByText('Inscribir y pagar'));
    await waitFor(() => expect(createUser).toHaveBeenCalled());
    expect(createPurchase).toHaveBeenCalledWith({ userId: 'u2', coursesIds: ['c1', 'c2'] });
  });

  it('already-paid → redirects to /error with alreadyPaid=true and does not create a purchase', async () => {
    getUserByRut.mockResolvedValue(ok({ id: 'u3' }));
    getUserPurchases.mockResolvedValue(ok([{ id: 'p3', isPaid: true }]));
    render(<FormClient />);
    fillValidForm();
    fireEvent.click(screen.getByText('Inscribir y pagar'));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(push.mock.calls[0][0]).toContain('alreadyPaid=true');
    expect(push.mock.calls[0][0]).toContain('p3');
    expect(createPurchase).not.toHaveBeenCalled();
  });

  it('free order (no webPayResponse) → router.push to /confirmation with purchase id', async () => {
    getUserByRut.mockResolvedValue(ok({ id: 'u4' }));
    getUserPurchases.mockResolvedValue(ok([]));
    createPurchase.mockResolvedValue(ok({ purchase: { id: 'p4' } }));
    render(<FormClient />);
    fillValidForm();
    fireEvent.click(screen.getByText('Inscribir y pagar'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/confirmation/?purchaseId=p4'));
    expect(HTMLFormElement.prototype.submit).not.toHaveBeenCalled();
  });

  it('duplicate email (createUser → 409 on email) → alerts and stops', async () => {
    getUserByRut.mockResolvedValue(fail('User not found', 404));
    createUser.mockResolvedValue(fail('Email already registered', 409, 'email'));
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    render(<FormClient />);
    fillValidForm();
    fireEvent.click(screen.getByText('Inscribir y pagar'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(createPurchase).not.toHaveBeenCalled();
  });
});
