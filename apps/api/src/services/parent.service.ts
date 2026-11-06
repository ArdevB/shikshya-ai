import type { Prisma } from '@prisma/client';
import type {
  PaginationQuery,
  ParentCreateBody,
  ParentLinkBody,
  ParentUpdateBody,
} from '@shikshya/shared';
import { pageArgs, paginated } from '../lib/pagination.js';
import { generateTemporaryPassword, hashPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';

const parentInclude = {
  user: {
    select: { id: true, email: true, firstName: true, lastName: true, phone: true, isActive: true },
  },
  children: {
    select: {
      relation: true,
      student: {
        select: {
          id: true,
          rollNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  },
} as const;

export async function listParents(query: PaginationQuery & { search?: string }) {
  const where: Prisma.ParentWhereInput = query.search
    ? {
        OR: [
          { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
          { user: { lastName: { contains: query.search, mode: 'insensitive' } } },
          { user: { email: { contains: query.search, mode: 'insensitive' } } },
        ],
      }
    : {};
  const [rows, total] = await Promise.all([
    prisma.parent.findMany({
      ...pageArgs(query),
      where,
      include: parentInclude,
      orderBy: { user: { firstName: 'asc' } },
    }),
    prisma.parent.count({ where }),
  ]);
  return paginated(rows, total, query);
}

export const getParent = (id: string) =>
  prisma.parent.findUniqueOrThrow({ where: { id }, include: parentInclude });

export async function createParent(data: ParentCreateBody) {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const parent = await prisma.parent.create({
    data: {
      user: {
        create: { ...data, passwordHash, role: 'PARENT', mustChangePassword: true },
      },
    },
    include: parentInclude,
  });
  return { parent, temporaryPassword };
}

export const updateParent = (id: string, data: ParentUpdateBody) =>
  prisma.parent.update({
    where: { id },
    data: { user: { update: data } },
    include: parentInclude,
  });

export async function deleteParent(id: string) {
  const parent = await prisma.parent.findUniqueOrThrow({ where: { id } });
  await prisma.user.delete({ where: { id: parent.userId } });
}

export const linkChild = (parentId: string, { studentId, relation }: ParentLinkBody) =>
  prisma.parentStudent.upsert({
    where: { parentId_studentId: { parentId, studentId } },
    create: { parentId, studentId, relation },
    update: { relation },
  });

export const unlinkChild = (parentId: string, studentId: string) =>
  prisma.parentStudent.delete({ where: { parentId_studentId: { parentId, studentId } } });

/** The children a parent is linked to, for the child switcher. */
export const listOwnChildren = (userId: string) =>
  prisma.parentStudent.findMany({
    where: { parent: { userId } },
    select: {
      relation: true,
      student: {
        select: {
          id: true,
          rollNumber: true,
          user: { select: { firstName: true, lastName: true } },
          currentSection: {
            select: { name: true, semester: { select: { number: true } } },
          },
          program: { select: { code: true } },
        },
      },
    },
  });
