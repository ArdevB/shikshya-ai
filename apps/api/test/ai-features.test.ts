import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeFeatures,
  computeRiskPredictions,
  factorText,
  reasonsFrom,
  supportMessage,
} from '../src/services/risk.service.js';
import { api, bearer, createFixture, prisma, resetDatabase, tokenFor } from './helpers.js';

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let fx: Fixture;
let studentA: string;
let studentB: string;
let teacherA: string;
let teacherB: string;
let parent: string;
let admin: string;

const V1 = '/api/v1';
const NOW = new Date('2026-06-01T06:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const fetchMock = vi.fn<typeof fetch>();

/** What the pretend AI service answers, by path. */
function aiReplies(routes: Record<string, unknown | ((body: never) => unknown)>) {
  fetchMock.mockImplementation(async (url, init) => {
    const path = String(url).replace('http://ai-service.test', '');
    const route = routes[path];
    if (route === undefined) return new Response('{}', { status: 500 });
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    return Response.json(typeof route === 'function' ? (route as (b: never) => unknown)(body as never) : route);
  });
}

const lastBody = (path: string) => {
  const call = [...fetchMock.mock.calls].reverse().find(([url]) => String(url).endsWith(path));
  return JSON.parse(String(call![1]!.body)) as Record<string, unknown>;
};

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock);
  await resetDatabase();
  fx = await createFixture();
  [studentA, studentB, teacherA, teacherB, parent, admin] = await Promise.all([
    tokenFor(fx.studentA.user.email),
    tokenFor(fx.studentB.user.email),
    tokenFor(fx.teacherA.user.email),
    tokenFor(fx.teacherB.user.email),
    tokenFor(fx.parent.user.email),
    tokenFor(fx.admin.email),
  ]);
});

afterAll(() => vi.unstubAllGlobals());
beforeEach(() => fetchMock.mockReset());

describe('risk features', () => {
  const base = {
    sessions: [],
    exams: [],
    assignmentsDue: 0,
    submissions: [],
    previousGpa: null,
    now: NOW,
  };

  it('are unknown when nothing has happened yet', () => {
    expect(computeFeatures(base)).toEqual({
      attendance_pct: null,
      attendance_trend: null,
      internal_exam_pct: null,
      submission_rate_pct: null,
      avg_assignment_pct: null,
      late_rate_pct: null,
      previous_gpa: null,
    });
  });

  it('work out attendance and its trend over the last two weeks', () => {
    const old = new Date(NOW.getTime() - 30 * DAY);
    const recent = new Date(NOW.getTime() - 3 * DAY);
    const features = computeFeatures({
      ...base,
      sessions: [
        { date: old, status: 'PRESENT' },
        { date: old, status: 'PRESENT' },
        { date: recent, status: 'ABSENT' },
        { date: recent, status: 'PRESENT' },
      ],
    });
    expect(features.attendance_pct).toBe(75);
    expect(features.attendance_trend).toBe(-50);
  });

  it('have no trend with only one period to compare', () => {
    const features = computeFeatures({
      ...base,
      sessions: [{ date: new Date(NOW.getTime() - DAY), status: 'PRESENT' }],
    });
    expect(features.attendance_trend).toBeNull();
  });

  it('count being absent from an exam as zero, and an unentered mark not at all', () => {
    const features = computeFeatures({
      ...base,
      exams: [
        { obtained: 40, isAbsent: false, full: 50 },
        { obtained: null, isAbsent: true, full: 50 },
        { obtained: null, isAbsent: false, full: 50 },
      ],
    });
    expect(features.internal_exam_pct).toBe(40);
  });

  it('work out submissions, marks and lateness', () => {
    const features = computeFeatures({
      ...base,
      assignmentsDue: 4,
      submissions: [
        { isLate: false, marks: 8, maxMarks: 10 },
        { isLate: true, marks: 6, maxMarks: 10 },
        { isLate: true, marks: null, maxMarks: 10 },
      ],
    });
    expect(features.submission_rate_pct).toBe(75);
    expect(features.avg_assignment_pct).toBe(70);
    expect(features.late_rate_pct).toBe(66.7);
  });
});

