import type { Prisma } from '@prisma/client';
import {
  calculateCgpa,
  calculateGpa,
  gradeCourse,
  type CourseMarks,
  type GradeBand,
  type SectionResultSummary,
  type StudentResults,
} from '@shikshya/shared';
import { notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

type Client = Prisma.TransactionClient | typeof prisma;

export async function loadGradeScale(client: Client = prisma): Promise<GradeBand[]> {
  const rows = await client.gradeScale.findMany({
    where: { scheme: 'TU_GPA' },
    orderBy: { minPercent: 'desc' },
  });
  return rows.map((row) => ({
    grade: row.grade,
    minPercent: Number(row.minPercent),
    maxPercent: Number(row.maxPercent),
    gradePoint: Number(row.gradePoint),
  }));
}

/**
 * Rebuilds every student's result for a semester from its published exams. A course's marks
 * combine across those exams, so publishing the final after an internal updates the same
 * result. With no published exams left, the semester has no results.
 */
export async function recomputeSemesterResults(tx: Prisma.TransactionClient, semesterId: string) {
  const scale = await loadGradeScale(tx);
  const exams = await tx.exam.findMany({
    where: { semesterId, isPublished: true },
    select: {
      subjects: {
        select: {
          fullMarks: true,
          passMarks: true,
          marks: { select: { studentId: true, marksObtained: true, isAbsent: true } },
          courseOffering: {
            select: {
              course: { select: { id: true, creditHours: true } },
              section: {
                select: {
                  enrollments: {
                    where: { status: { not: 'DROPPED' } },
                    select: { studentId: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // studentId -> courseId -> marks
  const byStudent = new Map<string, Map<string, CourseMarks>>();
  for (const subject of exams.flatMap((exam) => exam.subjects)) {
    const { course, section } = subject.courseOffering;
    const marksByStudent = new Map(subject.marks.map((mark) => [mark.studentId, mark]));

    for (const { studentId } of section.enrollments) {
      const courses = byStudent.get(studentId) ?? new Map<string, CourseMarks>();
      byStudent.set(studentId, courses);
      const courseMarks = courses.get(course.id) ?? {
        courseId: course.id,
        creditHours: course.creditHours,
        papers: [],
      };
      courses.set(course.id, courseMarks);

      // A student with no mark, for example one who joined later, counts as absent.
      const mark = marksByStudent.get(studentId);
      courseMarks.papers.push({
        marksObtained:
          !mark || mark.isAbsent || mark.marksObtained === null ? null : Number(mark.marksObtained),
        fullMarks: Number(subject.fullMarks),
        passMarks: Number(subject.passMarks),
      });
    }
  }

  await tx.result.deleteMany({ where: { semesterId } });

  const publishedAt = new Date();
  for (const [studentId, courses] of byStudent) {
    const graded = [...courses.values()].map((course) => gradeCourse(course, scale));
    await tx.result.create({
      data: {
        studentId,
        semesterId,
        gpa: calculateGpa(graded),
        totalCredits: graded.reduce((sum, course) => sum + course.creditHours, 0),
        status: graded.every((course) => course.passed) ? 'PASS' : 'FAIL',
        publishedAt,
        courses: {
          create: graded.map((course) => ({
            courseId: course.courseId,
            percent: course.percent,
            grade: course.grade,
            gradePoint: course.gradePoint,
            creditHours: course.creditHours,
          })),
        },
      },
    });
  }
}

/** Only results with a publish date exist for students, so this can never show a draft. */
export async function getStudentResults(studentId: string): Promise<StudentResults> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      rollNumber: true,
      user: { select: { firstName: true, lastName: true } },
      results: {
        where: { publishedAt: { not: null } },
        orderBy: { semester: { number: 'asc' } },
        include: {
          semester: {
            select: {
              number: true,
              program: { select: { code: true } },
              academicYear: { select: { name: true } },
            },
          },
          courses: {
            include: { course: { select: { code: true, title: true } } },
            orderBy: { course: { code: 'asc' } },
          },
        },
      },
    },
  });
  if (!student) throw notFound('Student');

  const semesters = student.results.map((result) => ({
    resultId: result.id,
    semesterId: result.semesterId,
    semesterNumber: result.semester.number,
    programCode: result.semester.program.code,
    academicYear: result.semester.academicYear.name,
    gpa: Number(result.gpa),
    totalCredits: result.totalCredits,
    status: result.status,
    publishedAt: (result.publishedAt as Date).toISOString(),
    courses: result.courses.map((course) => ({
      courseId: course.courseId,
      courseCode: course.course.code,
      courseTitle: course.course.title,
      percent: Number(course.percent),
      grade: course.grade,
      gradePoint: Number(course.gradePoint),
      creditHours: course.creditHours,
    })),
  }));

  return {
    studentId,
    studentName: `${student.user.firstName} ${student.user.lastName}`,
    rollNumber: student.rollNumber,
    cgpa: calculateCgpa(semesters),
    semesters,
  };
}

export async function getSectionResults(sectionId: string): Promise<SectionResultSummary> {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { semester: { select: { id: true, number: true } } },
  });
  if (!section) throw notFound('Section');

  const results = await prisma.result.findMany({
    where: {
      semesterId: section.semesterId,
      publishedAt: { not: null },
      student: { enrollments: { some: { sectionId } } },
    },
    include: {
      courses: { select: { grade: true } },
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

  const passCount = results.filter((result) => result.status === 'PASS').length;
  const gpaTotal = results.reduce((sum, result) => sum + Number(result.gpa), 0);

  const scale = await loadGradeScale();
  const counts = new Map(scale.map((band) => [band.grade, 0]));
  for (const course of results.flatMap((result) => result.courses)) {
    counts.set(course.grade, (counts.get(course.grade) ?? 0) + 1);
  }

  return {
    sectionId,
    sectionName: section.name,
    semesterNumber: section.semester.number,
    studentCount: results.length,
    passCount,
    passPercent: results.length === 0 ? 0 : Math.round((passCount / results.length) * 10000) / 100,
    averageGpa: results.length === 0 ? 0 : Math.round((gpaTotal / results.length) * 100) / 100,
    gradeDistribution: [...counts].map(([grade, count]) => ({ grade, count })),
    students: results.map((result) => ({
      studentId: result.student.id,
      rollNumber: result.student.rollNumber,
      studentName: `${result.student.user.firstName} ${result.student.user.lastName}`,
      gpa: Number(result.gpa),
      status: result.status,
    })),
  };
}
