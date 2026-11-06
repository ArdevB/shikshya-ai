import type { Paginated, PaginationQuery } from '@shikshya/shared';

/** The skip/take for Prisma. */
export function pageArgs({ page, pageSize }: PaginationQuery) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function paginated<T>(
  data: T[],
  total: number,
  { page, pageSize }: PaginationQuery,
): Paginated<T> {
  return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}
