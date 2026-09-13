// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSolutionRuntime } from './solution-runtime.js';
import { createBoundedHttpPolicy } from './native-workflow-review.js';
import { describeNativeConnection, bindNativeConnections } from './native-workflow-connections.js';
import { normalizeNativeWorkflow } from './native-workflow-runtime-contract.js';
import { nativeOutboundFixture } from '../../scripts/fixtures/native-outbound-workflow.mjs';
const id = '36736c1d-f01e-4d4e-9db1-eb005b66d1a7';
const invocationId = 'e6be20b4-a6ec-481e-babf-bc5e27aecfc9';
const connectionId = '686c0132-efda-44f9-8e76-295f09a8c19d';
const scope = { tenantId: id, userId: 'user_owner' };
const environmentId = 'outbound-runtime-001';
const policy = createBoundedHttpPolicy({ imageDigest: `sha256:${'a'.repeat(64)}` });
const binding = {
  ...scope,
  id: environmentId,
  name: 'Scoped outbound',
  region: 'local',
  origin: 'https://n8n.example.test',
  apiKey: 'Synthetic-n8n-management-key',
  useIdToken: false,
  nativePolicy: policy,
};
const response = (value, headers = {}, status = 200) =>
  new Response(JSON.stringify(value), { status, headers });
const metadata = {
  id: 'ownedCredential',
  name: `Orqaly connection ${connectionId}`,
  type: 'orqalyBoundedHttp',
};
function fixture(controlledTest = false) {
  const f = nativeOutboundFixture();
  const described = describeNativeConnection({
    requirement: f.spec.connections[0],
    workflow: f.workflow,
    environmentId,
  });
  const connection = {
    id: connectionId,
    tenant_id: scope.tenantId,
    owner_user_id: scope.userId,
    requirement_id: 'receiver',
    environment_id: environmentId,
    credential_type: 'orqalyBoundedHttp',
    provider_credential_id: metadata.id,
    scope: described.scope,
    status: 'saved',
  };
  const artifact = normalizeNativeWorkflow({
    workflow: bindNativeConnections(f.workflow, f.spec, [connection], environmentId),
    id,
    controlledTest,
  });
  return {
    id,
    spec: f.spec,
    workflow: artifact.workflow,
    workflow_hash: artifact.workflowHash,
    environment_id: environmentId,
    nativeConnections: [connection],
    deployment: { workflowId: 'ownedWorkflow', versionId: 'immutableVersion' },
  };
}
const provider = (solution, active = true) => ({
  ...solution.workflow,
  id: 'ownedWorkflow',
  versionId: 'immutableVersion',
  active,
  activeVersion: active
    ? {
        versionId: 'immutableVersion',
        nodes: solution.workflow.nodes,
        connections: solution.workflow.connections,
      }
    : null,
});
const correlated = (delivery = 'accepted', boundConnection = connectionId) =>
  response(
    { delivery, statusCode: 200 },
    {
      'x-orqaly-invocation-id': invocationId,
      'x-orqaly-execution-id': '123',
      'x-orqaly-outbound-delivery': delivery,
      'x-orqaly-outbound-connection-id': boundConnection,
    }
  );
const runtime = (fetchImpl, changes = {}) =>
  createSolutionRuntime({ bindings: [{ ...binding, ...changes }], fetchImpl });
