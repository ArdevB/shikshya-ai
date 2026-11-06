import type { Prisma } from '@prisma/client';
import type {
  ExamBody,
  ExamSubjectBody,
  MarkBody,
  MarkSheet,
  PaginationQuery,
} from '@shikshya/shared';
import { writeAudit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { pageArgs, paginated } from '../lib/pagination.js';
import { prisma } from '../lib/prisma.js';
import type { CurrentUser } from '../middleware/auth.js';
import { recomputeSemesterResults } from './grading.js';
import { notifySafely, notifyStudentsAndParents } from './notification.service.js';
import { assertCanViewOffering, isAdmin, teachesOffering } from './scope.js';

const examInclude = {
  semester: {
    select: {
      id: true,
      number: true,
      program: { select: { code: true, name: true } },
      academicYear: { select: { name: true } },
    },
  },
  _count: { select: { subjects: true } },
} as const;

const examData = (body: ExamBody) => ({
  ...body,
  startDate: new Date(body.startDate),
  endDate: new Date(body.endDate),
});

async function assertNotPublished(examId: string) {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw notFound('Exam');
  if (exam.isPublished) throw conflict('This exam is published. Unlock it to make changes.');
  return exam;
}

export async function listExams(
  user: CurrentUser,
  query: PaginationQuery & { semesterId?: string },
) {
  const where: Prisma.ExamWhereInput = {
    semesterId: query.semesterId,
    // Teachers only see exams that include a course they teach.
    subjects: isAdmin(user)
      ? undefined
      : { some: { courseOffering: { teacher: { userId: user.id } } } },
  };
  const [rows, total] = await Promise.all([
    prisma.exam.findMany({
      ...pageArgs(query),
      where,
      include: examInclude,
      orderBy: { startDate: 'desc' },
    }),
    prisma.exam.count({ where }),
  ]);
  return paginated(rows, total, query);
}

export const getExam = (id: string) =>
  prisma.exam.findUniqueOrThrow({ where: { id }, include: examInclude });

export const createExam = (body: ExamBody) =>
  prisma.exam.create({ data: examData(body), include: examInclude });

export async function updateExam(id: string, body: ExamBody) {
  await assertNotPublished(id);
  return prisma.exam.update({ where: { id }, data: examData(body), include: examInclude });
}

export async function deleteExam(id: string) {
  await assertNotPublished(id);
  await prisma.exam.delete({ where: { id } });
}

// ---------- Exam subjects ----------

const subjectInclude = {
  courseOffering: {
    select: {
      id: true,
      teacherId: true,
      course: { select: { code: true, title: true } },
      section: { select: { id: true, name: true } },
      teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
    },
  },
  exam: { select: { id: true, name: true, isPublished: true, type: true } },
  _count: { select: { marks: true } },
} as const;

export const listSubjects = (examId: string) =>
  prisma.examSubject.findMany({
    where: { examId },
    include: subjectInclude,
    orderBy: [
      { courseOffering: { section: { name: 'asc' } } },
      { courseOffering: { course: { code: 'asc' } } },
    ],
  });

/** The papers a teacher enters marks for. */
export const listSubjectsForTeacher = (user: CurrentUser) =>
  prisma.examSubject.findMany({
    where: { courseOffering: { teacher: { userId: user.id } } },
    include: subjectInclude,
    orderBy: [{ exam: { startDate: 'desc' } }, { courseOffering: { course: { code: 'asc' } } }],
  });

export async function addSubject(examId: string, body: ExamSubjectBody) {
  const exam = await assertNotPublished(examId);
  const offering = await prisma.courseOffering.findUnique({
    where: { id: body.courseOfferingId },
    include: { section: true },
  });
  if (!offering) throw notFound('Course offering');
  if (offering.section.semesterId !== exam.semesterId) {
    throw badRequest('This class belongs to a different semester than the exam');
  }
  return prisma.examSubject.create({
    data: {
      examId,
      courseOfferingId: body.courseOfferingId,
      fullMarks: body.fullMarks,
      passMarks: body.passMarks,
      date: body.date ? new Date(body.date) : undefined,
    },
    include: subjectInclude,
  });
}

export async function updateSubject(id: string, body: ExamSubjectBody) {
  const subject = await prisma.examSubject.findUnique({ where: { id } });
  if (!subject) throw notFound('Exam subject');
  await assertNotPublished(subject.examId);
  return prisma.examSubject.update({
    where: { id },
    data: {
      fullMarks: body.fullMarks,
      passMarks: body.passMarks,
      date: body.date ? new Date(body.date) : null,
    },
    include: subjectInclude,
  });
}

export async function removeSubject(id: string) {
  const subject = await prisma.examSubject.findUnique({ where: { id } });
  if (!subject) throw notFound('Exam subject');
  await assertNotPublished(subject.examId);
  await prisma.examSubject.delete({ where: { id } });
}

// ---------- Marks ----------

export async function getMarkSheet(user: CurrentUser, subjectId: string): Promise<MarkSheet> {
  const subject = await prisma.examSubject.findUnique({
    where: { id: subjectId },
    include: {
      exam: { select: { name: true, isPublished: true } },
      marks: true,
      courseOffering: {
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
        },
      },
    },
  });
  if (!subject) throw notFound('Exam subject');
  await assertCanViewOffering(user, subject.courseOffering.id);

  const marks = new Map(subject.marks.map((mark) => [mark.studentId, mark]));
  const rows = subject.courseOffering.section.enrollments
    .map(({ student }) => {
      const mark = marks.get(student.id);
      return {
        studentId: student.id,
        rollNumber: student.rollNumber,
        studentName: `${student.user.firstName} ${student.user.lastName}`,
        marksObtained: mark?.marksObtained == null ? null : Number(mark.marksObtained),
        isAbsent: mark?.isAbsent ?? false,
        entered: mark !== undefined,
      };
    })
    .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));

  return {
    examSubjectId: subject.id,
    examName: subject.exam.name,
    isPublished: subject.exam.isPublished,
    courseCode: subject.courseOffering.course.code,
    courseTitle: subject.courseOffering.course.title,
    sectionName: subject.courseOffering.section.name,
    fullMarks: Number(subject.fullMarks),
    passMarks: Number(subject.passMarks),
    rows,
  };
}

