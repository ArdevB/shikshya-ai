import { DAY_NAMES, eventBody, type EventView } from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useCurrentUser } from '@/auth/AuthContext';
import { ADMIN_ROLES } from '@/auth/roles';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog, ResourceForm, type FormFieldConfig } from '@/components/ResourceManager';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { sectionLabel, type Program, type Section } from '@/lib/types';
import { useOptions } from '@/lib/useOptions';
import { cn, formatDateTime, nepalDateKey, toDateTimeInput, todayInNepal } from '@/lib/utils';
import { AUDIENCE_LABEL } from './NoticesPage';

const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** The weeks shown for a month, Sunday first, including days from either side. */
export function monthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const days: string[] = [];
  for (let i = 0; i < 42; i += 1) {
    days.push(iso(new Date(start.getTime() + i * 86_400_000)));
  }
  // Drop the last week when it falls entirely in the next month.
  const lastWeekStart = new Date(`${days[35]}T00:00:00Z`);
  return lastWeekStart.getUTCMonth() === month ? days : days.slice(0, 35);
}

const toIso = (value: unknown) =>
  typeof value === 'string' && value ? new Date(value).toISOString() : '';

export function EventsPage() {
  const user = useCurrentUser();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const queryClient = useQueryClient();

  const today = todayInNepal();
  const [cursor, setCursor] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)) - 1,
  }));
  const [selectedDay, setSelectedDay] = useState(today);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EventView | null>(null);
  const [deleting, setDeleting] = useState<EventView | null>(null);

  const days = monthGrid(cursor.year, cursor.month);
  const from = `${days[0]}T00:00:00.000Z`;
  const to = `${days.at(-1)}T23:59:59.000Z`;

  const query = useQuery({
    queryKey: ['events', from, to],
    queryFn: () =>
      api.get<EventView[]>(`/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  });

  // Only admins can target any program or section, so nobody else needs these lists.
  const programs = useOptions<Program>(
    '/programs',
    (p) => ({ value: p.id, label: p.name }),
    {},
    isAdmin,
  );
  const sections = useOptions<Section>(
    '/sections',
    (s) => ({ value: s.id, label: sectionLabel(s) }),
    {},
    isAdmin,
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['events'] });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/events/${id}`),
    onSuccess: async () => {
      setDeleting(null);
      toast.success('Deleted');
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const move = (step: number) =>
    setCursor(({ year, month }) => {
      const next = new Date(Date.UTC(year, month + step, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });

  /** An event appears on each day it runs, in Nepal time. */
  const eventsOn = (day: string) =>
    (query.data ?? []).filter(
      (event) => nepalDateKey(event.startAt) <= day && day <= nepalDateKey(event.endAt),
    );

  const fields: FormFieldConfig[] = [
    { name: 'title', label: 'Title' },
    { name: 'description', label: 'Description (optional)', type: 'textarea' },
    { name: 'startAt', label: 'Starts', type: 'datetime-local' },
    { name: 'endAt', label: 'Ends', type: 'datetime-local' },
    { name: 'location', label: 'Location (optional)' },
    {
      name: 'audience',
      label: 'Who should see this',
      type: 'select',
      options: Object.entries(AUDIENCE_LABEL).map(([value, label]) => ({ value, label })),
    },
    { name: 'programId', label: 'Program (if for a program)', type: 'select', options: programs },
    { name: 'sectionId', label: 'Section (if for a section)', type: 'select', options: sections },
  ];
  const toBody = (values: Record<string, unknown>) => ({
    ...values,
    startAt: toIso(values.startAt),
    endAt: toIso(values.endAt),
  });

  const selected = eventsOn(selectedDay);

  return (
    <>
      <PageHeader
        title="Events"
        actions={
          isAdmin && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New event
            </Button>
          )
        }
      />

      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => move(-1)}>
          <ChevronLeft />
        </Button>
        <h2 className="font-heading text-lg font-semibold" aria-live="polite">
          {MONTH_FORMAT.format(new Date(Date.UTC(cursor.year, cursor.month, 1)))}
        </h2>
        <Button variant="outline" size="icon" aria-label="Next month" onClick={() => move(1)}>
          <ChevronRight />
        </Button>
      </div>

      {query.isPending ? (
        <LoadingRows rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border">
            <div className="grid grid-cols-7 bg-primary-soft text-center text-xs font-semibold">
              {DAY_NAMES.map((name) => (
                <div key={name} className="py-2">
                  {name.slice(0, 3)}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const inMonth = Number(day.slice(5, 7)) - 1 === cursor.month;
                const dayEvents = eventsOn(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-label={`${day}, ${dayEvents.length} events`}
                    aria-pressed={selectedDay === day}
                    onClick={() => setSelectedDay(day)}
                    className={cn(
                      'flex min-h-14 flex-col gap-1 border-l border-t p-1 text-left text-xs transition-colors hover:bg-primary-soft md:min-h-24',
                      !inMonth && 'text-muted-foreground/60',
                      selectedDay === day && 'bg-primary-soft',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full',
                        day === today && 'bg-accent font-semibold text-accent-foreground',
                      )}
                    >
                      {Number(day.slice(8))}
                    </span>
                    <span className="hidden space-y-0.5 md:block">
                      {dayEvents.slice(0, 2).map((event) => (
                        <span
                          key={event.id}
                          className="block truncate border-l-2 border-primary bg-primary-soft px-1"
                        >
                          {event.title}
                        </span>
                      ))}
                      {dayEvents.length > 2 && (
                        <span className="block text-muted-foreground">
                          +{dayEvents.length - 2} more
                        </span>
                      )}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="size-1.5 rounded-full bg-accent md:hidden" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {selected.length === 0 ? (
            <EmptyState icon={CalendarDays} title={`No events on ${selectedDay}`} />
          ) : (
            <ul className="space-y-3">
              {selected.map((event) => (
                <li key={event.id}>
                  <Card>
                    <CardContent className="flex items-start justify-between gap-3 pt-5">
                      <div className="min-w-0 space-y-1">
                        <h3 className="font-semibold">{event.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {formatDateTime(event.startAt)} to {formatDateTime(event.endAt)}
                        </p>
                        {event.location && (
                          <p className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="size-4" aria-hidden /> {event.location}
                          </p>
                        )}
                        {event.description && <p className="text-sm">{event.description}</p>}
                      </div>
                      {isAdmin && (
                        <div className="flex shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${event.title}`}
                            onClick={() => setEditing(event)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${event.title}`}
                            onClick={() => setDeleting(event)}
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {creating && (
        <ResourceForm
          title="New event"
          fields={fields}
          schema={eventBody}
          preprocess={toBody}
          defaultValues={{
            title: '',
            description: '',
            startAt: '',
            endAt: '',
            location: '',
            audience: 'ALL',
            programId: '',
            sectionId: '',
          }}
          submitLabel="Create"
          isEditing={false}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            await api.post('/events', values);
            toast.success('Event created');
            await invalidate();
          }}
        />
      )}
      {editing && (
        <ResourceForm
          title="Edit event"
          fields={fields}
          schema={eventBody}
          preprocess={toBody}
          defaultValues={{
            title: editing.title,
            description: editing.description ?? '',
            startAt: toDateTimeInput(editing.startAt),
            endAt: toDateTimeInput(editing.endAt),
            location: editing.location ?? '',
            audience: editing.audience,
            programId: editing.programId ?? '',
            sectionId: editing.sectionId ?? '',
          }}
          submitLabel="Save changes"
          isEditing
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await api.put(`/events/${editing.id}`, values);
            toast.success('Saved');
            await invalidate();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.title}?`}
          description="It will disappear for everyone. This cannot be undone."
          confirmLabel="Delete"
          busy={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id)}
        />
      )}
    </>
  );
}
