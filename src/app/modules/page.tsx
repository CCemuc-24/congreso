import React from 'react';
import Header from '@/components/header';
import ResponsiveCard from '@/components/modulePage/moduleInfo';
import { SectionHeading } from '@/components/luz/SectionHeading';
import { getCourses } from '@/actions/courses';

export const dynamic = 'force-dynamic';

const ModulePage = async () => {
  const result = await getCourses();
  const courses = result.ok ? result.data : [];

  return (
    <div>
      <Header />
      <div className="mx-auto max-w-7xl px-6 py-16">
        <SectionHeading eyebrow="Aprende cirugía" title="Módulos" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {courses
            .filter((course) => course.type !== 'workshop' && course.week !== 4)
            .map((course) => {
              const features = (course.features ?? {}) as Record<string, string>;
              return (
                <ResponsiveCard
                  key={course.id}
                  title={course.title}
                  extraInfo={features.Lugar ?? ''}
                  imageIndex={course.module}
                  topics={course.topics}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default ModulePage;
