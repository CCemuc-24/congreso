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
  { id: 'm1', title: 'Módulo A', module: 2, type: 'elective', price: 23000, capacity: 1000, features: {}, week: 1, topics: [] },
  { id: 'm2', title: 'Módulo B', module: 4, type: 'elective', price: 23000, capacity: 1000, features: {}, week: 1, topics: [] },
  { id: 'm3', title: 'Módulo C', module: 5, type: 'elective', price: 23000, capacity: 1000, features: {}, week: 1, topics: [] },
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
    // pick 2 of 3 workshops — the list of pickable cards shrinks with each click
    fireEvent.click(screen.getAllByText('Elegir este workshop')[0]);
    fireEvent.click(screen.getAllByText('Elegir este workshop')[0]);

    fireEvent.click(screen.getByText('Confirmar'));
    expect(push).toHaveBeenCalledWith('/form?w1id=m1&w2id=w1&w3id=w2');
  });

  it('locks the remaining workshops once 2 are chosen, and a click on them is ignored', async () => {
    render(<PricingClient registrationOpen={true} />);
    await waitFor(() => expect(screen.getByText('INSCRIPCIONES')).toBeInTheDocument());

    fireEvent.click(screen.getAllByText('Seleccionar módulo')[0]);
    fireEvent.click(screen.getAllByText('Elegir este workshop')[0]);
    fireEvent.click(screen.getAllByText('Elegir este workshop')[0]);

    // the 3rd workshop is visibly locked instead of looking pickable
    const locked = screen.getByText('Ya elegiste 2 — quita uno para cambiar');
    expect(locked.closest('button')).toBeDisabled();
    expect(screen.queryByText('Elegir este workshop')).not.toBeInTheDocument();

    fireEvent.click(locked);
    fireEvent.click(screen.getByText('Confirmar'));
    expect(push).toHaveBeenCalledWith('/form?w1id=m1&w2id=w1&w3id=w2');
  });

  it('labels the unchosen modules as a replacement once one is picked', async () => {
    render(<PricingClient registrationOpen={true} />);
    await waitFor(() => expect(screen.getByText('INSCRIPCIONES')).toBeInTheDocument());

    expect(screen.getAllByText('Seleccionar módulo')).toHaveLength(3);
    fireEvent.click(screen.getAllByText('Seleccionar módulo')[0]);

    expect(screen.getAllByText('Cambiar a este módulo')).toHaveLength(2);
    expect(screen.getByText('Tu elección')).toBeInTheDocument();
  });

  it('clears the module when its selected card is clicked again', async () => {
    render(<PricingClient registrationOpen={true} />);
    await waitFor(() => expect(screen.getByText('INSCRIPCIONES')).toBeInTheDocument());

    fireEvent.click(screen.getAllByText('Seleccionar módulo')[0]);
    fireEvent.click(screen.getByText('Seleccionado — quitar'));

    expect(screen.getAllByText('Seleccionar módulo')).toHaveLength(3);
    expect(screen.queryByText('Cambiar a este módulo')).not.toBeInTheDocument();
  });

  it('does not navigate until a module and 2 workshops are chosen, and says what is missing', async () => {
    render(<PricingClient registrationOpen={true} />);
    await waitFor(() => expect(screen.getByText('INSCRIPCIONES')).toBeInTheDocument());

    fireEvent.click(screen.getAllByText('Seleccionar módulo')[0]);
    fireEvent.click(screen.getAllByText('Elegir este workshop')[0]); // only 1 workshop

    expect(screen.getByText('Para continuar: elige 1 workshop más.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Confirmar'));
    expect(push).not.toHaveBeenCalled();
  });
});
