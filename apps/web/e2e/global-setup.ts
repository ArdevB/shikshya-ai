import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_ENV, DATABASE_PORT, DATABASE_URL } from './settings.js';

const apiFolder = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'api');
const fromApi = createRequire(join(apiFolder, 'package.json'));

/**
 * A throwaway Postgres with the demo data, for each run. In CI, TEST_DATABASE_URL points to a
 * Postgres service instead. Seeding replaces a whole database, so it only runs against this one.
 */
export default async function globalSetup() {
  if (!DATABASE_URL.includes(`localhost:${DATABASE_PORT}/shikshya_e2e`)) {
    throw new Error('Browser tests must only ever seed their own database');
  }
  const env = { ...process.env, ...API_ENV };
  const run = (script: string, args: string[]) =>
    execFileSync(process.execPath, [script, ...args], { cwd: apiFolder, env, stdio: 'pipe' });

  // Loaded from the API's folder, because that is the package that depends on it.
  const { default: EmbeddedPostgres } = fromApi(
    'embedded-postgres',
  ) as typeof import('embedded-postgres');
  const databaseDir = mkdtempSync(join(tmpdir(), 'shikshya-e2e-pg-'));
  const postgres = new EmbeddedPostgres({
    databaseDir,
    user: 'shikshya',
    password: 'shikshya',
    port: DATABASE_PORT,
    persistent: false,
    postgresFlags: ['-c', 'io_method=sync'],
    onLog: () => undefined,
  });
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('shikshya_e2e');

  run(fromApi.resolve('prisma/build/index.js'), ['migrate', 'deploy']);
  run(fromApi.resolve('tsx/cli'), ['prisma/seed.ts']);

  return async () => {
    await postgres.stop();
    rmSync(databaseDir, { recursive: true, force: true });
    rmSync(join(apiFolder, API_ENV.UPLOAD_DIR), { recursive: true, force: true });
  };
}
