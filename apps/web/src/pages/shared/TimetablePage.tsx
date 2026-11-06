import type { WeeklyTimetable } from '@shikshya/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { useCurrentUser } from '@/auth/AuthContext';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { PageHeader } from '@/components/PageHeader';
import { EntryChip, WeeklyGrid } from '@/components/WeeklyGrid';
import { api } from '@/lib/api';
import { ChildSwitcher, useActiveChild } from './ChildSwitcher';

function TimetableView({ path, show }: { path: string; show: 'teacher' | 'section' }) {
  const query = useQuery({
    queryKey: ['timetable', path],
    queryFn: () => api.get<WeeklyTimetable>(path),
  });

  if (query.isPending) return <LoadingRows rows={6} />;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (query.data.entries.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No timetable yet"
        description="It will appear here once classes have been scheduled."
      />
    );
  }
  return (
    <WeeklyGrid
      slots={query.data.slots}
      entries={query.data.entries}
      renderEntry={(entry) => <EntryChip entry={entry} show={show} />}
    />
  );
}

export function TeacherTimetablePage() {
  const { teacherId } = useCurrentUser();
  return (
    <>
      <PageHeader title="My timetable" />
      <TimetableView path={`/timetable?teacherId=${teacherId}`} show="section" />
    </>
  );
}

export function StudentTimetablePage() {
  const { studentId } = useCurrentUser();
  return (
    <>
      <PageHeader title="My timetable" />
      <TimetableView path={`/students/${studentId}/timetable`} show="teacher" />
    </>
  );
}

export function ParentTimetablePage() {
  const { activeId, children, status } = useActiveChild();
  return (
    <>
      <PageHeader title="Timetable" />
      <ChildSwitcher status={status}>{children}</ChildSwitcher>
      {activeId && <TimetableView path={`/students/${activeId}/timetable`} show="teacher" />}
    </>
  );
}
