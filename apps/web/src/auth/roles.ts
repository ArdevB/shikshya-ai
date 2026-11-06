import type { Role } from '@shikshya/shared';

/** Where each role lands after logging in. */
export function homePathFor(role: Role) {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
      return '/admin';
    case 'TEACHER':
      return '/teacher';
    case 'STUDENT':
      return '/student';
    case 'PARENT':
      return '/parent';
    case 'ACCOUNTANT':
      return '/finance';
    default:
      // Librarians have no screens of their own yet.
      return '/profile';
  }
}

export const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN'];
export const FINANCE_ROLES: Role[] = ['ACCOUNTANT', ...ADMIN_ROLES];

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Admin',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
  PARENT: 'Parent',
  ACCOUNTANT: 'Accountant',
  LIBRARIAN: 'Librarian',
};

export const roleLabel = (role: Role) => ROLE_LABELS[role];
