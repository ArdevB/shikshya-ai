import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import nodemailer from 'nodemailer';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { sendDueReminders, sendScheduledNotices } from '../src/jobs/scheduler.js';
import { setMailTransport } from '../src/lib/mail.js';
import { attachRealtime, detachRealtime } from '../src/lib/realtime.js';
import { notify } from '../src/services/notification.service.js';
import { api, bearer, createFixture, prisma, resetDatabase, tokenFor } from './helpers.js';

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let fx: Fixture;
let admin: string;
let teacherA: string;
let studentA: string;
let studentB: string;

const V1 = '/api/v1';
const sent: { to: string; subject: string }[] = [];

const payload = { title: 'Hello', body: 'World', link: '/student' };

beforeAll(async () => {
  await resetDatabase();
  fx = await createFixture();
  admin = await tokenFor(fx.admin.email);
  teacherA = await tokenFor(fx.teacherA.user.email);
  studentA = await tokenFor(fx.studentA.user.email);
  studentB = await tokenFor(fx.studentB.user.email);

  const transport = nodemailer.createTransport({ jsonTransport: true });
  const original = transport.sendMail.bind(transport);
  transport.sendMail = ((message: { to: string; subject: string }) => {
    sent.push({ to: message.to, subject: message.subject });
    return original(message);
  }) as typeof transport.sendMail;
  setMailTransport(transport);
});

beforeEach(async () => {
  sent.length = 0;
  await prisma.notification.deleteMany();
  await prisma.notificationPreference.deleteMany();
});

const emailsTo = async (email: string) => {
  await vi.waitFor(() => expect(sent.length).toBeGreaterThanOrEqual(0));
  await new Promise((done) => setTimeout(done, 50));
  return sent.filter((message) => message.to === email);
};

describe('preferences', () => {
  it('sends both channels by default', async () => {
    await notify([fx.studentA.userId], 'RESULT_PUBLISHED', payload);
    expect(await prisma.notification.count({ where: { userId: fx.studentA.userId } })).toBe(1);
    expect(await emailsTo(fx.studentA.user.email)).toHaveLength(1);
  });

  it('stops the email when turned off, and keeps the in-app one', async () => {
    const response = await api()
      .put(`${V1}/notifications/preferences`)
      .set(bearer(studentA))
      .send({ channel: 'EMAIL', type: 'RESULT_PUBLISHED', enabled: false });
    expect(response.status).toBe(200);
    expect(
      response.body.find((p: { type: string }) => p.type === 'RESULT_PUBLISHED'),
    ).toMatchObject({ email: false, inApp: true });

    await notify([fx.studentA.userId], 'RESULT_PUBLISHED', payload);
    expect(await emailsTo(fx.studentA.user.email)).toHaveLength(0);
    expect(await prisma.notification.count({ where: { userId: fx.studentA.userId } })).toBe(1);
  });

  it('applies only to that type and that person', async () => {
    await api()
      .put(`${V1}/notifications/preferences`)
      .set(bearer(studentA))
      .send({ channel: 'EMAIL', type: 'RESULT_PUBLISHED', enabled: false });

    await notify([fx.studentA.userId], 'PAYMENT_SUCCESS', payload);
    expect(await emailsTo(fx.studentA.user.email)).toHaveLength(1);

    sent.length = 0;
    await notify([fx.studentB.userId], 'RESULT_PUBLISHED', payload);
    expect(await emailsTo(fx.studentB.user.email)).toHaveLength(1);
  });

  it('stops the in-app one when turned off', async () => {
    await api()
      .put(`${V1}/notifications/preferences`)
      .set(bearer(studentA))
      .send({ channel: 'IN_APP', type: 'NOTICE_PUBLISHED', enabled: false });
    await notify([fx.studentA.userId], 'NOTICE_PUBLISHED', payload);
    expect(await prisma.notification.count({ where: { userId: fx.studentA.userId } })).toBe(0);
    expect(await emailsTo(fx.studentA.user.email)).toHaveLength(1);
  });

  it('refuses an unknown type', async () => {
    const response = await api()
      .put(`${V1}/notifications/preferences`)
      .set(bearer(studentA))
      .send({ channel: 'EMAIL', type: 'MADE_UP', enabled: false });
    expect(response.status).toBe(400);
  });
});

