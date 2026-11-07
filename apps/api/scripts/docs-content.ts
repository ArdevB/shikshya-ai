import { Prisma } from '@prisma/client';
import * as shared from '@shikshya/shared';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z, type ZodTypeAny } from 'zod';
import { listRoutes, type RouteInfo } from '../src/routes/index.js';

const folder = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export const API_FILE = folder('../../../docs/api.md');
export const DATABASE_FILE = folder('../../../docs/database.md');
const PERMISSIONS_FILE = folder('../../../docs/permissions.md');
const ROUTES_FOLDER = folder('../src/routes/');

// ---------- Which request schema each route validates against ----------

interface RouteSchemas {
  body?: string;
  query?: string;
}

const keyOf = (method: string, path: string) => `${method.toUpperCase()} ${path}`;

/** Express does not record which schema a handler parses, so this reads it from the source. */
function schemasFromSource() {
  const byFactory = new Map<string, Map<string, RouteSchemas>>();
  const mounts: [string, string][] = [];

  for (const file of readdirSync(ROUTES_FOLDER)) {
    const source = readFileSync(join(ROUTES_FOLDER, file), 'utf8');

    for (const mount of source.matchAll(/\[\s*'([^']*)',\s*(\w+)\(\)\s*\]/g)) {
      mounts.push([mount[1] ?? '', mount[2] ?? '']);
    }
    // Groups written as a list: ['/courses', crudRouter(academic.courses, query, body)].
    for (const crud of source.matchAll(
      /\[\s*'([^']*)',\s*crudRouter\([\w.]+,\s*(\w+),\s*(\w+)/g,
    )) {
      const name = `crud:${crud[1]}`;
      mounts.push([crud[1] ?? '', name]);
      byFactory.set(name, crudSchemas(crud[2] ?? '', crud[3] ?? ''));
    }

    const factories = [
      ...source.matchAll(/export (?:function (\w+)\(\)|const (\w+) = \(\) =>)/g),
    ].map((match) => ({ name: match[1] ?? match[2] ?? '', start: match.index }));

    factories.forEach(({ name, start }, index) => {
      const end = factories[index + 1]?.start ?? source.length;
      const text = source.slice(start, end);
      const crud = /crudRouter\(\s*[\w.]+,\s*(\w+),\s*(\w+)/.exec(text);
      if (crud && !text.includes('Router()')) {
        byFactory.set(name, crudSchemas(crud[1] ?? '', crud[2] ?? ''));
        return;
      }
      const routes = new Map<string, RouteSchemas>();
      const handlers = [...text.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)];
      handlers.forEach((handler, handlerIndex) => {
        const body = text.slice(handler.index, handlers[handlerIndex + 1]?.index ?? text.length);
        routes.set(keyOf(handler[1] ?? '', handler[2] ?? ''), {
          body: /parseBody\(req, (\w+)\)/.exec(body)?.[1],
          query: /parseQuery\(req, (\w+)\)/.exec(body)?.[1],
        });
      });
      byFactory.set(name, routes);
    });
  }

  const schemas = new Map<string, RouteSchemas>();
  for (const [prefix, factory] of mounts) {
    for (const [route, found] of byFactory.get(factory) ?? []) {
      const [method = '', path = ''] = route.split(' ');
      schemas.set(keyOf(method, `${prefix}${path === '/' && prefix ? '' : path}`), found);
    }
  }
  return schemas;
}

const crudSchemas = (query: string, body: string) =>
  new Map<string, RouteSchemas>([
    ['GET /', { query }],
    ['POST /', { body }],
    ['PUT /:id', { body }],
  ]);

// ---------- Describing a Zod schema in words ----------

