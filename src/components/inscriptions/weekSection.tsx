import React from 'react';
import CourseModule from '@/components/inscriptions/courseModule';
import type { WeekSectionProps } from './types';

const WeekSection: React.FC<WeekSectionProps> = ({
  title,
  subtitle,
  hint,
  courses,
  handleSelectCourse,
  weekNumber,
  selectedWeek,
  selectedIds,
  limit,
}) => {
  const multiSelect = selectedIds != null;
  const atLimit = selectedIds != null && limit != null && selectedIds.length >= limit;

  const isClicked = (id: string): boolean =>
    selectedIds ? selectedIds.includes(id) : selectedWeek?.id === id;

  return (
    <div className="container mx-auto p-4">
      <div className="mb-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-3xl font-semibold text-primary md:text-4xl">{title}</h1>
          <h2 className="text-xl text-muted-foreground md:text-2xl">{subtitle}</h2>
        </div>
        {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="grid gap-6">
        {courses
          .filter((event) => event.week === weekNumber)
          .map((event) => {
            const selected = isClicked(event.id);
            const workshop = event.type === 'workshop';
            // Single-select: another module holds the slot, so this card's action
            // is a replacement — say so instead of letting the swap happen silently.
            const superseded = !multiSelect && selectedWeek != null && !selected;
            const locked = atLimit && !selected;

            return (
              <CourseModule
                key={event.id}
                id={event.id}
                title={event.title}
                features={(event.features ?? {}) as Record<string, string>}
                meta={workshop ? `${event.capacity} cupos disponibles` : undefined}
                badge={workshop ? 'Elegido' : 'Tu elección'}
                selectedText="Seleccionado — quitar"
                buttonText={
                  locked
                    ? `Ya elegiste ${limit} — quita uno para cambiar`
                    : superseded
                      ? 'Cambiar a este módulo'
                      : workshop
                        ? 'Elegir este workshop'
                        : 'Seleccionar módulo'
                }
                actionOnClick={() => handleSelectCourse(event)}
                clicked={selected}
                dimmed={superseded || locked}
                locked={locked}
              />
            );
          })}
      </div>
    </div>
  );
};

export default WeekSection;
