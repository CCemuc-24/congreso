import React from 'react';
import { SectionHeading } from '@/components/luz/SectionHeading';

const schedule = [
  {
    date: 'Sáb 26/09 · 03/10 · 17/10 · 24/10',
    event: 'Módulo General presencial\n«Cirugía en pacientes complejos»',
  },
  {
    date: 'Mié 23/09 · 30/09 · 14/10 · 21/10',
    event: 'Cirugía Digestiva y Coloproctología · módulo online',
  },
  {
    date: 'Jue 24/09 · 01/10 · 08/10 · 15/10',
    event: 'Cirugía Vascular · módulo online',
  },
  {
    date: 'Vie 25/09 · 02/10 · 09/10 · 16/10 · 23/10',
    event: 'Ginecología y Obstetricia · módulo online',
  },
  { date: 'Sábado 24/10', event: 'Workshops presenciales' },
  {
    date: 'Sáb 03/10 y 24/10',
    event: 'Competencia Científica · presentación de trabajos y finalistas',
  },
];

const DatesSection: React.FC = () => {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <SectionHeading eyebrow="Calendario" title="Fechas" />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {schedule.map((item, index) => (
          <div
            key={index}
            className="grid gap-2 border-b border-border px-6 py-5 last:border-b-0 md:grid-cols-[0.9fr_1.1fr] md:items-center"
          >
            <span className="font-mono text-sm uppercase tracking-[0.08em] text-primary">{item.date}</span>
            <span className="whitespace-pre-line font-display font-medium text-foreground">{item.event}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default DatesSection;
