import { ATTENDANCE_THRESHOLD_PERCENT, type AttendanceStatus } from './enums.js';

export interface AttendanceTally {
  /** Classes that count towards the percentage: PRESENT + LATE + ABSENT. */
  total: number;
  /** Classes the student attended: PRESENT + LATE. */
  attended: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** Rounded to 2 decimals. Null when nothing counts yet, for example only excused classes. */
  percentage: number | null;
  /** True when the percentage is known and below the 75% threshold. */
  belowThreshold: boolean;
}

/**
 * Attendance rule from the spec: LATE counts as present and EXCUSED is left out
 * of the total, so an excused absence neither helps nor hurts the student.
 */
export function calculateAttendance(statuses: readonly AttendanceStatus[]): AttendanceTally {
  const count = (status: AttendanceStatus) => statuses.filter((s) => s === status).length;

  const present = count('PRESENT');
  const late = count('LATE');
  const absent = count('ABSENT');
  const excused = count('EXCUSED');

  const attended = present + late;
  const total = attended + absent;
  const percentage = total === 0 ? null : Math.round((attended / total) * 10000) / 100;

  return {
    total,
    attended,
    present,
    late,
    absent,
    excused,
    percentage,
    belowThreshold: percentage !== null && percentage < ATTENDANCE_THRESHOLD_PERCENT,
  };
}

/**
 * How many classes in a row a student must attend to reach the threshold. It solves
 * (attended + n) / (total + n) >= threshold for the smallest whole n.
 */
export function classesNeededToReachThreshold(attended: number, total: number): number {
  const threshold = ATTENDANCE_THRESHOLD_PERCENT / 100;
  if (total === 0 || attended / total >= threshold) return 0;
  return Math.ceil((threshold * total - attended) / (1 - threshold));
}
