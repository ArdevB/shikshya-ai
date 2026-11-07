// TEMPORARY analysis, removed after use. EXPLAIN ANALYZE on the heaviest queries at a larger scale.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { beforeAll, describe, it, vi } from 'vitest';

const counter = vi.hoisted(() => ({ list: [] as { query: string; params: string; duration: number }[] }));

vi.mock('../src/lib/prisma.js', async (original) => {
  const actual = await original<typeof import('../src/lib/prisma.js')>();
  const { PrismaClient } = await import('@prisma/client');
  const base = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
  base.$on('query', (event) => counter.list.push({ query: event.query, params: event.params, duration: event.duration }));
  return { ...actual, prisma: base };
});

const { api, bearer, prisma } = await import('./helpers.js');
const { clearCache } = await import('../src/lib/cache.js');

const tokenOf = async (email: string) => {
  const r = await api().post('/api/v1/auth/login').send({ email, password: 'Shikshya@123' });
  return (r.body as { accessToken: string }).accessToken;
};

describe('explain', () => {
  beforeAll(async () => {
    const req = createRequire(import.meta.url);
    execFileSync(process.execPath, [req.resolve('tsx/cli'), 'prisma/seed.ts'], { env: { ...process.env }, stdio: 'pipe', maxBuffer: 1e8 });
    // Many more rows than a demo: about a college-year of activity.
    await prisma.$executeRawUnsafe(`
      INSERT INTO "AttendanceSession" (id, "courseOfferingId", date, "takenById", "createdAt", "updatedAt")
      SELECT 'bulk' || o.id || g, o.id, DATE '2020-01-01' + g, t."userId", now(), now()
      FROM "CourseOffering" o JOIN "Teacher" t ON t.id = o."teacherId", generate_series(1, 400) g
      ON CONFLICT DO NOTHING`);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "AttendanceRecord" (id, "sessionId", "studentId", status)
      SELECT s.id || e."studentId", s.id, e."studentId", (ARRAY['PRESENT','ABSENT','LATE','EXCUSED'])[1 + floor(random()*4)]::"AttendanceStatus"
      FROM "AttendanceSession" s JOIN "CourseOffering" o ON o.id = s."courseOfferingId" JOIN "Enrollment" e ON e."sectionId" = o."sectionId"
      WHERE s.id LIKE 'bulk%'`);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Notification" (id, "userId", type, title, body, "createdAt")
      SELECT 'bulk' || u.id || g, u.id, 'TEST', 'Hello', 'Hello', now() - (g || ' hours')::interval
      FROM "User" u, generate_series(1, 2000) g`);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Payment" (id, "invoiceId", "amountPaisa", method, status, "paidAt", "createdAt")
      SELECT 'bulk' || i.id || g, i.id, 1000, 'CASH', 'SUCCESS', now() - (g || ' hours')::interval, now()
      FROM "Invoice" i, generate_series(1, 1000) g`);
    await prisma.$executeRawUnsafe('ANALYZE');
  }, 600_000);

  it('explains', { timeout: 600_000 }, async () => {
    const counts = await prisma.$queryRawUnsafe<{ t: string; n: bigint }[]>(`
      SELECT relname AS t, n_live_tup AS n FROM pg_stat_user_tables WHERE relname IN ('AttendanceRecord','AttendanceSession','Notification','Payment') ORDER BY 1`);
    console.log('rows:', counts.map((c) => `${c.t}=${c.n}`).join(' '));
    const indexes = await prisma.$queryRawUnsafe<{ tablename: string; indexname: string; def: string }[]>(`
      SELECT tablename, indexname, regexp_replace(indexdef, '.*USING btree ', '') AS def FROM pg_indexes
      WHERE schemaname='public' AND tablename IN ('AttendanceRecord','AttendanceSession','Notification','Payment','Invoice','Notice','Enrollment','Mark','RiskPrediction','ChatMessage','ChatConversation','AiCallLog','QuizAttempt','RefreshToken','AuditLog','Student') AND indexname NOT LIKE '%pkey' ORDER BY 1,2`);
    console.log(indexes.map((i) => `${i.tablename} ${i.def}`).join('\n'));

    const admin = await tokenOf('admin@shikshya.test');
    const teacher = await tokenOf('teacher1@shikshya.test');
    const student = await tokenOf('student01@shikshya.test');
    const accountant = await tokenOf('accountant@shikshya.test');
    const me = (await api().get('/api/v1/auth/me').set(bearer(student))).body as { studentId: string };
    const offering = await prisma.courseOffering.findFirstOrThrow({ where: { teacher: { user: { email: 'teacher1@shikshya.test' } } } });

    const calls: [string, string][] = [
      [admin, '/dashboard/admin/low-attendance'],
      [admin, '/dashboard/admin/attendance-today'],
      [admin, '/dashboard/admin/attendance-trend'],
      [teacher, '/dashboard/teacher/low-attendance'],
      [teacher, '/dashboard/teacher/pending-attendance'],
      [teacher, `/offerings/${offering.id}/attendance-report`],
      [teacher, '/attendance/sessions?pageSize=20'],
      [student, `/students/${me.studentId}/attendance-summary`],
      [student, '/notifications?pageSize=20'],
      [student, '/notifications/unread-count'],
      [student, '/payments'],
      [accountant, '/finance/collections-summary'],
      [accountant, '/finance/collections-trend'],
      [accountant, '/payments?pageSize=20'],
    ];
    for (const [token, url] of calls) {
      clearCache();
      counter.list.length = 0;
      const start = performance.now();
      const response = await api().get(`/api/v1${url}`).set(bearer(token));
      const ms = Math.round(performance.now() - start);
      const worst = [...counter.list].sort((a, b) => b.duration - a.duration).slice(0, 1);
      console.log(`\n=== ${url.replace(/c[a-z0-9]{24}/g, ':id')} -> ${response.status} in ${ms} ms, ${counter.list.length} queries`);
      for (const q of worst) {
        console.log(`worst ${q.duration} ms: ${q.query.replace(/\s+/g, ' ').slice(0, 150)}`);
        if (q.duration < 15) continue;
        const params = JSON.parse(q.params) as unknown[];
        try {
          const plan = await prisma.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(`EXPLAIN (ANALYZE, BUFFERS OFF, COSTS OFF, TIMING OFF) ${q.query}`, ...params);
          console.log(plan.map((p) => p['QUERY PLAN']).filter((l) => /Scan|Execution Time|Rows Removed|Sort Method/.test(l)).slice(0, 14).join('\n').slice(0, 1500));
        } catch (error) {
          console.log('explain failed', String(error).slice(0, 200));
        }
      }
    }
  });
});
