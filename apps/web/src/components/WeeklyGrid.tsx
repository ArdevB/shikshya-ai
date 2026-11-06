import { DAY_NAMES, type TimetableEntryView, type TimetableSlotView } from '@shikshya/shared';
import { useState, type DragEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn, todayInNepal } from '@/lib/utils';

export const SHORT_DAY = (day: number) => DAY_NAMES[day]?.slice(0, 3) ?? '';

/** Sunday is 0. Uses the Nepal date, so "today" is right wherever the browser is. */
const todayIndex = () => new Date(`${todayInNepal()}T00:00:00Z`).getUTCDay();

interface WeeklyGridProps {
  slots: TimetableSlotView[];
  entries: TimetableEntryView[];
  /** What to show for a class in a cell. */
  renderEntry: (entry: TimetableEntryView) => ReactNode;
  /** Set for the editor: makes empty cells targets. */
  onCellSelect?: (slot: TimetableSlotView) => void;
  onCellDrop?: (slot: TimetableSlotView, event: DragEvent) => void;
}

/** A table on wider screens and one day at a time on phones. */
export function WeeklyGrid({
  slots,
  entries,
  renderEntry,
  onCellSelect,
  onCellDrop,
}: WeeklyGridProps) {
  const days = [...new Set(slots.map((slot) => slot.dayOfWeek))].sort((a, b) => a - b);
  const times = [...new Set(slots.map((slot) => `${slot.startTime}|${slot.endTime}`))].sort();

  const today = todayIndex();
  const [mobileDay, setMobileDay] = useState(days.includes(today) ? today : (days[0] ?? 0));

  const slotAt = (day: number, time: string) =>
    slots.find((slot) => slot.dayOfWeek === day && `${slot.startTime}|${slot.endTime}` === time);
  const entriesIn = (slot: TimetableSlotView | undefined) =>
    slot ? entries.filter((entry) => entry.timeSlotId === slot.id) : [];

  const cell = (slot: TimetableSlotView | undefined) => {
    if (!slot) return null;
    const here = entriesIn(slot);
    return (
      <div
        className="flex h-full min-h-14 flex-col gap-1"
        onDragOver={onCellDrop ? (event) => event.preventDefault() : undefined}
        onDrop={onCellDrop ? (event) => onCellDrop(slot, event) : undefined}
      >
        {here.map((entry) => (
          <div key={entry.id}>{renderEntry(entry)}</div>
        ))}
        {onCellSelect && here.length === 0 && (
          <button
            type="button"
            aria-label={`Place in ${DAY_NAMES[slot.dayOfWeek]} ${slot.startTime}`}
            className="min-h-14 w-full flex-1 rounded-md border border-dashed text-xs text-muted-foreground hover:border-primary hover:bg-primary-soft"
            onClick={() => onCellSelect(slot)}
          />
        )}
      </div>
    );
  };

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full min-w-[720px] table-fixed text-sm">
          <thead className="bg-primary-soft">
            <tr>
              <th scope="col" className="w-20 px-2 py-2 text-left font-semibold">
                Time
              </th>
              {days.map((day) => (
                <th
                  key={day}
                  scope="col"
                  className={cn(
                    'px-2 py-2 text-left font-semibold',
                    day === today && 'text-accent-dark',
                  )}
                >
                  {SHORT_DAY(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {times.map((time) => {
              const [start, end] = time.split('|');
              return (
                <tr key={time} className="border-t align-top">
                  <th scope="row" className="px-2 py-2 text-left text-xs font-medium">
                    {start}
                    <span className="block text-muted-foreground">{end}</span>
                  </th>
                  {days.map((day) => (
                    <td key={day} className="border-l p-1">
                      {cell(slotAt(day, time))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        <div role="tablist" aria-label="Day" className="grid grid-cols-6 gap-1">
          {days.map((day) => (
            <Button
              key={day}
              role="tab"
              aria-selected={day === mobileDay}
              variant={day === mobileDay ? 'default' : 'outline'}
              size="sm"
              className="px-0"
              onClick={() => setMobileDay(day)}
            >
              {SHORT_DAY(day)}
            </Button>
          ))}
        </div>
        <ul className="space-y-2">
          {times.map((time) => {
            const slot = slotAt(mobileDay, time);
            const [start, end] = time.split('|');
            if (!slot || (!onCellSelect && entriesIn(slot).length === 0)) return null;
            return (
              <li key={time} className="flex gap-3 rounded-lg border p-2">
                <div className="w-12 shrink-0 text-xs font-medium">
                  {start}
                  <span className="block text-muted-foreground">{end}</span>
                </div>
                <div className="min-w-0 flex-1">{cell(slot)}</div>
              </li>
            );
          })}
          {!onCellSelect &&
            !times.some((time) => entriesIn(slotAt(mobileDay, time)).length > 0) && (
              <li className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No classes on {DAY_NAMES[mobileDay]}.
              </li>
            )}
        </ul>
      </div>
    </>
  );
}

/** A class as shown in a read-only grid. */
export function EntryChip({
  entry,
  show,
}: {
  entry: TimetableEntryView;
  show: 'teacher' | 'section' | 'both';
}) {
  return (
    <div className="rounded-md border-l-4 border-primary bg-primary-soft px-2 py-1.5 text-xs leading-snug">
      <p className="font-semibold">{entry.courseCode}</p>
      <p className="truncate text-muted-foreground" title={entry.courseTitle}>
        {entry.courseTitle}
      </p>
      <p className="truncate text-muted-foreground">
        {entry.roomName}
        {(show === 'section' || show === 'both') && `, Sec ${entry.sectionName}`}
        {(show === 'teacher' || show === 'both') && `, ${entry.teacherName}`}
      </p>
    </div>
  );
}
