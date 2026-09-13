import process from 'node:process';
import { z } from 'zod';

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z.string().min(1),
  ORQALY_PRINCIPAL_SIGNING_KEY: z.string().min(32),
  ORQALY_PRINCIPAL_AUDIENCE: z.string().min(1).default('orqaly-agentic-control-plane'),
  ORQALY_PRINCIPAL_MAX_TTL_SECONDS: z.coerce.number().int().min(1).max(300).default(300),
  AGENTIC_EXECUTION_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  AGENTIC_CAPABILITIES_JSON: z
    .string()
    .default('{"executors":[],"descriptors":[],"connections":[]}'),
  HTTP_JSON_LIMIT: z
    .string()
    .regex(/^\d+(?:kb|mb)$/i)
    .default('256kb'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3_600_000).default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(10_000).default(120),
  PLAN_APPROVAL_TTL_SECONDS: z.coerce.number().int().min(300).max(604_800).default(86_400),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
});

export function loadConfig(environment = process.env) {
  return EnvironmentSchema.parse(environment);
}