function typeName(schema: ZodTypeAny): string {
  if (schema instanceof z.ZodEffects) return typeName(schema.innerType());
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return typeName(schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) return typeName(schema.removeDefault());
  if (schema instanceof z.ZodPipeline) return typeName(schema._def.out as ZodTypeAny);
  if (schema instanceof z.ZodString) return 'text';
  if (schema instanceof z.ZodNumber) return 'number';
  if (schema instanceof z.ZodBoolean) return 'true or false';
  if (schema instanceof z.ZodEnum) return (schema.options as string[]).join(' \\| ');
  if (schema instanceof z.ZodNativeEnum) return Object.values(schema.enum).join(' \\| ');
  if (schema instanceof z.ZodArray) return `list of ${typeName(schema.element as ZodTypeAny)}`;
  if (schema instanceof z.ZodObject) return 'object';
  if (schema instanceof z.ZodUnion) {
    return (schema.options as ZodTypeAny[]).map(typeName).join(' or ');
  }
  return 'value';
}

function objectOf(schema: ZodTypeAny): z.AnyZodObject | null {
  if (schema instanceof z.ZodObject) return schema;
  if (schema instanceof z.ZodEffects) return objectOf(schema.innerType());
  return null;
}

/** "name (text), age (number, optional)" for one schema exported by the shared package. */
function describeSchema(name: string | undefined) {
  if (!name) return '';
  const schema = (shared as unknown as Record<string, ZodTypeAny>)[name];
  const object = schema && objectOf(schema);
  if (!object) return `\`${name}\``;
  const fields = Object.entries(object.shape as Record<string, ZodTypeAny>).map(
    ([field, value]) => `\`${field}\` ${typeName(value)}${value.isOptional() ? ' (optional)' : ''}`,
  );
  return fields.join(', ') || '(empty)';
}

// ---------- docs/api.md ----------

const ROLE_SHORT: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Admin',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
  PARENT: 'Parent',
  ACCOUNTANT: 'Accountant',
  LIBRARIAN: 'Librarian',
};