describe('the bell', () => {
  it('lists, counts and marks as read, for the owner only', async () => {
    await notify([fx.studentA.userId], 'RESULT_PUBLISHED', payload);
    await notify([fx.studentA.userId], 'PAYMENT_SUCCESS', payload);

    const count = async (token: string) =>
      (await api().get(`${V1}/notifications/unread-count`).set(bearer(token))).body.count;
    expect(await count(studentA)).toBe(2);
    expect(await count(studentB)).toBe(0);

    const list = await api().get(`${V1}/notifications`).set(bearer(studentA));
    expect(list.body.data).toHaveLength(2);
    const id = list.body.data[0].id;

    // Someone else's attempt changes nothing.
    await api().post(`${V1}/notifications/${id}/read`).set(bearer(studentB));
    expect(await count(studentA)).toBe(2);

    await api().post(`${V1}/notifications/${id}/read`).set(bearer(studentA));
    expect(await count(studentA)).toBe(1);

    await api().post(`${V1}/notifications/read-all`).set(bearer(studentA));
    expect(await count(studentA)).toBe(0);
  });

  it('never returns someone else’s', async () => {
    await notify([fx.studentA.userId], 'RESULT_PUBLISHED', payload);
    const list = await api().get(`${V1}/notifications`).set(bearer(studentB));
    expect(list.body.data).toHaveLength(0);
  });
});

