import { z } from 'zod';
import { GRADING_SCHEMES } from '../enums.js';
import { dateString, paginationQuery } from './common.js';

const name = z.string().trim().min(1, 'Required').max(120);
const code = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(20)
  .transform((value) => value.toUpperCase());

export const departmentBody = z.object({ name, code });
export type DepartmentBody = z.infer<typeof departmentBody>;

export const programBody = z.object({
  departmentId: z.string().min(1, 'Choose a department'),
  name,
  code,
  durationSemesters: z.coerce.number().int().min(1).max(12),
  gradingScheme: z.enum(GRADING_SCHEMES).default('TU_GPA'),
});
export type ProgramBody = z.infer<typeof programBody>;

/** Dates are YYYY-MM-DD strings, so comparing them as text compares them in time. */
const endsAfterStart = (value: { startDate: string; endDate: string }) =>
  value.startDate < value.endDate;
const endsAfterStartError = { message: 'End date must be after start date', path: ['endDate'] };

export const academicYearBody = z
  .object({
    name: z.string().trim().min(1, 'Required').max(20),
    startDate: dateString,
    endDate: dateString,
    isCurrent: z.boolean().default(false),
  })
  .refine(endsAfterStart, endsAfterStartError);
export type AcademicYearBody = z.infer<typeof academicYearBody>;

export const semesterBody = z
  .object({
    programId: z.string().min(1, 'Choose a program'),
    academicYearId: z.string().min(1, 'Choose an academic year'),
    number: z.coerce.number().int().min(1).max(12),
    startDate: dateString,
    endDate: dateString,
  })
  .refine(endsAfterStart, endsAfterStartError);
export type SemesterBody = z.infer<typeof semesterBody>;

export const sectionBody = z.object({
  semesterId: z.string().min(1, 'Choose a semester'),
  name: z.string().trim().min(1, 'Required').max(20),
});
export type SectionBody = z.infer<typeof sectionBody>;

export const courseBody = z.object({
  programId: z.string().min(1, 'Choose a program'),
  code,
  title: name,
  creditHours: z.coerce.number().int().min(0).max(12),
  semesterNumber: z.coerce.number().int().min(1).max(12),
  hasPractical: z.boolean().default(false),
});
export type CourseBody = z.infer<typeof courseBody>;

export const courseOfferingBody = z.object({
  courseId: z.string().min(1, 'Choose a course'),
  sectionId: z.string().min(1, 'Choose a section'),
  teacherId: z.string().min(1, 'Choose a teacher'),
});
export type CourseOfferingBody = z.infer<typeof courseOfferingBody>;

export const programListQuery = paginationQuery.extend({
  departmentId: z.string().optional(),
});
export const semesterListQuery = paginationQuery.extend({
  programId: z.string().optional(),
  academicYearId: z.string().optional(),
});
export const sectionListQuery = paginationQuery.extend({
  semesterId: z.string().optional(),
  programId: z.string().optional(),
});
export const courseListQuery = paginationQuery.extend({
  programId: z.string().optional(),
  semesterNumber: z.coerce.number().int().optional(),
});
export const courseOfferingListQuery = paginationQuery.extend({
  sectionId: z.string().optional(),
  teacherId: z.string().optional(),
  courseId: z.string().optional(),
});
