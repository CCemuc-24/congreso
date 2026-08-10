// Devuelve el cupo que consumió una compra de prueba y borra sus matrículas,
// CONSERVANDO la fila Purchase (rastro del pago: token, authorizationCode, paidAt).
//
//   node scripts/restore-capacity.mjs <purchaseId> [--prod]           # simulacro
//   node scripts/restore-capacity.mjs <purchaseId> [--prod] --apply   # escribe
//
// Por defecto NO escribe. Hay que pasar --apply explícitamente.
//
// La regla de cuánto devolver: webpayConfirm decrementa capacity una vez por cada
// matrícula que CREA, y salta el decremento cuando la matrícula ya existía. Por eso
// las filas de Enrollment con este purchaseId son la lista exacta de cupos a
// devolver — no coursesIds, que no incluye los cursos core ni excluye los que ya
// estaban matriculados.
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

function databaseUrl(useProd) {
  const env = fs.readFileSync('.env', 'utf8');
  if (!useProd) return env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
  const prodBlock = env.split(/^# PROD$/m)[1];
  return prodBlock?.match(/^#\s*DATABASE_URL=(.+)$/m)?.[1]?.trim();
}

const args = process.argv.slice(2);
const useProd = args.includes('--prod');
const apply = args.includes('--apply');
const purchaseId = args.find((a) => !a.startsWith('--'));
const url = databaseUrl(useProd);
if (!url || !purchaseId) {
  console.error('uso: node scripts/restore-capacity.mjs <purchaseId> [--prod] [--apply]');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
const label = useProd ? 'PRODUCCIÓN' : 'desarrollo';
console.log(`base: ${label} (${url.match(/@([^.]+)/)?.[1]})`);
console.log(apply ? 'modo: APLICAR (escribe)\n' : 'modo: SIMULACRO (no escribe)\n');

const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
if (!purchase) {
  console.error(`NO ENCONTRADA: ${purchaseId}`);
  await prisma.$disconnect();
  process.exit(2);
}

const enrollments = await prisma.enrollment.findMany({ where: { purchaseId } });
if (enrollments.length === 0) {
  console.log('Esta compra no tiene matrículas: no hay cupo que devolver. Nada que hacer.');
  await prisma.$disconnect();
  process.exit(0);
}

// Agrupado por curso en vez de asumir una matrícula por curso. El índice único
// (userId, courseId) lo garantiza hoy, pero contar es correcto sin depender de eso.
const porCurso = new Map();
for (const e of enrollments) {
  porCurso.set(e.courseId, (porCurso.get(e.courseId) ?? 0) + 1);
}

console.log('Plan:');
for (const [courseId, n] of porCurso) {
  const c = await prisma.course.findUnique({ where: { id: courseId } });
  console.log(`  ${c?.title}: capacity ${c?.capacity} -> ${(c?.capacity ?? 0) + n}  (+${n})`);
}
console.log(`  borrar ${enrollments.length} matrícula(s)`);
console.log(`  CONSERVAR Purchase ${purchaseId} (status ${purchase.status}, amount ${purchase.amount})`);

if (!apply) {
  console.log('\nSimulacro: no se escribió nada. Repetí con --apply para ejecutarlo.');
  await prisma.$disconnect();
  process.exit(0);
}

// Una sola transacción: o vuelven todos los cupos y se borran todas las
// matrículas, o no cambia nada. Un estado intermedio dejaría cupo devuelto con la
// matrícula todavía ocupándolo, que es justo la sobreventa que esto viene a evitar.
const resultado = await prisma.$transaction(async (tx) => {
  const borradas = await tx.enrollment.deleteMany({ where: { purchaseId } });

  for (const [courseId, n] of porCurso) {
    await tx.course.update({
      where: { id: courseId },
      data: { capacity: { increment: n } },
    });
  }

  // Cinturón y tirantes: la compra tiene que seguir existiendo al final. Si algo
  // la borró (un cascade inesperado), revienta la transacción y no se pierde nada.
  const sigue = await tx.purchase.findUnique({ where: { id: purchaseId } });
  if (!sigue) throw new Error('la compra desapareció durante la transacción — rollback');

  return { borradas: borradas.count };
});

console.log(`\nHecho. Matrículas borradas: ${resultado.borradas}`);
console.log('Estado final:');
for (const [courseId] of porCurso) {
  const c = await prisma.course.findUnique({ where: { id: courseId } });
  console.log(`  ${c?.title}: capacity ${c?.capacity}`);
}
const final = await prisma.purchase.findUnique({ where: { id: purchaseId } });
console.log(`  Purchase ${final?.id}: ${final?.status}, amount ${final?.amount}, auth ${final?.authorizationCode}`);

await prisma.$disconnect();
