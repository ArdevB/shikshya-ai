import type { Prisma } from '@prisma/client';
import {
  DAY_NAMES,
  type PaginationQuery,
  type RoomBody,
  type TimeSlotBody,
  type TimetableClash,
  type TimetableEntryBody,
  type TimetableEntryView,
  type WeeklyTimetable,
} from '@shikshya/shared';
import { conflict, notFound } from '../lib/errors.js';
import { pageArgs, paginated } from '../lib/pagination.js';
import { prisma } from '../lib/prisma.js';
import { findClashes, type ClashEntry } from './clashes.js';

// ---------- Rooms and time slots ----------

export const rooms = {
  list: async (query: PaginationQuery) => {
    const [rows, total] = await Promise.all([
      prisma.room.findMany({ ...pageArgs(query), orderBy: { name: 'asc' } }),
      prisma.room.count(),
    ]);
    return paginated(rows, total, query);
  },
  get: (id: string) => prisma.room.findUniqueOrThrow({ where: { id } }),
  create: (data: RoomBody) => prisma.room.create({ data }),
  update: (id: string, data: RoomBody) => prisma.room.update({ where: { id }, data }),
  remove: (id: string) => prisma.room.delete({ where: { id } }),
};

export const timeSlots = {
  list: async (query: PaginationQuery & { dayOfWeek?: number }) => {
    const where = { dayOfWeek: query.dayOfWeek };
    const [rows, total] = await Promise.all([
      prisma.timeSlot.findMany({
        ...pageArgs(query),
        where,
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      prisma.timeSlot.count({ where }),
    ]);
    return paginated(rows, total, query);
  },
  get: (id: string) => prisma.timeSlot.findUniqueOrThrow({ where: { id } }),
  create: (data: TimeSlotBody) => prisma.timeSlot.create({ data }),
  update: (id: string, data: TimeSlotBody) => prisma.timeSlot.update({ where: { id }, data }),
  remove: (id: string) => prisma.timeSlot.delete({ where: { id } }),
};

// ---------- Timetable entries ----------

const entryInclude = {
  room: { select: { name: true } },
  timeSlot: true,
  courseOffering: {
    select: {
      teacherId: true,
      sectionId: true,
      course: { select: { code: true, title: true } },
      section: { select: { name: true } },
      teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
    },
  },
} as const;

type EntryRow = Prisma.TimetableEntryGetPayload<{ include: typeof entryInclude }>;

function toView(entry: EntryRow): TimetableEntryView {
  const { courseOffering: offering, timeSlot: slot } = entry;
  return {
    id: entry.id,
    courseOfferingId: entry.courseOfferingId,
    roomId: entry.roomId,
    timeSlotId: entry.timeSlotId,
    semesterId: entry.semesterId,
    courseCode: offering.course.code,
    courseTitle: offering.course.title,
    sectionId: offering.sectionId,
    sectionName: offering.section.name,
    teacherId: offering.teacherId,
    teacherName: `${offering.teacher.user.firstName} ${offering.teacher.user.lastName}`,
    roomName: entry.room.name,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
  };
}

const clashMessage = (
  type: TimetableClash['type'],
  existing: EntryRow,
  slot: { dayOfWeek: number; startTime: string },
) => {
  const when = `${DAY_NAMES[slot.dayOfWeek]} at ${slot.startTime}`;
  const what = `${existing.courseOffering.course.code} (Section ${existing.courseOffering.section.name})`;
  switch (type) {
    case 'ROOM':
      return `${existing.room.name} is already booked ${when} for ${what}`;
    case 'TEACHER':
      return `${existing.courseOffering.teacher.user.firstName} ${existing.courseOffering.teacher.user.lastName} is already teaching ${what} ${when}`;
    case 'SECTION':
      return `Section ${existing.courseOffering.section.name} already has ${existing.courseOffering.course.code} ${when}`;
  }
};

export async function createEntry(body: TimetableEntryBody) {
  const [offering, slot] = await Promise.all([
    prisma.courseOffering.findUnique({
      where: { id: body.courseOfferingId },
      include: { section: { include: { semester: true } } },
    }),
    prisma.timeSlot.findUnique({ where: { id: body.timeSlotId } }),
  ]);
  if (!offering) throw notFound('Course offering');
  if (!slot) throw notFound('Time slot');
  const semester = offering.section.semester;

  // A room or teacher is shared with every semester running at the same time, including other
  // programs. Semesters that do not overlap in time cannot clash, however.
  const others = await prisma.timetableEntry.findMany({
    where: {
      timeSlotId: body.timeSlotId,
      semester: { startDate: { lte: semester.endDate }, endDate: { gte: semester.startDate } },
    },
    include: entryInclude,
  });

  const candidate: ClashEntry = {
    id: 'new',
    timeSlotId: body.timeSlotId,
    roomId: body.roomId,
    teacherId: offering.teacherId,
    sectionId: offering.sectionId,
  };
  const clashes = findClashes([
    ...others.map((e) => ({
      id: e.id,
      timeSlotId: e.timeSlotId,
      roomId: e.roomId,
      teacherId: e.courseOffering.teacherId,
      sectionId: e.courseOffering.sectionId,
    })),
    candidate,
  ]).filter((clash) => clash.entryIds.includes('new'));

  if (clashes.length > 0) {
    const detailed = clashes.map((clash) => {
      const existing = others.find((e) => e.id === clash.entryIds[0])!;
      return { ...clash, message: clashMessage(clash.type, existing, slot) };
    });
    throw conflict(detailed.map((c) => c.message).join('. '), detailed);
  }

  const entry = await prisma.timetableEntry.create({
    data: { ...body, semesterId: semester.id },
    include: entryInclude,
  });
  return toView(entry);
}

export const deleteEntry = (id: string) => prisma.timetableEntry.delete({ where: { id } });

async function weeklyTimetable(where: Prisma.TimetableEntryWhereInput): Promise<WeeklyTimetable> {
  const [slots, entries] = await Promise.all([
    prisma.timeSlot.findMany({ orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] }),
    prisma.timetableEntry.findMany({ where, include: entryInclude }),
  ]);
  return { slots, entries: entries.map(toView) };
}

export function getTimetable(query: { sectionId?: string; teacherId?: string; roomId?: string }) {
  return weeklyTimetable({
    roomId: query.roomId,
    courseOffering: { sectionId: query.sectionId, teacherId: query.teacherId },
  });
}

/** Scope checks are the caller's job. */
export async function getStudentTimetable(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { currentSectionId: true },
  });
  if (!student) throw notFound('Student');
  return getTimetable({ sectionId: student.currentSectionId });
}

/** One day's classes for a section or teacher, in time order. */
export async function classesOnDay(
  day: number,
  where: { sectionId?: string; teacherId?: string },
): Promise<TimetableEntryView[]> {
  const entries = await prisma.timetableEntry.findMany({
    where: { timeSlot: { dayOfWeek: day }, courseOffering: where },
    include: entryInclude,
    orderBy: { timeSlot: { startTime: 'asc' } },
  });
  return entries.map(toView);
}
