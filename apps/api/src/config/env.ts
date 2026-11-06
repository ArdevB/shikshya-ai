import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('uploads'),

  // The address gateways send the browser back to. Must be reachable from the browser.
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),

  // Defaults are eSewa's published test values, from its developer docs. Production overrides them.
  ESEWA_PRODUCT_CODE: z.string().default('EPAYTEST'),
  ESEWA_SECRET_KEY: z.string().default('8gBm/:&EnhH.1/q'),
  ESEWA_FORM_URL: z.string().url().default('https://rc-epay.esewa.com.np/api/epay/main/v2/form'),
  ESEWA_STATUS_URL: z
    .string()
    .url()
    .default('https://rc.esewa.com.np/api/epay/transaction/status/'),

  // From test-admin.khalti.com for testing. With no key, Khalti says it is not set up.
  KHALTI_SECRET_KEY: z.string().optional(),
  KHALTI_BASE_URL: z.string().url().default('https://dev.khalti.com/api/v2'),

  // With no SMTP_HOST, emails are logged rather than sent.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Shikshya <no-reply@shikshya.test>'),

  // For example --no-sandbox inside a container.
  PUPPETEER_ARGS: z.string().optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(
      `Invalid environment configuration:\n${problems.join('\n')}\nCopy apps/api/.env.example to apps/api/.env and fill it in.`,
    );
  }
  return parsed.data;
}

export const env = loadEnv();
