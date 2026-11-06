import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { startScheduler } from './jobs/scheduler.js';
import { attachRealtime } from './lib/realtime.js';

const server = createServer(createApp());
attachRealtime(server);
startScheduler();

server.listen(env.PORT, () => {
  console.log(`Shikshya API listening on http://localhost:${env.PORT}`);
});
