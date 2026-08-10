import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('purchaseId=p1'),
}));
vi.mock('@/components/header', () => ({ default: () => <div>HEADER</div> }));
vi.mock('@/components/buyInfo', () => ({ default: () => <div>BUYINFO</div> }));

const getPurchaseReceipt = vi.fn();
const resendConfirmation = vi.fn();
vi.mock('@/actions/purchases', () => ({
  getPurchaseReceipt: (...args: unknown[]) => getPurchaseReceipt(...args),
  resendConfirmation: (...args: unknown[]) => resendConfirmation(...args),
}));

const useConfirmation = vi.fn();
vi.mock('@/components/inscriptions/useConfirmation', () => ({
  useConfirmation: (...args: unknown[]) => useConfirmation(...args),
}));

import OrderConfirmation from './page';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OrderConfirmation page', () => {
  it('shows order number when confirmed and renders BuyInfo, driven only by ?purchaseId', () => {
    const resendEmail = vi.fn().mockResolvedValue(undefined);
    useConfirmation.mockReturnValue({
      status: 'confirmed', courses: [], user: null, isMailSent: true, resendEmail,
    });
    render(<OrderConfirmation />);
    expect(screen.getByText('HEADER')).toBeTruthy();
    expect(screen.getByText(/Tu número de orden es/)).toBeTruthy();
    expect(screen.getByText('p1')).toBeTruthy();
    expect(screen.getByText('BUYINFO')).toBeTruthy();
    // The page reads only purchaseId — no token_ws or TBK_* param is consulted.
    expect(useConfirmation).toHaveBeenCalledWith({ purchaseId: 'p1' });
    // No commit-shaped action is called: the receipt was already settled server-side.
    expect(getPurchaseReceipt).not.toHaveBeenCalled();
    expect(resendConfirmation).not.toHaveBeenCalled();
  });

  it('shows the confirming message while loading', () => {
    useConfirmation.mockReturnValue({
      status: 'loading', courses: [], user: null, isMailSent: false, resendEmail: vi.fn(),
    });
    render(<OrderConfirmation />);
    expect(screen.getByText('Confirmando tu compra...')).toBeTruthy();
  });

  it('shows a not-found message instead of spinning forever when the receipt fails to load', () => {
    useConfirmation.mockReturnValue({
      status: 'not_found', courses: [], user: null, isMailSent: false, resendEmail: vi.fn(),
    });
    render(<OrderConfirmation />);
    expect(screen.getByText(/No encontramos esta compra/)).toBeTruthy();
    // Distinct from both the loading and the confirmed copy.
    expect(screen.queryByText('Confirmando tu compra...')).toBeNull();
    expect(screen.queryByText(/Tu número de orden es/)).toBeNull();
  });

  it.each(['not_found', 'loading'])(
    'does not render BuyInfo in the %s state, where it would only say "Cargando..."',
    (status) => {
      // BuyInfo returns a loading message whenever courses is empty, so rendering it
      // unconditionally put "Cargando..." directly under "No encontramos esta compra".
      useConfirmation.mockReturnValue({
        status, courses: [], user: null, isMailSent: false, resendEmail: vi.fn(),
      });
      render(<OrderConfirmation />);
      expect(screen.queryByText('BUYINFO')).toBeNull();
    },
  );

  it.each(['confirmed', 'pending', 'failed'])(
    'renders BuyInfo in the %s state, where the receipt has loaded',
    (status) => {
      useConfirmation.mockReturnValue({
        status, courses: [], user: null, isMailSent: false, resendEmail: vi.fn(),
      });
      render(<OrderConfirmation />);
      expect(screen.getByText('BUYINFO')).toBeTruthy();
    },
  );

  it('shows terminal-failure copy — with no "unos minutos" promise — for a failed payment', () => {
    useConfirmation.mockReturnValue({
      status: 'failed', courses: [], user: null, isMailSent: false, resendEmail: vi.fn(),
    });
    render(<OrderConfirmation />);
    expect(screen.getByText(/El pago de esta compra no se completó/)).toBeTruthy();
    // A rejected/aborted/expired payment will never "reflejarse aquí" in a few minutes.
    expect(screen.queryByText(/puede tardar unos minutos/)).toBeNull();
    expect(screen.queryByText(/aún no ha sido confirmada/)).toBeNull();
    expect(screen.queryByText(/No encontramos esta compra/)).toBeNull();
  });

  it('shows a pending message — distinct from not-found — for a purchase that exists but is not settled', () => {
    useConfirmation.mockReturnValue({
      status: 'pending', courses: [], user: null, isMailSent: false, resendEmail: vi.fn(),
    });
    render(<OrderConfirmation />);
    expect(screen.getByText(/aún no ha sido confirmada/)).toBeTruthy();
    expect(screen.queryByText(/No encontramos esta compra/)).toBeNull();
    expect(screen.queryByText('Confirmando tu compra...')).toBeNull();
  });

  it('"Reenviar correo" button calls resendEmail', () => {
    const resendEmail = vi.fn().mockResolvedValue(undefined);
    useConfirmation.mockReturnValue({
      status: 'confirmed', courses: [], user: null, isMailSent: true, resendEmail,
    });
    render(<OrderConfirmation />);
    fireEvent.click(screen.getByText('Reenviar correo'));
    expect(resendEmail).toHaveBeenCalledTimes(1);
  });
});
