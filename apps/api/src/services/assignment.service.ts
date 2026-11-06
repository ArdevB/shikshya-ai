import type { Prisma } from '@prisma/client';
import type {
  AssignmentBody,
  AssignmentStatus,
  GradeBody,
  MaterialBody,
  MaterialView,
  PaginationQuery,
  StoredFile,
  StudentAssignment,
  SubmissionRow,
  TeacherAssignment,
} from '@shikshya/shared';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { pageArgs, paginated } from '../lib/pagination.js';
import { prisma } from '../lib/prisma.js';
import { findFile, storage } from '../lib/storage.js';
import type { CurrentUser } from '../middleware/auth.js';
import { notifySafely, notifyStudentsAndParents } from './notification.service.js';
import { assertCanAccessStudent, canAccessStudent, isAdmin, teachesOffering } from './scope.js';

const filesOf = (value: Prisma.JsonValue) => value as unknown as StoredFile[];
const asJson = (files: StoredFile[]) => files as unknown as Prisma.InputJsonValue;

async function assertTeaches(user: CurrentUser, offeringId: string) {
  if (!(await teachesOffering(user, offeringId))) throw forbidden();
}

// ---------- Teacher: assignments ----------

const teacherInclude = {
  courseOffering: {
    select: {
      course: { select: { code: true, title: true } },
      section: {
        select: {
          name: true,
          _count: { select: { enrollments: { where: { status: 'ACTIVE' as const } } } },
        },
      },
    },
  },
  submissions: { select: { gradedAt: true } },
} as const;

type TeacherRow = Prisma.AssignmentGetPayload<{ include: typeof teacherInclude }>;

function toTeacherView(row: TeacherRow): TeacherAssignment {
  return {
    id: row.id,
    courseOfferingId: row.courseOfferingId,
    title: row.title,
    description: row.description,
    dueAt: row.dueAt.toISOString(),
    maxMarks: Number(row.maxMarks),
    allowLate: row.allowLate,
    attachments: filesOf(row.attachments),
    courseCode: row.courseOffering.course.code,
    courseTitle: row.courseOffering.course.title,
    sectionName: row.courseOffering.section.name,
    submissionCount: row.submissions.length,
    gradedCount: row.submissions.filter((s) => s.gradedAt !== null).length,
    studentCount: row.courseOffering.section._count.enrollments,
  };
}

export async function listTeacherAssignments(
  user: CurrentUser,
  query: PaginationQuery & { offeringId?: string },
) {
  const where: Prisma.AssignmentWhereInput = {
    courseOfferingId: query.offeringId,
    courseOffering: isAdmin(user) ? undefined : { teacher: { userId: user.id } },
  };
  const [rows, total] = await Promise.all([
    prisma.assignment.findMany({
      ...pageArgs(query),
      where,
      include: teacherInclude,
      orderBy: { dueAt: 'desc' },
    }),
    prisma.assignment.count({ where }),
  ]);
  return paginated(rows.map(toTeacherView), total, query);
}

export async function createAssignment(
  user: CurrentUser,
  body: AssignmentBody,
  attachments: StoredFile[],
) {
  await assertTeaches(user, body.courseOfferingId);
  const row = await prisma.assignment.create({
    data: {
      courseOfferingId: body.courseOfferingId,
      title: body.title,
      description: body.description,
      dueAt: new Date(body.dueAt),
      maxMarks: body.maxMarks,
      allowLate: body.allowLate,
      attachments: asJson(attachments),
      createdById: user.id,
    },
    include: teacherInclude,
  });
  await notifySafely(async () => {
    const enrolled = await prisma.enrollment.findMany({
      where: {
        status: 'ACTIVE',
        section: { offerings: { some: { id: body.courseOfferingId } } },
      },
      select: { studentId: true },
    });
    await notifyStudentsAndParents(
      enrolled.map((e) => e.studentId),
      'ASSIGNMENT_CREATED',
      {
        title: 'New assignment',
        body: `${row.courseOffering.course.code}: "${row.title}".`,
        path: 'assignments',
      },
    );
  });
  return toTeacherView(row);
}

export async function updateAssignment(
  user: CurrentUser,
  id: string,
  body: AssignmentBody,
  newFiles: StoredFile[],
) {
  const existing = await prisma.assignment.findUnique({ where: { id } });
  if (!existing) throw notFound('Assignment');
  await assertTeaches(user, existing.courseOfferingId);
  const row = await prisma.assignment.update({
    where: { id },
    data: {
      title: body.title,
      description: body.description,
      dueAt: new Date(body.dueAt),
      maxMarks: body.maxMarks,
      allowLate: body.allowLate,
      attachments: asJson([...filesOf(existing.attachments), ...newFiles]),
    },
    include: teacherInclude,
  });
  return toTeacherView(row);
}

