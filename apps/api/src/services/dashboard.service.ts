import { Prisma } from '@prisma/client';
import {
  ATTENDANCE_THRESHOLD_PERCENT,
  calculateAttendance,
  type AttendanceStatus,
} from '@shikshya/shared';
import { cached } from '../lib/cache.js';
import { notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { addDays, clockInNepal, dateFromIso, dayOfWeek, todayInNepal } from '../lib/time.js';
import type { CurrentUser } from '../middleware/auth.js';
import { getStudentResults } from './grading.js';
import { listNotices } from './notice.service.js';
import { assertCanAccessStudent } from './scope.js';
import { classesOnDay } from './timetable.service.js';

const percentOf = (attended: number, total: number) =>
  total === 0 ? null : Math.round((attended / total) * 10000) / 100;

interface LowAttendanceRow {
  studentId: string;
  rollNumber: string;
  studentName: string;
  courseCode: string;
  percentage: number;
}

/**
 * Totals are added up in the database, which is far quicker than loading every record,
 * and the same rule applies: LATE counts as present and EXCUSED is left out.
 */
async function lowAttendance(teacherUserId?: string): Promise<LowAttendanceRow[]> {
  const teacherFilter = teacherUserId
    ? Prisma.sql`AND t."userId" = ${teacherUserId}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<
    {
      studentId: string;
      rollNumber: string;
      firstName: string;
      lastName: string;
      courseCode: string;
      attended: number;
      total: number;
    }[]
  >`
    SELECT st.id AS "studentId", st."rollNumber", u."firstName", u."lastName", c.code AS "courseCode",
      SUM(CASE WHEN r.status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END)::int AS attended,
      SUM(CASE WHEN r.status <> 'EXCUSED' THEN 1 ELSE 0 END)::int AS total
    FROM "AttendanceRecord" r
    JOIN "AttendanceSession" s ON s.id = r."sessionId"
    JOIN "CourseOffering" o ON o.id = s."courseOfferingId"
    JOIN "Course" c ON c.id = o."courseId"
    JOIN "Teacher" t ON t.id = o."teacherId"
    JOIN "Student" st ON st.id = r."studentId"
    JOIN "User" u ON u.id = st."userId"
    WHERE u."isActive" = true ${teacherFilter}
    GROUP BY st.id, st."rollNumber", u."firstName", u."lastName", c.code
  `;
  return rows
    .map((row) => ({
      studentId: row.studentId,
      rollNumber: row.rollNumber,
      studentName: `${row.firstName} ${row.lastName}`,
      courseCode: row.courseCode,
      percentage: percentOf(row.attended, row.total),
    }))
    .filter(
      (row): row is LowAttendanceRow =>
        row.percentage !== null && row.percentage < ATTENDANCE_THRESHOLD_PERCENT,
    )
    .sort((a, b) => a.percentage - b.percentage);
}

// ---------- Admin ----------

export const adminDashboard = {
  studentsByProgram: () =>
    cached('admin:students-by-program', async () => {
      const [programs, counts] = await Promise.all([
        prisma.program.findMany({ select: { id: true, name: true, code: true } }),
        prisma.student.groupBy({ by: ['programId'], _count: { _all: true } }),
      ]);
      const countByProgram = new Map(counts.map((c) => [c.programId, c._count._all]));
      const rows = programs.map((program) => ({
        programId: program.id,
        name: program.name,
        code: program.code,
        count: countByProgram.get(program.id) ?? 0,
      }));
      return { total: rows.reduce((sum, row) => sum + row.count, 0), programs: rows };
    }),

  attendanceToday: () =>
    cached('admin:attendance-today', async () => {
      const records = await prisma.attendanceRecord.findMany({
        where: { session: { date: dateFromIso(todayInNepal()) } },
        select: { status: true },
      });
      const tally = calculateAttendance(records.map((r) => r.status as AttendanceStatus));
      return { percentage: tally.percentage, attended: tally.attended, total: tally.total };
    }),

  lowAttendance: () =>
    cached('admin:low-attendance', async () => {
      const rows = await lowAttendance();
      const students = new Set(rows.map((r) => r.studentId));
      return { studentCount: students.size, rows: rows.slice(0, 10) };
    }),

  upcomingExams: () =>
    cached('admin:upcoming-exams', () =>
      prisma.exam.findMany({
        where: { endDate: { gte: dateFromIso(todayInNepal()) }, isPublished: false },
        orderBy: { startDate: 'asc' },
        take: 5,
        select: {
          id: true,
          name: true,
          type: true,
          startDate: true,
          endDate: true,
          semester: { select: { number: true, program: { select: { code: true } } } },
        },
      }),
    ),

  attendanceTrend: () =>
    cached('admin:attendance-trend', async () => {
      const today = todayInNepal();
      const rows = await prisma.$queryRaw<{ date: Date; attended: number; total: number }[]>`
        SELECT s.date,
          SUM(CASE WHEN r.status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END)::int AS attended,
          SUM(CASE WHEN r.status <> 'EXCUSED' THEN 1 ELSE 0 END)::int AS total
        FROM "AttendanceRecord" r
        JOIN "AttendanceSession" s ON s.id = r."sessionId"
        WHERE s.date >= ${dateFromIso(addDays(today, -29))} AND s.date <= ${dateFromIso(today)}
        GROUP BY s.date
        ORDER BY s.date
      `;
      return rows.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        percentage: percentOf(row.attended, row.total),
      }));
    }),
};

// ---------- Teacher ----------

export const teacherDashboard = {
  todayClasses: (user: CurrentUser) =>
    cached(`teacher:${user.id}:today`, async () => {
      const today = todayInNepal();
      const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
      if (!teacher) throw notFound('Teacher');
      const [classes, taken] = await Promise.all([
        classesOnDay(dayOfWeek(today), { teacherId: teacher.id }),
        prisma.attendanceSession.findMany({
          where: { date: dateFromIso(today), courseOffering: { teacherId: teacher.id } },
          select: { courseOfferingId: true },
        }),
      ]);
      const takenOfferings = new Set(taken.map((s) => s.courseOfferingId));
      return classes.map((entry) => ({
        ...entry,
        attendanceTaken: takenOfferings.has(entry.courseOfferingId),
      }));
    }),

  /** Scheduled classes in the last week with no attendance yet, including today's past classes. */
  pendingAttendance: (user: CurrentUser) =>
    cached(`teacher:${user.id}:pending`, async () => {
      const today = todayInNepal();
      const clock = clockInNepal();
      const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
      if (!teacher) throw notFound('Teacher');

      const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
      const [entries, sessions] = await Promise.all([
        prisma.timetableEntry.findMany({
          where: { courseOffering: { teacherId: teacher.id } },
          include: {
            timeSlot: true,
            semester: { select: { startDate: true, endDate: true } },
            courseOffering: {
              select: {
                id: true,
                course: { select: { code: true, title: true } },
                section: { select: { name: true } },
              },
            },
          },
        }),
        prisma.attendanceSession.findMany({
          where: {
            courseOffering: { teacherId: teacher.id },
            date: { gte: dateFromIso(days[6]!), lte: dateFromIso(today) },
          },
          select: { courseOfferingId: true, date: true },
        }),
      ]);
      const taken = new Set(
        sessions.map((s) => `${s.courseOfferingId}|${s.date.toISOString().slice(0, 10)}`),
      );

      const pending = days.flatMap((day) =>
        entries
          .filter((entry) => {
            if (entry.timeSlot.dayOfWeek !== dayOfWeek(day)) return false;
            const date = dateFromIso(day);
            if (date < entry.semester.startDate || date > entry.semester.endDate) return false;
            if (day === today && entry.timeSlot.startTime > clock) return false;
            return !taken.has(`${entry.courseOfferingId}|${day}`);
          })
          .map((entry) => ({
            date: day,
            offeringId: entry.courseOfferingId,
            courseCode: entry.courseOffering.course.code,
            courseTitle: entry.courseOffering.course.title,
            sectionName: entry.courseOffering.section.name,
            startTime: entry.timeSlot.startTime,
          })),
      );
      return { count: pending.length, items: pending.slice(0, 8) };
    }),

  ungradedSubmissions: (user: CurrentUser) =>
    cached(`teacher:${user.id}:ungraded`, async () => {
      const assignments = await prisma.assignment.findMany({
        where: {
          courseOffering: { teacher: { userId: user.id } },
          submissions: { some: { gradedAt: null } },
        },
        select: {
          id: true,
          title: true,
          courseOffering: {
            select: { course: { select: { code: true } }, section: { select: { name: true } } },
          },
          _count: { select: { submissions: { where: { gradedAt: null } } } },
        },
        orderBy: { dueAt: 'asc' },
      });
      const items = assignments.map((a) => ({
        assignmentId: a.id,
        title: a.title,
        courseCode: a.courseOffering.course.code,
        sectionName: a.courseOffering.section.name,
        ungraded: a._count.submissions,
      }));
      return { count: items.reduce((sum, item) => sum + item.ungraded, 0), items };
    }),

  lowAttendance: (user: CurrentUser) =>
    cached(`teacher:${user.id}:low-attendance`, async () => {
      const rows = await lowAttendance(user.id);
      return {
        studentCount: new Set(rows.map((r) => r.studentId)).size,
        rows: rows.slice(0, 10),
      };
    }),
};

// ---------- Student (also used by parents, per child) ----------

export const studentDashboard = {
  today: async (user: CurrentUser, studentId: string) => {
    await assertCanAccessStudent(user, studentId);
    return cached(`student:${studentId}:today`, async () => {
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { currentSectionId: true },
      });
      if (!student) throw notFound('Student');
      return classesOnDay(dayOfWeek(todayInNepal()), { sectionId: student.currentSectionId });
    });
  },

  /** Assignments not yet handed in, and exams, over the next 14 days. */
  deadlines: async (user: CurrentUser, studentId: string) => {
    await assertCanAccessStudent(user, studentId);
    return cached(`student:${studentId}:deadlines`, async () => {
      const now = new Date();
      const today = todayInNepal();
      const horizon = dateFromIso(addDays(today, 14));
      const section = { enrollments: { some: { studentId, status: 'ACTIVE' as const } } };

      const [assignments, subjects] = await Promise.all([
        prisma.assignment.findMany({
          where: {
            dueAt: { gte: now, lte: horizon },
            courseOffering: { section },
            submissions: { none: { studentId } },
          },
          select: {
            id: true,
            title: true,
            dueAt: true,
            courseOffering: { select: { course: { select: { code: true } } } },
          },
        }),
        prisma.examSubject.findMany({
          where: {
            date: { gte: dateFromIso(today), lte: horizon },
            courseOffering: { section },
            exam: { isPublished: false },
          },
          select: {
            id: true,
            date: true,
            exam: { select: { name: true } },
            courseOffering: { select: { course: { select: { code: true } } } },
          },
        }),
      ]);

      return [
        ...assignments.map((a) => ({
          kind: 'ASSIGNMENT' as const,
          id: a.id,
          title: a.title,
          courseCode: a.courseOffering.course.code,
          at: a.dueAt.toISOString(),
        })),
        ...subjects.map((s) => ({
          kind: 'EXAM' as const,
          id: s.id,
          title: s.exam.name,
          courseCode: s.courseOffering.course.code,
          at: (s.date as Date).toISOString(),
        })),
      ].sort((a, b) => a.at.localeCompare(b.at));
    });
  },

  latestResult: async (user: CurrentUser, studentId: string) => {
    await assertCanAccessStudent(user, studentId);
    const results = await getStudentResults(studentId);
    const latest = results.semesters.at(-1);
    return {
      cgpa: results.cgpa,
      latest: latest
        ? {
            semesterNumber: latest.semesterNumber,
            gpa: latest.gpa,
            status: latest.status,
            totalCredits: latest.totalCredits,
          }
        : null,
    };
  },
};

export const recentNotices = (user: CurrentUser) =>
  listNotices(user, { page: 1, pageSize: 5, unreadOnly: false });
