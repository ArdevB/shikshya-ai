import type { Role } from '@shikshya/shared';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

export const PASSWORD = 'Password123';
const passwordHash = bcrypt.hashSync(PASSWORD, 4);

export { prisma };

/** Empties every table, so each test file starts clean. */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`);
}

const userData = (email: string, role: Role, firstName = 'Test', lastName = 'User') => ({
  email,
  passwordHash,
  role,
  firstName,
  lastName,
});

export async function createAdmin(email = 'admin@test.local') {
  return prisma.user.create({ data: userData(email, 'ADMIN') });
}

/**
 * A small institution: one program with one section, one course and two teachers
 * (only teacherA teaches the offering), two students, and a parent of student A only.
 */
export async function createFixture() {
  const admin = await createAdmin();
  const department = await prisma.department.create({ data: { name: 'CS', code: 'CS' } });
  const program = await prisma.program.create({
    data: { departmentId: department.id, name: 'CSIT', code: 'CSIT', durationSemesters: 8 },
  });
  const year = await prisma.academicYear.create({
    data: {
      name: '2026/27',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      isCurrent: true,
    },
  });
  const semester = await prisma.semester.create({
    data: {
      programId: program.id,
      academicYearId: year.id,
      number: 6,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-06-30'),
    },
  });
  const section = await prisma.section.create({ data: { semesterId: semester.id, name: 'A' } });
  const course = await prisma.course.create({
    data: {
      programId: program.id,
      code: 'CSC364',
      title: 'Software Engineering',
      creditHours: 3,
      semesterNumber: 6,
    },
  });

  const makeTeacher = (key: string) =>
    prisma.teacher.create({
      data: {
        employeeCode: key,
        designation: 'Lecturer',
        department: { connect: { id: department.id } },
        user: { create: userData(`${key}@test.local`, 'TEACHER') },
      },
      include: { user: true },
    });
  const teacherA = await makeTeacher('teacher-a');
  const teacherB = await makeTeacher('teacher-b');

  const offering = await prisma.courseOffering.create({
    data: { courseId: course.id, sectionId: section.id, teacherId: teacherA.id },
  });

  const makeStudent = (key: string) =>
    prisma.student.create({
      data: {
        rollNumber: key,
        program: { connect: { id: program.id } },
        currentSection: { connect: { id: section.id } },
        admissionDate: new Date('2023-01-01'),
        enrollments: { create: { sectionId: section.id } },
        user: { create: userData(`${key}@test.local`, 'STUDENT') },
      },
      include: { user: true },
    });
  const studentA = await makeStudent('student-a');
  const studentB = await makeStudent('student-b');

  const parent = await prisma.parent.create({
    data: {
      user: { create: userData('parent@test.local', 'PARENT') },
      children: { create: { studentId: studentA.id, relation: 'Mother' } },
    },
    include: { user: true },
  });

  return {
    admin,
    department,
    program,
    year,
    semester,
    section,
    course,
    teacherA,
    teacherB,
    offering,
    studentA,
    studentB,
    parent,
  };
}

export const app = createApp();
export const api = () => request(app);

/** Logs in through the real route and returns the access token. */
export async function tokenFor(email: string) {
  const response = await api().post('/api/v1/auth/login').send({ email, password: PASSWORD });
  if (response.status !== 200) {
    throw new Error(`Login failed for ${email}: ${response.status} ${response.text}`);
  }
  return (response.body as { accessToken: string }).accessToken;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
