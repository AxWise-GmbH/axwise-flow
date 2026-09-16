// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startNativeLocalRuntime } from '../../scripts/native-local-runtime.mjs';
import { createSolutionRuntime } from './solution-runtime.js';
import { normalizeNativeWorkflow } from './native-workflow-runtime-contract.js';
import { REQUEST_AUTOMATION_POLICY, checkNativeWorkflowAcceptance } from './native-workflow-review.js';

const id = 'a9ae8baa-3bc2-4dc1-a151-f0449ee28dc7';
const testId = '31b3b478-93a1-41fa-9dfa-46f0f757c4c9';
const invocationId = 'de002e7a-86be-47f3-81f7-01e8ac0649b9';
const scope = { tenantId: id, userId: 'user_nativeRuntime' };
const binding = { ...scope, id: 'native-test-001', name: 'Local synthetic test', region: 'local',
  origin: 'https://n8n.example.test', apiKey: 'synthetic-management-key-only', useIdToken: false, nativePolicy: REQUEST_AUTOMATION_POLICY };
const spec = { kind: 'n8n_workflow_v2', requirements: [{ id: 'route', description: 'Route incoming orders by amount' }],
  inputSchema: { type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'], additionalProperties: false },
  outputSchema: { type: 'object', properties: { accepted: { type: 'boolean' } }, required: ['accepted'], additionalProperties: false },
  acceptanceCases: [{ id: 'large', description: 'Accept large order', requirementIds: ['route'], input: { amount: 100 }, expectedOutput: { accepted: true }, assertions: [] },
    { id: 'small', description: 'Reject small order', requirementIds: ['route'], input: { amount: 2 }, expectedOutput: { accepted: false }, expectedStatus: 422, assertions: [] }],
  connections: [], runtimeProfile: 'request_automation' };
const node = (id, name, type, typeVersion, parameters) => ({ id, name, type: `n8n-nodes-base.${type}`, typeVersion, parameters, position: [0, 0] });
const wire = (name) => ({ node: name, type: 'main', index: 0 });
function fixture() {
  return { name: 'Native order routing', nodes: [
    node('receive', 'Receive order', 'webhook', 2.1, { httpMethod: 'POST', path: 'unused', responseMode: 'responseNode', options: {} }),
    node('branch', 'Check amount', 'if', 2.3, { conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 2 }, combinator: 'and', conditions: [{ id: 'condition', leftValue: '={{ $json.body.amount }}', rightValue: 100, operator: { type: 'number', operation: 'gte' } }] }, options: {} }),
    node('accept', 'Accept order', 'respondToWebhook', 1.5, { respondWith: 'json', responseBody: '={{ { "accepted": true } }}', options: {} }),
    node('reject', 'Reject order', 'respondToWebhook', 1.5, { respondWith: 'json', responseBody: '={{ { "accepted": false } }}', options: { responseCode: 422 } }),
  ], connections: { 'Receive order': { main: [[wire('Check amount')]] }, 'Check amount': { main: [[wire('Accept order')], [wire('Reject order')]] } }, settings: {} };
}
const artifact = (workflow = fixture(), selectedId = id, controlledTest = false) => normalizeNativeWorkflow({ workflow, id: selectedId, controlledTest });
const provider = (workflow, active = false) => ({ ...workflow, id: 'workflow_native_001', versionId: 'native_version_001', active,
  activeVersion: active ? { versionId: 'native_version_001', nodes: workflow.nodes, connections: workflow.connections } : null });
const solution = () => { const compiled = artifact(); return { id, spec, environment_id: binding.id,
  workflow: compiled.workflow, workflow_hash: compiled.workflowHash, deployment: { workflowId: 'workflow_native_001', versionId: 'native_version_001' } }; };
const response = (data, status = 200, headers) => new Response(JSON.stringify(data), { status, headers });
const correlated = (data, status = 200) => response(data, status, { 'x-orqaly-invocation-id': invocationId, 'x-orqaly-execution-id': '123' });
const makeRuntime = (fetchImpl, changes = {}) => createSolutionRuntime({ bindings: [{ ...binding, ...changes }], fetchImpl });

