import { describe, expect, it } from 'vitest';
import { AssistantTurnEventBatchSchema, AssistantTurnEventInputSchema } from './assistant-events.js';

const event = {
  id: '11111111-1111-4111-8111-111111111111',
  threadId: '22222222-2222-4222-8222-222222222222',
  turnId: '33333333-3333-4333-8333-333333333333',
  type: 'submitted',
  route: 'DIRECT_ANSWER',
  operationId: '44444444-4444-4444-8444-444444444444',
  retryOfTurnId: null,
  taskId: null,
  attemptId: null,
  payload: {},
  occurredAt: '2026-09-02T10:00:00.000Z',
};

describe('assistant lifecycle event contracts', () => {
  it('accepts a content-free immutable lifecycle event', () => {
    expect(AssistantTurnEventInputSchema.parse(event)).toEqual(event);
  });

  it('requires a positive monotonic sequence in public event batches', () => {
    expect(
      AssistantTurnEventBatchSchema.parse({ events: [{ ...event, sequence: 7 }], cursor: 7 })
    ).toBeTruthy();
    expect(() =>
      AssistantTurnEventBatchSchema.parse({ events: [{ ...event, sequence: 0 }], cursor: 0 })
    ).toThrow();
  });

  it('rejects prompt or result content in lifecycle events', () => {
    expect(() => AssistantTurnEventInputSchema.parse({ ...event, content: 'secret prompt' })).toThrow();
  });
});
