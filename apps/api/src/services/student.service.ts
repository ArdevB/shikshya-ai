import type { Prisma } from '@prisma/client';
import {
  STUDENT_CSV_COLUMNS,
  studentCsvRow,
  type CsvRowError,
  type PaginationQuery,
  type StudentCreateBody,
  type StudentCsvRow,
  type StudentImportResult,
  type StudentUpdateBody,
} from '@shikshya/shared';
import { parse as parseCsv } from 'csv-parse/sync';
import { badRequest } from '../lib/errors.js';
import { pageArgs, paginated } from '../lib/pagination.js';
import { generateTemporaryPassword, hashPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';

const studentInclude = {
  user: {
    select: { id: true, email: true, firstName: true, lastName: true, phone: true, isActive: true },
  },
  program: { select: { id: true, name: true, code: true } },
  currentSection: {
    select: {
      id: true,
      name: true,
      semester: { select: { id: true, number: true } },
    },
  },
} as const;

const toDate = (value: string | undefined) => (value ? new Date(value) : undefined);

export async function listStudents(
  query: PaginationQuery & { programId?: string; sectionId?: string; search?: string },
) {
  const where: Prisma.StudentWhereInput = {
    programId: query.programId,
    currentSectionId: query.sectionId,
    ...(query.search
      ? {
          OR: [
            { rollNumber: { contains: query.search, mode: 'insensitive' } },
            { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
            { user: { lastName: { contains: query.search, mode: 'insensitive' } } },
            { user: { email: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.student.findMany({
      ...pageArgs(query),
      where,
      include: studentInclude,
      orderBy: { rollNumber: 'asc' },
    }),
    prisma.student.count({ where }),
  ]);
  return paginated(rows, total, query);
}

export const getStudent = (id: string) =>
  prisma.student.findUniqueOrThrow({ where: { id }, include: studentInclude });

async function assertSectionInProgram(sectionId: string, programId: string) {
  const section = await prisma.section.findUniqueOrThrow({
    where: { id: sectionId },
    include: { semester: true },
  });
  if (section.semester.programId !== programId) {
    throw badRequest('This section belongs to a different program');
  }
}

/** Creates the login, the student profile and the enrollment together. */
export async function createStudent(data: StudentCreateBody) {
  await assertSectionInProgram(data.currentSectionId, data.programId);

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const student = await prisma.student.create({
    data: {
      rollNumber: data.rollNumber,
      registrationNumber: data.registrationNumber,
      admissionDate: new Date(data.admissionDate),
      dateOfBirth: toDate(data.dateOfBirth),
      address: data.address,
      guardianName: data.guardianName,
      guardianPhone: data.guardianPhone,
      program: { connect: { id: data.programId } },
      currentSection: { connect: { id: data.currentSectionId } },
      enrollments: { create: { sectionId: data.currentSectionId } },
      user: {
        create: {
          email: data.email,
          passwordHash,
          role: 'STUDENT',
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          mustChangePassword: true,
        },
      },
    },
    include: studentInclude,
  });
  return { student, temporaryPassword };
}

export async function updateStudent(id: string, data: StudentUpdateBody) {
  const existing = await prisma.student.findUniqueOrThrow({ where: { id } });
  const programId = data.programId ?? existing.programId;
  const sectionId = data.currentSectionId ?? existing.currentSectionId;
  await assertSectionInProgram(sectionId, programId);

  return prisma.$transaction(async (tx) => {
    // Moving section ends the old enrollment and starts (or reopens) one for the new section.
    if (sectionId !== existing.currentSectionId) {
      await tx.enrollment.updateMany({
        where: { studentId: id, sectionId: existing.currentSectionId },
        data: { status: 'COMPLETED' },
      });
      await tx.enrollment.upsert({
        where: { studentId_sectionId: { studentId: id, sectionId } },
        create: { studentId: id, sectionId },
        update: { status: 'ACTIVE' },
      });
    }

    return tx.student.update({
      where: { id },
      data: {
        rollNumber: data.rollNumber,
        registrationNumber: data.registrationNumber,
        program: data.programId ? { connect: { id: data.programId } } : undefined,
        currentSection: data.currentSectionId
          ? { connect: { id: data.currentSectionId } }
          : undefined,
        admissionDate: toDate(data.admissionDate),
        dateOfBirth: toDate(data.dateOfBirth),
        address: data.address,
        guardianName: data.guardianName,
        guardianPhone: data.guardianPhone,
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
      include: studentInclude,
    });
  });
}

/** Removes the login; the profile, enrollments and attendance records go with it by cascade. */
export async function deleteStudent(id: string) {
  const student = await prisma.student.findUniqueOrThrow({ where: { id } });
  await prisma.user.delete({ where: { id: student.userId } });
}

// ---------- CSV import ----------

/** The result of parsing a file, before anything has been checked against the database. */
export function parseStudentCsv(content: string) {
  let raw: Record<string, string>[];
  try {
    raw = parseCsv(content, {
      columns: (header: string[]) => header.map((h) => h.trim()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];
  } catch (error) {
    throw badRequest(`Could not read this CSV file: ${(error as Error).message}`);
  }

  if (raw.length === 0) throw badRequest('This CSV file has no student rows');

  const required = [
    'email',
    'firstName',
    'lastName',
    'rollNumber',
    'programCode',
    'semesterNumber',
    'sectionName',
    'admissionDate',
  ];
  const missing = required.filter((column) => !(column in (raw[0] as object)));
  if (missing.length > 0) {
    throw badRequest(
      `This CSV file is missing the column(s): ${missing.join(', ')}. Expected columns: ${STUDENT_CSV_COLUMNS.join(', ')}`,
    );
  }

  const errors: CsvRowError[] = [];
  const rows: { row: number; data: StudentCsvRow }[] = [];

  raw.forEach((record, index) => {
    const row = index + 2; // +1 for zero-based, +1 for the header line.
    const parsed = studentCsvRow.safeParse(record);
    if (parsed.success) {
      rows.push({ row, data: parsed.data });
    } else {
      for (const issue of parsed.error.issues) {
        errors.push({ row, field: issue.path.join('.'), message: issue.message });
      }
    }
  });

  return { rows, errors, total: raw.length };
}

/**
 * Validates every row and reports every problem it finds. Only when the whole file is
 * clean are the students inserted, in one transaction: all of them or none.
 */
export async function importStudents(content: string): Promise<StudentImportResult> {
  const { rows, errors } = parseStudentCsv(content);

  // Duplicates inside the file itself.
  const firstSeen = (field: 'email' | 'rollNumber') => {
    const seen = new Map<string, number>();
    for (const { row, data } of rows) {
      const earlier = seen.get(data[field]);
      if (earlier !== undefined) {
        errors.push({ row, field, message: `Same ${field} as row ${earlier}` });
      } else {
        seen.set(data[field], row);
      }
    }
  };
  firstSeen('email');
  firstSeen('rollNumber');

  // Duplicates against students who already exist.
  const [existingUsers, existingStudents] = await Promise.all([
    prisma.user.findMany({
      where: { email: { in: rows.map((r) => r.data.email) } },
      select: { email: true },
    }),
    prisma.student.findMany({
      where: { rollNumber: { in: rows.map((r) => r.data.rollNumber) } },
      select: { rollNumber: true },
    }),
  ]);
  const takenEmails = new Set(existingUsers.map((u) => u.email));
  const takenRolls = new Set(existingStudents.map((s) => s.rollNumber));

  // Find each row's section: program code + semester number + section name, in the current year.
  const sections = await prisma.section.findMany({
    where: { semester: { academicYear: { isCurrent: true } } },
    include: { semester: { include: { program: true } } },
  });
  const sectionKey = (programCode: string, semesterNumber: number, sectionName: string) =>
    `${programCode.toUpperCase()}|${semesterNumber}|${sectionName.toUpperCase()}`;
  const sectionByKey = new Map(
    sections.map((s) => [sectionKey(s.semester.program.code, s.semester.number, s.name), s]),
  );
  const programCodes = new Set(sections.map((s) => s.semester.program.code));

  for (const { row, data } of rows) {
    if (takenEmails.has(data.email)) {
      errors.push({ row, field: 'email', message: 'An account with this email already exists' });
    }
    if (takenRolls.has(data.rollNumber)) {
      errors.push({
        row,
        field: 'rollNumber',
        message: 'A student with this roll number already exists',
      });
    }
    if (!programCodes.has(data.programCode.toUpperCase())) {
      errors.push({
        row,
        field: 'programCode',
        message: `No program "${data.programCode}" has sections in the current academic year`,
      });
    } else if (
      !sectionByKey.has(sectionKey(data.programCode, data.semesterNumber, data.sectionName))
    ) {
      errors.push({
        row,
        field: 'sectionName',
        message: `${data.programCode} semester ${data.semesterNumber} has no section "${data.sectionName}" in the current academic year`,
      });
    }
  }

  if (errors.length > 0) {
    errors.sort((a, b) => a.row - b.row);
    return { created: 0, errors, credentials: [] };
  }

  const prepared = await Promise.all(
    rows.map(async ({ data }) => {
      const temporaryPassword = generateTemporaryPassword();
      return { data, temporaryPassword, passwordHash: await hashPassword(temporaryPassword) };
    }),
  );

  await prisma.$transaction(
    async (tx) => {
      for (const { data, passwordHash } of prepared) {
        // Checked above, so the lookup always finds a section.
        const section = sectionByKey.get(
          sectionKey(data.programCode, data.semesterNumber, data.sectionName),
        )!;
        await tx.student.create({
          data: {
            rollNumber: data.rollNumber,
            registrationNumber: data.registrationNumber,
            admissionDate: new Date(data.admissionDate),
            dateOfBirth: toDate(data.dateOfBirth),
            address: data.address,
            guardianName: data.guardianName,
            guardianPhone: data.guardianPhone,
            program: { connect: { id: section.semester.programId } },
            currentSection: { connect: { id: section.id } },
            enrollments: { create: { sectionId: section.id } },
            user: {
              create: {
                email: data.email,
                passwordHash,
                role: 'STUDENT',
                firstName: data.firstName,
                lastName: data.lastName,
                phone: data.phone,
                mustChangePassword: true,
              },
            },
          },
        });
      }
    },
    { timeout: 60_000 },
  );

  return {
    created: prepared.length,
    errors: [],
    credentials: prepared.map((p) => ({
      email: p.data.email,
      temporaryPassword: p.temporaryPassword,
    })),
  };
}