describe('real-time delivery', () => {
  let server: Server;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    server = createServer(createApp());
    attachRealtime(server);
    await new Promise<void>((done) => server.listen(0, done));
    url = `http://localhost:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    sockets.forEach((socket) => socket.close());
    detachRealtime();
    await new Promise((done) => server.close(done));
  });

  const open = (token: unknown) => {
    const socket = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    return socket;
  };
  const connected = (socket: Socket) =>
    new Promise<void>((done, fail) => {
      socket.on('connect', () => done());
      socket.on('connect_error', fail);
    });

  it('pushes to the right user straight away, and to nobody else', async () => {
    const own = open(studentA);
    const other = open(studentB);
    await Promise.all([connected(own), connected(other)]);

    const seenByOther = vi.fn();
    other.on('notification', seenByOther);
    const received = new Promise<{ title: string }>((done) => own.on('notification', done));

    await notify([fx.studentA.userId], 'RESULT_PUBLISHED', payload);

    await expect(received).resolves.toMatchObject({ title: 'Hello' });
    await new Promise((done) => setTimeout(done, 100));
    expect(seenByOther).not.toHaveBeenCalled();
  });

  it('refuses a connection without a valid token', async () => {
    await expect(connected(open('not-a-token'))).rejects.toThrow('Unauthorized');
    await expect(connected(open(undefined))).rejects.toThrow('Unauthorized');
  });

  it('does not push when in-app is turned off', async () => {
    await api()
      .put(`${V1}/notifications/preferences`)
      .set(bearer(studentA))
      .send({ channel: 'IN_APP', type: 'RESULT_PUBLISHED', enabled: false });
    const socket = open(studentA);
    await connected(socket);
    const seen = vi.fn();
    socket.on('notification', seen);
    await notify([fx.studentA.userId], 'RESULT_PUBLISHED', payload);
    await new Promise((done) => setTimeout(done, 100));
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('triggers', () => {
  const typesFor = async (userId: string) =>
    (await prisma.notification.findMany({ where: { userId } })).map((n) => n.type);

  it('a notice reaches its audience only, not its author', async () => {
    await api()
      .post(`${V1}/notices`)
      .set(bearer(admin))
      .send({ title: 'For students', body: 'B', audience: 'STUDENTS' });
    expect(await typesFor(fx.studentA.userId)).toEqual(['NOTICE_PUBLISHED']);
    expect(await typesFor(fx.teacherA.userId)).toEqual([]);
    expect(await typesFor(fx.parent.userId)).toEqual([]);
    expect(await typesFor(fx.admin.id)).toEqual([]);
  });

  it('a section notice reaches students, their parents and its teachers', async () => {
    await api()
      .post(`${V1}/notices`)
      .set(bearer(admin))
      .send({ title: 'Sec', body: 'B', audience: 'SECTION', sectionId: fx.section.id });
    expect(await typesFor(fx.studentB.userId)).toEqual(['NOTICE_PUBLISHED']);
    expect(await typesFor(fx.parent.userId)).toEqual(['NOTICE_PUBLISHED']);
    expect(await typesFor(fx.teacherA.userId)).toEqual(['NOTICE_PUBLISHED']);
    expect(await typesFor(fx.teacherB.userId)).toEqual([]);
  });

  it('a scheduled notice waits for its time, and is only announced once', async () => {
    const later = new Date(Date.now() + 3_600_000).toISOString();
    await api()
      .post(`${V1}/notices`)
      .set(bearer(admin))
      .send({ title: 'Later', body: 'B', audience: 'ALL', publishAt: later });
    expect(await typesFor(fx.studentA.userId)).toEqual([]);

    await sendScheduledNotices(new Date());
    expect(await typesFor(fx.studentA.userId)).toEqual([]);

    const afterwards = new Date(Date.now() + 7_200_000);
    await sendScheduledNotices(afterwards);
    await sendScheduledNotices(afterwards);
    expect(await typesFor(fx.studentA.userId)).toEqual(['NOTICE_PUBLISHED']);
  });

  it('a new assignment reaches the section and parents', async () => {
    await api()
      .post(`${V1}/assignments`)
      .set(bearer(teacherA))
      .field({
        courseOfferingId: fx.offering.id,
        title: 'Essay',
        description: 'x',
        dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        maxMarks: '10',
      });
    expect(await typesFor(fx.studentA.userId)).toEqual(['ASSIGNMENT_CREATED']);
    expect(await typesFor(fx.parent.userId)).toEqual(['ASSIGNMENT_CREATED']);
    const note = await prisma.notification.findFirstOrThrow({
      where: { userId: fx.parent.userId },
    });
    expect(note.link).toBe('/parent/assignments');
  });

  it('reminds only those who have not handed in, and only once', async () => {
    const assignment = await prisma.assignment.create({
      data: {
        courseOfferingId: fx.offering.id,
        title: 'Soon',
        description: '',
        dueAt: new Date(Date.now() + 10 * 3_600_000),
        maxMarks: 10,
        createdById: fx.teacherA.userId,
      },
    });
    await prisma.submission.create({
      data: { assignmentId: assignment.id, studentId: fx.studentA.id, text: 'Done' },
    });

    await sendDueReminders();
    await sendDueReminders();

    const reminders = await prisma.notification.findMany({
      where: { type: 'ASSIGNMENT_DUE_SOON' },
    });
    expect(reminders.map((n) => n.userId)).toEqual([fx.studentB.userId]);
    await prisma.assignment.delete({ where: { id: assignment.id } });
  });

  describe('attendance falling below 75%', () => {
    const take = (date: string, a: string, b: string) =>
      api()
        .post(`${V1}/attendance/sessions`)
        .set(bearer(teacherA))
        .send({
          offeringId: fx.offering.id,
          date,
          records: [
            { studentId: fx.studentA.id, status: a },
            { studentId: fx.studentB.id, status: b },
          ],
        });
    const low = () => prisma.notification.findMany({ where: { type: 'ATTENDANCE_LOW' } });

    it('tells the student and parent when it crosses, and not every class after', async () => {
      await prisma.attendanceSession.deleteMany();

      await take('2026-05-01', 'PRESENT', 'PRESENT');
      expect(await low()).toHaveLength(0);

      await take('2026-05-02', 'ABSENT', 'PRESENT'); // A: 50%, crosses.
      let notes = await low();
      expect(notes.map((n) => n.userId).sort()).toEqual(
        [fx.studentA.userId, fx.parent.userId].sort(),
      );

      await take('2026-05-03', 'ABSENT', 'PRESENT'); // A: 33%, was already low.
      notes = await low();
      expect(notes).toHaveLength(2);
    });

    it('also notices when an edit pushes it below', async () => {
      await prisma.attendanceSession.deleteMany();
      await prisma.notification.deleteMany();
      await take('2026-05-05', 'PRESENT', 'PRESENT');
      const session = await take('2026-05-06', 'PRESENT', 'PRESENT');
      expect(await low()).toHaveLength(0);

      await api()
        .put(`${V1}/attendance/sessions/${session.body.id}`)
        .set(bearer(teacherA))
        .send({
          records: [
            { studentId: fx.studentA.id, status: 'PRESENT' },
            { studentId: fx.studentB.id, status: 'ABSENT' },
          ],
        });
      const notes = await low();
      expect(notes.map((n) => n.userId)).toEqual([fx.studentB.userId]);
    });
  });
});
