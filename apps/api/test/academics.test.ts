import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearCache } from '../src/lib/cache.js';
import { submitAssignment } from '../src/services/assignment.service.js';
import { api, bearer, createFixture, prisma, resetDatabase, tokenFor } from './helpers.js';

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let fx: Fixture;
let admin: string;
let teacherA: string;
let teacherB: string;
let studentA: string;
let studentB: string;
let parent: string;

const V1 = '/api/v1';

const TU_SCALE = [
  ['A', 90, 100, 4.0],
  ['A-', 80, 90, 3.7],
  ['B+', 70, 80, 3.3],
  ['B', 60, 70, 3.0],
  ['B-', 50, 60, 2.7],
  ['C', 40, 50, 2.3],
  ['F', 0, 40, 0],
] as const;

beforeAll(async () => {
  await resetDatabase();
  fx = await createFixture();
  await prisma.gradeScale.createMany({
    data: TU_SCALE.map(([grade, minPercent, maxPercent, gradePoint]) => ({
      grade,
      minPercent,
      maxPercent,
      gradePoint,
    })),
  });
  admin = await tokenFor(fx.admin.email);
  teacherA = await tokenFor(fx.teacherA.user.email);
  teacherB = await tokenFor(fx.teacherB.user.email);
  studentA = await tokenFor(fx.studentA.user.email);
  studentB = await tokenFor(fx.studentB.user.email);
  parent = await tokenFor(fx.parent.user.email);
});

describe('timetable', () => {
  let roomId: string;
  let otherRoomId: string;
  let slotId: string;
  let otherTeacherId: string;

  beforeAll(async () => {
    otherTeacherId = (
      await prisma.teacher.create({
        data: {
          employeeCode: 'timetable-teacher',
          designation: 'Lecturer',
          department: { connect: { id: fx.department.id } },
          user: {
            create: {
              email: 'timetable-teacher@test.local',
              passwordHash: 'unused',
              role: 'TEACHER',
              firstName: 'Time',
              lastName: 'Table',
            },
          },
        },
      })
    ).id;
    roomId = (await prisma.room.create({ data: { name: 'R1', capacity: 40 } })).id;
    otherRoomId = (await prisma.room.create({ data: { name: 'R2', capacity: 40 } })).id;
    slotId = (
      await prisma.timeSlot.create({
        data: { dayOfWeek: 1, startTime: '09:00', endTime: '10:00' },
      })
    ).id;
  });
  beforeEach(async () => {
    await prisma.timetableEntry.deleteMany();
  });

  const post = (body: object, token = admin) =>
    api().post(`${V1}/timetable/entries`).set(bearer(token)).send(body);

  /** A second offering, so the clashes come from one shared thing at a time. */
  async function secondOffering(opts: { sameTeacher?: boolean; sameSection?: boolean }) {
    const code = `C${Math.random().toString(36).slice(2, 8)}`;
    const course = await prisma.course.create({
      data: {
        programId: fx.program.id,
        code,
        title: code,
        creditHours: 3,
        semesterNumber: 6,
      },
    });
    const section = opts.sameSection
      ? fx.section
      : await prisma.section.create({ data: { semesterId: fx.semester.id, name: code } });
    return prisma.courseOffering.create({
      data: {
        courseId: course.id,
        sectionId: section.id,
        teacherId: opts.sameTeacher ? fx.teacherA.id : otherTeacherId,
      },
    });
  }

  it('creates an entry, recording the semester from the offering', async () => {
    const response = await post({ courseOfferingId: fx.offering.id, roomId, timeSlotId: slotId });
    expect(response.status).toBe(201);
    expect(response.body.semesterId).toBe(fx.semester.id);
  });

  it('returns 409 naming a room clash', async () => {
    await post({ courseOfferingId: fx.offering.id, roomId, timeSlotId: slotId });
    const other = await secondOffering({});
    const response = await post({ courseOfferingId: other.id, roomId, timeSlotId: slotId });
    expect(response.status).toBe(409);
    expect(response.body.error.details.map((d: { type: string }) => d.type)).toEqual(['ROOM']);
    expect(response.body.error.message).toContain('R1 is already booked Monday at 09:00');
  });

  it('returns 409 naming a teacher clash', async () => {
    await post({ courseOfferingId: fx.offering.id, roomId, timeSlotId: slotId });
    const other = await secondOffering({ sameTeacher: true });
    const response = await post({
      courseOfferingId: other.id,
      roomId: otherRoomId,
      timeSlotId: slotId,
    });
    expect(response.status).toBe(409);
    expect(response.body.error.details.map((d: { type: string }) => d.type)).toEqual(['TEACHER']);
    expect(response.body.error.message).toContain('is already teaching');
  });

  it('returns 409 naming a section clash', async () => {
    await post({ courseOfferingId: fx.offering.id, roomId, timeSlotId: slotId });
    const other = await secondOffering({ sameSection: true });
    const response = await post({
      courseOfferingId: other.id,
      roomId: otherRoomId,
      timeSlotId: slotId,
    });
    expect(response.status).toBe(409);
    expect(response.body.error.details.map((d: { type: string }) => d.type)).toEqual(['SECTION']);
    expect(response.body.error.message).toContain('Section A already has');
  });

  it('catches a room clash with another program in the same period', async () => {
    await post({ courseOfferingId: fx.offering.id, roomId, timeSlotId: slotId });
    const program = await prisma.program.create({
      data: {
        departmentId: fx.department.id,
        name: 'Other',
        code: `P${Date.now()}`,
        durationSemesters: 8,
      },
    });
    const semester = await prisma.semester.create({
      data: {
        programId: program.id,
        academicYearId: fx.year.id,
        number: 2,
        startDate: fx.semester.startDate,
        endDate: fx.semester.endDate,
      },
    });
    const section = await prisma.section.create({ data: { semesterId: semester.id, name: 'A' } });
    const course = await prisma.course.create({
      data: {
        programId: program.id,
        code: 'X1',
        title: 'X',
        creditHours: 3,
        semesterNumber: 2,
      },
    });
    const offering = await prisma.courseOffering.create({
      data: { courseId: course.id, sectionId: section.id, teacherId: otherTeacherId },
    });
    const response = await post({ courseOfferingId: offering.id, roomId, timeSlotId: slotId });
    expect(response.status).toBe(409);
  });

  it('only lets admins change the timetable, and everyone read it', async () => {
    const body = { courseOfferingId: fx.offering.id, roomId, timeSlotId: slotId };
    expect((await post(body, teacherA)).status).toBe(403);
    await post(body);
    const read = await api()
      .get(`${V1}/timetable?sectionId=${fx.section.id}`)
      .set(bearer(studentA));
    expect(read.status).toBe(200);
    expect(read.body.entries).toHaveLength(1);
    expect(read.body.slots.length).toBeGreaterThan(0);
  });

  it('asks for a filter', async () => {
    expect((await api().get(`${V1}/timetable`).set(bearer(admin))).status).toBe(400);
  });
});

