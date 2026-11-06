import { z } from 'zod';
import { paginationQuery } from './common.js';

/** A file saved by StorageService, as recorded in the database. */
export interface StoredFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
}

/** Multipart forms send everything as text, hence the coercion and the "true" comparison. */
const formBoolean = z
  .union([z.boolean(), z.string()])
  .transform((value) => value === true || value === 'true');

export const assignmentBody = z.object({
  courseOfferingId: z.string().min(1, 'Choose a class'),
  title: z.string().trim().min(1, 'Required').max(160),
  description: z.string().trim().max(20000).default(''),
  /** A full ISO date and time. */
  dueAt: z
    .string()
    .min(1, 'Choose a due date')
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Choose a valid date and time'),
  maxMarks: z.coerce.number().positive('Must be more than 0').max(1000),
  allowLate: formBoolean.default(false),
});
export type AssignmentBody = z.infer<typeof assignmentBody>;

export const assignmentListQuery = paginationQuery.extend({
  offeringId: z.string().optional(),
});

export const submissionBody = z.object({
  text: z.string().trim().max(20000).optional(),
});

export const gradeBody = z.object({
  marks: z.coerce.number().min(0, 'Marks cannot be negative'),
  feedback: z.string().trim().max(5000).optional(),
});
export type GradeBody = z.infer<typeof gradeBody>;

export const materialBody = z.object({
  courseOfferingId: z.string().min(1, 'Choose a class'),
  title: z.string().trim().min(1, 'Required').max(160),
  description: z.string().trim().max(5000).optional(),
});
export type MaterialBody = z.infer<typeof materialBody>;

export const materialListQuery = paginationQuery.extend({
  offeringId: z.string().optional(),
});

export type AssignmentStatus = 'DUE' | 'OVERDUE' | 'SUBMITTED' | 'GRADED';

export interface StudentAssignment {
  id: string;
  title: string;
  description: string;
  dueAt: string;
  maxMarks: number;
  allowLate: boolean;
  attachments: StoredFile[];
  courseCode: string;
  courseTitle: string;
  status: AssignmentStatus;
  submission: {
    id: string;
    submittedAt: string;
    files: StoredFile[];
    text: string | null;
    isLate: boolean;
    /** Only present once the work has been graded. */
    marks: number | null;
    feedback: string | null;
  } | null;
}

export interface TeacherAssignment {
  id: string;
  courseOfferingId: string;
  title: string;
  description: string;
  dueAt: string;
  maxMarks: number;
  allowLate: boolean;
  attachments: StoredFile[];
  courseCode: string;
  courseTitle: string;
  sectionName: string;
  submissionCount: number;
  gradedCount: number;
  studentCount: number;
}

export interface SubmissionRow {
  studentId: string;
  rollNumber: string;
  studentName: string;
  submission: {
    id: string;
    submittedAt: string;
    files: StoredFile[];
    text: string | null;
    isLate: boolean;
    marks: number | null;
    feedback: string | null;
    gradedAt: string | null;
  } | null;
}

export interface MaterialView {
  id: string;
  courseOfferingId: string;
  title: string;
  description: string | null;
  files: StoredFile[];
  createdAt: string;
  courseCode: string;
  courseTitle: string;
  sectionName: string;
}
