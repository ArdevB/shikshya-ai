/**
 * Runs the Python AI service as part of `pnpm dev`. Without its virtual environment the rest of the
 * app still runs, and the features that need it say the service is not running.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const folder = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'ai');
const python = join(
  folder,
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);

if (!existsSync(python)) {
  console.log('Skipping the AI service: it has no .venv yet. See "Commands" in the README.');
  process.exit(0);
}

// The API's settings are the one place for these, so a key only has to be added once.
const apiEnv = join(folder, '..', 'api', '.env');
const settings = existsSync(apiEnv) ? parseEnv(readFileSync(apiEnv, 'utf8')) : {};
const env = { ...process.env };
for (const name of ['INTERNAL_KEY', 'GEMINI_API_KEY', 'LLM_MODEL']) {
  if (settings[name]) env[name] = settings[name];
}

const args = ['-m', 'uvicorn', 'app.main:app', '--port', '8000', '--reload', '--reload-dir', 'app'];
args.push('--reload-dir', 'timetable', '--reload-dir', 'ml');

const child = spawn(python, args, { cwd: folder, stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
