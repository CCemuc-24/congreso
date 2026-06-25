import React from 'react';
import Header from '@/components/header';
import InfoCard from '@/components/InfoCard';
import { SectionHeading } from '@/components/luz/SectionHeading';

const ReferencesPage = () => {
  return (
    <div>
      <Header />
      <div className="mx-auto max-w-5xl px-6 py-16">
        <SectionHeading eyebrow="Tu participación" title="Certificados y libros" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCard text="Certificados de asistencia" />
          <InfoCard text="Certificados de aprobación" />
          <InfoCard text="Certificados de presentación" />
          <InfoCard text="Libro de competencia científica" />
        </div>
      </div>
    </div>
  );
};

export default ReferencesPage;
