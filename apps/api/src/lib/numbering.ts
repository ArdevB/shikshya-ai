import type { Prisma } from '@prisma/client';

/**
 * The next document number, such as SHK-2026-000123. The counter row is updated inside the
 * caller's transaction, so concurrent requests queue on it and can never share a number,
 * and a rolled-back transaction gives its number back.
 */
export async function nextNumber(tx: Prisma.TransactionClient, prefix: string, year: number) {
  const name = `${prefix}-${year}`;
  const counter = await tx.counter.upsert({
    where: { name },
    create: { name, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${name}-${String(counter.value).padStart(6, '0')}`;
}
