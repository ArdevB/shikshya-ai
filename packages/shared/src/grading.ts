/**
 * The GPA rules, as pure functions so they can be unit tested against worked examples.
 * The grade table itself lives in the database (GradeScale) and is passed in.
 */

export interface GradeBand {
  minPercent: number;
  /** Exclusive, except for the top band, which includes 100. */
  maxPercent: number;
  grade: string;
  gradePoint: number;
}

export const FAIL_GRADE = 'F';

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Finds the band a percentage falls in. Throws if the table has a gap, so a bad table is noticed. */
export function gradeForPercent(percent: number, scale: readonly GradeBand[]): GradeBand {
  const top = Math.max(...scale.map((band) => band.maxPercent));
  const band = scale.find(
    (b) =>
      percent >= b.minPercent &&
      (percent < b.maxPercent || (b.maxPercent === top && percent === top)),
  );
  if (!band) throw new Error(`The grade scale has no band for ${percent}%`);
  return band;
}

export interface CourseMarks {
  courseId: string;
  creditHours: number;
  /** One entry per published exam paper in this course. Null marks mean the student was absent. */
  papers: { marksObtained: number | null; fullMarks: number; passMarks: number }[];
}

export interface GradedCourse {
  courseId: string;
  creditHours: number;
  percent: number;
  grade: string;
  gradePoint: number;
  passed: boolean;
}

/**
 * Percent = all marks obtained / all full marks, across the published papers in the course.
 * The student must also reach the combined pass marks, otherwise the course is an F whatever
 * the percentage. An absence counts as zero.
 */
export function gradeCourse(course: CourseMarks, scale: readonly GradeBand[]): GradedCourse {
  const obtained = course.papers.reduce((sum, p) => sum + (p.marksObtained ?? 0), 0);
  const full = course.papers.reduce((sum, p) => sum + p.fullMarks, 0);
  const pass = course.papers.reduce((sum, p) => sum + p.passMarks, 0);

  const percent = full === 0 ? 0 : round2((obtained / full) * 100);
  const band = gradeForPercent(percent, scale);
  const passed = obtained >= pass && band.gradePoint > 0;

  return {
    courseId: course.courseId,
    creditHours: course.creditHours,
    percent,
    grade: passed ? band.grade : FAIL_GRADE,
    gradePoint: passed ? band.gradePoint : 0,
    passed,
  };
}

/** GPA = sum of (grade point x credit) / sum of credits, rounded to 2 decimals. */
export function calculateGpa(courses: readonly { gradePoint: number; creditHours: number }[]) {
  const credits = courses.reduce((sum, c) => sum + c.creditHours, 0);
  if (credits === 0) return 0;
  const points = courses.reduce((sum, c) => sum + c.gradePoint * c.creditHours, 0);
  return round2(points / credits);
}

/**
 * CGPA weights each semester's GPA by its credits, which gives the same answer as
 * applying the GPA formula to every course taken.
 */
export function calculateCgpa(semesters: readonly { gpa: number; totalCredits: number }[]) {
  const credits = semesters.reduce((sum, s) => sum + s.totalCredits, 0);
  if (credits === 0) return 0;
  const points = semesters.reduce((sum, s) => sum + s.gpa * s.totalCredits, 0);
  return round2(points / credits);
}
