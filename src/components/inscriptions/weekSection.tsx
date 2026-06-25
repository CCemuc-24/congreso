import React from 'react';
import CourseModule from '@/components/inscriptions/courseModule';
import type { WeekSectionProps } from './types';

const WeekSection: React.FC<WeekSectionProps> = ({
  title,
  subtitle,
  courses,
  handleSelectCourse,
  weekNumber,
  selectedWeek,
  selectedIds,
}) => {
  const isClicked = (id: string): boolean =>
    selectedIds ? selectedIds.includes(id) : selectedWeek?.id === id;

  return (
    <div className="container mx-auto p-4">
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="font-display text-3xl font-semibold text-primary md:text-4xl">{title}</h1>
        <h2 className="text-xl text-muted-foreground md:text-2xl">{subtitle}</h2>
      </div>
      <div className="grid gap-6">
        {courses
          .filter((event) => event.week === weekNumber)
          .map((event) => (
            <CourseModule
              key={event.id}
              id={event.id}
              title={event.title}
              module={event.module}
              features={(event.features ?? {}) as Record<string, string>}
              buttonText={
                event.type === 'workshop'
                  ? `${event.capacity} cupos disponibles`
                  : 'Seleccionar módulo'
              }
              actionOnClick={() => handleSelectCourse(event)}
              clicked={isClicked(event.id)}
            />
          ))}
      </div>
    </div>
  );
};

export default WeekSection;
