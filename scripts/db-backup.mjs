/**
 * Saves a copy of the database to backups/, with pg_dump: `pnpm db:backup`.
 * Reads DATABASE_URL from the environment, or else from apps/api/.env.
 * To restore one, see docs/backup.md.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const file = join(root, 'apps', 'api', '.env');
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')).DATABASE_URL : undefined;
}

/** These settings are for Prisma's connection pool. pg_dump refuses to run if it sees them. */
function forPgDump(url) {
  const parsed = new URL(url);
  for (const name of ['connection_limit', 'pool_timeout', 'pgbouncer', 'schema']) {
    parsed.searchParams.delete(name);
  }
  return parsed.toString();
}

const url = databaseUrl();
if (!url) {
  console.error('No DATABASE_URL found. Set it, or add it to apps/api/.env.');
  process.exit(1);
}

const folder = join(root, 'backups');
mkdirSync(folder, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const file = join(folder, `shikshya-${stamp}.dump`);

// The custom format is compressed, and lets pg_restore pick out parts of a backup.
const result = spawnSync(
  'pg_dump',
  ['--format=custom', '--no-owner', `--file=${file}`, forPgDump(url)],
  {
    stdio: 'inherit',
  },
);

if (result.error?.code === 'ENOENT') {
  console.error(
    'pg_dump is not installed. It comes with the PostgreSQL client tools, version 18 or newer:\n' +
      'https://www.postgresql.org/download/',
  );
  process.exit(1);
}
if (result.status !== 0) {
  console.error('The backup failed. See the message above.');
  process.exit(result.status ?? 1);
}

const megabytes = (statSync(file).size / 1024 / 1024).toFixed(1);
console.log(`Saved ${file} (${megabytes} MB). It holds personal data, so keep it somewhere safe.`);
