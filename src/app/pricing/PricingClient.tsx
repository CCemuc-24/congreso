'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check } from 'lucide-react';
import Header from '@/components/header';
import WeekSection from '@/components/inscriptions/weekSection';
import { getCourses } from '@/actions/courses';
import type { Course } from '@/actions/courses';
import { SectionHeading } from '@/components/luz/SectionHeading';
import { cn } from '@/lib/utils';

const TICKET_PRICE = '$25.900';
const WORKSHOPS_REQUIRED = 2;

const PricingClient: React.FC<{ registrationOpen: boolean }> = ({ registrationOpen }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedModule, setSelectedModule] = useState<Course | null>(null);
  const [selectedWorkshops, setSelectedWorkshops] = useState<Course[]>([]);

  const router = useRouter();

  useEffect(() => {
    if (!registrationOpen) return;
    (async () => {
      const res = await getCourses();
      if (res.ok) setCourses(res.data);
    })();
  }, [registrationOpen]);

  // The synchronous module choice (pick 1 of 3) lives in week 1; workshops in week 3.
  const handleSelectModule = (course: Course) => setSelectedModule(course);

  const handleToggleWorkshop = (course: Course) => {
    setSelectedWorkshops((prev) => {
      if (prev.some((w) => w.id === course.id)) {
        return prev.filter((w) => w.id !== course.id);
      }
      if (prev.length >= WORKSHOPS_REQUIRED) return prev; // cap at 2
      return [...prev, course];
    });
  };

  const isReady = () => selectedModule != null && selectedWorkshops.length === WORKSHOPS_REQUIRED;

  const handleConfirmSelection = () => {
    if (!isReady()) return;
    const [w1, w2] = selectedWorkshops;
    router.push(`/form?w1id=${selectedModule!.id}&w2id=${w1.id}&w3id=${w2.id}`);
  };

  if (!registrationOpen) {
    return (
      <div>
        <Header />
        <section className="bg-background">
          <div className="container mx-auto flex min-h-screen items-center px-6 py-12">
            <div>
              <h1 className="mt-3 font-display text-2xl font-semibold text-foreground md:text-3xl">
                No disponible
              </h1>
              <p className="mt-4 text-muted-foreground">
                Lo sentimos, ya no esta disponible la inscripción de cursos
              </p>
              <div className="mt-6 flex items-center gap-x-3">
                <Link href="/">
                  <button className="shrink-0 rounded-lg bg-primary px-5 py-2 text-sm tracking-wide text-primary-foreground transition-colors duration-200 hover:bg-primary-700 sm:w-auto">
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
        <div className="flex min-h-screen items-center justify-center overflow-auto bg-background">
          <section className="px-4 py-12">
            <div className="container mx-auto text-center">
              <h4 className="mb-4 font-display text-4xl font-semibold leading-[1.3] text-foreground">
                Cargando cursos...
              </h4>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const workshopCount = selectedWorkshops.length;

  return (
    <div>
      <Header />
      <div className="mt-10">
        <SectionHeading eyebrow="Asegura tu cupo" title="INSCRIPCIONES" />
      </div>

      {/* One bundled ticket */}
      <div className="container mx-auto p-4">
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground md:text-2xl">
              Pase Congreso CCEM UC
            </h2>
            <p className="mt-1 text-muted-foreground">
              Incluye el módulo general presencial, un módulo sincrónico a elección y dos workshops.
            </p>
          </div>
          <span className="font-mono text-2xl font-bold text-primary md:text-3xl">{TICKET_PRICE}</span>
        </div>
      </div>

      <WeekSection
        title="Paso 1"
        subtitle="Elige tu módulo sincrónico (1 de 3)"
        courses={courses}
        handleSelectCourse={handleSelectModule}
        selectedWeek={selectedModule}
        weekNumber={1}
      />

      <WeekSection
        title="Paso 2"
        subtitle={`Elige 2 workshops (${workshopCount}/${WORKSHOPS_REQUIRED} elegidos)`}
        courses={courses}
        handleSelectCourse={handleToggleWorkshop}
        selectedIds={selectedWorkshops.map((w) => w.id)}
        weekNumber={3}
      />

      <div className="container mx-auto p-4">
        <div className="mb-4 flex items-baseline gap-3">
          <h1 className="font-display text-3xl font-semibold text-primary md:text-4xl">Paso 3</h1>
          <h2 className="text-xl text-muted-foreground md:text-2xl">Procede al pago</h2>
        </div>
        <button
          onClick={handleConfirmSelection}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-8 py-4 font-medium text-primary-foreground shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
            !isReady() ? 'cursor-not-allowed bg-muted-foreground/40' : 'bg-primary hover:bg-primary-700',
          )}
          disabled={!isReady()}
        >
          <Check className="h-4 w-4" />
          Confirmar
        </button>
      </div>
    </div>
  );
};

export default PricingClient;
