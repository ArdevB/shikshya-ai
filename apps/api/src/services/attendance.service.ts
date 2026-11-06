import type { Prisma } from '@prisma/client';
import {
  ATTENDANCE_EDIT_WINDOW_HOURS,
  calculateAttendance,
  type AttendanceRecordInput,
  type AttendanceSessionBody,
  type AttendanceSessionUpdateBody,
  type AttendanceStatus,
  type OfferingAttendanceReport,
  type PaginationQuery,
  type StudentAttendanceSummary,
} from '@shikshya/shared';
import { writeAudit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { pageArgs, paginated } from '../lib/pagination.js';
import { prisma } from '../lib/prisma.js';
import { todayInNepal } from '../lib/time.js';
import type { CurrentUser } from '../middleware/auth.js';
import { notifySafely, notifyStudentsAndParents } from './notification.service.js';
import {
  assertCanAccessStudent,
  assertCanViewOffering,
  isAdmin,
  teachesOffering,
} from './scope.js';

/** Every record must be for a student enrolled in the offering's section, with no repeats. */
async function assertRecordsMatchSection(sectionId: string, records: AttendanceRecordInput[]) {
  const ids = records.map((r) => r.studentId);
  if (new Set(ids).size !== ids.length) {
    throw badRequest('A student appears more than once in this attendance list');
  }
  const enrolled = await prisma.enrollment.findMany({
    where: { sectionId, studentId: { in: ids }, status: 'ACTIVE' },
    select: { studentId: true },
  });
  if (enrolled.length !== ids.length) {
    const enrolledIds = new Set(enrolled.map((e) => e.studentId));
    throw badRequest('Some students are not enrolled in this section', {
      studentIds: ids.filter((id) => !enrolledIds.has(id)),
    });
  }
}

/**
 * Tells a student and their parents the moment their attendance in a course falls below the
 * line, by comparing it with and without this session. They hear once when it crosses, rather
 * than after every class while it stays low.
 */
export async function notifyAttendanceDrops(
  sessionId: string,
  offeringId: string,
  previous: Map<string, AttendanceStatus>,
) {
  const records = await prisma.attendanceRecord.findMany({
    where: { session: { courseOfferingId: offeringId } },
    select: { studentId: true, sessionId: true, status: true },
  });
  const offering = await prisma.courseOffering.findUniqueOrThrow({
    where: { id: offeringId },
    select: { course: { select: { code: true, title: true } } },
  });

  const byStudent = new Map<string, typeof records>();
  for (const record of records) {
    byStudent.set(record.studentId, [...(byStudent.get(record.studentId) ?? []), record]);
  }

  for (const [studentId, own] of byStudent) {
    if (!own.some((record) => record.sessionId === sessionId)) continue;
    const after = calculateAttendance(own.map((r) => r.status as AttendanceStatus));
    const earlier = own
      .filter((r) => r.sessionId !== sessionId)
      .map((r) => r.status as AttendanceStatus);
    const before = calculateAttendance([
      ...earlier,
      ...(previous.has(studentId) ? [previous.get(studentId) as AttendanceStatus] : []),
    ]);
    if (after.belowThreshold && !before.belowThreshold) {
      await notifyStudentsAndParents([studentId], 'ATTENDANCE_LOW', {
        title: 'Attendance below 75%',
        body: `Attendance in ${offering.course.code} ${offering.course.title} is now ${after.percentage}%.`,
        path: 'attendance',
      });
    }
  }
}

export async function createSession(user: CurrentUser, body: AttendanceSessionBody) {
  const offering = await prisma.courseOffering.findUnique({ where: { id: body.offeringId } });
  // Check the teacher's right first, so an unknown id and someone else's id look the same.
  if (!(await teachesOffering(user, body.offeringId))) throw forbidden();
  if (!offering) throw notFound('Course offering');

  await assertRecordsMatchSection(offering.sectionId, body.records);

  // Both are YYYY-MM-DD, so comparing them as text compares them in time.
  if (body.date > todayInNepal()) {
    throw badRequest('Attendance cannot be taken for a future date');
  }

  const date = new Date(body.date);
  const period = body.period ?? 0;
  const duplicate = await prisma.attendanceSession.findUnique({
    where: {
      courseOfferingId_date_period: { courseOfferingId: body.offeringId, date, period },
    },
    select: { id: true },
  });
  if (duplicate) {
    throw conflict('Attendance has already been taken for this class on this date', {
      sessionId: duplicate.id,
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    const session = await tx.attendanceSession.create({
      data: {
        courseOfferingId: body.offeringId,
        date,
        period,
        takenById: user.id,
        records: { create: body.records },
      },
      include: { records: true },
    });
    await writeAudit(
      {
        actorId: user.id,
        action: 'ATTENDANCE_SESSION_CREATE',
        entity: 'AttendanceSession',
        entityId: session.id,
        after: { offeringId: body.offeringId, date: body.date, period, records: body.records },
      },
      tx,
    );
    return session;
  });
  await notifySafely(() => notifyAttendanceDrops(created.id, body.offeringId, new Map()));
  return created;
}

/** Teachers may edit their own sessions for 48 hours; admins may edit any session at any time. */
export async function updateSession(
  user: CurrentUser,
  sessionId: string,
  body: AttendanceSessionUpdateBody,
  now = new Date(),
) {
  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    include: { records: true, courseOffering: true },
  });
  if (!session) throw notFound('Attendance session');

  if (!isAdmin(user)) {
    if (!(await teachesOffering(user, session.courseOfferingId))) throw forbidden();
    const ageMs = now.getTime() - session.createdAt.getTime();
    if (ageMs > ATTENDANCE_EDIT_WINDOW_HOURS * 60 * 60 * 1000) {
      throw forbidden(
        `Attendance can only be edited within ${ATTENDANCE_EDIT_WINDOW_HOURS} hours. Please ask an admin.`,
      );
    }
  }

  await assertRecordsMatchSection(session.courseOffering.sectionId, body.records);

  const snapshot = (records: { studentId: string; status: string; remark?: string | null }[]) =>
    records.map(({ studentId, status, remark }) => ({ studentId, status, remark: remark ?? null }));

  const updated = await prisma.$transaction(async (tx) => {
    await tx.attendanceRecord.deleteMany({ where: { sessionId } });
    await tx.attendanceRecord.createMany({
      data: body.records.map((record) => ({ ...record, sessionId })),
    });
    await writeAudit(
      {
        actorId: user.id,
        action: 'ATTENDANCE_SESSION_UPDATE',
        entity: 'AttendanceSession',
        entityId: sessionId,
        before: snapshot(session.records),
        after: snapshot(body.records),
      },
      tx,
    );
    return tx.attendanceSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { records: true },
    });
  });
  await notifySafely(() =>
    notifyAttendanceDrops(
      sessionId,
      session.courseOfferingId,
      new Map(session.records.map((r) => [r.studentId, r.status as AttendanceStatus])),
    ),
  );
  return updated;
}

