/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Browser tests run their own API on another port, so they cannot disturb the one you are using.
const apiTarget = process.env.E2E_API_URL ?? 'http://localhost:4000';

/** The security headers Vercel sends, so `vite preview` behaves the same and tests can catch a
 * page the Content Security Policy would break. */
function productionHeaders() {
  const { headers } = JSON.parse(readFileSync(src('./vercel.json'), 'utf8')) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const everyPage = headers.find((group) => group.source === '/(.*)')?.headers ?? [];
  return Object.fromEntries(everyPage.map(({ key, value }) => [key, value]));
}

export default defineConfig({
  plugins: [react()],
  preview: { headers: productionHeaders() },
  resolve: {
    alias: {
      '@': src('./src'),
      // Use the shared package's source directly, so changes show up instantly.
      '@shikshya/shared': src('../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    // The browser only talks to one origin, which keeps the refresh cookie simple.
    proxy: {
      '/api': apiTarget,
      '/socket.io': { target: apiTarget, ws: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Libraries change rarely, so they are cached separately from the app's own code.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          data: ['@tanstack/react-query', 'zod', 'react-hook-form', '@hookform/resolvers'],
          motion: ['motion/react'],
          charts: ['recharts'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: false,
    // Playwright has its own folder and its own runner.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
    },
  },
});
