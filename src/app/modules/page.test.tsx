import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/header', () => ({ default: () => <div>header</div> }));

vi.mock('@/components/modulePage/moduleInfo', () => ({
  default: ({ title, extraInfo }: { title: string; extraInfo: string }) => (
    <div data-testid="card">{`${title}|${extraInfo}`}</div>
  ),
}));

const getCourses = vi.fn();
vi.mock('@/actions/courses', () => ({ getCourses: () => getCourses() }));

import ModulePage from './page';

describe('/modules', () => {
  it('renders a card per non-workshop, non-week-4 course', async () => {
    getCourses.mockResolvedValue({
      ok: true,
      data: [
        { id: 'a', title: 'Cirugía General', type: 'core', week: 1, module: 1, topics: ['t1'], features: { Lugar: 'Aula 1' } },
        { id: 'b', title: 'Taller X', type: 'workshop', week: 2, module: 2, topics: [], features: { Lugar: 'Sala 2' } },
        { id: 'c', title: 'Competencia', type: 'elective', week: 4, module: 3, topics: [], features: { Lugar: 'Aula 3' } },
        { id: 'd', title: 'Cirugía Plástica', type: 'elective', week: 2, module: 5, topics: ['t2', 't3'], features: { Lugar: 'Online' } },
      ],
    });

    render(await ModulePage());

    const cards = screen.getAllByTestId('card');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Cirugía General|Aula 1')).toBeInTheDocument();
    expect(screen.getByText('Cirugía Plástica|Online')).toBeInTheDocument();
    expect(screen.queryByText(/Taller X/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Competencia/)).not.toBeInTheDocument();
  });

  it('renders no cards when getCourses fails', async () => {
    getCourses.mockResolvedValue({ ok: false, error: 'boom', status: 500 });
    render(await ModulePage());
    expect(screen.queryAllByTestId('card')).toHaveLength(0);
  });
});
