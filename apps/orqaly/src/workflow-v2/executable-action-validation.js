// Browser projection guard. Full command, authority and signature validation
// remains on the server; importing its Zod runtime adds ~50 KB to every release.
// Keep this boundary small, with contract-parity tests for rendered snapshots.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const STATUSES = [
  'proposed',
  'approved',
  'queued',
  'running',
  'succeeded',
  'failed',
  'rejected',
  'outcome_unknown',
];
const TERMINAL = ['succeeded', 'failed', 'outcome_unknown'];
const string =
  (max, min = 1) =>
  (v) =>
    typeof v === 'string' && v.length >= min && v.length <= max;
const pattern = (re) => (v) => typeof v === 'string' && re.test(v);
const oneOf =
  (...values) =>
  (v) =>
    values.includes(v);
const optional = (check) => (v) => v === undefined || check(v);
const nullable = (check) => (v) => v === null || check(v);
const array =
  (check, min = 0, max = Infinity) =>
  (v) =>
    Array.isArray(v) && v.length >= min && v.length <= max && v.every(check);
const object = (fields) => (v) =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).every((key) => Object.hasOwn(fields, key)) &&
  Object.entries(fields).every(([key, check]) => check(v[key]));
const uuid = pattern(UUID);
const hash = pattern(HASH);
const date = (v) =>
  string(64)(v) && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
const url = (v) => {
  if (!string(2048)(v)) return false;
  try {
    return Boolean(new URL(v).protocol);
  } catch {
    return false;
  }
};
const output = object({
  recordId: uuid,
  createdAt: date,
  canonicalInputHash: hash,
  receiptHash: hash,
  signatureKeyId: string(200),
  signatureVerified: oneOf(true),
  idempotencyState: oneOf('created', 'replayed'),
});
const receiptShape = object({
  status: oneOf(...TERMINAL),
  receiptHash: hash,
  signatureKeyId: string(200),
  signature: string(8192, 16),
  observedAt: date,
  externalReferences: array(object({ type: string(200), value: string(512) })),
  output: nullable(output),
  result: object({ summary: string(1000), url: optional(url) }),
});
const receipt = (v) =>
  receiptShape(v) &&
  (v.status === 'succeeded' ? v.output !== null : v.output === null) &&
  (!v.output ||
    (v.output.receiptHash === v.receiptHash && v.output.signatureKeyId === v.signatureKeyId));
const action = object({
  id: uuid,
  runId: uuid,
  status: oneOf(...STATUSES),
  rowVersion: (v) => Number.isInteger(v) && v >= 0,
  agent: object({ id: uuid, name: string(300) }),
  approval: object({
    status: oneOf('pending', 'approved', 'rejected'),
    bindingHash: hash,
    expiresAt: date,
    presentation: object({
      title: string(300),
      summary: string(1000),
      operation: object({
        key: oneOf('operational_record_create_v1'),
        provider: oneOf('orqaly_internal'),
      }),
      target: object({ type: oneOf('operational_record_store'), reference: string(512) }),
      parameters: object({ title: string(120), details: optional(string(2000)) }),
      sideEffects: array(string(500), 1, 10),
    }),
  }),
  execution: nullable(
    object({
      executor: oneOf('self_hosted_n8n'),
      workflowId: uuid,
      workflowVersion: string(64),
      executionReference: optional(string(512)),
      startedAt: optional(date),
      terminalAt: optional(date),
    })
  ),
  receipt: nullable(receipt),
  error: nullable(object({ code: string(200), message: string(2000) })),
  createdAt: date,
  updatedAt: date,
  recovery: optional(oneOf('confirmed_not_applied')),
});
const aggregate = object({
  version: oneOf('orqaly_executable_action_aggregate_v1'),
  action: nullable(action),
});

export const ExecutableActionAggregateSchema = Object.freeze({
  parse(value) {
    if (!aggregate(value)) throw new Error('Invalid executable action snapshot');
    return value;
  },
});
