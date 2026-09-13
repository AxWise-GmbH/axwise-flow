import { z } from 'zod';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const SolutionFailureProbeCommandSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    workflowHash: hash,
    bundleHash: hash,
    confirmSyntheticFailure: z.literal(true),
  })
  .strict();

export const SolutionFailureProbeKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,160}$/);

// This operation never sends a customer's ordinary run payload or credentials.
// It tests a pure owned handler with a deliberately failing synthetic parent;
// it is not proof of source-main behavior or external message delivery.
export const FAILURE_PROBE_COVERAGE = 'handler_with_synthetic_failure';
