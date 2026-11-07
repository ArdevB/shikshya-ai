import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// CI points TEST_DATABASE_URL at a Postgres service. Locally, test/global-setup.ts
// starts a throwaway Postgres on this port, so neither Docker nor a dev database is touched.
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://shikshya:shikshya@localhost:54329/shikshya_test';

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The entry point only starts things, and tests replace the real PDF browser's launch path.
      exclude: ['src/index.ts', 'src/**/*.test.ts'],
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      // The Phase 5 target. Falling below it fails the run.
      thresholds: {
        'src/services/**/*.ts': { lines: 70, functions: 70, statements: 70, branches: 60 },
      },
    },
    // All test files share one database, so they run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret',
      WEB_ORIGIN: 'http://localhost:5173',
      UPLOAD_DIR: join(tmpdir(), 'shikshya-test-uploads'),
      KHALTI_SECRET_KEY: 'test-khalti-key',
      SMTP_HOST: '',
      // Test files make many requests as one person. test/rate-limits.test.ts uses the real limits.
      RATE_LIMIT_SCALE: '1000',
      // Tests replace both AI backends, and must never be able to reach the real ones.
      GEMINI_API_KEY: '',
      INTERNAL_KEY: 'test-internal-key',
      AI_SERVICE_URL: 'http://ai-service.test',
    },
  },
});
