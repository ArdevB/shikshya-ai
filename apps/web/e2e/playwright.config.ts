import { defineConfig } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_ENV, API_URL, WEB_URL } from './settings.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');

export default defineConfig({
  testDir: here,
  globalSetup: join(here, 'global-setup.ts'),
  outputDir: join(here, '..', 'test-results'),
  // The journeys share one database, and later ones build on what earlier ones saved.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: join(here, '..', 'playwright-report'), open: 'never' }],
  ],
  use: {
    baseURL: WEB_URL,
    // The Chrome already on this computer locally. CI installs Playwright's own.
    ...(process.env.CI ? {} : { channel: 'chrome' }),
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @shikshya/api exec tsx test/e2e-server.ts',
      cwd: root,
      url: `${API_URL}/health/live`,
      env: API_ENV,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      // The production build with Vercel's headers, so these tests see what visitors would.
      command:
        'pnpm --filter @shikshya/web exec vite build && pnpm --filter @shikshya/web exec vite preview --port 5174 --strictPort',
      cwd: root,
      url: WEB_URL,
      env: { E2E_API_URL: API_URL },
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
