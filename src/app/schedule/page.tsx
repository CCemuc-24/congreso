import React from 'react';
import Header from '@/components/header';
import InfoCard from '@/components/InfoCard';
import { SectionHeading } from '@/components/luz/SectionHeading';

const SchedulePage = () => {
  return (
    <div>
      <Header />
      <div className="mx-auto max-w-5xl px-6 py-16">
        <SectionHeading eyebrow="Organiza tu congreso" title="Cronogramas" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCard text="Sábado 31/08" />
          <InfoCard text="Sábado 07/09" />
          <InfoCard text="Sábado 14/09" />
          <InfoCard text="Semana 1" />
          <InfoCard text="Semana 2" />
          <InfoCard text="Semana 3" />
        </div>
      </div>
    </div>
  );
};

export default SchedulePage;
