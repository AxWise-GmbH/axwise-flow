import { describe, expect, it, vi } from 'vitest';
import { createSolutionRuntime } from './solution-runtime.js';
import { compileSolutionWorkflow } from './solution-compiler.js';

const id = 'a9ae8baa-3bc2-4dc1-a151-f0449ee28dc7';
const scope = { tenantId: id, userId: 'user_runtime123' };
const binding = {
  ...scope,
  id: 'customer-env-001',
  name: 'Customer environment',
  region: 'europe-west4',
  origin: 'https://customer-n8n.example.com',
  apiKey: 'secret-that-never-goes-to-browser',
  useIdToken: true,
};
const compiled = compileSolutionWorkflow({
  id,
  spec: {
    kind: 'webhook_transform_v1',
    fields: [{ source: 'name', target: 'name', transform: 'trim' }],
  },
});
const published = {
  ...compiled.workflow,
  id: 'n8n-workflow-001',
  versionId: 'v1',
  activeVersion: {
    versionId: 'v1',
    nodes: compiled.workflow.nodes,
    connections: compiled.workflow.connections,
  },
};
const solution = {
  id,
  environment_id: binding.id,
  workflow: compiled.workflow,
  workflow_hash: compiled.workflowHash,
  deployment: { workflowId: published.id, versionId: 'v1' },
};
const response = (value) => new Response(JSON.stringify(value), { status: 200 });

