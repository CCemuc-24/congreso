'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/header';
import WeekSection from '@/components/inscriptions/weekSection';
import { getCourses } from '@/actions/courses';
import type { Course } from '@/actions/courses';
import { SectionHeading } from '@/components/luz/SectionHeading';
import { cn } from '@/lib/utils';

const PricingClient: React.FC<{ registrationOpen: boolean }> = ({ registrationOpen }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseSelectedWeek1, setCourseSelectedWeek1] = useState<Course | null>(null);
  const [courseSelectedWeek2, setCourseSelectedWeek2] = useState<Course | null>(null);
  const [selectedWorkshop, setSelectedWorkshop] = useState<Course | null>(null);
  const [selectedPass, setSelectedPass] = useState(0);

  const router = useRouter();

  useEffect(() => {
    if (!registrationOpen) return;
    (async () => {
      const res = await getCourses();
      if (res.ok) setCourses(res.data);
    })();
  }, [registrationOpen]);

  const handleSelectCourse = (course: Course) => {
    if (course.week === 1) setCourseSelectedWeek1(course);
    else if (course.week === 2) setCourseSelectedWeek2(course);
    else if (course.type === 'workshop') setSelectedWorkshop(course);
  };

  const handleSelectPass = (buttonId: number) => {
    setSelectedPass(buttonId);
    if (selectedWorkshop != null) setSelectedWorkshop(null);
  };

  const handleConfirmSelection = () => {
    let url = `/form?w1id=${courseSelectedWeek1?.id}&w2id=${courseSelectedWeek2?.id}`;
    if (selectedPass === 2 || selectedWorkshop != null) {
      url += `&w3id=${selectedWorkshop?.id}`;
    }
    router.push(url);
  };

  const isAllCoursesSelected = () =>
    courseSelectedWeek1 != null &&
    courseSelectedWeek2 != null &&
    (selectedPass === 1 || (selectedPass === 2 && selectedWorkshop != null));

  if (!registrationOpen) {
    return (
      <div>
        <Header />
        <section className="bg-background">
          <div className="container flex items-center min-h-screen px-6 py-12 mx-auto">
            <div>
              <h1 className="mt-3 text-2xl font-display font-semibold text-foreground md:text-3xl">No disponible</h1>
              <p className="mt-4 text-muted-foreground">
                Lo sentimos, ya no esta disponible la inscripción de cursos
              </p>
              <div className="flex items-center mt-6 gap-x-3">
                <Link href="/">
                  <button className="w-1/2 px-5 py-2 text-sm tracking-wide text-primary-foreground transition-colors duration-200 bg-primary rounded-lg shrink-0 sm:w-auto hover:bg-primary-700">
                    Ir a inicio
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div>
        <Header />
        <div className="min-h-screen overflow-auto flex items-center justify-center bg-background">
          <section className="px-4 py-12">
            <div className="container mx-auto text-center">
              <h4 className="font-display text-4xl font-semibold leading-[1.3] text-foreground mb-4">
                Cargando cursos...
              </h4>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="mt-10">
        <SectionHeading eyebrow="Asegura tu cupo" title="INSCRIPCIONES" />
      </div>

      <div className="container mx-auto p-4">
        <div className="mb-4 flex items-baseline gap-3">
          <h1 className="font-display text-3xl font-semibold text-primary md:text-4xl">Paso 1</h1>
          <h2 className="text-xl text-muted-foreground md:text-2xl">Selecciona tu pase</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <button
            className={cn(
              'flex flex-col items-center justify-between gap-2 rounded-xl border bg-card p-6 text-left transition-colors sm:flex-row sm:gap-4',
              selectedPass === 1 ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-primary',
            )}
            onClick={() => handleSelectPass(1)}
          >
            <span className="font-display text-lg md:text-2xl text-foreground">Pase General Congreso</span>
            <span className="font-mono text-xl md:text-2xl text-primary">$25.900</span>
          </button>
          <button
            className={cn(
              'flex flex-col items-center justify-between gap-2 rounded-xl border bg-card p-6 text-left transition-colors sm:flex-row sm:gap-4',
              selectedPass === 2 ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-primary',
            )}
            onClick={() => handleSelectPass(2)}
          >
            <span className="font-display text-lg md:text-2xl text-foreground">Pase Congreso + Workshop</span>
            <span className="font-mono text-xl md:text-2xl text-primary">$28.900</span>
          </button>
        </div>
      </div>

      <div>
        <WeekSection
          title="Paso 2"
          subtitle="Selecciona tu módulo de la semana 1"
          courses={courses}
          handleSelectCourse={handleSelectCourse}
          selectedWeek={courseSelectedWeek1}
          weekNumber={1}
        />
        <WeekSection
          title="Paso 3"
          subtitle="Selecciona tu módulo de la semana 2"
          courses={courses}
          handleSelectCourse={handleSelectCourse}
          selectedWeek={courseSelectedWeek2}
          weekNumber={2}
        />
        <div>
          {selectedPass === 2 && (
            <WeekSection
              title="Paso 4"
              subtitle="Selecciona tu Workshop"
              courses={courses}
              handleSelectCourse={handleSelectCourse}
              selectedWeek={selectedWorkshop}
              weekNumber={3}
            />
          )}
        </div>
      </div>

      <div className="container mx-auto p-4">
        <div className="mb-4 flex items-baseline gap-3">
          <h1 className="font-display text-3xl font-semibold text-primary md:text-4xl">Paso 5</h1>
          <h2 className="text-xl text-muted-foreground md:text-2xl">Procede al pago</h2>
        </div>
        <button
          onClick={handleConfirmSelection}
          className={cn(
            'rounded-lg px-8 py-4 font-medium text-primary-foreground shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
            !isAllCoursesSelected() ? 'cursor-not-allowed bg-muted-foreground/40' : 'bg-primary hover:bg-primary-700',
          )}
          disabled={!isAllCoursesSelected()}
        >
          Confirmar
        </button>
      </div>
    </div>
  );
};

export default PricingClient;
