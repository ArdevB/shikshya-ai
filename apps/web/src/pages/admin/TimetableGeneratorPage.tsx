import {
  DAY_NAMES,
  MAX_PAGE_SIZE,
  type Paginated,
  type TimetableEntryView,
  type TimetableGeneratorInputs,
  type TimetablePlacement,
  type TimetableProposal,
  type TimetableProposalEntry,
  type TimetableSlotView,
} from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Save, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { EntryChip, WeeklyGrid } from '@/components/WeeklyGrid';
import { api, queryString } from '@/lib/api';
import type { Semester } from '@/lib/types';
import { useOptions } from '@/lib/useOptions';
import { cn } from '@/lib/utils';

interface Room {
  id: string;
  name: string;
  capacity: number;
  type: string;
}

function PeriodInput({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number;
  onSave: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  return (
    <Input
      type="number"
      min={0}
      max={20}
      aria-label={label}
      className="h-9 w-20"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = Number(draft);
        if (Number.isInteger(next) && next >= 0 && next <= 20 && next !== value) onSave(next);
      }}
    />
  );
}

/** Which periods a teacher cannot do. One button per period, so it works from the keyboard. */
function UnavailabilityDialog({
  teacher,
  slots,
  semesterId,
  onClose,
}: {
  teacher: TimetableGeneratorInputs['teachers'][number];
  slots: TimetableSlotView[];
  semesterId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [blocked, setBlocked] = useState(new Set(teacher.unavailableSlotIds));
  const days = [...new Set(slots.map((slot) => slot.dayOfWeek))].sort((a, b) => a - b);
  const times = [...new Set(slots.map((slot) => slot.startTime))].sort();

  const save = useMutation({
    mutationFn: () =>
      api.put(`/timetable-generator/teachers/${teacher.id}/unavailability`, {
        timeSlotIds: [...blocked],
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['generator-inputs', semesterId] });
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const toggle = (id: string) =>
    setBlocked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <div>
          <DialogTitle>When {teacher.name} cannot teach</DialogTitle>
          <DialogDescription>Choose the periods to keep free.</DialogDescription>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr>
                <th scope="col" className="p-1 text-left text-xs font-semibold">
                  Time
                </th>
                {days.map((day) => (
                  <th key={day} scope="col" className="p-1 text-xs font-semibold">
                    {DAY_NAMES[day]?.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {times.map((time) => (
                <tr key={time}>
                  <th scope="row" className="p-1 text-left text-xs font-medium">
                    {time}
                  </th>
                  {days.map((day) => {
                    const slot = slots.find((s) => s.dayOfWeek === day && s.startTime === time);
                    if (!slot) return <td key={day} />;
                    const off = blocked.has(slot.id);
                    return (
                      <td key={day} className="p-1">
                        <button
                          type="button"
                          aria-pressed={off}
                          aria-label={`${DAY_NAMES[day]} ${time}: ${off ? 'not available' : 'available'}`}
                          onClick={() => toggle(slot.id)}
                          className={cn(
                            'h-8 w-full rounded-lg border text-xs transition-colors duration-200',
                            off
                              ? 'border-accent bg-accent-soft font-semibold text-accent-dark'
                              : 'hover:bg-primary-soft',
                          )}
                        >
                          {off ? 'Off' : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Inputs({
  semesterId,
  inputs,
  slots,
}: {
  semesterId: string;
  inputs: TimetableGeneratorInputs;
  slots: TimetableSlotView[];
}) {
  const queryClient = useQueryClient();
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const setPeriods = useMutation({
    mutationFn: (input: { id: string; theoryPeriods: number; labPeriods: number }) =>
      api.put(`/timetable-generator/offerings/${input.id}/periods`, {
        theoryPeriods: input.theoryPeriods,
        labPeriods: input.labPeriods,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['generator-inputs', semesterId] }),
    onError: (error) => toast.error(error.message),
  });
  const teacher = inputs.teachers.find((item) => item.id === teacherId);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Periods a week</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={inputs.offerings}
            rowKey={(row) => row.id}
            columns={[
              {
                header: 'Class',
                cell: (row) => (
                  <span>
                    <span className="font-medium">{row.courseCode}</span>, section {row.sectionName}
                    <span className="block text-xs text-muted-foreground">
                      {row.teacherName}, {row.size} students
                    </span>
                  </span>
                ),
              },
              {
                header: 'Theory',
                cell: (row) => (
                  <PeriodInput
                    label={`Theory periods for ${row.courseCode}, section ${row.sectionName}`}
                    value={row.theoryPeriods}
                    onSave={(theoryPeriods) =>
                      setPeriods.mutate({ id: row.id, theoryPeriods, labPeriods: row.labPeriods })
                    }
                  />
                ),
              },
              {
                header: 'Lab',
                cell: (row) => (
                  <PeriodInput
                    label={`Lab periods for ${row.courseCode}, section ${row.sectionName}`}
                    value={row.labPeriods}
                    onSave={(labPeriods) =>
                      setPeriods.mutate({
                        id: row.id,
                        theoryPeriods: row.theoryPeriods,
                        labPeriods,
                      })
                    }
                  />
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Teacher availability</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {inputs.teachers.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {item.name}
                  <span className="block text-xs text-muted-foreground">
                    {item.unavailableSlotIds.length
                      ? `${item.unavailableSlotIds.length} periods off`
                      : 'Available for all periods'}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Set availability for ${item.name}`}
                  onClick={() => setTeacherId(item.id)}
                >
                  Set
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {teacher && (
        <UnavailabilityDialog
          teacher={teacher}
          slots={slots}
          semesterId={semesterId}
          onClose={() => setTeacherId(null)}
        />
      )}
    </div>
  );
}

const toPlacement = (entry: TimetableProposalEntry): TimetablePlacement => ({
  offeringId: entry.offeringId,
  timeSlotId: entry.timeSlotId,
  roomId: entry.roomId,
  kind: entry.kind,
});

/** The shape the existing weekly grid reads. */
const toGridEntry = (
  entry: TimetableProposalEntry,
  index: number,
  semesterId: string,
): TimetableEntryView => ({
  id: String(index),
  courseOfferingId: entry.offeringId,
  roomId: entry.roomId,
  timeSlotId: entry.timeSlotId,
  semesterId,
  courseCode: entry.courseCode,
  courseTitle: entry.courseTitle,
  sectionId: entry.sectionId,
  sectionName: entry.sectionName,
  teacherId: '',
  teacherName: entry.teacherName,
  roomName: entry.roomName,
  dayOfWeek: entry.dayOfWeek,
  startTime: entry.startTime,
  endTime: entry.endTime,
});

function MoveDialog({
  entry,
  slots,
  rooms,
  onMove,
  onClose,
}: {
  entry: TimetableProposalEntry;
  slots: TimetableSlotView[];
  rooms: Room[];
  onMove: (timeSlotId: string, roomId: string) => void;
  onClose: () => void;
}) {
  const [timeSlotId, setTimeSlotId] = useState(entry.timeSlotId);
  const [roomId, setRoomId] = useState(entry.roomId);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>Move {entry.courseCode}</DialogTitle>
          <DialogDescription>
            Section {entry.sectionName}, {entry.teacherName}. Clashes are checked as soon as you
            move it.
          </DialogDescription>
        </div>
        <FormField label="Time">
          <Select value={timeSlotId} onChange={(event) => setTimeSlotId(event.target.value)}>
            {slots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {DAY_NAMES[slot.dayOfWeek]} {slot.startTime} to {slot.endTime}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Room">
          <Select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} ({room.capacity})
              </option>
            ))}
          </Select>
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onMove(timeSlotId, roomId)}>Move</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScoreLine({ proposal, clashes }: { proposal: TimetableProposal; clashes: number }) {
  const score = proposal.score;
  const items = [
    { label: 'Classes placed', value: proposal.entries.length },
    { label: 'Clashes', value: clashes },
    { label: 'Same-day repeats', value: score?.sameDayRepeats ?? 0 },
    { label: 'Long teaching runs', value: score?.longRuns ?? 0 },
    { label: 'Gaps in a day', value: score?.gaps ?? 0 },
    { label: 'Split labs', value: score?.splitLabs ?? 0 },
  ];
  return (
    <dl className="stagger-children grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border bg-card p-3">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="font-heading text-xl font-bold">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Proposal({
  semesterId,
  proposal,
  slots,
  rooms,
  onSaved,
}: {
  semesterId: string;
  proposal: TimetableProposal;
  slots: TimetableSlotView[];
  rooms: Room[];
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState(proposal.entries);
  const [problems, setProblems] = useState<string[]>([]);
  const [moving, setMoving] = useState<number | null>(null);
  const sections = useMemo(() => {
    const seen = new Map<string, string>();
    for (const entry of proposal.entries) seen.set(entry.sectionId, entry.sectionName);
    return [...seen.entries()].map(([value, label]) => ({ value, label: `Section ${label}` }));
  }, [proposal.entries]);
  const [sectionId, setSectionId] = useState(sections[0]?.value ?? '');

  const check = useMutation({
    mutationFn: (placements: TimetablePlacement[]) =>
      api.post<{ clashes: { message: string }[] }>('/timetable-generator/check', {
        semesterId,
        placements,
      }),
    onSuccess: ({ clashes }) => setProblems(clashes.map((clash) => clash.message)),
    onError: (error) => toast.error(error.message),
  });

  const save = useMutation({
    mutationFn: () =>
      api.post<{ saved: number }>('/timetable-generator/apply', {
        semesterId,
        placements: entries.map(toPlacement),
      }),
    onSuccess: async ({ saved }) => {
      toast.success(`Timetable saved, with ${saved} classes`);
      await queryClient.invalidateQueries({ queryKey: ['/timetable'] });
      onSaved();
    },
    onError: (error) => toast.error(error.message),
  });

  const move = (timeSlotId: string, roomId: string) => {
    const slot = slots.find((item) => item.id === timeSlotId);
    const room = rooms.find((item) => item.id === roomId);
    if (moving === null || !slot || !room) return;
    const next = entries.map((entry, index) =>
      index === moving
        ? {
            ...entry,
            timeSlotId,
            roomId,
            roomName: room.name,
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
          }
        : entry,
    );
    setEntries(next);
    setMoving(null);
    check.mutate(next.map(toPlacement));
  };

  const visible = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.sectionId === sectionId);
  const gridEntries = visible.map(({ entry, index }) => toGridEntry(entry, index, semesterId));

  return (
    <div className="space-y-4">
      <ScoreLine proposal={proposal} clashes={problems.length} />

      {problems.length > 0 ? (
        <div role="alert" className="rounded-2xl border border-accent/40 bg-accent-soft p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 text-accent-dark" aria-hidden />
            Please fix these before saving
          </p>
          <ul className="mt-1 list-inside list-disc">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm" role="status">
          <CheckCircle2 className="size-4 text-primary-dark" aria-hidden />
          No clashes. Nothing is saved until you press Save.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs label="Section" value={sectionId} onChange={setSectionId} tabs={sections} />
        <Button
          disabled={save.isPending || check.isPending || problems.length > 0}
          onClick={() => save.mutate()}
        >
          <Save /> {save.isPending ? 'Saving…' : 'Save as the timetable'}
        </Button>
      </div>

      <WeeklyGrid
        slots={slots}
        entries={gridEntries}
        renderEntry={(entry) => (
          <button
            type="button"
            className="w-full rounded-lg text-left"
            aria-label={`Move ${entry.courseCode}, ${DAY_NAMES[entry.dayOfWeek]} ${entry.startTime}, ${entry.roomName}`}
            onClick={() => setMoving(Number(entry.id))}
          >
            <EntryChip entry={entry} show="teacher" />
          </button>
        )}
      />
      {moving !== null && entries[moving] && (
        <MoveDialog
          entry={entries[moving]}
          slots={slots}
          rooms={rooms}
          onMove={move}
          onClose={() => setMoving(null)}
        />
      )}
    </div>
  );
}

export function TimetableGeneratorPage() {
  const [semesterId, setSemesterId] = useState('');
  const [proposal, setProposal] = useState<TimetableProposal | null>(null);
  const [attempt, setAttempt] = useState(0);

  const semesters = useOptions<Semester>('/semesters', (semester) => ({
    value: semester.id,
    label: `${semester.program.code} Semester ${semester.number} (${semester.academicYear.name})`,
  }));

  const inputs = useQuery({
    queryKey: ['generator-inputs', semesterId],
    enabled: Boolean(semesterId),
    queryFn: () =>
      api.get<TimetableGeneratorInputs>(`/timetable-generator/semesters/${semesterId}/inputs`),
  });
  const slots = useQuery({
    queryKey: ['/time-slots', 'all'],
    queryFn: () =>
      api.get<Paginated<TimetableSlotView>>(
        `/time-slots${queryString({ pageSize: MAX_PAGE_SIZE })}`,
      ),
  });
  const rooms = useQuery({
    queryKey: ['/rooms', 'all'],
    queryFn: () => api.get<Paginated<Room>>(`/rooms${queryString({ pageSize: MAX_PAGE_SIZE })}`),
  });

  const generate = useMutation({
    mutationFn: () =>
      api.post<TimetableProposal>('/timetable-generator/generate', { semesterId }),
    onSuccess: (result) => {
      setProposal(result);
      setAttempt((value) => value + 1);
    },
    onError: (error) => toast.error(error.message),
  });

  const slotList = slots.data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Timetable generator"
        description="Works out a week with no clashes, spreading classes out as well as it can. You can adjust it before saving."
      />
      <div className="space-y-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-sm">
            <FormField label="Semester">
              <Select
                value={semesterId}
                onChange={(event) => {
                  setSemesterId(event.target.value);
                  setProposal(null);
                }}
              >
                <option value="">Choose a semester…</option>
                {semesters.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <Button
            disabled={!semesterId || generate.isPending || !inputs.data?.offerings.length}
            onClick={() => generate.mutate()}
          >
            <Wand2 className={generate.isPending ? 'animate-spin' : undefined} />
            {generate.isPending ? 'Working it out, up to 30 seconds…' : 'Generate'}
          </Button>
        </div>

        {semesterId &&
          (inputs.isPending ? (
            <LoadingRows rows={3} />
          ) : inputs.isError ? (
            <ErrorState error={inputs.error} onRetry={() => void inputs.refetch()} />
          ) : inputs.data.offerings.length === 0 ? (
            <EmptyState icon={Wand2} title="This semester has no classes yet" />
          ) : (
            <Inputs semesterId={semesterId} inputs={inputs.data} slots={slotList} />
          ))}

        {proposal?.status === 'INFEASIBLE' && (
          <div
            role="alert"
            className="animate-rise rounded-2xl border border-accent/40 bg-accent-soft p-4 text-sm"
          >
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-4 text-accent-dark" aria-hidden />
              No timetable can fit all of this
            </p>
            <ul className="mt-1 list-inside list-disc">
              {proposal.unsatisfiable.map((problem) => (
                <li key={problem.code + problem.message}>{problem.message}</li>
              ))}
            </ul>
          </div>
        )}

        {proposal && proposal.status !== 'INFEASIBLE' && (
          <div className="space-y-2">
            <h2 className="flex flex-wrap items-center gap-2 font-heading text-lg font-semibold">
              Proposed timetable
              <Badge>{proposal.status === 'OPTIMAL' ? 'Best possible' : 'Best found in time'}</Badge>
            </h2>
            <Proposal
              key={attempt}
              semesterId={semesterId}
              proposal={proposal}
              slots={slotList}
              rooms={rooms.data?.data ?? []}
              onSaved={() => setProposal(null)}
            />
          </div>
        )}
      </div>
    </>
  );
}
