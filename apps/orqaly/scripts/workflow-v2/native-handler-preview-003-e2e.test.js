// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { HANDLER_ACCEPTANCE_003 as fixed, handler003AcceptanceCommand, validateHandler003Binding,
  validateHandler003Catalog, assertHandler003Ledger, createHandler003ProbeTransport, handler003SafeFailure,
  assertHandler003StoppedPreflight, handler003RecoveryInventory } from '../native-handler-preview-003-e2e.mjs';
import { createBoundedHttpPolicy } from '../../server/workflow-v2/native-workflow-review.js';
import { createNativeFailureProbeArtifact } from '../../server/workflow-v2/native-failure-probe.js';
import { materializeNativeBundle } from '../../server/workflow-v2/native-workflow-bundle.js';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';

const bindingFixture = () => ['001', '002', '003'].map((id) => ({ id: `orqaly-customer-webhook-preview-${id}`,
  origin: fixed.origin, tenantId: fixed.tenantId, userId: fixed.userId, useIdToken: true,
  apiKey: 'synthetic-not-an-actual-management-key', nativePolicy: {
    ...createBoundedHttpPolicy({ imageDigest: fixed.image.split('@')[1] }),
    ownedErrorHandlerProbe: true, backgroundExecution: 'instance_cpu_always' } }));
const ledger = () => ({ schemaVersion: 'orqaly.synthetic-handler003.v1', commandHash: fixed.commandHash,
  probeId: fixed.probeId, environmentId: fixed.environmentId, stage: 'prepared', executionAttempted: false });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
