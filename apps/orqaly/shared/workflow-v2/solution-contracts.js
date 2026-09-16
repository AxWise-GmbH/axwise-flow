import { z } from 'zod';
import { NativeJsonSchema, isBoundedNativeJson } from './native-workflow-contracts.js';

const field = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/)
  .refine((value) => !['constructor', 'prototype', '__proto__'].includes(value));
export const SolutionSpecSchema = z
  .object({
    kind: z.literal('webhook_transform_v1'),
    fields: z
      .array(
        z
          .object({
            source: field,
            target: field,
            transform: z.enum(['copy', 'trim', 'lowercase', 'uppercase']),
          })
          .strict()
      )
      .min(1)
      .max(12),
  })
  .strict()
  .refine(
    (value) => new Set(value.fields.map((item) => item.target)).size === value.fields.length,
    'Output field names must be unique'
  );

export const CreateSolutionSchema = z
  .object({
    agentId: z.uuid(),
    name: z.string().trim().min(1).max(120),
    purpose: z.string().trim().min(1).max(2000),
    spec: SolutionSpecSchema,
  })
  .strict();

export const SolutionDecisionSchema = z
  .object({
    action: z.enum(['deploy', 'activate', 'pause']),
    workflowHash: z.string().regex(/^[a-f0-9]{64}$/),
    bundleHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    environmentId: z
      .string()
      .regex(/^[a-z0-9-]{8,63}$/)
      .nullable(),
  })
  .strict();

export const SolutionInputSchema = z
  .record(field, z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()]))
  .refine(
    (value) => Object.keys(value).length <= 24 && JSON.stringify(value).length <= 16000,
    'Input must be at most 24 scalar fields and 16 KB'
  );

export const SolutionInvocationSchema = z
  .object({
    mode: z.enum(['test', 'production']),
    allowExternalEffects: z.boolean().optional(),
    workflowHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    bundleHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    input: NativeJsonSchema.pipe(
      z.union([
        SolutionInputSchema,
        NativeJsonSchema.refine(
          (value) => isBoundedNativeJson(value, { maxBytes: 16000 }),
          'Native invocation input is limited to 16 KB'
        ),
      ])
    ),
  })
  .strict();

// Transport only. The service must still select V1 scalar validation or the
// persisted V2 inputSchema by authenticated Solution kind before dispatch.
export const SolutionInvocationInputSchema = SolutionInvocationSchema.shape.input;
export const SolutionRevisionInvocationSchema = SolutionInvocationSchema.omit({ mode: true });
