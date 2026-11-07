import type {
  OfferingPeriodsBody,
  TeacherUnavailabilityBody,
  TimetableApplyBody,
  TimetableGeneratorInputs,
  TimetableGenerateBody,
  TimetablePlacement,
  TimetableProposal,
  TimetableProposalEntry,
} from '@shikshya/shared';
import { DAY_NAMES } from '@shikshya/shared';
import { logAiCall } from '../lib/aiLog.js';
import { callAiService } from '../lib/aiService.js';
import { writeAudit } from '../lib/audit.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import type { CurrentUser } from '../middleware/auth.js';
import { type ClashEntry, findClashes } from './clashes.js';

const fullName = (user: { firstName: string; lastName: string }) =>
  `${user.firstName} ${user.lastName}`;

/** Unless an admin has set them, a course meets once per credit hour, and practicals get 2 lab periods. */
export const defaultTheoryPeriods = (creditHours: number) => creditHours;
export const defaultLabPeriods = (hasPractical: boolean) => (hasPractical ? 2 : 0);

async function loadSemester(semesterId: string) {
  const semester = await prisma.semester.findUnique({ where: { id: semesterId } });
  if (!semester) throw notFound('Semester');
  return semester;
}

async function loadOfferings(semesterId: string) {
  const offerings = await prisma.courseOffering.findMany({
    where: { section: { semesterId } },
    select: {
      id: true,
      sectionId: true,
      teacherId: true,
      weeklyTheoryPeriods: true,
      weeklyLabPeriods: true,
      course: { select: { code: true, title: true, creditHours: true, hasPractical: true } },
      section: {
        select: {
          name: true,
          _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
        },
      },
      teacher: {
        select: {
          user: { select: { firstName: true, lastName: true } },
          unavailability: { select: { timeSlotId: true } },
        },
      },
    },
    orderBy: [{ section: { name: 'asc' } }, { course: { code: 'asc' } }],
  });
  return offerings.map((offering) => ({
    ...offering,
    theoryPeriods: offering.weeklyTheoryPeriods ?? defaultTheoryPeriods(offering.course.creditHours),
    labPeriods: offering.weeklyLabPeriods ?? defaultLabPeriods(offering.course.hasPractical),
  }));
}

export async function generatorInputs(semesterId: string): Promise<TimetableGeneratorInputs> {
  await loadSemester(semesterId);
  const [offerings, roomCount, slotCount] = await Promise.all([
    loadOfferings(semesterId),
    prisma.room.count(),
    prisma.timeSlot.count(),
  ]);
  const teachers = new Map<string, TimetableGeneratorInputs['teachers'][number]>();
  for (const offering of offerings) {
    teachers.set(offering.teacherId, {
      id: offering.teacherId,
      name: fullName(offering.teacher.user),
      unavailableSlotIds: offering.teacher.unavailability.map((item) => item.timeSlotId),
    });
  }
  return {
    roomCount,
    slotCount,
    teachers: [...teachers.values()].sort((a, b) => a.name.localeCompare(b.name)),
    offerings: offerings.map((offering) => ({
      id: offering.id,
      courseCode: offering.course.code,
      courseTitle: offering.course.title,
      sectionId: offering.sectionId,
      sectionName: offering.section.name,
      teacherId: offering.teacherId,
      teacherName: fullName(offering.teacher.user),
      size: offering.section._count.enrollments,
      theoryPeriods: offering.theoryPeriods,
      labPeriods: offering.labPeriods,
    })),
  };
}

export async function setOfferingPeriods(id: string, body: OfferingPeriodsBody) {
  const offering = await prisma.courseOffering.findUnique({ where: { id }, select: { id: true } });
  if (!offering) throw notFound('Course offering');
  await prisma.courseOffering.update({
    where: { id },
    data: { weeklyTheoryPeriods: body.theoryPeriods, weeklyLabPeriods: body.labPeriods },
  });
}

export async function setTeacherUnavailability(id: string, body: TeacherUnavailabilityBody) {
  const teacher = await prisma.teacher.findUnique({ where: { id }, select: { id: true } });
  if (!teacher) throw notFound('Teacher');
  await prisma.$transaction([
    prisma.teacherUnavailability.deleteMany({ where: { teacherId: id } }),
    prisma.teacherUnavailability.createMany({
      data: [...new Set(body.timeSlotIds)].map((timeSlotId) => ({ teacherId: id, timeSlotId })),
    }),
  ]);
}

