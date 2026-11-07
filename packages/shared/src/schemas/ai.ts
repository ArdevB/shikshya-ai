import { z } from 'zod';
import { paginationQuery } from './common.js';

// ---------- Assistant ----------

export const MAX_ASSISTANT_MESSAGES_PER_HOUR = 30;

export const assistantMessageBody = z.object({
  /** Empty starts a new conversation. */
  conversationId: z.string().min(1).optional(),
  message: z.string().trim().min(1, 'Please type a message').max(2000, 'Please keep it shorter'),
});
export type AssistantMessageBody = z.infer<typeof assistantMessageBody>;

export interface AssistantConversationView {
  id: string;
  title: string;
  updatedAt: string;
}

export interface AssistantMessageView {
  id: string;
  role: 'USER' | 'ASSISTANT';
  text: string;
  /** What the assistant looked at, in plain words, like "Checked your attendance". */
  toolsUsed: string[];
  createdAt: string;
}

export interface AssistantStatus {
  configured: boolean;
  starters: string[];
}

/** One event on the assistant's response stream. */
export type AssistantStreamEvent =
  | { type: 'conversation'; id: string; title: string }
  | { type: 'tool'; label: string }
  | { type: 'text'; text: string }
  | { type: 'done'; messageId: string }
  | { type: 'error'; code: string; message: string };

// ---------- College rules ----------

export const policyDocumentBody = z.object({
  title: z.string().trim().min(2, 'Please give it a title').max(160),
});
export type PolicyDocumentBody = z.infer<typeof policyDocumentBody>;

export interface PolicyDocumentView {
  id: string;
  title: string;
  fileName: string;
  chunks: number;
  /** How many chunks can be found by meaning. The rest are found by keyword only. */
  embeddedChunks: number;
  uploadedBy: string;
  createdAt: string;
}

// ---------- At-risk students ----------

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export interface RiskFactorView {
  feature: string;
  /** A plain sentence for the teacher, like "Attendance is 62%". */
  text: string;
}

export interface RiskPredictionView {
  id: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  courseCode: string;
  courseTitle: string;
  sectionName: string;
  level: RiskLevel;
  probability: number;
  factors: RiskFactorView[];
  computedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
}

export const riskListQuery = paginationQuery.extend({
  offeringId: z.string().min(1).optional(),
  sectionId: z.string().min(1).optional(),
  level: z.enum(RISK_LEVELS).optional(),
  unreviewedOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
export type RiskListQuery = z.infer<typeof riskListQuery>;

export const riskReviewBody = z.object({
  note: z.string().trim().min(2, 'Please say what was done').max(1000),
});
export type RiskReviewBody = z.infer<typeof riskReviewBody>;

export interface RiskSummaryRow {
  programCode: string;
  semesterNumber: number;
  sectionId: string;
  sectionName: string;
  high: number;
  medium: number;
  low: number;
  /** Students in this section with at least one high or medium flag. */
  studentsFlagged: number;
}

export interface RiskSummary {
  sections: RiskSummaryRow[];
  computedAt: string | null;
}

// ---------- Quizzes ----------

export const QUIZ_QUESTION_TYPES = ['MCQ', 'TRUE_FALSE', 'SHORT_ANSWER'] as const;
export type QuizQuestionType = (typeof QUIZ_QUESTION_TYPES)[number];

export const QUIZ_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type QuizDifficulty = (typeof QUIZ_DIFFICULTIES)[number];

export const MAX_QUIZ_QUESTIONS = 30;

/** Multipart form fields, hence coerce. The notes come from a file, a material or `text`. */
export const quizGenerateBody = z.object({
  courseOfferingId: z.string().min(1, 'Please choose a class'),
  title: z.string().trim().min(2, 'Please give it a title').max(160),
  numQuestions: z.coerce.number().int().min(1).max(MAX_QUIZ_QUESTIONS),
  // Multipart sends a list as one comma-separated field.
  types: z
    .string()
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(z.array(z.enum(QUIZ_QUESTION_TYPES)).min(1, 'Please choose at least one type')),
  difficulty: z.enum(QUIZ_DIFFICULTIES),
  materialId: z.string().min(1).optional(),
  text: z.string().trim().min(20, 'Please paste a little more text').optional(),
});
export type QuizGenerateBody = z.infer<typeof quizGenerateBody>;

export const quizUpdateBody = z.object({
  title: z.string().trim().min(2).max(160),
});
export type QuizUpdateBody = z.infer<typeof quizUpdateBody>;

export const quizQuestionBody = z
  .object({
    type: z.enum(QUIZ_QUESTION_TYPES),
    question: z.string().trim().min(5, 'Please write the question').max(2000),
    options: z.array(z.string().trim().min(1, 'Options cannot be empty')).nullable(),
    correctAnswer: z.string().trim().min(1, 'Please give the answer'),
    explanation: z.string().trim().max(2000),
    difficulty: z.enum(QUIZ_DIFFICULTIES),
    approved: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (value.type === 'MCQ') {
      const options = value.options ?? [];
      if (options.length !== 4 || new Set(options).size !== 4) {
        context.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'A multiple choice question needs 4 different options',
        });
      } else if (!options.includes(value.correctAnswer)) {
        context.addIssue({
          code: 'custom',
          path: ['correctAnswer'],
          message: 'The answer must be one of the options',
        });
      }
    }
    if (value.type === 'TRUE_FALSE' && !['True', 'False'].includes(value.correctAnswer)) {
      context.addIssue({
        code: 'custom',
        path: ['correctAnswer'],
        message: 'The answer must be True or False',
      });
    }
  });
