import { z } from 'zod';
import { EXAM_TYPES, type ResultStatus } from '../enums.js';
import { dateString, paginationQuery } from './common.js';

export const examBody = z
  .object({
    semesterId: z.string().min(1, 'Choose a semester'),
    name: z.string().trim().min(1, 'Required').max(80),
    type: z.enum(EXAM_TYPES),
    startDate: dateString,
    endDate: dateString,
  })
  .refine((exam) => exam.startDate <= exam.endDate, {
    message: 'End date cannot be before start date',
    path: ['endDate'],
  });
export type ExamBody = z.infer<typeof examBody>;

export const examListQuery = paginationQuery.extend({
  semesterId: z.string().optional(),
});

export const examSubjectBody = z
  .object({
    courseOfferingId: z.string().min(1, 'Choose a course'),
    fullMarks: z.coerce.number().positive('Must be more than 0').max(1000),
    passMarks: z.coerce.number().min(0).max(1000),
    date: dateString.optional().or(z.literal('').transform(() => undefined)),
  })
  .refine((subject) => subject.passMarks <= subject.fullMarks, {
    message: 'Pass marks cannot be more than full marks',
    path: ['passMarks'],
  });
export type ExamSubjectBody = z.infer<typeof examSubjectBody>;

export const markBody = z
  .object({
    marksObtained: z.number().min(0, 'Marks cannot be negative').nullable(),
    isAbsent: z.boolean().default(false),
  })
  .refine((mark) => mark.isAbsent || mark.marksObtained !== null, {
    message: 'Enter the marks or mark the student absent',
    path: ['marksObtained'],
  });
export type MarkBody = z.infer<typeof markBody>;

export interface MarkRow {
  studentId: string;
  rollNumber: string;
  studentName: string;
  marksObtained: number | null;
  isAbsent: boolean;
  entered: boolean;
}

export interface MarkSheet {
  examSubjectId: string;
  examName: string;
  isPublished: boolean;
  courseCode: string;
  courseTitle: string;
  sectionName: string;
  fullMarks: number;
  passMarks: number;
  rows: MarkRow[];
}

export interface ResultCourseView {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  percent: number;
  grade: string;
  gradePoint: number;
  creditHours: number;
}

export interface SemesterResult {
  resultId: string;
  semesterId: string;
  semesterNumber: number;
  programCode: string;
  academicYear: string;
  gpa: number;
  totalCredits: number;
  status: ResultStatus;
  publishedAt: string;
  courses: ResultCourseView[];
}

export interface StudentResults {
  studentId: string;
  studentName: string;
  rollNumber: string;
  cgpa: number;
  semesters: SemesterResult[];
}

export interface SectionResultSummary {
  sectionId: string;
  sectionName: string;
  semesterNumber: number;
  studentCount: number;
  passCount: number;
  passPercent: number;
  averageGpa: number;
  gradeDistribution: { grade: string; count: number }[];
  students: {
    studentId: string;
    rollNumber: string;
    studentName: string;
    gpa: number;
    status: ResultStatus;
  }[];
}
