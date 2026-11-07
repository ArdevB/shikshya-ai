import type { Prisma } from '@prisma/client';
import {
  calculateAttendance,
  classesNeededToReachThreshold,
  ATTENDANCE_THRESHOLD_PERCENT,
  type AttendanceStatus,
  type RiskFactorView,
  type RiskLevel,
  type RiskListQuery,
  type RiskPredictionView,
  type RiskReviewBody,
  type RiskSummary,
} from '@shikshya/shared';
import { logAiCall } from '../lib/aiLog.js';
import { callAiService } from '../lib/aiService.js';
import { forbidden, notFound } from '../lib/errors.js';
import { pageArgs, paginated } from '../lib/pagination.js';
import { prisma } from '../lib/prisma.js';
import type { CurrentUser } from '../middleware/auth.js';
import { notifySafely, notify } from './notification.service.js';
import { isAdmin, teachesOffering } from './scope.js';

const TREND_WINDOW_DAYS = 14;
const NUDGE_EVERY_MS = 7 * 24 * 60 * 60 * 1000;
const MODEL_NAME = 'risk-model';

export interface RiskFeatures {
  attendance_pct: number | null;
  attendance_trend: number | null;
  internal_exam_pct: number | null;
  submission_rate_pct: number | null;
  avg_assignment_pct: number | null;
  late_rate_pct: number | null;
  previous_gpa: number | null;
}

