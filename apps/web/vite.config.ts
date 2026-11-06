/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
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
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: false,
  },
});
