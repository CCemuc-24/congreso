import { PrismaClient, CourseType } from '@prisma/client';
import { prisma } from '../src/lib/prisma';

type SeedCourse = {
  title: string;
  module: number;
  type: CourseType;
  price: number;
  capacity: number;
  week: number;
  features?: Record<string, string>;
  topics?: string[];
};

// CCEM UC 2026 (II Congreso) catalog.
//
// Sale model: a single ticket bundles the presential General module +
// ONE synchronous online module (choose 1 of 3) + TWO presential workshops
// (choose 2 of 10). Workshops are the capacity-limited item.
//
// `module` (1–8) selects the card image (src/components/images/cards/<n>.png).
// The single bundled ticket costs TICKET_PRICE. A student always selects exactly
// one synchronous module, so the ticket price rides on that module; the general
// module and the workshops are $0 (included). Capacities: workshops 20
// (tentative), modules generous. Topics/horarios pending from the committee.
const TICKET_PRICE = 25900;
const GENERAL_FEATURES = {
  Modalidad: 'Clases magistrales presenciales',
  Lugar: 'Campus Casa Central. Auditorio por definir.',
  Fecha: 'Sábados 26/09, 03/10, 17/10 y 24/10',
};

const SYNC_MODULES: { title: string; module: number; fecha: string }[] = [
  {
    title: 'Módulo: Ginecología y Obstetricia',
    module: 4,
    fecha: 'Viernes 25/09, 02/10, 09/10, 16/10 y 23/10',
  },
  {
    title: 'Módulo: Cirugía Digestiva y Coloproctología',
    module: 2,
    fecha: 'Miércoles 23/09, 30/09, 14/10 y 21/10',
  },
  {
    title: 'Módulo: Cirugía Vascular',
    module: 5,
    fecha: 'Jueves 24/09, 01/10, 08/10 y 15/10',
  },
];

const WORKSHOP_TITLES: string[] = [
  'Workshop: Tacto rectal',
  'Workshop: Examen ginecológico',
  'Workshop: E-FAST',
  'Workshop: ECG en contexto quirúrgico',
  'Workshop: Intubación',
  'Workshop: Suturas',
  'Workshop: RCP avanzado',
  'Workshop: Curaciones',
  'Workshop: Interpretación de imágenes en contexto quirúrgico',
  'Workshop: Accesos venosos',
];

const courses: SeedCourse[] = [
  // ── General module — included in every ticket (auto-enrolled) ──
  {
    title: 'Módulo General: Cirugía en pacientes complejos',
    module: 1,
    type: CourseType.core,
    price: 0,
    capacity: 1000,
    week: 0,
    features: GENERAL_FEATURES,
    topics: [],
  },
  // ── Synchronous online modules — choose 1 of 3 ──
  ...SYNC_MODULES.map((m) => ({
    title: m.title,
    module: m.module,
    type: CourseType.elective,
    price: TICKET_PRICE,
    capacity: 1000,
    week: 1,
    features: {
      Modalidad: 'Online sincrónico',
      Fecha: m.fecha,
    },
    topics: [],
  })),
  // ── Workshops — choose 2 of 10, presential, 24/10 ──
  ...WORKSHOP_TITLES.map((title, i) => ({
    title,
    // 10 workshops cycle through the 8 available card images.
    module: (i % 8) + 1,
    type: CourseType.workshop,
    price: 0,
    capacity: 20,
    week: 3,
    features: {
      Modalidad: 'Taller práctico presencial',
      Lugar: 'Campus Casa Central. Sala por definir.',
      Fecha: 'Sábado 24/10',
    },
  })),
];

// Idempotent: only seeds when the catalog is empty. Accepts a client so it is testable.
export async function seedCourses(
  client: Pick<PrismaClient, 'course'>,
): Promise<void> {
  const existing = await client.course.count();
  if (existing > 0) {
    console.log(`Course catalog already seeded (${existing} rows) — skipping.`);
    return;
  }
  for (const data of courses) {
    await client.course.create({ data });
  }
  console.log(`Seeded ${courses.length} courses.`);
}

async function main() {
  await seedCourses(prisma);
}

// Only auto-run when invoked directly (e.g. `prisma db seed` / `tsx prisma/seed.ts`),
// never when imported by tests.
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  main()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
