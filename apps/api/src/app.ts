import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { reportError } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLog } from './middleware/requestLog.js';
import { protectedMounts, publicMounts } from './routes/index.js';

/** Builds the Express app without listening, so tests can drive it directly. */
export function createApp() {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(requestLog);
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // For the hosting platform's frequent checks. It leaves the database alone, so that Neon can
  // sleep when nobody is using the site.
  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // For people and monitors: is the whole API working, including its database?
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'ok' });
    } catch (error) {
      reportError(error, 'Health check could not reach the database');
      res.status(503).json({ status: 'unavailable', database: 'unreachable' });
    }
  });

  const api = Router();
  for (const [path, routes] of publicMounts()) api.use(path, routes);

  // Everything below here requires a logged-in user.
  api.use(requireAuth);
  for (const [path, routes] of protectedMounts()) api.use(path, routes);

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