describe('what people are told', () => {
  it('gives teachers plain reasons', () => {
    expect(factorText('attendance_pct', 62.4)).toBe('Attendance is 62%');
    expect(factorText('attendance_trend', -15)).toBe(
      'Attendance fell 15 points in the last two weeks',
    );
    expect(factorText('previous_gpa', 2.1)).toBe("Last semester's GPA was 2.10");
  });

  it('leaves out reasons that are not really concerns', () => {
    const texts = (factors: { feature: string; value: number }[]) =>
      reasonsFrom(factors).map((reason) => reason.text);
    expect(
      texts([
        { feature: 'internal_exam_pct', value: 22 },
        { feature: 'attendance_pct', value: 75 },
        { feature: 'attendance_trend', value: -0.4 },
      ]),
    ).toEqual(['Internal exam marks are 22%']);
    expect(texts([{ feature: 'attendance_trend', value: -17 }])).toEqual([
      'Attendance fell 17 points in the last two weeks',
    ]);
  });

  it('still gives a flagged student one reason, the strongest', () => {
    const reasons = reasonsFrom([
      { feature: 'previous_gpa', value: 2.9 },
      { feature: 'attendance_pct', value: 80 },
    ]);
    expect(reasons.map((reason) => reason.feature)).toEqual(['previous_gpa']);
  });

  const features = {
    attendance_pct: 68,
    attendance_trend: null,
    internal_exam_pct: null,
    submission_rate_pct: null,
    avg_assignment_pct: null,
    late_rate_pct: null,
    previous_gpa: null,
  };

  it("tells a student how many classes to attend, as in the spec's example", () => {
    expect(supportMessage('DBMS', features, { attended: 17, total: 25 }, 0)).toBe(
      'Your DBMS attendance is 68%. Attending the next 7 classes brings you back above 75%.',
    );
  });

  it('mentions missing assignments when attendance is fine', () => {
    expect(
      supportMessage('DBMS', { ...features, attendance_pct: 90 }, { attended: 9, total: 10 }, 2),
    ).toContain('2 DBMS assignments');
  });

  it('never tells a student about risk, prediction or a model', () => {
    for (const message of [
      supportMessage('DBMS', features, { attended: 17, total: 25 }, 0),
      supportMessage('DBMS', { ...features, attendance_pct: 90 }, { attended: 9, total: 10 }, 2),
      supportMessage('DBMS', { ...features, attendance_pct: 90 }, { attended: 9, total: 10 }, 0),
    ]) {
      expect(message).not.toMatch(/risk|predict|model|flag|fail|likely/i);
    }
  });
});

