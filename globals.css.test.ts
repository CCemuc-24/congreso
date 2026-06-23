import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, 'src/app/globals.css'), 'utf-8');

describe('globals.css (Tailwind v4)', () => {
  it('defines primary-500', () => {
    expect(css).toContain('--color-primary-500: #3b82f6');
  });

  it('defines primary-950', () => {
    expect(css).toContain('--color-primary-950: #172554');
  });

  it('imports tailwindcss (v4 directive)', () => {
    expect(css).toContain('@import "tailwindcss"');
  });

  it('imports League Spartan font', () => {
    expect(css).toContain('League+Spartan');
  });

  it('defines .font-league-spartan class', () => {
    expect(css).toContain('.font-league-spartan');
  });
});
