/**
 * Runs a real Postgres 16 from npm, for machines without Docker: `pnpm db:local`.
 * Data is kept in apps/api/.local-postgres. Leave this running while you develop.
 * It uses the same credentials as docker-compose.yml, so .env does not change.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const databaseDir = fileURLToPath(new URL('../.local-postgres', import.meta.url));
const alreadyInitialised = existsSync(`${databaseDir}/PG_VERSION`);

const postgres = new EmbeddedPostgres({
  databaseDir,
  user: 'shikshya',
  password: 'shikshya',
  port: 5432,
  persistent: true,
});

if (!alreadyInitialised) {
  await postgres.initialise();
}
await postgres.start();
if (!alreadyInitialised) {
  await postgres.createDatabase('shikshya');
}

console.log('Postgres is running on port 5432. Press Ctrl+C to stop.');

const shutdown = async () => {
  await postgres.stop();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
