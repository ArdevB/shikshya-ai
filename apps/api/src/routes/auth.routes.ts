import { changePasswordBody, loginBody } from '@shikshya/shared';
import { Router, type Response } from 'express';
import { env } from '../config/env.js';
import { unauthorized } from '../lib/errors.js';
import { REFRESH_TOKEN_TTL_MS } from '../lib/tokens.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { requireOurSite } from '../middleware/csrf.js';
import { loginLimit, sessionLimit } from '../middleware/rateLimits.js';
import { parseBody } from '../middleware/validate.js';
import * as authService from '../services/auth.service.js';

const REFRESH_COOKIE = 'shikshya_refresh';
const COOKIE_PATH = '/api/v1/auth';

const setRefreshCookie = (res: Response, token: string) =>
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    // Only sent on requests from our own site. The API is reached through the web app's address.
    sameSite: 'strict',
    path: COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });

export function authRoutes() {
  const router = Router();

  const sessions = sessionLimit();

  router.post('/login', loginLimit(), async (req, res) => {
    const { refreshToken, ...session } = await authService.login(parseBody(req, loginBody));
    setRefreshCookie(res, refreshToken);
    res.json(session);
  });

  router.post('/refresh', sessions, requireOurSite, async (req, res) => {
    const token = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    if (!token) throw unauthorized('Your session has expired');
    const { refreshToken, ...session } = await authService.refresh(token);
    setRefreshCookie(res, refreshToken);
    res.json(session);
  });

  router.post('/logout', sessions, requireOurSite, async (req, res) => {
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