describe('exams, marks and results', () => {
  let examId: string;
  let subjectId: string;

  const markPath = (studentId: string) => `${V1}/exam-subjects/${subjectId}/marks/${studentId}`;
  const enter = (studentId: string, body: object, token = teacherA) =>
    api().put(markPath(studentId)).set(bearer(token)).send(body);

  beforeAll(async () => {
    const exam = await api().post(`${V1}/exams`).set(bearer(admin)).send({
      semesterId: fx.semester.id,
      name: 'First Term',
      type: 'INTERNAL',
      startDate: '2026-02-01',
      endDate: '2026-02-10',
    });
    examId = exam.body.id;
    const subject = await api()
      .post(`${V1}/exams/${examId}/subjects`)
      .set(bearer(admin))
      .send({ courseOfferingId: fx.offering.id, fullMarks: 100, passMarks: 40 });
    subjectId = subject.body.id;
  });

  it('forbids a teacher from entering marks for another teacher’s course', async () => {
    const response = await enter(fx.studentA.id, { marksObtained: 50, isAbsent: false }, teacherB);
    expect(response.status).toBe(403);
    expect(await prisma.mark.count()).toBe(0);
  });

  it('forbids students from entering marks', async () => {
    const response = await enter(fx.studentA.id, { marksObtained: 99, isAbsent: false }, studentA);
    expect(response.status).toBe(403);
  });

  it('validates 0 <= marks <= full marks', async () => {
    expect((await enter(fx.studentA.id, { marksObtained: 101, isAbsent: false })).status).toBe(400);
    expect((await enter(fx.studentA.id, { marksObtained: -1, isAbsent: false })).status).toBe(400);
  });

  it('requires marks unless the student is absent', async () => {
    expect((await enter(fx.studentA.id, { marksObtained: null, isAbsent: false })).status).toBe(
      400,
    );
  });

  it('refuses to publish while marks are missing, and says which', async () => {
    const response = await api().post(`${V1}/exams/${examId}/publish`).set(bearer(admin));
    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('CSC364');
    expect(await prisma.result.count()).toBe(0);
  });

  it('writes an AuditLog row for every change', async () => {
    await enter(fx.studentA.id, { marksObtained: 70, isAbsent: false });
    const updated = await enter(fx.studentA.id, { marksObtained: 75, isAbsent: false });
    expect(updated.status).toBe(200);
    const logs = await prisma.auditLog.findMany({
      where: { entity: 'Mark', entityId: updated.body.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((log) => log.action)).toEqual(['MARK_CREATE', 'MARK_UPDATE']);
    expect(logs[1]!.before).toEqual({ marksObtained: 70, isAbsent: false });
    expect(logs[1]!.actorId).toBe(fx.teacherA.userId);
  });

  it('hides results from students until publishing', async () => {
    const response = await api()
      .get(`${V1}/students/${fx.studentA.id}/results`)
      .set(bearer(studentA));
    expect(response.status).toBe(200);
    expect(response.body.semesters).toEqual([]);
  });

  it('only lets admins publish', async () => {
    const response = await api().post(`${V1}/exams/${examId}/publish`).set(bearer(teacherA));
    expect(response.status).toBe(403);
  });

  it('computes results on publish, including an absent student', async () => {
    await enter(fx.studentB.id, { marksObtained: null, isAbsent: true });
    const response = await api().post(`${V1}/exams/${examId}/publish`).set(bearer(admin));
    expect(response.status).toBe(200);
    expect(response.body.isPublished).toBe(true);

    const a = await api().get(`${V1}/students/${fx.studentA.id}/results`).set(bearer(studentA));
    expect(a.body.semesters[0]).toMatchObject({ gpa: 3.3, totalCredits: 3, status: 'PASS' });
    expect(a.body.semesters[0].courses[0]).toMatchObject({
      courseCode: 'CSC364',
      percent: 75,
      grade: 'B+',
      gradePoint: 3.3,
    });
    expect(a.body.cgpa).toBe(3.3);

    const b = await api().get(`${V1}/students/${fx.studentB.id}/results`).set(bearer(studentB));
    expect(b.body.semesters[0]).toMatchObject({ gpa: 0, status: 'FAIL' });
    expect(b.body.semesters[0].courses[0]).toMatchObject({ grade: 'F', gradePoint: 0 });
  });

  it('locks marks after publishing', async () => {
    const response = await enter(fx.studentA.id, { marksObtained: 99, isAbsent: false });
    expect(response.status).toBe(409);
    const sheet = await api().get(`${V1}/exam-subjects/${subjectId}/marks`).set(bearer(teacherA));
    expect(sheet.body.isPublished).toBe(true);
    expect(
      sheet.body.rows.find((r: { studentId: string }) => r.studentId === fx.studentA.id)
        .marksObtained,
    ).toBe(75);
  });

  it('keeps other students and parents out', async () => {
    const other = await api().get(`${V1}/students/${fx.studentB.id}/results`).set(bearer(studentA));
    expect(other.status).toBe(403);
    const unlinked = await api()
      .get(`${V1}/students/${fx.studentB.id}/results`)
      .set(bearer(parent));
    expect(unlinked.status).toBe(403);
    const linked = await api().get(`${V1}/students/${fx.studentA.id}/results`).set(bearer(parent));
    expect(linked.status).toBe(200);
  });

  it('summarises a section for its teacher only', async () => {
    const response = await api()
      .get(`${V1}/sections/${fx.section.id}/results`)
      .set(bearer(teacherA));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      studentCount: 2,
      passCount: 1,
      passPercent: 50,
      averageGpa: 1.65,
    });
    const grades = Object.fromEntries(
      response.body.gradeDistribution.map((g: { grade: string; count: number }) => [
        g.grade,
        g.count,
      ]),
    );
    expect(grades).toMatchObject({ 'B+': 1, F: 1, A: 0 });

    const other = await api().get(`${V1}/sections/${fx.section.id}/results`).set(bearer(teacherB));
    expect(other.status).toBe(403);
    const student = await api()
      .get(`${V1}/sections/${fx.section.id}/results`)
      .set(bearer(studentA));
    expect(student.status).toBe(403);
  });

  it('lets an admin unlock, logged, which withdraws the result until republished', async () => {
    const response = await api().post(`${V1}/exams/${examId}/unlock`).set(bearer(admin));
    expect(response.status).toBe(200);
    expect(
      await prisma.auditLog.count({ where: { action: 'EXAM_UNLOCK', entityId: examId } }),
    ).toBe(1);
    const hidden = await api()
      .get(`${V1}/students/${fx.studentA.id}/results`)
      .set(bearer(studentA));
    expect(hidden.body.semesters).toEqual([]);

    expect((await enter(fx.studentA.id, { marksObtained: 92, isAbsent: false })).status).toBe(200);
    await api().post(`${V1}/exams/${examId}/publish`).set(bearer(admin));
    const shown = await api().get(`${V1}/students/${fx.studentA.id}/results`).set(bearer(studentA));
    expect(shown.body.semesters[0].gpa).toBe(4);
  });

  it('combines a second published exam into the same result', async () => {
    const final = await api().post(`${V1}/exams`).set(bearer(admin)).send({
      semesterId: fx.semester.id,
      name: 'Final',
      type: 'FINAL',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
    });
    const subject = await api()
      .post(`${V1}/exams/${final.body.id}/subjects`)
      .set(bearer(admin))
      .send({ courseOfferingId: fx.offering.id, fullMarks: 100, passMarks: 40 });
    const path = (studentId: string) => `${V1}/exam-subjects/${subject.body.id}/marks/${studentId}`;
    await api()
      .put(path(fx.studentA.id))
      .set(bearer(teacherA))
      .send({ marksObtained: 68, isAbsent: false });
    await api()
      .put(path(fx.studentB.id))
      .set(bearer(teacherA))
      .send({ marksObtained: 80, isAbsent: false });
    const published = await api().post(`${V1}/exams/${final.body.id}/publish`).set(bearer(admin));
    expect(published.status).toBe(200);

    expect(await prisma.result.count()).toBe(2);
    // (92 + 68) / 200 = 80% is A-. Student B: (absent + 80) / 200 = 40% is exactly a pass.
    const a = await api().get(`${V1}/students/${fx.studentA.id}/results`).set(bearer(studentA));
    expect(a.body.semesters[0].courses[0]).toMatchObject({ percent: 80, grade: 'A-' });
    const b = await api().get(`${V1}/students/${fx.studentB.id}/results`).set(bearer(studentB));
    expect(b.body.semesters[0].courses[0]).toMatchObject({ percent: 40, grade: 'C' });
    expect(b.body.semesters[0].status).toBe('PASS');
  });

  it('computes CGPA across published semesters', async () => {
    const earlier = await prisma.semester.create({
      data: {
        programId: fx.program.id,
        academicYearId: fx.year.id,
        number: 5,
        startDate: new Date('2025-07-01'),
        endDate: new Date('2025-12-31'),
      },
    });
    await prisma.result.create({
      data: {
        studentId: fx.studentA.id,
        semesterId: earlier.id,
        gpa: 3.0,
        totalCredits: 9,
        status: 'PASS',
        publishedAt: new Date(),
      },
    });
    const response = await api()
      .get(`${V1}/students/${fx.studentA.id}/results`)
      .set(bearer(studentA));
    // (3.0 x 9 + 3.7 x 3) / 12 = 38.1 / 12 = 3.175 => 3.18
    expect(response.body.cgpa).toBe(3.18);
    expect(
      response.body.semesters.map((s: { semesterNumber: number }) => s.semesterNumber),
    ).toEqual([5, 6]);
  });
});

