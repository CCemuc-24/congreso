// Lista SOLO LECTURA de compras liquidadas por un monto sospechosamente bajo,
// que es como se identifica una compra de prueba (se decidió no marcarlas con una
// columna isTest). Uso:
//   node scripts/list-test-purchases.mjs [--prod] [--max 100]
//
// El umbral por monto es una heurística, no una marca: si algún día existe un
// curso que cueste menos que --max, aparecerá acá y NO es una compra de prueba.
// Verificá el comprador antes de tocar nada.
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

function databaseUrl(useProd) {
  const env = fs.readFileSync('.env', 'utf8');
  if (!useProd) return env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
  return env.split(/^# PROD$/m)[1]?.match(/^#\s*DATABASE_URL=(.+)$/m)?.[1]?.trim();
}

const args = process.argv.slice(2);
const useProd = args.includes('--prod');
const maxIdx = args.indexOf('--max');
const max = maxIdx >= 0 ? Number(args[maxIdx + 1]) : 100;
const url = databaseUrl(useProd);
if (!url) {
  console.error('no pude resolver la URL de la base desde .env');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
console.log(`base: ${useProd ? 'PRODUCCIÓN' : 'desarrollo'} · compras con amount <= ${max}\n`);

const candidatas = await prisma.purchase.findMany({
  where: { amount: { lte: max }, status: 'PAID' },
  orderBy: { paidAt: 'desc' },
});

if (candidatas.length === 0) {
  console.log('Ninguna. No queda nada por limpiar.');
} else {
  for (const p of candidatas) {
    const user = await prisma.user.findUnique({ where: { id: p.userId } });
    const matriculas = await prisma.enrollment.count({ where: { purchaseId: p.id } });
    console.log(
      `${p.id}  $${p.amount}  ${p.paidAt?.toISOString() ?? '?'}  ` +
        `${user?.email ?? '?'}  matrículas: ${matriculas}` +
        (matriculas === 0 ? '  <- ya limpiada' : '  <- PENDIENTE'),
    );
  }
}

await prisma.$disconnect();