export async function listSessions(
  user: CurrentUser,
  query: PaginationQuery & { offeringId?: string; from?: string; to?: string },
) {
  if (query.offeringId) await assertCanViewOffering(user, query.offeringId);

  const where: Prisma.AttendanceSessionWhereInput = {
    courseOfferingId: query.offeringId,
    // Without a specific offering, a teacher still only gets their own.
    courseOffering: isAdmin(user) ? undefined : { teacher: { userId: user.id } },
    date: {
      gte: query.from ? new Date(query.from) : undefined,
      lte: query.to ? new Date(query.to) : undefined,
    },
  };
  const [rows, total] = await Promise.all([
    prisma.attendanceSession.findMany({
      ...pageArgs(query),
      where,
      orderBy: [{ date: 'desc' }, { period: 'asc' }],
      include: {
        records: true,
        courseOffering: {
          select: {
            id: true,
            course: { select: { code: true, title: true } },
            section: { select: { name: true } },
          },
        },
      },
    }),
    prisma.attendanceSession.count({ where }),
  ]);
  return paginated(rows, total, query);
}

export async function getSession(user: CurrentUser, sessionId: string) {
  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    include: { records: true },
  });
  if (!session) throw notFound('Attendance session');
  await assertCanViewOffering(user, session.courseOfferingId);
  return session;
}