describe('native outbound runtime scope and receipt gates', () => {
  it('can pause an exact owned deployment after credential revocation without reading or using that credential', async () => {
    const f = fixture();
    f.nativeConnections = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(provider(f)))
      .mockResolvedValueOnce(response(provider(f, false)))
      .mockResolvedValueOnce(response(provider(f, false)));
    await runtime(fetchImpl).pause(scope, f);
    expect(
      fetchImpl.mock.calls.map(([url, options]) => [new URL(url).pathname, options.method])
    ).toEqual([
      ['/api/v1/workflows/ownedWorkflow', 'GET'],
      ['/api/v1/workflows/ownedWorkflow/unpublish', 'POST'],
      ['/api/v1/workflows/ownedWorkflow', 'GET'],
    ]);
    expect(
      fetchImpl.mock.calls.some(
        ([url]) => url.includes('/credentials/') || url.includes('/webhook/')
      )
    ).toBe(false);
  });
  it('checks immutable workflow and exact credential metadata before its sole business request', async () => {
    const f = fixture();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(provider(f)))
      .mockResolvedValueOnce(response(metadata))
      .mockResolvedValueOnce(correlated());
    const result = await runtime(fetchImpl).invoke(scope, f, {
      id: invocationId,
      input: { event: 'ready' },
    });
    expect(result).toMatchObject({
      status: 'succeeded',
      executionId: '123',
      executedNodeIds: ['deliver'],
      outboundDelivery: { delivery: 'accepted', connectionId, nodeId: 'deliver' },
    });
    expect(fetchImpl.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      '/api/v1/workflows/ownedWorkflow',
      '/api/v1/credentials/ownedCredential',
      `/webhook/solution-${id}`,
    ]);
    expect(fetchImpl.mock.calls[2][1].headers.get('X-N8N-API-KEY')).toBeNull();
  });
  it.each(['revoked', 'owner', 'environment', 'provider'])(
    'denies invalid connection before any business call (%s)',
    async (change) => {
      const f = fixture();
      if (change === 'revoked') f.nativeConnections[0].status = 'revoked';
      if (change === 'owner') f.nativeConnections[0].owner_user_id = 'user_other';
      if (change === 'environment') f.nativeConnections[0].environment_id = 'other-env';
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(response(provider(f)))
        .mockResolvedValueOnce(response({ ...metadata, name: 'Other owner' }));
      await expect(
        runtime(fetchImpl).invoke(scope, f, { id: invocationId, input: { event: 'ready' } })
      ).rejects.toThrow();
      expect(fetchImpl.mock.calls.some(([url]) => url.includes('/webhook/'))).toBe(false);
    }
  );
  it.each([
    ['accepted', 'other-connection'],
    ['unknown', connectionId],
    [null, null],
  ])(
    'never trusts business JSON as delivery proof without fixed native headers (%s)',
    async (delivery, boundConnection) => {
      const f = fixture();
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(response(provider(f)))
        .mockResolvedValueOnce(response(metadata))
        .mockResolvedValueOnce(correlated(delivery, boundConnection));
      await expect(
        runtime(fetchImpl).invoke(scope, f, { id: invocationId, input: { event: 'ready' } })
      ).rejects.toThrow('outcome_unknown');
      expect(fetchImpl.mock.calls.filter(([url]) => url.includes('/webhook/'))).toHaveLength(1);
    }
  );
  it('requires explicit controlled-test consent and keeps failure execution retention off', async () => {
    const f = fixture(true);
    expect(f.workflow.settings.saveDataErrorExecution).toBe('none');
    const fetchImpl = vi.fn();
    await expect(
      runtime(fetchImpl).testNative(scope, {
        environmentId,
        workflow: f.workflow,
        spec: f.spec,
        testId: id,
        invocationId,
        input: { event: 'ready' },
        nativeConnections: f.nativeConnections,
      })
    ).rejects.toThrow('consent_required');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('never classifies an uncertain side effect as a repairable node failure or queries raw execution data', async () => {
    const f = fixture(true);
    const stored = provider(f);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ data: [] }))
      .mockResolvedValueOnce(response(provider(f, false)))
      .mockResolvedValueOnce(response(stored))
      .mockResolvedValueOnce(response(stored))
      .mockResolvedValueOnce(response(metadata))
      .mockRejectedValueOnce(new Error('lost business response'))
      .mockResolvedValueOnce(response(stored))
      .mockResolvedValueOnce(response(stored));
    const result = await runtime(fetchImpl).testNative(scope, {
      environmentId,
      workflow: f.workflow,
      spec: f.spec,
      testId: id,
      invocationId,
      input: { event: 'ready' },
      nativeConnections: f.nativeConnections,
      allowExternalEffects: true,
    });
    expect(result).toMatchObject({
      status: 'outcome_unknown',
      cleanup: { status: 'removed' },
      testConfiguration: { saveDataErrorExecution: 'none' },
    });
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('/executions'))).toBe(false);
    expect(fetchImpl.mock.calls.filter(([url]) => url.includes('/webhook/'))).toHaveLength(1);
  });
  it('does not accept a made-up custom transport hash or broadened node policy', () => {
    const fetchImpl = vi.fn();
    for (const nativePolicy of [
      { ...policy, outboundPackageHash: '0'.repeat(64) },
      {
        ...policy,
        allowedNodes: [
          ...policy.allowedNodes,
          { type: 'n8n-nodes-base.httpRequest', typeVersion: 4.5 },
        ],
      },
    ])
      expect(() => runtime(fetchImpl, { nativePolicy })).toThrow();
  });
});
