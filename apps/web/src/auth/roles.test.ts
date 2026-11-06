import { ROLES } from '@shikshya/shared';
import { describe, expect, it } from 'vitest';
import { homePathFor, roleLabel } from './roles';

describe('role helpers', () => {
  it('sends each role to its home', () => {
    expect(homePathFor('ADMIN')).toBe('/admin');
    expect(homePathFor('SUPER_ADMIN')).toBe('/admin');
    expect(homePathFor('TEACHER')).toBe('/teacher');
    expect(homePathFor('STUDENT')).toBe('/student');
    expect(homePathFor('PARENT')).toBe('/parent');
    expect(homePathFor('ACCOUNTANT')).toBe('/profile');
  });

  it('has a label for every role', () => {
    for (const role of ROLES) expect(roleLabel(role)).toBeTruthy();
  });
});
