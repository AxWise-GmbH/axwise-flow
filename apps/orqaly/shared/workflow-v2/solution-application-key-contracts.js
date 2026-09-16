import { z } from 'zod';
import { SolutionInvocationInputSchema } from './solution-contracts.js';
import { containsSolutionBuildSecret } from './solution-build-secrets.js';

export const SOLUTION_APP_KEY_POLICY = Object.freeze({
  defaultExpiryDays: 30,
  maxExpiryDays: 90,
  maxActiveKeys: 5,
  requestsPerMinute: 60,
  requestsPerDay: 1000,
  maxConcurrentInvocations: 1,
});
export const CreateSolutionApplicationKeySchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine(
        (value) => !containsSolutionBuildSecret(value) && !/orqaly_app_/i.test(value),
        'Use a descriptive name, not a credential.'
      ),
    expiresInDays: z.union([z.literal(30), z.literal(90)]).default(30),
    workflowHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const SolutionApplicationInvocationSchema = z
  .object({ input: SolutionInvocationInputSchema })
  .strict();
export const SolutionApplicationIdempotencyKeySchema = z
  .string()
  .min(8)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/);
