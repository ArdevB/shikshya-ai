import { beforeAll, describe, expect, it } from 'vitest';
import { updateSession } from '../src/services/attendance.service.js';
import { api, bearer, createFixture, prisma, resetDatabase, tokenFor } from './helpers.js';

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let fx: Fixture;
let adminToken: string;
let teacherAToken: string;
let teacherBToken: string;
let studentAToken: string;
let parentToken: string;

const SESSIONS = '/api/v1/attendance/sessions';
let nextDay = 1;
/** Each call returns a different date, because one class has one session per day and period. */
const freshDate = () => `2026-03-${String(nextDay++).padStart(2, '0')}`;

const sessionBody = (date = freshDate()) => ({
  offeringId: fx.offering.id,
  date,
  period: 1,
  records: [
    { studentId: fx.studentA.id, status: 'PRESENT' },
    { studentId: fx.studentB.id, status: 'ABSENT' },
  ],
});

beforeAll(async () => {
  await resetDatabase();
  fx = await createFixture();
  adminToken = await tokenFor(fx.admin.email);
  teacherAToken = await tokenFor(fx.teacherA.user.email);
  teacherBToken = await tokenFor(fx.teacherB.user.email);
  studentAToken = await tokenFor(fx.studentA.user.email);
  parentToken = await tokenFor(fx.parent.user.email);
});

