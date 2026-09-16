import { createHash } from 'node:crypto';

const UUID_NAMESPACE = 'orqaly.workflow.v2';

export function deterministicUuid(...parts) {
  const bytes = createHash('sha256')
    .update([UUID_NAMESPACE, ...parts].join('\u001f'))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function workflowIds(tenantId, commandId) {
  const seed = deterministicUuid(tenantId, commandId, 'workflow-command');
  return {
    runId: deterministicUuid(seed, 'run'),
    stageIds: {
      compileScope: deterministicUuid(seed, 'stage', 'compile-scope'),
      gate1: deterministicUuid(seed, 'stage', 'gate-1'),
      research: deterministicUuid(seed, 'stage', 'execute-research'),
      planning: deterministicUuid(seed, 'stage', 'planning'),
      gate2: deterministicUuid(seed, 'stage', 'gate-2'),
      evaluation: deterministicUuid(seed, 'stage', 'evaluation'),
      synthesis: deterministicUuid(seed, 'stage', 'synthesis'),
    },
    attemptId: deterministicUuid(seed, 'attempt', 'compile-scope', '1'),
    operationId: deterministicUuid(seed, 'operation', 'compile-scope', '1'),
  };
}
