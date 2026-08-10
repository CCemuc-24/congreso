import { describe, it, expect } from 'vitest';
import { getCourseImage } from './images';

describe('getCourseImage', () => {
  const cases: [string, string][] = [
    ['Módulo: Cirugía Vascular', 'cirugia-vascular'],
    ['Módulo: Cirugía Digestiva y Coloproctología', 'digestiva-coloproctologia'],
    ['Módulo: Ginecología y Obstetricia', 'ginecologia-obstetricia'],
    ['Workshop: Tacto rectal', 'tacto-rectal'],
    ['Workshop: Examen ginecológico', 'examen-ginecologico'],
    ['Workshop: E-FAST', 'efast'],
    ['Workshop: ECG en contexto quirúrgico', 'ecg'],
    ['Workshop: Intubación', 'intubacion'],
    ['Workshop: Suturas', 'suturas'],
    ['Workshop: RCP avanzado', 'rcp-avanzado'],
    ['Workshop: Curaciones', 'curaciones'],
    ['Workshop: Interpretación de imágenes en contexto quirúrgico', 'interpretacion-imagenes'],
    ['Workshop: Accesos venosos', 'accesos-venosos'],
  ];

  it.each(cases)('matches "%s" to its %s image', (title, expectedSlug) => {
    const image = getCourseImage(title);
    const src = typeof image === 'string' ? image : image.src;
    expect(src).toContain(expectedSlug);
  });

  it('falls back to the general image for an unmatched title', () => {
    const image = getCourseImage('Módulo General: Cirugía en pacientes complejos');
    const src = typeof image === 'string' ? image : image.src;
    expect(src).toContain('general-cirugia-pacientes-complejos');
  });
});
