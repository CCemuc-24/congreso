import React from 'react';
import type { Course, User } from '@prisma/client';

const Row: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <dl className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-b-0">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="text-end font-medium text-foreground">{value}</dd>
  </dl>
);

const BuyInfo: React.FC<{ courses: Course[]; user: User | null }> = ({ courses, user }) => {
  if (courses.length === 0 || !user) {
    return <p className="mb-8 text-muted-foreground">Cargando...</p>;
  }

  const generalCourses = courses.filter((c) => c.type === 'core');
  const moduleCourse = courses.find((c) => c.type === 'elective');
  const workshops = courses.filter((c) => c.type === 'workshop');
  const price = courses.reduce((sum, c) => sum + c.price, 0);

  return (
    <div className="mb-8 rounded-xl border border-border bg-card p-6">
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-primary">Tu inscripción</p>
      {generalCourses.map((course) => (
        <Row key={course.id} label="Módulo general" value={course.title} />
      ))}
      {moduleCourse && <Row label="Módulo sincrónico" value={moduleCourse.title} />}
      {workshops.map((workshop, index) => (
        <Row key={workshop.id} label={`Workshop ${index + 1}`} value={workshop.title} />
      ))}
      <Row label="Precio" value={`$${price}`} />
      <Row label="Nombre" value={`${user.names} ${user.lastNames}`} />
      <Row label="RUT" value={user.rut} />
      <Row label="Correo" value={user.email} />
    </div>
  );
};

export default BuyInfo;