function readPermissions() {
  const rows = new Map<string, string[]>();
  const row = /^\|\s*`(GET|POST|PUT|PATCH|DELETE)`\s*\|\s*`([^`]+)`\s*\|(.+)\|$/;
  for (const line of readFileSync(PERMISSIONS_FILE, 'utf8').split(/\r?\n/)) {
    const match = row.exec(line);
    if (match) {
      rows.set(
        `${match[1]} ${match[2]}`,
        (match[3] ?? '').split('|').map((cell) => cell.trim()),
      );
    }
  }
  return rows;
}

function whoCanCall(cells: string[] | undefined) {
  if (!cells) return '';
  if (cells.every((cell) => cell === 'public')) return 'No login';
  if (cells.every((cell) => cell === 'yes')) return 'Everyone logged in';
  const names = shared.ROLES.flatMap((role, index) => {
    const cell = cells[index];
    if (cell === 'yes') return [ROLE_SHORT[role] ?? role];
    if (cell === 'own') return [`${ROLE_SHORT[role] ?? role} (own)`];
    return [];
  });
  return names.join(', ');
}

const AREAS: [string, RegExp][] = [
  ['Login and sessions', /^\/auth/],
  ['Academic structure', /^\/(departments|programs|academic-years|semesters|courses|course-offerings)|^\/sections(\/:id)?$/],
  ['People', /^\/(teachers|parents)|^\/students(\/import|\/:id|\/:id\/photo)?$/],
  ['Attendance', /^\/(attendance|offerings)|^\/students\/:id\/attendance/],
  ['Timetable and rooms', /^\/(rooms|time-slots|timetable\/|timetable$)|^\/students\/:id\/timetable/],
  ['Exams and results', /^\/(exams|exam-subjects)|^\/sections\/:id\/results|^\/students\/:id\/results/],
  ['Assignments and materials', /^\/(assignments|submissions|materials)|^\/students\/:id\/(assignments|materials)/],
  ['Notices and events', /^\/(notices|events)/],
  ['Dashboards', /^\/(dashboard|stats)/],
  ['Fees', /^\/(fee-heads|fee-structures|fine-rules|invoices|finance)/],
  ['Payments', /^\/payments/],
  ['PDFs and verification', /^\/(pdf|public)/],
  ['Settings and notifications', /^\/(settings|notifications)/],
  ['AI: assistant and college rules', /^\/(assistant|policies)/],
  ['AI: students needing attention', /^\/risk/],
  ['AI: quizzes', /^\/quizzes/],
  ['AI: timetable generator', /^\/timetable-generator/],
];

export function apiReference() {
  const permissions = readPermissions();
  const schemas = schemasFromSource();
  const groups = new Map<string, RouteInfo[]>(AREAS.map(([name]) => [name, []]));
  const other: RouteInfo[] = [];
  for (const route of listRoutes()) {
    const area = AREAS.find(([, pattern]) => pattern.test(route.path));
    if (area) groups.get(area[0])?.push(route);
    else other.push(route);
  }
  if (other.length) groups.set('Other', other);

  const sections = [...groups]
    .filter(([, routes]) => routes.length > 0)
    .map(([name, routes]) => {
      const rows = routes.map((route) => {
        const key = keyOf(route.method, route.path);
        const found = schemas.get(key) ?? {};
        const request = [
          found.query ? `Query: ${describeSchema(found.query)}` : '',
          found.body ? `Body: ${describeSchema(found.body)}` : '',
        ]
          .filter(Boolean)
          .join('<br>');
        return `| \`${route.method}\` | \`${route.path}\` | ${whoCanCall(permissions.get(key))} | ${request} |`;
      });
      return `## ${name}\n\n| Method | Path | Who can call it | Request |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n`;
    });

  return `# API reference

Generated from the code by \`pnpm docs:generate\`. Do not edit by hand: \`apps/api/test/docs.test.ts\` fails if this differs from the routes and schemas.

The routes come from the routers themselves, who may call them from [permissions.md](permissions.md), and the fields from the Zod schemas in \`packages/shared\`.

## How it works

- **Base address:** \`/api/v1\`. Requests and responses are JSON, except file uploads and downloads, and the assistant's reply, which arrives as server-sent events.
- **Logging in:** \`POST /auth/login\` returns an access token and sets a refresh cookie. Send the token as \`Authorization: Bearer <token>\`. It lasts 15 minutes, after which \`POST /auth/refresh\` gets a new one.
- **Cookie routes:** \`/auth/refresh\` and \`/auth/logout\` also need the header \`X-Shikshya-Client: web\`, as CSRF protection.
- **Errors:** always \`{ "error": { "code", "message", "details"? } }\`. Validation errors list each field in \`details\`.
- **Lists:** \`?page=\` and \`?pageSize=\`, with a default of 20 and a maximum of 100. The reply is \`{ "data": [], "meta": { "page", "pageSize", "total", "totalPages" } }\`. Lists that are small by nature, such as one class's students, come back whole.
- **Money:** whole paisa in storage and in \`...Paisa\` fields. The \`amount\` in a request is rupees.
- **"(own)"** means only records that belong to the caller. See [permissions.md](permissions.md) for exactly what that means.
- **Limits:** see [security.md](security.md). Going over one gets a 429.

${sections.join('\n')}`;
}

// ---------- docs/database.md ----------

