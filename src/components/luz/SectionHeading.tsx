import { cn } from '@/lib/utils';
import { IncisionDivider } from './IncisionDivider';

export function SectionHeading({
  eyebrow,
  title,
  align = 'center',
  className,
}: {
  eyebrow?: string;
  title: string;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div
      className={cn('mb-10 flex flex-col', align === 'center' && 'items-center text-center', className)}
    >
      {eyebrow && (
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      )}
      <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
        {title}
      </h2>
      <IncisionDivider align={align} className="mt-5" />
    </div>
  );
}
