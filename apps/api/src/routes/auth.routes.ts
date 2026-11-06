import { changePasswordBody, loginBody } from '@shikshya/shared';
import { Router, type Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { ApiError, unauthorized } from '../lib/errors.js';
import { REFRESH_TOKEN_TTL_MS } from '../lib/tokens.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { parseBody } from '../middleware/validate.js';
import * as authService from '../services/auth.service.js';

const REFRESH_COOKIE = 'shikshya_refresh';
const COOKIE_PATH = '/api/v1/auth';

const setRefreshCookie = (res: Response, token: string) =>
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });

export function authRoutes() {
  const router = Router();

  // 5 failed attempts per 15 minutes, per IP + email. Successful logins do not count.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const email = String((req.body as { email?: unknown })?.email ?? '').toLowerCase();
      return `${ipKeyGenerator(req.ip ?? '')}|${email}`;
    },
    handler: (_req, _res, next) => {
      next(
        new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Too many login attempts. Try again in 15 minutes.'),
      );
    },
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { refreshToken, ...session } = await authService.login(parseBody(req, loginBody));
    setRefreshCookie(res, refreshToken);
    res.json(session);
  });

  router.post('/refresh', async (req, res) => {
    const token = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    if (!token) throw unauthorized('Your session has expired');
    const { refreshToken, ...session } = await authService.refresh(token);
    setRefreshCookie(res, refreshToken);
    res.json(session);
  });

  router.post('/logout', async (req, res) => {
    await authService.logout((req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
    res.status(204).end();
  });

  router.get('/me', requireAuth, async (req, res) => {
    res.json(await authService.getMe(currentUser(req).id));
  });

  router.post('/change-password', requireAuth, async (req, res) => {
    await authService.changePassword(currentUser(req).id, parseBody(req, changePasswordBody));
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
    res.status(204).end();
  });

  return router;
}
