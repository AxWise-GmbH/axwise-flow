// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  SolutionDecisionSchema,
  SolutionInvocationSchema,
  SolutionRevisionInvocationSchema,
} from '../../shared/workflow-v2/solution-contracts.js';
import { nativeOrderSpec, nativeOrderWorkflow } from './fixtures/native-order-routing.js';
import {
  materializeNativeBundle,
  nativeBundleHash,
  normalizeNativeBundle,
  ownedErrorWorkflowReference,
} from './native-workflow-bundle.js';
import {
  assertNoUnresolvedNativeEffect,
  executeSolutionInvocation,
  hasNativeAcceptanceCoverage,
  nativeLifecycleReceiptMatches,
  nativeSolutionTestPlan,
  validateSolutionInvocationInput,
} from './solution-service.js';

const scope = { tenantId: '11111111-1111-4111-8111-111111111111', userId: 'user_bundle' };
const id = '22222222-2222-4222-8222-222222222222';
const dependencyId = 'error-alert';
const credentialId = '33333333-3333-4333-8333-333333333333';
function pinsFor(value, prefix = 'source') {
  return value.spec.ownedDependencies.map((member) => ({
    dependencyId: member.id,
    workflowId: `${prefix}-child`,
    versionId: `${prefix}-version`,
    workflowHash: hash(member.workflow),
    specHash: hash(member.spec),
  }));
}
function fixture({ connected = false } = {}) {
  const workflow = nativeOrderWorkflow();
  workflow.settings.errorWorkflow = ownedErrorWorkflowReference(dependencyId);
  const spec = nativeOrderSpec();
  spec.ownedDependencies = [
    {
      id: dependencyId,
      kind: 'error_handler',
      workflow: {
        name: 'Record owned error',
        nodes: [
          {
            id: 'error',
            name: 'On error',
            type: 'n8n-nodes-base.errorTrigger',
            typeVersion: 1,
            position: [0, 0],
            parameters: {},
          },
          {
            id: 'record',
            name: 'Record',
            type: 'n8n-nodes-base.set',
            typeVersion: 3.4,
            position: [200, 0],
            parameters: { mode: 'raw', jsonOutput: '={{ { "recorded": true } }}', options: {} },
          },
          ...(connected
            ? [
                {
                  id: 'deliver',
                  name: 'Deliver',
                  type: 'CUSTOM.boundedHttp',
                  typeVersion: 1,
                  position: [400, 0],
                  parameters: { url: 'https://receiver.example/events' },
                },
              ]
            : []),
        ],
        connections: {
          'On error': { main: [[{ node: 'Record', type: 'main', index: 0 }]] },
          ...(connected
            ? { Record: { main: [[{ node: 'Deliver', type: 'main', index: 0 }]] } }
            : {}),
        },
        settings: {},
      },
      spec: {
        kind: 'n8n_workflow_v2',
        requirements: [{ id: 'record', description: 'Record an actual parent failure.' }],
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        acceptanceCases: [
          {
            id: 'parent-error',
            description: 'An actual failure is recorded',
            requirementIds: ['record'],
            input: { error: true },
            expectedOutput: { recorded: true },
            assertions: [],
          },
        ],
        connections: connected
          ? [
              {
                id: 'receiver',
                provider: 'https',
                operation: 'post',
                purpose: 'Deliver approved error notification',
                credentialType: 'orqalyBoundedHttp',
                nodeIds: ['deliver'],
              },
            ]
          : [],
        runtimeProfile: 'request_automation',
      },
    },
  ];
  const artifact = normalizeNativeBundle({ workflow, spec, id });
  const pins = pinsFor(artifact);
  const deployment = {
    workflowId: 'main-source',
    versionId: 'main-version',
    workflowHash: artifact.workflowHash,
    bundleHash: artifact.bundleHash,
    dependencies: pins,
    materializedWorkflowHash: materializeNativeBundle(artifact, pins).workflowHash,
    active: false,
  };
  return {
    id,
    tenant_id: scope.tenantId,
    owner_user_id: scope.userId,
    environment_id: 'bundle-preview',
    ...artifact,
    workflow_hash: artifact.workflowHash,
    deployment,
    nativeConnections: connected
      ? [
          {
            id: credentialId,
            requirement_id: `owned:${dependencyId}:receiver`,
            environment_id: 'bundle-preview',
            credential_type: 'orqalyBoundedHttp',
            provider_credential_id: 'private-provider-reference',
            scope: { target: 'https://receiver.example/events' },
          },
        ]
      : [],
  };
}
function attempt(
  solution,
  {
    failed = false,
    childStatus = failed ? 'succeeded' : 'not_triggered',
    testCase = solution.spec.acceptanceCases[0],
  } = {}
) {
  const authorization = {
    bundleHash: nativeBundleHash(solution),
    workflowHash: solution.workflow_hash,
    ...(solution.nativeConnections.length ? { allowExternalEffects: true } : {}),
  };
  const evidence = nativeSolutionTestPlan(solution, authorization);
  const artifact = normalizeNativeBundle({
    workflow: solution.workflow,
    spec: solution.spec,
    id: evidence.testId,
    controlledTest: true,
  });
  const pins = pinsFor(artifact, 'test');
  const result = {
    testArtifactHash: artifact.workflowHash,
    testBundleHash: artifact.bundleHash,
    materializedWorkflowHash: materializeNativeBundle(artifact, pins).workflowHash,
    status: failed ? 'failed' : 'succeeded',
    executionId: '51',
    responseStatus: failed ? 500 : testCase.expectedStatus,
    output: failed ? null : testCase.expectedOutput,
    cleanup: { status: 'removed' },
    ownedDependencies: pins.map((pin) => ({
      ...pin,
      status: childStatus,
      executionId:
        childStatus === 'not_triggered' ? null : childStatus === 'outcome_unknown' ? null : '52',
      parentExecutionId: childStatus === 'not_triggered' ? null : '51',
    })),
  };
  return {
    artifact,
    result,
    invocation: { id: randomUUID(), mode: 'test', input: testCase.input, evidence },
  };
}

