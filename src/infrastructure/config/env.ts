import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  METRICS_API_BASE: z.string().url().default('http://localhost:3000'),
  METRICS_API_KEY: z.string().optional(),
  APP_TIMEZONE: z.string().default('America/Argentina/Buenos_Aires'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  ENABLE_SCHEDULER: z
    .string()
    .transform(val => val === 'true')
    .default('true'),
  ALERTS_DATABASE_URL: z.string().url().optional(),
  HTTP_TIMEOUT_MS: z.string().transform(Number).default('10000'),
  HTTP_RETRIES: z.string().transform(Number).default('3'),
  HTTP_BACKOFF_BASE_MS: z.string().transform(Number).default('250'),
  HTTP_BACKOFF_MAX_MS: z.string().transform(Number).default('4000'),
  PORT: z.string().transform(Number).default('3001'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export const config: EnvConfig = envSchema.parse(process.env);

export const isDatabaseEnabled = (): boolean => {
  return config.ALERTS_DATABASE_URL !== undefined;
};
