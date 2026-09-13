// Local fixture tests only: importing the operator never invokes cloud tools.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCHEDULE_PREVIEW as fixed,
  validateSchedulePreviewSource,
  validateSchedulePreviewAdoption,
  validateSchedulePreviewCandidate,
  validateSchedulePreviewBusinessContract,
  validateSchedulePreviewDesign,
  validateSchedulePreviewDeployment,
  schedulePreviewReadOnly,
  pauseSchedulePreviewSafely,
  schedulePreviewInstruction,
} from './native-schedule-preview-e2e.mjs';
import { createBoundedHttpPolicy, reviewNativeWorkflow } from '../server/workflow-v2/native-workflow-review.js';
import { normalizeNativeWorkflow } from '../server/workflow-v2/native-workflow-runtime-contract.js';
import { canonicalJsonSha256 as hash } from '../services/agentic-control-plane/src/domain/canonical.js';

const id = '384d820a-19a4-4e3c-a612-eb677a690c27';
function fixture() {
  const workflow = {
    name: 'Preview trim fixture',
    nodes: [
      { id: 'input', name: 'Receive text', type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position: [0, 0], parameters: { httpMethod: 'POST', path: 'preview', responseMode: 'responseNode', options: {} } },
      { id: 'trim', name: 'Trim text', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [250, 0], parameters: { mode: 'raw', jsonOutput: '={{ {"text": $json.body.text.trim()} }}', options: {} } },
      { id: 'result', name: 'Return text', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.5, position: [500, 0], parameters: { respondWith: 'json', responseBody: '={{ {"text": $json.text} }}', options: {} } },
    ],
    connections: {
      'Receive text': { main: [[{ node: 'Trim text', type: 'main', index: 0 }]] },
      'Trim text': { main: [[{ node: 'Return text', type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1', executionTimeout: 30, saveDataSuccessExecution: 'none', saveDataErrorExecution: 'none' },
  };
  const spec = {
    kind: 'n8n_workflow_v2', runtimeProfile: 'request_automation', connections: [],
    requirements: [{ id: 'trim-text', description: 'Trim text' }],
    inputSchema: { type: 'object', properties: { text: { type: 'string', maxLength: 200 } }, required: ['text'], additionalProperties: false },
    outputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
    acceptanceCases: [{ id: 'trim-text', description: 'Trim text', requirementIds: ['trim-text'], input: { text: '  preview schedule  ' }, expectedOutput: { text: 'preview schedule' }, expectedStatus: 200, assertions: [] }],
  };
  const normalized = normalizeNativeWorkflow({ workflow, id });
  return { id, inputVersion: 1, runId: fixed.runId, agentId: fixed.agentId,
    name: 'Synthetic preview: scheduled text normalization', questions: [], spec, ...normalized };
}
const policy = createBoundedHttpPolicy({ imageDigest: fixed.nativeImage });
const source = () => ({ tenant_id: fixed.tenantId, owner_user_id: fixed.userId, solution_id: fixed.sourceSolutionId,
  build_id: fixed.sourceSolutionId, agent_id: fixed.agentId, run_id: fixed.runId,
  build_status: 'completed', build_owner: fixed.userId, run_owner: fixed.userId });
function fakePool(rows = []) {
  const queries = [], client = { query: async (sql, values) => { queries.push({ sql, values }); return { rows }; }, release: () => queries.push({ release: true }) };
  return { connect: async () => client, queries };
}

test('exact completed source binding cannot be replaced with another owner, Agent or task', () => {
  validateSchedulePreviewSource(source());
  for (const field of ['tenant_id', 'owner_user_id', 'solution_id', 'build_id', 'agent_id', 'run_id', 'build_owner', 'run_owner', 'build_status']) {
    assert.throws(() => validateSchedulePreviewSource({ ...source(), [field]: 'different' }));
  }
});
test('adoption accepts only a fresh exact-instruction UI Build and rejects old, edited or previously tested work', () => {
  const value = { id, tenant_id: fixed.tenantId, owner_user_id: fixed.userId, run_id: fixed.runId, agent_id: fixed.agentId,
    preparation_version: 2, status: 'draft', instruction: schedulePreviewInstruction(),
    create_hash: hash({ runId: fixed.runId, agentId: fixed.agentId, instruction: schedulePreviewInstruction() }),
    solution_id: null, environment_id: null, review: null, native_metadata: {}, agent_snapshot: { id: fixed.agentId, profileHash: 'a'.repeat(64) } };
  const event = { kind: 'created', build_request_id: id, tenant_id: fixed.tenantId, owner_user_id: fixed.userId };
  assert.equal(validateSchedulePreviewAdoption(value, event, id).buildId, id);
  for (const change of [
    { id: fixed.sourceSolutionId }, { owner_user_id: 'wrong' }, { run_id: id },
    { instruction: 'Different work' }, { create_hash: '0'.repeat(64) }, { status: 'reviewed' },
    { environment_id: fixed.environmentId }, { solution_id: id },
    { native_metadata: { pendingTest: { id } } }, { native_metadata: { testEvidence: { status: 'succeeded' } } },
  ]) assert.throws(() => validateSchedulePreviewAdoption({ ...value, ...change }, event, id));
  assert.throws(() => validateSchedulePreviewAdoption(value, { ...event, owner_user_id: 'wrong' }, id));
  assert.throws(() => validateSchedulePreviewAdoption(value, event, fixed.oldSolutionId));
});
test('local native fixture passes the actual pinned validator and exact approved business contract', () => {
  assert.deepEqual(validateSchedulePreviewCandidate(fixture(), policy), { input: { text: '  preview schedule  ' }, output: { text: 'preview schedule' }, workflowHash: fixture().workflowHash });
});
test('candidate gate rejects changed cases, output contract, wrong task, credential or provider node', () => {
  for (const mutate of [
    b => { b.spec.acceptanceCases[0].expectedOutput.text = 'false positive'; },
    b => { b.spec.acceptanceCases.push(structuredClone(b.spec.acceptanceCases[0])); },
    b => { b.spec.outputSchema.additionalProperties = true; },
    b => { b.runId = id; },
    b => { b.workflow.nodes[1].credentials = { httpHeaderAuth: { id: 'unowned' } }; b.workflowHash = hash(b.workflow); },
    b => { b.workflow.nodes[1].type = 'n8n-nodes-base.httpRequest'; b.workflowHash = hash(b.workflow); },
  ]) { const candidate = fixture(); mutate(candidate); assert.throws(() => validateSchedulePreviewCandidate(candidate, policy)); }
});
test('implicit response mode is a real runtime defect, not a weakened business-contract gate', () => {
  const candidate = fixture();
  candidate.workflow.nodes[2].parameters.respondWith = 'firstIncomingItem';
  delete candidate.workflow.nodes[2].parameters.responseBody;
  candidate.workflowHash = hash(candidate.workflow);
  validateSchedulePreviewBusinessContract(candidate);
  const checked = reviewNativeWorkflow({ workflow: candidate.workflow, spec: candidate.spec, runtimePolicy: policy, connections: [], environmentId: fixed.environmentId });
  assert.equal(checked.valid, true); assert.equal(checked.execution.allowed, false);
  assert.deepEqual(checked.execution.reasons.map(issue => issue.code), ['RUNTIME_RESPONSE_TYPE']);
  assert.throws(() => validateSchedulePreviewCandidate(candidate, policy));
});
test('read-only inspection sets exact tenant and owner, rolls back on success and failure', async () => {
  for (const fail of [false, true]) {
    const pool = fakePool();
    const action = schedulePreviewReadOnly(pool, async () => { if (fail) throw new Error('synthetic'); return 'ok'; });
    if (fail) await assert.rejects(action); else assert.equal(await action, 'ok');
    assert.deepEqual(pool.queries, [
      { sql: 'BEGIN READ ONLY', values: undefined },
      { sql: "SELECT set_config('orqaly.tenant_id',$1,true)", values: [fixed.tenantId] },
      { sql: "SELECT set_config('orqaly.build_owner_user_id',$1,true)", values: [fixed.userId] },
      { sql: 'ROLLBACK', values: undefined }, { release: true },
    ]);
  }
});
test('lost schedule response cleanup resolves only exact owned create key and pauses without creation', async () => {
  const pool = fakePool([{ id }]), calls = [];
  const result = await pauseSchedulePreviewSafely({ pool, buildId: id, schedules: { pause: async (...args) => { calls.push(args); return { schedule: { status: 'paused' } }; } } });
  assert.deepEqual(result, { status: 'paused', scheduleId: id });
  assert.deepEqual(calls, [[{ userId: fixed.userId }, id, id]]);
  assert.deepEqual(pool.queries.find(q => q.sql?.startsWith('SELECT id')).values, [fixed.tenantId, fixed.userId, id, `${fixed.prefix}-schedule`]);
});
test('absent or ambiguous recovery never creates a schedule or pauses guessed IDs', async () => {
  let calls = 0; const schedules = { pause: async () => { calls++; } };
  assert.deepEqual(await pauseSchedulePreviewSafely({ pool: fakePool(), buildId: id, schedules }), { status: 'not_created', scheduleId: null });
  await assert.rejects(pauseSchedulePreviewSafely({ pool: fakePool([{ id }, { id }]), buildId: id, schedules }));
  assert.equal(calls, 0);
});
test('completed design proof binds actual worker dispatch, canonical envelope, result and durable event', () => {
  const build = fixture(), operationId = '698f99d4-cf7f-4571-bce0-cf7823364070';
  const input = { type: 'PrepareSolutionV2', buildRequestId: id, inputVersion: 1, source: { runId: fixed.runId }, agent: { id: fixed.agentId } };
  const attempt = { tenant_id: fixed.tenantId, owner_user_id: fixed.userId, build_request_id: id, input_version: 1, operation_id: operationId,
    status: 'completed', dispatch_count: 1, input_hash: hash(input),
    envelope: { operationType: 'PrepareSolutionV2', operationId, owner: { tenantId: fixed.tenantId, userId: fixed.userId, organizationId: null }, workflow: { runId: fixed.runId }, input, canonicalInputHash: hash(input) },
    result: { schemaVersion: 'axwise.solution-preparation.v2', outcome: 'candidate', buildRequestId: id, inputVersion: 1, spec: build.spec, workflow: build.workflow } };
  const event = { kind: 'design_completed', tenant_id: fixed.tenantId, owner_user_id: fixed.userId, build_request_id: id, input_version: 1, details: { operationId, workflowHash: build.workflowHash } };
  assert.deepEqual(validateSchedulePreviewDesign(attempt, event, build), { operationId, inputHash: hash(input), resultHash: hash(attempt.result) });
  assert.throws(() => validateSchedulePreviewDesign({ ...attempt, dispatch_count: 0 }, event, build));
  assert.throws(() => validateSchedulePreviewDesign({ ...attempt, input_hash: '0'.repeat(64) }, event, build));
  assert.throws(() => validateSchedulePreviewDesign(attempt, { ...event, owner_user_id: 'wrong' }, build));
});
test('deployment gate requires exact image, sole canonical traffic and explicit003-only scheduling', () => {
  const name = 'orqaly-v2-api-preview';
  const service = { status: { conditions: [{ type: 'Ready', status: 'True' }], traffic: [{ revisionName: `${name}-exec-7b330159`, percent: 100 }] },
    spec: { template: { spec: { containers: [{ image: fixed.applicationImage, env: [
      { name: 'ORQALY_NATIVE_WORKFLOW_BUILDER_ENABLED', value: 'true' },
      { name: 'ORQALY_SOLUTION_SCHEDULES_ENABLED', value: 'true' },
      { name: 'ORQALY_SOLUTION_SCHEDULE_ENVIRONMENTS', value: JSON.stringify([fixed.environmentId]) },
      { name: 'ORQALY_SOLUTION_ENVIRONMENTS', valueFrom: { secretKeyRef: { name: 'orqaly-solution-preview-001-002-003-environments', key: '2' } } },
    ] }] } } } };
  validateSchedulePreviewDeployment(service, name);
  for (const mutate of [
    s => { s.spec.template.spec.containers[0].image += '-wrong'; },
    s => { s.status.traffic[0].percent = 99; },
    s => { s.status.traffic[0].revisionName += '-wrong'; },
    s => { s.spec.template.spec.containers[0].env[2].value = '["orqaly-customer-webhook-preview-002"]'; },
    s => { s.spec.template.spec.containers[0].env[3].valueFrom.secretKeyRef.key = 'latest'; },
  ]) { const changed = structuredClone(service); mutate(changed); assert.throws(() => validateSchedulePreviewDeployment(changed, name)); }
});