interface FeatureInput {
  sessions: { date: Date; status: AttendanceStatus }[];
  exams: { obtained: number | null; isAbsent: boolean; full: number }[];
  assignmentsDue: number;
  submissions: { isLate: boolean; marks: number | null; maxMarks: number }[];
  previousGpa: number | null;
  now: Date;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Pure, so each rule can be tested without a database. Null means not known yet. */
export function computeFeatures(input: FeatureInput): RiskFeatures {
  const statuses = input.sessions.map((session) => session.status);
  const attendance = calculateAttendance(statuses).percentage;

  const cutoff = input.now.getTime() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const recent = calculateAttendance(
    input.sessions.filter((s) => s.date.getTime() >= cutoff).map((s) => s.status),
  ).percentage;
  const earlier = calculateAttendance(
    input.sessions.filter((s) => s.date.getTime() < cutoff).map((s) => s.status),
  ).percentage;

  // Absent counts as zero. A mark not yet entered does not count at all.
  const sat = input.exams.filter((exam) => exam.isAbsent || exam.obtained !== null);
  const full = sat.reduce((sum, exam) => sum + exam.full, 0);
  const obtained = sat.reduce((sum, exam) => sum + (exam.isAbsent ? 0 : (exam.obtained ?? 0)), 0);

  const graded = input.submissions.filter((s) => s.marks !== null && s.maxMarks > 0);
  const handedIn = input.submissions.length;

  return {
    attendance_pct: attendance,
    attendance_trend: recent !== null && earlier !== null ? round1(recent - earlier) : null,
    internal_exam_pct: full > 0 ? round1((obtained / full) * 100) : null,
    submission_rate_pct:
      input.assignmentsDue > 0
        ? round1((Math.min(handedIn, input.assignmentsDue) / input.assignmentsDue) * 100)
        : null,
    avg_assignment_pct: graded.length
      ? round1(
          (graded.reduce((sum, s) => sum + (s.marks as number) / s.maxMarks, 0) / graded.length) *
            100,
        )
      : null,
    late_rate_pct: handedIn
      ? round1((input.submissions.filter((s) => s.isLate).length / handedIn) * 100)
      : null,
    previous_gpa: input.previousGpa,
  };
}

/** A sentence a teacher can act on, for each reason the model gives. */
export function factorText(feature: string, value: number): string {
  const whole = Math.round(value);
  switch (feature) {
    case 'attendance_pct':
      return `Attendance is ${whole}%`;
    case 'attendance_trend':
      return `Attendance fell ${Math.abs(whole)} points in the last two weeks`;
    case 'internal_exam_pct':
      return `Internal exam marks are ${whole}%`;
    case 'submission_rate_pct':
      return `Has handed in ${whole}% of assignments`;
    case 'avg_assignment_pct':
      return `Assignment marks average ${whole}%`;
    case 'late_rate_pct':
      return `${whole}% of assignments were handed in late`;
    case 'previous_gpa':
      return `Last semester's GPA was ${value.toFixed(2)}`;
    default:
      return feature;
  }
}

/**
 * What a student is told. It offers one thing they can do, and never mentions a risk label or
 * prediction: that is for teachers, and being told "you are at risk" can do its own harm.
 */
export function supportMessage(
  courseTitle: string,
  features: RiskFeatures,
  attendance: { attended: number; total: number },
  missing: number,
): string {
  const percent = features.attendance_pct;
  if (percent !== null && percent < ATTENDANCE_THRESHOLD_PERCENT) {
    const needed = classesNeededToReachThreshold(attendance.attended, attendance.total);
    return `Your ${courseTitle} attendance is ${Math.round(percent)}%. Attending the next ${needed} ${needed === 1 ? 'class' : 'classes'} brings you back above ${ATTENDANCE_THRESHOLD_PERCENT}%.`;
  }
  if (missing > 0) {
    return `You have ${missing} ${courseTitle} ${missing === 1 ? 'assignment' : 'assignments'} still to hand in. Sending ${missing === 1 ? 'it' : 'them'} now would really help.`;
  }
  return `Your ${courseTitle} teacher is happy to help if anything feels difficult. A short chat can make the next few weeks easier.`;
}

interface PredictResponse {
  results: {
    probability: number;
    level: RiskLevel;
    topFactors: { feature: string; value: number }[];
  }[];
}

const levelRank: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

/**
 * The nightly job: computes each student's numbers for each course this semester, asks the model,
 * and saves the result. A teacher's review stays unless the student's level has since got worse.
 */
export async function computeRiskPredictions(now = new Date(), actorId: string | null = null) {
  const offerings = await prisma.courseOffering.findMany({
    where: { section: { semester: { academicYear: { isCurrent: true } } } },
    select: {
      id: true,
      course: { select: { title: true } },
      section: {
        select: {
          semester: { select: { number: true } },
          enrollments: {
            where: { status: 'ACTIVE' },
            select: {
              student: {
                select: {
                  id: true,
                  userId: true,
                  results: {
                    where: { publishedAt: { not: null } },
                    select: { gpa: true, semester: { select: { number: true } } },
                  },
                },
              },
            },
          },
        },
      },
      attendanceSessions: {
        select: { date: true, records: { select: { studentId: true, status: true } } },
      },
      examSubjects: {
        where: { exam: { type: 'INTERNAL' } },
        select: {
          fullMarks: true,
          marks: { select: { studentId: true, marksObtained: true, isAbsent: true } },
        },
      },
      assignments: {
        where: { dueAt: { lte: now } },
        select: {
          maxMarks: true,
          submissions: { select: { studentId: true, isLate: true, marks: true } },
        },
      },
    },
  });

  const items: {
    studentId: string;
    userId: string;
    offeringId: string;
    courseTitle: string;
    features: RiskFeatures;
    attended: number;
    total: number;
    missing: number;
  }[] = [];

  for (const offering of offerings) {
    for (const { student } of offering.section.enrollments) {
      const sessions = offering.attendanceSessions.flatMap((session) =>
        session.records
          .filter((record) => record.studentId === student.id)
          .map((record) => ({ date: session.date, status: record.status as AttendanceStatus })),
      );
      const submissions = offering.assignments.flatMap((assignment) =>
        assignment.submissions
          .filter((submission) => submission.studentId === student.id)
          .map((submission) => ({
            isLate: submission.isLate,
            marks: submission.marks === null ? null : Number(submission.marks),
            maxMarks: Number(assignment.maxMarks),
          })),
      );
      const previous = student.results
        .filter((result) => result.semester.number < offering.section.semester.number)
        .sort((a, b) => b.semester.number - a.semester.number)[0];

      const features = computeFeatures({
        sessions,
        exams: offering.examSubjects.flatMap((subject) =>
          subject.marks
            .filter((mark) => mark.studentId === student.id)
            .map((mark) => ({
              obtained: mark.marksObtained === null ? null : Number(mark.marksObtained),
              isAbsent: mark.isAbsent,
              full: Number(subject.fullMarks),
            })),
        ),
        assignmentsDue: offering.assignments.length,
        submissions,
        previousGpa: previous ? Number(previous.gpa) : null,
        now,
      });

      // With nothing recorded at all yet, the model would only be guessing.
      const known = Object.entries(features).filter(
        ([name, value]) => value !== null && name !== 'previous_gpa',
      );
      if (known.length === 0) continue;

      const tally = calculateAttendance(sessions.map((session) => session.status));
      items.push({
        studentId: student.id,
        userId: student.userId,
        offeringId: offering.id,
        courseTitle: offering.course.title,
        features,
        attended: tally.attended,
        total: tally.total,
        missing: Math.max(0, offering.assignments.length - submissions.length),
      });
    }
  }
  if (items.length === 0) return { computed: 0, flagged: 0, nudged: 0 };

  const started = Date.now();
  let response: PredictResponse;
  try {
    response = await callAiService<PredictResponse>('/predict/risk/batch', {
      items: items.map((item) => item.features),
    });
  } catch (error) {
    await logAiCall({
      userId: actorId,
      feature: 'RISK',
      model: MODEL_NAME,
      latencyMs: Date.now() - started,
      succeeded: false,
      errorCode: 'AI_SERVICE_FAILED',
    });
    throw error;
  }
  await logAiCall({
    userId: actorId,
    feature: 'RISK',
    model: MODEL_NAME,
    latencyMs: Date.now() - started,
    succeeded: true,
  });

  const existing = await prisma.riskPrediction.findMany({
    where: { courseOfferingId: { in: offerings.map((offering) => offering.id) } },
    select: { studentId: true, courseOfferingId: true, level: true, nudgedAt: true },
  });
  const previousRows = new Map(existing.map((row) => [`${row.studentId}|${row.courseOfferingId}`, row]));

  let flagged = 0;
  let nudged = 0;
  for (const [index, item] of items.entries()) {
    const result = response.results[index]!;
    const earlier = previousRows.get(`${item.studentId}|${item.offeringId}`);
    const worse = earlier !== undefined && levelRank[result.level] > levelRank[earlier.level];
    const factors: RiskFactorView[] = result.topFactors.map((factor) => ({
      feature: factor.feature,
      text: factorText(factor.feature, factor.value),
    }));
    const data = {
      probability: result.probability,
      level: result.level,
      factors: factors as unknown as Prisma.InputJsonValue,
      computedAt: now,
    };
    const flaggedNow = result.level !== 'LOW';
    if (flaggedNow) flagged += 1;

    const due =
      flaggedNow &&
      (!earlier?.nudgedAt || now.getTime() - earlier.nudgedAt.getTime() >= NUDGE_EVERY_MS);

    await prisma.riskPrediction.upsert({
      where: {
        studentId_courseOfferingId: {
          studentId: item.studentId,
          courseOfferingId: item.offeringId,
        },
      },
      create: {
        ...data,
        studentId: item.studentId,
        courseOfferingId: item.offeringId,
        nudgedAt: due ? now : null,
      },
      update: {
        ...data,
        ...(worse ? { reviewedAt: null, reviewedById: null, reviewNote: null } : {}),
        ...(due ? { nudgedAt: now } : {}),
      },
    });

    if (due) {
      nudged += 1;
      await notifySafely(() =>
        notify([item.userId], 'STUDY_SUPPORT', {
          title: `A note about ${item.courseTitle}`,
          body: supportMessage(
            item.courseTitle,
            item.features,
            { attended: item.attended, total: item.total },
            item.missing,
          ),
          link: '/student',
        }),
      );
    }
  }
  return { computed: items.length, flagged, nudged };
}

const predictionInclude = {
  student: {
    select: {
      id: true,
      rollNumber: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
  courseOffering: {
    select: {
      course: { select: { code: true, title: true } },
      section: { select: { name: true } },
    },
  },
  reviewedBy: { select: { firstName: true, lastName: true } },
} as const;

type PredictionRow = Prisma.RiskPredictionGetPayload<{ include: typeof predictionInclude }>;

const toView = (row: PredictionRow): RiskPredictionView => ({
  id: row.id,
  studentId: row.student.id,
  studentName: `${row.student.user.firstName} ${row.student.user.lastName}`,
  rollNumber: row.student.rollNumber,
  courseCode: row.courseOffering.course.code,
  courseTitle: row.courseOffering.course.title,
  sectionName: row.courseOffering.section.name,
  level: row.level,
  probability: row.probability,
  factors: row.factors as unknown as RiskFactorView[],
  computedAt: row.computedAt.toISOString(),
  reviewedAt: row.reviewedAt?.toISOString() ?? null,
  reviewedBy: row.reviewedBy ? `${row.reviewedBy.firstName} ${row.reviewedBy.lastName}` : null,
  reviewNote: row.reviewNote,
});

/** Who needs attention. A teacher sees only the classes they teach. Low risk is not listed. */
export async function listRiskPredictions(user: CurrentUser, query: RiskListQuery) {
  const where: Prisma.RiskPredictionWhereInput = {
    level: query.level ?? { in: ['MEDIUM', 'HIGH'] },
    courseOfferingId: query.offeringId,
    ...(query.unreviewedOnly ? { reviewedAt: null } : {}),
    courseOffering: {
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(isAdmin(user) ? {} : { teacher: { userId: user.id } }),
    },
  };
  const [rows, total] = await Promise.all([
    prisma.riskPrediction.findMany({
      ...pageArgs(query),
      where,
      include: predictionInclude,
      // Unreviewed first, then the highest risk.
      orderBy: [{ reviewedAt: { sort: 'asc', nulls: 'first' } }, { probability: 'desc' }],
    }),
    prisma.riskPrediction.count({ where }),
  ]);
  return paginated(rows.map(toView), total, query);
}

export async function reviewRiskPrediction(user: CurrentUser, id: string, body: RiskReviewBody) {
  const row = await prisma.riskPrediction.findUnique({ where: { id } });
  // The same answer whether it is missing or not theirs, so ids cannot be probed.
  if (!row || (!isAdmin(user) && !(await teachesOffering(user, row.courseOfferingId)))) {
    if (!row && isAdmin(user)) throw notFound('Prediction');
    throw forbidden();
  }
  const updated = await prisma.riskPrediction.update({
    where: { id },
    data: { reviewedAt: new Date(), reviewedById: user.id, reviewNote: body.note },
    include: predictionInclude,
  });
  return toView(updated);
}

/** Counts for admins, by section. */
export async function riskSummary(): Promise<RiskSummary> {
  const rows = await prisma.riskPrediction.findMany({
    select: {
      studentId: true,
      level: true,
      computedAt: true,
      courseOffering: {
        select: {
          section: {
            select: {
              id: true,
              name: true,
              semester: { select: { number: true, program: { select: { code: true } } } },
            },
          },
        },
      },
    },
  });

  const sections = new Map<
    string,
    RiskSummary['sections'][number] & { flagged: Set<string> }
  >();
  let computedAt: Date | null = null;
  for (const row of rows) {
    const section = row.courseOffering.section;
    const entry = sections.get(section.id) ?? {
      programCode: section.semester.program.code,
      semesterNumber: section.semester.number,
      sectionId: section.id,
      sectionName: section.name,
      high: 0,
      medium: 0,
      low: 0,
      studentsFlagged: 0,
      flagged: new Set<string>(),
    };
    entry[row.level.toLowerCase() as 'high' | 'medium' | 'low'] += 1;
    if (row.level !== 'LOW') entry.flagged.add(row.studentId);
    sections.set(section.id, entry);
    if (!computedAt || row.computedAt > computedAt) computedAt = row.computedAt;
  }

  return {
    computedAt: computedAt?.toISOString() ?? null,
    sections: [...sections.values()]
      .map(({ flagged, ...entry }) => ({ ...entry, studentsFlagged: flagged.size }))
      .sort(
        (a, b) =>
          a.programCode.localeCompare(b.programCode) ||
          a.semesterNumber - b.semesterNumber ||
          a.sectionName.localeCompare(b.sectionName),
      ),
  };
}