function originalStoppedEvidence() {
  const value = { schemaVersion: 'orqaly.synthetic-handler003.v1', scope: 'synthetic_runtime_only_not_customer_handler',
    stage: 'stopped', commandHash: fixed.commandHash, environmentId: fixed.environmentId, probeId: fixed.probeId,
    sourceWorkflowHash: 'e98f285b26270cafb2bcbfc4152744d00c795842304df9bcfcd46aeaceab6931',
    sourceBundleHash: '062de6ae3445a063ffa23f810d9b272e7fe7ef527e52c84c1d60849b6b5a9834',
    customerDatabaseWrites: false, customerWorkflowWrites: false, modelCalls: 0, providerCalls: 0,
    executionAttempted: false, passed: false, errorCode: 'HANDLER003_ACCEPTANCE_UNCONFIRMED', noExecutionRetry: true };
  return { value, text: `${JSON.stringify(value, null, 2)}\n`,
    lock: `${JSON.stringify({ mode: 'run-probe', commandHash: fixed.commandHash })}\n` };
}
function transportFixture({ reconcile = false } = {}) {
  const command = handler003AcceptanceCommand();
  const artifact = createNativeFailureProbeArtifact(command);
  const child = artifact.spec.ownedDependencies[0];
  const pins = [{ dependencyId: child.id, workflowId: 'child003', versionId: 'childVersion',
    workflowHash: hash(child.workflow), specHash: hash(child.spec) }];
  const main = materializeNativeBundle(artifact, pins).workflow;
  const records = [];
  const fetchImpl = vi.fn(async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/api/v1/workflows' && options.method === 'POST') {
      const workflow = JSON.parse(options.body), isChild = workflow.name === child.workflow.name;
      return json({ ...workflow, id: isChild ? 'child003' : 'main003', versionId: isChild ? 'childVersion' : 'mainVersion' });
    }
    return json({ data: [] });
  });
  const send = createHandler003ProbeTransport({ command, reconcile, fetchImpl, record: (value) => records.push(value) });
  const create = (workflow) => send(`${fixed.origin}/api/v1/workflows`, { method: 'POST', body: JSON.stringify(workflow) });
  return { command, artifact, child, main, records, fetchImpl, send, create };
}
describe('fixed synthetic003 handler operator guards', () => {
  it('recovery binds the exact original zero-dispatch stop and immutable lock bytes', () => {
    const evidence = originalStoppedEvidence();
    expect(assertHandler003StoppedPreflight(evidence.text, evidence.lock)).toEqual(evidence.value);
    expect(fixed.recoveryLedger).not.toBe(fixed.ledger);
    expect(() => assertHandler003StoppedPreflight(evidence.text, `${evidence.lock} `)).toThrow('lock_changed');
  });
  it.each([
    ['executionAttempted', true], ['stage', 'dispatching'], ['requests', []], ['result', { status: 'failed' }],
    ['metadata', { ready: true }], ['commandHash', 'f'.repeat(64)],
  ])('recovery rejects changed original evidence: %s', (key, value) => {
    const evidence = originalStoppedEvidence();
    expect(() => assertHandler003StoppedPreflight(`${JSON.stringify({ ...evidence.value, [key]: value }, null, 2)}\n`, evidence.lock)).toThrow();
  });
  it('recovery requires a complete unique inventory with neither deterministic derived graph', () => {
    const command = handler003AcceptanceCommand(), artifact = createNativeFailureProbeArtifact(command);
    const list = { data: [{ id: 'preserved', name: 'Unchanged synthetic existing workflow' }] };
    expect(handler003RecoveryInventory(list, command)).toEqual({ count: 1, sha256: hash(list.data) });
    for (const value of [{ ...list, nextCursor: 'more' }, { data: [...list.data, ...list.data] },
      { data: [{ id: 'probe', name: artifact.workflow.name }] },
      { data: [{ id: 'child', name: artifact.spec.ownedDependencies[0].workflow.name }] },
      { data: Array.from({ length: 101 }, (_, i) => ({ id: `id${i}`, name: 'other' })) }])
      expect(() => handler003RecoveryInventory(value, command)).toThrow();
  });
  it('reports only allowlisted preflight steps and numeric HTTP status, never arbitrary error text', () => {
    expect(handler003SafeFailure('node_catalog', 401)).toEqual({ failedStep: 'node_catalog', errorCode: 'HANDLER003_NODE_CATALOG_FAILED', httpStatus: 401 });
    expect(handler003SafeFailure('binding3_policy', 401)).toEqual({ failedStep: 'binding3_policy', errorCode: 'HANDLER003_BINDING_POLICY_FAILED' });
    expect(handler003SafeFailure('Bearer secret-token', 401)).toEqual({ failedStep: 'unknown', errorCode: 'HANDLER003_ACCEPTANCE_UNCONFIRMED' });
    for (const status of ['401 secret', -1, 600, {}, null])
      expect(handler003SafeFailure('node_catalog', status)).not.toHaveProperty('httpStatus');
  });
  it('pins the actual unit-test fixture and its exact independently derived pure failure artifact', () => {
    const value = handler003AcceptanceCommand();
    expect(hash(value)).toBe(fixed.commandHash);
    expect(value.allowExternalEffects).toBe(false);
    expect(value.probeId).toBe(value.invocationId);
    const derived = createNativeFailureProbeArtifact(value);
    expect(derived.workflowHash).toBe('cccd76663fc7c9401f6d25d66d6d3210c4999d35b6d9801c31c57d533cb21c0e');
    expect(derived.bundleHash).toBe('beef23f3cd69bd2c25c80cebf2998af444f692bc4d21f9601e6b69bf2ef0d8c2');
    expect(derived.spec.ownedDependencies[0].workflow.nodes).toEqual(value.spec.ownedDependencies[0].workflow.nodes);
  });
  it('accepts only exact binding003 owner and probe-only policy', () => {
    expect(validateHandler003Binding(bindingFixture()).id).toBe(fixed.environmentId);
  });
  it.each([
    ['owner', (v) => { v[2].userId = 'user_other'; }],
    ['tenant', (v) => { v[2].tenantId = 'other'; }],
    ['origin', (v) => { v[2].origin = 'https://other.example'; }],
    ['identity auth', (v) => { v[2].useIdToken = false; }],
    ['production bundles', (v) => { v[2].nativePolicy.ownedErrorHandlers = true; }],
    ['CPU promise', (v) => { delete v[2].nativePolicy.backgroundExecution; }],
    ['probe flag', (v) => { v[2].nativePolicy.ownedErrorHandlerProbe = false; }],
    ['node grant', (v) => { v[2].nativePolicy.allowedNodes.push({ type: 'n8n-nodes-base.errorTrigger', typeVersion: 1 }); }],
    ['duplicate binding', (v) => { v[1].id = v[2].id; }],
  ])('rejects changed binding: %s', (_label, change) => {
    const value = bindingFixture(); change(value); expect(() => validateHandler003Binding(value)).toThrow();
  });
  it('requires genuine actual catalog ErrorTrigger v1, no absent/ambiguous/unsupported substitute', () => {
    const type = { name: 'n8n-nodes-base.errorTrigger', version: 1, displayName: 'Error Trigger' };
    expect(validateHandler003Catalog([type])).toEqual({ name: type.name, version: 1, descriptionHash: hash(type) });
    for (const value of [[], [type, type], [{ ...type, version: 2 }], { data: [type] }])
      expect(() => validateHandler003Catalog(value)).toThrow();
  });
  it('prevents every fresh execution after an attempt and admits cleanup only for a pending actual attempt', () => {
    expect(() => assertHandler003Ledger(ledger(), 'run-probe')).not.toThrow();
    for (const stage of ['dispatching', 'stopped', 'result_recorded', 'verified'])
      expect(() => assertHandler003Ledger({ ...ledger(), stage }, 'run-probe')).toThrow('no_execution_retry');
    expect(() => assertHandler003Ledger(ledger(), 'reconcile-probe')).toThrow('no_attempt');
    expect(() => assertHandler003Ledger({ ...ledger(), executionAttempted: true, stage: 'stopped' }, 'reconcile-probe')).not.toThrow();
    expect(() => assertHandler003Ledger({ ...ledger(), executionAttempted: true, cleanup: { status: 'removed' } }, 'reconcile-probe')).toThrow('already_verified');
  });
  it.each(['commandHash', 'probeId', 'environmentId', 'schemaVersion'])('rejects changed durable ledger %s', (key) => {
    expect(() => assertHandler003Ledger({ ...ledger(), [key]: 'changed' }, 'run-probe')).toThrow();
  });
  it('permits only two exact derived creates and one controlled empty-body webhook; records no authority', async () => {
    const value = transportFixture();
    await value.create(value.child.workflow); await value.create(value.main);
    await value.send(`${fixed.origin}/api/v1/workflows/child003/publish`, { method: 'POST', body: '{"versionId":"childVersion"}' });
    await value.send(`${fixed.origin}/api/v1/workflows/main003/publish`, { method: 'POST', body: '{"versionId":"mainVersion"}' });
    const options = { method: 'POST', body: '{}', headers: { 'x-orqaly-invocation-id': fixed.probeId,
      'x-serverless-authorization': 'Bearer synthetic-google-transport-only' } };
    await value.send(`${fixed.origin}/webhook/solution-${fixed.probeId}`, options);
    await expect(value.send(`${fixed.origin}/webhook/solution-${fixed.probeId}`, options)).rejects.toThrow('retry_denied');
    expect(value.fetchImpl).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(value.records)).not.toContain('synthetic-google');
    expect(value.records.every((entry) => !('body' in entry) && !('headers' in entry))).toBe(true);
  });
  it('does not retry an uncertain create', async () => {
    const value = transportFixture(); value.fetchImpl.mockRejectedValueOnce(new Error('lost response'));
    await expect(value.create(value.child.workflow)).rejects.toThrow('lost response');
    await expect(value.create(value.child.workflow)).rejects.toThrow('create_retry_denied');
    expect(value.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('denies main create before child pin, changed graph and credentials endpoints before fetch', async () => {
    const value = transportFixture();
    await expect(value.create(value.main)).rejects.toThrow('child_pin_required');
    const child = structuredClone(value.child.workflow); child.nodes[1].parameters.jsonOutput = '={{ { "changed": true } }}';
    await expect(value.create(child)).rejects.toThrow('only_exact_derived');
    await expect(value.send(`${fixed.origin}/api/v1/credentials`, { method: 'POST', body: '{}' })).rejects.toThrow('unapproved');
    await expect(value.send('https://other.example/api/v1/workflows?limit=100')).rejects.toThrow('foreign_destination');
    expect(value.fetchImpl).not.toHaveBeenCalled();
  });
  it('denies every mutation of unknown/customer workflows and unsafe inventory pagination', async () => {
    const value = transportFixture();
    for (const method of ['PATCH', 'POST', 'DELETE'])
      await expect(value.send(`${fixed.origin}/api/v1/workflows/customer`, { method, body: '{}' })).rejects.toThrow();
    await expect(value.send(`${fixed.origin}/api/v1/workflows?limit=100&cursor=other`)).rejects.toThrow();
    expect(value.fetchImpl).not.toHaveBeenCalled();
  });
  it('cleanup mode cannot create, publish, retry or execute anything', async () => {
    const value = transportFixture({ reconcile: true });
    await expect(value.create(value.child.workflow)).rejects.toThrow('reconcile_must_not_create');
    await expect(value.send(`${fixed.origin}/webhook/solution-${fixed.probeId}`, { method: 'POST', body: '{}' })).rejects.toThrow('retry_denied');
    expect(value.fetchImpl).not.toHaveBeenCalled();
  });
  it.each(['Authorization', 'X-N8N-API-KEY'])('rejects %s leaking into the business webhook transport', async (name) => {
    const value = transportFixture(); await value.create(value.child.workflow); await value.create(value.main);
    await expect(value.send(`${fixed.origin}/webhook/solution-${fixed.probeId}`, { method: 'POST', body: '{}',
      headers: { 'x-orqaly-invocation-id': fixed.probeId, [name]: 'synthetic-authority' } })).rejects.toThrow('management_authority');
    expect(value.fetchImpl).toHaveBeenCalledTimes(2);
  });
});
