import { PrismaClient } from '@prisma/client';

/** These mean the connection failed, not that anything was wrong with the query. */
const CONNECTION_ERRORS = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);

export const isConnectionError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  CONNECTION_ERRORS.has(String(error.code));

const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Tries again after a dropped connection, waiting a little longer each time. */
export async function retryOnConnectionError<T>(
  run: () => Promise<T>,
  retries = 2,
  delayMs = 300,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= retries || !isConnectionError(error)) throw error;
      await sleep(delayMs * (attempt + 1));
    }
  }
}

/**
 * The database is reached across the internet, so a connection does sometimes drop. Reads simply
 * try again, and nobody notices. Writes do not, because a write that failed to report back may
 * still have happened, so those reach the person as "please try again" and they decide.
 */
export const prisma = new PrismaClient().$extends({
  name: 'retry-reads',
  query: {
    $allModels: {
      $allOperations({ operation, args, query }) {
        return READ_OPERATIONS.has(operation)
          ? retryOnConnectionError(() => query(args))
          : query(args);
      },
    },
  },
});
