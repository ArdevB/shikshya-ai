import { z } from 'zod';
import { dateString, optionalText, paginationQuery } from './common.js';

const email = z.string().trim().toLowerCase().email('Enter a valid email address');
const personName = z.string().trim().min(1, 'Required').max(80);
const phone = z
  .string()
  .trim()
  .regex(/^[+\d][\d\s-]{6,19}$/, 'Enter a valid phone number')
  .optional()
  .or(z.literal('').transform(() => undefined));

const personFields = {
  email,
  firstName: personName,
  lastName: personName,
  phone,
};

export const teacherCreateBody = z.object({
  ...personFields,
  employeeCode: z.string().trim().min(1, 'Required').max(30),
  departmentId: z.string().min(1, 'Choose a department'),
  designation: z.string().trim().min(1, 'Required').max(80),
});
export type TeacherCreateBody = z.infer<typeof teacherCreateBody>;
export const teacherUpdateBody = teacherCreateBody.partial().extend({
  isActive: z.boolean().optional(),
});
export type TeacherUpdateBody = z.infer<typeof teacherUpdateBody>;

const optionalDate = dateString.optional().or(z.literal('').transform(() => undefined));

export const studentCreateBody = z.object({
  ...personFields,
  rollNumber: z.string().trim().min(1, 'Required').max(30),
  registrationNumber: optionalText(50),
  programId: z.string().min(1, 'Choose a program'),
  currentSectionId: z.string().min(1, 'Choose a section'),
  admissionDate: dateString,
  dateOfBirth: optionalDate,
  address: optionalText(255),
  guardianName: optionalText(120),
  guardianPhone: phone,
});
export type StudentCreateBody = z.infer<typeof studentCreateBody>;
export const studentUpdateBody = studentCreateBody.partial().extend({
  isActive: z.boolean().optional(),
});
export type StudentUpdateBody = z.infer<typeof studentUpdateBody>;

export const studentListQuery = paginationQuery.extend({
  programId: z.string().optional(),
  sectionId: z.string().optional(),
  search: z.string().trim().max(100).optional(),
});

export const teacherListQuery = paginationQuery.extend({
  departmentId: z.string().optional(),
  search: z.string().trim().max(100).optional(),
});

export const parentCreateBody = z.object(personFields);
export type ParentCreateBody = z.infer<typeof parentCreateBody>;
export const parentUpdateBody = parentCreateBody.partial().extend({
  isActive: z.boolean().optional(),
});
export type ParentUpdateBody = z.infer<typeof parentUpdateBody>;

export const parentListQuery = paginationQuery.extend({
  search: z.string().trim().max(100).optional(),
});

export const parentLinkBody = z.object({
  studentId: z.string().min(1, 'Choose a student'),
  relation: z.string().trim().min(1, 'Required').max(40),
});
export type ParentLinkBody = z.infer<typeof parentLinkBody>;

/**
 * One row of the student CSV import. The program and section are referred to by
 * human-readable codes so an admin can prepare the file in a spreadsheet.
 */
export const studentCsvRow = z.object({
  email,
  firstName: personName,
  lastName: personName,
  phone,
  rollNumber: z.string().trim().min(1, 'Required').max(30),
  registrationNumber: optionalText(50),
  programCode: z.string().trim().min(1, 'Required'),
  semesterNumber: z.coerce.number().int().min(1, 'Must be 1 or more').max(12),
  sectionName: z.string().trim().min(1, 'Required'),
  admissionDate: dateString,
  dateOfBirth: optionalDate,
  address: optionalText(255),
  guardianName: optionalText(120),
  guardianPhone: phone,
});
export type StudentCsvRow = z.infer<typeof studentCsvRow>;

export const STUDENT_CSV_COLUMNS = [
  'email',
  'firstName',
  'lastName',
  'phone',
  'rollNumber',
  'registrationNumber',
  'programCode',
  'semesterNumber',
  'sectionName',
  'admissionDate',
  'dateOfBirth',
  'address',
  'guardianName',
  'guardianPhone',
] as const;

export interface CsvRowError {
  /** 1-based row number in the file, counting the header as row 1. */
  row: number;
  field: string;
  message: string;
}

export interface StudentImportResult {
  created: number;
  errors: CsvRowError[];
  /** Temporary passwords for the new accounts, shown once to the admin. */
  credentials: { email: string; temporaryPassword: string }[];
}