describe('isolated n8n solution runtime', () => {
  it('never exposes origins, owner scopes or management credentials to the browser', () => {
    const runtime = createSolutionRuntime({ bindings: [binding] });
    expect(runtime.describe(binding.id)).not.toHaveProperty('apiKey');
    expect(runtime.describe(binding.id)).not.toHaveProperty('origin');
    expect(runtime.available({ ...scope, userId: 'user_other' })).toBe(false);
  });
  it('denies mismatched owner before touching the network', async () => {
    const fetchImpl = vi.fn();
    const runtime = createSolutionRuntime({ bindings: [binding], fetchImpl });
    await expect(runtime.deploy({ ...scope, userId: 'user_other' }, solution)).rejects.toThrow(
      'scope_denied'
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('waits for the 60s inventory read before creating and publishing with separate 15s write limits', async () => {
    let releaseInventory;
    const inventory = new Promise((resolve) => {
      releaseInventory = resolve;
    });
    const fetchImpl = vi
      .fn()
      .mockReturnValueOnce(inventory)
      .mockResolvedValueOnce(response({ ...published, activeVersion: null }))
      .mockResolvedValueOnce(response(published))
      .mockResolvedValueOnce(response(published));
    const deadlines = vi.spyOn(AbortSignal, 'timeout');
    try {
      const runtime = createSolutionRuntime({
        bindings: [{ ...binding, useIdToken: false }],
        fetchImpl,
      });
      const deploying = runtime.deploy(scope, solution);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchImpl.mock.calls[0][0]).toBe(`${binding.origin}/api/v1/workflows?limit=100`);
      expect(fetchImpl.mock.calls[0][1].method).toBe('GET');
      releaseInventory(response({ data: [] }));
      expect(await deploying).toMatchObject({
        workflowId: published.id,
        versionId: published.versionId,
        workflowHash: compiled.workflowHash,
      });
      expect(fetchImpl.mock.calls.map(([url, request]) => [url, request.method])).toEqual([
        [`${binding.origin}/api/v1/workflows?limit=100`, 'GET'],
        [`${binding.origin}/api/v1/workflows`, 'POST'],
        [`${binding.origin}/api/v1/workflows/${published.id}/publish`, 'POST'],
        [`${binding.origin}/api/v1/workflows/${published.id}`, 'GET'],
      ]);
      expect(deadlines.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([
        60000, 15000, 15000, 60000,
      ]);
    } finally {
      deadlines.mockRestore();
    }
  });
  it('waits for the 60s approved-workflow read before the 45s webhook invocation', async () => {
    let releaseWorkflow;
    const workflow = new Promise((resolve) => {
      releaseWorkflow = resolve;
    });
    const fetchImpl = vi
      .fn()
      .mockReturnValueOnce(workflow)
      .mockResolvedValueOnce(
        response({ output: { name: 'Alice' }, executionId: '123', invocationId: id })
      );
    const deadlines = vi.spyOn(AbortSignal, 'timeout');
    try {
      const runtime = createSolutionRuntime({
        bindings: [{ ...binding, useIdToken: false }],
        fetchImpl,
      });
      const invoking = runtime.invoke(scope, solution, { id, input: { name: ' Alice ' } });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchImpl.mock.calls[0][0]).toBe(`${binding.origin}/api/v1/workflows/${published.id}`);
      expect(fetchImpl.mock.calls[0][1].method).toBe('GET');
      releaseWorkflow(response(published));
      expect(await invoking).toEqual({ output: { name: 'Alice' }, executionId: '123' });
      expect(fetchImpl.mock.calls.map(([, request]) => request.method)).toEqual(['GET', 'POST']);
      expect(fetchImpl.mock.calls[1][0]).toBe(`${binding.origin}/webhook/solution-${id}`);
      expect(fetchImpl.mock.calls[1][1].headers.get('X-N8N-API-KEY')).toBeNull();
      expect(deadlines.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([60000, 45000]);
    } finally {
      deadlines.mockRestore();
    }
  });
  it.each(['deploy', 'invoke'])(
    'does not issue writes or retry when the initial %s verification read fails',
    async (operation) => {
      const fetchImpl = vi.fn().mockRejectedValue(new Error('read timed out'));
      const runtime = createSolutionRuntime({
        bindings: [{ ...binding, useIdToken: false }],
        fetchImpl,
      });
      await expect(
        runtime[operation](scope, solution, { id, input: { name: ' Alice ' } })
      ).rejects.toThrow('read timed out');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchImpl.mock.calls[0][1].method).toBe('GET');
    }
  );
  it.each(['create', 'publish'])(
    'does not retry an ambiguous %s POST or continue deployment after it',
    async (stage) => {
      const fetchImpl = vi.fn().mockResolvedValueOnce(response({ data: [] }));
      if (stage === 'publish')
        fetchImpl.mockResolvedValueOnce(response({ ...published, activeVersion: null }));
      fetchImpl.mockRejectedValueOnce(new Error('write response lost'));
      const runtime = createSolutionRuntime({
        bindings: [{ ...binding, useIdToken: false }],
        fetchImpl,
      });
      await expect(runtime.deploy(scope, solution)).rejects.toThrow('write response lost');
      expect(fetchImpl.mock.calls.map(([, request]) => request.method)).toEqual(
        stage === 'create' ? ['GET', 'POST'] : ['GET', 'POST', 'POST']
      );
      expect(
        fetchImpl.mock.calls.filter(([url]) =>
          url.endsWith(stage === 'create' ? '/workflows' : '/publish')
        )
      ).toHaveLength(1);
    }
  );
  it('does not retry the webhook when its execution response is lost', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(published))
      .mockRejectedValueOnce(new Error('execution response lost'));
    const runtime = createSolutionRuntime({
      bindings: [{ ...binding, useIdToken: false }],
      fetchImpl,
    });
    await expect(
      runtime.invoke(scope, solution, { id, input: { name: ' Alice ' } })
    ).rejects.toThrow('execution response lost');
    expect(fetchImpl.mock.calls.map(([, request]) => request.method)).toEqual(['GET', 'POST']);
  });
  it('verifies published JSON and correlates the actual n8n response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(published))
      .mockResolvedValueOnce(
        response({ output: { name: 'Alice' }, executionId: '123', invocationId: id })
      );
    const runtime = createSolutionRuntime({
      bindings: [binding],
      fetchImpl,
      getIdentityHeaders: async () => ({ authorization: 'Bearer google-token' }),
    });
    expect(await runtime.invoke(scope, solution, { id, input: { name: ' Alice ' } })).toEqual({
      output: { name: 'Alice' },
      executionId: '123',
    });
    const [url, request] = fetchImpl.mock.calls[1];
    expect(url).toBe(`${binding.origin}/webhook/solution-${id}`);
    expect(request.redirect).toBe('error');
    expect(request.headers.get('X-N8N-API-KEY')).toBeNull();
    expect(request.headers.get('authorization')).toBe('Bearer google-token');
  });
  it('refuses drift before execution and never uses the reference evaluator as fallback', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ ...published, nodes: [] }));
    const runtime = createSolutionRuntime({
      bindings: [{ ...binding, useIdToken: false }],
      fetchImpl,
    });
    await expect(runtime.invoke(scope, solution, { id, input: { name: 'Alice' } })).rejects.toThrow(
      'drift'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each([
    { errorWorkflow: 'unapproved-error-workflow' },
    { availableInMCP: true },
    { callerPolicy: 'any' },
    { unrecognizedProviderSetting: true },
  ])('rejects added execution settings before invoking: %j', async (settings) => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        response({ ...published, settings: { ...published.settings, ...settings } })
      );
    const runtime = createSolutionRuntime({
      bindings: [{ ...binding, useIdToken: false }],
      fetchImpl,
    });
    await expect(runtime.invoke(scope, solution, { id, input: { name: 'Alice' } })).rejects.toThrow(
      'settings_drift'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('fails closed on other workflows or ambiguous environment inventories', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(response({ data: [{ name: 'another customer workflow' }] }));
    const runtime = createSolutionRuntime({
      bindings: [{ ...binding, useIdToken: false }],
      fetchImpl,
    });
    await expect(runtime.deploy(scope, solution)).rejects.toThrow('not_exclusive');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('creates a separate release while retaining only known prior provider workflows', async () => {
    const prior = { id: 'old-provider-workflow', name: 'Orqaly solution prior v1' };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ data: [prior] }))
      .mockResolvedValueOnce(response(published))
      .mockResolvedValueOnce(response(published));
    const runtime = createSolutionRuntime({
      bindings: [{ ...binding, useIdToken: false }],
      fetchImpl,
    });
    const deployed = await runtime.deploy(scope, { ...solution, known_workflow_ids: [prior.id] });
    expect(deployed.workflowId).toBe(published.id);
    expect(fetchImpl.mock.calls[1][1].method).toBe('POST');
    expect(fetchImpl.mock.calls[1][0]).toBe(`${binding.origin}/api/v1/workflows`);
    expect(fetchImpl.mock.calls.every(([url]) => !url.includes(prior.id))).toBe(true);
  });
  it('does not accept workflow naming as evidence of a prior release ownership', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({
        data: [
          {
            id: 'unrecorded-workflow',
            name: `Orqaly solution ${id} v0`,
          },
        ],
      })
    );
    const runtime = createSolutionRuntime({
      bindings: [{ ...binding, useIdToken: false }],
      fetchImpl,
    });
    await expect(
      runtime.deploy(scope, { ...solution, known_workflow_ids: ['another-known-id'] })
    ).rejects.toThrow('not_exclusive');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('invokes the exact revision webhook while keeping the parent solution identity', async () => {
    const revisionId = '766a03f3-6444-4432-9ff6-d8ce9dd5a314';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(published))
      .mockResolvedValueOnce(
        response({ output: { name: 'Alice' }, executionId: '124', invocationId: id })
      );
    const runtime = createSolutionRuntime({
      bindings: [{ ...binding, useIdToken: false }],
      fetchImpl,
    });
    await runtime.invoke(
      scope,
      { ...solution, revision_id: revisionId },
      { id, input: { name: ' Alice ' } }
    );
    expect(fetchImpl.mock.calls[1][0]).toBe(`${binding.origin}/webhook/solution-${revisionId}`);
  });
  it('rejects unsafe origins and duplicate runtime assignments', () => {
    expect(() =>
      createSolutionRuntime({ bindings: [{ ...binding, origin: 'http://evil.example' }] })
    ).toThrow();
    expect(() =>
      createSolutionRuntime({ bindings: [{ ...binding, origin: 'https://evil.example/path' }] })
    ).toThrow();
    expect(() => createSolutionRuntime({ bindings: [binding, binding] })).toThrow();
  });
});
