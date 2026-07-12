import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getCourseImage } from '@/components/images/images';

export interface ResponsiveCardProps {
  title: string;
  extraInfo: string;
  topics: string[];
}

const ResponsiveCard: React.FC<ResponsiveCardProps> = ({ title, extraInfo, topics }) => {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <Image
        src={getCourseImage(title)}
        alt=""
        width={500}
        height={500}
        className="h-44 w-full object-cover"
      />
      <div className="flex flex-1 flex-col p-6">
        <h5 className="font-display text-xl font-semibold tracking-tight text-foreground">{title}</h5>
        {extraInfo && <p className="mt-1 font-mono text-sm text-primary">{extraInfo}</p>}
        <p className="mt-4 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Temas de las clases
        </p>
        <ul className="mt-2 flex-1 list-inside list-disc space-y-1 text-sm text-muted-foreground">
          {topics.map((topic, index) => (
            <li key={index}>{topic}</li>
          ))}
        </ul>
        <Link
          href="/pricing"
          className="mt-5 inline-flex items-center gap-2 self-start rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-700"
        >
          ¿Te gusta? ¡Inscríbete!
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
};

export default ResponsiveCard;
