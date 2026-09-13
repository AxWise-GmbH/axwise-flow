import { describe, expect, it } from 'vitest';
import {
  AssistantTurnEventBatchSchema as ServerBatchSchema,
  AssistantTurnEventSchema as ServerEventSchema,
  AssistantTurnEventTypeSchema,
} from '../../shared/workflow-v2/assistant-events.js';
import { AssistantRouteSchema } from '../../shared/workflow-v2/assistant-primitives.js';
import {
  AssistantTurnEventBatchSchema as BrowserBatchSchema,
  AssistantTurnEventSchema as BrowserEventSchema,
} from './assistant-event-validation.js';

const event = Object.freeze({
  id: '00000000-0000-4000-8000-000000000023',
  threadId: '00000000-0000-4000-8000-000000000021',
  turnId: '00000000-0000-4000-8000-000000000020',
  sequence: 6,
  type: 'completed',
  route: 'DIRECT_ANSWER',
  operationId: '00000000-0000-4000-8000-000000000024',
  retryOfTurnId: null,
  occurredAt: '2026-09-02T12:00:00.000+02:00',
});

function accepts(schema, value) {
  try {
    schema.parse(value);
    return true;
  } catch {
    return false;
  }
}

describe('browser Assistant event validation', () => {
  it('matches server defaults and accepts offset datetimes', () => {
    expect(BrowserEventSchema.parse(event)).toEqual(ServerEventSchema.parse(event));
  });

  it('accepts every route and event type declared by the server contract', () => {
    for (const route of AssistantRouteSchema.options) {
      expect(BrowserEventSchema.parse({ ...event, route }).route).toBe(route);
    }
    for (const type of AssistantTurnEventTypeSchema.options) {
      expect(BrowserEventSchema.parse({ ...event, type }).type).toBe(type);
    }
  });

  it.each([
    { ...event, unexpected: true },
    { ...event, id: 'not-a-uuid' },
    { ...event, route: 'UNKNOWN' },
    { ...event, type: 'unknown' },
    { ...event, sequence: 0 },
    { ...event, sequence: Number.MAX_SAFE_INTEGER + 1 },
    { ...event, id: 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF' },
    { ...event, occurredAt: '2026-09-02' },
    { ...event, payload: null },
    { ...event, payload: { ['x'.repeat(101)]: true } },
    { ...event, payload: { text: 'x'.repeat(16_384) } },
  ])('rejects the same malformed event shapes as the server schema', (candidate) => {
    expect(accepts(BrowserEventSchema, candidate)).toBe(false);
    expect(accepts(BrowserEventSchema, candidate)).toBe(accepts(ServerEventSchema, candidate));
  });

  it('keeps the strict batch boundary aligned with the server schema', () => {
    const batch = { events: [event], cursor: 6 };
    expect(BrowserBatchSchema.parse(batch)).toEqual(ServerBatchSchema.parse(batch));

    for (const candidate of [
      { ...batch, cursor: -1 },
      { ...batch, cursor: Number.MAX_SAFE_INTEGER + 1 },
      { ...batch, extra: true },
      { ...batch, events: Array.from({ length: 101 }, () => event) },
    ]) {
      expect(accepts(BrowserBatchSchema, candidate)).toBe(false);
      expect(accepts(BrowserBatchSchema, candidate)).toBe(accepts(ServerBatchSchema, candidate));
    }
  });

  it('normalizes prototype keys exactly like the authoritative record schema', () => {
    const candidate = { ...event, payload: JSON.parse('{"__proto__":{"polluted":true}}') };
    expect(BrowserEventSchema.parse(candidate)).toEqual(ServerEventSchema.parse(candidate));
  });
});
