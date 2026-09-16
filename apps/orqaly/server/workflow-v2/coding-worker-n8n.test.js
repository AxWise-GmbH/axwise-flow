// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { codingDispatchWorkflow, createCodingN8nLauncher } from './coding-worker-n8n.js';
import { createCodingWorkerService } from './coding-worker-service.js';
import { createCodingWorkerRouter } from './coding-worker-http.js';
import { codingWorkerConfiguredFromEnvironment } from './coding-worker-config.js';
import { codingHash, prepareCodingSpec, contentHash } from './coding-worker-contracts.js';
import { createSolutionRuntime } from './solution-runtime.js';
import { createBoundedHttpPolicy } from './native-workflow-review.js';
import { normalizeNativeWorkflow } from './native-workflow-runtime-contract.js';

const scope = { tenantId: randomUUID(), userId: 'user_codingScoped', solutionId: randomUUID(), runId: randomUUID() };
const environmentId = 'coding-native-environment'; const origin = 'https://orqaly.example.com';
function fixture() {
  const descriptor = { kind: 'node_offline_v1', image: `sha256:${'a'.repeat(64)}`, isolation: 'local_fixture', productionEligible: false };
  const source = 'export const x=1;'; const spec = prepareCodingSpec({ kind: 'node_source_patch_v1', title: 'Scoped patch', source: [{ path: 'x.mjs', content: source }],
    changes: [{ path: 'x.mjs', previousHash: contentHash(source), content: 'export const x=2;' }], tests: [{ path: 'x.test.mjs', content: 'test()' }], outputs: ['x.mjs'] }, descriptor);
  const job = { id: randomUUID(), status: 'approved', row_version: 1, spec, spec_hash: codingHash(spec), tenant_id: scope.tenantId, owner_user_id: scope.userId, solution_id: scope.solutionId, run_id: scope.runId };
  let dispatch;
  const store = {
    read: vi.fn(async () => structuredClone(job)), readDispatch: vi.fn(async () => dispatch),
    beginDispatch: vi.fn(async (_scope, _job, value) => { dispatch = { id: value.id, job_id: job.id, environment_id: value.environmentId, request_key: value.key, status: 'initiating', created_at: new Date(1000).toISOString() }; return { created: true, dispatch }; }),
    updateDispatch: vi.fn(async (_scope, _id, change) => { dispatch = { ...dispatch, status: change.status || 'initiating', credential_id: change.credentialId || dispatch.credential_id, evidence: change.evidence || dispatch.evidence }; return dispatch; }),
  };
  const runtime = { environmentIds: vi.fn(() => [environmentId]), createNativeCredential: vi.fn(async () => ({ id: 'owned-native-credential', status: 'saved' })),
    revokeNativeCredential: vi.fn(async () => ({ status: 'revoked' })), reconcileNativeCredential: vi.fn(async () => ({ status: 'removed' })), cleanupNativeTest: vi.fn(async () => ({ status: 'removed' })),
    testNative: vi.fn(async () => { job.status = 'queued'; job.row_version++; return { status: 'succeeded', output: { delivery: 'accepted', statusCode: 202 }, executionId: '21', testArtifactHash: 'b'.repeat(64), cleanup: { status: 'removed' } }; }) };
  const launcher = createCodingN8nLauncher({ runtime, store, environmentId, origin, now: () => 999999 });
  return { job, store, runtime, launcher, descriptor, dispatch: () => dispatch };
}
describe('n8n coding dispatch orchestration and recovery', () => {
  it('keeps capability only in the encrypted native credential and waits for actual durable queue acceptance', async () => {
    const f = fixture(); const result = await f.launcher.queue(scope, { job: f.job, token: 'synthetic.short-lived.claim', key: 'native-request-key' });
    expect(result).toMatchObject({ status: 'accepted', executionId: '21', queueAccepted: true, workflowCleanup: 'removed', credentialCleanup: 'removed' });
    expect(f.runtime.createNativeCredential.mock.calls[0][1].data).toEqual({ name: 'Authorization', value: 'Bearer synthetic.short-lived.claim' });
    expect(JSON.stringify(f.runtime.testNative.mock.calls)).not.toContain('synthetic.short-lived.claim');
    expect(JSON.stringify(f.store.updateDispatch.mock.calls)).not.toContain('synthetic.short-lived.claim');
    expect(f.runtime.testNative.mock.calls[0][1].workflow.nodes[1].parameters.url).toBe(`${origin}/coding/v1/jobs/${f.job.id}/dispatch`);
  });
  it('replays a lost same-key Run response after job queued without re-executing n8n', async () => {
    const f = fixture(), command = { runId: scope.runId, expectedVersion: 1, specHash: f.job.spec_hash };
    const service = createCodingWorkerService({ repository: { resolveTenant: async () => scope.tenantId }, store: f.store,
      sandbox: { descriptor: f.descriptor }, signingKey: Buffer.alloc(32, 4), launcher: f.launcher });
    await service.runReviewed(scope, scope.solutionId, f.job.id, command, 'native-request-key');
    expect(await service.runReviewed(scope, scope.solutionId, f.job.id, command, 'native-request-key')).toMatchObject({ job: { status: 'queued' }, orchestration: { status: 'accepted', replayed: true } });
    expect(f.runtime.testNative).toHaveBeenCalledTimes(1);
    await expect(service.runReviewed(scope, scope.solutionId, f.job.id, command, 'different-request-key')).rejects.toThrow('CODING_RUN_STATE_CONFLICT');
  });
  it('records unknown effect without retry, then removes only exact expired dispatch resources', async () => {
    const f = fixture(); f.runtime.testNative.mockRejectedValue(new Error('lost response'));
    expect(await f.launcher.queue(scope, { job: f.job, token: 'synthetic', key: 'native-request-key' })).toMatchObject({ status: 'outcome_unknown', workflowCleanup: 'pending' });
    const previous = f.dispatch(); const result = await f.launcher.reconcile(scope, { job: f.job, dispatch: previous });
    expect(result).toMatchObject({ status: 'outcome_unknown', executionId: null, workflowCleanup: 'removed', credentialCleanup: 'removed' });
    expect(f.runtime.testNative).toHaveBeenCalledTimes(1);
    const cleanup = f.runtime.cleanupNativeTest.mock.calls[0][1];
    expect(cleanup.testId).toBe(previous.id); expect(cleanup.workflowHash).toBe(codingHash(cleanup.workflow));
    expect(cleanup.workflow.name).toBe(`Orqaly test ${previous.id}`);
  });
  it('does not clean an unexpired or foreign dispatch', async () => {
    const f = fixture(); await f.launcher.queue(scope, { job: f.job, token: 'synthetic', key: 'native-request-key' });
    await expect(f.launcher.reconcile(scope, { job: f.job, dispatch: { ...f.dispatch(), created_at: new Date().toISOString() } })).rejects.toThrow('CODING_DISPATCH_RECONCILE_NOT_READY');
    await expect(f.launcher.reconcile(scope, { job: f.job, dispatch: { ...f.dispatch(), environment_id: 'another-environment' } })).rejects.toThrow('CODING_DISPATCH_RECONCILE_NOT_READY');
    expect(f.runtime.cleanupNativeTest).not.toHaveBeenCalled();
  });
  it('has no public human capability-minting route', () => {
    const router = createCodingWorkerRouter({ service: {} });
    const paths = router.stack.filter(layer => layer.route).map(layer => layer.route.path);
    expect(paths).not.toContain('/:jobId/dispatch-capability'); expect(paths).toContain('/:jobId/run');
  });
  it('fails partial configuration instead of exposing a half-enabled coding control', () => {
    expect(codingWorkerConfiguredFromEnvironment({ ORQALY_PUBLIC_API_ORIGIN: origin })).toBe(false);
    expect(() => codingWorkerConfiguredFromEnvironment({ ORQALY_CODING_WORKER_URL: origin })).toThrow('coding_worker_configuration_incomplete');
  });
});

