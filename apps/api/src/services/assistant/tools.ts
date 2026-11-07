import { classesNeededToReachThreshold, DAY_NAMES, formatNpr, type Role } from '@shikshya/shared';
import { z } from 'zod';
import type { LlmTool } from '../../lib/llm.js';
import { prisma } from '../../lib/prisma.js';
import { dayOfWeek, todayInNepal } from '../../lib/time.js';
import type { CurrentUser } from '../../middleware/auth.js';
import { getOfferingReport, getStudentSummary } from '../attendance.service.js';
import { studentDashboard } from '../dashboard.service.js';
import { listInvoices } from '../finance.service.js';
import { getStudentResults } from '../grading.js';
import { listNotices } from '../notice.service.js';
import { searchPolicies } from '../policy.service.js';
import { assertCanAccessStudent, isAdmin } from '../scope.js';
import { classesOnDay, getTimetable } from '../timetable.service.js';

/**
 * The assistant's tools. Each is a thin wrapper around a service the normal API uses, called with
 * the logged-in user, so the same permission checks apply. Two things keep other people's data
 * out of reach. The model never gets a tool outside the user's role. And no tool takes a student
 * id: "whose data" is decided here from who is logged in, so no prompt can ask for someone else's.
 */
export interface AssistantTool extends LlmTool {
  roles: readonly Role[];
  /** What the chat shows, like "Checked attendance". */
  label: string;
  schema: z.ZodTypeAny;
  // The arguments are checked against `schema` before this is called. `never` lets each tool
  // declare its own argument type without a cast at every definition.
  run: (user: CurrentUser, args: never) => Promise<unknown>;
}

const childNameParameter = {
  childName: {
    type: 'string',
    description: "For a parent with more than one child, the child's first name.",
  },
};

/** Works out which student a request is about, from who is asking. */
async function resolveStudent(
  user: CurrentUser,
  childName?: string,
): Promise<{ studentId: string } | { needsChild: string[] } | { noStudent: true }> {
  if (user.role === 'STUDENT') {
    const student = await prisma.student.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    return student ? { studentId: student.id } : { noStudent: true };
  }
  const links = await prisma.parentStudent.findMany({
    where: { parent: { userId: user.id } },
    select: {
      studentId: true,
      student: { select: { user: { select: { firstName: true, lastName: true } } } },
    },
  });
  const named = childName
    ? links.filter((link) =>
        `${link.student.user.firstName} ${link.student.user.lastName}`
          .toLowerCase()
          .includes(childName.toLowerCase()),
      )
    : links;
  if (named.length === 1) return { studentId: named[0]!.studentId };
  if (links.length === 0) return { noStudent: true };
  // Only ever lists the parent's own children.
  return {
    needsChild: links.map((link) => `${link.student.user.firstName} ${link.student.user.lastName}`),
  };
}

/** Runs a request about one student, or says what is needed before it can. */
async function forStudent<T>(
  user: CurrentUser,
  childName: string | undefined,
  run: (studentId: string) => Promise<T>,
): Promise<T | { error: string; children?: string[] }> {
  const who = await resolveStudent(user, childName);
  if ('noStudent' in who) return { error: 'No student record is linked to this account.' };
  if ('needsChild' in who) {
    return {
      error: 'Ask which child this is about, then call this tool again with childName.',
      children: who.needsChild,
    };
  }
  return run(who.studentId);
}

const dayIndex = (day: string | undefined): number | null => {
  if (!day) return null;
  const wanted = day.trim().toLowerCase();
  if (wanted === 'today') return dayOfWeek(todayInNepal());
  if (wanted === 'tomorrow') return (dayOfWeek(todayInNepal()) + 1) % 7;
  const index = DAY_NAMES.findIndex((name) => name.toLowerCase().startsWith(wanted.slice(0, 3)));
  return index === -1 ? null : index;
};

const attendanceSchema = z.object({
  courseCode: z.string().optional(),
  childName: z.string().optional(),
});
const timetableSchema = z.object({ day: z.string().optional(), childName: z.string().optional() });
const resultsSchema = z.object({
  semester: z.number().int().positive().optional(),
  childName: z.string().optional(),
});
const feesSchema = z.object({ childName: z.string().optional() });
const nothingSchema = z.object({});
const sectionAttendanceSchema = z.object({
  courseCode: z.string().optional(),
  sectionName: z.string().optional(),
});
const noticesSchema = z.object({ limit: z.number().int().min(1).max(10).optional() });
const rulesSchema = z.object({ query: z.string().min(2) });

