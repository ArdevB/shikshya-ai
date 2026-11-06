import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('uploads'),
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