describe('taking attendance', () => {
  it('lets a teacher take attendance for their own offering', async () => {
    const response = await api().post(SESSIONS).set(bearer(teacherAToken)).send(sessionBody());
    expect(response.status).toBe(201);
    expect(response.body.records).toHaveLength(2);
  });

  it('forbids a teacher from taking attendance for an offering they do not teach', async () => {
    const response = await api().post(SESSIONS).set(bearer(teacherBToken)).send(sessionBody());
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(await prisma.attendanceSession.count({ where: { takenById: fx.teacherB.userId } })).toBe(
      0,
    );
  });

  it('forbids students from taking attendance', async () => {
    const response = await api().post(SESSIONS).set(bearer(studentAToken)).send(sessionBody());
    expect(response.status).toBe(403);
  });

  it('rejects a second session for the same class, date and period', async () => {
    const date = freshDate();
    await api().post(SESSIONS).set(bearer(teacherAToken)).send(sessionBody(date));
    const response = await api().post(SESSIONS).set(bearer(teacherAToken)).send(sessionBody(date));
    expect(response.status).toBe(409);
  });

  it('rejects a student who is not in the section', async () => {
    const response = await api()
      .post(SESSIONS)
      .set(bearer(teacherAToken))
      .send({
        ...sessionBody(),
        records: [{ studentId: 'someone-else', status: 'PRESENT' }],
      });
    expect(response.status).toBe(400);
  });

  it('rejects a student listed twice', async () => {
    const response = await api()
      .post(SESSIONS)
      .set(bearer(teacherAToken))
      .send({
        ...sessionBody(),
        records: [
          { studentId: fx.studentA.id, status: 'PRESENT' },
          { studentId: fx.studentA.id, status: 'ABSENT' },
        ],
      });
    expect(response.status).toBe(400);
  });

  it('validates the body', async () => {
    const response = await api()
      .post(SESSIONS)
      .set(bearer(teacherAToken))
      .send({ offeringId: fx.offering.id, date: 'not-a-date', records: [] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('editing attendance', () => {
  const createSession = async () => {
    const response = await api().post(SESSIONS).set(bearer(teacherAToken)).send(sessionBody());
    return response.body as { id: string };
  };
  const edited = () => ({
    records: [
      { studentId: fx.studentA.id, status: 'LATE' },
      { studentId: fx.studentB.id, status: 'EXCUSED' },
    ],
  });

  it('writes an AuditLog row with the before and after values', async () => {
    const session = await createSession();
    const response = await api()
      .put(`${SESSIONS}/${session.id}`)
      .set(bearer(teacherAToken))
      .send(edited());
    expect(response.status).toBe(200);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: session.id, action: 'ATTENDANCE_SESSION_UPDATE' },
    });
    expect(log.actorId).toBe(fx.teacherA.userId);
    expect(log.before).toEqual(
      expect.arrayContaining([
        { studentId: fx.studentA.id, status: 'PRESENT', remark: null },
        { studentId: fx.studentB.id, status: 'ABSENT', remark: null },
      ]),
    );
    expect(log.after).toEqual(
      expect.arrayContaining([
        { studentId: fx.studentA.id, status: 'LATE', remark: null },
        { studentId: fx.studentB.id, status: 'EXCUSED', remark: null },
      ]),
    );
  });

  it('forbids another teacher from editing', async () => {
    const session = await createSession();
    const response = await api()
      .put(`${SESSIONS}/${session.id}`)
      .set(bearer(teacherBToken))
      .send(edited());
    expect(response.status).toBe(403);
  });

  it('stops teachers after 48 hours but not admins', async () => {
    const session = await createSession();
    const teacher = { id: fx.teacherA.userId, role: 'TEACHER' as const };
    const admin = { id: fx.admin.id, role: 'ADMIN' as const };
    const justInside = new Date(Date.now() + 47 * 60 * 60 * 1000);
    const tooLate = new Date(Date.now() + 49 * 60 * 60 * 1000);

    await expect(
      updateSession(teacher, session.id, edited() as never, justInside),
    ).resolves.toBeDefined();
    await expect(
      updateSession(teacher, session.id, edited() as never, tooLate),
    ).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      updateSession(admin, session.id, edited() as never, tooLate),
    ).resolves.toBeDefined();
  });

  it('allows an admin to edit through the API', async () => {
    const session = await createSession();
    const response = await api()
      .put(`${SESSIONS}/${session.id}`)
      .set(bearer(adminToken))
      .send(edited());
    expect(response.status).toBe(200);
  });

  it('does not let an empty update wipe the records', async () => {
    const session = await createSession();
    const response = await api()
      .put(`${SESSIONS}/${session.id}`)
      .set(bearer(teacherAToken))
      .send({ records: [] });
    expect(response.status).toBe(400);
    expect(await prisma.attendanceRecord.count({ where: { sessionId: session.id } })).toBe(2);
  });
});

describe('viewing attendance', () => {
  it('forbids a student from reading another student', async () => {
    const response = await api()
      .get(`/api/v1/students/${fx.studentB.id}/attendance-summary`)
      .set(bearer(studentAToken));
    expect(response.status).toBe(403);
  });

  it('lets a student read their own', async () => {
    const response = await api()
      .get(`/api/v1/students/${fx.studentA.id}/attendance-summary`)
      .set(bearer(studentAToken));
    expect(response.status).toBe(200);
    expect(response.body.courses[0].courseCode).toBe('CSC364');
  });

  it('lets a parent read a linked child only', async () => {
    const own = await api()
      .get(`/api/v1/students/${fx.studentA.id}/attendance-summary`)
      .set(bearer(parentToken));
    expect(own.status).toBe(200);

    const other = await api()
      .get(`/api/v1/students/${fx.studentB.id}/attendance-summary`)
      .set(bearer(parentToken));
    expect(other.status).toBe(403);
  });

  it('lets a teacher read only students in sections they teach', async () => {
    const teaches = await api()
      .get(`/api/v1/students/${fx.studentA.id}/attendance-summary`)
      .set(bearer(teacherAToken));
    expect(teaches.status).toBe(200);

    const doesNotTeach = await api()
      .get(`/api/v1/students/${fx.studentA.id}/attendance-summary`)
      .set(bearer(teacherBToken));
    expect(doesNotTeach.status).toBe(403);
  });

  it('forbids session lists for an offering the teacher does not teach', async () => {
    const response = await api()
      .get(`${SESSIONS}?offeringId=${fx.offering.id}`)
      .set(bearer(teacherBToken));
    expect(response.status).toBe(403);
  });

  it('gives a teacher only their own sessions when no offering is named', async () => {
    const response = await api().get(SESSIONS).set(bearer(teacherBToken));
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(0);
  });

  it('forbids a report on an offering the teacher does not teach', async () => {
    const response = await api()
      .get(`/api/v1/offerings/${fx.offering.id}/attendance-report`)
      .set(bearer(teacherBToken));
    expect(response.status).toBe(403);
  });
});

describe('attendance percentages through the API', () => {
  it('counts LATE as present, leaves out EXCUSED and flags under 75%', async () => {
    await resetDatabase();
    fx = await createFixture();
    const teacher = await tokenFor(fx.teacherA.user.email);
    const admin = await tokenFor(fx.admin.email);

    const take = (date: string, a: string, b: string) =>
      api()
        .post(SESSIONS)
        .set(bearer(teacher))
        .send({
          offeringId: fx.offering.id,
          date,
          records: [
            { studentId: fx.studentA.id, status: a },
            { studentId: fx.studentB.id, status: b },
          ],
        });

    await take('2026-04-01', 'PRESENT', 'ABSENT');
    await take('2026-04-02', 'LATE', 'ABSENT');
    await take('2026-04-03', 'EXCUSED', 'PRESENT');
    await take('2026-04-05', 'PRESENT', 'EXCUSED');

    const report = await api()
      .get(`/api/v1/offerings/${fx.offering.id}/attendance-report`)
      .set(bearer(admin));
    expect(report.status).toBe(200);
    expect(report.body.sessionCount).toBe(4);

    const a = report.body.students.find(
      (s: { studentId: string }) => s.studentId === fx.studentA.id,
    );
    const b = report.body.students.find(
      (s: { studentId: string }) => s.studentId === fx.studentB.id,
    );

    // A: present, late, excused, present => 3 attended of 3 counted.
    expect(a).toMatchObject({ total: 3, attended: 3, percentage: 100, belowThreshold: false });
    // B: absent, absent, present, excused => 1 attended of 3 counted.
    expect(b).toMatchObject({ total: 3, attended: 1, percentage: 33.33, belowThreshold: true });

    const summary = await api()
      .get(`/api/v1/students/${fx.studentB.id}/attendance-summary`)
      .set(bearer(admin));
    expect(summary.body.courses[0].percentage).toBe(33.33);
  });
});
