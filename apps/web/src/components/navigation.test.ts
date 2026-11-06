import { ROLES } from '@shikshya/shared';
import { describe, expect, it } from 'vitest';
import { findNavTrail, navGroups, primaryNav } from './navigation';

describe('navigation', () => {
  it('gives every role a profile link and no duplicate addresses', () => {
    for (const role of ROLES) {
      const paths = navGroups(role).flatMap((group) => group.items.map((item) => item.to));
      expect(paths).toContain('/profile');
      expect(new Set(paths).size).toBe(paths.length);
    }
  });

  it('shows only a super admin the institution settings', () => {
    const has = (role: (typeof ROLES)[number]) =>
      navGroups(role).some((group) => group.items.some((item) => item.to === '/admin/settings'));
    expect(has('SUPER_ADMIN')).toBe(true);
    expect(has('ADMIN')).toBe(false);
    expect(has('STUDENT')).toBe(false);
  });

  it('never offers one role another role’s area', () => {
    const paths = (role: (typeof ROLES)[number]) =>
      navGroups(role).flatMap((group) => group.items.map((item) => item.to));
    expect(paths('STUDENT').some((p) => /^\/(admin|teacher|finance|parent)/.test(p))).toBe(false);
    expect(paths('PARENT').some((p) => /^\/(admin|teacher|finance|student)/.test(p))).toBe(false);
    expect(paths('TEACHER').some((p) => /^\/(admin|finance|student|parent)/.test(p))).toBe(false);
    expect(paths('ACCOUNTANT').some((p) => /^\/(admin|teacher|student|parent)/.test(p))).toBe(
      false,
    );
  });

  it('gives the main roles four places on the phone bar, all of which exist', () => {
    for (const role of [
      'SUPER_ADMIN',
      'ADMIN',
      'ACCOUNTANT',
      'TEACHER',
      'STUDENT',
      'PARENT',
    ] as const) {
      expect(primaryNav(role)).toHaveLength(4);
    }
    expect(primaryNav('LIBRARIAN')).toEqual([]);
  });

  it('finds where a page sits, preferring the closest match', () => {
    expect(findNavTrail('ADMIN', '/admin')?.item.label).toBe('Dashboard');
    expect(findNavTrail('ADMIN', '/admin/students')?.item.label).toBe('Students');
    expect(findNavTrail('ADMIN', '/admin/exams/abc123')?.item.label).toBe('Exams');
    expect(findNavTrail('ADMIN', '/admin/exams/abc123')?.group.label).toBe('Schedule & exams');
    expect(findNavTrail('STUDENT', '/nowhere')).toBeNull();
  });
});
