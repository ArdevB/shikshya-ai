/**
 * Retakes the pictures in the README and user manual: `pnpm docs:screenshots`.
 * Starts the real AI service for the at-risk and timetable pages, then the Playwright run in
 * apps/web/e2e/screenshots.spec.ts, which uses its own throwaway database. Needs apps/ai/.venv.
 */
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const AI_URL = 'http://127.0.0.1:4199';

const python = join(
  root,
  'apps',
  'ai',
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
const ai = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--port', '4199', '--log-level', 'warning'], {
  cwd: join(root, 'apps', 'ai'),
  env: { ...process.env, INTERNAL_KEY: 'e2e-internal-key', GEMINI_API_KEY: '' },
  stdio: 'inherit',
});

let ready = false;
for (let attempt = 0; attempt < 80 && !ready; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  ready = await fetch(`${AI_URL}/health`)
    .then((response) => response.ok)
    .catch(() => false);
}

const run = ready
  ? spawnSync('pnpm exec playwright test --config apps/web/e2e/playwright.config.ts screenshots', {
      cwd: root,
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, SCREENSHOTS: '1' },
    })
  : { status: 1 };
if (!ready) console.error('The AI service did not start.');

if (process.platform === 'win32') {
  spawnSync('taskkill', ['/T', '/F', '/PID', String(ai.pid)], { stdio: 'ignore' });
} else {
  ai.kill();
}
process.exit(run.status ?? 1);
