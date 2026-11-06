/**
 * Row-level access rules: which records a user may touch, on top of their role.
 * Services call these, so the rule holds however the service is reached.
 */
import { forbidden } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import type { CurrentUser } from '../middleware/auth.js';

export const isAdmin = (user: CurrentUser) => user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

/** Does this user's own teacher profile teach this offering? */
export async function teachesOffering(user: CurrentUser, offeringId: string): Promise<boolean> {
  if (user.role !== 'TEACHER') return false;
  const match = await prisma.courseOffering.findFirst({
    where: { id: offeringId, teacher: { userId: user.id } },
    select: { id: true },
  });
  return match !== null;
}

/**
 * A student sees only themselves, a parent only their linked children, and a teacher
 * only students in sections they teach. Admins see everyone; other roles see no one.
 */
export async function canAccessStudent(user: CurrentUser, studentId: string): Promise<boolean> {
  switch (user.role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
      return true;
    case 'STUDENT': {
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { userId: true },
      });
      return student?.userId === user.id;
    }
    case 'PARENT': {
      const link = await prisma.parentStudent.findFirst({
        where: { studentId, parent: { userId: user.id } },
        select: { studentId: true },
      });
      return link !== null;
    }
    case 'TEACHER': {
      const match = await prisma.enrollment.findFirst({
        where: {
          studentId,
          section: { offerings: { some: { teacher: { userId: user.id } } } },
        },
        select: { id: true },
      });
      return match !== null;
    }
    default:
      return false;
  }
}

export const isFinanceStaff = (user: CurrentUser) => user.role === 'ACCOUNTANT' || isAdmin(user);

/** Fees: the student, their parents, and the accounts office. Teachers have no reason to see them. */
export async function canAccessFinance(user: CurrentUser, studentId: string) {
  if (isFinanceStaff(user)) return true;
  if (user.role === 'STUDENT' || user.role === 'PARENT') return canAccessStudent(user, studentId);
  return false;
}

export async function assertCanAccessStudent(user: CurrentUser, studentId: string) {
  if (!(await canAccessStudent(user, studentId))) throw forbidden();
}

/** Admins may view any offering; a teacher only those they teach. */
export async function assertCanViewOffering(user: CurrentUser, offeringId: string) {
  if (isAdmin(user)) return;
  if (!(await teachesOffering(user, offeringId))) throw forbidden();
}
