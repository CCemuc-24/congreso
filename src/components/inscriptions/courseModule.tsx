import React from 'react';
import Image from 'next/image';
import { Check, Users } from 'lucide-react';
import courseImagesDictionary from '@/components/images/images';
import { cn } from '@/lib/utils';
import type { EventsCardProps } from './types';

const CourseModule: React.FC<EventsCardProps> = ({ title, module, features, buttonText, actionOnClick, clicked }) => {
  return (
    <div
      className={cn(
        'flex flex-col gap-6 rounded-2xl border bg-card p-5 lg:flex-row',
        clicked ? 'border-primary ring-2 ring-primary' : 'border-border',
      )}
    >
      <Image
        src={courseImagesDictionary[module]}
        alt=""
        width={300}
        height={300}
        className="h-48 w-full flex-none rounded-2xl object-cover lg:h-auto lg:w-1/4"
      />
      <div className="flex-1">
        <h3 className="font-display text-2xl font-semibold uppercase tracking-tight text-foreground md:text-3xl">
          {title}
        </h3>
        <ul className="mt-3 space-y-1 text-muted-foreground">
          {Object.entries(features).map(([key, value]) => (
            <li key={key}>
              <b className="text-foreground">{key}:</b> {value}
            </li>
          ))}
        </ul>
        {!clicked ? (
          <button
            type="button"
            onClick={actionOnClick}
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-primary px-4 py-2.5 font-medium text-primary transition-colors hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <Users className="h-4 w-4" />
            {buttonText}
          </button>
        ) : (
          <button
            type="button"
            onClick={actionOnClick}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <Check className="h-4 w-4" />
            Seleccionado
          </button>
        )}
      </div>
    </div>
  );
};

export default CourseModule;
