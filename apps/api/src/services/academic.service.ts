import type {
  AcademicYearBody,
  CourseBody,
  CourseOfferingBody,
  DepartmentBody,
  PaginationQuery,
  ProgramBody,
  SectionBody,
  SemesterBody,
} from '@shikshya/shared';
import type { Prisma } from '@prisma/client';
import { badRequest } from '../lib/errors.js';
import { pageArgs, paginated } from '../lib/pagination.js';
import { prisma } from '../lib/prisma.js';

/** Runs the page query and the total count together and wraps them up. */
async function listPage<T>(
  query: PaginationQuery,
  find: (args: { skip: number; take: number }) => Promise<T[]>,
  count: () => Promise<number>,
) {
  const [rows, total] = await Promise.all([find(pageArgs(query)), count()]);
  return paginated(rows, total, query);
}

// ---------- Departments ----------

export const departments = {
  list: (query: PaginationQuery) =>
    listPage(
      query,
      (page) => prisma.department.findMany({ ...page, orderBy: { name: 'asc' } }),
      () => prisma.department.count(),
    ),
  get: (id: string) => prisma.department.findUniqueOrThrow({ where: { id } }),
  create: (data: DepartmentBody) => prisma.department.create({ data }),
  update: (id: string, data: DepartmentBody) => prisma.department.update({ where: { id }, data }),
  remove: (id: string) => prisma.department.delete({ where: { id } }),
};

// ---------- Programs ----------

const programInclude = { department: { select: { id: true, name: true, code: true } } } as const;

export const programs = {
  list: (query: PaginationQuery & { departmentId?: string }) => {
    const where: Prisma.ProgramWhereInput = { departmentId: query.departmentId };
    return listPage(
      query,
      (page) =>
        prisma.program.findMany({
          ...page,
          where,
          include: programInclude,
          orderBy: { name: 'asc' },
        }),
      () => prisma.program.count({ where }),
    );
  },
  get: (id: string) => prisma.program.findUniqueOrThrow({ where: { id }, include: programInclude }),
  create: (data: ProgramBody) => prisma.program.create({ data, include: programInclude }),
  update: (id: string, data: ProgramBody) =>
    prisma.program.update({ where: { id }, data, include: programInclude }),
  remove: (id: string) => prisma.program.delete({ where: { id } }),
};

// ---------- Academic years ----------

const yearData = (data: AcademicYearBody) => ({
  ...data,
  startDate: new Date(data.startDate),
  endDate: new Date(data.endDate),
});

export const academicYears = {
  list: (query: PaginationQuery) =>
    listPage(
      query,
      (page) => prisma.academicYear.findMany({ ...page, orderBy: { startDate: 'desc' } }),
      () => prisma.academicYear.count(),
    ),
  get: (id: string) => prisma.academicYear.findUniqueOrThrow({ where: { id } }),
  /** Only one year can be current, so setting one clears the others in the same transaction. */
  create: (data: AcademicYearBody) =>
    prisma.$transaction(async (tx) => {
      if (data.isCurrent) await tx.academicYear.updateMany({ data: { isCurrent: false } });
      return tx.academicYear.create({ data: yearData(data) });
    }),
  update: (id: string, data: AcademicYearBody) =>
    prisma.$transaction(async (tx) => {
      if (data.isCurrent) {
        await tx.academicYear.updateMany({
          where: { id: { not: id } },
          data: { isCurrent: false },
        });
      }
      return tx.academicYear.update({ where: { id }, data: yearData(data) });
    }),
  remove: (id: string) => prisma.academicYear.delete({ where: { id } }),
};

// ---------- Semesters ----------

const semesterInclude = {
  program: { select: { id: true, name: true, code: true } },
  academicYear: { select: { id: true, name: true } },
} as const;

async function assertSemesterFitsProgram(data: SemesterBody) {
  const program = await prisma.program.findUniqueOrThrow({ where: { id: data.programId } });
  if (data.number > program.durationSemesters) {
    throw badRequest(
      `${program.name} has ${program.durationSemesters} semesters, so semester ${data.number} is not valid`,
    );
  }
}

const semesterData = (data: SemesterBody) => ({
  ...data,
  startDate: new Date(data.startDate),
  endDate: new Date(data.endDate),
});

export const semesters = {
  list: (query: PaginationQuery & { programId?: string; academicYearId?: string }) => {
    const where: Prisma.SemesterWhereInput = {
      programId: query.programId,
      academicYearId: query.academicYearId,
    };
    return listPage(
      query,
      (page) =>
        prisma.semester.findMany({
          ...page,
          where,
          include: semesterInclude,
          orderBy: [{ program: { code: 'asc' } }, { number: 'asc' }],
        }),
      () => prisma.semester.count({ where }),
    );
  },
  get: (id: string) =>
    prisma.semester.findUniqueOrThrow({ where: { id }, include: semesterInclude }),
  create: async (data: SemesterBody) => {
    await assertSemesterFitsProgram(data);
    return prisma.semester.create({ data: semesterData(data), include: semesterInclude });
  },
  update: async (id: string, data: SemesterBody) => {
    await assertSemesterFitsProgram(data);
    return prisma.semester.update({
      where: { id },
      data: semesterData(data),
      include: semesterInclude,
    });
  },
  remove: (id: string) => prisma.semester.delete({ where: { id } }),
};

