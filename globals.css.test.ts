import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, 'src/app/globals.css'), 'utf-8');

describe('globals.css (Tailwind v4)', () => {
  it('defines primary-500 (Luz surgical-teal ramp)', () => {
    expect(css).toContain('--color-primary-500: #1c807a');
  });

  it('defines primary-950 (Luz surgical-teal ramp)', () => {
    expect(css).toContain('--color-primary-950: #052424');
  });

  it('imports tailwindcss (v4 directive)', () => {
    expect(css).toContain("@import 'tailwindcss'");
  });

  it('defines .font-league-spartan class (legacy alias → Space Grotesk)', () => {
    expect(css).toContain('.font-league-spartan');
  });

  it('defines Luz background token', () => {
    expect(css).toContain('--background: #f4f7f6');
  });
});
