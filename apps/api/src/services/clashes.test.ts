import { describe, expect, it } from 'vitest';
import { findClashes, type ClashEntry } from './clashes.js';

const entry = (id: string, overrides: Partial<ClashEntry> = {}): ClashEntry => ({
  id,
  timeSlotId: `slot-${id}`,
  roomId: `room-${id}`,
  teacherId: `teacher-${id}`,
  sectionId: `section-${id}`,
  ...overrides,
});

describe('findClashes', () => {
  it('finds nothing in a clean timetable', () => {
    expect(findClashes([entry('a'), entry('b')])).toEqual([]);
  });

  it('allows the same room, teacher and section at different times', () => {
    const shared = { roomId: 'r', teacherId: 't', sectionId: 's' };
    expect(
      findClashes([
        entry('a', { ...shared, timeSlotId: 'mon-1' }),
        entry('b', { ...shared, timeSlotId: 'mon-2' }),
      ]),
    ).toEqual([]);
  });

  it('allows different rooms, teachers and sections at the same time', () => {
    expect(
      findClashes([entry('a', { timeSlotId: 'mon-1' }), entry('b', { timeSlotId: 'mon-1' })]),
    ).toEqual([]);
  });

  it('finds a room clash', () => {
    expect(
      findClashes([
        entry('a', { timeSlotId: 'mon-1', roomId: 'r' }),
        entry('b', { timeSlotId: 'mon-1', roomId: 'r' }),
      ]),
    ).toEqual([{ type: 'ROOM', entryIds: ['a', 'b'], timeSlotId: 'mon-1' }]);
  });

  it('finds a teacher clash', () => {
    expect(
      findClashes([
        entry('a', { timeSlotId: 'mon-1', teacherId: 't' }),
        entry('b', { timeSlotId: 'mon-1', teacherId: 't' }),
      ]),
    ).toEqual([{ type: 'TEACHER', entryIds: ['a', 'b'], timeSlotId: 'mon-1' }]);
  });

  it('finds a section clash', () => {
    expect(
      findClashes([
        entry('a', { timeSlotId: 'mon-1', sectionId: 's' }),
        entry('b', { timeSlotId: 'mon-1', sectionId: 's' }),
      ]),
    ).toEqual([{ type: 'SECTION', entryIds: ['a', 'b'], timeSlotId: 'mon-1' }]);
  });

  it('reports every kind of clash at once', () => {
    const shared = { timeSlotId: 'mon-1', roomId: 'r', teacherId: 't', sectionId: 's' };
    const types = findClashes([entry('a', shared), entry('b', shared)]).map((c) => c.type);
    expect(types).toEqual(['ROOM', 'TEACHER', 'SECTION']);
  });
});
