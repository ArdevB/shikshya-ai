import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashRefreshToken } from '../src/lib/tokens.js';
import {
  api,
  bearer,
  createFixture,
  PASSWORD,
  prisma,
  resetDatabase,
  tokenFor,
} from './helpers.js';

const login = (email: string, password = PASSWORD) =>
  api().post('/api/v1/auth/login').send({ email, password });

const refreshCookie = (response: { headers: Record<string, unknown> }) => {
  const cookies = response.headers['set-cookie'] as unknown as string[];
  return cookies.find((c) => c.startsWith('shikshya_refresh='))!;
};
const tokenFromCookie = (cookie: string) => cookie.split(';')[0]!.split('=')[1]!;

describe('auth', () => {
  beforeAll(async () => {
    await resetDatabase();
    await createFixture();
  });

  it('logs in and returns the user with their profile id', async () => {
    const response = await login('student-a@test.local');
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('STUDENT');
    expect(response.body.user.studentId).toEqual(expect.any(String));
    expect(response.body.accessToken).toEqual(expect.any(String));
  });

  it('never returns the password hash', async () => {
    const response = await login('student-a@test.local');
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('stores the refresh token in an httpOnly cookie, hashed in the database', async () => {
    const cookie = refreshCookie(await login('student-a@test.local'));
    expect(cookie).toContain('HttpOnly');
    const token = tokenFromCookie(cookie);
    expect(await prisma.refreshToken.findUnique({ where: { tokenHash: token } })).toBeNull();
    expect(
      await prisma.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(token) } }),
    ).not.toBeNull();
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const wrongPassword = await login('student-a@test.local', 'nope');
    const unknownEmail = await login('nobody@test.local', 'nope');
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('rejects a deactivated account', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'teacher-b@test.local' } });
    const token = await tokenFor(user.email);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    expect((await login(user.email)).status).toBe(401);
    // An access token issued before deactivation stops working too.
    expect((await api().get('/api/v1/auth/me').set(bearer(token))).status).toBe(401);

    await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
  });

  it('requires a token for /me', async () => {
    expect((await api().get('/api/v1/auth/me')).status).toBe(401);
    expect((await api().get('/api/v1/auth/me').set(bearer('not-a-token'))).status).toBe(401);
  });

  it('uses the standard error shape', async () => {
    const response = await api().get('/api/v1/auth/me');
    expect(response.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: expect.any(String) },
    });
  });

  describe('refresh', () => {
    it('issues a new token and retires the old one', async () => {
      const cookie = refreshCookie(await login('student-a@test.local'));
      const response = await api().post('/api/v1/auth/refresh').set('X-Shikshya-Client', 'web').set('Cookie', cookie);
      expect(response.status).toBe(200);
      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(tokenFromCookie(refreshCookie(response))).not.toBe(tokenFromCookie(cookie));
    });

    it('ends all sessions when a used token comes back', async () => {
      const email = 'student-b@test.local';
      const first = refreshCookie(await login(email));
      const second = refreshCookie(await api().post('/api/v1/auth/refresh').set('X-Shikshya-Client', 'web').set('Cookie', first));

      const reuse = await api().post('/api/v1/auth/refresh').set('X-Shikshya-Client', 'web').set('Cookie', first);
      expect(reuse.status).toBe(401);

      const afterReuse = await api().post('/api/v1/auth/refresh').set('X-Shikshya-Client', 'web').set('Cookie', second);
      expect(afterReuse.status).toBe(401);
    });

    it('fails without a cookie', async () => {
      expect((await api().post('/api/v1/auth/refresh').set('X-Shikshya-Client', 'web')).status).toBe(401);
    });

    it('stops working after logout', async () => {
      const cookie = refreshCookie(await login('student-a@test.local'));
      expect((await api().post('/api/v1/auth/logout').set('X-Shikshya-Client', 'web').set('Cookie', cookie)).status).toBe(204);
      expect((await api().post('/api/v1/auth/refresh').set('X-Shikshya-Client', 'web').set('Cookie', cookie)).status).toBe(401);
    });
  });

  describe('change password', () => {
    beforeEach(async () => {
      await prisma.user.update({
        where: { email: 'parent@test.local' },
        data: { passwordHash: (await import('bcrypt')).default.hashSync(PASSWORD, 4) },
      });
    });

    it('requires the current password', async () => {
      const token = await tokenFor('parent@test.local');
      const response = await api()
        .post('/api/v1/auth/change-password')
        .set(bearer(token))
        .send({ currentPassword: 'wrong', newPassword: 'NewPassword1' });
      expect(response.status).toBe(400);
    });

    it('enforces the password rule', async () => {
      const token = await tokenFor('parent@test.local');
      const response = await api()
        .post('/api/v1/auth/change-password')
        .set(bearer(token))
        .send({ currentPassword: PASSWORD, newPassword: 'short' });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('changes the password and ends other sessions', async () => {
      const email = 'parent@test.local';
      const loginResponse = await login(email);
      const cookie = refreshCookie(loginResponse);

      const response = await api()
        .post('/api/v1/auth/change-password')
        .set(bearer(loginResponse.body.accessToken))
        .send({ currentPassword: PASSWORD, newPassword: 'NewPassword1' });
      expect(response.status).toBe(204);

      expect((await login(email)).status).toBe(401);
      expect((await login(email, 'NewPassword1')).status).toBe(200);
      expect((await api().post('/api/v1/auth/refresh').set('X-Shikshya-Client', 'web').set('Cookie', cookie)).status).toBe(401);
    });
  });

  describe('login rate limit', () => {
    it('blocks the 6th failed attempt for the same IP and email only', async () => {
      // A fresh app, so this limiter's counts do not leak into the other tests.
      const app = createApp();
      const attempt = (email: string, password = 'wrong-password') =>
        request(app).post('/api/v1/auth/login').send({ email, password });

      for (let i = 0; i < 5; i += 1) {
        expect((await attempt('admin@test.local')).status).toBe(401);
      }
      const blocked = await attempt('admin@test.local');
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('TOO_MANY_ATTEMPTS');

      // Even the right password is blocked now, but other accounts are unaffected.
      expect((await attempt('admin@test.local', PASSWORD)).status).toBe(429);
      expect((await attempt('student-a@test.local', PASSWORD)).status).toBe(200);
    });
  });
});
