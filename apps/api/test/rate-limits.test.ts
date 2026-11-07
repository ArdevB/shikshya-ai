import { beforeAll, describe, expect, it, vi } from 'vitest';

// The other test files relax these limits. This one needs the real numbers, before the app loads.
vi.hoisted(() => {
  process.env.RATE_LIMIT_SCALE = '1';
});

const { api, bearer, createFixture, resetDatabase, tokenFor } = await import('./helpers.js');

let fx: Awaited<ReturnType<typeof createFixture>>;

beforeAll(async () => {
  await resetDatabase();
  fx = await createFixture();
});

const hit = async (times: number, send: () => PromiseLike<{ status: number }>) => {
  const statuses: number[] = [];
  for (let count = 0; count < times; count += 1) statuses.push((await send()).status);
  return statuses;
};

describe('rate limits', () => {
  it('stops repeated payment attempts from one person, without affecting others', async () => {
    const student = bearer(await tokenFor('student-a@test.local'));
    const pay = () =>
      api()
        .post('/api/v1/payments/initiate')
        .set(student)
        .send({ invoiceId: 'nope', gateway: 'KHALTI' });

    const statuses = await hit(21, pay);
    expect(statuses.slice(0, 20)).not.toContain(429);
    expect(statuses[20]).toBe(429);

    const other = await api()
      .post('/api/v1/payments/initiate')
      .set(bearer(await tokenFor('student-b@test.local')))
      .send({ invoiceId: 'nope', gateway: 'KHALTI' });
    expect(other.status).not.toBe(429);
  });

  it('stops repeated expensive AI requests', async () => {
    const teacher = bearer(await tokenFor('teacher-a@test.local'));
    const generate = () =>
      api().post('/api/v1/quizzes/generate').set(teacher).send({ offeringId: fx.offering.id });

    const statuses = await hit(21, generate);
    expect(statuses.slice(0, 20)).not.toContain(429);
    expect(statuses[20]).toBe(429);
  });

  it('says what happened in the usual error shape', async () => {
    const admin = bearer(await tokenFor('admin@test.local'));
    const recompute = () => api().post('/api/v1/risk/recompute').set(admin);
    await hit(20, recompute);
    const blocked = await recompute();
    expect(blocked.status).toBe(429);
    expect((blocked.body as { error: { code: string } }).error.code).toBe('TOO_MANY_REQUESTS');
    expect(blocked.headers.ratelimit).toBeDefined();
  });

  it('limits gateway callbacks by address, since they have no login', async () => {
    const statuses = await hit(301, () => api().get('/api/v1/payments/callback/khalti/failed/x'));
    expect(statuses[0]).toBe(302);
    expect(statuses[300]).toBe(429);
  });
});
