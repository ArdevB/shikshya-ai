import { describe, expect, it } from 'vitest';
import { calculateAttendance, classesNeededToReachThreshold } from './attendance.js';

describe('calculateAttendance', () => {
  it('returns a null percentage when there are no classes', () => {
    const result = calculateAttendance([]);
    expect(result.percentage).toBeNull();
    expect(result.total).toBe(0);
    expect(result.belowThreshold).toBe(false);
  });

  it('counts PRESENT as attended', () => {
    expect(calculateAttendance(['PRESENT', 'PRESENT']).percentage).toBe(100);
  });

  it('counts LATE as present', () => {
    const result = calculateAttendance(['LATE', 'PRESENT', 'ABSENT', 'ABSENT']);
    expect(result.attended).toBe(2);
    expect(result.total).toBe(4);
    expect(result.percentage).toBe(50);
  });

  it('excludes EXCUSED from the total', () => {
    const result = calculateAttendance(['PRESENT', 'ABSENT', 'EXCUSED', 'EXCUSED']);
    expect(result.total).toBe(2);
    expect(result.excused).toBe(2);
    expect(result.percentage).toBe(50);
  });

  it('gives a null percentage when every class is excused', () => {
    const result = calculateAttendance(['EXCUSED', 'EXCUSED']);
    expect(result.percentage).toBeNull();
    expect(result.belowThreshold).toBe(false);
  });

  it('rounds to 2 decimals', () => {
    expect(calculateAttendance(['PRESENT', 'PRESENT', 'ABSENT']).percentage).toBe(66.67);
  });

  it('treats exactly 75% as not below the threshold', () => {
    const result = calculateAttendance(['PRESENT', 'PRESENT', 'PRESENT', 'ABSENT']);
    expect(result.percentage).toBe(75);
    expect(result.belowThreshold).toBe(false);
  });

  it('flags anything under 75%', () => {
    const statuses = [
      ...Array<'PRESENT'>(74).fill('PRESENT'),
      ...Array<'ABSENT'>(26).fill('ABSENT'),
    ];
    const result = calculateAttendance(statuses);
    expect(result.percentage).toBe(74);
    expect(result.belowThreshold).toBe(true);
  });
});

describe('classesNeededToReachThreshold', () => {
  it('is zero at or above the threshold, and with no classes yet', () => {
    expect(classesNeededToReachThreshold(3, 4)).toBe(0);
    expect(classesNeededToReachThreshold(4, 4)).toBe(0);
    expect(classesNeededToReachThreshold(0, 0)).toBe(0);
  });

  it('works out the classes needed', () => {
    // 17 of 25 is 68%. After 3 more, 20 of 28 is 71%. After 7, 24 of 32 is exactly 75%.
    expect(classesNeededToReachThreshold(17, 25)).toBe(7);
    expect(classesNeededToReachThreshold(0, 1)).toBe(3);
  });

  it('really does reach the threshold, and one fewer does not', () => {
    for (const [attended, total] of [[17, 25], [10, 30], [1, 2], [29, 40]] as const) {
      const needed = classesNeededToReachThreshold(attended, total);
      expect((attended + needed) / (total + needed)).toBeGreaterThanOrEqual(0.75);
      expect((attended + needed - 1) / (total + needed - 1)).toBeLessThan(0.75);
    }
  });
});