/** Only the teacher of the course may enter marks. Every change goes in the audit log. */
export async function saveMark(
  user: CurrentUser,
  subjectId: string,
  studentId: string,
  body: MarkBody,
) {
  const subject = await prisma.examSubject.findUnique({
    where: { id: subjectId },
    include: {
      exam: { select: { isPublished: true } },
      courseOffering: { select: { id: true, sectionId: true } },
    },
  });
  if (!subject) throw notFound('Exam subject');
  if (!(await teachesOffering(user, subject.courseOfferingId))) throw forbidden();
  if (subject.exam.isPublished) {
    throw conflict('Marks are locked because this exam has been published');
  }

  const enrolled = await prisma.enrollment.findFirst({
    where: { studentId, sectionId: subject.courseOffering.sectionId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!enrolled) throw badRequest('This student is not enrolled in this section');

  const marksObtained = body.isAbsent ? null : body.marksObtained;
  const fullMarks = Number(subject.fullMarks);
  if (marksObtained !== null && marksObtained > fullMarks) {
    throw badRequest(`Marks cannot be more than the full marks (${fullMarks})`, [
      { path: 'marksObtained', message: `Must be ${fullMarks} or less` },
    ]);
  }

  return prisma.$transaction(async (tx) => {
    const before = await tx.mark.findUnique({
      where: { examSubjectId_studentId: { examSubjectId: subjectId, studentId } },
    });
    const mark = await tx.mark.upsert({
      where: { examSubjectId_studentId: { examSubjectId: subjectId, studentId } },
      create: {
        examSubjectId: subjectId,
        studentId,
        marksObtained,
        isAbsent: body.isAbsent,
        enteredById: user.id,
      },
      update: { marksObtained, isAbsent: body.isAbsent, enteredById: user.id },
    });
    await writeAudit(
      {
        actorId: user.id,
        action: before ? 'MARK_UPDATE' : 'MARK_CREATE',
        entity: 'Mark',
        entityId: mark.id,
        before: before
          ? {
              marksObtained: before.marksObtained === null ? null : Number(before.marksObtained),
              isAbsent: before.isAbsent,
            }
          : undefined,
        after: { examSubjectId: subjectId, studentId, marksObtained, isAbsent: body.isAbsent },
      },
      tx,
    );
    return mark;
  });
}

// ---------- Publishing ----------

/** Publishes the exam and computes results, all in one transaction: every result or none. */
export async function publishExam(user: CurrentUser, examId: string) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      subjects: {
        include: {
          marks: { select: { studentId: true } },
          courseOffering: {
            select: {
              course: { select: { code: true } },
              section: {
                select: {
                  name: true,
                  enrollments: { where: { status: 'ACTIVE' }, select: { studentId: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!exam) throw notFound('Exam');
  if (exam.isPublished) throw conflict('This exam is already published');
  if (exam.subjects.length === 0) throw badRequest('Add at least one subject before publishing');

  // Publishing with marks missing would quietly fail those students, so it is refused.
  const missing = exam.subjects.flatMap((subject) => {
    const entered = new Set(subject.marks.map((mark) => mark.studentId));
    const count = subject.courseOffering.section.enrollments.filter(
      (enrollment) => !entered.has(enrollment.studentId),
    ).length;
    return count === 0
      ? []
      : [
          {
            examSubjectId: subject.id,
            course: subject.courseOffering.course.code,
            section: subject.courseOffering.section.name,
            missing: count,
          },
        ];
  });
  if (missing.length > 0) {
    const summary = missing
      .map((m) => `${m.course} (Section ${m.section}): ${m.missing} missing`)
      .join(', ');
    throw conflict(`Some marks have not been entered. ${summary}`, missing);
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.exam.update({ where: { id: examId }, data: { isPublished: true } });
      await recomputeSemesterResults(tx, exam.semesterId);
      await writeAudit(
        { actorId: user.id, action: 'EXAM_PUBLISH', entity: 'Exam', entityId: examId },
        tx,
      );
    },
    { timeout: 60_000 },
  );
  await notifySafely(async () => {
    const results = await prisma.result.findMany({
      where: { semesterId: exam.semesterId },
      select: { studentId: true },
    });
    await notifyStudentsAndParents(
      results.map((r) => r.studentId),
      'RESULT_PUBLISHED',
      {
        title: 'Results published',
        body: `Results for ${exam.name} are now available.`,
        path: 'results',
      },
    );
  });
  return getExam(examId);
}

/** Reopens marks for correction. Results are recomputed without this exam until it is republished. */
export async function unlockExam(user: CurrentUser, examId: string) {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw notFound('Exam');
  if (!exam.isPublished) throw conflict('This exam is not published');

  await prisma.$transaction(
    async (tx) => {
      await tx.exam.update({ where: { id: examId }, data: { isPublished: false } });
      await recomputeSemesterResults(tx, exam.semesterId);
      await writeAudit(
        { actorId: user.id, action: 'EXAM_UNLOCK', entity: 'Exam', entityId: examId },
        tx,
      );
    },
    { timeout: 60_000 },
  );
  return getExam(examId);
}
