import type { Prisma } from '@prisma/client';
import type { PaginationQuery, TeacherCreateBody, TeacherUpdateBody } from '@shikshya/shared';
import { pageArgs, paginated } from '../lib/pagination.js';
import { generateTemporaryPassword, hashPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';

const teacherInclude = {
  user: {
    select: { id: true, email: true, firstName: true, lastName: true, phone: true, isActive: true },
  },
  department: { select: { id: true, name: true, code: true } },
} as const;

export async function listTeachers(
  query: PaginationQuery & { departmentId?: string; search?: string },
) {
  const where: Prisma.TeacherWhereInput = {
    departmentId: query.departmentId,
    ...(query.search
      ? {
          OR: [
            { employeeCode: { contains: query.search, mode: 'insensitive' } },
            { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
            { user: { lastName: { contains: query.search, mode: 'insensitive' } } },
            { user: { email: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.teacher.findMany({
      ...pageArgs(query),
      where,
      include: teacherInclude,
      orderBy: { user: { firstName: 'asc' } },
    }),
    prisma.teacher.count({ where }),
  ]);
  return paginated(rows, total, query);
}

export const getTeacher = (id: string) =>
  prisma.teacher.findUniqueOrThrow({ where: { id }, include: teacherInclude });

/** Creates the login and the teacher profile together. The temporary password is shown once. */
export async function createTeacher(data: TeacherCreateBody) {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const teacher = await prisma.teacher.create({
    data: {
      employeeCode: data.employeeCode,
      designation: data.designation,
      department: { connect: { id: data.departmentId } },
      user: {
        create: {
          email: data.email,
          passwordHash,
          role: 'TEACHER',
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          mustChangePassword: true,
        },
      },
    },
    include: teacherInclude,
  });
  return { teacher, temporaryPassword };
}

export function updateTeacher(id: string, data: TeacherUpdateBody) {
  return prisma.teacher.update({
    where: { id },
    data: {
      employeeCode: data.employeeCode,
      designation: data.designation,
      department: data.departmentId ? { connect: { id: data.departmentId } } : undefined,
      user: {
        update: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          isActive: data.isActive,
        },
      },
    },
    include: teacherInclude,
  });
}

/** Deleting the user removes the teacher profile by cascade. Blocked while they have offerings. */
export async function deleteTeacher(id: string) {
  const teacher = await prisma.teacher.findUniqueOrThrow({ where: { id } });
  await prisma.user.delete({ where: { id: teacher.userId } });
}
