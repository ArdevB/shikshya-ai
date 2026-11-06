import { MAX_PAGE_SIZE, type Paginated } from '@shikshya/shared';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/auth/AuthContext';
import { api, queryString } from '@/lib/api';
import type { CourseOffering } from '@/lib/types';

/** The course offerings the logged-in teacher teaches. */
export function useMyOfferings() {
  const { teacherId } = useCurrentUser();
  return useQuery({
    queryKey: ['/course-offerings', 'mine', teacherId],
    enabled: Boolean(teacherId),
    queryFn: () =>
      api.get<Paginated<CourseOffering>>(
        `/course-offerings${queryString({ teacherId: teacherId ?? undefined, pageSize: MAX_PAGE_SIZE })}`,
      ),
  });
}
