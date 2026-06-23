import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Header from './header';
import sections from '@/utils/sections.json';

vi.mock('next/font/google', () => ({
  League_Spartan: () => ({ className: 'league-spartan' }),
}));

vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: { src: unknown; alt: string }) => {
    const src =
      typeof props.src === 'string' ? props.src : (props.src as { src: string }).src;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img src={src} alt={props.alt} />;
  },
}));

describe('Header', () => {
  it('renders the brand and the registration CTA', () => {
    render(<Header />);
    expect(screen.getByText('CCEM UC')).toBeInTheDocument();
    expect(
      screen.getByText('CONGRESO DE CIRUGÍA UC PARA ESTUDIANTES DE MEDICINA'),
    ).toBeInTheDocument();
    expect(screen.getByText('SÉ PARTE DEL CONGRESO')).toBeInTheDocument();
  });

  it('renders one link per section from sections.json with its href', () => {
    render(<Header />);
    for (const section of sections.sections) {
      const link = screen.getByRole('link', { name: section.title });
      expect(link).toHaveAttribute('href', section.link);
    }
  });
});
