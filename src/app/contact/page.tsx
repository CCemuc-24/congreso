import React from 'react';
import Header from '@/components/header';
import { Mail } from 'lucide-react';
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

const Contact: React.FC = () => {
  return (
    <div>
      <Header />
      <div className="mx-auto max-w-3xl px-6 py-16">
        <SectionHeading eyebrow="Hablemos" title="Contacto" />
        <div className="flex flex-col items-center gap-4">
          <a
            href="mailto:contacto@ccemuc.cl"
            className="inline-flex items-center gap-2 text-lg text-primary transition-colors hover:text-primary-700"
          >
            <Mail className="h-5 w-5" />
            contacto@ccemuc.cl
          </a>
          <a
            href="https://www.instagram.com/ccem.uc"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-lg text-primary transition-colors hover:text-primary-700"
          >
            <InstagramIcon className="h-5 w-5" />
            Instagram: ccem.uc
          </a>
        </div>
      </div>
    </div>
  );
};

export default Contact;
