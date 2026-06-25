import { cn } from '@/lib/utils';

export function IncisionDivider({
  align = 'left',
  className,
}: {
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div
      className={cn('luz-incision', align === 'center' && 'luz-incision--center', className)}
      aria-hidden="true"
    >
      <span className="luz-incision-line" />
      <span className="luz-incision-tick" />
    </div>
  );
}
