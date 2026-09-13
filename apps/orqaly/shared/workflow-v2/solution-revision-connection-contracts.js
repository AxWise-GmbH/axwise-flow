import { z } from 'zod';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const target = {
  expectedVersion: z.number().int().nonnegative(),
  workflowHash: hash,
  bundleHash: hash.optional(),
  confirmedScopeHash: hash,
  acknowledge: z.literal(true),
};
export const RevisionConnectionKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,160}$/);
export const CreateSolutionRevisionConnectionSchema = z.object({
  ...target,
  requirementId: z.string().min(1).max(320),
  credentials: z.record(z.string(), z.string().min(1).max(8000)).refine(
    (value) => Object.keys(value).length <= 4 && JSON.stringify(value).length <= 24000,
    'Connection fields are too large'
  ),
}).strict();
export const RevokeSolutionRevisionConnectionSchema = z.object({
  ...target,
  connectionId: z.uuid(),
}).strict();