describe('risk predictions', () => {
  const result = (probability: number, level: string) => ({
    probability,
    level,
    topFactors: [{ feature: 'attendance_pct', label: 'Attendance', value: 40, impact: 0.5 }],
  });

  beforeAll(async () => {
    await prisma.attendanceSession.create({
      data: {
        courseOfferingId: fx.offering.id,
        date: new Date(NOW.getTime() - 3 * DAY),
        takenById: fx.teacherA.userId,
        records: {
          create: [
            { studentId: fx.studentA.id, status: 'ABSENT' },
            { studentId: fx.studentB.id, status: 'PRESENT' },
          ],
        },
      },
    });
  });

  beforeEach(async () => {
    await prisma.riskPrediction.deleteMany();
    await prisma.notification.deleteMany();
    aiReplies({
      '/predict/risk/batch': (body: { items: { attendance_pct: number }[] }) => ({
        results: body.items.map((item) =>
          item.attendance_pct < 50 ? result(0.9, 'HIGH') : result(0.1, 'LOW'),
        ),
      }),
    });
  });

  it('runs for each student in each class, and saves plain reasons', async () => {
    const outcome = await computeRiskPredictions(NOW);
    expect(outcome).toMatchObject({ computed: 2, flagged: 1 });
    const row = await prisma.riskPrediction.findFirstOrThrow({
      where: { studentId: fx.studentA.id },
    });
    expect(row).toMatchObject({ level: 'HIGH', probability: 0.9 });
    expect(row.factors).toEqual([{ feature: 'attendance_pct', text: 'Attendance is 40%' }]);
  });

  it('sends the service exactly the features it expects', async () => {
    await computeRiskPredictions(NOW);
    const { items } = lastBody('/predict/risk/batch') as { items: Record<string, unknown>[] };
    expect(Object.keys(items[0]!).sort()).toEqual([
      'attendance_pct',
      'attendance_trend',
      'avg_assignment_pct',
      'internal_exam_pct',
      'late_rate_pct',
      'previous_gpa',
      'submission_rate_pct',
    ]);
  });

  it('nudges a flagged student once a week, with no label, and never their parent', async () => {
    await computeRiskPredictions(NOW);
    await computeRiskPredictions(new Date(NOW.getTime() + DAY));
    const notes = await prisma.notification.findMany({ where: { type: 'STUDY_SUPPORT' } });
    expect(notes).toHaveLength(1);
    expect(notes[0]!.userId).toBe(fx.studentA.userId);
    expect(`${notes[0]!.title} ${notes[0]!.body}`).not.toMatch(/risk|predict|flag|fail/i);

    await computeRiskPredictions(new Date(NOW.getTime() + 8 * DAY));
    expect(await prisma.notification.count({ where: { type: 'STUDY_SUPPORT' } })).toBe(2);
  });

  it('does not nudge students who are doing fine', async () => {
    await computeRiskPredictions(NOW);
    const notes = await prisma.notification.count({ where: { userId: fx.studentB.userId } });
    expect(notes).toBe(0);
  });

  it('lists flagged students only for the teacher of the class', async () => {
    await computeRiskPredictions(NOW);
    const own = await api().get(`${V1}/risk`).set(bearer(teacherA));
    expect(own.status).toBe(200);
    expect(own.body.data).toHaveLength(1);
    expect(own.body.data[0]).toMatchObject({
      studentId: fx.studentA.id,
      level: 'HIGH',
      factors: [{ text: 'Attendance is 40%' }],
    });

    const other = await api().get(`${V1}/risk`).set(bearer(teacherB));
    expect(other.body.data).toEqual([]);
  });

  it('never shows a student or parent any risk information', async () => {
    await computeRiskPredictions(NOW);
    for (const token of [studentA, studentB, parent]) {
      expect((await api().get(`${V1}/risk`).set(bearer(token))).status).toBe(403);
      expect((await api().get(`${V1}/risk/summary`).set(bearer(token))).status).toBe(403);
    }
  });

  it('lets the teacher record what was done, but not another teacher', async () => {
    await computeRiskPredictions(NOW);
    const row = await prisma.riskPrediction.findFirstOrThrow({ where: { level: 'HIGH' } });
    const url = `${V1}/risk/${row.id}/review`;

    expect((await api().post(url).set(bearer(teacherB)).send({ note: 'Met them' })).status).toBe(403);
    expect((await api().post(url).set(bearer(studentA)).send({ note: 'Fine' })).status).toBe(403);

    const reviewed = await api().post(url).set(bearer(teacherA)).send({ note: 'Called home' });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body).toMatchObject({ reviewNote: 'Called home' });
    expect(reviewed.body.reviewedAt).toBeTruthy();

    const open = await api().get(`${V1}/risk?unreviewedOnly=true`).set(bearer(teacherA));
    expect(open.body.data).toEqual([]);
  });

  it('keeps a review overnight, unless the level has got worse', async () => {
    aiReplies({ '/predict/risk/batch': { results: [result(0.6, 'MEDIUM'), result(0.1, 'LOW')] } });
    await computeRiskPredictions(NOW);
    const row = await prisma.riskPrediction.findFirstOrThrow({ where: { level: 'MEDIUM' } });
    await prisma.riskPrediction.update({
      where: { id: row.id },
      data: { reviewedAt: NOW, reviewNote: 'Spoke to them' },
    });

    await computeRiskPredictions(NOW);
    expect((await prisma.riskPrediction.findUniqueOrThrow({ where: { id: row.id } })).reviewNote).toBe(
      'Spoke to them',
    );

    aiReplies({ '/predict/risk/batch': { results: [result(0.9, 'HIGH'), result(0.1, 'LOW')] } });
    await computeRiskPredictions(NOW);
    expect((await prisma.riskPrediction.findUniqueOrThrow({ where: { id: row.id } })).reviewNote).toBeNull();
  });

  it('gives admins counts by section', async () => {
    await computeRiskPredictions(NOW);
    const summary = await api().get(`${V1}/risk/summary`).set(bearer(admin));
    expect(summary.body.sections).toEqual([
      expect.objectContaining({ sectionName: 'A', high: 1, low: 1, medium: 0, studentsFlagged: 1 }),
    ]);
    expect((await api().get(`${V1}/risk/summary`).set(bearer(teacherA))).status).toBe(403);
  });

  it('lets only admins recalculate', async () => {
    expect((await api().post(`${V1}/risk/recompute`).set(bearer(teacherA))).status).toBe(403);
    const response = await api().post(`${V1}/risk/recompute`).set(bearer(admin));
    expect(response.status).toBe(200);
    expect(response.body.computed).toBe(2);
  });

  it('logs the call', async () => {
    await prisma.aiCallLog.deleteMany();
    await computeRiskPredictions(NOW);
    expect(await prisma.aiCallLog.findFirstOrThrow()).toMatchObject({
      feature: 'RISK',
      succeeded: true,
    });
  });
});

