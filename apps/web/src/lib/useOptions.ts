import type { Paginated } from '@shikshya/shared';
import { useQuery } from '@tanstack/react-query';
import { MAX_PAGE_SIZE } from '@shikshya/shared';
import type { FieldOption } from '@/components/ResourceManager';
import { api, queryString } from '@/lib/api';

/** Loads a resource as options for a select. */
export function useOptions<T>(
  path: string,
  toOption: (row: T) => FieldOption,
  params: Record<string, string | undefined> = {},
  enabled = true,
): FieldOption[] {
  const { data } = useQuery({
    queryKey: [path, 'options', params],
    enabled,
    queryFn: () =>
      api.get<Paginated<T>>(`${path}${queryString({ pageSize: MAX_PAGE_SIZE, ...params })}`),
  });
  return data?.data.map(toOption) ?? [];
}
