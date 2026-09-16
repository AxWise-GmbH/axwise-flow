import { z } from 'zod';
import { containsSolutionBuildSecret } from './solution-build-secrets.js';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const version = z.number().int().min(0).max(2147483647);
export const containsSolutionConversationSecret = (value) =>
  containsSolutionBuildSecret(value) ||
  /orqaly_app_/i.test(typeof value === 'string' ? value : JSON.stringify(value));
export const SolutionConversationKeySchema = z
  .string()
  .min(8)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/);
export const SolutionConversationDraftSchema = z
  .object({
    id: z.uuid(),
    rowVersion: version,
    workflowHash: hash,
  })
  .strict();
export const SolutionConversationTurnSchema = z
  .object({
    turnId: z.uuid(),
    mode: z.enum(['auto', 'ask', 'change']),
    message: z
      .string()
      .trim()
      .min(1)
      .max(8000)
      .refine(
        (value) => !containsSolutionConversationSecret(value),
        'Use the separate secure connection form for secrets.'
      ),
    expectedSolutionVersion: version,
    workflowHash: hash,
    draft: SolutionConversationDraftSchema.optional(),
    proposalRef: z
      .object({
        turnId: z.uuid(),
        proposalId: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
        proposalHash: hash,
      })
      .strict()
      .optional(),
    continuation: z
      .object({ turnId: z.uuid(), kind: z.enum(['answer', 'retry', 'resume_setup']) })
      .strict()
      .optional(),
    includeInvocation: z
      .object({ id: z.uuid(), inputOutput: z.literal(true) })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) => !(value.proposalRef && value.continuation),
    'Choose a proposal or continue a request, not both.'
  );
export const SolutionConversationReadSchema = z.object({ draftId: z.uuid().optional() }).strict();
export const SolutionConversationStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'blocked',
  'failed',
]);

export function solutionConversationEnabledFromEnvironment(environment = {}) {
  const value = environment.ORQALY_SOLUTION_CONVERSATIONS_ENABLED;
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error('ORQALY_SOLUTION_CONVERSATIONS_ENABLED must be true or false');
}
