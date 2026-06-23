import { describe, it, expect } from 'vitest';
import { buildConfirmationEmailHtml } from './mailConfirmation';

describe('buildConfirmationEmailHtml', () => {
  const courses = [
    { title: 'Anatomía', type: 'core' as const, week: 0, price: 10000 },
    { title: 'Trauma', type: 'core' as const, week: 0, price: 0 },
    { title: 'Cirugía Semana 1', type: 'elective' as const, week: 1, price: 15000 },
    { title: 'Taller Suturas', type: 'workshop' as const, week: 2, price: 5000 },
  ];

  it('includes the confirmation code (purchase id)', () => {
    const html = buildConfirmationEmailHtml({ id: 'abc-123', courses });
    expect(html).toContain('Tu código de confirmación es: abc-123');
  });

  it('lists core courses as numbered "Módulo base" entries', () => {
    const html = buildConfirmationEmailHtml({ id: 'x', courses });
    expect(html).toContain('Módulo base 1');
    expect(html).toContain('Módulo base 2');
    expect(html).toContain('Anatomía');
    expect(html).toContain('Trauma');
  });

  it('lists non-core courses by week and keeps workshop', () => {
    const html = buildConfirmationEmailHtml({ id: 'x', courses });
    expect(html).toContain('Semana 1');
    expect(html).toContain('Cirugía Semana 1');
    expect(html).toContain('Semana 2');
    expect(html).toContain('Taller Suturas');
  });

  it('sums the total price', () => {
    const html = buildConfirmationEmailHtml({ id: 'x', courses });
    // 10000 + 0 + 15000 + 5000 = 30000
    expect(html).toContain('$30000');
  });

  it('renders a full HTML document with the CCEMUC footer', () => {
    const html = buildConfirmationEmailHtml({ id: 'x', courses: [] });
    expect(html).toContain('Confirmante de pago');
    expect(html).toContain('Has recibido este correo por tu reciente compra');
    expect(html).toContain('https://web.ccemuc.cl/');
  });
});