describe('quizzes', () => {
  const generated = (overrides = {}) => ({
    type: 'MCQ',
    question: 'What does a compiler do?',
    options: ['Translates code', 'Prints paper', 'Cools the CPU', 'Sends email'],
    correctAnswer: 'Translates code',
    explanation: 'It translates source code.',
    difficulty: 'EASY',
    sourceSnippet: 'A compiler translates code.',
    ...overrides,
  });
  const usage = { model: 'fake-model', inputTokens: 10, outputTokens: 5, latencyMs: 3 };

  const notes = 'A compiler translates source code into machine code that computers can run.';

  async function makeDraft(questions = [generated()]) {
    aiReplies({ '/quiz/generate': { questions, usage } });
    const response = await api()
      .post(`${V1}/quizzes/generate`)
      .set(bearer(teacherA))
      .field('courseOfferingId', fx.offering.id)
      .field('title', 'Compilers quiz')
      .field('numQuestions', String(questions.length))
      .field('types', 'MCQ,TRUE_FALSE,SHORT_ANSWER')
      .field('difficulty', 'EASY')
      .field('text', notes);
    expect(response.status).toBe(201);
    return response.body as {
      id: string;
      status: string;
      questions: { id: string; approved: boolean; type: string }[];
    };
  }

  const url = (quizId: string, rest = '') => `${V1}/quizzes/${quizId}${rest}`;

  async function approveAll(quiz: { id: string; questions: { id: string }[] }) {
    for (const question of quiz.questions) {
      await api().post(url(quiz.id, `/questions/${question.id}/approve`)).set(bearer(teacherA));
    }
  }

  const window = (from: number, to: number) => ({
    opensAt: new Date(Date.now() + from).toISOString(),
    closesAt: new Date(Date.now() + to).toISOString(),
  });

  async function makePublished(questions = [generated()], from = -DAY, to = DAY) {
    const quiz = await makeDraft(questions);
    await approveAll(quiz);
    const response = await api()
      .post(url(quiz.id, '/publish'))
      .set(bearer(teacherA))
      .send(window(from, to));
    expect(response.status).toBe(200);
    return quiz;
  }

  beforeEach(async () => {
    await prisma.quiz.deleteMany();
    await prisma.notification.deleteMany();
  });

  it('makes a draft for the teacher, sending the notes to the AI service', async () => {
    const quiz = await makeDraft();
    expect(quiz.status).toBe('DRAFT');
    expect(quiz.questions[0]!.approved).toBe(false);
    expect(lastBody('/quiz/generate')).toMatchObject({
      text: notes,
      numQuestions: 1,
      types: ['MCQ', 'TRUE_FALSE', 'SHORT_ANSWER'],
      courseTitle: 'Software Engineering',
    });
    expect(
      await prisma.aiCallLog.findFirst({ where: { feature: 'QUIZ' }, orderBy: { createdAt: 'desc' } }),
    ).toMatchObject({ tokensIn: 10, tokensOut: 5, succeeded: true });
  });

  it('only lets the teacher of the class generate one', async () => {
    aiReplies({ '/quiz/generate': { questions: [generated()], usage } });
    const attempt = (token: string) =>
      api()
        .post(`${V1}/quizzes/generate`)
        .set(bearer(token))
        .field('courseOfferingId', fx.offering.id)
        .field('title', 'Quiz')
        .field('numQuestions', '1')
        .field('types', 'MCQ')
        .field('difficulty', 'EASY')
        .field('text', notes);
    expect((await attempt(teacherB)).status).toBe(403);
    expect((await attempt(studentA)).status).toBe(403);
  });

  it('needs notes of some kind', async () => {
    const response = await api()
      .post(`${V1}/quizzes/generate`)
      .set(bearer(teacherA))
      .field('courseOfferingId', fx.offering.id)
      .field('title', 'Quiz')
      .field('numQuestions', '1')
      .field('types', 'MCQ')
      .field('difficulty', 'EASY');
    expect(response.status).toBe(400);
  });

  it('passes on when Gemini could not produce valid questions', async () => {
    fetchMock.mockResolvedValue(Response.json({ detail: 'AI_INVALID_OUTPUT' }, { status: 502 }));
    const response = await api()
      .post(`${V1}/quizzes/generate`)
      .set(bearer(teacherA))
      .field('courseOfferingId', fx.offering.id)
      .field('title', 'Quiz')
      .field('numQuestions', '1')
      .field('types', 'MCQ')
      .field('difficulty', 'EASY')
      .field('text', notes);
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('AI_INVALID_OUTPUT');
    expect(await prisma.quiz.count()).toBe(0);
  });

  it('refuses to publish anything unapproved', async () => {
    const quiz = await makeDraft([generated(), generated({ question: 'A second question?' })]);
    await api()
      .post(url(quiz.id, `/questions/${quiz.questions[0]!.id}/approve`))
      .set(bearer(teacherA));
    const response = await api()
      .post(url(quiz.id, '/publish'))
      .set(bearer(teacherA))
      .send(window(-DAY, DAY));
    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('1 question has not been approved');
    expect((await prisma.quiz.findUniqueOrThrow({ where: { id: quiz.id } })).status).toBe('DRAFT');
  });

  it('hides a draft from students completely', async () => {
    const quiz = await makeDraft();
    await approveAll(quiz);
    expect((await api().get(`${V1}/quizzes/mine`).set(bearer(studentA))).body).toEqual([]);
    expect((await api().get(`${V1}/quizzes/mine/${quiz.id}`).set(bearer(studentA))).status).toBe(404);
  });

  it('lets the teacher edit, delete and regenerate while it is a draft', async () => {
    const quiz = await makeDraft([generated(), generated({ question: 'Another question?' })]);
    const [first, second] = quiz.questions;

    const edited = await api()
      .put(url(quiz.id, `/questions/${first!.id}`))
      .set(bearer(teacherA))
      .send({
        type: 'TRUE_FALSE',
        question: 'A compiler translates code.',
        options: null,
        correctAnswer: 'True',
        explanation: 'It does.',
        difficulty: 'EASY',
      });
    expect(edited.status).toBe(200);
    expect(edited.body.options).toEqual(['True', 'False']);

    await prisma.quizQuestion.update({ where: { id: second!.id }, data: { approved: true } });
    aiReplies({
      '/quiz/regenerate': { question: generated({ question: 'A brand new question?' }), usage },
    });
    const fresh = await api()
      .post(url(quiz.id, `/questions/${second!.id}/regenerate`))
      .set(bearer(teacherA));
    expect(fresh.body.question).toBe('A brand new question?');
    // It is new, so it needs approving again.
    expect(fresh.body.approved).toBe(false);
    expect(lastBody('/quiz/regenerate').text).toBe(notes);

    const removed = await api()
      .delete(url(quiz.id, `/questions/${first!.id}`))
      .set(bearer(teacherA));
    expect(removed.status).toBe(204);
  });

  it('rejects an edit whose answer does not fit', async () => {
    const quiz = await makeDraft();
    const response = await api()
      .put(url(quiz.id, `/questions/${quiz.questions[0]!.id}`))
      .set(bearer(teacherA))
      .send({
        type: 'MCQ',
        question: 'What does a compiler do?',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 'E',
        explanation: '',
        difficulty: 'EASY',
      });
    expect(response.status).toBe(400);
  });

  it('keeps another teacher out of the draft', async () => {
    const quiz = await makeDraft();
    expect((await api().get(url(quiz.id)).set(bearer(teacherB))).status).toBe(403);
    const approve = await api()
      .post(url(quiz.id, `/questions/${quiz.questions[0]!.id}/approve`))
      .set(bearer(teacherB));
    expect(approve.status).toBe(403);
    expect((await api().delete(url(quiz.id)).set(bearer(teacherB))).status).toBe(403);
  });

  it('locks a quiz once it is published, and tells students', async () => {
    const quiz = await makePublished();
    const edit = await api()
      .delete(url(quiz.id, `/questions/${quiz.questions[0]!.id}`))
      .set(bearer(teacherA));
    expect(edit.status).toBe(409);
    expect(await prisma.notification.count({ where: { type: 'QUIZ_PUBLISHED' } })).toBe(2);
  });

  it('checks that it closes after it opens', async () => {
    const quiz = await makeDraft();
    await approveAll(quiz);
    const response = await api()
      .post(url(quiz.id, '/publish'))
      .set(bearer(teacherA))
      .send(window(DAY, -DAY));
    expect(response.status).toBe(400);
  });

  it('never sends a student the answers while the quiz is open', async () => {
    const quiz = await makePublished();
    const response = await api().get(`${V1}/quizzes/mine/${quiz.id}`).set(bearer(studentA));
    expect(response.body.state).toBe('OPEN');
    expect(response.body.questions).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toContain('correctAnswer');
    expect(JSON.stringify(response.body)).not.toContain('It translates source code');
    expect((await api().get(url(quiz.id)).set(bearer(studentA))).status).toBe(403);
  });

  it('hides the questions until it opens, and refuses early answers', async () => {
    const quiz = await makePublished([generated()], DAY, 2 * DAY);
    const view = await api().get(`${V1}/quizzes/mine/${quiz.id}`).set(bearer(studentA));
    expect(view.body.state).toBe('UPCOMING');
    expect(view.body.questions).toEqual([]);
    const submit = await api()
      .post(`${V1}/quizzes/mine/${quiz.id}/submit`)
      .set(bearer(studentA))
      .send({ answers: [] });
    expect(submit.status).toBe(409);
  });

  it('marks automatically, leaving short answers for the teacher', async () => {
    const quiz = await makePublished([
      generated(),
      generated({
        type: 'TRUE_FALSE',
        question: 'Compilers cool CPUs.',
        options: ['True', 'False'],
        correctAnswer: 'False',
      }),
      generated({
        type: 'SHORT_ANSWER',
        question: 'Explain a compiler.',
        options: null,
        correctAnswer: 'It translates code',
      }),
    ]);
    const answers = [
      { questionId: quiz.questions[0]!.id, answer: 'Translates code' },
      { questionId: quiz.questions[1]!.id, answer: 'True' },
      { questionId: quiz.questions[2]!.id, answer: 'It converts code to machine code' },
    ];
    const submitted = await api()
      .post(`${V1}/quizzes/mine/${quiz.id}/submit`)
      .set(bearer(studentA))
      .send({ answers });
    expect(submitted.status).toBe(201);

    const view = await api().get(`${V1}/quizzes/mine/${quiz.id}`).set(bearer(studentA));
    expect(view.body).toMatchObject({ state: 'SUBMITTED', score: 1, awaitingMarks: 1 });

    const attempts = await api().get(url(quiz.id, '/attempts')).set(bearer(teacherA));
    expect(attempts.body[0]).toMatchObject({ score: 1, total: 3, awaitingMarks: 1 });
    const short = attempts.body[0].answers.find((a: { type: string }) => a.type === 'SHORT_ANSWER');

    expect(
      (
        await api()
          .post(`${V1}/quizzes/answers/${short.id}/grade`)
          .set(bearer(teacherB))
          .send({ isCorrect: true })
      ).status,
    ).toBe(403);
    const graded = await api()
      .post(`${V1}/quizzes/answers/${short.id}/grade`)
      .set(bearer(teacherA))
      .send({ isCorrect: true });
    expect(graded.status).toBe(200);

    const after = await api().get(`${V1}/quizzes/mine/${quiz.id}`).set(bearer(studentA));
    expect(after.body).toMatchObject({ score: 2, awaitingMarks: 0 });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'QUIZ_ANSWER_GRADED', entityId: short.id },
    });
    expect(audit?.actorId).toBe(fx.teacherA.userId);
  });

  it('refuses to hand-mark a question the system already marked', async () => {
    const quiz = await makePublished();
    await api()
      .post(`${V1}/quizzes/mine/${quiz.id}/submit`)
      .set(bearer(studentA))
      .send({ answers: [{ questionId: quiz.questions[0]!.id, answer: 'Prints paper' }] });
    const attempts = await api().get(url(quiz.id, '/attempts')).set(bearer(teacherA));
    const response = await api()
      .post(`${V1}/quizzes/answers/${attempts.body[0].answers[0].id}/grade`)
      .set(bearer(teacherA))
      .send({ isCorrect: true });
    expect(response.status).toBe(400);
  });

  it('allows one submission, counts blanks as wrong and ignores unknown questions', async () => {
    const quiz = await makePublished();
    const submit = () =>
      api()
        .post(`${V1}/quizzes/mine/${quiz.id}/submit`)
        .set(bearer(studentA))
        .send({ answers: [{ questionId: 'not-a-question', answer: 'Hello' }] });
    expect((await submit()).status).toBe(201);
    expect((await submit()).status).toBe(409);
    const view = await api().get(`${V1}/quizzes/mine/${quiz.id}`).set(bearer(studentA));
    expect(view.body.score).toBe(0);
  });

  it('shows answers only after the quiz closes', async () => {
    const quiz = await makePublished();
    await api()
      .post(`${V1}/quizzes/mine/${quiz.id}/submit`)
      .set(bearer(studentA))
      .send({ answers: [{ questionId: quiz.questions[0]!.id, answer: 'Translates code' }] });

    const open = await api().get(`${V1}/quizzes/mine/${quiz.id}`).set(bearer(studentA));
    expect(open.body.result).toBeNull();

    await prisma.quiz.update({
      where: { id: quiz.id },
      data: { closesAt: new Date(Date.now() - 1000) },
    });
    const closed = await api().get(`${V1}/quizzes/mine/${quiz.id}`).set(bearer(studentA));
    expect(closed.body.result[0]).toMatchObject({
      yourAnswer: 'Translates code',
      isCorrect: true,
      correctAnswer: 'Translates code',
    });
  });

  it('refuses answers after it closes', async () => {
    const quiz = await makePublished([generated()], -2 * DAY, -DAY);
    const view = await api().get(`${V1}/quizzes/mine/${quiz.id}`).set(bearer(studentA));
    expect(view.body.state).toBe('MISSED');
    expect(view.body.questions).toEqual([]);
    const submit = await api()
      .post(`${V1}/quizzes/mine/${quiz.id}/submit`)
      .set(bearer(studentA))
      .send({ answers: [] });
    expect(submit.status).toBe(409);
  });

  it("keeps students out of classes they are not in", async () => {
    const quiz = await makePublished();
    await prisma.enrollment.updateMany({
      where: { studentId: fx.studentB.id },
      data: { status: 'DROPPED' },
    });
    expect((await api().get(`${V1}/quizzes/mine/${quiz.id}`).set(bearer(studentB))).status).toBe(404);
    await prisma.enrollment.updateMany({
      where: { studentId: fx.studentB.id },
      data: { status: 'ACTIVE' },
    });
  });

  it('keeps the teacher list to their own classes', async () => {
    await makeDraft();
    expect((await api().get(`${V1}/quizzes`).set(bearer(teacherA))).body.data).toHaveLength(1);
    expect((await api().get(`${V1}/quizzes`).set(bearer(teacherB))).body.data).toEqual([]);
    expect((await api().get(`${V1}/quizzes`).set(bearer(admin))).body.data).toHaveLength(1);
    expect((await api().get(`${V1}/quizzes`).set(bearer(studentA))).status).toBe(403);
  });
});

