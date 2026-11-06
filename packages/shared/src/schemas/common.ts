import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** `?page=&pageSize=` for every list endpoint. Query strings arrive as text, hence coerce. */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export const idParam = z.object({ id: z.string().min(1) });

/** A calendar date as YYYY-MM-DD (from date inputs). */
export const dateString = z
  .string()
  .refine(
    (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)),
    'Use a real date in the format YYYY-MM-DD',
  );

/** Turns "" from an empty form field into undefined, so optional fields validate cleanly. */
export const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));
