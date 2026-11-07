import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const development = {
  DATABASE_URL: 'postgresql://localhost/shikshya',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

const production = {
  ...development,
  NODE_ENV: 'production',
  WEB_ORIGIN: 'https://shikshya.example.com',
  API_PUBLIC_URL: 'https://api.shikshya.example.com',
  AI_SERVICE_URL: 'https://ai.shikshya.example.com',
  INTERNAL_KEY: 'c'.repeat(32),
};

describe('parseEnv', () => {
  it('accepts a minimal development setup and fills in the defaults', () => {
    const env = parseEnv(development);
    expect(env.PORT).toBe(4000);
    expect(env.STORAGE_DRIVER).toBe('local');
  });

  it('lists every missing setting at once, not only the first', () => {
    expect(() => parseEnv({})).toThrow(
      /DATABASE_URL is required[\s\S]*JWT_ACCESS_SECRET is required/,
    );
  });

  it('treats an empty value as not set, as .env.example leaves optional settings', () => {
    const env = parseEnv({ ...development, S3_ENDPOINT: '', KHALTI_SECRET_KEY: '' });
    expect(env.S3_ENDPOINT).toBeUndefined();
    expect(env.KHALTI_SECRET_KEY).toBeUndefined();
  });

  it('removes a trailing slash, which would otherwise break the CORS comparison', () => {
    expect(parseEnv({ ...development, WEB_ORIGIN: 'http://localhost:5173/' }).WEB_ORIGIN).toBe(
      'http://localhost:5173',
    );
  });

  it('needs the S3 settings as a set', () => {
    expect(() => parseEnv({ ...development, STORAGE_DRIVER: 's3' })).toThrow(
      /S3_BUCKET[\s\S]*S3_ACCESS_KEY_ID[\s\S]*S3_SECRET_ACCESS_KEY/,
    );
  });

  describe('in production', () => {
    it('accepts a complete setup', () => {
      expect(parseEnv(production).NODE_ENV).toBe('production');
    });

    it.each([
      ['a placeholder secret', { JWT_ACCESS_SECRET: `change-me-${'x'.repeat(32)}` }, /JWT_ACCESS/],
      ['the same secret twice', { JWT_REFRESH_SECRET: 'a'.repeat(32) }, /must be different/],
      ['no internal key', { INTERNAL_KEY: undefined }, /INTERNAL_KEY/],
      ['a short internal key', { INTERNAL_KEY: 'short' }, /at least 32/],
      ['a web origin without HTTPS', { WEB_ORIGIN: 'http://example.com' }, /WEB_ORIGIN/],
      ['a callback address without HTTPS', { API_PUBLIC_URL: 'http://x.com' }, /API_PUBLIC_URL/],
      ['an AI service left on localhost', { AI_SERVICE_URL: undefined }, /AI_SERVICE_URL/],
    ])('refuses to start with %s', (_name, change, message) => {
      expect(() => parseEnv({ ...production, ...change })).toThrow(message);
    });

    it('does not repeat secret values in its message', () => {
      const secret = `change-me-${'s'.repeat(32)}`;
      expect(() => parseEnv({ ...production, JWT_ACCESS_SECRET: secret })).toThrow(
        expect.not.objectContaining({ message: expect.stringContaining(secret) as string }),
      );
    });
  });
});
