import { ROLES, type Role } from '@shikshya/shared';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { closePdfBrowser } from '../src/pdf/render.js';
import { listRoutes, type RouteInfo } from '../src/routes/index.js';
import { api, bearer, prisma, resetDatabase, tokenFor } from './helpers.js';
import {
  createPermissionFixture,
  EMAILS,
  type PermissionFixture,
  type Side,
} from './permissions.fixture.js';

/**
 * Checks docs/permissions.md against what the API really does, for every route and every role.
 *
 *   yes     the role may use this route
 *   own     the role may use this route, but only on records that belong to them
 *   no      the role gets 403
 *   public  no login needed
 *
 * The route list comes from the routers themselves, so a new route fails this test until someone
 * decides who may use it and writes that down.
 *
 * To redraft the table after changing routes: WRITE_PERMISSIONS=1 pnpm --filter @shikshya/api test
 * test/permissions.test.ts. It records what the code does now, so read the git diff: a wrong
 * permission would be recorded just as faithfully as a right one.
 */
const TABLE_FILE = fileURLToPath(new URL('../../../docs/permissions.md', import.meta.url));
const WRITING = Boolean(process.env.WRITE_PERMISSIONS);

type Cell = 'yes' | 'own' | 'no' | 'public';
type Row = Record<Role, Cell>;

const keyOf = ({ method, path }: Pick<RouteInfo, 'method' | 'path'>) => `${method} ${path}`;
const ROUTES = listRoutes();