/** Entries from other semesters running at the same time. They share rooms and teachers. */
async function overlappingEntries(semester: { id: string; startDate: Date; endDate: Date }) {
  return prisma.timetableEntry.findMany({
    where: {
      semesterId: { not: semester.id },
      semester: { startDate: { lte: semester.endDate }, endDate: { gte: semester.startDate } },
    },
    select: {
      id: true,
      timeSlotId: true,
      roomId: true,
      courseOffering: { select: { teacherId: true, sectionId: true } },
    },
  });
}

interface SolverResult {
  status: TimetableProposal['status'];
  placements: TimetablePlacement[];
  score: TimetableProposal['score'];
  unsatisfiable: TimetableProposal['unsatisfiable'];
  solveSeconds: number;
}

/** Checks a set of placements the same way the manual editor checks one entry. */
async function clashesIn(
  semester: { id: string; startDate: Date; endDate: Date },
  placements: TimetablePlacement[],
) {
  const offerings = await prisma.courseOffering.findMany({
    where: { id: { in: [...new Set(placements.map((item) => item.offeringId))] } },
    select: { id: true, teacherId: true, sectionId: true },
  });
  const byId = new Map(offerings.map((offering) => [offering.id, offering]));
  const others = await overlappingEntries(semester);
  const entries: ClashEntry[] = [
    ...others.map((entry) => ({
      id: entry.id,
      timeSlotId: entry.timeSlotId,
      roomId: entry.roomId,
      teacherId: entry.courseOffering.teacherId,
      sectionId: entry.courseOffering.sectionId,
    })),
    ...placements.map((item, index) => {
      const offering = byId.get(item.offeringId);
      if (!offering) throw notFound('Course offering');
      return {
        id: `new-${index}`,
        timeSlotId: item.timeSlotId,
        roomId: item.roomId,
        teacherId: offering.teacherId,
        sectionId: offering.sectionId,
      };
    }),
  ];
  return findClashes(entries).filter((clash) => clash.entryIds.some((id) => id.startsWith('new-')));
}

async function describe(placements: TimetablePlacement[]): Promise<TimetableProposalEntry[]> {
  const [offerings, rooms, slots] = await Promise.all([
    prisma.courseOffering.findMany({
      where: { id: { in: [...new Set(placements.map((item) => item.offeringId))] } },
      select: {
        id: true,
        sectionId: true,
        course: { select: { code: true, title: true } },
        section: { select: { name: true } },
        teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
      },
    }),
    prisma.room.findMany({ select: { id: true, name: true } }),
    prisma.timeSlot.findMany(),
  ]);
  const offeringById = new Map(offerings.map((offering) => [offering.id, offering]));
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));

  return placements.map((item) => {
    const offering = offeringById.get(item.offeringId)!;
    const slot = slotById.get(item.timeSlotId);
    const room = roomById.get(item.roomId);
    if (!slot || !room) throw badRequest('That room or time slot no longer exists');
    return {
      ...item,
      courseCode: offering.course.code,
      courseTitle: offering.course.title,
      sectionId: offering.sectionId,
      sectionName: offering.section.name,
      teacherName: fullName(offering.teacher.user),
      roomName: room.name,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
    };
  });
}

