import { z } from 'zod';

const withoutTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string({ required_error: 'DATABASE_URL is required' }).min(1),
  JWT_ACCESS_SECRET: z
    .string({ required_error: 'JWT_ACCESS_SECRET is required' })
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z
    .string({ required_error: 'JWT_REFRESH_SECRET is required' })
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  // A browser sends an origin with no slash on the end, so one here would fail every comparison.
  WEB_ORIGIN: z.string().url().default('http://localhost:5173').transform(withoutTrailingSlash),

  // Unset means the level for the environment: info, or silent during tests.
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),

  // How many proxies stand in front of the API, so rate limits see the visitor's real address.
  // Too high lets a visitor fake their address, so count them: 2 for Vercel in front of Render.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

  // Multiplies the per-minute limits on AI and payment routes. Only tests need to change it.
  RATE_LIMIT_SCALE: z.coerce.number().positive().default(1),

  // Uploaded files stay on this computer's disk, or go to S3-compatible storage such as Neon
  // Object Storage, Cloudflare R2 or AWS S3.
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('uploads'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  // Leave empty for AWS itself. Other providers give you one.
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // The address gateways send the browser back to. Must be reachable from the browser.
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000').transform(withoutTrailingSlash),

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

  // Google Gemini. With no key, the assistant says it is not set up.
  GEMINI_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('gemini-3.5-flash-lite'),
  EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),

  // The Python AI service. INTERNAL_KEY is the secret it requires from this API.
  AI_SERVICE_URL: z.string().url().default('http://localhost:8000').transform(withoutTrailingSlash),
  INTERNAL_KEY: z.string().optional(),
});

export type Env = z.output<typeof envSchema>;

const isPlaceholder = (value: string | undefined) => !value || value.includes('change-me');
const isLocal = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(url);

/** What must be true everywhere: settings that only work as a set. */
function storageProblems(env: Env): string[] {
  if (env.STORAGE_DRIVER !== 's3') return [];
  const required = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;
  return required
    .filter((name) => !env[name])
    .map((name) => `${name}: required when STORAGE_DRIVER is s3`);
}

/**
 * What must also be true on a live site. Each of these works, insecurely or not at all, without
 * crashing, so nobody would find out until something went wrong. Better to refuse to start.
 */
function productionProblems(env: Env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  const secrets = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'INTERNAL_KEY'] as const;
  for (const name of secrets) {
    if (isPlaceholder(env[name])) problems.push(`${name}: set your own long random value`);
  }
  if (env.INTERNAL_KEY && env.INTERNAL_KEY.length < 32) {
    problems.push('INTERNAL_KEY: must be at least 32 characters');
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    problems.push('JWT_REFRESH_SECRET: must be different from JWT_ACCESS_SECRET');
  }
  // Without HTTPS the browser refuses the refresh cookie, which has the Secure flag here.
  for (const name of ['WEB_ORIGIN', 'API_PUBLIC_URL'] as const) {
    if (!env[name].startsWith('https://')) problems.push(`${name}: must start with https://`);
  }
  if (isLocal(env.AI_SERVICE_URL)) {
    problems.push('AI_SERVICE_URL: must be the address of the deployed AI service');
  }
  return problems;
}

/**
 * Checks a set of settings, and throws one message listing everything wrong with them.
 * An empty value counts as not set, because that is how .env.example leaves optional settings.
 */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const provided = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ''));
  const parsed = envSchema.safeParse(provided);
  const problems = parsed.success
    ? [...storageProblems(parsed.data), ...productionProblems(parsed.data)]
    : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

  if (!parsed.success || problems.length > 0) {
    const list = problems.map((problem) => `  ${problem}`).join('\n');
    throw new Error(
      `Invalid environment configuration:\n${list}\nSee apps/api/.env.example for what each one means.`,
    );
  }
  return parsed.data;
}

export const env = parseEnv(process.env);
