/**
 * Runs a real Postgres 18 from npm, as an offline alternative to Neon: `pnpm db:local`.
 * It has no pgvector, so college-rules search falls back to keywords.
 * Data is kept in apps/api/.local-postgres. Leave this running while you develop.
 * It uses the same credentials as docker-compose.yml, so .env does not change.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const databaseDir = fileURLToPath(new URL('../.local-postgres', import.meta.url));
const alreadyInitialised = existsSync(`${databaseDir}/PG_VERSION`);

// Postgres cannot open a data folder made by another major version.
if (alreadyInitialised && !readFileSync(`${databaseDir}/PG_VERSION`, 'utf8').startsWith('18')) {
  console.error(
    `${databaseDir} was made by an older Postgres. It only holds local demo data, so delete that folder and run this again.`,
  );
  process.exit(1);
}

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