export type QuizQuestionBody = z.infer<typeof quizQuestionBody>;

export const quizPublishBody = z
  .object({ opensAt: z.string().datetime(), closesAt: z.string().datetime() })
  .refine((value) => value.closesAt > value.opensAt, {
    path: ['closesAt'],
    message: 'It must close after it opens',
  });
export type QuizPublishBody = z.infer<typeof quizPublishBody>;

export const quizListQuery = paginationQuery.extend({
  offeringId: z.string().min(1).optional(),
});
export type QuizListQuery = z.infer<typeof quizListQuery>;

export const quizSubmitBody = z.object({
  answers: z.array(z.object({ questionId: z.string().min(1), answer: z.string().max(5000) })),
});
export type QuizSubmitBody = z.infer<typeof quizSubmitBody>;

export const quizGradeBody = z.object({ isCorrect: z.boolean() });
export type QuizGradeBody = z.infer<typeof quizGradeBody>;

/** A question as the teacher sees it, with the answer. */
export interface QuizQuestionView {
  id: string;
  position: number;
  type: QuizQuestionType;
  question: string;
  options: string[] | null;
  correctAnswer: string;
  explanation: string;
  difficulty: QuizDifficulty;
  sourceSnippet: string;
  approved: boolean;
}

export interface QuizSummaryView {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED';
  courseOfferingId: string;
  courseCode: string;
  courseTitle: string;
  sectionName: string;
  questionCount: number;
  approvedCount: number;
  attemptCount: number;
  opensAt: string | null;
  closesAt: string | null;
  createdAt: string;
}

export interface QuizDetailView extends QuizSummaryView {
  questions: QuizQuestionView[];
}

/** A question as a student sees it while taking a quiz. It never carries the answer. */
export interface StudentQuizQuestionView {
  id: string;
  position: number;
  type: QuizQuestionType;
  question: string;
  options: string[] | null;
}

export type StudentQuizState = 'UPCOMING' | 'OPEN' | 'SUBMITTED' | 'MISSED';

export interface StudentQuizSummaryView {
  id: string;
  title: string;
  courseCode: string;
  courseTitle: string;
  questionCount: number;
  opensAt: string;
  closesAt: string;
  state: StudentQuizState;
  score: number | null;
  /** Short answers still waiting for the teacher. */
  awaitingMarks: number;
}

export interface StudentQuizResultQuestion extends StudentQuizQuestionView {
  yourAnswer: string | null;
  isCorrect: boolean | null;
  correctAnswer: string;
  explanation: string;
}

export interface StudentQuizView extends StudentQuizSummaryView {
  /** Empty until the quiz opens. */
  questions: StudentQuizQuestionView[];
  /** Only after the student has submitted. */
  result: StudentQuizResultQuestion[] | null;
}

export interface QuizAttemptAnswerView {
  id: string;
  questionId: string;
  question: string;
  type: QuizQuestionType;
  correctAnswer: string;
  answer: string;
  isCorrect: boolean | null;
}

export interface QuizAttemptView {
  id: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  submittedAt: string | null;
  score: number;
  total: number;
  awaitingMarks: number;
  answers: QuizAttemptAnswerView[];
}

// ---------- Timetable generator ----------

export const offeringPeriodsBody = z.object({
  theoryPeriods: z.number().int().min(0).max(20),
  labPeriods: z.number().int().min(0).max(20),
});
export type OfferingPeriodsBody = z.infer<typeof offeringPeriodsBody>;

export const teacherUnavailabilityBody = z.object({
  timeSlotIds: z.array(z.string().min(1)),
});
export type TeacherUnavailabilityBody = z.infer<typeof teacherUnavailabilityBody>;

export const timetableGenerateBody = z.object({ semesterId: z.string().min(1) });
export type TimetableGenerateBody = z.infer<typeof timetableGenerateBody>;

export const timetablePlacementSchema = z.object({
  offeringId: z.string().min(1),
  timeSlotId: z.string().min(1),
  roomId: z.string().min(1),
  kind: z.enum(['THEORY', 'LAB']),
});
export type TimetablePlacement = z.infer<typeof timetablePlacementSchema>;

export const timetableApplyBody = z.object({
  semesterId: z.string().min(1),
  placements: z.array(timetablePlacementSchema).min(1, 'There is nothing to save').max(2000),
});
export type TimetableApplyBody = z.infer<typeof timetableApplyBody>;

export interface TimetableGeneratorOffering {
  id: string;
  courseCode: string;
  courseTitle: string;
  sectionId: string;
  sectionName: string;
  teacherId: string;
  teacherName: string;
  size: number;
  theoryPeriods: number;
  labPeriods: number;
}

export interface TimetableGeneratorInputs {
  offerings: TimetableGeneratorOffering[];
  teachers: { id: string; name: string; unavailableSlotIds: string[] }[];
  roomCount: number;
  slotCount: number;
}

export interface TimetableProposalEntry extends TimetablePlacement {
  courseCode: string;
  courseTitle: string;
  sectionId: string;
  sectionName: string;
  teacherName: string;
  roomName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface TimetableProposal {
  status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE';
  entries: TimetableProposalEntry[];
  score: {
    penalty: number;
    sameDayRepeats: number;
    longRuns: number;
    gaps: number;
    splitLabs: number;
    unevenDays: number;
  } | null;
  /** Plain reasons why no timetable could be made. */
  unsatisfiable: { code: string; message: string }[];
  /** Always zero if the solver is right. Worked out again here by the app's own clash check. */
  clashes: number;
  solveSeconds: number;
}
