// Browser-only mirror of the Assistant event wire contract. The authoritative
// server schema remains in shared/workflow-v2/assistant-events.js; keeping this
// small parser here avoids retaining all of Zod in the launch bundle merely to
// validate JSON that crosses the SSE boundary.

const ROUTES = new Set([
  'DIRECT_ANSWER',
  'DISCOVER',
  'AXWISE_ONE_SHOT',
  'PROPOSE_GOAL',
  'START_GOAL',
  'CONTINUE_GOAL',
]);

const EVENT_TYPES = new Set([
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

const EVENT_KEYS = new Set([
  'id',
  'threadId',
  'turnId',
  'type',
  'route',
  'operationId',
  'retryOfTurnId',
  'taskId',
  'attemptId',
  'payload',
  'occurredAt',
  'sequence',
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID_SENTINELS = new Set([
  '00000000-0000-0000-0000-000000000000',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
]);
const DATE = '(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|02-(?:0[1-9]|1\\d|2[0-8])))';
const TIME = '(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?';
const OFFSET_DATETIME = new RegExp(
  `^${DATE}T${TIME}(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$`,
  'u'
);

function invalid(path) {
  throw new Error(`Invalid Assistant event ${path}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireUuid(value, path, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || (!UUID.test(value) && !UUID_SENTINELS.has(value))) invalid(path);
  return value;
}

function parsePayload(value) {
  if (!isRecord(value)) invalid('payload');
  if (Object.keys(value).some((key) => key.length < 1 || key.length > 100)) {
    invalid('payload key');
  }
  if (JSON.stringify(value).length > 16_384) invalid('payload size');
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '__proto__'));
}

function parseAssistantTurnEvent(value) {
  if (!isRecord(value) || Object.keys(value).some((key) => !EVENT_KEYS.has(key))) {
    invalid('object');
  }
  if (!EVENT_TYPES.has(value.type)) invalid('type');
  if (!ROUTES.has(value.route)) invalid('route');
  if (typeof value.occurredAt !== 'string' || !OFFSET_DATETIME.test(value.occurredAt)) {
    invalid('occurredAt');
  }
  if (!Number.isSafeInteger(value.sequence) || value.sequence <= 0) invalid('sequence');

  return {
    id: requireUuid(value.id, 'id'),
    threadId: requireUuid(value.threadId, 'threadId'),
    turnId: requireUuid(value.turnId, 'turnId'),
    type: value.type,
    route: value.route,
    operationId: requireUuid(value.operationId, 'operationId', true),
    retryOfTurnId: requireUuid(value.retryOfTurnId, 'retryOfTurnId', true),
    taskId: requireUuid(value.taskId ?? null, 'taskId', true),
    attemptId: requireUuid(value.attemptId ?? null, 'attemptId', true),
    payload: parsePayload(value.payload === undefined ? {} : value.payload),
    occurredAt: value.occurredAt,
    sequence: value.sequence,
  };
}

function parseAssistantTurnEventBatch(value) {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== 'events' && key !== 'cursor') ||
    !Array.isArray(value.events) ||
    value.events.length > 100 ||
    !Number.isSafeInteger(value.cursor) ||
    value.cursor < 0
  ) {
    invalid('batch');
  }
  return { events: value.events.map(parseAssistantTurnEvent), cursor: value.cursor };
}

export const AssistantTurnEventSchema = Object.freeze({ parse: parseAssistantTurnEvent });
export const AssistantTurnEventBatchSchema = Object.freeze({ parse: parseAssistantTurnEventBatch });
