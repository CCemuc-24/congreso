// Inspección de SOLO LECTURA de una compra y del cupo que consumió.
// No escribe nada. Uso:
//   node scripts/inspect-purchase.mjs <purchaseId> [--prod]
//
// La URL sale de .env, nunca de argv: un connection string en la línea de
// comandos queda en el historial del shell y en la lista de procesos.
// Sin --prod usa DATABASE_URL (la de desarrollo); con --prod usa la línea
// comentada bajo el marcador "# PROD".
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

function databaseUrl(useProd) {
  const env = fs.readFileSync('.env', 'utf8');
  if (!useProd) {
    const line = env.match(/^DATABASE_URL=(.+)$/m);
    return line?.[1]?.trim();
  }
  const prodBlock = env.split(/^# PROD$/m)[1];
  const line = prodBlock?.match(/^#\s*DATABASE_URL=(.+)$/m);
  return line?.[1]?.trim();
}

const args = process.argv.slice(2);
const useProd = args.includes('--prod');
const purchaseId = args.find((a) => !a.startsWith('--'));
const url = databaseUrl(useProd);
if (!url || !purchaseId) {
  console.error('uso: node scripts/inspect-purchase.mjs <purchaseId> [--prod]');
  process.exit(1);
}
console.log(`base: ${useProd ? 'PRODUCCIÓN' : 'desarrollo'} (${url.match(/@([^.]+)/)?.[1]})\n`);

const prisma = new PrismaClient({ datasources: { db: { url } } });

const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
if (!purchase) {
  console.error(`NO ENCONTRADA: ${purchaseId} no existe en esta base.`);
  await prisma.$disconnect();
  process.exit(2);
}

console.log('--- COMPRA ---');
console.log({
  id: purchase.id,
  buyOrder: purchase.buyOrder,
  amount: purchase.amount,
  status: purchase.status,
  isPaid: purchase.isPaid,
  paidAt: purchase.paidAt,
  authorizationCode: purchase.authorizationCode,
  coursesIds: purchase.coursesIds,
});

const user = await prisma.user.findUnique({ where: { id: purchase.userId } });
console.log('\n--- COMPRADOR ---');
console.log({ id: user?.id, email: user?.email, names: user?.names, rut: user?.rut });

// El decremento de cupo es exactamente uno por matrícula CREADA por esta compra:
// webpayConfirm salta el decremento cuando la matrícula ya existía. Así que las
// filas de Enrollment con este purchaseId son la lista precisa de cupos a devolver.
const enrollments = await prisma.enrollment.findMany({
  where: { purchaseId: purchase.id },
  orderBy: { createdAt: 'asc' },
});

console.log(`\n--- MATRÍCULAS DE ESTA COMPRA (${enrollments.length}) ---`);
for (const e of enrollments) {
  const course = await prisma.course.findUnique({ where: { id: e.courseId } });
  const comprado = purchase.coursesIds.includes(e.courseId);
  console.log({
    enrollmentId: e.id,
    curso: course?.title,
    tipo: course?.type,
    origen: comprado ? 'COMPRADO' : 'core (automático)',
    capacidadActual: course?.capacity,
    capacidadSiSeDevuelve: (course?.capacity ?? 0) + 1,
  });
}

// Matrículas del mismo usuario que NO vienen de esta compra: no hay que tocarlas.
const otras = await prisma.enrollment.count({
  where: { userId: purchase.userId, purchaseId: { not: purchase.id } },
});
console.log(`\nOtras matrículas del mismo usuario (NO se tocan): ${otras}`);

await prisma.$disconnect();
