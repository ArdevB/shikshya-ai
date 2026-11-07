import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';

export const CSRF_HEADER = 'x-shikshya-client';

/**
 * For the routes that act on the refresh cookie. A browser attaches a cookie by itself, so another
 * website could try to trigger these. Three things stop that, each enough on its own in most cases:
 * the cookie is SameSite=Strict, a form on another site cannot set a custom header, and a browser
 * always states the Origin of a cross-site request, which is checked here.
 *
 * Every other route needs the access token in the Authorization header. A browser never adds that
 * by itself, so those routes cannot be attacked this way.
 */
export function requireOurSite(req: Request, _res: Response, next: NextFunction) {
  const { origin } = req.headers;
  if ((origin !== undefined && origin !== env.WEB_ORIGIN) || req.headers[CSRF_HEADER] !== 'web') {
    throw new ApiError(403, 'CSRF_REJECTED', 'This request did not come from the Shikshya website.');
  }
  next();
}