// ---------- Sections ----------

const sectionInclude = {
  semester: {
    select: {
      id: true,
      number: true,
      program: { select: { id: true, name: true, code: true } },
      academicYear: { select: { id: true, name: true } },
    },
  },
} as const;

export const sections = {
  list: (query: PaginationQuery & { semesterId?: string; programId?: string }) => {
    const where: Prisma.SectionWhereInput = {
      semesterId: query.semesterId,
      semester: query.programId ? { programId: query.programId } : undefined,
    };
    return listPage(
      query,
      (page) =>
        prisma.section.findMany({
          ...page,
          where,
          include: sectionInclude,
          orderBy: [
            { semester: { program: { code: 'asc' } } },
            { semester: { number: 'asc' } },
            { name: 'asc' },
          ],
        }),
      () => prisma.section.count({ where }),
    );
  },
  get: (id: string) => prisma.section.findUniqueOrThrow({ where: { id }, include: sectionInclude }),
  create: (data: SectionBody) => prisma.section.create({ data, include: sectionInclude }),
  update: (id: string, data: SectionBody) =>
    prisma.section.update({ where: { id }, data, include: sectionInclude }),
  remove: (id: string) => prisma.section.delete({ where: { id } }),
};

// ---------- Courses ----------

const courseInclude = { program: { select: { id: true, name: true, code: true } } } as const;

export const courses = {
  list: (query: PaginationQuery & { programId?: string; semesterNumber?: number }) => {
    const where: Prisma.CourseWhereInput = {
      programId: query.programId,
      semesterNumber: query.semesterNumber,
    };
    return listPage(
      query,
      (page) =>
        prisma.course.findMany({
          ...page,
          where,
          include: courseInclude,
          orderBy: [{ semesterNumber: 'asc' }, { code: 'asc' }],
        }),
      () => prisma.course.count({ where }),
    );
  },
  get: (id: string) => prisma.course.findUniqueOrThrow({ where: { id }, include: courseInclude }),
  create: (data: CourseBody) => prisma.course.create({ data, include: courseInclude }),
  update: (id: string, data: CourseBody) =>
    prisma.course.update({ where: { id }, data, include: courseInclude }),
  remove: (id: string) => prisma.course.delete({ where: { id } }),
};

// ---------- Course offerings ----------

const offeringInclude = {
  course: { select: { id: true, code: true, title: true, creditHours: true, programId: true } },
  section: { include: sectionInclude },
  teacher: {
    select: {
      id: true,
      employeeCode: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
} as const;

/** A course may only be offered to a section of the same program and semester number. */
async function assertOfferingIsConsistent(data: CourseOfferingBody) {
  const [course, section] = await Promise.all([
    prisma.course.findUniqueOrThrow({ where: { id: data.courseId } }),
    prisma.section.findUniqueOrThrow({
      where: { id: data.sectionId },
      include: { semester: true },
    }),
  ]);
  if (course.programId !== section.semester.programId) {
    throw badRequest('This course belongs to a different program than the section');
  }
  if (course.semesterNumber !== section.semester.number) {
    throw badRequest(
      `This course is for semester ${course.semesterNumber}, but the section is in semester ${section.semester.number}`,
    );
  }
}

export const courseOfferings = {
  list: (
    query: PaginationQuery & { sectionId?: string; teacherId?: string; courseId?: string },
  ) => {
    const where: Prisma.CourseOfferingWhereInput = {
      sectionId: query.sectionId,
      teacherId: query.teacherId,
      courseId: query.courseId,
    };
    return listPage(
      query,
      (page) =>
        prisma.courseOffering.findMany({
          ...page,
          where,
          include: offeringInclude,
          orderBy: [{ section: { name: 'asc' } }, { course: { code: 'asc' } }],
        }),
      () => prisma.courseOffering.count({ where }),
    );
  },
  get: (id: string) =>
    prisma.courseOffering.findUniqueOrThrow({ where: { id }, include: offeringInclude }),
  create: async (data: CourseOfferingBody) => {
    await assertOfferingIsConsistent(data);
    return prisma.courseOffering.create({ data, include: offeringInclude });
  },
  update: async (id: string, data: CourseOfferingBody) => {
    await assertOfferingIsConsistent(data);
    return prisma.courseOffering.update({ where: { id }, data, include: offeringInclude });
  },
  remove: (id: string) => prisma.courseOffering.delete({ where: { id } }),
};