describe('native runtime authority and transport', () => {
  it('requires an owner-scoped server policy and never accepts broader model capability claims', async () => {
    const fetchImpl = vi.fn();
    const runtime = makeRuntime(fetchImpl, { nativePolicy: null });
    expect(runtime.nativePolicy(scope, binding.id)).toBeNull();
    await expect(runtime.deploy(scope, solution())).rejects.toThrow('policy_missing');
    expect(() => runtime.nativePolicy({ ...scope, userId: 'user_other' }, binding.id)).toThrow('scope_denied');
    for (const mutation of [{ code: true }, { egress: 'allow' }, { credentials: 'allow' }, { n8nVersion: 'latest' }, { allowedNodes: [{ type: 'n8n-nodes-base.executeCommand', typeVersion: 1 }] }])
      expect(() => makeRuntime(fetchImpl, { nativePolicy: { ...REQUEST_AUTOMATION_POLICY, ...mutation } })).toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('stages the exact graph inactive; activation and pause are distinct verified actions', async () => {
    const value = solution(); const inactive = provider(value.workflow); const active = provider(value.workflow, true);
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({ data: [] })).mockResolvedValueOnce(response(inactive)).mockResolvedValueOnce(response(inactive));
    const runtime = makeRuntime(fetchImpl);
    expect(await runtime.deploy(scope, value)).toMatchObject({ active: false, workflowHash: value.workflow_hash });
    expect(fetchImpl.mock.calls.some(([url]) => url.endsWith('/publish'))).toBe(false);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual(value.workflow);
    fetchImpl.mockResolvedValueOnce(response(inactive)).mockResolvedValueOnce(response(active)).mockResolvedValueOnce(response(active));
    expect(await runtime.activate(scope, value)).toMatchObject({ active: true });
    fetchImpl.mockResolvedValueOnce(response(active)).mockResolvedValueOnce(response(inactive)).mockResolvedValueOnce(response(inactive));
    expect(await runtime.pause(scope, value)).toMatchObject({ active: false });
    expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/publish'))).toHaveLength(1);
    expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/unpublish'))).toHaveLength(1);
  });
  it('keeps business JSON and response status unchanged with correlation in headers only', async () => {
    const value = solution(); const fetchImpl = vi.fn().mockResolvedValueOnce(response(provider(value.workflow, true))).mockResolvedValueOnce(correlated({ accepted: false }, 422));
    const result = await makeRuntime(fetchImpl).invoke(scope, value, { id: invocationId, input: { amount: 2 } });
    expect(result).toMatchObject({ status: 'succeeded', executionId: '123', responseStatus: 422, output: { accepted: false } });
    expect(checkNativeWorkflowAcceptance({ spec, input: { amount: 2 }, ...result }).passed).toBe(true);
    const options = fetchImpl.mock.calls[1][1];
    expect(JSON.parse(options.body)).toEqual({ amount: 2 });
    expect(options.headers.get('x-orqaly-invocation-id')).toBe(invocationId);
    expect(options.headers.get('X-N8N-API-KEY')).toBeNull();
  });
  it('rejects input, transport mutation and version drift before webhook invocation', async () => {
    const value = solution(); const fetchImpl = vi.fn().mockResolvedValue(response({ ...provider(value.workflow, true), versionId: 'changed' }));
    const runtime = makeRuntime(fetchImpl);
    await expect(runtime.invoke(scope, value, { id: invocationId, input: { amount: 'wrong' } })).rejects.toThrow('input_invalid');
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(runtime.invoke(scope, value, { id: invocationId, input: { amount: 2 } })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const changed = structuredClone(value); changed.workflow.nodes[0].parameters.path = 'unapproved';
    await expect(runtime.invoke(scope, changed, { id: invocationId, input: { amount: 2 } })).rejects.toThrow('transport_binding');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('never retries an uncorrelated or lost production response', async () => {
    const value = solution(); const fetchImpl = vi.fn().mockResolvedValueOnce(response(provider(value.workflow, true))).mockResolvedValueOnce(response({ accepted: true }));
    await expect(makeRuntime(fetchImpl).invoke(scope, value, { id: invocationId, input: { amount: 100 } })).rejects.toThrow('outcome_unknown');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('keeps the Google identity token out of native application Authorization, even for a whole-webhook response', async () => {
    const workflow = fixture(); workflow.nodes[2].parameters.responseBody = '={{ $json }}';
    const compiled = artifact(workflow); const value = { ...solution(), workflow: compiled.workflow, workflow_hash: compiled.workflowHash };
    const fetchImpl = vi.fn().mockResolvedValueOnce(response(provider(value.workflow, true))).mockResolvedValueOnce(correlated({ body: { amount: 100 } }));
    const runtime = createSolutionRuntime({ bindings: [{ ...binding, useIdToken: true }], fetchImpl,
      getIdentityHeaders: async () => ({ authorization: 'Bearer synthetic-google-identity' }) });
    await runtime.invoke(scope, value, { id: invocationId, input: { amount: 100 } });
    expect(fetchImpl.mock.calls[0][1].headers.get('authorization')).toBe('Bearer synthetic-google-identity');
    const forwarded = fetchImpl.mock.calls[1][1].headers;
    expect(forwarded.get('authorization')).toBeNull();
    expect(forwarded.get('X-N8N-API-KEY')).toBeNull();
    expect(forwarded.get('X-Serverless-Authorization')).toBe('Bearer synthetic-google-identity');
    // This asserts our outgoing transport, not Cloud Run's signature stripping.
  });
});

describe('disposable native tests and genuine diagnostics', () => {
  it('executes the final controlled artifact once and deletes only that exact workflow', async () => {
    const compiled = artifact(fixture(), testId, true); const inactive = provider(compiled.workflow); const active = provider(compiled.workflow, true);
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({ data: [] })).mockResolvedValueOnce(response(inactive))
      .mockResolvedValueOnce(response(active)).mockResolvedValueOnce(response(active)).mockResolvedValueOnce(correlated({ accepted: true }))
      .mockResolvedValueOnce(response(active)).mockResolvedValueOnce(response(active));
    const result = await makeRuntime(fetchImpl).testNative(scope, { environmentId: binding.id, workflow: compiled.workflow, spec, testId, invocationId, input: { amount: 100 } });
    expect(result).toMatchObject({ status: 'succeeded', testArtifactHash: compiled.workflowHash, cleanup: { status: 'removed' }, executedNodeIds: [] });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual(compiled.workflow);
    expect(fetchImpl.mock.calls.filter(([, options]) => options.method === 'DELETE').map(([url]) => url)).toEqual([`${binding.origin}/api/v1/workflows/${active.id}`]);
    expect(compiled.workflow.settings.saveDataSuccessExecution).toBe('none');
  });
  it.each([true, false])('uses only exact correlated failed execution evidence (matches=%s)', async (matches) => {
    const compiled = artifact(fixture(), testId, true); const inactive = provider(compiled.workflow); const active = provider(compiled.workflow, true);
    const execution = { id: '124', workflowId: active.id, workflowVersionId: active.versionId, status: 'error', workflowData: active,
      data: { resultData: { runData: { 'Receive order': [{ data: { main: [[{ json: { headers: { 'x-orqaly-invocation-id': matches ? invocationId : id } } }]] } }],
        'Check amount': [{ executionStatus: 'error', error: { name: 'ExpressionError', message: 'secret-provider-payload-must-not-leak' } }] } } } };
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({ data: [] })).mockResolvedValueOnce(response(inactive)).mockResolvedValueOnce(response(active))
      .mockResolvedValueOnce(response(active)).mockResolvedValueOnce(response({ message: 'failed' }, 500)).mockResolvedValueOnce(response({ data: [execution] }))
      .mockResolvedValueOnce(response(active)).mockResolvedValueOnce(response(active));
    const result = await makeRuntime(fetchImpl).testNative(scope, { environmentId: binding.id, workflow: compiled.workflow, spec, testId, invocationId, input: { amount: 100 } });
    expect(result.status).toBe(matches ? 'failed' : 'outcome_unknown');
    if (matches) expect(result).toMatchObject({ executionId: '124', executedNodeIds: ['receive', 'branch'], diagnostics: [{ code: 'ExpressionError', nodeId: 'branch' }] });
    expect(JSON.stringify(result)).not.toContain('secret-provider-payload');
  });
  it('does not execute or remove a previous ambiguous attempt', async () => {
    const compiled = artifact(fixture(), testId, true);
    const fetchImpl = vi.fn().mockResolvedValue(response({ data: [{ name: compiled.workflow.name, id: 'previous' }] }));
    const result = await makeRuntime(fetchImpl).testNative(scope, { environmentId: binding.id, workflow: compiled.workflow, spec, testId, invocationId, input: { amount: 100 } });
    expect(result.status).toBe('outcome_unknown'); expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('does not delete a temporary workflow when the final snapshot has drifted', async () => {
    const compiled = artifact(fixture(), testId, true); const inactive = provider(compiled.workflow); const active = provider(compiled.workflow, true);
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({ data: [] })).mockResolvedValueOnce(response(inactive)).mockResolvedValueOnce(response(active))
      .mockResolvedValueOnce(response(active)).mockResolvedValueOnce(correlated({ accepted: true }))
      .mockResolvedValueOnce(response({ ...active, versionId: 'someone-else-changed-it' }));
    const result = await makeRuntime(fetchImpl).testNative(scope, { environmentId: binding.id, workflow: compiled.workflow, spec, testId, invocationId, input: { amount: 100 } });
    expect(result).toMatchObject({ status: 'succeeded', cleanup: { status: 'pending' } });
    expect(fetchImpl.mock.calls.some(([, options]) => options.method === 'DELETE')).toBe(false);
  });
  it.each(['version', 'node', 'approved-parameter', 'unknown-added-parameter'])('rejects mismatched %s in a failure receipt', async (mismatch) => {
    const compiled = artifact(fixture(), testId, true); const inactive = provider(compiled.workflow); const active = provider(compiled.workflow, true);
    const snapshot = structuredClone(active);
    // Native execution defaults are allowed, not changes to supplied values.
    snapshot.nodes[0].parameters.authentication = 'none';
    if (mismatch === 'node') snapshot.nodes[1].id = 'different-node';
    if (mismatch === 'approved-parameter') snapshot.nodes[1].parameters.conditions.conditions[0].rightValue = 999;
    if (mismatch === 'unknown-added-parameter') snapshot.nodes[1].parameters.unrecognizedExecutionOverride = true;
    const execution = { id: '124', workflowId: active.id, workflowVersionId: mismatch === 'version' ? 'wrong-version' : active.versionId,
      status: 'error', workflowData: snapshot, data: { resultData: { runData: {
        'Receive order': [{ data: { main: [[{ json: { headers: { 'x-orqaly-invocation-id': invocationId } } }]] } }],
        'Check amount': [{ executionStatus: 'error', error: { name: 'NodeOperationError' } }],
      } } } };
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({ data: [] })).mockResolvedValueOnce(response(inactive)).mockResolvedValueOnce(response(active))
      .mockResolvedValueOnce(response(active)).mockResolvedValueOnce(response({ message: 'failed' }, 500)).mockResolvedValueOnce(response({ data: [execution] }))
      .mockResolvedValueOnce(response(active)).mockResolvedValueOnce(response(active));
    const result = await makeRuntime(fetchImpl).testNative(scope, { environmentId: binding.id, workflow: compiled.workflow, spec, testId, invocationId, input: { amount: 100 } });
    expect(result.status).toBe('outcome_unknown'); expect(result.executionId).toBeUndefined();
  });
});

// Opt-in integration runs only a new disposable local container and synthetic
// values. No existing runtime, account, credential or cloud resource is used.
describe.runIf(process.env.ORQALY_NATIVE_RUNTIME_LIVE === '1')('real pinned n8n 2.37.10 runtime', () => {
  let runtime; let local; let capturedExecutions;
  beforeAll(async () => {
    local = await startNativeLocalRuntime(scope, { fetchImpl: async (url, options) => {
      const result = await fetch(url, options);
      if (url.includes('/api/v1/executions?')) capturedExecutions = await result.clone().json();
      return result;
    } });
    runtime = local.runtime;
  }, 60000);
  afterAll(async () => { await local?.close(); capturedExecutions = undefined; }, 20000);
  it('executes native typeof validation for valid, missing and numeric text without pre-rejecting business errors', async () => {
    const workflow = fixture();
    workflow.nodes[1].parameters.conditions.conditions[0] = {
      id: 'text-type', leftValue: "={{ typeof $json.body?.text === 'string' }}", rightValue: true,
      operator: { type: 'boolean', operation: 'equals' },
    };
    workflow.nodes[2].parameters.responseBody = '={{ { "text": $json.body.text.trim() } }}';
    workflow.nodes[3].parameters.responseBody = '={{ { "error": "text must be a string" } }}';
    workflow.nodes[3].parameters.options.responseCode = 400;
    const cases = [
      { id: 'padded', input: { text: '  preview  ' }, expectedOutput: { text: 'preview' }, expectedStatus: 200 },
      { id: 'missing', input: {}, expectedOutput: { error: 'text must be a string' }, expectedStatus: 400 },
      { id: 'numeric', input: { text: 42 }, expectedOutput: { error: 'text must be a string' }, expectedStatus: 400 },
    ];
    const validationSpec = {
      ...spec, inputSchema: { type: 'object', additionalProperties: true },
      outputSchema: { type: 'object', properties: { text: { type: 'string' }, error: { type: 'string' } }, additionalProperties: false },
      acceptanceCases: cases.map(value => ({ ...value, description: value.id, requirementIds: ['route'], assertions: [] })),
    };
    const executionIds = new Set();
    for (const test of cases) {
      const selectedId = randomUUID(); const compiled = artifact(workflow, selectedId, true);
      const result = await runtime.testNative(scope, { environmentId: local.environmentId, workflow: compiled.workflow,
        spec: validationSpec, testId: selectedId, invocationId: randomUUID(), input: test.input });
      expect(result, JSON.stringify(result)).toMatchObject({ status: 'succeeded', output: test.expectedOutput,
        responseStatus: test.expectedStatus, testArtifactHash: compiled.workflowHash, cleanup: { status: 'removed' } });
      expect(result.executionId).toMatch(/^\d+$/);
      executionIds.add(result.executionId);
      expect(checkNativeWorkflowAcceptance({ spec: validationSpec, input: test.input, ...result }).passed).toBe(true);
    }
    expect(executionIds.size).toBe(3);
  }, 60000);
  it('stages inactive, tests both real IF branches with statuses, activates, invokes and pauses', async () => {
    const value = solution(); value.environment_id = local.environmentId; value.deployment = await runtime.deploy(scope, value);
    expect(value.deployment.active).toBe(false);
    for (const acceptance of spec.acceptanceCases) {
      const selectedId = randomUUID(); const compiled = artifact(fixture(), selectedId, true);
      const result = await runtime.testNative(scope, { environmentId: local.environmentId, workflow: compiled.workflow, spec,
        testId: selectedId, invocationId: randomUUID(), input: acceptance.input });
      expect(result, JSON.stringify(result)).toMatchObject({ status: 'succeeded', testArtifactHash: compiled.workflowHash, cleanup: { status: 'removed' } });
      expect(checkNativeWorkflowAcceptance({ spec, input: acceptance.input, ...result }).passed).toBe(true);
    }
    value.deployment = await runtime.activate(scope, value);
    expect(value.deployment.active).toBe(true);
    const result = await runtime.invoke(scope, value, { id: randomUUID(), input: { amount: 100 } });
    expect(result).toMatchObject({ status: 'succeeded', output: { accepted: true }, responseStatus: 200 });
    expect((await runtime.pause(scope, value)).active).toBe(false);
  }, 60000);
  it('captures a real failing node without leaking its raw error then cleans it up', async () => {
    const workflow = fixture();
    workflow.nodes[1].parameters.conditions.conditions[0].leftValue = '={{ "not-a-number" }}';
    const selectedId = randomUUID(); const compiled = artifact(workflow, selectedId, true);
    const selectedInvocation = randomUUID();
    const result = await runtime.testNative(scope, { environmentId: local.environmentId, workflow: compiled.workflow, spec,
      testId: selectedId, invocationId: selectedInvocation, input: { amount: 100 } });
    expect(capturedExecutions?.data?.[0]?.status).toBe('error');
    expect(result, JSON.stringify(result)).toMatchObject({ status: 'failed', cleanup: { status: 'removed' } });
    expect(result.executionId).toMatch(/^[0-9]+$/);
    expect(result.executedNodeIds).toContain('branch');
    expect(result.diagnostics.some((diagnostic) => diagnostic.nodeId === 'branch')).toBe(true);
    expect(result.diagnostics[0].message).toBe("n8n expected a number but received a string. Check this node's input type.");
    expect(JSON.stringify(result)).not.toContain('not-a-number');
  }, 60000);

  function sumFixture(expression = '$json.body.values.sum()') {
    return { name: 'Native bounded array total', nodes: [
      node('receive', 'Receive values', 'webhook', 2.1, { httpMethod: 'POST', path: 'unused', responseMode: 'responseNode', options: {} }),
      node('sum', 'Total values', 'set', 3.4, { mode: 'raw', jsonOutput: `={{ { "total": ${expression} } }}`, options: {} }),
      node('respond', 'Return total', 'respondToWebhook', 1.5, { respondWith: 'json', responseBody: '={{ $json }}', options: {} }),
    ], connections: { 'Receive values': { main: [[wire('Total values')]] }, 'Total values': { main: [[wire('Return total')]] } }, settings: {} };
  }

  function sumSpec(input, total) {
    return { kind: 'n8n_workflow_v2', requirements: [{ id: 'sum', description: 'Total a bounded array of numbers' }],
      inputSchema: { type: 'object', properties: { values: { type: 'array', items: { type: 'number' }, maxItems: 1000 } }, required: ['values'], additionalProperties: false },
      outputSchema: { type: 'object', properties: { total: { type: 'number' } }, required: ['total'], additionalProperties: false },
      acceptanceCases: [{ id: 'total', description: 'Return the actual numeric array total', requirementIds: ['sum'], input, expectedOutput: { total }, assertions: [] }],
      connections: [], runtimeProfile: 'request_automation' };
  }

  it.each([
    { values: [12, 1, 5], total: 18 },
    { values: [10, 2.5, -3], total: 9.5 },
    { values: [], total: 0 },
  ])('executes genuine zero-argument native sum for $values', async ({ values, total }) => {
    const input = { values }; const selectedSpec = sumSpec(input, total);
    const selectedId = randomUUID(); const compiled = artifact(sumFixture(), selectedId, true);
    const result = await runtime.testNative(scope, { environmentId: local.environmentId, workflow: compiled.workflow, spec: selectedSpec,
      testId: selectedId, invocationId: randomUUID(), input });
    expect(result, JSON.stringify(result)).toMatchObject({ status: 'succeeded', output: { total }, responseStatus: 200,
      testArtifactHash: compiled.workflowHash, cleanup: { status: 'removed' } });
    expect(result.executionId).toMatch(/^[0-9]+$/);
    expect(checkNativeWorkflowAcceptance({ spec: selectedSpec, input, ...result }).passed).toBe(true);
  }, 60000);

  it.each(['["2"]', '[null]', '[true]', '[1, "2"]'])('reports the genuine native error for invalid array %s, without coercion or fabricated output', async (values) => {
    // The input itself passes its agreed schema. A faulty authored expression
    // constructs invalid values; only actual n8n execution establishes failure.
    const input = { values: [1, 2] }; const selectedSpec = sumSpec(input, 3);
    const selectedId = randomUUID(); const compiled = artifact(sumFixture(`${values}.sum()`), selectedId, true);
    capturedExecutions = undefined;
    const result = await runtime.testNative(scope, { environmentId: local.environmentId, workflow: compiled.workflow, spec: selectedSpec,
      testId: selectedId, invocationId: randomUUID(), input });
    expect(capturedExecutions?.data?.[0]?.status).toBe('error');
    expect(result, JSON.stringify(result)).toMatchObject({ status: 'failed', cleanup: { status: 'removed' }, testArtifactHash: compiled.workflowHash });
    expect(result.executionId).toMatch(/^[0-9]+$/);
    expect(result.output).toBeUndefined();
    expect(result.executedNodeIds).toContain('sum');
    expect(result.diagnostics.some((diagnostic) => diagnostic.nodeId === 'sum')).toBe(true);
    expect(JSON.stringify(capturedExecutions.data[0].data.resultData)).toContain('all array elements must be numbers');
  }, 60000);
});