describe('timetable generator', () => {
  let rooms: { id: string }[];
  let slots: { id: string }[];
  const base = () => `${V1}/timetable-generator`;

  beforeAll(async () => {
    rooms = await Promise.all(
      ['Gen Room 1', 'Gen Room 2'].map((name) =>
        prisma.room.create({ data: { name, capacity: 50, type: 'CLASSROOM' } }),
      ),
    );
    slots = await Promise.all(
      ['07:00', '08:00', '09:00'].map((startTime, index) =>
        prisma.timeSlot.create({
          data: { dayOfWeek: 1, startTime, endTime: `0${index + 7}:50` },
        }),
      ),
    );
  });

  beforeEach(async () => {
    await prisma.timetableEntry.deleteMany();
    await prisma.teacherUnavailability.deleteMany();
    await prisma.courseOffering.update({
      where: { id: fx.offering.id },
      data: { weeklyTheoryPeriods: null, weeklyLabPeriods: null },
    });
  });

  afterEach(() => vi.restoreAllMocks());

  const placement = (slot: number, room = 0) => ({
    offeringId: fx.offering.id,
    timeSlotId: slots[slot]!.id,
    roomId: rooms[room]!.id,
    kind: 'THEORY' as const,
  });

  const solved = (placements = [placement(0), placement(1), placement(2)]) => ({
    status: 'OPTIMAL',
    placements,
    score: { penalty: 0, sameDayRepeats: 0, longRuns: 0, gaps: 0, splitLabs: 0, unevenDays: 0 },
    unsatisfiable: [],
    solveSeconds: 0.1,
  });

  it('works out periods from the course, and lets an admin change them', async () => {
    let inputs = await api().get(`${base()}/semesters/${fx.semester.id}/inputs`).set(bearer(admin));
    expect(inputs.body.offerings[0]).toMatchObject({ theoryPeriods: 3, labPeriods: 0, size: 2 });

    await api()
      .put(`${base()}/offerings/${fx.offering.id}/periods`)
      .set(bearer(admin))
      .send({ theoryPeriods: 2, labPeriods: 1 });
    inputs = await api().get(`${base()}/semesters/${fx.semester.id}/inputs`).set(bearer(admin));
    expect(inputs.body.offerings[0]).toMatchObject({ theoryPeriods: 2, labPeriods: 1 });
  });

  it('sends the solver everything it needs, including teacher unavailability', async () => {
    await api()
      .put(`${base()}/teachers/${fx.teacherA.id}/unavailability`)
      .set(bearer(admin))
      .send({ timeSlotIds: [slots[0]!.id] });
    aiReplies({ '/timetable/generate': solved() });
    const response = await api()
      .post(`${base()}/generate`)
      .set(bearer(admin))
      .send({ semesterId: fx.semester.id });
    expect(response.status).toBe(200);
    const sent = lastBody('/timetable/generate');
    expect(sent.unavailable).toEqual([{ teacherId: fx.teacherA.id, timeSlotId: slots[0]!.id }]);
    expect(sent.offerings).toEqual([
      expect.objectContaining({ id: fx.offering.id, theoryPeriods: 3, labPeriods: 0 }),
    ]);
    expect(sent.sections).toEqual([expect.objectContaining({ id: fx.section.id, size: 2 })]);
  });

  it('returns a described proposal, with its own clash check at zero, saving nothing', async () => {
    aiReplies({ '/timetable/generate': solved() });
    const response = await api()
      .post(`${base()}/generate`)
      .set(bearer(admin))
      .send({ semesterId: fx.semester.id });
    expect(response.body).toMatchObject({ status: 'OPTIMAL', clashes: 0 });
    expect(response.body.entries[0]).toMatchObject({
      courseCode: 'CSC364',
      roomName: 'Gen Room 1',
      startTime: '07:00',
    });
    expect(await prisma.timetableEntry.count()).toBe(0);
  });

  it('counts the clash if the solver were ever wrong', async () => {
    aiReplies({ '/timetable/generate': solved([placement(0), placement(0, 1)]) });
    const response = await api()
      .post(`${base()}/generate`)
      .set(bearer(admin))
      .send({ semesterId: fx.semester.id });
    expect(response.body.clashes).toBeGreaterThan(0);
  });

  it('passes on the reasons when no timetable is possible', async () => {
    aiReplies({
      '/timetable/generate': {
        status: 'INFEASIBLE',
        placements: [],
        score: null,
        unsatisfiable: [{ code: 'NO_SUITABLE_ROOM', message: 'CSC364 needs a lab.' }],
        solveSeconds: 0,
      },
    });
    const response = await api()
      .post(`${base()}/generate`)
      .set(bearer(admin))
      .send({ semesterId: fx.semester.id });
    expect(response.body).toMatchObject({
      status: 'INFEASIBLE',
      entries: [],
      clashes: 0,
      unsatisfiable: [{ message: 'CSC364 needs a lab.' }],
    });
  });

  it('saves a reviewed timetable, replacing the old one, and records who did it', async () => {
    const save = (placements: ReturnType<typeof placement>[]) =>
      api()
        .post(`${base()}/apply`)
        .set(bearer(admin))
        .send({ semesterId: fx.semester.id, placements });
    expect((await save([placement(0), placement(1)])).body).toEqual({ saved: 2 });
    expect((await save([placement(2)])).body).toEqual({ saved: 1 });
    const entries = await prisma.timetableEntry.findMany();
    expect(entries.map((entry) => entry.timeSlotId)).toEqual([slots[2]!.id]);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'TIMETABLE_GENERATED' } });
    expect(audit?.actorId).toBe(fx.admin.id);
  });

  it('refuses to save a clash, using the same check as the manual editor', async () => {
    const response = await api()
      .post(`${base()}/apply`)
      .set(bearer(admin))
      .send({ semesterId: fx.semester.id, placements: [placement(0), placement(0, 1)] });
    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('has two classes');
    expect(await prisma.timetableEntry.count()).toBe(0);
  });

  it('reports clashes while reviewing, without saving', async () => {
    const response = await api()
      .post(`${base()}/check`)
      .set(bearer(admin))
      .send({ semesterId: fx.semester.id, placements: [placement(0), placement(0, 1)] });
    expect(response.status).toBe(200);
    expect(response.body.clashes.length).toBeGreaterThan(0);
    expect(await prisma.timetableEntry.count()).toBe(0);
  });

  it('treats another semester running at the same time as taken', async () => {
    const other = await prisma.semester.create({
      data: {
        programId: fx.program.id,
        academicYearId: fx.year.id,
        number: 4,
        startDate: fx.semester.startDate,
        endDate: fx.semester.endDate,
      },
    });
    const section = await prisma.section.create({ data: { semesterId: other.id, name: 'Z' } });
    const course = await prisma.course.create({
      data: {
        programId: fx.program.id,
        code: 'CSC999',
        title: 'Other',
        creditHours: 3,
        semesterNumber: 4,
      },
    });
    const offering = await prisma.courseOffering.create({
      data: { courseId: course.id, sectionId: section.id, teacherId: fx.teacherA.id },
    });
    await prisma.timetableEntry.create({
      data: {
        courseOfferingId: offering.id,
        roomId: rooms[1]!.id,
        timeSlotId: slots[0]!.id,
        semesterId: other.id,
      },
    });

    aiReplies({ '/timetable/generate': solved() });
    await api().post(`${base()}/generate`).set(bearer(admin)).send({ semesterId: fx.semester.id });
    const sent = lastBody('/timetable/generate');
    expect(sent.bookedRooms).toEqual([{ roomId: rooms[1]!.id, timeSlotId: slots[0]!.id }]);
    expect(sent.unavailable).toEqual([{ teacherId: fx.teacherA.id, timeSlotId: slots[0]!.id }]);

    // The teacher is busy with the other class at that time, so this must be refused.
    const refused = await api()
      .post(`${base()}/apply`)
      .set(bearer(admin))
      .send({ semesterId: fx.semester.id, placements: [placement(0)] });
    expect(refused.status).toBe(409);

    await prisma.courseOffering.delete({ where: { id: offering.id } });
    await prisma.course.delete({ where: { id: course.id } });
    await prisma.section.delete({ where: { id: section.id } });
    await prisma.semester.delete({ where: { id: other.id } });
  });

  it('refuses classes from another semester', async () => {
    const other = await prisma.semester.create({
      data: {
        programId: fx.program.id,
        academicYearId: fx.year.id,
        number: 2,
        startDate: new Date('2030-01-01'),
        endDate: new Date('2030-06-01'),
      },
    });
    const response = await api()
      .post(`${base()}/apply`)
      .set(bearer(admin))
      .send({ semesterId: other.id, placements: [placement(0)] });
    expect(response.status).toBe(400);
    await prisma.semester.delete({ where: { id: other.id } });
  });

  it('is for admins only', async () => {
    for (const token of [teacherA, studentA, parent]) {
      const generate = await api()
        .post(`${base()}/generate`)
        .set(bearer(token))
        .send({ semesterId: fx.semester.id });
      expect(generate.status).toBe(403);
    }
  });

  it('explains when the AI service is not running', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'));
    const response = await api()
      .post(`${base()}/generate`)
      .set(bearer(admin))
      .send({ semesterId: fx.semester.id });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AI_SERVICE_UNAVAILABLE');
    const log = await prisma.aiCallLog.findFirst({
      where: { feature: 'TIMETABLE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log?.succeeded).toBe(false);
  });
});
