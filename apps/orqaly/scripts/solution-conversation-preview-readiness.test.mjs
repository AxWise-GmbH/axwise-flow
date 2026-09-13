import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJsonSha256 as hash } from '../services/agentic-control-plane/src/domain/canonical.js';
import { deterministicUuid } from '../server/workflow-v2/ids.js';
import {
  completedTurnEvidence,
  parseAuditArgs,
} from './solution-conversation-preview-readiness.mjs';

// Pure guard fixture only. No provider, Cloud SQL, cloud CLI, or runtime calls.
const turnId = '42214d0b-2f6c-4a12-9025-b9be1f52a78a';
const tenantId = 'c1b26d36-721b-5d8c-8d4c-180050ee9b94';
const ownerUserId = 'user_2vHlB9JhH4FazWsgKYENFIeAnMu';
const solutionId = '637fcfaf-3864-468b-ad36-47337b80c484';
const serviceUrl = 'https://axwise-test.invalid';
function fixture() {
  const command = { turnId, mode: 'ask', message: 'Private unit prompt, never evidence output.' };
  const context = {
    solutionId,
    source: { runId: '4ec6dfbe-d749-4c93-9f9c-4a5f4dbdbd36' },
    selectedInvocation: null,
  };
  const input = { type: 'AssistantTurnV1', message: command.message };
  const operationId = deterministicUuid(tenantId, turnId, 'solution-conversation-operation');
  const markdown = 'Private unit reply, never evidence output.';
  const metrics = {
    provider: 'google',
    model: 'gemini-test-only',
    modelVersion: 'gemini-test-version',
    latencyMs: 250,
    inputTokens: 100,
    outputTokens: 40,
    totalTokens: 140,
  };
  return {
    id: turnId,
    tenant_id: tenantId,
    owner_user_id: ownerUserId,
    solution_id: solutionId,
    mode: 'ask',
    status: 'completed',
    command,
    request_hash: hash(command),
    context_snapshot: context,
    context_hash: hash(context),
    operation_id: operationId,
    envelope: {
      operationId,
      operationType: 'AssistantTurnV1',
      owner: { tenantId, userId: ownerUserId },
      workflow: { runId: context.source.runId },
      input,
      canonicalInputHash: hash(input),
    },
    status_url: `${serviceUrl}/v2/operations/${operationId}?tenantId=${tenantId}`,
    reply: { markdown },
    result: { resultType: 'assistant_turn_completed', response: { markdown }, metrics },
    model: metrics,
    target_revision_id: null,
    draft_revision_id: null,
    lease_token: null,
    lease_expires_at: null,
    error_code: null,
    completed_at: '2026-09-06T12:00:00.000Z',
  };
}

test('no arguments retains the before-Ask baseline, exact UUID enables only read-only completion', () => {
  assert.deepEqual(parseAuditArgs([]), { completedTurnId: null });
  assert.deepEqual(parseAuditArgs(['--completed-turn', turnId]), { completedTurnId: turnId });
  for (const args of [
    ['--completed-turn'],
    ['--completed-turn', 'latest'],
    ['--apply'],
    ['--completed-turn', turnId, '--apply'],
    ['--solution', solutionId],
  ])
    assert.throws(() => parseAuditArgs(args));
});

test('exact completed Ask yields only hashes, safe metrics and operation bindings', () => {
  const row = fixture();
  const evidence = completedTurnEvidence(row, turnId, serviceUrl);
  assert.equal(evidence.id, turnId);
  assert.equal(evidence.mode, 'ask');
  assert.equal(evidence.reply.characters, row.reply.markdown.length);
  assert.match(evidence.reply.sha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.statusUrlBoundToOperationAndTenant, true);
  assert(!JSON.stringify(evidence).includes('Private unit'));
  assert(!Object.hasOwn(evidence, 'command'));
  assert(!Object.hasOwn(evidence, 'envelope'));
  assert(!Object.hasOwn(evidence, 'statusUrl'));
});

for (const [name, mutate] of [
  [
    'foreign tenant',
    (row) => {
      row.tenant_id = turnId;
    },
  ],
  [
    'foreign owner',
    (row) => {
      row.owner_user_id = 'user_other';
    },
  ],
  [
    'different Solution',
    (row) => {
      row.solution_id = turnId;
    },
  ],
  [
    'different turn',
    (row) => {
      row.id = solutionId;
    },
  ],
  [
    'pending Ask',
    (row) => {
      row.status = 'running';
    },
  ],
  [
    'Change request',
    (row) => {
      row.mode = 'change';
    },
  ],
  [
    'consented invocation',
    (row) => {
      row.command.includeInvocation = { id: turnId, inputOutput: true };
    },
  ],
  [
    'unconsented payload',
    (row) => {
      row.context_snapshot.selectedInvocation = { id: turnId };
    },
  ],
  [
    'created draft',
    (row) => {
      row.draft_revision_id = turnId;
    },
  ],
  [
    'altered command hash',
    (row) => {
      row.command.message = 'Changed';
    },
  ],
  [
    'altered context hash',
    (row) => {
      row.context_snapshot.solutionId = turnId;
    },
  ],
  [
    'different operation',
    (row) => {
      row.envelope.operationId = turnId;
    },
  ],
  [
    'altered input hash',
    (row) => {
      row.envelope.input.message = 'Changed';
    },
  ],
  [
    'foreign status origin',
    (row) => {
      row.status_url = row.status_url.replace(serviceUrl, 'https://other.invalid');
    },
  ],
  [
    'foreign status tenant',
    (row) => {
      row.status_url = row.status_url.replace(tenantId, turnId);
    },
  ],
  [
    'status URL bearer parameter',
    (row) => {
      row.status_url += '&token=private';
    },
  ],
  [
    'empty persisted reply',
    (row) => {
      row.reply.markdown = '';
    },
  ],
  [
    'mismatched reply',
    (row) => {
      row.reply.markdown = 'Different';
    },
  ],
  [
    'missing metrics',
    (row) => {
      row.model = null;
    },
  ],
  [
    'zero model usage',
    (row) => {
      row.model.outputTokens = 0;
    },
  ],
  [
    'unfinished lease',
    (row) => {
      row.lease_token = turnId;
    },
  ],
]) {
  test(`rejects ${name}`, () => {
    const row = fixture();
    mutate(row);
    assert.throws(() => completedTurnEvidence(row, turnId, serviceUrl));
  });
}
