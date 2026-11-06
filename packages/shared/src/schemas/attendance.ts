import { z } from 'zod';
import { ATTENDANCE_STATUSES } from '../enums.js';
import type { AttendanceTally } from '../attendance.js';
import { dateString, paginationQuery } from './common.js';

export const attendanceRecordInput = z.object({
  studentId: z.string().min(1),
  status: z.enum(ATTENDANCE_STATUSES),
  remark: z.string().trim().max(255).optional(),
});
export type AttendanceRecordInput = z.infer<typeof attendanceRecordInput>;

export const attendanceSessionBody = z.object({
  offeringId: z.string().min(1, 'Choose a class'),
  date: dateString,
  period: z.coerce.number().int().min(1).max(12).optional(),
  records: z.array(attendanceRecordInput).min(1, 'Mark at least one student'),
});
export type AttendanceSessionBody = z.infer<typeof attendanceSessionBody>;

export const attendanceSessionUpdateBody = z.object({
  records: z.array(attendanceRecordInput).min(1, 'Mark at least one student'),
});
export type AttendanceSessionUpdateBody = z.infer<typeof attendanceSessionUpdateBody>;

export const attendanceSessionListQuery = paginationQuery.extend({
  offeringId: z.string().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
});

export interface StudentCourseAttendance extends AttendanceTally {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  teacherName: string;
}

export interface StudentAttendanceSummary {
  studentId: string;
  studentName: string;
  rollNumber: string;
  courses: StudentCourseAttendance[];
}

export interface OfferingStudentAttendance extends AttendanceTally {
  studentId: string;
  rollNumber: string;
  studentName: string;
}

export interface OfferingAttendanceReport {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  sectionName: string;
  sessionCount: number;
  students: OfferingStudentAttendance[];
}
