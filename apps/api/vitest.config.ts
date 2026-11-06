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
    },
  },
});
