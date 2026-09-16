import { z } from 'zod';
import { AssistantRouteSchema, AssistantUuidSchema } from './assistant-primitives.js';

export const AssistantTurnEventTypeSchema = z.enum([
  'routed',
  'retry_created',
  'submitted',
  'running',
  'completed',
  'failed',
  'progress',
  'tool_started',
  'tool_completed',
  'approval_requested',
  'input_requested',
  'cancel_requested',
  'cancelled',
]);

const AssistantTurnEventPayloadSchema = z
  .record(z.string().min(1).max(100), z.unknown())
  .refine((payload) => JSON.stringify(payload).length <= 16_384, {
    message: 'assistant event payload must contain at most 16384 JSON characters',
  });

export const AssistantTurnEventInputSchema = z
  .object({
    id: AssistantUuidSchema,
    threadId: AssistantUuidSchema,
    turnId: AssistantUuidSchema,
    type: AssistantTurnEventTypeSchema,
    route: AssistantRouteSchema,
    operationId: AssistantUuidSchema.nullable(),
    retryOfTurnId: AssistantUuidSchema.nullable(),
    taskId: AssistantUuidSchema.nullable().default(null),
    attemptId: AssistantUuidSchema.nullable().default(null),
    payload: AssistantTurnEventPayloadSchema.default({}),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const AssistantTurnEventSchema = AssistantTurnEventInputSchema.extend({
  sequence: z.number().int().positive(),
}).strict();

export const AssistantTurnEventBatchSchema = z
  .object({
    events: z.array(AssistantTurnEventSchema).max(100),
    cursor: z.number().int().nonnegative(),
  })
  .strict();
