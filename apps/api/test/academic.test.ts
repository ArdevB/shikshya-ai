import { beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, createFixture, prisma, resetDatabase, tokenFor } from './helpers.js';

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let fx: Fixture;
let adminToken: string;
let studentToken: string;

const V1 = '/api/v1';

beforeAll(async () => {
  await resetDatabase();
  fx = await createFixture();
  adminToken = await tokenFor(fx.admin.email);
  studentToken = await tokenFor(fx.studentA.user.email);
});

describe('academic structure', () => {
  it('builds the whole chain: department to offering', async () => {
    const post = async (path: string, body: object) => {
      const response = await api().post(`${V1}${path}`).set(bearer(adminToken)).send(body);
      expect(response.status, `${path}: ${response.text}`).toBe(201);
      return response.body as { id: string };
    };

    const department = await post('/departments', { name: 'Mathematics', code: 'math' });
    const program = await post('/programs', {
      departmentId: department.id,
      name: 'BSc Maths',
      code: 'BSCM',
      durationSemesters: 8,
    });
    const year = await post('/academic-years', {
      name: '2027/28',
      startDate: '2027-01-01',
      endDate: '2027-12-31',
    });
    const semester = await post('/semesters', {
      programId: program.id,
      academicYearId: year.id,
      number: 1,
      startDate: '2027-01-01',
      endDate: '2027-06-30',
    });
    const section = await post('/sections', { semesterId: semester.id, name: 'A' });
    const course = await post('/courses', {
      programId: program.id,
      code: 'mth101',
      title: 'Calculus',
      creditHours: 3,
      semesterNumber: 1,
    });
    const offering = await post('/course-offerings', {
      courseId: course.id,
      sectionId: section.id,
      teacherId: fx.teacherA.id,
    });

    expect(offering.id).toEqual(expect.any(String));
    const stored = await prisma.department.findUniqueOrThrow({ where: { id: department.id } });
    expect(stored.code).toBe('MATH');
  });

  it('lets every logged-in user read, but only admins write', async () => {
    const read = await api().get(`${V1}/departments`).set(bearer(studentToken));
    expect(read.status).toBe(200);

    const write = await api()
      .post(`${V1}/departments`)
      .set(bearer(studentToken))
      .send({ name: 'X', code: 'X' });
    expect(write.status).toBe(403);
  });

  it('requires login to read', async () => {
    expect((await api().get(`${V1}/departments`)).status).toBe(401);
  });

  it('returns 409 for a duplicate code', async () => {
    const response = await api()
      .post(`${V1}/departments`)
      .set(bearer(adminToken))
      .send({ name: 'Another', code: 'CS' });
    expect(response.status).toBe(409);
  });

  it('returns 404 for an unknown id', async () => {
    const response = await api().get(`${V1}/departments/nope`).set(bearer(adminToken));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('refuses to delete a department that is in use', async () => {
    const response = await api()
      .delete(`${V1}/departments/${fx.department.id}`)
      .set(bearer(adminToken));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('IN_USE');
  });

  it('refuses a semester beyond the length of the program', async () => {
    const response = await api().post(`${V1}/semesters`).set(bearer(adminToken)).send({
      programId: fx.program.id,
      academicYearId: fx.year.id,
      number: 9,
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    });
    expect(response.status).toBe(400);
  });

  it('refuses an academic year that ends before it starts', async () => {
    const response = await api().post(`${V1}/academic-years`).set(bearer(adminToken)).send({
      name: 'Backwards',
      startDate: '2028-12-31',
      endDate: '2028-01-01',
    });
    expect(response.status).toBe(400);
  });

  it('keeps only one academic year current', async () => {
    const response = await api().post(`${V1}/academic-years`).set(bearer(adminToken)).send({
      name: '2030/31',
      startDate: '2030-01-01',
      endDate: '2030-12-31',
      isCurrent: true,
    });
    expect(response.status).toBe(201);
    expect(await prisma.academicYear.count({ where: { isCurrent: true } })).toBe(1);
    // Put it back, because the other tests rely on the fixture year being current.
    await prisma.academicYear.update({
      where: { id: response.body.id },
      data: { isCurrent: false },
    });
    await prisma.academicYear.update({ where: { id: fx.year.id }, data: { isCurrent: true } });
  });

  it('refuses to offer a course to a section of another semester', async () => {
    const other = await prisma.course.create({
      data: {
        programId: fx.program.id,
        code: 'CSC101',
        title: 'Intro',
        creditHours: 3,
        semesterNumber: 1,
      },
    });
    const response = await api().post(`${V1}/course-offerings`).set(bearer(adminToken)).send({
      courseId: other.id,
      sectionId: fx.section.id,
      teacherId: fx.teacherA.id,
    });
    expect(response.status).toBe(400);
  });

  it('paginates, with a default of 20 and a maximum of 100', async () => {
    const standard = await api().get(`${V1}/departments`).set(bearer(adminToken));
    expect(standard.body.meta).toMatchObject({ page: 1, pageSize: 20 });

    const tooLarge = await api().get(`${V1}/departments?pageSize=101`).set(bearer(adminToken));
    expect(tooLarge.status).toBe(400);
  });
});

describe('people', () => {
  it('creates a teacher with a login and a temporary password', async () => {
    const response = await api().post(`${V1}/teachers`).set(bearer(adminToken)).send({
      email: 'New.Teacher@Test.Local',
      firstName: 'New',
      lastName: 'Teacher',
      employeeCode: 'T-900',
      departmentId: fx.department.id,
      designation: 'Lecturer',
    });
    expect(response.status).toBe(201);
    expect(response.body.teacher.user.email).toBe('new.teacher@test.local');
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');

    const login = await api()
      .post(`${V1}/auth/login`)
      .send({ email: 'new.teacher@test.local', password: response.body.temporaryPassword });
    expect(login.status).toBe(200);
  });

  it('rolls back the login if the teacher profile fails', async () => {
    const response = await api().post(`${V1}/teachers`).set(bearer(adminToken)).send({
      email: 'clash@test.local',
      firstName: 'Clash',
      lastName: 'Teacher',
      employeeCode: fx.teacherA.employeeCode,
      departmentId: fx.department.id,
      designation: 'Lecturer',
    });
    expect(response.status).toBe(409);
    expect(await prisma.user.findUnique({ where: { email: 'clash@test.local' } })).toBeNull();
  });

  it('creates a student with an enrollment', async () => {
    const response = await api().post(`${V1}/students`).set(bearer(adminToken)).send({
      email: 'fresh@test.local',
      firstName: 'Fresh',
      lastName: 'Student',
      rollNumber: 'FRESH-1',
      programId: fx.program.id,
      currentSectionId: fx.section.id,
      admissionDate: '2026-01-15',
    });
    expect(response.status).toBe(201);
    const enrollments = await prisma.enrollment.count({
      where: { studentId: response.body.student.id, status: 'ACTIVE' },
    });
    expect(enrollments).toBe(1);
  });

  it('filters and searches students', async () => {
    const response = await api().get(`${V1}/students?search=student-a`).set(bearer(adminToken));
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].rollNumber).toBe('student-a');

    const bySection = await api()
      .get(`${V1}/students?sectionId=${fx.section.id}`)
      .set(bearer(adminToken));
    expect(bySection.body.meta.total).toBeGreaterThanOrEqual(2);
  });

  it('keeps student records away from non-admins', async () => {
    const list = await api().get(`${V1}/students`).set(bearer(studentToken));
    expect(list.status).toBe(403);
    const one = await api().get(`${V1}/students/${fx.studentB.id}`).set(bearer(studentToken));
    expect(one.status).toBe(403);
    const teachers = await api().get(`${V1}/teachers`).set(bearer(studentToken));
    expect(teachers.status).toBe(403);
  });

  it('links a parent to a child and shows the parent their own children', async () => {
    const parentToken = await tokenFor(fx.parent.user.email);
    const link = await api()
      .post(`${V1}/parents/${fx.parent.id}/students`)
      .set(bearer(adminToken))
      .send({ studentId: fx.studentB.id, relation: 'Father' });
    expect(link.status).toBe(201);

    const children = await api().get(`${V1}/parents/me/children`).set(bearer(parentToken));
    expect(children.status).toBe(200);
    expect(children.body).toHaveLength(2);

    const allowed = await api()
      .get(`${V1}/students/${fx.studentB.id}/attendance-summary`)
      .set(bearer(parentToken));
    expect(allowed.status).toBe(200);

    await api()
      .delete(`${V1}/parents/${fx.parent.id}/students/${fx.studentB.id}`)
      .set(bearer(adminToken));
    const removed = await api()
      .get(`${V1}/students/${fx.studentB.id}/attendance-summary`)
      .set(bearer(parentToken));
    expect(removed.status).toBe(403);
  });
});
