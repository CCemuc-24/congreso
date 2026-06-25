import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ok } from '@/domain/result';

const getCourses = vi.fn();
vi.mock('@/actions/courses', () => ({ getCourses: () => getCourses() }));

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/components/header', () => ({ default: () => <div data-testid="header" /> }));

import PricingClient from './PricingClient';

// 2026 bundle catalog: 1 general (core) + 3 sync modules (elective, week 1) + 3 workshops (week 3).
const courses = [
  { id: 'g1', title: 'General', module: 1, type: 'core', price: 0, capacity: 1000, features: {}, week: 0, topics: [] },
  { id: 'm1', title: 'Módulo A', module: 2, type: 'elective', price: 25900, capacity: 1000, features: {}, week: 1, topics: [] },
  { id: 'm2', title: 'Módulo B', module: 4, type: 'elective', price: 25900, capacity: 1000, features: {}, week: 1, topics: [] },
  { id: 'm3', title: 'Módulo C', module: 5, type: 'elective', price: 25900, capacity: 1000, features: {}, week: 1, topics: [] },
  { id: 'w1', title: 'Workshop A', module: 1, type: 'workshop', price: 0, capacity: 20, features: {}, week: 3, topics: [] },
  { id: 'w2', title: 'Workshop B', module: 2, type: 'workshop', price: 0, capacity: 20, features: {}, week: 3, topics: [] },
  { id: 'w3', title: 'Workshop C', module: 3, type: 'workshop', price: 0, capacity: 20, features: {}, week: 3, topics: [] },
];

describe('PricingClient', () => {
  beforeEach(() => {
    getCourses.mockReset();
    push.mockReset();
    getCourses.mockResolvedValue(ok(courses));
  });

  it('shows "No disponible" when registration is closed and does not fetch courses', () => {
    render(<PricingClient registrationOpen={false} />);
    expect(screen.getByText('No disponible')).toBeInTheDocument();
    expect(getCourses).not.toHaveBeenCalled();
  });

  it('fetches courses and shows the bundle selection UI when registration is open', async () => {
    render(<PricingClient registrationOpen={true} />);
    await waitFor(() => expect(screen.getByText('INSCRIPCIONES')).toBeInTheDocument());
    expect(getCourses).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Pase Congreso CCEM UC')).toBeInTheDocument();
    expect(screen.getByText('Elige tu módulo sincrónico (1 de 3)')).toBeInTheDocument();
  });

  it('builds /form with the chosen module + 2 workshops on confirm', async () => {
    render(<PricingClient registrationOpen={true} />);
    await waitFor(() => expect(screen.getByText('INSCRIPCIONES')).toBeInTheDocument());

    // pick 1 of 3 modules
    fireEvent.click(screen.getAllByText('Seleccionar módulo')[0]);
    // pick 2 of 3 workshops
    const workshopButtons = screen.getAllByText('20 cupos disponibles');
    fireEvent.click(workshopButtons[0]);
    fireEvent.click(workshopButtons[1]);

    fireEvent.click(screen.getByText('Confirmar'));
    expect(push).toHaveBeenCalledWith('/form?w1id=m1&w2id=w1&w3id=w2');
  });

  it('caps workshop selection at 2 (a 3rd click is ignored)', async () => {
    render(<PricingClient registrationOpen={true} />);
    await waitFor(() => expect(screen.getByText('INSCRIPCIONES')).toBeInTheDocument());

    fireEvent.click(screen.getAllByText('Seleccionar módulo')[0]);
    const workshopButtons = screen.getAllByText('20 cupos disponibles');
    fireEvent.click(workshopButtons[0]);
    fireEvent.click(workshopButtons[1]);
    // 3rd workshop is still available (cap reached) and clicking it does not select
    fireEvent.click(workshopButtons[2]);

    fireEvent.click(screen.getByText('Confirmar'));
    expect(push).toHaveBeenCalledWith('/form?w1id=m1&w2id=w1&w3id=w2');
  });

  it('does not navigate until a module and 2 workshops are chosen', async () => {
    render(<PricingClient registrationOpen={true} />);
    await waitFor(() => expect(screen.getByText('INSCRIPCIONES')).toBeInTheDocument());

    fireEvent.click(screen.getAllByText('Seleccionar módulo')[0]);
    fireEvent.click(screen.getAllByText('20 cupos disponibles')[0]); // only 1 workshop

    fireEvent.click(screen.getByText('Confirmar'));
    expect(push).not.toHaveBeenCalled();
  });
});