describe('reviewed main and owned error-handler evidence', () => {
  it('accepts a bounded bundleHash on invocation, revision test and lifecycle wires only', () => {
    const bundleHash = 'a'.repeat(64);
    expect(SolutionInvocationSchema.parse({ mode: 'test', input: {}, bundleHash }).bundleHash).toBe(
      bundleHash
    );
    expect(SolutionRevisionInvocationSchema.parse({ input: {}, bundleHash }).bundleHash).toBe(
      bundleHash
    );
    expect(
      SolutionDecisionSchema.parse({
        action: 'activate',
        workflowHash: bundleHash,
        bundleHash,
        environmentId: null,
      }).bundleHash
    ).toBe(bundleHash);
    expect(
      SolutionInvocationSchema.safeParse({ mode: 'test', input: {}, bundleHash: 'provider-id' })
        .success
    ).toBe(false);
  });
  it('pins both source bundle and separately normalized disposable test artifacts', () => {
    const solution = fixture();
    const { invocation, artifact } = attempt(solution);
    expect(invocation.evidence).toMatchObject({
      bundleHash: nativeBundleHash(solution),
      testBundleHash: artifact.bundleHash,
      testArtifactHash: artifact.workflowHash,
      sourceOwnedDependencies: solution.deployment.dependencies,
    });
    expect(invocation.evidence.testBundleHash).not.toBe(invocation.evidence.bundleHash);
    expect(artifact.spec.ownedDependencies[0].workflow.settings.saveDataSuccessExecution).toBe(
      'all'
    );
    expect(solution.spec.ownedDependencies[0].workflow.settings.saveDataSuccessExecution).toBe(
      'none'
    );
  });
  it('requires exact bundle consent for child-only connections and rejects stale child changes', async () => {
    const solution = fixture({ connected: true });
    const input = solution.spec.acceptanceCases[0].input;
    expect(() =>
      validateSolutionInvocationInput(solution, input, 'test', {
        workflowHash: solution.workflow_hash,
        allowExternalEffects: true,
      })
    ).toThrow('bundle');
    const approval = {
      workflowHash: solution.workflow_hash,
      bundleHash: nativeBundleHash(solution),
      allowExternalEffects: true,
    };
    expect(() => validateSolutionInvocationInput(solution, input, 'test', approval)).not.toThrow();
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ id: randomUUID() }] }) };
    await expect(assertNoUnresolvedNativeEffect(client, scope, solution)).rejects.toMatchObject({
      code: 'SOLUTION_EFFECT_UNRESOLVED',
    });
    solution.spec.ownedDependencies[0].workflow.nodes[1].parameters.jsonOutput =
      '={{ { "recorded": false } }}';
    expect(() => validateSolutionInvocationInput(solution, input, 'test', approval)).toThrow(
      'bundle'
    );
  });
  it.each([
    'bundleHash',
    'materializedWorkflowHash',
    'workflowId',
    'versionId',
    'child-id',
    'child-version',
    'child-hash',
  ])('rejects changed %s in activation and pause receipts', (field) => {
    const solution = fixture();
    const receipt = structuredClone(solution.deployment);
    receipt.active = true;
    expect(nativeLifecycleReceiptMatches(receipt, solution, true)).toBe(true);
    if (field.startsWith('child'))
      receipt.dependencies[0][
        field === 'child-id'
          ? 'workflowId'
          : field === 'child-version'
            ? 'versionId'
            : 'workflowHash'
      ] = 'changed';
    else receipt[field] = 'changed';
    expect(nativeLifecycleReceiptMatches(receipt, solution, true)).toBe(false);
    expect(nativeLifecycleReceiptMatches(receipt, solution, false)).toBe(false);
  });
  it.each(['source-bundle', 'test-bundle', 'source-pin'])(
    'refuses stale %s before runtime dispatch',
    async (field) => {
      const solution = fixture();
      const { invocation } = attempt(solution);
      if (field === 'source-bundle') invocation.evidence.bundleHash = '0'.repeat(64);
      else if (field === 'test-bundle') invocation.evidence.testBundleHash = '0'.repeat(64);
      else invocation.evidence.sourceOwnedDependencies[0].versionId = 'foreign';
      const runtime = { testNative: vi.fn() };
      expect((await executeSolutionInvocation(runtime, scope, solution, invocation)).status).toBe(
        'outcome_unknown'
      );
      expect(runtime.testNative).not.toHaveBeenCalled();
    }
  );
  it('records actual parent failure and exact child success separately without claiming alert delivery', async () => {
    const solution = fixture();
    const { invocation, artifact, result } = attempt(solution, { failed: true });
    result.ownedDependencies[0].rawProviderBody = 'must not persist';
    const runtime = { testNative: vi.fn().mockResolvedValue(result) };
    const saved = await executeSolutionInvocation(runtime, scope, solution, invocation);
    expect(runtime.testNative.mock.calls[0][1]).toMatchObject({
      spec: artifact.spec,
      bundleHash: artifact.bundleHash,
    });
    expect(saved).toMatchObject({
      status: 'failed',
      errorCode: 'NATIVE_EXECUTION_FAILED',
      evidence: {
        bundleHash: nativeBundleHash(solution),
        testBundleHash: artifact.bundleHash,
        ownedDependencies: [{ executionId: '52', parentExecutionId: '51', status: 'succeeded' }],
      },
    });
    expect(saved.evidence.ownedDependencies[0].outboundDelivery).toBeUndefined();
    expect(JSON.stringify(saved)).not.toContain('must not persist');
  });
  it.each(['test-bundle', 'materialized', 'child-hash', 'child-spec', 'parent', 'execution'])(
    'does not accept mismatched runtime %s proof',
    async (field) => {
      const solution = fixture();
      const { invocation, result } = attempt(solution, { failed: true });
      if (field === 'test-bundle') result.testBundleHash = '0'.repeat(64);
      else if (field === 'materialized') result.materializedWorkflowHash = '0'.repeat(64);
      else
        result.ownedDependencies[0][
          {
            'child-hash': 'workflowHash',
            'child-spec': 'specHash',
            parent: 'parentExecutionId',
            execution: 'executionId',
          }[field]
        ] = 'invalid';
      const runtime = { testNative: vi.fn().mockResolvedValue(result) };
      expect((await executeSolutionInvocation(runtime, scope, solution, invocation)).status).toBe(
        'outcome_unknown'
      );
    }
  );
  it('does not turn unfinished child evidence into success or an automatic replay', async () => {
    const solution = fixture();
    const { invocation, result } = attempt(solution, {
      failed: true,
      childStatus: 'outcome_unknown',
    });
    const runtime = { testNative: vi.fn().mockResolvedValue(result) };
    const saved = await executeSolutionInvocation(runtime, scope, solution, invocation);
    expect(saved).toMatchObject({
      status: 'outcome_unknown',
      errorCode: 'NATIVE_ERROR_HANDLER_UNCONFIRMED',
    });
    expect(runtime.testNative).toHaveBeenCalledTimes(1);
  });
  it('requires separate verified error-handler evidence in addition to all main business cases', async () => {
    const solution = fixture();
    const main = [];
    for (const testCase of solution.spec.acceptanceCases) {
      const { invocation, result } = attempt(solution, { testCase });
      const saved = await executeSolutionInvocation(
        { testNative: vi.fn().mockResolvedValue(result) },
        scope,
        solution,
        invocation
      );
      main.push({ ...saved, input: invocation.input, execution_id: saved.executionId });
    }
    let handler = [];
    const client = {
      query: vi.fn(async (sql) => ({ rows: sql.includes("status='failed'") ? handler : main })),
    };
    expect(await hasNativeAcceptanceCoverage(client, scope, solution)).toBe(false);
    const { invocation, result } = attempt(solution, { failed: true });
    const saved = await executeSolutionInvocation(
      { testNative: vi.fn().mockResolvedValue(result) },
      scope,
      solution,
      invocation
    );
    handler = [{ ...saved, input: invocation.input, execution_id: saved.executionId }];
    expect(await hasNativeAcceptanceCoverage(client, scope, solution)).toBe(true);
    expect(
      client.query.mock.calls.every(
        ([, params]) =>
          params[0] === scope.tenantId && params[1] === scope.userId && params[2] === solution.id
      )
    ).toBe(true);
    handler[0].evidence.ownedDependencies[0].status = 'not_triggered';
    handler[0].evidence.ownedDependencies[0].executionId = null;
    expect(await hasNativeAcceptanceCoverage(client, scope, solution)).toBe(false);
  });
  it('never counts child success alone as proof that a connected notification was accepted', async () => {
    const solution = fixture({ connected: true });
    const main = [];
    for (const testCase of solution.spec.acceptanceCases) {
      const { invocation, result } = attempt(solution, { testCase });
      const saved = await executeSolutionInvocation(
        { testNative: vi.fn().mockResolvedValue(result) },
        scope,
        solution,
        invocation
      );
      main.push({ ...saved, input: invocation.input, execution_id: saved.executionId });
    }
    const { invocation, result } = attempt(solution, { failed: true });
    const saved = await executeSolutionInvocation(
      { testNative: vi.fn().mockResolvedValue(result) },
      scope,
      solution,
      invocation
    );
    const handler = [{ ...saved, input: invocation.input, execution_id: saved.executionId }];
    const client = {
      query: vi.fn(async (sql) => ({ rows: sql.includes("status='failed'") ? handler : main })),
    };
    expect(await hasNativeAcceptanceCoverage(client, scope, solution)).toBe(false);
    handler[0].evidence.ownedDependencies[0].outboundDelivery = {
      delivery: 'accepted',
      nodeId: 'deliver',
      connectionId: credentialId,
    };
    expect(await hasNativeAcceptanceCoverage(client, scope, solution)).toBe(true);
    handler[0].evidence.bundleHash = '0'.repeat(64);
    expect(await hasNativeAcceptanceCoverage(client, scope, solution)).toBe(false);
  });
});
