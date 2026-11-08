/**
 * Runs after `pnpm install`. Builds the shared package, and generates the Prisma client when the
 * API's packages are installed. Hosts that install only the web app, such as Vercel, have no API
 * packages, so that part is skipped there rather than failing the install.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (command) => execSync(command, { cwd: root, stdio: 'inherit' });

run('pnpm --filter @shikshya/shared build');

if (existsSync(join(root, 'apps', 'api', 'node_modules', 'prisma'))) {
  run('pnpm --filter @shikshya/api exec prisma generate');
} else {
  console.log('The API is not installed here, so the Prisma client is not generated.');
}
