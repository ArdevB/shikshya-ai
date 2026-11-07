/** Ports of their own, so browser tests never touch the app you may have running. */
export const WEB_URL = 'http://localhost:5174';
export const API_URL = 'http://localhost:4100';
export const DATABASE_PORT = 54331;
export const DATABASE_URL = `postgresql://shikshya:shikshya@localhost:${DATABASE_PORT}/shikshya_e2e`;

/** What the API needs. Seeding reads the same, so it can only ever touch this database. */
export const API_ENV = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'warn',
  PORT: '4100',
  DATABASE_URL,
  JWT_ACCESS_SECRET: 'e2e-access-secret-e2e-access-secret-e2e',
  JWT_REFRESH_SECRET: 'e2e-refresh-secret-e2e-refresh-secret-e2e',
  WEB_ORIGIN: WEB_URL,
  API_PUBLIC_URL: API_URL,
  UPLOAD_DIR: 'uploads-e2e',
  KHALTI_SECRET_KEY: 'pretend-khalti-key',
  KHALTI_BASE_URL: 'http://localhost:4101/api/v2',
  INTERNAL_KEY: 'e2e-internal-key',
  AI_SERVICE_URL: 'http://localhost:4199',
  RATE_LIMIT_SCALE: '1000',
  SMTP_HOST: '',
  GEMINI_API_KEY: '',
};

export const PASSWORD = 'Shikshya@123';
