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
      confirmed: true, courses: [], user: null, isMailSent: true, resendEmail,
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

  it('shows the confirming message while not confirmed', () => {
    useConfirmation.mockReturnValue({
      confirmed: false, courses: [], user: null, isMailSent: false, resendEmail: vi.fn(),
    });
    render(<OrderConfirmation />);
    expect(screen.getByText('Confirmando tu compra...')).toBeTruthy();
  });

  it('"Reenviar correo" button calls resendEmail', () => {
    const resendEmail = vi.fn().mockResolvedValue(undefined);
    useConfirmation.mockReturnValue({
      confirmed: true, courses: [], user: null, isMailSent: true, resendEmail,
    });
    render(<OrderConfirmation />);
    fireEvent.click(screen.getByText('Reenviar correo'));
    expect(resendEmail).toHaveBeenCalledTimes(1);
  });
});
