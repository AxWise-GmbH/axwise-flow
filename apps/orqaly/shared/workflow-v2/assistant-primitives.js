import { z } from 'zod';

export const AssistantUuidSchema = z.string().uuid();

export const AssistantRouteSchema = z.enum([
  'DIRECT_ANSWER',
  'DISCOVER',
  'AXWISE_ONE_SHOT',
  'PROPOSE_GOAL',
  'START_GOAL',
  'CONTINUE_GOAL',
]);
