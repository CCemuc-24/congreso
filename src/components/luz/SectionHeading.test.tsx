import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionHeading } from './SectionHeading';

describe('SectionHeading', () => {
  it('renders the title as a heading and the eyebrow when given', () => {
    render(<SectionHeading eyebrow="ANUNCIOS" title="Lo último" />);
    expect(screen.getByRole('heading', { name: 'Lo último' })).toBeInTheDocument();
    expect(screen.getByText('ANUNCIOS')).toBeInTheDocument();
  });

  it('omits the eyebrow when not provided', () => {
    render(<SectionHeading title="Solo título" />);
    expect(screen.getByRole('heading', { name: 'Solo título' })).toBeInTheDocument();
    expect(screen.queryByText('ANUNCIOS')).not.toBeInTheDocument();
  });
});