function readTable(): Map<string, Row> {
  const table = new Map<string, Row>();
  // Spaces vary, because Prettier lines the columns up.
  const row = /^\|\s*`(GET|POST|PUT|PATCH|DELETE)`\s*\|\s*`([^`]+)`\s*\|(.+)\|$/;
  let text = '';
  try {
    text = readFileSync(TABLE_FILE, 'utf8');
  } catch {
    return table;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = row.exec(line);
    if (!match) continue;
    const cells = (match[3] ?? '').split('|').map((cell) => cell.trim());
    table.set(
      `${match[1]} ${match[2]}`,
      Object.fromEntries(ROLES.map((role, index) => [role, cells[index]])) as Row,
    );
  }
  return table;
}

/** Which record each route parameter means, in the order they appear in the path. */
const PARAMETERS: [RegExp, (side: Side, semesterId: string) => string[]][] = [
  [/^\/students\/:id/, (s) => [s.student]],
  [/^\/dashboard\/students\/:id/, (s) => [s.student]],
  [/^\/pdf\/receipt\//, (s) => [s.payment]],
  [/^\/pdf\/invoice\//, (s) => [s.invoice]],
  [/^\/pdf\/marksheet\//, (s, semesterId) => [s.student, semesterId]],
  [/^\/pdf\/(transcript|id-card)\//, (s) => [s.student]],
  [/^\/invoices\/:id/, (s) => [s.invoice]],
  [/^\/payments\/:id/, (s) => [s.payment]],
  [/^\/attendance\/sessions\/:id/, (s) => [s.session]],
  [/^\/offerings\/:id/, (s) => [s.offering]],
  [/^\/exam-subjects\/:id\/marks\/:studentId/, (s) => [s.examSubject, s.student]],
  [/^\/exam-subjects\/:id/, (s) => [s.examSubject]],
  [/^\/sections\/:id\/results/, (s) => [s.section]],
  [/^\/assignments\/:id\/files\//, (s) => [s.assignment, s.assignmentFile]],
  [/^\/assignments\/:id/, (s) => [s.assignment]],
  [/^\/submissions\/:id\/files\//, (s) => [s.submission, s.submissionFile]],
  [/^\/submissions\/:id/, (s) => [s.submission]],
  [/^\/materials\/:id\/files\//, (s) => [s.material, s.materialFile]],
  [/^\/materials\/:id/, (s) => [s.material]],
  [/^\/notices\/:id/, (s) => [s.notice]],
  [/^\/notifications\/:id/, (s) => [s.notification]],
  [/^\/assistant\/conversations\/:id/, (s) => [s.conversation]],
  [/^\/quizzes\/mine\/:id/, (s) => [s.quiz]],
  [/^\/quizzes\/answers\//, (s) => [s.answer]],
  [/^\/quizzes\/:id\/questions\//, (s) => [s.quiz, s.question]],
  [/^\/quizzes\/:id/, (s) => [s.quiz]],
  [/^\/risk\/:id/, (s) => [s.risk]],
];

const FUTURE = '2030-01-01T00:00:00.000Z';
const FURTHER = '2030-02-01T00:00:00.000Z';

/**
 * Valid bodies, for routes where the check that matters needs one. Validation runs first, so an
 * empty body stops with a 400 before any ownership check, which would look like permission granted.
 * Some of these are also the only place a record is named: nothing in the path says whose invoice.
 */
const BODIES: Record<string, (side: Side) => object> = {
  'POST /attendance/sessions': (s) => ({
    offeringId: s.offering,
    date: '2026-04-02',
    records: [{ studentId: s.student, status: 'PRESENT' }],
  }),
  'PUT /attendance/sessions/:id': (s) => ({
    records: [{ studentId: s.student, status: 'ABSENT' }],
  }),
  'PUT /exam-subjects/:id/marks/:studentId': () => ({ marksObtained: 50, isAbsent: false }),
  'POST /assignments': (s) => ({
    courseOfferingId: s.offering,
    title: 'New assignment',
    dueAt: FUTURE,
    maxMarks: 10,
  }),
  'PUT /assignments/:id': (s) => ({
    courseOfferingId: s.offering,
    title: 'Changed assignment',
    dueAt: FUTURE,
    maxMarks: 10,
  }),
  'PUT /submissions/:id/grade': () => ({ marks: 5, feedback: 'Good' }),
  'POST /materials': (s) => ({ courseOfferingId: s.offering, title: 'New material' }),
  'POST /notices': (s) => ({
    title: 'New notice',
    body: 'Hello',
    audience: 'SECTION',
    sectionId: s.section,
  }),
  'PUT /notices/:id': (s) => ({
    title: 'Changed notice',
    body: 'Hello',
    audience: 'SECTION',
    sectionId: s.section,
  }),
  'POST /payments/initiate': (s) => ({ invoiceId: s.invoice, method: 'ESEWA' }),
  'POST /risk/:id/review': () => ({ note: 'Spoke with them' }),
  'POST /quizzes/mine/:id/submit': (s) => ({
    answers: [{ questionId: s.question, answer: 'An answer' }],
  }),
  'POST /quizzes/generate': (s) => ({
    courseOfferingId: s.offering,
    title: 'New quiz',
    numQuestions: 1,
    types: 'MCQ',
    difficulty: 'EASY',
    notes: 'A compiler translates source code into machine code that a computer can run.',
  }),
  'POST /quizzes/answers/:answerId/grade': () => ({ isCorrect: true }),
  'PUT /quizzes/:id': () => ({ title: 'Renamed quiz' }),
  'POST /quizzes/:id/publish': () => ({ opensAt: FUTURE, closesAt: FURTHER }),
  'PUT /quizzes/:id/questions/:questionId': () => ({
    type: 'SHORT_ANSWER',
    question: 'What does a compiler do?',
    options: null,
    correctAnswer: 'It translates',
    explanation: 'That is its job',
    difficulty: 'EASY',
  }),
};

/** Routes about one person. A classmate's records must be out of reach, not only another class's. */
const PERSONAL_ROUTE =
  /^\/(students\/:id|dashboard\/students|pdf|invoices\/:id|payments\/:id|payments\/initiate|submissions\/:id|notifications\/:id|assistant\/conversations)/;

const NOT_REAL = 'clnotarealidnotarealid000';

const withIds = (path: string, ids: string[]) => {
  const queue = [...ids];
  return path.replace(/:\w+/g, () => queue.shift() ?? NOT_REAL);
};

function idsFor(path: string, side: Side, semesterId: string): string[] | null {
  const match = PARAMETERS.find(([pattern]) => pattern.test(path));
  return match ? match[1](side, semesterId) : null;
}

/** Whether a route can be tried on one's own record and on someone else's. */
const isAboutARecord = (route: RouteInfo) =>
  keyOf(route) in BODIES || idsFor(route.path, sampleSide, '') !== null;

const sampleSide = new Proxy({} as Side, { get: () => 'x' });

const bodyFor = (route: RouteInfo, side: Side) => BODIES[keyOf(route)]?.(side);

const urlFor = (route: RouteInfo, side: Side, role?: Role) => {
  // Conversations belong to a person rather than a class, and every role has its own.
  const ownChat = side === fixture.a && role && route.path.startsWith('/assistant/conversations/');
  const ids = ownChat
    ? [fixture.conversations.get(role) ?? '']
    : (idsFor(route.path, side, fixture.semesterId) ?? []);
  return withIds(route.path, ids);
};

const tokens = new Map<Role, string>();

async function logInEveryone() {
  tokens.clear();
  for (const role of ROLES) tokens.set(role, await tokenFor(EMAILS[role]));
}

function send(role: Role | null, method: string, url: string, body: object = {}) {
  const agent = api();
  const call =
    method === 'GET'
      ? agent.get(`/api/v1${url}`)
      : method === 'POST'
        ? agent.post(`/api/v1${url}`)
        : method === 'PUT'
          ? agent.put(`/api/v1${url}`)
          : method === 'PATCH'
            ? agent.patch(`/api/v1${url}`)
            : agent.delete(`/api/v1${url}`);
  if (role) void call.set(bearer(tokens.get(role) ?? ''));
  // An empty body: enough to pass the permission check, then stop at validation.
  return method === 'GET' || method === 'DELETE' ? call : call.send(body);
}

let fixture: PermissionFixture;

async function freshData() {
  await resetDatabase();
  fixture = await createPermissionFixture();
  await logInEveryone();
}

beforeAll(async () => {
  // Nothing here should reach a real payment gateway or AI service.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No network during tests')));
  await freshData();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await closePdfBrowser();
  await prisma.$disconnect();
});

/** Drafts one cell from what the API does. Only for writing the table: the tests below check it. */
async function classify(route: RouteInfo, role: Role): Promise<Cell> {
  const { method, path } = route;
  if (!isAboutARecord(route)) {
    const { status } = await send(role, method, withIds(path, []));
    if (method !== 'GET' && status < 300) await freshData();
    return status === 403 ? 'no' : 'yes';
  }
  const blocked = (status: number) => status === 403 || status === 404;
  const tryOn = async (side: Side) => {
    const { status } = await send(role, method, urlFor(route, side, role), bodyFor(route, side));
    if (method !== 'GET' && status < 300) await freshData();
    return status;
  };
  const otherStatus = await tryOn(fixture.c);
  const mineStatus = await tryOn(fixture.a);
  if (mineStatus === 403) return blocked(otherStatus) ? 'no' : 'yes';
  return blocked(otherStatus) ? 'own' : 'yes';
}

const describeWriter = WRITING ? describe : describe.skip;

describeWriter('writing docs/permissions.md', () => {
  it('records what the API does now', { timeout: 1_200_000 }, async () => {
    const lines: string[] = [];
    for (const route of ROUTES) {
      const key = keyOf(route);
      const isPublic =
        route.access === 'public' && !['GET /auth/me', 'POST /auth/change-password'].includes(key);
      const cells: Cell[] = [];
      for (const role of ROLES) cells.push(isPublic ? 'public' : await classify(route, role));
      lines.push(`| \`${route.method}\` | \`${route.path}\` | ${cells.join(' | ')} |`);
    }
    const text = readFileSync(TABLE_FILE, 'utf8');
    const start = text.indexOf('<!-- table -->');
    const end = text.indexOf('<!-- /table -->');
    const header = `| Method | Path | ${ROLES.join(' | ')} |\n| --- | --- | ${ROLES.map(() => '---').join(' | ')} |`;
    writeFileSync(
      TABLE_FILE,
      `${text.slice(0, start)}<!-- table -->\n\n${header}\n${lines.join('\n')}\n\n${text.slice(end)}`,
    );
  });
});