describe('assignments', () => {
  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
  const create = (overrides: Record<string, string> = {}, token = teacherA) =>
    api()
      .post(`${V1}/assignments`)
      .set(bearer(token))
      .field({
        courseOfferingId: fx.offering.id,
        title: 'Essay',
        description: 'Write it',
        dueAt: inDays(3),
        maxMarks: '20',
        allowLate: 'false',
        ...overrides,
      });
  const submit = (id: string, token = studentA, text = 'My answer') =>
    api().post(`${V1}/assignments/${id}/submission`).set(bearer(token)).field({ text });

  beforeEach(async () => {
    await prisma.assignment.deleteMany();
  });

  it('lets a teacher create for their own offering only', async () => {
    expect((await create()).status).toBe(201);
    expect((await create({}, teacherB)).status).toBe(403);
    expect((await create({}, studentA)).status).toBe(403);
  });

  it('moves through Due, Submitted and Graded', async () => {
    const assignment = (await create()).body;
    const status = async () => {
      const response = await api()
        .get(`${V1}/students/${fx.studentA.id}/assignments`)
        .set(bearer(studentA));
      return response.body[0];
    };
    expect((await status()).status).toBe('DUE');

    const submission = await submit(assignment.id);
    expect(submission.status).toBe(201);
    expect(submission.body.isLate).toBe(false);
    const submitted = await status();
    expect(submitted.status).toBe('SUBMITTED');

    await prisma.submission.update({
      where: { id: submission.body.id },
      data: { marks: 5, feedback: 'draft' },
    });
    const beforeGrading = await status();
    expect(beforeGrading.submission.marks).toBeNull();
    expect(beforeGrading.submission.feedback).toBeNull();

    const graded = await api()
      .put(`${V1}/submissions/${submission.body.id}/grade`)
      .set(bearer(teacherA))
      .send({ marks: 18, feedback: 'Good' });
    expect(graded.status).toBe(200);
    const after = await status();
    expect(after.status).toBe('GRADED');
    expect(after.submission).toMatchObject({ marks: 18, feedback: 'Good' });
  });

  it('shows Overdue past the deadline with no submission', async () => {
    await create({ dueAt: inDays(-1) });
    const response = await api()
      .get(`${V1}/students/${fx.studentA.id}/assignments`)
      .set(bearer(studentA));
    expect(response.body[0].status).toBe('OVERDUE');
  });

  it('allows resubmitting until the deadline', async () => {
    const assignment = (await create()).body;
    await submit(assignment.id, studentA, 'First');
    const again = await submit(assignment.id, studentA, 'Second');
    expect(again.status).toBe(201);
    const stored = await prisma.submission.findMany({ where: { assignmentId: assignment.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.text).toBe('Second');
  });

  it('rejects late work when allowLate is false', async () => {
    const assignment = (await create({ dueAt: inDays(-1) })).body;
    const response = await submit(assignment.id);
    expect(response.status).toBe(409);
    expect(await prisma.submission.count({ where: { assignmentId: assignment.id } })).toBe(0);
  });

  it('accepts late work and flags it when allowLate is true', async () => {
    const assignment = (await create({ dueAt: inDays(-1), allowLate: 'true' })).body;
    const response = await submit(assignment.id);
    expect(response.status).toBe(201);
    expect(response.body.isLate).toBe(true);
  });

  it('does not allow resubmitting after the deadline, even with allowLate', async () => {
    const assignment = (await create({ allowLate: 'true' })).body;
    await submit(assignment.id, studentA, 'On time');
    const student = { id: fx.studentA.userId, role: 'STUDENT' as const };
    await expect(
      submitAssignment(
        student,
        assignment.id,
        { text: 'Too late', files: [] },
        new Date(Date.now() + 5 * 86_400_000),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('does not allow changing graded work', async () => {
    const assignment = (await create()).body;
    const submission = await submit(assignment.id);
    await api()
      .put(`${V1}/submissions/${submission.body.id}/grade`)
      .set(bearer(teacherA))
      .send({ marks: 10 });
    expect((await submit(assignment.id)).status).toBe(409);
  });

  it('requires a file or text', async () => {
    const assignment = (await create()).body;
    const response = await api()
      .post(`${V1}/assignments/${assignment.id}/submission`)
      .set(bearer(studentA))
      .field({ text: '' });
    expect(response.status).toBe(400);
  });

  it('forbids grading by another teacher and marks above the maximum', async () => {
    const assignment = (await create()).body;
    const submission = await submit(assignment.id);
    const path = `${V1}/submissions/${submission.body.id}/grade`;
    expect((await api().put(path).set(bearer(teacherB)).send({ marks: 5 })).status).toBe(403);
    expect((await api().put(path).set(bearer(teacherA)).send({ marks: 21 })).status).toBe(400);
  });

  it('stores files and only lets the right people download them', async () => {
    const assignment = (await create()).body;
    const submission = await api()
      .post(`${V1}/assignments/${assignment.id}/submission`)
      .set(bearer(studentA))
      .attach('files', Buffer.from('%PDF-1.4 hello'), 'answer.pdf');
    expect(submission.status).toBe(201);
    const file = submission.body.files[0];
    expect(file.name).toBe('answer.pdf');
    const path = `${V1}/submissions/${submission.body.id}/files/${file.id}`;

    const own = await api().get(path).set(bearer(studentA));
    expect(own.status).toBe(200);
    expect(own.headers['content-disposition']).toContain('attachment');
    expect((await api().get(path).set(bearer(teacherA))).status).toBe(200);
    expect((await api().get(path).set(bearer(studentB))).status).toBe(403);
    expect((await api().get(path).set(bearer(teacherB))).status).toBe(403);
  });

  it('rejects a disallowed file type', async () => {
    const assignment = (await create()).body;
    const response = await api()
      .post(`${V1}/assignments/${assignment.id}/submission`)
      .set(bearer(studentA))
      .attach('files', Buffer.from('MZ'), 'virus.exe');
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('not an allowed file type');
  });

  it('rejects a file over 10 MB', async () => {
    const assignment = (await create()).body;
    const response = await api()
      .post(`${V1}/assignments/${assignment.id}/submission`)
      .set(bearer(studentA))
      .attach('files', Buffer.alloc(10 * 1024 * 1024 + 1), 'big.pdf');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('UPLOAD_REJECTED');
  });
});

describe('materials', () => {
  it('lets the teacher upload, and only their section see it', async () => {
    const response = await api()
      .post(`${V1}/materials`)
      .set(bearer(teacherA))
      .field({ courseOfferingId: fx.offering.id, title: 'Slides' })
      .attach('files', Buffer.from('x'), 'slides.pptx');
    expect(response.status).toBe(201);

    const seen = await api()
      .get(`${V1}/students/${fx.studentA.id}/materials`)
      .set(bearer(studentA));
    expect(seen.body.map((m: { title: string }) => m.title)).toContain('Slides');

    const forbidden = await api()
      .post(`${V1}/materials`)
      .set(bearer(teacherB))
      .field({ courseOfferingId: fx.offering.id, title: 'Nope' });
    expect(forbidden.status).toBe(403);

    const file = response.body.files[0];
    const path = `${V1}/materials/${response.body.id}/files/${file.id}`;
    expect((await api().get(path).set(bearer(studentA))).status).toBe(200);
    expect((await api().get(path).set(bearer(teacherB))).status).toBe(403);
  });
});

describe('notices', () => {
  let otherProgramId: string;
  let otherSectionId: string;

  beforeAll(async () => {
    const program = await prisma.program.create({
      data: {
        departmentId: fx.department.id,
        name: 'Elsewhere',
        code: 'ELSE',
        durationSemesters: 8,
      },
    });
    otherProgramId = program.id;
    const semester = await prisma.semester.create({
      data: {
        programId: program.id,
        academicYearId: fx.year.id,
        number: 1,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-06-30'),
      },
    });
    otherSectionId = (
      await prisma.section.create({ data: { semesterId: semester.id, name: 'Other' } })
    ).id;
  });
  beforeEach(async () => {
    await prisma.notice.deleteMany();
  });

  const post = (body: object, token = admin) =>
    api()
      .post(`${V1}/notices`)
      .set(bearer(token))
      .send({ title: 'T', body: 'B', ...body });
  const seenBy = async (token: string) => {
    const response = await api().get(`${V1}/notices`).set(bearer(token));
    return response.body.data.map((n: { title: string }) => n.title);
  };

  const notices = () => ({
    all: { title: 'all', audience: 'ALL' },
    students: { title: 'students', audience: 'STUDENTS' },
    teachers: { title: 'teachers', audience: 'TEACHERS' },
    parents: { title: 'parents', audience: 'PARENTS' },
    ownProgram: { title: 'own-program', audience: 'PROGRAM', programId: fx.program.id },
    otherProgram: { title: 'other-program', audience: 'PROGRAM', programId: otherProgramId },
    ownSection: { title: 'own-section', audience: 'SECTION', sectionId: fx.section.id },
    otherSection: { title: 'other-section', audience: 'SECTION', sectionId: otherSectionId },
  });

  it('shows each audience type only to its audience', async () => {
    for (const body of Object.values(notices())) {
      expect((await post(body)).status).toBe(201);
    }
    const sorted = async (token: string) => (await seenBy(token)).sort();

    expect(await sorted(studentA)).toEqual(['all', 'own-program', 'own-section', 'students']);
    expect(await sorted(teacherA)).toEqual(['all', 'own-program', 'own-section', 'teachers']);
    // Teacher B teaches nothing, so has no program or section.
    expect(await sorted(teacherB)).toEqual(['all', 'teachers']);
    expect(await sorted(parent)).toEqual(['all', 'own-program', 'own-section', 'parents']);
    expect((await sorted(admin)).length).toBe(8);
  });

  it('requires a target for program and section notices', async () => {
    expect((await post({ audience: 'PROGRAM' })).status).toBe(400);
    expect((await post({ audience: 'SECTION' })).status).toBe(400);
  });

  it('only lets a teacher target sections they teach', async () => {
    const own = await post({ audience: 'SECTION', sectionId: fx.section.id }, teacherA);
    expect(own.status).toBe(201);
    for (const body of [
      { audience: 'ALL' },
      { audience: 'STUDENTS' },
      { audience: 'PROGRAM', programId: fx.program.id },
      { audience: 'SECTION', sectionId: otherSectionId },
    ]) {
      expect((await post(body, teacherA)).status).toBe(403);
    }
    expect((await post({ audience: 'ALL' }, studentA)).status).toBe(403);
  });

  it('hides unpublished and expired notices from their audience', async () => {
    const soon = new Date(Date.now() + 3_600_000).toISOString();
    const past = new Date(Date.now() - 7_200_000).toISOString();
    await post({ title: 'future', audience: 'ALL', publishAt: soon });
    await prisma.notice.create({
      data: {
        title: 'expired',
        body: 'x',
        audience: 'ALL',
        publishAt: new Date(past),
        expiresAt: new Date(Date.now() - 3_600_000),
        createdById: fx.admin.id,
      },
    });
    expect(await seenBy(studentA)).toEqual([]);
    expect(await seenBy(admin)).toHaveLength(2);
  });

  it('puts pinned notices first', async () => {
    await post({ title: 'older pinned', audience: 'ALL', isPinned: true });
    await post({ title: 'newer', audience: 'ALL' });
    expect(await seenBy(studentA)).toEqual(['older pinned', 'newer']);
  });

  it('counts unread and marks as read', async () => {
    const notice = (await post({ audience: 'ALL' })).body;
    await post({ audience: 'ALL' });
    const count = async () =>
      (await api().get(`${V1}/notices/unread-count`).set(bearer(studentA))).body.count;
    expect(await count()).toBe(2);
    const read = await api().post(`${V1}/notices/${notice.id}/read`).set(bearer(studentA));
    expect(read.status).toBe(204);
    expect(await count()).toBe(1);
    // Other users are unaffected.
    const parentCount = await api().get(`${V1}/notices/unread-count`).set(bearer(parent));
    expect(parentCount.body.count).toBe(2);
  });

  it('treats a notice for someone else as not found', async () => {
    const notice = (await post({ audience: 'TEACHERS' })).body;
    expect((await api().get(`${V1}/notices/${notice.id}`).set(bearer(studentA))).status).toBe(404);
    expect((await api().post(`${V1}/notices/${notice.id}/read`).set(bearer(studentA))).status).toBe(
      404,
    );
  });

  it('only lets the author or an admin edit', async () => {
    const notice = (
      await post({ audience: 'SECTION', sectionId: fx.section.id, title: 'mine' }, teacherA)
    ).body;
    const body = { title: 'x', body: 'y', audience: 'SECTION', sectionId: fx.section.id };
    const path = `${V1}/notices/${notice.id}`;
    expect((await api().put(path).set(bearer(teacherB)).send(body)).status).toBe(403);
    expect((await api().put(path).set(bearer(teacherA)).send(body)).status).toBe(200);
    expect((await api().delete(path).set(bearer(teacherB))).status).toBe(403);
    expect((await api().delete(path).set(bearer(admin))).status).toBe(204);
  });
});

describe('events', () => {
  it('filters by date range and audience, and only admins create', async () => {
    const body = (title: string, audience: string, date: string) => ({
      title,
      audience,
      startAt: `${date}T04:00:00.000Z`,
      endAt: `${date}T06:00:00.000Z`,
    });
    await api()
      .post(`${V1}/events`)
      .set(bearer(admin))
      .send(body('fest', 'ALL', '2026-03-10'));
    await api()
      .post(`${V1}/events`)
      .set(bearer(admin))
      .send(body('staff', 'TEACHERS', '2026-03-11'));
    await api()
      .post(`${V1}/events`)
      .set(bearer(admin))
      .send(body('later', 'ALL', '2026-05-01'));

    const march = `from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.000Z`;
    const seen = await api().get(`${V1}/events?${march}`).set(bearer(studentA));
    expect(seen.body.map((e: { title: string }) => e.title)).toEqual(['fest']);
    const teacherSeen = await api().get(`${V1}/events?${march}`).set(bearer(teacherA));
    expect(teacherSeen.body.map((e: { title: string }) => e.title)).toEqual(['fest', 'staff']);

    const denied = await api()
      .post(`${V1}/events`)
      .set(bearer(teacherA))
      .send(body('x', 'ALL', '2026-03-12'));
    expect(denied.status).toBe(403);
  });
});

describe('dashboards', () => {
  beforeEach(() => clearCache());

  it('keeps each dashboard to its role', async () => {
    const adminCard = `${V1}/dashboard/admin/students-by-program`;
    expect((await api().get(adminCard).set(bearer(admin))).status).toBe(200);
    expect((await api().get(adminCard).set(bearer(teacherA))).status).toBe(403);
    expect((await api().get(adminCard).set(bearer(studentA))).status).toBe(403);

    const teacherCard = `${V1}/dashboard/teacher/today-classes`;
    expect((await api().get(teacherCard).set(bearer(teacherA))).status).toBe(200);
    expect((await api().get(teacherCard).set(bearer(studentA))).status).toBe(403);
  });

  it('keeps student cards to the student, their parent and their teachers', async () => {
    const card = (id: string) => `${V1}/dashboard/students/${id}/deadlines`;
    expect((await api().get(card(fx.studentA.id)).set(bearer(studentA))).status).toBe(200);
    expect((await api().get(card(fx.studentA.id)).set(bearer(parent))).status).toBe(200);
    expect((await api().get(card(fx.studentB.id)).set(bearer(studentA))).status).toBe(403);
    expect((await api().get(card(fx.studentB.id)).set(bearer(parent))).status).toBe(403);
  });

  it('applies the access check even when the answer is already cached', async () => {
    const card = `${V1}/dashboard/students/${fx.studentA.id}/today`;
    expect((await api().get(card).set(bearer(studentA))).status).toBe(200);
    expect((await api().get(card).set(bearer(studentB))).status).toBe(403);
  });

  it('counts students by program', async () => {
    const response = await api()
      .get(`${V1}/dashboard/admin/students-by-program`)
      .set(bearer(admin));
    expect(response.body.total).toBeGreaterThanOrEqual(2);
  });

  it('finds low attendance with the same rule as everywhere else', async () => {
    await prisma.attendanceSession.create({
      data: {
        courseOfferingId: fx.offering.id,
        date: new Date('2026-01-15'),
        takenById: fx.teacherA.userId,
        records: {
          create: [
            { studentId: fx.studentA.id, status: 'LATE' },
            { studentId: fx.studentB.id, status: 'ABSENT' },
          ],
        },
      },
    });
    const response = await api().get(`${V1}/dashboard/admin/low-attendance`).set(bearer(admin));
    expect(response.status).toBe(200);
    expect(response.body.rows.map((r: { studentId: string }) => r.studentId)).toEqual([
      fx.studentB.id,
    ]);
    expect(response.body.rows[0].percentage).toBe(0);

    const teacher = await api().get(`${V1}/dashboard/teacher/low-attendance`).set(bearer(teacherB));
    expect(teacher.body.studentCount).toBe(0);
  });
});
