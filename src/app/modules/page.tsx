import React from 'react';
import Header from '@/components/header';
import ResponsiveCard from '@/components/modulePage/moduleInfo';
import { getCourses } from '@/actions/courses';

export const dynamic = 'force-dynamic';

const ModulePage = async () => {
  const result = await getCourses();
  const courses = result.ok ? result.data : [];

  return (
    <div>
      <Header />
      <div className="max-w-8xl mx-auto p-6">
        <div className="flex justify-center mb-4">
          <h2 className="text-3xl font-bold text-[#00778B]">MÓDULOS</h2>
        </div>
        <div className="flex justify-center mb-6">
          <hr className="w-full border-t-2 border-gray-300" />
        </div>
      </div>
      <div className="px-8 sm:px-8 lg:px-8">
        <div className="max-w-7xl mx-auto grid gap-8 grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
