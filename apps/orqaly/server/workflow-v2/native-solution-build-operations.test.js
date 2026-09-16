// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  createNativeBuildOperations,
  nativeBuildProjection,
  nativeTestCaseEvidence,
  boundNativeTestEvidence,
  NATIVE_TEST_SUITE_BUDGET_MS,
  NATIVE_TEST_QUEUE_EXPIRY_MS,
} from './native-solution-build-operations.js';
import { normalizeNativeWorkflow } from './native-workflow-runtime-contract.js';
import { REQUEST_AUTOMATION_POLICY } from './native-workflow-review.js';
import { nativeOutboundFixture } from '../../scripts/fixtures/native-outbound-workflow.mjs';

const id = '799a3d83-b19a-4f4f-aa94-bd2b04cc76de';
const scope = { tenantId: '3c690d2c-d1fa-4c07-84f4-34491ed39f0a', userId: 'user_native_test' };
const leaseToken = 'ac68c397-f560-4878-a03b-735019368fe5';
const connectionId = '0b3f7386-d51e-40af-9a89-5fe6fdf8617a';
const spec = () => ({
  kind: 'n8n_workflow_v2',
  runtimeProfile: 'request_automation',
  connections: [],
  requirements: [{ id: 'route', description: 'Return the decision' }],
  inputSchema: {
    type: 'object',
    properties: { amount: { type: 'number' } },
    required: ['amount'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: { accepted: { type: 'boolean' } },
    required: ['accepted'],
    additionalProperties: false,
  },
  acceptanceCases: [
    {
      id: 'valid',
      description: 'Accept an order',
      requirementIds: ['route'],
      input: { amount: 100 },
      expectedOutput: { accepted: true },
      assertions: [],
    },
  ],
});
const workflow = () => ({
  name: 'Order decision',
  nodes: [
    {
      id: 'receive',
      name: 'Receive order',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2.1,
      position: [0, 0],
      parameters: {
        path: 'authored-path',
        httpMethod: 'POST',
        responseMode: 'responseNode',
        options: {},
      },
    },
    {
      id: 'reply',
      name: 'Reply',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.5,
      position: [250, 0],
      parameters: { respondWith: 'json', responseBody: '={{ { accepted: true } }}', options: {} },
    },
  ],
  connections: { 'Receive order': { main: [[{ node: 'Reply', type: 'main', index: 0 }]] } },
  settings: {},
});
const fail = (code, message, status = 409) => {
  throw Object.assign(new Error(message), { code, status });
};
const proof = (artifact) => ({
  status: 'succeeded',
  executionId: '123',
  responseStatus: 200,
  output: { accepted: true },
  testArtifactHash: hash(artifact),
  cleanup: { status: 'removed' },
  executedNodeIds: ['receive', 'reply'],
  diagnostics: [],
});

function fixture({ enableTests = true } = {}) {
  const normalized = normalizeNativeWorkflow({ workflow: workflow(), id });
  const f = {
    value: {
      id,
      tenant_id: scope.tenantId,
      owner_user_id: scope.userId,
      preparation_version: 2,
      row_version: 0,
      input_version: 1,
      status: 'draft',
      environment_id: 'owned-runtime',
      workflow: normalized.workflow,
      workflow_hash: normalized.workflowHash,
      spec: spec(),
      questions: [],
      native_metadata: {},
      native_test_lease_token: null,
    },
    tests: [],
    connections: [],
    occupied: [],
    events: [],
    leaseValid: true,
  };
  const result = (rows = []) => ({ rows, rowCount: rows.length });
  f.client = {
    query: vi.fn(async (sql, values) => {
      if (sql.includes('pg_advisory_xact_lock')) return result([{}]);
      if (sql.includes('UNION SELECT environment_id'))
        return result(f.occupied.map((environment_id) => ({ environment_id })));
      if (sql.includes('native_test_lease_expires_at>clock_timestamp()'))
        return result([{ valid: f.leaseValid }]);
      if (sql.includes('SET native_test_lease_token=NULL')) {
        f.value.native_test_lease_token = null;
        f.value.row_version++;
        return result([{}]);
      }
      if (sql.includes('solution_connections') && sql.includes('SELECT *'))
        return result(f.connections.filter((item) => item.status !== 'revoked'));
      if (sql.includes('solution_connections') && sql.includes("SET status='revoked'")) {
        const connection = f.connections.find(
          (item) => item.id === values[3] && item.status !== 'revoked'
        );
        if (connection) connection.status = 'revoked';
        return result(connection ? [structuredClone(connection)] : []);
      }
      if (sql.includes('solution_build_attempts')) return result([]);
      if (
        sql.includes('UPDATE orqaly.solution_build_tests') &&
        sql.includes("status='outcome_unknown'")
      )
        return result([]);
      if (sql.includes('SELECT') && sql.includes('solution_build_tests')) {
        if (sql.includes('request_key=$4'))
          return result(f.tests.filter((test) => test.request_key === values[3]));
        if (sql.includes('AND id=$4'))
          return result(f.tests.filter((test) => test.id === values[3]));
        if (sql.includes("status IN ('running','outcome_unknown')"))
          return result(
            f.tests
              .filter((test) => ['running', 'outcome_unknown'].includes(test.status))
              .slice(-1)
              .reverse()
          );
        if (sql.includes('ORDER BY created_at DESC,id DESC')) return result(f.tests.slice(-1));
      }
      if (sql.includes('INSERT INTO orqaly.solution_build_tests')) {
        const [
          tenant_id,
          build_request_id,
          testId,
          owner_user_id,
          input_version,
          workflow_hash,
          candidate_fingerprint,
          test_artifact_hash,
          environment_id,
          request_key,
          request_hash,
          configuration,
        ] = values;
        f.tests.push({
          tenant_id,
          build_request_id,
          id: testId,
          owner_user_id,
          input_version,
          workflow_hash,
          candidate_fingerprint,
          test_artifact_hash,
          environment_id,
          request_key,
          request_hash,
          configuration: JSON.parse(configuration),
          status: 'running',
          evidence: {},
        });
        return result([{}]);
      }
      if (sql.includes('UPDATE orqaly.solution_build_tests SET status=$4')) {
        const test = f.tests.find((item) => item.id === values[2] && item.status === 'running');
        if (!test) return result([]);
        test.status = values[3];
        test.evidence = JSON.parse(values[4]);
        return result([{}]);
      }
      throw new Error(`Unexpected test SQL: ${sql}`);
    }),
  };
  f.runtime = {
    environmentIds: vi.fn(() => ['owned-runtime', 'second-runtime']),
    nativePolicy: vi.fn(() => REQUEST_AUTOMATION_POLICY),
    describe: vi.fn((id) => ({ id })),
    testNative: vi.fn(async (_scope, command) => proof(command.workflow)),
  };
  f.enqueue = vi.fn();
  f.repository = { claimNativeWorkflowRetest: vi.fn(async () => null) };
  f.ops = createNativeBuildOperations({
    enableTests,
    repository: f.repository,
    runtime: f.runtime,
    tx: async (actual, callback) => {
      expect(actual).toEqual(scope);
      return callback(f.client);
    },
    owner: async () => scope,
    find: vi.fn(async (_client, actual, requested) => {
      expect(actual).toEqual(scope);
      expect(requested).toBe(id);
      return structuredClone(f.value);
    }),
    update: async (_client, _scope, _id, patch) => {
      f.value = { ...f.value, ...structuredClone(patch), row_version: f.value.row_version + 1 };
      return structuredClone(f.value);
    },
    event: async (_client, _scope, _value, kind, details, key, requestHash) => {
      f.events.push({ kind, details, key, requestHash });
    },
    replay: async (_client, _scope, _id, kind, key, command) => {
      const prior = f.events.find((event) => event.kind === kind && event.key === key);
      if (prior && prior.requestHash !== hash(command))
        fail('IDEMPOTENCY_CONFLICT', 'Changed command');
      return !!prior;
    },
    readFor: async () => structuredClone(f.value),
    version: (value, expected) => {
      if (value.row_version !== expected) fail('BUILD_VERSION_CONFLICT', 'Stale version');
    },
    enqueue: f.enqueue,
    supersede: vi.fn(),
    fail,
  });
  f.command = () => ({
    expectedVersion: f.value.row_version,
    workflowHash: f.value.workflow_hash,
    allowExternalEffects: false,
    repairOnFailure: true,
  });
  f.claim = () => {
    f.value.native_test_lease_token = leaseToken;
    f.value.row_version++;
    const claim = {
      ...scope,
      buildRequestId: id,
      rowVersion: f.value.row_version,
      workflowHash: f.value.workflow_hash,
      leaseToken,
    };
    f.repository.claimNativeWorkflowRetest.mockResolvedValueOnce(claim);
    return claim;
  };
  f.automatic = () => {
    f.value.native_metadata.autoRetest = true;
    return f.claim();
  };
  f.advanceQueued = async () => {
    if (f.value.native_metadata.pendingTest && f.value.status === 'draft') f.claim();
    return f.ops.advancePendingTest();
  };
  f.runTest = async (command, key) => {
    await f.ops.methods.test({}, id, command, key);
    return f.advanceQueued();
  };
  return f;
}

describe('native test evidence cannot manufacture a successful run', () => {
  const item = () => {
    const compiled = normalizeNativeWorkflow({ workflow: workflow(), id, controlledTest: true });
    return { id: 'valid', acceptance: spec().acceptanceCases[0], ...compiled };
  };
  it('requires real exact artifact evidence and records the exact output hash', () => {
    const sample = item();
    const actual = { ...proof(sample.workflow), executedNodeIds: ['reply', 'unknown', 'reply'] };
    expect(nativeTestCaseEvidence({ actual, item: sample, spec: spec() })).toMatchObject({
      passed: true,
      status: 'succeeded',
      outputHash: hash(actual.output),
      executedNodeIds: ['reply'],
    });
  });
  it.each([
    { testArtifactHash: '0'.repeat(64) },
    { testArtifactHash: undefined },
    { cleanup: { status: 'pending' } },
    { cleanup: undefined },
    { executionId: '' },
    { executionId: 'invented' },
    { executionId: null },
    { responseStatus: undefined },
    { responseStatus: 999 },
    { status: 'made_up_success' },
  ])(
    'makes mismatched or incomplete evidence unknown, never a successful repair signal (%j)',
    (patch) => {
      const sample = item();
      const actual = { ...proof(sample.workflow), ...patch };
      // Undefined is omitted by real JSON transport.
      const evidence = nativeTestCaseEvidence({
        actual: JSON.parse(JSON.stringify(actual)),
        item: sample,
        spec: spec(),
      });
      expect(evidence).toMatchObject({
        passed: false,
        status: 'outcome_unknown',
        executionId: null,
      });
      expect(evidence.output).toBeUndefined();
      expect(evidence.outputHash).toBeUndefined();
    }
  );
  it('uses actual non-200 responses and includes bounded observed output in repair diagnostics', () => {
    const sample = item();
    const evidence = nativeTestCaseEvidence({
      actual: { ...proof(sample.workflow), responseStatus: 422, output: { accepted: false } },
      item: sample,
      spec: spec(),
    });
    expect(evidence.passed).toBe(false);
    expect(
      JSON.parse(
        evidence.issues.find((issue) => issue.code === 'NATIVE_ACCEPTANCE_MISMATCH').message
      )
    ).toEqual({ caseId: 'valid', responseStatus: 422, actualOutput: { accepted: false } });
  });
  it('does not expose sensitive or oversized output to evidence or repair prompts', () => {
    const sample = item();
    for (const output of [
      { authorization: 'Bearer secret-provider-credential' },
      { payload: 'x'.repeat(20001) },
    ]) {
      const evidence = nativeTestCaseEvidence({
        actual: { ...proof(sample.workflow), output },
        item: sample,
        spec: spec(),
      });
      expect(evidence.passed).toBe(false);
      expect(evidence.output).toBeUndefined();
      expect(evidence.outputHash).toBeUndefined();
      expect(JSON.stringify(evidence)).not.toContain('secret-provider-credential');
    }
  });
  it('bounds aggregate evidence without changing completion flags or exact output hashes', () => {
    const output = { payload: 'x'.repeat(19000) };
    const cases = Array.from({ length: 20 }, (_, index) => ({
      id: `case${index}`,
      input: { text: 'y'.repeat(8000) },
      output,
      outputHash: hash(output),
      passed: true,
      status: 'succeeded',
      executionId: String(index + 1),
      workflowHash: 'a'.repeat(64),
      issues: [],
      assertions: [],
    }));
    const result = boundNativeTestEvidence({
      status: 'succeeded',
      caseResults: cases,
      diagnostics: [],
    });
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(128000);
    expect(
      result.caseResults.every((item) => item.passed && item.outputHash === hash(output))
    ).toBe(true);
    expect(result.caseResults.at(-1).output).toBeUndefined();
    expect(result.caseResults.at(-1).outputOmitted).toBeTruthy();
    expect(cases.at(-1).output).toEqual(output);
  });
});

describe('durable native build lifecycle', () => {
  it('flag-off denies new queue/repair and worker dispatch while retaining readable drafts', async () => {
    const f = fixture({ enableTests: false });
    await expect(
      f.ops.methods.test({}, id, f.command(), 'disabled_new_test')
    ).rejects.toMatchObject({ code: 'BUILD_TESTS_DISABLED' });
    await expect(
      f.ops.methods.repair(
        {},
        id,
        { expectedVersion: 0, workflowHash: f.value.workflow_hash },
        'disabled_new_repair'
      )
    ).rejects.toMatchObject({ code: 'BUILD_TESTS_DISABLED' });
    expect(await f.ops.advancePendingTest()).toEqual({ processed: false });
    const projected = await f.ops.describe(
      f.client,
      scope,
      f.value,
      nativeBuildProjection(f.value)
    );
    expect(projected.testEligibility).toMatchObject({
      allowed: false,
      reason: expect.stringContaining('disabled'),
    });
    expect(projected.repairEligibility).toMatchObject({
      allowed: false,
      reason: expect.stringContaining('disabled'),
    });
    expect(f.repository.claimNativeWorkflowRetest).not.toHaveBeenCalled();
    expect(f.runtime.testNative).not.toHaveBeenCalled();
  });
  it('rejects a changed replay and a second queued request without any runtime effect', async () => {
    const f = fixture();
    const command = f.command();
    await f.ops.methods.test({}, id, command, 'queued_request_key');
    await expect(
      f.ops.methods.test({}, id, { ...command, repairOnFailure: false }, 'queued_request_key')
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      f.ops.methods.test({}, id, f.command(), 'second_request_key')
    ).rejects.toMatchObject({ code: 'BUILD_TEST_QUEUED' });
    expect(f.runtime.testNative).not.toHaveBeenCalled();
    expect(f.tests).toHaveLength(0);
    const projected = await f.ops.describe(
      f.client,
      scope,
      f.value,
      nativeBuildProjection(f.value)
    );
    expect(projected.testEvidence.status).toBe('queued');
    expect(projected.testEligibility.allowed).toBe(false);
    expect(projected.repairEligibility.allowed).toBe(false);
  });
  it.each(['expired', 'edited', 'cancelled', 'policy_changed', 'changed_consent'])(
    'does not dispatch invalidated queued consent (%s)',
    async (mode) => {
      const f = fixture();
      const command = f.command();
      await f.ops.methods.test({}, id, command, 'queued_invalidated');
      if (mode === 'expired')
        f.value.native_metadata.pendingTest.expiresAt = new Date(
          Date.now() - NATIVE_TEST_QUEUE_EXPIRY_MS
        ).toISOString();
      if (mode === 'edited') {
        f.value.input_version++;
        f.value.native_metadata.pendingTest = null;
        f.value.native_metadata.testEvidence = null;
        f.value.row_version++;
      }
      if (mode === 'cancelled')
        await f.ops.methods.cancel(
          {},
          id,
          { expectedVersion: f.value.row_version },
          'cancel_queued_request'
        );
      if (mode === 'policy_changed')
        f.runtime.nativePolicy.mockReturnValue({
          ...REQUEST_AUTOMATION_POLICY,
          maxExecutionSeconds: 31,
        });
      if (mode === 'changed_consent')
        f.value.native_metadata.pendingTest.command.allowExternalEffects = true;
      await f.advanceQueued();
      expect(f.runtime.testNative).not.toHaveBeenCalled();
      expect(f.tests).toHaveLength(0);
      // Replaying the original HTTP request cannot resurrect superseded consent.
      await f.ops.methods.test({}, id, command, 'queued_invalidated');
      await f.advanceQueued();
      expect(f.runtime.testNative).not.toHaveBeenCalled();
    }
  );
  it('never permits an external-effects claim through the initial queue', async () => {
    const f = fixture();
    await expect(
      f.ops.methods.test(
        {},
        id,
        { ...f.command(), allowExternalEffects: true },
        'not_a_write_grant'
      )
    ).rejects.toMatchObject({ code: 'BUILD_EFFECTS_DISABLED' });
    expect(f.events).toHaveLength(0);
    expect(f.runtime.testNative).not.toHaveBeenCalled();
  });
  it('accepts initial row version 0, executes once and requires immutable evidence for handoff', async () => {
    const f = fixture();
    const command = f.command();
    const queued = await f.ops.methods.test({}, id, command, 'native_test_first');
    expect(queued.native_metadata.testEvidence.status).toBe('queued');
    expect(f.runtime.testNative).not.toHaveBeenCalled();
    expect(f.tests).toHaveLength(0);
    await f.ops.methods.test({}, id, command, 'native_test_first');
    expect(f.events.filter((event) => event.kind === 'test_requested')).toHaveLength(1);
    await f.advanceQueued();
    expect(f.value.native_metadata.testEvidence.status).toBe('succeeded');
    expect(f.tests[0].status).toBe('succeeded');
    expect(f.tests[0].request_key).toBe('native_test_first');
    expect(f.tests[0].request_hash).toBe(hash(command));
    expect(f.tests[0].configuration.authorization.command).toEqual(command);
    await f.ops.assertHandoff(f.client, scope, f.value);
    await f.ops.methods.test({}, id, command, 'native_test_first');
    expect(f.runtime.testNative).toHaveBeenCalledTimes(1);
    f.tests[0].evidence.caseResults[0].output.accepted = false;
    await expect(f.ops.assertHandoff(f.client, scope, f.value)).rejects.toMatchObject({
      code: 'BUILD_TEST_REQUIRED',
    });
  });
  it('persists cleanup uncertainty, blocks repair/retest after draft metadata is cleared, and does not re-dispatch', async () => {
    const f = fixture();
    f.runtime.testNative.mockImplementation(async (_scope, { workflow }) => ({
      ...proof(workflow),
      cleanup: { status: 'pending' },
    }));
    await f.runTest(f.command(), 'native_uncertain');
    expect(f.tests[0].status).toBe('outcome_unknown');
    expect(f.enqueue).not.toHaveBeenCalled();
    f.value.native_metadata = {};
    f.value.row_version++;
    f.value.input_version++;
    await expect(
      f.ops.methods.test({}, id, f.command(), 'native_after_edit')
    ).rejects.toMatchObject({ code: 'BUILD_TEST_UNAVAILABLE' });
    await expect(f.ops.methods.repair({}, id, f.command(), 'repair_after_edit')).rejects.toThrow();
    expect(f.runtime.testNative).toHaveBeenCalledTimes(1);
  });
  it('never treats an interrupted test row as permission to dispatch the next case', async () => {
    const f = fixture();
    f.value.spec.acceptanceCases.push({ ...f.value.spec.acceptanceCases[0], id: 'second' });
    f.runtime.testNative.mockImplementation(async (_scope, { workflow }) => {
      f.tests[0].status = 'outcome_unknown';
      return proof(workflow);
    });
    await f.runTest(f.command(), 'interrupted_case');
    expect(f.runtime.testNative).toHaveBeenCalledTimes(1);
    expect(f.tests[0].status).toBe('outcome_unknown');
    expect(f.value.native_metadata.testEvidence.status).not.toBe('succeeded');
  });
  it('stops new admissions at the immutable suite deadline with no automatic repair', async () => {
    const f = fixture();
    f.value.spec.acceptanceCases.push({ ...f.value.spec.acceptanceCases[0], id: 'second' });
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    try {
      f.runtime.testNative.mockImplementation(async (_scope, { workflow }) => {
        clock.mockReturnValue(start + NATIVE_TEST_SUITE_BUDGET_MS);
        return proof(workflow);
      });
      await f.runTest(f.command(), 'budget_limited_suite');
      expect(f.runtime.testNative).toHaveBeenCalledTimes(1);
      expect(f.enqueue).not.toHaveBeenCalled();
      expect(f.tests[0].configuration.deadline).toBe(
        new Date(start + NATIVE_TEST_SUITE_BUDGET_MS).toISOString()
      );
      expect(f.tests[0].evidence).toMatchObject({
        status: 'failed',
        diagnostics: [expect.objectContaining({ code: 'NATIVE_TEST_BUDGET_EXHAUSTED' })],
      });
    } finally {
      clock.mockRestore();
    }
  });
  it('preserves actual terminal evidence when cancellation freezes the build metadata', async () => {
    const f = fixture();
    f.runtime.testNative.mockImplementation(async (_scope, { workflow }) => {
      await f.ops.methods.cancel(
        {},
        id,
        { expectedVersion: f.value.row_version },
        'cancel_during_test'
      );
      return proof(workflow);
    });
    await f.runTest(f.command(), 'test_then_cancel');
    expect(f.value.status).toBe('cancelled');
    expect(f.tests[0].status).toBe('succeeded');
    const projected = await f.ops.describe(
      f.client,
      scope,
      f.value,
      nativeBuildProjection(f.value)
    );
    expect(projected.testEvidence).toMatchObject({ status: 'succeeded', historical: true });
    expect(projected.testEligibility.allowed).toBe(false);
  });
  it('repairs a genuine mismatch with frozen criteria then stops an identical failure', async () => {
    const f = fixture();
    const frozen = structuredClone(f.value.spec.acceptanceCases);
    f.runtime.testNative.mockImplementation(async (_scope, { workflow }) => ({
      ...proof(workflow),
      output: { accepted: false },
    }));
    await f.runTest(f.command(), 'failed_test_one');
    expect(f.value.status).toBe('preparing');
    expect(f.value.native_metadata.frozenAcceptanceCases).toEqual(frozen);
    expect(f.enqueue).toHaveBeenCalledTimes(1);
    f.value.status = 'draft';
    f.value.native_metadata.testEvidence = null;
    await f.runTest(f.command(), 'failed_test_two');
    expect(f.value.status).toBe('draft');
    expect(f.enqueue).toHaveBeenCalledTimes(1);
    expect(f.value.native_metadata.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'REPEATED_TEST_FAILURE' })
    );
  });
  it.each(['expired', 'different_hash', 'different_version', 'different_owner', 'different_token'])(
    'does not run an invalid automatic lease (%s)',
    async (mode) => {
      const f = fixture();
      const claim = f.automatic();
      if (mode === 'expired') f.leaseValid = false;
      if (mode === 'different_hash') f.value.workflow_hash = '0'.repeat(64);
      if (mode === 'different_version') f.value.row_version++;
      if (mode === 'different_owner') claim.userId = 'different_owner';
      if (mode === 'different_token') f.value.native_test_lease_token = connectionId;
      if (mode === 'different_owner') await expect(f.ops.advancePendingTest()).rejects.toThrow();
      else await f.ops.advancePendingTest();
      expect(f.runtime.testNative).not.toHaveBeenCalled();
      expect(f.tests).toHaveLength(0);
    }
  );
  it('consumes a valid private lease once and never collects credentials for automatic retests', async () => {
    const f = fixture();
    f.automatic();
    await f.ops.advancePendingTest();
    expect(f.runtime.testNative).toHaveBeenCalledTimes(1);
    expect(f.value.native_test_lease_token).toBeNull();
    expect(f.value.native_metadata.autoRetest).toBe(false);
    expect(await f.ops.advancePendingTest()).toEqual({ processed: false });
    expect(f.runtime.testNative.mock.calls[0][0]).toEqual(scope);
    const external = fixture();
    external.value.spec.connections = [
      { id: 'provider', credentialType: 'twilioApi', nodeIds: ['reply'] },
    ];
    external.automatic();
    await external.ops.advancePendingTest();
    expect(external.runtime.testNative).not.toHaveBeenCalled();
  });
  it('detects child-only service effects for setup and refuses automatic retest without a separate user authorization', async () => {
    const f = fixture();
    const child = nativeOutboundFixture();
    child.workflow.nodes = child.workflow.nodes.slice(0, 2);
    Object.assign(child.workflow.nodes[0], {
      type: 'n8n-nodes-base.errorTrigger',
      typeVersion: 1,
      parameters: {},
    });
    delete child.workflow.connections['Deliver event'];
    f.value.workflow.settings.errorWorkflow = 'orqaly:error:alerts';
    f.value.spec.ownedDependencies = [{ id: 'alerts', kind: 'error_handler', ...child }];
    f.value.workflow_hash = hash(f.value.workflow);
    expect(f.value.spec.connections).toEqual([]);
    const context = await f.ops.context(f.client, scope, f.value);
    expect(context.requirements).toHaveLength(1);
    expect(context.requirements[0]).toMatchObject({
      id: 'owned:alerts:receiver',
      dependencyId: 'alerts',
      status: 'missing',
      canConnect: false,
    });
    expect(context.eligibility.requiresEffectApproval).toBe(true);
    expect(context.eligibility.allowed).toBe(false);
    f.automatic();
    await f.ops.advancePendingTest();
    expect(f.runtime.testNative).not.toHaveBeenCalled();
    expect(f.value.native_metadata.autoRetest).toBe(false);
  });
  it('uses the same tenant-owner advisory lock and cross-table occupancy before reserving an environment', async () => {
    const f = fixture();
    f.value.environment_id = null;
    f.occupied = ['owned-runtime'];
    expect(await f.ops.environment(f.client, scope, f.value, true)).toBe('second-runtime');
    const calls = f.client.query.mock.calls;
    expect(calls[0][0]).toContain("'orqaly.solution-environment:'");
    expect(calls[0][1]).toEqual([scope.tenantId, scope.userId]);
    expect(calls[1][0]).toContain('orqaly.customer_solutions');
    expect(calls[1][0]).toContain('orqaly.solution_build_requests');
    expect(calls[1][1]).toEqual([
      scope.tenantId,
      scope.userId,
      ['owned-runtime', 'second-runtime'],
      id,
    ]);
    expect(f.value.environment_id).toBe('second-runtime');
  });
  it('can revoke authority at row version 0 even with a now-empty draft', async () => {
    const f = fixture();
    f.value.workflow = null;
    f.connections.push({
      id: connectionId,
      status: 'saved',
      provider_credential_id: 'private',
      environment_id: 'owned-runtime',
    });
    await f.ops.methods.revokeConnection(
      {},
      id,
      { expectedVersion: 0, connectionId },
      'revoke_first_version'
    );
    expect(f.connections[0].status).toBe('revoked');
    expect(f.value.workflow).toBeNull();
    expect(f.value.workflow_hash).toBeNull();
  });
});