export async function getStudentSummary(
  user: CurrentUser,
  studentId: string,
): Promise<StudentAttendanceSummary> {
  await assertCanAccessStudent(user, studentId);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      rollNumber: true,
      user: { select: { firstName: true, lastName: true } },
      enrollments: {
        where: { status: 'ACTIVE' },
        select: {
          section: {
            select: {
              offerings: {
                select: {
                  id: true,
                  course: { select: { code: true, title: true } },
                  teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
                  attendanceSessions: {
                    select: {
                      records: { where: { studentId }, select: { status: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!student) throw notFound('Student');

  const offerings = student.enrollments.flatMap((e) => e.section.offerings);
  const courses = offerings
    .map((offering) => ({
      offeringId: offering.id,
      courseCode: offering.course.code,
      courseTitle: offering.course.title,
      teacherName: `${offering.teacher.user.firstName} ${offering.teacher.user.lastName}`,
      ...calculateAttendance(
        offering.attendanceSessions.flatMap((s) =>
          s.records.map((r) => r.status as AttendanceStatus),
        ),
      ),
    }))
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode));

  return {
    studentId,
    studentName: `${student.user.firstName} ${student.user.lastName}`,
    rollNumber: student.rollNumber,
    courses,
  };
}

export async function getOfferingReport(
  user: CurrentUser,
  offeringId: string,
): Promise<OfferingAttendanceReport> {
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      course: { select: { code: true, title: true } },
      section: {
        select: {
          name: true,
          enrollments: {
            where: { status: 'ACTIVE' },
            select: {
              student: {
                select: {
                  id: true,
                  rollNumber: true,
                  user: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      },
      attendanceSessions: {
        select: { records: { select: { studentId: true, status: true } } },
      },
    },
  });
  // Check access before reporting "not found", so ids cannot be probed.
  await assertCanViewOffering(user, offeringId);
  if (!offering) throw notFound('Course offering');

  const statusesByStudent = new Map<string, AttendanceStatus[]>();
  for (const session of offering.attendanceSessions) {
    for (const record of session.records) {
      const list = statusesByStudent.get(record.studentId) ?? [];
      list.push(record.status as AttendanceStatus);
      statusesByStudent.set(record.studentId, list);
    }
  }

  const students = offering.section.enrollments
    .map(({ student }) => ({
      studentId: student.id,
      rollNumber: student.rollNumber,
      studentName: `${student.user.firstName} ${student.user.lastName}`,
      ...calculateAttendance(statusesByStudent.get(student.id) ?? []),
    }))
    .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));

  return {
    offeringId: offering.id,
    courseCode: offering.course.code,
    courseTitle: offering.course.title,
    sectionName: offering.section.name,
    sessionCount: offering.attendanceSessions.length,
    students,
  };
}

/** The classes a teacher takes, with the roster needed to mark attendance. */
export async function getOfferingRoster(user: CurrentUser, offeringId: string) {
  await assertCanViewOffering(user, offeringId);
  const enrollments = await prisma.enrollment.findMany({
    where: {
      status: 'ACTIVE',
      section: { offerings: { some: { id: offeringId } } },
    },
    select: {
      student: {
        select: {
          id: true,
          rollNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { student: { rollNumber: 'asc' } },
  });
  return enrollments.map(({ student }) => ({
    studentId: student.id,
    rollNumber: student.rollNumber,
    studentName: `${student.user.firstName} ${student.user.lastName}`,
  }));
}
