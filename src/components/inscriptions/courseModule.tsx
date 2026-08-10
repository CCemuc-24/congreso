import React from 'react';
import Image from 'next/image';
import { Check, Circle, Lock, Users } from 'lucide-react';
import { getCourseImage } from '@/components/images/images';
import { cn } from '@/lib/utils';
import type { EventsCardProps } from './types';

const CourseModule: React.FC<EventsCardProps> = ({
  title,
  features,
  buttonText,
  selectedText = 'Seleccionado',
  badge,
  meta,
  actionOnClick,
  clicked,
  dimmed,
  locked,
}) => {
  // Locked only applies to cards outside the selection; a chosen card is always
  // clickable so the user can free the slot.
  const isLocked = Boolean(locked) && !clicked;
  const isDimmed = (Boolean(dimmed) || isLocked) && !clicked;

  return (
    <div
      className={cn(
        'flex flex-col gap-6 rounded-2xl border bg-card p-5 transition-all lg:flex-row',
        clicked && 'border-primary ring-2 ring-primary',
        !clicked && isDimmed && 'border-dashed border-input opacity-55 grayscale',
        !clicked && !isDimmed && 'border-border',
      )}
    >
      <Image
        src={getCourseImage(title)}
        alt=""
        width={300}
        height={300}
        className="h-48 w-full flex-none rounded-2xl object-cover lg:h-auto lg:w-1/4"
      />
      <div className="flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <h3 className="font-display text-2xl font-semibold uppercase tracking-tight text-foreground md:text-3xl">
            {title}
          </h3>
          {clicked && badge ? (
            <span className="inline-flex flex-none items-center gap-1.5 rounded-full bg-primary px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-primary-foreground">
              <Check className="h-3.5 w-3.5" />
              {badge}
            </span>
          ) : null}
        </div>
        {meta ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {meta}
          </p>
        ) : null}
        <ul className="mt-3 space-y-1 text-muted-foreground">
          {Object.entries(features).map(([key, value]) => (
            <li key={key}>
              <b className="text-foreground">{key}:</b> {value}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={actionOnClick}
          disabled={isLocked}
          aria-pressed={Boolean(clicked)}
          className={cn(
            'mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-left font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
            clicked && 'bg-primary text-primary-foreground hover:bg-primary-700',
            !clicked &&
              isLocked &&
              'cursor-not-allowed border border-input bg-muted text-muted-foreground',
            !clicked && !isLocked && 'border border-primary text-primary hover:bg-primary/10',
          )}
        >
          {clicked ? (
            <Check className="h-4 w-4 flex-none" />
          ) : isLocked ? (
            <Lock className="h-4 w-4 flex-none" />
          ) : (
            <Circle className="h-4 w-4 flex-none" />
          )}
          {clicked ? selectedText : buttonText}
        </button>
      </div>
    </div>
  );
};

export default CourseModule;
