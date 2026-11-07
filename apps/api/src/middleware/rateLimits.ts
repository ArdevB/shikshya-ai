import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';

const MINUTE = 60_000;

interface Limit {
  windowMs: number;
  limit: number;
  message: string;
  code?: string;
  key: (req: Request) => string;
  /** Counts only failures, so people who get it right are never held back. */
  onlyFailures?: boolean;
}

/** Counts are kept in memory, which is enough for one API process. */
const limiter = ({
  windowMs,
  limit,
  message,
  code = 'TOO_MANY_REQUESTS',
  key,
  onlyFailures = false,
}: Limit) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: onlyFailures,
    keyGenerator: key,
    handler: (_req, _res, next) => {
      next(new ApiError(429, code, message));
    },
  });

const byAddress = (req: Request) => ipKeyGenerator(req.ip ?? '');
const byUser = (req: Request) => req.user?.id ?? byAddress(req);

/** 5 failed attempts per 15 minutes, per address and email. Successful logins do not count. */
export const loginLimit = () =>
  limiter({
    windowMs: 15 * MINUTE,
    limit: 5,
    onlyFailures: true,
    code: 'TOO_MANY_ATTEMPTS',
    message: 'Too many login attempts. Try again in 15 minutes.',
    key: (req) => {
      const email = String((req.body as { email?: unknown } | undefined)?.email ?? '').toLowerCase();
      return `${byAddress(req)}|${email}`;
    },
  });

/**
 * For refresh and logout, which run without a login. High, because a whole college can share one
 * internet address, and each person refreshes a few times an hour.
 */
export const sessionLimit = () =>
  limiter({
    windowMs: 15 * MINUTE,
    limit: 1000,
    message: 'Too many requests. Please wait a few minutes.',
    key: byAddress,
  });

/** Every AI route, per person: reading these is cheap, but nobody needs more than this. */
export const aiLimit = () =>
  limiter({
    windowMs: MINUTE,
    limit: 120 * env.RATE_LIMIT_SCALE,
    message: 'Too many requests. Please wait a minute.',
    key: byUser,
  });

/**
 * The routes that spend Gemini quota or minutes of solver time. The assistant has its own limit per
 * hour, counted in the database, because it must survive a restart.
 */
export const expensiveAiLimit = () =>
  limiter({
    windowMs: MINUTE,
    limit: 20 * env.RATE_LIMIT_SCALE,
    message: 'That is a lot of AI requests in a short time. Please wait a minute.',
    key: byUser,
  });

/** Starting a payment, or asking a gateway about one. */
export const paymentLimit = () =>
  limiter({
    windowMs: MINUTE,
    limit: 20 * env.RATE_LIMIT_SCALE,
    message: 'Too many payment requests. Please wait a minute.',
    key: byUser,
  });

/** Gateways send the browser back here without a login, so this counts per address. */
export const paymentCallbackLimit = () =>
  limiter({
    windowMs: MINUTE,
    limit: 300 * env.RATE_LIMIT_SCALE,
    message: 'Too many requests. Please wait a minute.',
    key: byAddress,
  });
