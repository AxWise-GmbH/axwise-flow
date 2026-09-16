// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { nativeOwnedErrorFixture } from './fixtures/native-owned-error.js';
import { createSolutionRuntime } from './solution-runtime.js';
import { REQUEST_AUTOMATION_POLICY } from './native-workflow-review.js';
import { startNativeLocalRuntime } from '../../scripts/native-local-runtime.mjs';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import { createNativeFailureProbeArtifact } from './native-failure-probe.js';
import { nativeBundleHash } from './native-workflow-bundle.js';

const id = 'af986b65-cb2e-4565-99b3-ad3c4e01be51';
const scope = { tenantId: id, userId: 'user_ownedBundleTest' };
const policy = {
  ...REQUEST_AUTOMATION_POLICY,
  ownedErrorHandlers: true,
  backgroundExecution: 'instance_cpu_always',
};
const baseBinding = {
  ...scope,
  id: 'owned-bundle-environment',
  name: 'Synthetic owned bundle',
  region: 'local',
  origin: 'https://synthetic.example.test',
  apiKey: 'synthetic-only-management-key',
  useIdToken: false,
  nativePolicy: policy,
};
const solution = (selectedId = id) => {
  const value = nativeOwnedErrorFixture(selectedId);
  return {
    id: selectedId,
    ...value,
    workflow_hash: value.workflowHash,
    environment_id: baseBinding.id,
  };
};
function fakeProvider({ retained = true, parentStatus = 'success', wrongChild = false } = {}) {
  const stored = new Map();
  const executions = new Map();
  const actions = [];
  let serial = 0;
  const fetchImpl = vi.fn(async (url, options = {}) => {
    const parsed = new URL(url);
    const p = parsed.pathname;
    const method = options.method ?? 'GET';
    actions.push({ method, path: p, ...(options.body ? { body: JSON.parse(options.body) } : {}) });
    let data;
    if (p === '/api/v1/workflows' && method === 'GET') data = { data: [...stored.values()] };
    else if (p === '/api/v1/workflows' && method === 'POST') {
      const workflow = JSON.parse(options.body);
      const value = {
        ...workflow,
        id: `provider${++serial}`,
        versionId: `version${serial}`,
        active: false,
        activeVersion: null,
      };
      stored.set(value.id, value);
      data = value;
    } else if (p.startsWith('/api/v1/workflows/')) {
      const parts = p.split('/');
      const value = stored.get(parts[4]);
      if (!value) return new Response('{}', { status: 404 });
      if (parts[5] === 'publish' && method === 'POST') {
        value.active = true;
        value.activeVersion = {
          versionId: value.versionId,
          nodes: value.nodes,
          connections: value.connections,
        };
      } else if (parts[5] === 'unpublish' && method === 'POST') {
        value.active = false;
        value.activeVersion = null;
      } else if (method === 'DELETE') stored.delete(value.id);
      data = value;
    } else if (p === '/api/v1/executions') {
      data = {
        data: [...executions.values()].filter(
          (entry) => entry.workflowId === parsed.searchParams.get('workflowId')
        ),
      };
    } else if (p.startsWith('/api/v1/executions/')) {
      data = executions.get(p.split('/').at(-1));
      if (!data) return new Response('{}', { status: 404 });
    } else if (p.startsWith('/webhook/')) {
      if (retained) {
        const main = [...stored.values()].find((entry) => entry.settings?.errorWorkflow);
        const trigger = main.nodes.find((node) => node.type === 'n8n-nodes-base.webhook');
        const snapshot = (value, executionId, status, runData) => ({
          id: executionId,
          workflowId: value.id,
          workflowVersionId: value.versionId,
          workflowData: structuredClone(value),
          status,
          data: { resultData: { runData } },
        });
        executions.set(
          '42',
          snapshot(main, '42', parentStatus, {
            [trigger.name]: [
              {
                data: {
                  main: [
                    [
                      {
                        json: {
                          headers: {
                            'x-orqaly-invocation-id': options.headers.get('x-orqaly-invocation-id'),
                          },
                        },
                      },
                    ],
                  ],
                },
              },
            ],
          })
        );
        if (parentStatus === 'error') {
          const child = stored.get(main.settings.errorWorkflow);
          const errorTrigger = child.nodes.find(
            (node) => node.type === 'n8n-nodes-base.errorTrigger'
          );
          executions.set(
            '43',
            snapshot(child, '43', 'success', {
              [errorTrigger.name]: [
                {
                  data: {
                    main: [
                      [
                        {
                          json: {
                            workflow: { id: main.id },
                            execution: { id: wrongChild ? 'wrong-parent' : '42' },
                          },
                        },
                      ],
                    ],
                  },
                },
              ],
            })
          );
        }
      }
      return new Response(JSON.stringify({ accepted: true, customer: 'Ada' }), {
        headers: {
          'x-orqaly-invocation-id': options.headers.get('x-orqaly-invocation-id'),
          'x-orqaly-execution-id': '42',
        },
      });
    } else throw new Error('unexpected_synthetic_request');
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  });
  return {
    fetchImpl,
    stored,
    executions,
    actions,
    runtime: createSolutionRuntime({ bindings: [baseBinding], fetchImpl }),
  };
}
describe('owned bundle provider boundaries', () => {
  it('denies missing background capability and wrong owner before any upstream action', async () => {
    const fetchImpl = vi.fn();
    const runtime = createSolutionRuntime({
      bindings: [{ ...baseBinding, nativePolicy: REQUEST_AUTOMATION_POLICY }],
      fetchImpl,
    });
    await expect(runtime.deploy(scope, solution())).rejects.toThrow('background_runtime_required');
    await expect(runtime.deploy({ ...scope, userId: 'user_other' }, solution())).rejects.toThrow(
      'scope_denied'
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(() =>
      createSolutionRuntime({
        bindings: [
          {
            ...baseBinding,
            nativePolicy: { ...REQUEST_AUTOMATION_POLICY, ownedErrorHandlers: true },
          },
        ],
      })
    ).toThrow('always-CPU');
  });
  it('stages both inactive, publishes child first, pauses main first and retains exact owned pins', async () => {
    const fake = fakeProvider();
    const value = solution();
    const before = structuredClone(value);
    value.deployment = await fake.runtime.deploy(scope, value);
    expect(value.deployment).toMatchObject({
      active: false,
      bundleHash: value.bundleHash,
      workflowHash: value.workflowHash,
    });
    expect(fake.actions.some((action) => action.path.endsWith('/publish'))).toBe(false);
    const pin = value.deployment.dependencies[0];
    expect(fake.stored.get(value.deployment.workflowId).settings.errorWorkflow).toBe(
      pin.workflowId
    );
    expect(value.workflow).toEqual(before.workflow);
    await fake.runtime.activate(scope, value);
    expect(
      fake.actions.filter((action) => action.path.endsWith('/publish')).map((action) => action.path)
    ).toEqual([
      `/api/v1/workflows/${pin.workflowId}/publish`,
      `/api/v1/workflows/${value.deployment.workflowId}/publish`,
    ]);
    const result = await fake.runtime.invoke(scope, value, {
      id: randomUUID(),
      input: value.spec.acceptanceCases[0].input,
    });
    expect(result.ownedDependencies[0]).toMatchObject({
      status: 'not_triggered',
      executionId: null,
    });
    await fake.runtime.pause(scope, value);
    expect(
      fake.actions
        .filter((action) => action.path.endsWith('/unpublish'))
        .map((action) => action.path)
    ).toEqual([
      `/api/v1/workflows/${value.deployment.workflowId}/unpublish`,
      `/api/v1/workflows/${pin.workflowId}/unpublish`,
    ]);
  });
  it('rejects child-version drift before main webhook and does not silently repair provider state', async () => {
    const fake = fakeProvider();
    const value = solution();
    value.deployment = await fake.runtime.deploy(scope, value);
    await fake.runtime.activate(scope, value);
    fake.stored.get(value.deployment.dependencies[0].workflowId).versionId = 'unapproved-version';
    const before = fake.actions.length;
    await expect(
      fake.runtime.invoke(scope, value, {
        id: randomUUID(),
        input: value.spec.acceptanceCases[0].input,
      })
    ).rejects.toThrow();
    expect(fake.actions.slice(before).every((action) => action.method === 'GET')).toBe(true);
  });
  it('never calls a missing execution snapshot proof that the handler was not triggered', async () => {
    const fake = fakeProvider({ retained: false });
    const value = solution();
    value.deployment = await fake.runtime.deploy(scope, value);
    await fake.runtime.activate(scope, value);
    const result = await fake.runtime.invoke(scope, value, {
      id: randomUUID(),
      input: value.spec.acceptanceCases[0].input,
    });
    expect(result).toMatchObject({
      status: 'outcome_unknown',
      mainExecution: { status: 'outcome_unknown' },
      ownedDependencies: [{ status: 'outcome_unknown' }],
    });
    expect(fake.actions.filter((entry) => entry.path.startsWith('/webhook/'))).toHaveLength(1);
  });
  it('uses the exact final parent and child snapshots even when HTTP responded successfully before failure', async () => {
    const fake = fakeProvider({ parentStatus: 'error' });
    const value = solution();
    value.deployment = await fake.runtime.deploy(scope, value);
    await fake.runtime.activate(scope, value);
    const invocation = { id: randomUUID(), input: value.spec.acceptanceCases[0].input };
    const result = await fake.runtime.invoke(scope, value, invocation);
    expect(result).toMatchObject({
      status: 'failed',
      mainExecution: { executionId: '42', status: 'failed' },
      ownedDependencies: [{ status: 'succeeded', executionId: '43', parentExecutionId: '42' }],
    });
    const before = fake.actions.length;
    const reconciled = await fake.runtime.reconcileNativeBundleInvocation(scope, value, {
      ...invocation,
      executionId: '42',
    });
    expect(reconciled.ownedDependencies).toEqual(result.ownedDependencies);
    expect(fake.actions.slice(before).every((entry) => entry.method === 'GET')).toBe(true);
  });
  it('rejects a child linked to another parent and never retries the webhook', async () => {
    vi.useFakeTimers();
    try {
      const fake = fakeProvider({ parentStatus: 'error', wrongChild: true });
      const value = solution();
      value.deployment = await fake.runtime.deploy(scope, value);
      await fake.runtime.activate(scope, value);
      const pending = fake.runtime.invoke(scope, value, {
        id: randomUUID(),
        input: value.spec.acceptanceCases[0].input,
      });
      await vi.runAllTimersAsync();
      expect((await pending).ownedDependencies[0].status).toBe('outcome_unknown');
      expect(fake.actions.filter((entry) => entry.path.startsWith('/webhook/'))).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it('does not treat unrelated provider inventory as owned or retry a lost create', async () => {
    const fake = fakeProvider();
    fake.stored.set('foreign', { id: 'foreign', name: 'Different customer workflow' });
    await expect(fake.runtime.deploy(scope, solution())).rejects.toThrow('not_exclusive');
    expect(fake.actions.every((action) => action.method === 'GET')).toBe(true);
  });
});

describe('explicit immutable failure-probe preparation', () => {
  const command = () => ({
    ...solution(),
    sourceVersion: 3,
    probeId: randomUUID(),
    invocationId: randomUUID(),
    allowExternalEffects: false,
  });
  it('preserves the actual child business graph and pins source versus derived artifacts separately', () => {
    const input = command();
    const before = structuredClone(input);
    const artifact = createNativeFailureProbeArtifact(input);
    expect(input).toEqual(before);
    expect(artifact.spec.ownedDependencies[0].workflow.nodes).toEqual(
      input.spec.ownedDependencies[0].workflow.nodes
    );
    expect(artifact.spec.ownedDependencies[0].workflow.connections).toEqual(
      input.spec.ownedDependencies[0].workflow.connections
    );
    expect(artifact.spec.ownedDependencies[0].spec).toEqual(input.spec.ownedDependencies[0].spec);
    expect(artifact.source).toMatchObject({
      sourceVersion: 3,
      sourceWorkflowHash: input.workflowHash,
      sourceBundleHash: input.bundleHash,
    });
    expect(artifact.bundleHash).not.toBe(input.bundleHash);
    expect(artifact.workflowHash).not.toBe(input.workflowHash);
  });
  it('rejects source drift, secret-bearing child nodes and every external-effects opt-in', () => {
    const input = command();
    expect(() =>
      createNativeFailureProbeArtifact({ ...input, workflowHash: 'f'.repeat(64) })
    ).toThrow('source_changed');
    expect(() =>
      createNativeFailureProbeArtifact({ ...input, allowExternalEffects: true })
    ).toThrow('external_effects_denied');
    const changed = command();
    changed.spec.ownedDependencies[0].workflow.nodes[1].credentials = {
      orqalyBoundedHttp: { id: 'provider', name: 'Private reference' },
    };
    // Even an internally approved credential selector is not a pure probe.
    changed.bundleHash = nativeBundleHash(changed);
    expect(() => createNativeFailureProbeArtifact(changed)).toThrow(
      'child_requires_external_approval'
    );
  });
});

describe.skipIf(process.env.RUN_NATIVE_OWNED_BUNDLE_TESTS !== '1')(
  'actual local n8n2.37.10 owned ErrorTrigger',
  () => {
    let fixture;
    let runtime;
    beforeAll(async () => {
      fixture = await startNativeLocalRuntime(scope);
      runtime = createSolutionRuntime({
        bindings: [{ ...baseBinding, origin: fixture.origin, apiKey: fixture.apiKey }],
        allowLocalHttp: true,
      });
    }, 120000);
    afterAll(async () => {
      await fixture?.close();
    });
    it('executes the real failed main and its actual published handler, then removes only the exact disposable bundle', async () => {
      const testId = randomUUID();
      const value = nativeOwnedErrorFixture(testId, { fail: true, controlledTest: true });
      const result = await runtime.testNative(scope, {
        ...value,
        environmentId: baseBinding.id,
        testId,
        invocationId: randomUUID(),
        input: value.spec.acceptanceCases[0].input,
      });
      expect(result, JSON.stringify(result)).toMatchObject({
        status: 'failed',
        testArtifactHash: hash(value.workflow),
        testBundleHash: value.bundleHash,
        cleanup: { status: 'removed' },
      });
      expect(result.ownedDependencies).toHaveLength(1);
      expect(result.ownedDependencies[0]).toMatchObject({
        dependencyId: 'failure-handler',
        status: 'succeeded',
        parentExecutionId: result.executionId,
      });
      expect(result.ownedDependencies[0].executionId).toMatch(/^[1-9][0-9]*$/);
      expect(result.ownedDependencies[0].executionId).not.toBe(result.executionId);
      const list = await fetch(`${fixture.origin}/api/v1/workflows?limit=100`, {
        headers: { 'X-N8N-API-KEY': fixture.apiKey },
      }).then((response) => response.json());
      expect(list.data).toEqual([]);
    }, 120000);
    it('probes the actual pure handler using probe-only capability without enabling production bundles', async () => {
      const probeRuntime = createSolutionRuntime({
        bindings: [
          {
            ...baseBinding,
            origin: fixture.origin,
            apiKey: fixture.apiKey,
            nativePolicy: {
              ...REQUEST_AUTOMATION_POLICY,
              ownedErrorHandlerProbe: true,
              backgroundExecution: 'instance_cpu_always',
            },
          },
        ],
        allowLocalHttp: true,
      });
      const source = solution(randomUUID());
      const command = {
        ...source,
        sourceVersion: 2,
        environmentId: baseBinding.id,
        probeId: randomUUID(),
        invocationId: randomUUID(),
        allowExternalEffects: false,
      };
      await expect(probeRuntime.deploy(scope, source)).rejects.toThrow(
        'background_runtime_required'
      );
      const result = await probeRuntime.probeNativeFailure(scope, command);
      expect(result, JSON.stringify(result)).toMatchObject({
        status: 'succeeded',
        kind: 'handler_with_synthetic_failure',
        sourceWorkflowHash: source.workflowHash,
        sourceBundleHash: source.bundleHash,
        sourceVersion: 2,
        mainExecution: { status: 'failed' },
        ownedDependencies: [{ status: 'succeeded' }],
        cleanup: { status: 'removed' },
        externalEffects: false,
      });
      expect(result.ownedDependencies[0].parentExecutionId).toBe(result.mainExecution.executionId);
      const cleaned = await probeRuntime.reconcileNativeFailureProbe(scope, command);
      expect(cleaned).toMatchObject({ status: 'outcome_unknown', cleanup: { status: 'removed' } });
    }, 120000);
  }
);
