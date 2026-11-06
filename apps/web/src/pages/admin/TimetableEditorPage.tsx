import {
  MAX_PAGE_SIZE,
  type Paginated,
  type TimetableEntryView,
  type TimetableSlotView,
  type WeeklyTimetable,
} from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, X } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { EmptyState, LoadingRows } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { WeeklyGrid } from '@/components/WeeklyGrid';
import { api, queryString } from '@/lib/api';
import { sectionLabel, type CourseOffering, type Section } from '@/lib/types';
import { useOptions } from '@/lib/useOptions';
import { cn } from '@/lib/utils';

interface Room {
  id: string;
  name: string;
  capacity: number;
  type: string;
}

export function TimetableEditorPage() {
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [selectedOffering, setSelectedOffering] = useState<string | null>(null);

  const sections = useOptions<Section>('/sections', (s) => ({
    value: s.id,
    label: sectionLabel(s),
  }));
  const rooms = useOptions<Room>('/rooms', (r) => ({
    value: r.id,
    label: `${r.name} (${r.capacity})`,
  }));

  const offerings = useQuery({
    queryKey: ['/course-offerings', 'section', sectionId],
    enabled: Boolean(sectionId),
    queryFn: () =>
      api.get<Paginated<CourseOffering>>(
        `/course-offerings${queryString({ sectionId, pageSize: MAX_PAGE_SIZE })}`,
      ),
  });

  const timetableKey = ['timetable', 'section', sectionId];
  const timetable = useQuery({
    queryKey: timetableKey,
    enabled: Boolean(sectionId),
    queryFn: () => api.get<WeeklyTimetable>(`/timetable?sectionId=${sectionId}`),
  });

  const place = useMutation({
    mutationFn: (input: { courseOfferingId: string; timeSlotId: string }) =>
      api.post('/timetable/entries', { ...input, roomId }),
    onSuccess: () => {
      toast.success('Added to the timetable');
      void queryClient.invalidateQueries({ queryKey: timetableKey });
    },
    // The API names the clash, for example which room or teacher is already booked.
    onError: (error) => toast.error(error.message, { duration: 8000 }),
  });

  const remove = useMutation({
    mutationFn: (entryId: string) => api.delete(`/timetable/entries/${entryId}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: timetableKey }),
    onError: (error) => toast.error(error.message),
  });

  const placeIn = (slot: TimetableSlotView, offeringId: string | null) => {
    if (!offeringId) {
      toast.info('Choose a course first');
      return;
    }
    if (!roomId) {
      toast.info('Choose a room first');
      return;
    }
    place.mutate({ courseOfferingId: offeringId, timeSlotId: slot.id });
  };

  const onDrop = (slot: TimetableSlotView, event: DragEvent) => {
    event.preventDefault();
    placeIn(slot, event.dataTransfer.getData('text/plain') || selectedOffering);
  };

  const renderEntry = (entry: TimetableEntryView) => (
    <div className="flex items-start gap-1 rounded-lg border-l-4 border-primary bg-primary-soft py-1.5 pl-2 pr-1 text-xs leading-snug">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{entry.courseCode}</p>
        <p className="truncate text-muted-foreground">{entry.roomName}</p>
        <p className="truncate text-muted-foreground">{entry.teacherName}</p>
      </div>
      <button
        type="button"
        aria-label={`Remove ${entry.courseCode}`}
        className="rounded-sm p-1 text-muted-foreground hover:text-destructive"
        onClick={() => remove.mutate(entry.id)}
      >
        <X className="size-4" />
      </button>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Timetable"
        description="Choose a course and a room, then click a free cell or drag the course into it."
      />
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <FormField label="Section">
          <Select
            value={sectionId}
            onChange={(event) => {
              setSectionId(event.target.value);
              setSelectedOffering(null);
            }}
          >
            <option value="">Choose a section…</option>
            {sections.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Room">
          <Select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
            <option value="">Choose a room…</option>
            {rooms.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {!sectionId ? (
        <EmptyState icon={CalendarDays} title="Choose a section to edit its timetable" />
      ) : timetable.isPending || offerings.isPending ? (
        <LoadingRows rows={6} />
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Courses</p>
            {offerings.data?.data.length ? (
              <ul className="flex flex-wrap gap-2">
                {offerings.data.data.map((offering) => (
                  <li key={offering.id}>
                    <button
                      type="button"
                      draggable
                      aria-pressed={selectedOffering === offering.id}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', offering.id);
                        setSelectedOffering(offering.id);
                      }}
                      onClick={() => setSelectedOffering(offering.id)}
                      className={cn(
                        'min-h-10 cursor-grab rounded-xl border bg-card px-3 py-1.5 text-left text-xs shadow-sm transition-[transform,background-color,border-color] duration-200 ease-spring hover:-translate-y-0.5 hover:bg-primary-soft active:scale-[0.97] active:cursor-grabbing',
                        selectedOffering === offering.id &&
                          'border-accent bg-accent-soft hover:bg-accent-soft',
                      )}
                    >
                      <span className="block font-semibold">{offering.course.code}</span>
                      <span className="text-muted-foreground">
                        {offering.teacher.user.firstName} {offering.teacher.user.lastName}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                This section has no course assignments yet.
              </p>
            )}
          </div>

          {timetable.data?.slots.length ? (
            <WeeklyGrid
              slots={timetable.data.slots}
              entries={timetable.data.entries}
              renderEntry={renderEntry}
              onCellSelect={(slot) => placeIn(slot, selectedOffering)}
              onCellDrop={onDrop}
            />
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="No time slots yet"
              description="Add them under Rooms & Time Slots first."
              action={
                <Button asChild variant="outline" size="sm">
                  <a href="/admin/rooms">Go to Rooms & Time Slots</a>
                </Button>
              }
            />
          )}
        </div>
      )}
    </>
  );
}
