import { describe, expect, it } from 'vitest';
import {
  calculateCgpa,
  calculateGpa,
  gradeCourse,
  gradeForPercent,
  type GradeBand,
} from './grading.js';

const TU_SCALE: GradeBand[] = [
  { minPercent: 90, maxPercent: 100, grade: 'A', gradePoint: 4.0 },
  { minPercent: 80, maxPercent: 90, grade: 'A-', gradePoint: 3.7 },
  { minPercent: 70, maxPercent: 80, grade: 'B+', gradePoint: 3.3 },
  { minPercent: 60, maxPercent: 70, grade: 'B', gradePoint: 3.0 },
  { minPercent: 50, maxPercent: 60, grade: 'B-', gradePoint: 2.7 },
  { minPercent: 40, maxPercent: 50, grade: 'C', gradePoint: 2.3 },
  { minPercent: 0, maxPercent: 40, grade: 'F', gradePoint: 0 },
];

const paper = (marksObtained: number | null, fullMarks = 100, passMarks = 40) => ({
  marksObtained,
  fullMarks,
  passMarks,
});

describe('gradeForPercent', () => {
  it.each([
    [100, 'A'],
    [90, 'A'],
    [89.99, 'A-'],
    [80, 'A-'],
    [70, 'B+'],
    [60, 'B'],
    [50, 'B-'],
    [40, 'C'],
    [39.99, 'F'],
    [0, 'F'],
  ])('%d%% is %s', (percent, grade) => {
    expect(gradeForPercent(percent, TU_SCALE).grade).toBe(grade);
  });

  it('throws if the table has a gap', () => {
    expect(() => gradeForPercent(50, [TU_SCALE[0]!])).toThrow('no band');
  });
});

describe('gradeCourse', () => {
  const course = (papers: ReturnType<typeof paper>[]) => ({
    courseId: 'c',
    creditHours: 3,
    papers,
  });

  it('grades one paper', () => {
    expect(gradeCourse(course([paper(75)]), TU_SCALE)).toMatchObject({
      percent: 75,
      grade: 'B+',
      gradePoint: 3.3,
      passed: true,
    });
  });

  it('combines several papers by total marks, not by averaging percentages', () => {
    // 18/20 and 60/80: 78/100, although the two percentages (90 and 75) would average 82.5.
    const result = gradeCourse(course([paper(18, 20, 8), paper(60, 80, 32)]), TU_SCALE);
    expect(result.percent).toBe(78);
    expect(result.grade).toBe('B+');
  });

  it('fails a course below the pass marks', () => {
    expect(gradeCourse(course([paper(39)]), TU_SCALE)).toMatchObject({
      grade: 'F',
      gradePoint: 0,
      passed: false,
    });
  });

  it('fails on pass marks even when the percentage alone would earn a grade', () => {
    // 45% would be a C on the scale, but this paper's pass mark is 50.
    expect(gradeCourse(course([paper(45, 100, 50)]), TU_SCALE)).toMatchObject({
      percent: 45,
      grade: 'F',
      gradePoint: 0,
      passed: false,
    });
  });

  it('treats an absent student as zero and fails them', () => {
    expect(gradeCourse(course([paper(null)]), TU_SCALE)).toMatchObject({
      percent: 0,
      grade: 'F',
      gradePoint: 0,
      passed: false,
    });
  });

  it('counts an absence in one paper against the total', () => {
    // Absent for 20 marks, 70/80 in the other: 70/100.
    const result = gradeCourse(course([paper(null, 20, 8), paper(70, 80, 32)]), TU_SCALE);
    expect(result.percent).toBe(70);
    expect(result.grade).toBe('B+');
  });

  it('passes at exactly the pass marks', () => {
    expect(gradeCourse(course([paper(40)]), TU_SCALE)).toMatchObject({ grade: 'C', passed: true });
  });
});

describe('calculateGpa, worked by hand', () => {
  it('weights by credit hours', () => {
    // (4.0 x 3 + 3.0 x 1) / 4 = 15 / 4 = 3.75
    expect(
      calculateGpa([
        { gradePoint: 4, creditHours: 3 },
        { gradePoint: 3, creditHours: 1 },
      ]),
    ).toBe(3.75);
  });

  it('includes a failed course at zero points', () => {
    // (3.3 x 3 + 0 x 3 + 4.0 x 3) / 9 = 21.9 / 9 = 2.4333 => 2.43
    expect(
      calculateGpa([
        { gradePoint: 3.3, creditHours: 3 },
        { gradePoint: 0, creditHours: 3 },
        { gradePoint: 4, creditHours: 3 },
      ]),
    ).toBe(2.43);
  });

  it('gives a full semester with an absent student the right GPA', () => {
    // A student with B+ (75), A (92), absent, B (65), each 3 credits:
    // (3.3 + 4.0 + 0 + 3.0) x 3 / 12 = 30.9 / 12 = 2.575 => 2.58
    const graded = [paper(75), paper(92), paper(null), paper(65)].map((p, i) =>
      gradeCourse({ courseId: String(i), creditHours: 3, papers: [p] }, TU_SCALE),
    );
    expect(graded.map((g) => g.grade)).toEqual(['B+', 'A', 'F', 'B']);
    expect(calculateGpa(graded)).toBe(2.58);
  });

  it('is zero with no credits', () => {
    expect(calculateGpa([])).toBe(0);
  });
});

describe('calculateCgpa, worked by hand', () => {
  it('weights each semester by its credits', () => {
    // (3.5 x 15 + 3.0 x 18) / 33 = 106.5 / 33 = 3.2272 => 3.23
    expect(
      calculateCgpa([
        { gpa: 3.5, totalCredits: 15 },
        { gpa: 3.0, totalCredits: 18 },
      ]),
    ).toBe(3.23);
  });

  it('is zero with no published semesters', () => {
    expect(calculateCgpa([])).toBe(0);
  });
});