const ALL_ROLES: readonly Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'TEACHER',
  'STUDENT',
  'PARENT',
  'ACCOUNTANT',
  'LIBRARIAN',
];

export const ASSISTANT_TOOLS: AssistantTool[] = [
  {
    name: 'get_my_attendance',
    label: 'Checked attendance',
    description:
      'Attendance for each course, with the percentage and how many classes in a row are needed to reach 75%.',
    roles: ['STUDENT', 'PARENT'],
    parameters: {
      type: 'object',
      properties: {
        courseCode: { type: 'string', description: 'Limit to one course, like CSC364.' },
        ...childNameParameter,
      },
    },
    schema: attendanceSchema,
    run: (user, args: z.infer<typeof attendanceSchema>) =>
      forStudent(user, args.childName, async (studentId) => {
        const summary = await getStudentSummary(user, studentId);
        const wanted = args.courseCode?.trim().toLowerCase();
        return {
          student: summary.studentName,
          requiredPercent: 75,
          courses: summary.courses
            .filter((course) => !wanted || course.courseCode.toLowerCase() === wanted)
            .map((course) => ({
              code: course.courseCode,
              title: course.courseTitle,
              percentage: course.percentage,
              attended: course.attended,
              total: course.total,
              classesNeededToReach75: classesNeededToReachThreshold(course.attended, course.total),
            })),
        };
      }),
  },
  {
    name: 'get_my_timetable',
    label: 'Checked the timetable',
    description:
      "Classes for a day or the whole week. For a student or parent, the student's classes. For a teacher, what they teach.",
    roles: ALL_ROLES,
    parameters: {
      type: 'object',
      properties: {
        day: { type: 'string', description: 'today, tomorrow or a day name. Empty for the week.' },
        ...childNameParameter,
      },
    },
    schema: timetableSchema,
    run: async (user, args: z.infer<typeof timetableSchema>) => {
      const day = dayIndex(args.day);
      const view = (entries: Awaited<ReturnType<typeof classesOnDay>>) =>
        entries.map((entry) => ({
          day: DAY_NAMES[entry.dayOfWeek],
          start: entry.startTime,
          end: entry.endTime,
          course: `${entry.courseCode} ${entry.courseTitle}`,
          room: entry.roomName,
          teacher: entry.teacherName,
          section: entry.sectionName,
        }));

      if (user.role === 'TEACHER') {
        const teacher = await prisma.teacher.findUnique({
          where: { userId: user.id },
          select: { id: true },
        });
        if (!teacher) return { error: 'No teacher record is linked to this account.' };
        const entries =
          day === null
            ? (await getTimetable({ teacherId: teacher.id })).entries
            : await classesOnDay(day, { teacherId: teacher.id });
        return { classes: view(entries) };
      }
      if (user.role === 'STUDENT' || user.role === 'PARENT') {
        return forStudent(user, args.childName, async (studentId) => {
          await assertCanAccessStudent(user, studentId);
          const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: { currentSectionId: true },
          });
          const sectionId = student?.currentSectionId;
          if (!sectionId) return { classes: [] };
          const entries =
            day === null
              ? (await getTimetable({ sectionId })).entries
              : await classesOnDay(day, { sectionId });
          return { classes: view(entries) };
        });
      }
      return { error: 'This account has no personal timetable.' };
    },
  },
  {
    name: 'get_my_results',
    label: 'Checked results',
    description: 'Published GPA and course grades, by semester, and the CGPA.',
    roles: ['STUDENT', 'PARENT'],
    parameters: {
      type: 'object',
      properties: {
        semester: { type: 'integer', description: 'Limit to one semester number.' },
        ...childNameParameter,
      },
    },
    schema: resultsSchema,
    run: (user, args: z.infer<typeof resultsSchema>) =>
      forStudent(user, args.childName, async (studentId) => {
        await assertCanAccessStudent(user, studentId);
        const results = await getStudentResults(studentId);
        return {
          student: results.studentName,
          cgpa: results.cgpa,
          semesters: results.semesters
            .filter((item) => !args.semester || item.semesterNumber === args.semester)
            .map((item) => ({
              semester: item.semesterNumber,
              gpa: item.gpa,
              status: item.status,
              courses: item.courses.map((course) => ({
                code: course.courseCode,
                title: course.courseTitle,
                grade: course.grade,
                gradePoint: course.gradePoint,
              })),
            })),
        };
      }),
  },
  {
    name: 'get_my_fees',
    label: 'Checked fees',
    description: 'Invoices with their due dates and what is still outstanding.',
    roles: ['STUDENT', 'PARENT'],
    parameters: { type: 'object', properties: { ...childNameParameter } },
    schema: feesSchema,
    run: (user, args: z.infer<typeof feesSchema>) =>
      forStudent(user, args.childName, async (studentId) => {
        const invoices = await listInvoices(user, { page: 1, pageSize: 50, studentId });
        return {
          invoices: invoices.data.map((invoice) => ({
            number: invoice.invoiceNumber,
            status: invoice.status,
            dueDate: invoice.dueDate.slice(0, 10),
            total: formatNpr(invoice.totalPaisa + invoice.finePaisa - invoice.discountPaisa),
            outstanding: formatNpr(invoice.outstandingPaisa),
          })),
          totalOutstanding: formatNpr(
            invoices.data.reduce((sum, invoice) => sum + invoice.outstandingPaisa, 0),
          ),
        };
      }),
  },
  {
    name: 'get_upcoming_deadlines',
    label: 'Checked deadlines',
    description: 'Assignments not yet handed in and exams, over the next 14 days.',
    roles: ['STUDENT'],
    parameters: { type: 'object', properties: {} },
    schema: nothingSchema,
    run: (user) =>
      forStudent(user, undefined, async (studentId) => ({
        today: todayInNepal(),
        deadlines: await studentDashboard.deadlines(user, studentId),
      })),
  },
  {
    name: 'get_section_attendance',
    label: 'Checked class attendance',
    description:
      'Students below 75% attendance in a class. A teacher can only see the classes they teach.',
    roles: ['TEACHER', 'ADMIN', 'SUPER_ADMIN'],
    parameters: {
      type: 'object',
      properties: {
        courseCode: { type: 'string', description: 'The course, like CSC364.' },
        sectionName: {
          type: 'string',
          description:
            'The section, like A. Only if the person named one. Never guess it: leave it out, and the result says if there are several.',
        },
      },
    },
    schema: sectionAttendanceSchema,
    run: async (user, args: z.infer<typeof sectionAttendanceSchema>) => {
      const offerings = await prisma.courseOffering.findMany({
        where: {
          // Checked again by the report below. This only narrows the choices offered.
          ...(isAdmin(user) ? {} : { teacher: { userId: user.id } }),
          ...(args.courseCode
            ? { course: { code: { equals: args.courseCode.trim(), mode: 'insensitive' } } }
            : {}),
          ...(args.sectionName
            ? { section: { name: { equals: args.sectionName.trim(), mode: 'insensitive' } } }
            : {}),
        },
        select: {
          id: true,
          course: { select: { code: true } },
          section: { select: { name: true } },
        },
        take: 25,
      });
      if (offerings.length === 0) return { error: 'No matching class found among your classes.' };
      if (offerings.length > 1) {
        return {
          error: 'More than one class matches. Ask which one, then call this tool again.',
          classes: offerings.map((item) => `${item.course.code} section ${item.section.name}`),
        };
      }
      const report = await getOfferingReport(user, offerings[0]!.id);
      return {
        course: `${report.courseCode} ${report.courseTitle}`,
        section: report.sectionName,
        classesHeld: report.sessionCount,
        studentsBelow75: report.students
          .filter((student) => student.belowThreshold)
          .map((student) => ({
            name: student.studentName,
            rollNumber: student.rollNumber,
            percentage: student.percentage,
          })),
      };
    },
  },
  {
    name: 'get_notices',
    label: 'Checked notices',
    description: 'The most recent notices this person can see.',
    roles: ALL_ROLES,
    parameters: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'How many, up to 10.' } },
    },
    schema: noticesSchema,
    run: async (user, args: z.infer<typeof noticesSchema>) => {
      const notices = await listNotices(user, { page: 1, pageSize: args.limit ?? 5 });
      return {
        notices: notices.data.map((notice) => ({
          title: notice.title,
          body: notice.body,
          publishedAt: notice.publishAt.slice(0, 10),
        })),
      };
    },
  },
  {
    name: 'search_college_rules',
    label: 'Searched the college rules',
    description:
      'Searches the rules and policies the college has uploaded, such as exam, attendance or library rules.',
    roles: ALL_ROLES,
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What to look for.' } },
      required: ['query'],
    },
    schema: rulesSchema,
    run: async (user, args: z.infer<typeof rulesSchema>) => ({
      passages: await searchPolicies(args.query, user.id),
    }),
  },
];

/** The tool list for a role. A student's model never even hears of a teacher's tools. */
export const toolsForRole = (role: Role) =>
  ASSISTANT_TOOLS.filter((tool) => tool.roles.includes(role));
