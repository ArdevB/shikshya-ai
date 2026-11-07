import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LOCAL_URL = 'postgresql://shikshya:shikshya@localhost:54329/shikshya_test';

function applyMigrations(databaseUrl: string) {
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}

export default async function setup() {
  const externalUrl = process.env.TEST_DATABASE_URL;
  if (externalUrl) {
    applyMigrations(externalUrl);
    return;
  }

  const databaseDir = mkdtempSync(join(tmpdir(), 'shikshya-test-pg-'));
  const postgres = new EmbeddedPostgres({
    databaseDir,
    user: 'shikshya',
    password: 'shikshya',
    port: 54329,
    persistent: false,
    // Postgres 18's background I/O workers can outlive the forced stop this package uses on Windows,
    // and then hold the port, so the next test run cannot start. Tests do not need them.
    postgresFlags: ['-c', 'io_method=sync'],
    onLog: () => undefined,
  });
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('shikshya_test');
  applyMigrations(LOCAL_URL);

  return async () => {
    await postgres.stop();
    rmSync(databaseDir, { recursive: true, force: true });
  };
}
