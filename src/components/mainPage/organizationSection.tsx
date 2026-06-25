import React from 'react';
import Image from 'next/image';
import sponsor1 from '@/components/images/mainPage/sponsors/logo_auspiciador_7.png';
import { SectionHeading } from '@/components/luz/SectionHeading';

const InstagramIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const OrganizationSection: React.FC = () => {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-20 pt-4">
      <SectionHeading eyebrow="Quién lo organiza" title="Organización" />
      <div className="flex flex-col items-center gap-4 text-center">
        <Image src={sponsor1} alt="Organización CCEM UC" width={120} height={120} className="h-24 w-24 object-contain" />
        <a
          href="https://www.instagram.com/ccem.uc"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-primary transition-colors hover:text-primary-700"
        >
          <InstagramIcon className="h-4 w-4" />
          ¡Síguenos en Instagram @ccem.uc!
        </a>
      </div>
    </section>
  );
};

export default OrganizationSection;