export async function deleteAssignment(user: CurrentUser, id: string) {
  const existing = await prisma.assignment.findUnique({
    where: { id },
    include: { submissions: { select: { files: true } } },
  });
  if (!existing) throw notFound('Assignment');
  await assertTeaches(user, existing.courseOfferingId);
  await prisma.assignment.delete({ where: { id } });
  const files = [
    ...filesOf(existing.attachments),
    ...existing.submissions.flatMap((s) => filesOf(s.files)),
  ];
  await Promise.all(files.map((file) => storage.remove(file)));
}

export async function listSubmissions(user: CurrentUser, assignmentId: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      submissions: true,
      courseOffering: {
        select: {
          id: true,
          section: {
            select: {
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
  if (!assignment) throw notFound('Assignment');
  if (!isAdmin(user)) await assertTeaches(user, assignment.courseOffering.id);

  const byStudent = new Map(assignment.submissions.map((s) => [s.studentId, s]));
  const rows: SubmissionRow[] = assignment.courseOffering.section.enrollments
    .map(({ student }) => {
      const submission = byStudent.get(student.id);
      return {
        studentId: student.id,
        rollNumber: student.rollNumber,
        studentName: `${student.user.firstName} ${student.user.lastName}`,
        submission: submission
          ? {
              id: submission.id,
              submittedAt: submission.submittedAt.toISOString(),
              files: filesOf(submission.files),
              text: submission.text,
              isLate: submission.isLate,
              marks: submission.marks === null ? null : Number(submission.marks),
              feedback: submission.feedback,
              gradedAt: submission.gradedAt?.toISOString() ?? null,
            }
          : null,
      };
    })
    .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));

  return { maxMarks: Number(assignment.maxMarks), title: assignment.title, rows };
}

export async function gradeSubmission(user: CurrentUser, submissionId: string, body: GradeBody) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { assignment: true },
  });
  if (!submission) throw notFound('Submission');
  await assertTeaches(user, submission.assignment.courseOfferingId);

  const max = Number(submission.assignment.maxMarks);
  if (body.marks > max) {
    throw badRequest(`Marks cannot be more than ${max}`, [
      { path: 'marks', message: `Must be ${max} or less` },
    ]);
  }
  return prisma.submission.update({
    where: { id: submissionId },
    data: {
      marks: body.marks,
      feedback: body.feedback,
      gradedById: user.id,
      gradedAt: new Date(),
    },
  });
}

// ---------- Student: assignments ----------

export function assignmentStatus(
  dueAt: Date,
  submission: { gradedAt: Date | null } | null | undefined,
  now = new Date(),
): AssignmentStatus {
  if (submission?.gradedAt) return 'GRADED';
  if (submission) return 'SUBMITTED';
  return dueAt < now ? 'OVERDUE' : 'DUE';
}

export async function listStudentAssignments(
  user: CurrentUser,
  studentId: string,
): Promise<StudentAssignment[]> {
  await assertCanAccessStudent(user, studentId);
  const rows = await prisma.assignment.findMany({
    where: {
      courseOffering: {
        section: { enrollments: { some: { studentId, status: 'ACTIVE' } } },
      },
    },
    include: {
      courseOffering: { select: { course: { select: { code: true, title: true } } } },
      submissions: { where: { studentId } },
    },
    orderBy: { dueAt: 'desc' },
  });

  return rows.map((row) => {
    const submission = row.submissions[0];
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      dueAt: row.dueAt.toISOString(),
      maxMarks: Number(row.maxMarks),
      allowLate: row.allowLate,
      attachments: filesOf(row.attachments),
      courseCode: row.courseOffering.course.code,
      courseTitle: row.courseOffering.course.title,
      status: assignmentStatus(row.dueAt, submission),
      submission: submission
        ? {
            id: submission.id,
            submittedAt: submission.submittedAt.toISOString(),
            files: filesOf(submission.files),
            text: submission.text,
            isLate: submission.isLate,
            // Marks and feedback stay hidden until the teacher has finished grading.
            marks:
              submission.gradedAt && submission.marks !== null ? Number(submission.marks) : null,
            feedback: submission.gradedAt ? submission.feedback : null,
          }
        : null,
    };
  });
}

/**
 * A student may submit and resubmit until the deadline. After it, a first submission is
 * accepted and flagged late only if the assignment allows that. Graded work is final.
 */
export async function submitAssignment(
  user: CurrentUser,
  assignmentId: string,
  input: { text?: string; files: StoredFile[] },
  now = new Date(),
) {
  const student = await prisma.student.findUnique({ where: { userId: user.id } });
  if (!student) throw forbidden();

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { courseOffering: { select: { sectionId: true } } },
  });
  if (!assignment) throw notFound('Assignment');

  const enrolled = await prisma.enrollment.findFirst({
    where: {
      studentId: student.id,
      sectionId: assignment.courseOffering.sectionId,
      status: 'ACTIVE',
    },
  });
  if (!enrolled) throw forbidden();

  if (!input.text && input.files.length === 0) {
    throw badRequest('Add a file or some text to submit');
  }

  const existing = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId: student.id } },
  });
  if (existing?.gradedAt) throw conflict('This work has already been graded');

  const isLate = now > assignment.dueAt;
  if (isLate && existing) throw conflict('The deadline has passed, so you can no longer resubmit');
  if (isLate && !assignment.allowLate) {
    throw conflict('The deadline has passed and this assignment does not accept late work');
  }

  const data = {
    submittedAt: now,
    files: asJson(input.files),
    text: input.text ?? null,
    isLate,
  };
  const submission = await prisma.submission.upsert({
    where: { assignmentId_studentId: { assignmentId, studentId: student.id } },
    create: { assignmentId, studentId: student.id, ...data },
    update: data,
  });

  // Resubmitting replaces the earlier files.
  if (existing) await Promise.all(filesOf(existing.files).map((file) => storage.remove(file)));
  return submission;
}

