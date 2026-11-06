import type { Role } from '@shikshya/shared';
import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/tokens.js';

/** The logged-in user, as seen by route handlers and services. */
export interface CurrentUser {
  id: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- how Express documents extending Request
  namespace Express {
    interface Request {
      user?: CurrentUser;
    }
  }
}

/** Checks the access token, and that the account has not been deactivated since it was issued. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();

  let userId: string;
  try {
    userId = verifyAccessToken(header.slice('Bearer '.length)).sub;
  } catch {
    throw unauthorized('Your session has expired');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  });
  if (!user?.isActive) throw unauthorized();

  req.user = { id: user.id, role: user.role };
  next();
}

/** Only allows the listed roles. Use after requireAuth. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

/** For handlers behind requireAuth, where the user is guaranteed to be set. */
export function currentUser(req: Request): CurrentUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN'];
