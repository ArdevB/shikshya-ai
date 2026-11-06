/**
 * Enums shared by the web app and the API. Values match the Prisma enums in
 * apps/api/prisma/schema.prisma.
 */

export const ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'TEACHER',
  'STUDENT',
  'PARENT',
  'ACCOUNTANT',
  'LIBRARIAN',
] as const;
export type Role = (typeof ROLES)[number];

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ENROLLMENT_STATUSES = ['ACTIVE', 'COMPLETED', 'DROPPED'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const GRADING_SCHEMES = ['TU_GPA'] as const;
export type GradingScheme = (typeof GRADING_SCHEMES)[number];

/** Attendance below this percentage triggers a warning throughout the system. */
export const ATTENDANCE_THRESHOLD_PERCENT = 75;

/** Teachers may edit an attendance session for this many hours after it is created. */
export const ATTENDANCE_EDIT_WINDOW_HOURS = 48;

export const ROOM_TYPES = ['CLASSROOM', 'LAB', 'HALL'] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const EXAM_TYPES = ['INTERNAL', 'PRACTICAL', 'FINAL'] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const RESULT_STATUSES = ['PASS', 'FAIL', 'WITHHELD'] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

export const AUDIENCES = ['ALL', 'STUDENTS', 'TEACHERS', 'PARENTS', 'PROGRAM', 'SECTION'] as const;
export type Audience = (typeof AUDIENCES)[number];

/** Sunday first, the working week in Nepal. Index matches TimeSlot.dayOfWeek. */
export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_UPLOAD_EXTENSIONS = [
  'pdf',
  'docx',
  'pptx',
  'zip',
  'jpg',
  'jpeg',
  'png',
] as const;
