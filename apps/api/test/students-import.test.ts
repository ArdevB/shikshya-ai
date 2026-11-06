import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, bearer, createFixture, prisma, resetDatabase, tokenFor } from './helpers.js';

const HEADER =
  'email,firstName,lastName,phone,rollNumber,registrationNumber,programCode,semesterNumber,sectionName,admissionDate';
const row = (n: number, overrides: Partial<Record<string, string>> = {}) => {
  const values = {
    email: `new${n}@test.local`,
    firstName: 'New',
    lastName: `Student${n}`,
    phone: '',
    rollNumber: `NEW-${n}`,
    registrationNumber: '',
    programCode: 'CSIT',
    semesterNumber: '6',
    sectionName: 'A',
    admissionDate: '2026-01-15',
    ...overrides,
  };
  return Object.values(values).join(',');
};

let adminToken: string;
let teacherToken: string;
const importCsv = (content: string, token = adminToken) =>
  api()
    .post('/api/v1/students/import')
    .set(bearer(token))
    .attach('file', Buffer.from(content), 'students.csv');

const newStudentCount = () =>
  prisma.student.count({ where: { rollNumber: { startsWith: 'NEW-' } } });

beforeAll(async () => {
  await resetDatabase();
  const fx = await createFixture();
  adminToken = await tokenFor(fx.admin.email);
  teacherToken = await tokenFor(fx.teacherA.user.email);
});

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: 'new' } } });
});

describe('POST /students/import', () => {
  it('imports a clean file and creates login, profile and enrollment', async () => {
    const response = await importCsv([HEADER, row(1), row(2)].join('\n'));
    expect(response.status).toBe(201);
    expect(response.body.created).toBe(2);
    expect(response.body.credentials).toHaveLength(2);
    expect(await newStudentCount()).toBe(2);

    const student = await prisma.student.findUniqueOrThrow({
      where: { rollNumber: 'NEW-1' },
      include: { enrollments: true, user: true },
    });
    expect(student.enrollments).toHaveLength(1);
    expect(student.user.role).toBe('STUDENT');
    expect(student.user.mustChangePassword).toBe(true);
  });

  it('lets a new student log in with their temporary password', async () => {
    const response = await importCsv([HEADER, row(1)].join('\n'));
    const { email, temporaryPassword } = response.body.credentials[0];
    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email, password: temporaryPassword });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
  });

  it('inserts nothing if any row fails, and reports the row and field', async () => {
    const response = await importCsv(
      [HEADER, row(1), row(2, { email: 'not-an-email' }), row(3)].join('\n'),
    );
    expect(response.status).toBe(422);
    expect(response.body.error.details).toEqual([
      { row: 3, field: 'email', message: 'Enter a valid email address' },
    ]);
    expect(await newStudentCount()).toBe(0);
  });

  it('reports every problem at once', async () => {
    const response = await importCsv(
      [
        HEADER,
        row(1, { firstName: '' }),
        row(2, { admissionDate: '15/01/2026' }),
        row(3, { programCode: 'NOPE' }),
        row(4, { sectionName: 'Z' }),
        row(5, { semesterNumber: 'six' }),
      ].join('\n'),
    );
    expect(response.status).toBe(422);
    const fields = response.body.error.details.map((e: { row: number; field: string }) => [
      e.row,
      e.field,
    ]);
    expect(fields).toEqual([
      [2, 'firstName'],
      [3, 'admissionDate'],
      [4, 'programCode'],
      [5, 'sectionName'],
      [6, 'semesterNumber'],
    ]);
    expect(await newStudentCount()).toBe(0);
  });

  it('catches duplicates inside the file', async () => {
    const response = await importCsv(
      [HEADER, row(1), row(2, { email: 'new1@test.local' }), row(3, { rollNumber: 'NEW-1' })].join(
        '\n',
      ),
    );
    expect(response.status).toBe(422);
    expect(response.body.error.details).toEqual([
      { row: 3, field: 'email', message: 'Same email as row 2' },
      { row: 4, field: 'rollNumber', message: 'Same rollNumber as row 2' },
    ]);
  });

  it('catches duplicates against existing students', async () => {
    const response = await importCsv(
      [HEADER, row(1, { email: 'student-a@test.local' }), row(2, { rollNumber: 'student-b' })].join(
        '\n',
      ),
    );
    expect(response.status).toBe(422);
    expect(response.body.error.details.map((e: { field: string }) => e.field)).toEqual([
      'email',
      'rollNumber',
    ]);
    expect(await newStudentCount()).toBe(0);
  });

  it('explains a file with missing columns', async () => {
    const response = await importCsv('email,firstName\na@b.co,A');
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('rollNumber');
  });

  it('rejects an empty file', async () => {
    const response = await importCsv(HEADER);
    expect(response.status).toBe(400);
  });

  it('copes with a spreadsheet byte order mark', async () => {
    const response = await importCsv(`${String.fromCharCode(0xfeff)}${HEADER}
${row(1)}`);
    expect(response.status).toBe(201);
  });

  it('is admin only', async () => {
    const response = await importCsv([HEADER, row(1)].join('\n'), teacherToken);
    expect(response.status).toBe(403);
    expect(await newStudentCount()).toBe(0);
  });

  it('requires a file', async () => {
    const response = await api().post('/api/v1/students/import').set(bearer(adminToken));
    expect(response.status).toBe(400);
  });
});
