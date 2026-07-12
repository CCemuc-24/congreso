import React from 'react';
import Header from '@/components/header';
import InfoCard from '@/components/InfoCard';
import { SectionHeading } from '@/components/luz/SectionHeading';

const generalSaturdays = ['Sábado 26/09', 'Sábado 03/10', 'Sábado 17/10', 'Sábado 24/10'];

const modules = [
  {
    title: 'Ginecología y Obstetricia',
    dates: ['Vie 25/09', '02/10', '09/10', '16/10', '23/10'],
  },
  {
    title: 'Cirugía Vascular',
    dates: ['Jue 24/09', '01/10', '08/10', '15/10'],
  },
  {
    title: 'Cirugía Digestiva y Coloproctología',
    dates: ['Mié 23/09', '30/09', '14/10', '21/10'],
  },
];

const SchedulePage = () => {
  return (
    <div>
      <Header />
      <div className="mx-auto max-w-5xl px-6 py-16">
        <SectionHeading eyebrow="Organiza tu congreso" title="Cronogramas" />

        <div className="mb-16">
          <h3 className="mb-6 font-display text-xl font-semibold text-foreground">
            Módulo General presencial · «Cirugía en pacientes complejos»
          </h3>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {generalSaturdays.map((date) => (
              <InfoCard key={date} text={date} />
            ))}
          </div>
        </div>

        <div className="space-y-12">
          {modules.map((mod) => (
            <div key={mod.title}>
              <h3 className="mb-6 font-display text-xl font-semibold text-foreground">{mod.title} · módulo online</h3>
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                {mod.dates.map((date) => (
                  <div
                    key={date}
                    className="border-b border-border px-6 py-4 font-mono text-sm uppercase tracking-[0.08em] text-primary last:border-b-0"
                  >
                    {date}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SchedulePage;
