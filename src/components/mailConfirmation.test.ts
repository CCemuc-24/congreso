import { describe, it, expect } from 'vitest';
import { buildConfirmationEmailHtml } from './mailConfirmation';

describe('buildConfirmationEmailHtml', () => {
  const courses = [
    { title: 'Anatomía', type: 'core' as const, week: 0, price: 10000 },
    { title: 'Trauma', type: 'core' as const, week: 0, price: 0 },
    { title: 'Cirugía Semana 1', type: 'elective' as const, week: 1, price: 15000 },
    { title: 'Taller Suturas', type: 'workshop' as const, week: 2, price: 5000 },
    { title: 'Taller ECG', type: 'workshop' as const, week: 3, price: 0 },
  ];
  const user = {
    names: 'Rodrigo',
    lastNames: 'Ogalde',
    rut: '10134671-4',
    email: 'buyer@uc.cl',
  };

  it('includes the order number (purchase id)', () => {
    const html = buildConfirmationEmailHtml({ id: 'abc-123', courses });
    expect(html).toContain('Tu número de orden es');
    expect(html).toContain('abc-123');
  });

  // Same grouping as BuyInfo on /confirmation, so the email and the page agree.
  it('labels core courses "Módulo general" and the elective "Módulo sincrónico"', () => {
    const html = buildConfirmationEmailHtml({ id: 'x', courses });
    expect(html).toContain('Módulo general');
    expect(html).toContain('Anatomía');
    expect(html).toContain('Trauma');
    expect(html).toContain('Módulo sincrónico');
    expect(html).toContain('Cirugía Semana 1');
  });

  it('numbers the workshops', () => {
    const html = buildConfirmationEmailHtml({ id: 'x', courses });
    expect(html).toContain('Workshop 1');
    expect(html).toContain('Taller Suturas');
    expect(html).toContain('Workshop 2');
    expect(html).toContain('Taller ECG');
  });

  it('sums the total price', () => {
    const html = buildConfirmationEmailHtml({ id: 'x', courses });
    // 10000 + 0 + 15000 + 5000 + 0 = 30000
    expect(html).toContain('$30000');
  });

  it('renders the buyer identity rows when the user is supplied', () => {
    const html = buildConfirmationEmailHtml({ id: 'x', courses, user });
    expect(html).toContain('Rodrigo Ogalde');
    expect(html).toContain('10134671-4');
    expect(html).toContain('buyer@uc.cl');
  });

  it('omits the identity rows when there is no user', () => {
    const html = buildConfirmationEmailHtml({ id: 'x', courses });
    expect(html).not.toContain('>RUT<');
    expect(html).not.toContain('>Nombre<');
  });

  it('escapes user-supplied text instead of injecting it as markup', () => {
    const html = buildConfirmationEmailHtml({
      id: 'x',
      courses: [{ title: '<script>alert(1)</script>', type: 'core', week: 0, price: 0 }],
      user: { ...user, names: 'A & B' },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('A &amp; B');
  });

  it('renders a full HTML document with the CCEMUC footer', () => {
    const html = buildConfirmationEmailHtml({ id: 'x', courses: [] });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Confirmación de Orden');
    expect(html).toContain('Tu inscripción');
    expect(html).toContain('Has recibido este correo por tu reciente compra');
    expect(html).toContain('https://ccem.cl/');
    expect(html).toContain('contacto@ccem.cl');
  });

  // Inline styles only: <style> blocks and class hooks are stripped by Gmail.
  it('carries no <style> block or class attributes', () => {
    const html = buildConfirmationEmailHtml({ id: 'x', courses, user });
    expect(html).not.toContain('<style');
    expect(html).not.toContain('class=');
  });
});
