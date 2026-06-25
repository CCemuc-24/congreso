import React from 'react';
import { SectionHeading } from '@/components/luz/SectionHeading';

const schedule = [
  { date: 'Sábado 31 de agosto', event: '1° Jornada presencial CCEM UC 2024' },
  {
    date: 'Lun 02 — Mié 04 de septiembre',
    event: 'Módulo Cirugía Digestiva y Coloproctología\nMódulo Cirugía de Trauma y Urología',
  },
  { date: 'Sábado 07 de septiembre', event: '2° Jornada presencial CCEM UC 2024' },
  {
    date: 'Lun 09 — Mié 11 de septiembre',
    event: 'Módulo Cirugía Plástica y Oncológica\nMódulo Cirugía de Tórax, Cardíaca y Vascular',
  },
  { date: 'Viernes 13 de septiembre', event: 'Competencia Científica CCEM UC' },
  { date: 'Sábado 14 de septiembre', event: '3° Jornada presencial CCEM UC 2024' },
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
