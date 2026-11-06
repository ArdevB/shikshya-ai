import { ATTENDANCE_STATUSES, type AttendanceStatus, type Paginated } from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, ClipboardCheck, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { api, queryString } from '@/lib/api';
import { offeringLabel, type AttendanceSession, type RosterEntry } from '@/lib/types';
import { cn, todayInNepal } from '@/lib/utils';
import { useMyOfferings } from './useMyOfferings';

const STATUS_STYLE: Record<AttendanceStatus, { label: string; active: string }> = {
  PRESENT: { label: 'Present', active: 'bg-primary text-primary-foreground border-primary' },
  ABSENT: { label: 'Absent', active: 'bg-accent text-accent-foreground border-accent' },
  LATE: { label: 'Late', active: 'bg-foreground text-background border-foreground' },
  EXCUSED: {
    label: 'Excused',
    active: 'bg-muted-foreground text-background border-muted-foreground',
  },
};

function StudentRow({
  student,
  status,
  onChange,
}: {
  student: RosterEntry;
  status: AttendanceStatus;
  onChange: (status: AttendanceStatus) => void;
}) {
  return (
    <li className="space-y-2 rounded-lg border p-3 md:flex md:items-center md:justify-between md:gap-4 md:space-y-0">
      <div className="min-w-0">
        <p className="font-medium">{student.studentName}</p>
        <p className="text-sm text-muted-foreground">{student.rollNumber}</p>
      </div>
      <div
        role="radiogroup"
        aria-label={`Attendance for ${student.studentName}`}
        className="grid grid-cols-4 gap-1 md:w-96"
      >
        {ATTENDANCE_STATUSES.map((option) => {
          const selected = option === status;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option)}
              // A tall target, because this is used one-handed on a phone in a classroom.
              className={cn(
                'h-12 rounded-md border px-1 text-xs font-semibold transition-colors sm:text-sm',
                selected ? STATUS_STYLE[option].active : 'bg-card hover:bg-primary-soft',
              )}
            >
              {STATUS_STYLE[option].label}
            </button>
          );
        })}
      </div>
    </li>
  );
}

export function TakeAttendancePage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const offerings = useMyOfferings();

  const offeringId = searchParams.get('offeringId') ?? '';
  const date = searchParams.get('date') ?? todayInNepal();
  const period = searchParams.get('period') ?? '';

  const setParam = (key: string, value: string) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  };

  const roster = useQuery({
    queryKey: ['roster', offeringId],
    enabled: Boolean(offeringId),
    queryFn: () => api.get<RosterEntry[]>(`/offerings/${offeringId}/roster`),
  });

  // If attendance was already taken for this class, date and period, this page edits it.
  const existing = useQuery({
    queryKey: ['attendance-sessions', offeringId, date],
    enabled: Boolean(offeringId && date),
    queryFn: () =>
      api.get<Paginated<AttendanceSession>>(
        `/attendance/sessions${queryString({ offeringId, from: date, to: date })}`,
      ),
  });
  const existingSession = existing.data?.data.find((s) => s.period === Number(period || 0));

  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});

  // Start everyone as present (or as saved), whenever the class or session changes.
  useEffect(() => {
    if (!roster.data) return;
    const saved = new Map(existingSession?.records.map((r) => [r.studentId, r.status]));
    setStatuses(
      Object.fromEntries(
        roster.data.map((student) => [
          student.studentId,
          (saved.get(student.studentId) as AttendanceStatus | undefined) ?? 'PRESENT',
        ]),
      ),
    );
  }, [roster.data, existingSession]);

  const save = useMutation({
    mutationFn: () => {
      const records = (roster.data ?? []).map((student) => ({
        studentId: student.studentId,
        status: statuses[student.studentId] ?? 'PRESENT',
      }));
      return existingSession
        ? api.put(`/attendance/sessions/${existingSession.id}`, { records })
        : api.post('/attendance/sessions', {
            offeringId,
            date,
            period: period || undefined,
            records,
          });
    },
    onSuccess: async () => {
      toast.success(existingSession ? 'Attendance updated' : 'Attendance saved');
      await queryClient.invalidateQueries({ queryKey: ['attendance-sessions'] });
      await queryClient.invalidateQueries({ queryKey: ['attendance-report'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const counts = ATTENDANCE_STATUSES.map(
    (status) => [status, Object.values(statuses).filter((s) => s === status).length] as const,
  );

  const markAllPresent = () =>
    setStatuses((current) =>
      Object.fromEntries(Object.keys(current).map((id) => [id, 'PRESENT' as const])),
    );

  return (
    <>
      <PageHeader
        title="Take attendance"
        description="Everyone starts as present, so you only need to change the exceptions."
      />

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_11rem_8rem]">
        <FormField label="Class">
          <Select
            value={offeringId}
            onChange={(event) => setParam('offeringId', event.target.value)}
          >
            <option value="">Choose a class…</option>
            {offerings.data?.data.map((offering) => (
              <option key={offering.id} value={offering.id}>
                {offeringLabel(offering)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Date">
          <Input
            type="date"
            max={todayInNepal()}
            value={date}
            onChange={(event) => setParam('date', event.target.value)}
          />
        </FormField>
        <FormField label="Period">
          <Select value={period} onChange={(event) => setParam('period', event.target.value)}>
            <option value="">Any</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {!offeringId ? (
        <EmptyState icon={ClipboardCheck} title="Choose a class to begin" />
      ) : roster.isPending || existing.isPending ? (
        <LoadingRows rows={8} />
      ) : roster.isError ? (
        <ErrorState error={roster.error} onRetry={() => void roster.refetch()} />
      ) : roster.data.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No students are enrolled in this section" />
      ) : (
        <div className="space-y-3 pb-24">
          {existingSession && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg bg-primary-soft p-3 text-sm"
            >
              <Info className="mt-0.5 size-4 shrink-0 text-primary-dark" aria-hidden />
              Attendance was already taken for this class. Saving will update it.
            </p>
          )}
          <Button variant="outline" className="w-full sm:w-auto" onClick={markAllPresent}>
            <CheckCheck /> Mark all present
          </Button>
          <ul className="space-y-2">
            {roster.data.map((student) => (
              <StudentRow
                key={student.studentId}
                student={student}
                status={statuses[student.studentId] ?? 'PRESENT'}
                onChange={(status) =>
                  setStatuses((current) => ({ ...current, [student.studentId]: status }))
                }
              />
            ))}
          </ul>

          <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background p-3 md:left-64">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground sm:text-sm">
                {counts
                  .map(([status, count]) => `${count} ${STATUS_STYLE[status].label}`)
                  .join(', ')}
              </p>
              <Button size="lg" disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? 'Saving…' : existingSession ? 'Update' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