// ---------- File downloads ----------

async function canSeeOffering(user: CurrentUser, offeringId: string, sectionId: string) {
  if (isAdmin(user)) return true;
  if (user.role === 'TEACHER') return teachesOffering(user, offeringId);
  if (user.role === 'STUDENT') {
    const match = await prisma.enrollment.findFirst({
      where: { sectionId, status: 'ACTIVE', student: { userId: user.id } },
    });
    return match !== null;
  }
  if (user.role === 'PARENT') {
    const match = await prisma.enrollment.findFirst({
      where: {
        sectionId,
        status: 'ACTIVE',
        student: { parents: { some: { parent: { userId: user.id } } } },
      },
    });
    return match !== null;
  }
  return false;
}

export async function assignmentFile(user: CurrentUser, assignmentId: string, fileId: string) {
  const row = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { courseOffering: { select: { sectionId: true } } },
  });
  if (!row) throw notFound('Assignment');
  if (!(await canSeeOffering(user, row.courseOfferingId, row.courseOffering.sectionId))) {
    throw forbidden();
  }
  return findFile(row.attachments, fileId);
}

export async function submissionFile(user: CurrentUser, submissionId: string, fileId: string) {
  const row = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { assignment: { select: { courseOfferingId: true } } },
  });
  if (!row) throw notFound('Submission');
  // canAccessStudent would let a teacher of any course in the section in, so be stricter.
  const allowed =
    user.role === 'TEACHER'
      ? await teachesOffering(user, row.assignment.courseOfferingId)
      : await canAccessStudent(user, row.studentId);
  if (!allowed) throw forbidden();
  return findFile(row.files, fileId);
}

export async function materialFile(user: CurrentUser, materialId: string, fileId: string) {
  const row = await prisma.material.findUnique({
    where: { id: materialId },
    include: { courseOffering: { select: { sectionId: true } } },
  });
  if (!row) throw notFound('Material');
  if (!(await canSeeOffering(user, row.courseOfferingId, row.courseOffering.sectionId))) {
    throw forbidden();
  }
  return findFile(row.files, fileId);
}

// ---------- Materials ----------

const materialInclude = {
  courseOffering: {
    select: {
      course: { select: { code: true, title: true } },
      section: { select: { name: true } },
    },
  },
} as const;

function toMaterialView(
  row: Prisma.MaterialGetPayload<{ include: typeof materialInclude }>,
): MaterialView {
  return {
    id: row.id,
    courseOfferingId: row.courseOfferingId,
    title: row.title,
    description: row.description,
    files: filesOf(row.files),
    createdAt: row.createdAt.toISOString(),
    courseCode: row.courseOffering.course.code,
    courseTitle: row.courseOffering.course.title,
    sectionName: row.courseOffering.section.name,
  };
}

export async function listTeacherMaterials(
  user: CurrentUser,
  query: PaginationQuery & { offeringId?: string },
) {
  const where: Prisma.MaterialWhereInput = {
    courseOfferingId: query.offeringId,
    courseOffering: isAdmin(user) ? undefined : { teacher: { userId: user.id } },
  };
  const [rows, total] = await Promise.all([
    prisma.material.findMany({
      ...pageArgs(query),
      where,
      include: materialInclude,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.material.count({ where }),
  ]);
  return paginated(rows.map(toMaterialView), total, query);
}

export async function listStudentMaterials(user: CurrentUser, studentId: string) {
  await assertCanAccessStudent(user, studentId);
  const rows = await prisma.material.findMany({
    where: {
      courseOffering: {
        section: { enrollments: { some: { studentId, status: 'ACTIVE' } } },
      },
    },
    include: materialInclude,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toMaterialView);
}

export async function createMaterial(user: CurrentUser, body: MaterialBody, files: StoredFile[]) {
  await assertTeaches(user, body.courseOfferingId);
  const row = await prisma.material.create({
    data: {
      courseOfferingId: body.courseOfferingId,
      title: body.title,
      description: body.description,
      files: asJson(files),
      createdById: user.id,
    },
    include: materialInclude,
  });
  return toMaterialView(row);
}

export async function deleteMaterial(user: CurrentUser, id: string) {
  const existing = await prisma.material.findUnique({ where: { id } });
  if (!existing) throw notFound('Material');
  await assertTeaches(user, existing.courseOfferingId);
  await prisma.material.delete({ where: { id } });
  await Promise.all(filesOf(existing.files).map((file) => storage.remove(file)));
}
