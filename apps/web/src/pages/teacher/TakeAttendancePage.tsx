import { ATTENDANCE_STATUSES, type AttendanceStatus, type Paginated } from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, ClipboardCheck, Info, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { api, queryString } from '@/lib/api';
import { SLIDE } from '@/lib/motion';
import { offeringLabel, type AttendanceSession, type RosterEntry } from '@/lib/types';
import { cn, todayInNepal } from '@/lib/utils';
import { useMyOfferings } from './useMyOfferings';

const STATUS_STYLE: Record<AttendanceStatus, { label: string; fill: string }> = {
  PRESENT: { label: 'Present', fill: 'bg-primary-strong' },
  ABSENT: { label: 'Absent', fill: 'bg-accent-strong' },
  LATE: { label: 'Late', fill: 'bg-foreground' },
  EXCUSED: { label: 'Excused', fill: 'bg-muted-foreground' },
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
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const initials = student.studentName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');

  /** The arrow keys move between options, which is how a group of radio buttons works. */
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = (index + step + ATTENDANCE_STATUSES.length) % ATTENDANCE_STATUSES.length;
    const option = ATTENDANCE_STATUSES[next];
    if (option) onChange(option);
    radios.current[next]?.focus();
  };

  return (
    <li className="space-y-2.5 rounded-2xl border bg-card p-3 shadow-soft md:flex md:items-center md:justify-between md:gap-4 md:space-y-0">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-soft text-xs font-bold text-primary-dark"
        >
          {initials}
        </span>
        <div className="min-w-0">
          <p className="font-medium">{student.studentName}</p>
          <p className="text-sm text-muted-foreground">{student.rollNumber}</p>
        </div>
      </div>
      <div
        role="radiogroup"
        aria-label={`Attendance for ${student.studentName}`}
        className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1 md:w-96"
      >
        {ATTENDANCE_STATUSES.map((option, index) => {
          const selected = option === status;
          return (
            <button
              key={option}
              ref={(element) => {
                radios.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option)}
              onKeyDown={(event) => onKeyDown(event, index)}
              // A tall target, because this is used one-handed on a phone in a classroom.
              className={cn(
                'relative h-12 rounded-lg px-1 text-xs font-semibold transition-colors duration-200 sm:text-sm',
                selected ? 'text-primary-foreground' : 'text-foreground/80 hover:text-foreground',
              )}
            >
              {selected && (
                <motion.span
                  layoutId={`status-${student.studentId}`}
                  transition={SLIDE}
                  className={cn('absolute inset-0 rounded-lg shadow-sm', STATUS_STYLE[option].fill)}
                />
              )}
              <span className="relative">{STATUS_STYLE[option].label}</span>
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
              className="flex animate-rise items-start gap-2 rounded-xl bg-primary-soft p-3 text-sm"
            >
              <Info className="mt-0.5 size-4 shrink-0 text-primary-dark" aria-hidden />
              Attendance was already taken for this class. Saving will update it.
            </p>
          )}
          <Button variant="outline" className="w-full sm:w-auto" onClick={markAllPresent}>
            <CheckCheck /> Mark all present
          </Button>
          <ul className="stagger-children space-y-2">
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

          {/* Sits above the phone's bottom bar, and beside the sidebar on larger screens. */}
          <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 animate-rise border-t bg-background/85 p-3 backdrop-blur-xl md:bottom-0 md:left-[var(--sidebar-width)]">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground sm:text-sm">
                {counts
                  .map(([status, count]) => `${count} ${STATUS_STYLE[status].label}`)
                  .join(', ')}
              </p>
              <Button size="lg" disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
                {save.isPending ? 'Saving…' : existingSession ? 'Update' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
