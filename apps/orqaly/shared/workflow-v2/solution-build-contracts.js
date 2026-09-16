import { z } from 'zod';
import { containsSolutionBuildSecret } from './solution-build-secrets.js';
import { NativeJsonSchema } from './native-workflow-contracts.js';
export { containsSolutionBuildSecret } from './solution-build-secrets.js';

export const SolutionBuildStatusSchema = z.enum([
  'preparing',
  'needs_input',
  'draft',
  'reviewed',
  'completed',
  'unsupported',
  'failed',
  'cancelled',
]);
export const SolutionBuildKeySchema = z
  .string()
  .min(8)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/);
export const SolutionBuildVersionSchema = z.number().int().min(0);
export const SolutionBuildHashSchema = z.string().regex(/^[a-f0-9]{64}$/);

const nonSecretText = (max) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) => !containsSolutionBuildSecret(value),
      'Secrets are not accepted here. Use a supported secure connection flow.'
    );
export const CreateSolutionBuildSchema = z
  .object({
    runId: z.uuid(),
    agentId: z.uuid().optional(),
    instruction: nonSecretText(24_000),
  })
  .strict();
export const AnswerSolutionBuildSchema = z
  .object({
    expectedVersion: SolutionBuildVersionSchema,
    questionId: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9_-]+$/),
    value: nonSecretText(2000),
  })
  .strict();
export const SaveSolutionBuildSchema = z
  .object({
    expectedVersion: SolutionBuildVersionSchema,
    workflowHash: SolutionBuildHashSchema,
    workflow: z
      .record(z.string(), z.unknown())
      .refine((value) => JSON.stringify(value).length <= 512_000, 'Draft is too large'),
  })
  .strict();
export const ReviewSolutionBuildSchema = z
  .object({ expectedVersion: SolutionBuildVersionSchema })
  .strict();
export const ConfirmSolutionBuildSchema = z
  .object({
    expectedVersion: SolutionBuildVersionSchema,
    workflowHash: SolutionBuildHashSchema,
  })
  .strict();

export const RepairSolutionBuildSchema = z
  .object({
    expectedVersion: SolutionBuildVersionSchema,
    workflowHash: SolutionBuildHashSchema,
    instruction: nonSecretText(4000).optional(),
  })
  .strict();

export const CancelSolutionBuildSchema = z
  .object({
    expectedVersion: SolutionBuildVersionSchema,
  })
  .strict();

export const RevokeSolutionBuildConnectionSchema = z
  .object({
    expectedVersion: SolutionBuildVersionSchema,
    connectionId: z.uuid(),
  })
  .strict();

export const TestSolutionBuildSchema = z
  .object({
    expectedVersion: SolutionBuildVersionSchema,
    workflowHash: SolutionBuildHashSchema,
    allowExternalEffects: z.boolean().default(false),
    repairOnFailure: z.boolean().default(true),
  })
  .strict();

// This DTO is accepted only by a dedicated, authenticated, no-store connection
// route. It MUST NOT be persisted as an ordinary answer, event or model input.
export const CreateSolutionBuildConnectionSchema = z
  .object({
    expectedVersion: SolutionBuildVersionSchema,
    requirementId: z.string().min(1).max(120),
    credentials: z
      .record(z.string().max(120), z.string().min(1).max(8000))
      .refine((v) => Object.keys(v).length <= 8),
  })
  .strict();

export const NativeSolutionInputSchema = NativeJsonSchema.refine(
  (value) => new TextEncoder().encode(JSON.stringify(value)).length <= 16000,
  'Invocation input is limited to 16 KB'
);
