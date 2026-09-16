import { z } from 'zod';

const UuidSchema = z.string().uuid();
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const DateTimeSchema = z.string().datetime({ offset: true });
const IdempotencyKeySchema = z
  .string()
  .min(8)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{7,199}$/);

export const ExecutableActionStatusSchema = z.enum([
  'proposed',
  'approved',
  'queued',
  'running',
  'succeeded',
  'failed',
  'rejected',
  'outcome_unknown',
]);

export const OperationalRecordInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    details: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();

export const ExecutableActionProposalSchema = z
  .object({
    version: z.literal('orqaly_executable_action_proposal_v1'),
    idempotencyKey: IdempotencyKeySchema,
    operation: z.literal('operational_record_create_v1'),
    input: OperationalRecordInputSchema,
  })
  .strict();

export const ExecutableActionDecisionSchema = z
  .object({
    version: z.literal('orqaly_executable_action_decision_v1'),
    idempotencyKey: IdempotencyKeySchema,
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

const ApprovalPresentationSchema = z
  .object({
    title: z.string().min(1).max(300),
    summary: z.string().min(1).max(1_000),
    operation: z
      .object({
        key: z.literal('operational_record_create_v1'),
        provider: z.literal('orqaly_internal'),
      })
      .strict(),
    target: z
      .object({
        type: z.literal('operational_record_store'),
        reference: z.string().min(1).max(512),
      })
      .strict(),
    parameters: OperationalRecordInputSchema,
    sideEffects: z.array(z.string().min(1).max(500)).min(1).max(10),
  })
  .strict();

export const OperationalRecordExecutionOutputSchema = z
  .object({
    recordId: UuidSchema,
    createdAt: DateTimeSchema,
    canonicalInputHash: HashSchema,
    receiptHash: HashSchema,
    signatureKeyId: z.string().min(1).max(200),
    signatureVerified: z.literal(true),
    idempotencyState: z.enum(['created', 'replayed']),
  })
  .strict();

const GatewayReceiptSchema = z
  .object({
    status: z.enum(['succeeded', 'failed', 'outcome_unknown']),
    receiptHash: HashSchema,
    signatureKeyId: z.string().min(1).max(200),
    signature: z.string().min(16).max(8_192),
    observedAt: DateTimeSchema,
    externalReferences: z.array(
      z
        .object({
          type: z.string().min(1).max(200),
          value: z.string().min(1).max(512),
        })
        .strict()
    ),
    output: OperationalRecordExecutionOutputSchema.nullable(),
    result: z
      .object({
        summary: z.string().min(1).max(1_000),
        url: z.string().url().max(2_048).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((receipt, context) => {
    if (receipt.status === 'succeeded' && receipt.output === null) {
      context.addIssue({
        code: 'custom',
        path: ['output'],
        message: 'successful receipt requires the verified descriptor output',
      });
    }
    if (receipt.status !== 'succeeded' && receipt.output !== null) {
      context.addIssue({
        code: 'custom',
        path: ['output'],
        message: 'non-success receipt cannot expose a successful descriptor output',
      });
    }
    if (
      receipt.output &&
      (receipt.output.receiptHash !== receipt.receiptHash ||
        receipt.output.signatureKeyId !== receipt.signatureKeyId)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['output'],
        message: 'descriptor output must reference the verified receipt and signing key',
      });
    }
  });

export const ExecutableActionSchema = z
  .object({
    id: UuidSchema,
    runId: UuidSchema,
    status: ExecutableActionStatusSchema,
    rowVersion: z.number().int().nonnegative(),
    agent: z.object({ id: UuidSchema, name: z.string().min(1).max(300) }).strict(),
    approval: z
      .object({
        status: z.enum(['pending', 'approved', 'rejected']),
        bindingHash: HashSchema,
        expiresAt: DateTimeSchema,
        presentation: ApprovalPresentationSchema,
      })
      .strict(),
    execution: z
      .object({
        executor: z.literal('self_hosted_n8n'),
        workflowId: UuidSchema,
        workflowVersion: z.string().min(1).max(64),
        executionReference: z.string().min(1).max(512).optional(),
        startedAt: DateTimeSchema.optional(),
        terminalAt: DateTimeSchema.optional(),
      })
      .strict()
      .nullable(),
    receipt: GatewayReceiptSchema.nullable(),
    error: z
      .object({
        code: z.string().min(1).max(200),
        message: z.string().min(1).max(2_000),
      })
      .strict()
      .nullable(),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
    recovery: z.literal('confirmed_not_applied').optional(),
  })
  .strict();

export const ExecutableActionAggregateSchema = z
  .object({
    version: z.literal('orqaly_executable_action_aggregate_v1'),
    action: ExecutableActionSchema.nullable(),
  })
  .strict();
