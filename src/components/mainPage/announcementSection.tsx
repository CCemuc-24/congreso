import React from 'react';
import Image from 'next/image';
import Foto1 from '@/components/images/mainPage/anuncio-informacion-general.png';
import Foto2 from '@/components/images/mainPage/anuncio-competencia-cientifica.jpeg';
import { SectionHeading } from '@/components/luz/SectionHeading';

const announcements = [
  {
    id: 1,
    title: 'Bienvenidos al II° CCEM UC',
    date: '01/07/2026',
    description:
      '¡Bienvenidos al Segundo Congreso de Cirugía UC para Estudiantes de Medicina! Nos complace darles la bienvenida a este evento único, donde la innovación y el aprendizaje se unen para ofrecer una experiencia enriquecedora y transformadora. Durante este congreso, tendrán la oportunidad de interactuar con destacados profesionales de la cirugía, participar en talleres prácticos, y explorar los últimos avances tecnológicos que están revolucionando el campo quirúrgico.',
    image: Foto1,
  },
  {
    id: 2,
    title: 'Ya están abiertas las inscripciones para la competencia científica',
    date: '01/07/2026',
    description: 'Toda la información está disponible en las bases que puedes encontrar aquí.',
    image: Foto2,
  },
];

const AnnouncementSection: React.FC = () => {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <SectionHeading eyebrow="Novedades" title="Anuncios" />
      <div className="flex flex-col gap-6">
        {announcements.map((a) => (
          <article
            key={a.id}
            className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 lg:flex-row lg:items-center"
          >
            <Image
              src={a.image}
              alt={a.title}
              width={300}
              height={300}
              className="h-48 w-full rounded-lg object-cover lg:h-40 lg:w-56"
            />
            <div className="flex-1">
              <p className="mb-1 font-mono text-xs uppercase tracking-[0.14em] text-primary">{a.date}</p>
              <h3 className="font-display text-xl font-semibold text-foreground">{a.title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{a.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

export default AnnouncementSection;