describe('native runtime cleanup can only remove an exact test artifact', () => {
  function cleanupFixture(mode) {
    const f = codingDispatchWorkflow({ origin, jobId: randomUUID(), specHash: 'a'.repeat(64) }); const testId = randomUUID();
    const workflow = normalizeNativeWorkflow({ workflow: f.workflow, id: testId, controlledTest: true }).workflow;
    let removed = false; const provider = { ...workflow, id: 'testProvider', versionId: 'testVersion', active: true };
    const fetchImpl = vi.fn(async (url, options) => {
      if (url.includes('?limit=100')) return Response.json({ data: removed ? [] : [{ id: provider.id, name: provider.name }, ...(mode === 'duplicate' ? [{ id: 'other', name: provider.name }] : [])] });
      if (options.method === 'DELETE') { removed = true; return Response.json({ success: true }); }
      return Response.json(mode === 'changed' ? { ...provider, name: 'different artifact' } : provider);
    });
    const runtime = createSolutionRuntime({ bindings: [{ tenantId: scope.tenantId, userId: scope.userId, id: environmentId, name: 'Fixture', region: 'local', origin: 'http://127.0.0.1:19999', apiKey: 'synthetic-api-key-value', useIdToken: false, nativePolicy: createBoundedHttpPolicy({ imageDigest: `sha256:${'a'.repeat(64)}` }) }], allowLocalHttp: true, fetchImpl });
    return { runtime, fetchImpl, command: { environmentId, testId, workflow, workflowHash: codingHash(workflow) } };
  }
  it('verifies name/hash/transport/full graph and readback without invoke or publish', async () => {
    const f = cleanupFixture(); expect(await f.runtime.cleanupNativeTest(scope, f.command)).toEqual({ status: 'removed' });
    expect(f.fetchImpl.mock.calls.filter(([, value]) => value.method === 'DELETE')).toHaveLength(1);
    expect(f.fetchImpl.mock.calls.some(([url]) => url.includes('/webhook/') || url.includes('/publish'))).toBe(false);
  });
  it.each(['changed', 'duplicate'])('does not delete %s provider state', async (mode) => {
    const f = cleanupFixture(mode); await expect(f.runtime.cleanupNativeTest(scope, f.command)).rejects.toThrow();
    expect(f.fetchImpl.mock.calls.filter(([, value]) => value.method === 'DELETE')).toHaveLength(0);
  });
});
