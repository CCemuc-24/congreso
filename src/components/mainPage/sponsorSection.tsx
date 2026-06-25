import React from 'react';
import Image from 'next/image';
import sponsor1 from '@/components/images/mainPage/sponsors/logo_auspiciador_1.png';
import sponsor3 from '@/components/images/mainPage/sponsors/logo_auspiciador_3.jpeg';
import { SectionHeading } from '@/components/luz/SectionHeading';

const sponsors = [
  { name: 'Pontificia Universidad Católica de Chile', image: sponsor1 },
  { name: 'Sociedad de Cirujanos de Chile', image: sponsor3 },
];

const SponsorSection: React.FC = () => {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <SectionHeading eyebrow="Con el respaldo de" title="Patrocinadores y auspiciadores" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {sponsors.map((sponsor, index) => (
          <div
            key={index}
            className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center"
          >
            <Image src={sponsor.image} alt={sponsor.name} width={120} height={120} className="h-24 w-24 object-contain" />
            <p className="text-muted-foreground">{sponsor.name}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default SponsorSection;
