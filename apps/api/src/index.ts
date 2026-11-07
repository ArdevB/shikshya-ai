import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { startScheduler } from './jobs/scheduler.js';
import { logger } from './lib/logger.js';
import { attachRealtime } from './lib/realtime.js';

const server = createServer(createApp());
attachRealtime(server);
startScheduler();

server.listen(env.PORT, () => {
  logger.info(`Shikshya API listening on port ${env.PORT}`);
  if (env.NODE_ENV === 'production' && env.STORAGE_DRIVER === 'local') {
    logger.warn(
      "Uploaded files are on this server's disk. Many hosts wipe it on every restart: set STORAGE_DRIVER=s3.",
    );
  }
});
