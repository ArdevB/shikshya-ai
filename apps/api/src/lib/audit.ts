import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

interface AuditEntry {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

const toJson = (value: unknown) =>
  value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

/** Pass the transaction client so the audit row commits or rolls back with the change itself. */
export async function writeAudit(
  entry: AuditEntry,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  await client.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: toJson(entry.before),
      after: toJson(entry.after),
    },
  });
}
