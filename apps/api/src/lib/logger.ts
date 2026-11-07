import { pino } from 'pino';
import { env } from '../config/env.js';

/**
 * One JSON line per event in production, which log services can search. Readable lines in
 * development. pino-pretty is a dev dependency, so only development may ask for it.
 */
export const logger = pino({
  level: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info'),
  // A safety net. Nothing should log these, but a mistake must not leak them.
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[hidden]',
  },
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, singleLine: true, ignore: 'pid,hostname' },
        },
      }
    : {}),
});

export type ErrorReporter = (error: unknown, context: Record<string, unknown>) => void;

let reporter: ErrorReporter | null = null;

/**
 * The hook for an error tracker such as Sentry. To add one, call this once at startup:
 * `setErrorReporter((error, context) => Sentry.captureException(error, { extra: context }))`.
 */
export function setErrorReporter(next: ErrorReporter | null) {
  reporter = next;
}

/** For errors nobody expected: logs the error, and tells the error tracker if there is one. */
export function reportError(error: unknown, message: string, context: Record<string, unknown> = {}) {
  logger.error({ err: error, ...context }, message);
  try {
    reporter?.(error, { message, ...context });
  } catch (reporterError) {
    // A broken error tracker must never turn one problem into two.
    logger.error({ err: reporterError }, 'The error reporter failed');
  }
}