/** Asks the solver for a proposal. Nothing is saved until an admin has looked at it. */
export async function generateTimetable(
  user: CurrentUser,
  body: TimetableGenerateBody,
): Promise<TimetableProposal> {
  const semester = await loadSemester(body.semesterId);
  const [offerings, rooms, slots, sections, others] = await Promise.all([
    loadOfferings(semester.id),
    prisma.room.findMany({ select: { id: true, name: true, type: true, capacity: true } }),
    prisma.timeSlot.findMany({
      select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
    }),
    prisma.section.findMany({
      where: { semesterId: semester.id },
      select: {
        id: true,
        name: true,
        _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
      },
    }),
    overlappingEntries(semester),
  ]);
  if (offerings.length === 0) throw badRequest('This semester has no classes to timetable yet');

  const teachers = new Map(
    offerings.map((offering) => [
      offering.teacherId,
      { id: offering.teacherId, name: fullName(offering.teacher.user) },
    ]),
  );
  // A teacher in another semester's class at that time is as unavailable as one on leave.
  const unavailable = [
    ...offerings.flatMap((offering) =>
      offering.teacher.unavailability.map((item) => ({
        teacherId: offering.teacherId,
        timeSlotId: item.timeSlotId,
      })),
    ),
    ...others.map((entry) => ({
      teacherId: entry.courseOffering.teacherId,
      timeSlotId: entry.timeSlotId,
    })),
  ];

  const started = Date.now();
  let solved: SolverResult;
  try {
    solved = await callAiService<SolverResult>('/timetable/generate', {
      sections: sections.map((section) => ({
        id: section.id,
        name: section.name,
        size: section._count.enrollments,
      })),
      offerings: offerings.map((offering) => ({
        id: offering.id,
        sectionId: offering.sectionId,
        teacherId: offering.teacherId,
        courseCode: offering.course.code,
        theoryPeriods: offering.theoryPeriods,
        labPeriods: offering.labPeriods,
      })),
      teachers: [...teachers.values()],
      rooms,
      timeSlots: slots,
      unavailable,
      bookedRooms: others.map((entry) => ({ roomId: entry.roomId, timeSlotId: entry.timeSlotId })),
    });
  } catch (error) {
    await logAiCall({
      userId: user.id,
      feature: 'TIMETABLE',
      model: 'or-tools-cp-sat',
      latencyMs: Date.now() - started,
      succeeded: false,
      errorCode: 'AI_SERVICE_FAILED',
    });
    throw error;
  }
  await logAiCall({
    userId: user.id,
    feature: 'TIMETABLE',
    model: 'or-tools-cp-sat',
    latencyMs: Date.now() - started,
    succeeded: solved.status !== 'INFEASIBLE',
    errorCode: solved.status === 'INFEASIBLE' ? 'INFEASIBLE' : undefined,
  });

  return {
    status: solved.status,
    score: solved.score ?? null,
    unsatisfiable: solved.unsatisfiable,
    solveSeconds: solved.solveSeconds,
    entries: await describe(solved.placements),
    // Not taking the solver's word for it: this is the same check a manual edit goes through.
    clashes: solved.placements.length
      ? (await clashesIn(semester, solved.placements)).length
      : 0,
  };
}

function clashText(type: string, entry: TimetableProposalEntry | undefined) {
  if (!entry) return 'Two classes clash';
  const when = `${DAY_NAMES[entry.dayOfWeek]} at ${entry.startTime}`;
  switch (type) {
    case 'ROOM':
      return `${entry.roomName} has two classes on ${when}, including ${entry.courseCode}`;
    case 'TEACHER':
      return `${entry.teacherName} has two classes on ${when}, including ${entry.courseCode}`;
    default:
      return `Section ${entry.sectionName} has two classes on ${when}, including ${entry.courseCode}`;
  }
}

/** For checking a change while reviewing, before anything is saved. */
export async function checkPlacements(body: TimetableApplyBody) {
  const semester = await loadSemester(body.semesterId);
  const entries = await describe(body.placements);
  const clashes = await clashesIn(semester, body.placements);
  return {
    clashes: clashes.map((clash) => {
      const newId = clash.entryIds.find((id) => id.startsWith('new-'));
      const entry = newId ? entries[Number(newId.slice(4))] : undefined;
      return { type: clash.type, message: clashText(clash.type, entry) };
    }),
  };
}

/** Replaces the semester's timetable with the reviewed one, after the same clash check. */
export async function applyTimetable(user: CurrentUser, body: TimetableApplyBody) {
  const semester = await loadSemester(body.semesterId);
  const { clashes } = await checkPlacements(body);
  if (clashes.length > 0) {
    throw conflict(clashes.map((clash) => clash.message).join('. '), clashes);
  }

  // Every class must belong to this semester, whatever the request says.
  const belonging = await prisma.courseOffering.count({
    where: {
      id: { in: [...new Set(body.placements.map((item) => item.offeringId))] },
      section: { semesterId: semester.id },
    },
  });
  if (belonging !== new Set(body.placements.map((item) => item.offeringId)).size) {
    throw badRequest('Some of these classes are not in this semester');
  }

  await prisma.$transaction(async (tx) => {
    const removed = await tx.timetableEntry.deleteMany({ where: { semesterId: semester.id } });
    await tx.timetableEntry.createMany({
      data: body.placements.map((item) => ({
        courseOfferingId: item.offeringId,
        roomId: item.roomId,
        timeSlotId: item.timeSlotId,
        semesterId: semester.id,
      })),
    });
    await writeAudit(
      {
        actorId: user.id,
        action: 'TIMETABLE_GENERATED',
        entity: 'Semester',
        entityId: semester.id,
        before: { entries: removed.count },
        after: { entries: body.placements.length },
      },
      tx,
    );
  });
  return { saved: body.placements.length };
}