const describeChecks = WRITING ? describe.skip : describe;

describeChecks('docs/permissions.md matches the API', () => {
  const table = readTable();

  it('lists every route, and nothing that no longer exists', () => {
    const actual = ROUTES.map(keyOf).sort();
    const documented = [...table.keys()].sort();
    expect(actual.filter((key) => !table.has(key))).toEqual([]);
    expect(documented.filter((key) => !actual.includes(key))).toEqual([]);
  });

  it('has no route declared twice, where the second could never run', () => {
    const keys = ROUTES.map(keyOf);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
  });

  describe('role checks: a real request as each role, for each route', () => {
    it.each(ROUTES.map((route) => [keyOf(route), route] as const))('%s', async (key, route) => {
      const row = table.get(key);
      expect(row, `${key} is not in docs/permissions.md`).toBeDefined();
      const problems: string[] = [];
      for (const role of ROLES) {
        const cell = row?.[role];
        if (cell === 'public') continue;
        // "no" is tried on a real record, because some routes first check that the record exists.
        // Everything else uses an id that matches nothing, so an allowed request changes no data.
        const { status } =
          cell === 'no' && isAboutARecord(route)
            ? await send(role, route.method, urlFor(route, fixture.c), bodyFor(route, fixture.c))
            : await send(role, route.method, withIds(route.path, []));
        const expected =
          cell === 'no'
            ? status === 403
            : cell === 'own'
              ? status !== 401
              : status !== 401 && status !== 403;
        if (!expected) problems.push(`${role} is "${String(cell)}" but got ${status}`);
      }
      expect(problems).toEqual([]);
    });
  });

  describe('no login', () => {
    const closed = ROUTES.filter((route) => table.get(keyOf(route))?.ADMIN !== 'public');
    it.each(closed.map((route) => [keyOf(route), route] as const))('%s', async (_key, route) => {
      const { status } = await send(null, route.method, withIds(route.path, []));
      expect(status).toBe(401);
    });
  });

  describe('lists only show what belongs to the caller', () => {
    interface ListCase {
      role: Role;
      url: () => string;
      shows: () => string[];
      hides: () => string[];
    }
    const { a, b, c } = {
      a: () => fixture.a,
      b: () => fixture.b,
      c: () => fixture.c,
    };
    const personal = (role: Role, url: string, field: keyof Side): ListCase => ({
      role,
      url: () => url,
      shows: () => [a()[field]],
      hides: () => [b()[field], c()[field]],
    });
    const byClass = (role: Role, url: string, field: keyof Side): ListCase => ({
      role,
      url: () => url,
      shows: () => [a()[field]],
      hides: () => [c()[field]],
    });
    const lists: ListCase[] = [
      personal('STUDENT', '/invoices', 'invoice'),
      personal('PARENT', '/invoices', 'invoice'),
      personal('STUDENT', '/payments', 'payment'),
      personal('PARENT', '/payments', 'payment'),
      personal('STUDENT', '/notifications', 'notification'),
      byClass('STUDENT', '/quizzes/mine', 'quiz'),
      byClass('STUDENT', '/notices', 'notice'),
      byClass('PARENT', '/notices', 'notice'),
      byClass('TEACHER', '/attendance/sessions', 'session'),
      byClass('TEACHER', '/quizzes', 'quiz'),
      byClass('TEACHER', '/risk', 'risk'),
      byClass('TEACHER', '/assignments', 'assignment'),
      byClass('TEACHER', '/materials', 'material'),
      byClass('TEACHER', '/exam-subjects/mine', 'examSubject'),
    ];

    it.each(lists.map((item) => [`${item.role} ${item.url()}`, item] as const))(
      '%s',
      async (_name, { role, url, shows, hides }) => {
        const response = await send(role, 'GET', url());
        expect(response.status).toBe(200);
        const body = JSON.stringify(response.body);
        for (const id of shows()) expect(body).toContain(id);
        for (const id of hides()) expect(body).not.toContain(id);
      },
    );

    // Asking for someone else's records by name must not widen the list.
    it.each([
      ['STUDENT', () => `/invoices?studentId=${fixture.b.student}`, () => fixture.b.invoice],
      ['PARENT', () => `/invoices?studentId=${fixture.c.student}`, () => fixture.c.invoice],
      ['STUDENT', () => `/payments?studentId=${fixture.b.student}`, () => fixture.b.payment],
      [
        'TEACHER',
        () => `/attendance/sessions?offeringId=${fixture.c.offering}`,
        () => fixture.c.session,
      ],
      ['TEACHER', () => `/quizzes?offeringId=${fixture.c.offering}`, () => fixture.c.quiz],
      ['TEACHER', () => `/risk?offeringId=${fixture.c.offering}`, () => fixture.c.risk],
    ] as [Role, () => string, () => string][])(
      '%s cannot widen a list',
      async (role, url, hidden) => {
        const response = await send(role, 'GET', url());
        if (response.status === 200) expect(JSON.stringify(response.body)).not.toContain(hidden());
        else expect(response.status).toBe(403);
      },
    );

    it("leaves someone else's notification unread", async () => {
      const response = await send(
        'STUDENT',
        'POST',
        `/notifications/${fixture.b.notification}/read`,
      );
      expect(response.status).toBe(204);
      const notification = await prisma.notification.findUniqueOrThrow({
        where: { id: fixture.b.notification },
      });
      expect(notification.readAt).toBeNull();
    });
  });

  describe('row checks: "own" means own, for every such cell', () => {
    interface Case {
      name: string;
      role: Role;
      route: RouteInfo;
    }
    const cases: Case[] = ROUTES.flatMap((route) =>
      ROLES.filter((role) => table.get(keyOf(route))?.[role] === 'own').map((role) => ({
        name: `${role} ${keyOf(route)}`,
        role,
        route,
      })),
    );
    // Reads first, because they can share data. Each write then gets its own fresh copy.
    const ordered = [
      ...cases.filter((item) => item.route.method === 'GET'),
      ...cases.filter((item) => item.route.method !== 'GET'),
    ];

    it('knows which record each of these routes is about', () => {
      const unknown = cases.filter((item) => !isAboutARecord(item.route));
      expect(unknown.map((item) => item.name)).toEqual([]);
    });

    it.each(ordered.map((item) => [item.name, item] as const))('%s', async (_name, item) => {
      const { role, route } = item;
      const read = route.method === 'GET';
      if (!read) await freshData();

      const others = [fixture.c];
      if ((role === 'STUDENT' || role === 'PARENT') && PERSONAL_ROUTE.test(route.path)) {
        others.push(fixture.b);
      }
      for (const other of others) {
        const url = urlFor(route, other);
        const blocked = await send(role, route.method, url, bodyFor(route, other));
        expect(
          [403, 404],
          `${role} reached someone else's record at ${url}: ${blocked.status}`,
        ).toContain(blocked.status);
      }

      const mine = urlFor(route, fixture.a, role);
      const allowed = await send(role, route.method, mine, bodyFor(route, fixture.a));
      if (read) {
        // Proves the data exists, so the blocks above came from the rule and not from a gap.
        expect(allowed.status, `${role} could not read their own record at ${mine}`).toBe(200);
      } else {
        expect([401, 403, 404], `${role} could not use their own record at ${mine}`).not.toContain(
          allowed.status,
        );
      }
    });
  });
});