const MODEL_GROUPS: [string, string[]][] = [
  ['People and access', ['User', 'RefreshToken', 'Teacher', 'Student', 'Parent', 'ParentStudent', 'AuditLog']],
  ['Academic structure', ['Department', 'Program', 'AcademicYear', 'Semester', 'Section', 'Course', 'CourseOffering', 'Enrollment']],
  ['Attendance', ['AttendanceSession', 'AttendanceRecord']],
  ['Timetable', ['Room', 'TimeSlot', 'TimetableEntry', 'TeacherUnavailability']],
  ['Exams and results', ['Exam', 'ExamSubject', 'Mark', 'GradeScale', 'Result', 'ResultCourse']],
  ['Assignments and materials', ['Assignment', 'Submission', 'Material']],
  ['Notices and notifications', ['Notice', 'NoticeRead', 'Event', 'Notification', 'NotificationPreference']],
  ['Fees and payments', ['FeeHead', 'FeeStructure', 'FeeStructureItem', 'Invoice', 'InvoiceItem', 'FineRule', 'Payment', 'Counter', 'InstitutionSettings']],
  ['AI features', ['ChatConversation', 'ChatMessage', 'PolicyDocument', 'PolicyChunk', 'RiskPrediction', 'Quiz', 'QuizQuestion', 'QuizAttempt', 'QuizAnswer', 'AiCallLog']],
];

type Model = (typeof Prisma.dmmf.datamodel.models)[number];

function relationLine(model: Model, field: Model['fields'][number]) {
  const child = field.isRequired ? '||' : '|o';
  const many = field.relationFromFields?.some((name) =>
    model.uniqueFields.some((unique) => unique.length === 1 && unique[0] === name) ||
    model.fields.some((other) => other.name === name && other.isUnique),
  );
  return `  ${field.type} ${child}--${many ? 'o|' : 'o{'} ${model.name} : "${field.name}"`;
}

function ownRelations(model: Model) {
  return model.fields.filter((field) => field.relationFromFields?.length);
}

function entity(model: Model) {
  const foreignKeys = new Set(ownRelations(model).flatMap((field) => field.relationFromFields ?? []));
  const lines = model.fields
    .filter((field) => field.kind !== 'object')
    .map((field) => {
      const key = field.isId
        ? ' PK'
        : foreignKeys.has(field.name)
          ? ' FK'
          : field.isUnique
            ? ' UK'
            : '';
      return `    ${field.type}${field.isList ? '_list' : ''} ${field.name}${key}`;
    });
  return `  ${model.name} {\n${lines.join('\n')}\n  }`;
}

const mermaid = (body: string) => `\`\`\`mermaid\nerDiagram\n${body}\n\`\`\``;

export function databaseReference() {
  const models = Prisma.dmmf.datamodel.models;
  const byName = new Map(models.map((model) => [model.name, model]));
  const grouped = new Set(MODEL_GROUPS.flatMap(([, names]) => names));
  const groups = [...MODEL_GROUPS];
  const leftOver = models.map((model) => model.name).filter((name) => !grouped.has(name));
  if (leftOver.length) groups.push(['Other', leftOver]);

  const overview = models.flatMap((model) =>
    ownRelations(model).map((field) => relationLine(model, field)),
  );

  const sections = groups.map(([name, names]) => {
    const inGroup = names.flatMap((modelName) => {
      const model = byName.get(modelName);
      return model ? [model] : [];
    });
    const relations = inGroup.flatMap((model) =>
      ownRelations(model).map((field) => relationLine(model, field)),
    );
    const body = [...inGroup.map(entity), ...relations].join('\n');
    return `## ${name}\n\n${mermaid(body)}\n`;
  });

  return `# Database

Generated from \`apps/api/prisma/schema.prisma\` by \`pnpm docs:generate\`. Do not edit by hand: \`apps/api/test/docs.test.ts\` fails if this differs from the schema.

${models.length} tables in PostgreSQL 18, accessed through Prisma. Money is stored as whole paisa, and dates as UTC. A \`FK\` points to the table named in the lines below it.

\`PolicyChunk\` also has an \`embedding vector(768)\` column from pgvector, for searching the college rules by meaning. Prisma cannot describe that type, so it does not appear below, and migrations only add it where the extension is available. See [algorithms/rag.md](algorithms/rag.md).

## How the tables relate

Every table and relationship, without their columns. The sections after it show each area in detail.

${mermaid(overview.join('\n'))}

${sections.join('\n')}`;
}
