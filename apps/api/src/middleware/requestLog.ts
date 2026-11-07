import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../lib/logger.js';

const SAFE_REQUEST_ID = /^[\w-]{1,64}$/;

/**
 * Logs each request when it finishes, with an id that also goes back in the X-Request-Id header, so
 * a person reporting a problem can quote the id and it can be found in the logs. An id from outside
 * is only reused if it looks harmless, because it ends up in those logs.
 */
export const requestLog = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id'];
    const id =
      typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
  customLogLevel: (_req, res, error) =>
    error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
  customProps: (req) => ({ userId: (req as { user?: { id: string } }).user?.id }),
  // Only the path: gateway callbacks and QR links carry tokens in the rest of the address, and
  // headers carry the access token and refresh cookie.
  serializers: {
    req: (req: { id: unknown; method: string; url: string }) => ({
      id: req.id,
      method: req.method,
      path: req.url.split('?')[0],
    }),
    res: (res: { statusCode: number }) => ({ status: res.statusCode }),
  },
});
