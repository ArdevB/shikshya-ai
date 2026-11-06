import { DAY_NAMES, type TimetableEntryView, type TimetableSlotView } from '@shikshya/shared';
import { useState, type DragEvent, type ReactNode } from 'react';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
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
          <div key={entry.id} className="animate-pop">
            {renderEntry(entry)}
          </div>
        ))}
        {onCellSelect && here.length === 0 && (
          <button
            type="button"
            aria-label={`Place in ${DAY_NAMES[slot.dayOfWeek]} ${slot.startTime}`}
            className="min-h-14 w-full flex-1 rounded-lg border border-dashed text-xs text-muted-foreground transition-colors duration-200 hover:border-primary hover:bg-primary-soft"
            onClick={() => onCellSelect(slot)}
          />
        )}
      </div>
    );
  };

  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border bg-card shadow-soft md:block">
        <table className="w-full min-w-[720px] table-fixed text-sm">
          <thead>
            <tr className="bg-primary-soft/60">
              <th
                scope="col"
                className="w-20 px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground"
              >
                Time
              </th>
              {days.map((day) => (
                <th
                  key={day}
                  scope="col"
                  aria-current={day === today ? 'date' : undefined}
                  className={cn(
                    'px-2 py-2.5 text-left text-xs font-semibold',
                    day === today ? 'text-accent-dark' : 'text-muted-foreground',
                  )}
                >
                  {SHORT_DAY(day)}
                  {day === today && <span className="ml-1 font-medium">· Today</span>}
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
                    <td
                      key={day}
                      className={cn('border-l p-1', day === today && 'bg-accent-soft/30')}
                    >
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
        <SegmentedTabs
          label="Day"
          stretch
          value={String(mobileDay)}
          onChange={(value) => setMobileDay(Number(value))}
          tabs={days.map((day) => ({ value: String(day), label: SHORT_DAY(day) }))}
        />
        {/* The key restarts the entrance, so changing day visibly brings in the new one. */}
        <ul key={mobileDay} className="stagger-children space-y-2">
          {times.map((time) => {
            const slot = slotAt(mobileDay, time);
            const [start, end] = time.split('|');
            if (!slot || (!onCellSelect && entriesIn(slot).length === 0)) return null;
            return (
              <li key={time} className="flex gap-3 rounded-2xl border bg-card p-2.5 shadow-soft">
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
              <li className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
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
    <div className="rounded-lg border-l-4 border-primary bg-primary-soft px-2 py-1.5 text-xs leading-snug transition-shadow duration-200 hover:shadow-soft">
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
