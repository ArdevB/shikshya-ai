import type { ClashType, TimetableClash } from '@shikshya/shared';

/** What clash detection needs to know about a timetable entry. */
export interface ClashEntry {
  id: string;
  timeSlotId: string;
  roomId: string;
  teacherId: string;
  sectionId: string;
}

/**
 * Finds every double booking in a list of entries: the same room, the same teacher or the
 * same section in one time slot. Pure, so the Phase 4 generator's output can be checked by
 * the same code as a manual edit.
 */
export function findClashes(entries: readonly ClashEntry[]): TimetableClash[] {
  const checks: { type: ClashType; key: (entry: ClashEntry) => string }[] = [
    { type: 'ROOM', key: (e) => e.roomId },
    { type: 'TEACHER', key: (e) => e.teacherId },
    { type: 'SECTION', key: (e) => e.sectionId },
  ];

  const clashes: TimetableClash[] = [];
  for (const { type, key } of checks) {
    const firstSeen = new Map<string, ClashEntry>();
    for (const entry of entries) {
      const slotKey = `${entry.timeSlotId}|${key(entry)}`;
      const earlier = firstSeen.get(slotKey);
      if (earlier) {
        clashes.push({ type, entryIds: [earlier.id, entry.id], timeSlotId: entry.timeSlotId });
      } else {
        firstSeen.set(slotKey, entry);
      }
    }
  }
  return clashes;
}
