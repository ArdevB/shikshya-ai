import type { Prisma } from '@prisma/client';
import {
  type QuizAttemptView,
  type QuizDetailView,
  type QuizDifficulty,
  type QuizGenerateBody,
  type QuizGradeBody,
  type QuizListQuery,
  type QuizPublishBody,
  type QuizQuestionBody,
  type QuizQuestionType,
  type QuizQuestionView,
  type QuizSubmitBody,
  type QuizSummaryView,
  type QuizUpdateBody,
  type StoredFile,
  type StudentQuizQuestionView,
  type StudentQuizResultQuestion,
  type StudentQuizState,
  type StudentQuizSummaryView,
  type StudentQuizView,
} from '@shikshya/shared';
import { logAiCall } from '../lib/aiLog.js';
import { callAiService, extractDocumentText } from '../lib/aiService.js';
import { writeAudit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { pageArgs, paginated } from '../lib/pagination.js';
import { prisma } from '../lib/prisma.js';
import { storage } from '../lib/storage.js';
import type { CurrentUser } from '../middleware/auth.js';
import { notify, notifySafely } from './notification.service.js';
import { assertCanViewOffering, isAdmin, teachesOffering } from './scope.js';

const summaryInclude = {
  courseOffering: {
    select: {
      course: { select: { code: true, title: true } },
      section: { select: { name: true } },
    },
  },
  questions: { select: { approved: true } },
  _count: { select: { attempts: true } },
} as const;

type SummaryRow = Prisma.QuizGetPayload<{ include: typeof summaryInclude }>;

const toSummary = (row: SummaryRow): QuizSummaryView => ({
  id: row.id,
  title: row.title,
  status: row.status,
  courseOfferingId: row.courseOfferingId,
  courseCode: row.courseOffering.course.code,
  courseTitle: row.courseOffering.course.title,
  sectionName: row.courseOffering.section.name,
  questionCount: row.questions.length,
  approvedCount: row.questions.filter((question) => question.approved).length,
  attemptCount: row._count.attempts,
  opensAt: row.opensAt?.toISOString() ?? null,
  closesAt: row.closesAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

interface QuestionRow {
  id: string;
  position: number;
  type: QuizQuestionType;
  question: string;
  options: unknown;
  correctAnswer: string;
  explanation: string;
  difficulty: QuizDifficulty;
  sourceSnippet: string;
  approved: boolean;
}

const toQuestionView = (row: QuestionRow): QuizQuestionView => ({
  id: row.id,
  position: row.position,
  type: row.type,
  question: row.question,
  options: (row.options as string[] | null) ?? null,
  correctAnswer: row.correctAnswer,
  explanation: row.explanation,
  difficulty: row.difficulty,
  sourceSnippet: row.sourceSnippet,
  approved: row.approved,
});

/** Only the teacher of the class may write to its quizzes. */
async function assertTeaches(user: CurrentUser, offeringId: string) {
  if (!(await teachesOffering(user, offeringId))) throw forbidden();
}

async function loadQuiz(id: string) {
  const quiz = await prisma.quiz.findUnique({ where: { id } });
  if (!quiz) throw notFound('Quiz');
  return quiz;
}

/** Loads a quiz the teacher may change. A published quiz is locked: students may have seen it. */
async function draftQuizFor(user: CurrentUser, id: string) {
  const quiz = await loadQuiz(id);
  await assertTeaches(user, quiz.courseOfferingId);
  if (quiz.status !== 'DRAFT') throw conflict('This quiz is published and can no longer change');
  return quiz;
}

export async function getQuiz(user: CurrentUser, id: string): Promise<QuizDetailView> {
  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: {
      ...summaryInclude,
      questions: { orderBy: { position: 'asc' } },
    },
  });
  if (!quiz) throw notFound('Quiz');
  await assertCanViewOffering(user, quiz.courseOfferingId);
  return { ...toSummary(quiz), questions: quiz.questions.map(toQuestionView) };
}

export async function listQuizzes(user: CurrentUser, query: QuizListQuery) {
  const where: Prisma.QuizWhereInput = {
    courseOfferingId: query.offeringId,
    ...(isAdmin(user) ? {} : { courseOffering: { teacher: { userId: user.id } } }),
  };
  const [rows, total] = await Promise.all([
    prisma.quiz.findMany({
      ...pageArgs(query),
      where,
      include: summaryInclude,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.quiz.count({ where }),
  ]);
  return paginated(rows.map(toSummary), total, query);
}

/** The notes come from whichever one was given: an uploaded file, a material, or pasted text. */
async function sourceText(
  user: CurrentUser,
  body: QuizGenerateBody,
  file: Express.Multer.File | undefined,
): Promise<string> {
  if (file) return extractDocumentText(file.buffer, file.originalname);
  if (body.text) return body.text;
  if (body.materialId) {
    const material = await prisma.material.findUnique({ where: { id: body.materialId } });
    if (!material) throw notFound('Material');
    await assertCanViewOffering(user, material.courseOfferingId);
    const parts = [material.title, material.description ?? ''];
    for (const stored of material.files as unknown as StoredFile[]) {
      parts.push(await extractDocumentText(await storage.read(stored), stored.name));
    }
    const text = parts.join('\n\n').trim();
    if (text.length < 20) throw badRequest('This material has no text to write questions from.');
    return text;
  }
  throw badRequest('Please upload a file, choose a material or paste some text');
}

interface GeneratedQuestion {
  type: QuizQuestionType;
  question: string;
  options: string[] | null;
  correctAnswer: string;
  explanation: string;
  difficulty: QuizDifficulty;
  sourceSnippet: string;
}

interface AiUsage {
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

const logQuizCall = (user: CurrentUser, usage: AiUsage) =>
  logAiCall({
    userId: user.id,
    feature: 'QUIZ',
    model: usage.model,
    tokensIn: usage.inputTokens,
    tokensOut: usage.outputTokens,
    latencyMs: usage.latencyMs,
    succeeded: true,
  });

const failedQuizCall = (user: CurrentUser, started: number, error: unknown) =>
  logAiCall({
    userId: user.id,
    feature: 'QUIZ',
    model: 'quiz-service',
    latencyMs: Date.now() - started,
    succeeded: false,
    errorCode: error instanceof Error ? error.message.slice(0, 60) : 'FAILED',
  });

/** Writes a draft for the teacher to review. Nothing reaches students until they approve it. */
export async function generateQuiz(
  user: CurrentUser,
  body: QuizGenerateBody,
  file: Express.Multer.File | undefined,
): Promise<QuizDetailView> {
  await assertTeaches(user, body.courseOfferingId);
  const offering = await prisma.courseOffering.findUniqueOrThrow({
    where: { id: body.courseOfferingId },
    select: { course: { select: { title: true } } },
  });
  const text = await sourceText(user, body, file);

  const started = Date.now();
  let generated: { questions: GeneratedQuestion[]; usage: AiUsage };
  try {
    generated = await callAiService('/quiz/generate', {
      text,
      numQuestions: body.numQuestions,
      types: body.types,
      difficulty: body.difficulty,
      courseTitle: offering.course.title,
    });
  } catch (error) {
    await failedQuizCall(user, started, error);
    throw error;
  }
  await logQuizCall(user, generated.usage);

  const quiz = await prisma.quiz.create({
    data: {
      courseOfferingId: body.courseOfferingId,
      title: body.title,
      sourceText: text,
      createdById: user.id,
      questions: {
        create: generated.questions.map((question, position) => ({
          position,
          type: question.type,
          question: question.question,
          options: question.options ?? undefined,
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
          difficulty: question.difficulty,
          sourceSnippet: question.sourceSnippet,
        })),
      },
    },
  });
  return getQuiz(user, quiz.id);
}

export async function updateQuiz(user: CurrentUser, id: string, body: QuizUpdateBody) {
  await draftQuizFor(user, id);
  await prisma.quiz.update({ where: { id }, data: { title: body.title } });
  return getQuiz(user, id);
}

export async function deleteQuiz(user: CurrentUser, id: string) {
  await draftQuizFor(user, id);
  await prisma.quiz.delete({ where: { id } });
}

/** Finds a question through its quiz, so a question id from another quiz cannot be used. */
async function draftQuestion(user: CurrentUser, quizId: string, questionId: string) {
  const quiz = await draftQuizFor(user, quizId);
  const question = await prisma.quizQuestion.findFirst({ where: { id: questionId, quizId } });
  if (!question) throw notFound('Question');
  return { quiz, question };
}

export async function updateQuestion(
  user: CurrentUser,
  quizId: string,
  questionId: string,
  body: QuizQuestionBody,
) {
  await draftQuestion(user, quizId, questionId);
  const options =
    body.type === 'MCQ' ? (body.options ?? []) : body.type === 'TRUE_FALSE' ? ['True', 'False'] : null;
  const updated = await prisma.quizQuestion.update({
    where: { id: questionId },
    data: {
      type: body.type,
      question: body.question,
      options: options ?? undefined,
      correctAnswer: body.correctAnswer,
      explanation: body.explanation,
      difficulty: body.difficulty,
      approved: body.approved,
    },
  });
  return toQuestionView(updated);
}

export async function deleteQuestion(user: CurrentUser, quizId: string, questionId: string) {
  await draftQuestion(user, quizId, questionId);
  await prisma.quizQuestion.delete({ where: { id: questionId } });
}

export async function setQuestionApproved(
  user: CurrentUser,
  quizId: string,
  questionId: string,
  approved: boolean,
) {
  await draftQuestion(user, quizId, questionId);
  const updated = await prisma.quizQuestion.update({
    where: { id: questionId },
    data: { approved },
  });
  return toQuestionView(updated);
}

/** Replaces one question with a new one from the same notes. It needs approval again. */
export async function regenerateQuestion(user: CurrentUser, quizId: string, questionId: string) {
  const { quiz, question } = await draftQuestion(user, quizId, questionId);
  const offering = await prisma.courseOffering.findUniqueOrThrow({
    where: { id: quiz.courseOfferingId },
    select: { course: { select: { title: true } } },
  });

  const started = Date.now();
  let generated: { question: GeneratedQuestion; usage: AiUsage };
  try {
    generated = await callAiService('/quiz/regenerate', {
      text: quiz.sourceText,
      courseTitle: offering.course.title,
      question: {
        type: question.type,
        question: question.question,
        options: question.options,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        difficulty: question.difficulty,
        sourceSnippet: question.sourceSnippet,
      },
    });
  } catch (error) {
    await failedQuizCall(user, started, error);
    throw error;
  }
  await logQuizCall(user, generated.usage);

  const updated = await prisma.quizQuestion.update({
    where: { id: questionId },
    data: {
      question: generated.question.question,
      options: generated.question.options ?? undefined,
      correctAnswer: generated.question.correctAnswer,
      explanation: generated.question.explanation,
      difficulty: generated.question.difficulty,
      sourceSnippet: generated.question.sourceSnippet,
      approved: false,
    },
  });
  return toQuestionView(updated);
}

export async function publishQuiz(user: CurrentUser, id: string, body: QuizPublishBody) {
  const quiz = await draftQuizFor(user, id);
  const questions = await prisma.quizQuestion.findMany({ where: { quizId: id } });
  if (questions.length === 0) throw badRequest('This quiz has no questions');
  // The rule the whole feature rests on: nothing AI-written reaches students unapproved.
  const unapproved = questions.filter((question) => !question.approved).length;
  if (unapproved > 0) {
    throw conflict(
      `${unapproved} ${unapproved === 1 ? 'question has' : 'questions have'} not been approved yet`,
    );
  }

  await prisma.quiz.update({
    where: { id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      opensAt: new Date(body.opensAt),
      closesAt: new Date(body.closesAt),
    },
  });

  const students = await prisma.enrollment.findMany({
    where: {
      status: 'ACTIVE',
      section: { offerings: { some: { id: quiz.courseOfferingId } } },
    },
    select: { student: { select: { userId: true } } },
  });
  await notifySafely(() =>
    notify(
      students.map((enrollment) => enrollment.student.userId),
      'QUIZ_PUBLISHED',
      { title: 'New quiz', body: `${quiz.title} is ready for you.`, link: '/student/quizzes' },
    ),
  );
  return getQuiz(user, id);
}

// ---------- Students ----------

async function ownStudentId(user: CurrentUser) {
  const student = await prisma.student.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!student) throw forbidden();
  return student.id;
}

const stateOf = (
  quiz: { opensAt: Date | null; closesAt: Date | null },
  submitted: boolean,
  now: Date,
): StudentQuizState => {
  if (submitted) return 'SUBMITTED';
  if (quiz.opensAt && now < quiz.opensAt) return 'UPCOMING';
  if (quiz.closesAt && now > quiz.closesAt) return 'MISSED';
  return 'OPEN';
};

const studentQuizInclude = (studentId: string) =>
  ({
    courseOffering: { select: { course: { select: { code: true, title: true } } } },
    questions: { orderBy: { position: 'asc' as const } },
    attempts: { where: { studentId }, include: { answers: true } },
  }) as const;

type StudentQuizRow = Prisma.QuizGetPayload<{
  include: ReturnType<typeof studentQuizInclude>;
}>;

function studentSummary(row: StudentQuizRow, now: Date): StudentQuizSummaryView {
  const attempt = row.attempts[0];
  const answers = attempt?.answers ?? [];
  const submitted = Boolean(attempt?.submittedAt);
  return {
    id: row.id,
    title: row.title,
    courseCode: row.courseOffering.course.code,
    courseTitle: row.courseOffering.course.title,
    questionCount: row.questions.length,
    opensAt: (row.opensAt as Date).toISOString(),
    closesAt: (row.closesAt as Date).toISOString(),
    state: stateOf(row, submitted, now),
    score: submitted ? answers.filter((answer) => answer.isCorrect === true).length : null,
    awaitingMarks: submitted ? answers.filter((answer) => answer.isCorrect === null).length : 0,
  };
}

/** Quizzes for the classes a student is in. */
const visibleToStudent = (studentId: string): Prisma.QuizWhereInput => ({
  status: 'PUBLISHED',
  courseOffering: {
    section: { enrollments: { some: { studentId, status: 'ACTIVE' } } },
  },
});

export async function listStudentQuizzes(user: CurrentUser, now = new Date()) {
  const studentId = await ownStudentId(user);
  const rows = await prisma.quiz.findMany({
    where: visibleToStudent(studentId),
    include: studentQuizInclude(studentId),
    orderBy: { closesAt: 'desc' },
  });
  return rows.map((row) => studentSummary(row, now));
}

export async function getStudentQuiz(
  user: CurrentUser,
  id: string,
  now = new Date(),
): Promise<StudentQuizView> {
  const studentId = await ownStudentId(user);
  const row = await prisma.quiz.findFirst({
    where: { id, ...visibleToStudent(studentId) },
    include: studentQuizInclude(studentId),
  });
  if (!row) throw notFound('Quiz');

  const summary = studentSummary(row, now);
  const stripped: StudentQuizQuestionView[] = row.questions.map((question) => ({
    id: question.id,
    position: question.position,
    type: question.type,
    question: question.question,
    options: (question.options as string[] | null) ?? null,
  }));

  // Answers stay hidden until the quiz closes, so nobody can pass them to a friend still taking it.
  const closed = (row.closesAt as Date) < now;
  const attempt = row.attempts[0];
  const result: StudentQuizResultQuestion[] | null =
    attempt?.submittedAt && closed
      ? row.questions.map((question, index) => {
          const answer = attempt.answers.find((item) => item.questionId === question.id);
          return {
            ...stripped[index]!,
            yourAnswer: answer?.answer ?? null,
            isCorrect: answer?.isCorrect ?? null,
            correctAnswer: question.correctAnswer,
            explanation: question.explanation,
          };
        })
      : null;

  return {
    ...summary,
    questions: summary.state === 'OPEN' || summary.state === 'SUBMITTED' ? stripped : [],
    result,
  };
}

/** Multiple choice and true/false are marked now. Short answers wait for the teacher. */
export async function submitQuiz(
  user: CurrentUser,
  id: string,
  body: QuizSubmitBody,
  now = new Date(),
) {
  const studentId = await ownStudentId(user);
  const quiz = await prisma.quiz.findFirst({
    where: { id, ...visibleToStudent(studentId) },
    include: { questions: true, attempts: { where: { studentId } } },
  });
  if (!quiz) throw notFound('Quiz');
  if (quiz.attempts[0]?.submittedAt) throw conflict('You have already submitted this quiz');
  const state = stateOf(quiz, false, now);
  if (state === 'UPCOMING') throw conflict('This quiz has not opened yet');
  if (state === 'MISSED') throw conflict('This quiz has closed');

  const given = new Map(body.answers.map((item) => [item.questionId, item.answer.trim()]));
  const answers = quiz.questions.map((question) => {
    const answer = given.get(question.id) ?? '';
    const isCorrect =
      question.type === 'SHORT_ANSWER' && answer
        ? null
        : answer === question.correctAnswer;
    return { questionId: question.id, answer, isCorrect };
  });

  const attempt = await prisma.$transaction(async (tx) => {
    const created = await tx.quizAttempt.upsert({
      where: { quizId_studentId: { quizId: id, studentId } },
      create: { quizId: id, studentId, submittedAt: now, answers: { create: answers } },
      update: { submittedAt: now, answers: { create: answers } },
    });
    await writeAudit(
      {
        actorId: user.id,
        action: 'QUIZ_SUBMITTED',
        entity: 'QuizAttempt',
        entityId: created.id,
        after: { correct: answers.filter((answer) => answer.isCorrect === true).length },
      },
      tx,
    );
    return created;
  });
  return { attemptId: attempt.id };
}

// ---------- Teacher: results and marking ----------

export async function listQuizAttempts(user: CurrentUser, id: string): Promise<QuizAttemptView[]> {
  const quiz = await loadQuiz(id);
  await assertCanViewOffering(user, quiz.courseOfferingId);
  const attempts = await prisma.quizAttempt.findMany({
    where: { quizId: id, submittedAt: { not: null } },
    include: {
      student: {
        select: {
          id: true,
          rollNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      answers: {
        include: {
          question: {
            select: { question: true, type: true, correctAnswer: true, position: true },
          },
        },
      },
    },
    orderBy: { student: { rollNumber: 'asc' } },
  });
  const total = await prisma.quizQuestion.count({ where: { quizId: id } });

  return attempts.map((attempt) => ({
    id: attempt.id,
    studentId: attempt.student.id,
    studentName: `${attempt.student.user.firstName} ${attempt.student.user.lastName}`,
    rollNumber: attempt.student.rollNumber,
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    score: attempt.answers.filter((answer) => answer.isCorrect === true).length,
    total,
    awaitingMarks: attempt.answers.filter((answer) => answer.isCorrect === null).length,
    answers: [...attempt.answers]
      .sort((a, b) => a.question.position - b.question.position)
      .map((answer) => ({
        id: answer.id,
        questionId: answer.questionId,
        question: answer.question.question,
        type: answer.question.type,
        correctAnswer: answer.question.correctAnswer,
        answer: answer.answer,
        isCorrect: answer.isCorrect,
      })),
  }));
}

export async function gradeQuizAnswer(user: CurrentUser, answerId: string, body: QuizGradeBody) {
  const answer = await prisma.quizAnswer.findUnique({
    where: { id: answerId },
    include: { question: { select: { type: true, quiz: { select: { courseOfferingId: true } } } } },
  });
  if (!answer) throw notFound('Answer');
  await assertTeaches(user, answer.question.quiz.courseOfferingId);
  if (answer.question.type !== 'SHORT_ANSWER') {
    throw badRequest('Only short answers are marked by hand');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.quizAnswer.update({
      where: { id: answerId },
      data: { isCorrect: body.isCorrect, gradedById: user.id, gradedAt: new Date() },
    });
    await writeAudit(
      {
        actorId: user.id,
        action: 'QUIZ_ANSWER_GRADED',
        entity: 'QuizAnswer',
        entityId: answerId,
        before: { isCorrect: answer.isCorrect },
        after: { isCorrect: body.isCorrect },
      },
      tx,
    );
    return { id: updated.id, isCorrect: updated.isCorrect };
  });
}
