// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  createSolutionService,
  executeSolutionInvocation,
  nativeSolutionTestPlan,
  validateSolutionInvocationInput,
} from './solution-service.js';
import { createSolutionRevisionService } from './solution-revision-service.js';
import { normalizeNativeWorkflow } from './native-workflow-runtime-contract.js';
import { REQUEST_AUTOMATION_POLICY } from './native-workflow-review.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const auth = { userId: 'user_native' };
const scope = { tenantId, userId: auth.userId };
const spec = () => ({
  kind: 'n8n_workflow_v2',
  requirements: [{ id: 'count', description: 'Count the supplied items.' }],
  inputSchema: {
    type: 'object',
    properties: { values: { type: 'array', items: { type: 'number' } } },
    required: ['values'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: { count: { type: 'integer' } },
    required: ['count'],
    additionalProperties: false,
  },
  acceptanceCases: [
    {
      id: 'two',
      description: 'Count two items',
      requirementIds: ['count'],
      input: { values: [1, 2] },
      expectedOutput: { count: 2 },
      assertions: [],
    },
    {
      id: 'empty',
      description: 'Count no items',
      requirementIds: ['count'],
      input: { values: [] },
      expectedOutput: { count: 0 },
      assertions: [],
    },
  ],
  connections: [],
  runtimeProfile: 'request_automation',
});
const artifact = () =>
  normalizeNativeWorkflow({
    id,
    workflow: {
      name: 'Count items',
      nodes: [
        {
          id: 'receive',
          name: 'Receive',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 2.1,
          position: [0, 0],
          parameters: {
            httpMethod: 'POST',
            path: 'draft',
            responseMode: 'responseNode',
            options: {},
          },
        },
        {
          id: 'respond',
          name: 'Respond',
          type: 'n8n-nodes-base.respondToWebhook',
          typeVersion: 1.5,
          position: [200, 0],
          parameters: {
            respondWith: 'json',
            responseBody: '={{ { count: $json.body.values.length } }}',
            options: {},
          },
        },
      ],
      connections: { Receive: { main: [[{ node: 'Respond', type: 'main', index: 0 }]] } },
    },
  });

function fixture() {
  const compiled = artifact();
  const value = {
    tenant_id: tenantId,
    owner_user_id: auth.userId,
    id,
    spec: spec(),
    workflow: compiled.workflow,
    workflow_hash: compiled.workflowHash,
    row_version: 0,
    status: 'draft',
    environment_id: 'native-preview-003',
    active_revision_id: null,
    deployment: null,
    tested_at: null,
    updated_at: new Date().toISOString(),
  };
  const invocations = [],
    revisions = [],
    events = [];
  const clone = (v) => structuredClone(v);
  const update = (sql, p, target) => {
    const where = sql.slice(sql.indexOf('WHERE'));
    const cas = where.match(/row_version=\$(\d+)/);
    if (cas && target.row_version !== p[Number(cas[1]) - 1]) return { rows: [] };
    const set = sql.slice(sql.indexOf('SET') + 3, sql.indexOf('WHERE'));
    for (const [, field, parameter, literal] of set.matchAll(
      /\b([a-z_]+)\s*=\s*(?:\$(\d+)|'([^']*)')/g
    ))
      target[field] = parameter ? clone(p[Number(parameter) - 1]) : literal;
    for (const [, field] of set.matchAll(/\b([a-z_]+)\s*=\s*NULL/g)) target[field] = null;
    if (set.includes('row_version=row_version+1')) target.row_version += 1;
    for (const [, field] of set.matchAll(/\b([a-z_]+)\s*=\s*clock_timestamp\(\)/g))
      target[field] = new Date().toISOString();
    if (set.includes('approved_workflow_hash=workflow_hash'))
      target.approved_workflow_hash = target.workflow_hash;
    return { rows: [clone(target)] };
  };
  const query = vi.fn(async (sql, p = []) => {
    const text = sql.trim();
    if (text.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (text.startsWith('SELECT * FROM orqaly.customer_solutions')) return { rows: [clone(value)] };
    if (text.startsWith('SELECT revision_id,status FROM orqaly.solution_invocations'))
      return { rows: invocations.map(clone) };
    if (text.startsWith('SELECT COALESCE(MAX(version)'))
      return { rows: [{ version: revisions.length + 2 }] };
    if (text.startsWith('SELECT deployment FROM orqaly.solution_revisions'))
      return { rows: revisions.filter((r) => r.deployment).map(clone) };
    if (text.startsWith('SELECT * FROM orqaly.solution_revisions')) {
      const matching =
        p.length === 4
          ? revisions.filter((r) => r.id === p[3])
          : text.includes("status IN ('draft','reviewed')")
            ? revisions.filter((r) => ['draft', 'reviewed'].includes(r.status))
            : revisions;
      return { rows: matching.map(clone) };
    }
    if (text.startsWith('SELECT input,output,evidence'))
      return {
        rows: invocations
          .filter(
            (r) =>
              r.workflow_hash === p[3] &&
              (r.revision_id ?? null) === p[4] &&
              r.status === 'succeeded'
          )
          .map(clone),
      };
    if (text.startsWith('SELECT * FROM orqaly.solution_invocations'))
      return {
        rows: invocations
          .filter((r) => !text.includes('idempotency_key=$3') || r.idempotency_key === p[2])
          .map(clone),
      };
    if (text.startsWith('INSERT INTO orqaly.solution_revisions')) {
      const revision = {
        tenant_id: p[0],
        solution_id: p[1],
        id: p[2],
        owner_user_id: p[3],
        version: p[4],
        base_revision_id: p[5],
        base_version: p[6],
        base_workflow: clone(p[7]),
        base_spec: clone(p[8]),
        workflow: clone(p[7]),
        workflow_hash: p[9],
        spec: clone(p[8]),
        status: 'draft',
        row_version: 0,
      };
      revisions.push(revision);
      return { rows: [clone(revision)] };
    }
    if (text.startsWith('INSERT INTO orqaly.solution_revision_events')) {
      events.push({ kind: p[5], details: p[7] });
      return { rows: [] };
    }
    if (text.startsWith('INSERT INTO orqaly.solution_invocations')) {
      const revision = text.includes("VALUES ($1,$2,$3,$4,'test'");
      const offset = revision ? 0 : 1;
      const receipt = {
        tenant_id: p[0],
        solution_id: p[1],
        id: p[2],
        owner_user_id: p[3],
        mode: revision ? 'test' : p[4],
        idempotency_key: p[4 + offset],
        request_hash: p[5 + offset],
        workflow_hash: p[6 + offset],
        input: clone(p[7 + offset]),
        revision_id: p[8 + offset],
        evidence: clone(p[9 + offset] ?? null),
        status: 'running',
      };
      invocations.push(receipt);
      return { rows: [clone(receipt)] };
    }
    if (text.startsWith('UPDATE orqaly.solution_invocations'))
      return update(
        text,
        p,
        invocations.find((r) => r.id === p[2])
      );
    if (text.startsWith('UPDATE orqaly.solution_revisions'))
      return update(
        text,
        p,
        revisions.find((r) => r.id === (text.includes('owner_user_id=$2') ? p[3] : p[2]))
      );
    if (text.startsWith('UPDATE orqaly.customer_solutions')) return update(text, p, value);
    throw new Error(`Unexpected lifecycle test query: ${text.slice(0, 80)}`);
  });
  const runtime = {
    describe: (environmentId) => ({ id: environmentId }),
    available: () => true,
    nativePolicy: () => REQUEST_AUTOMATION_POLICY,
    deploy: vi.fn(async (_scope, solution) => ({
      workflowId: `wf_${solution.id}`,
      versionId: 'provider-version',
      workflowHash: solution.workflow_hash,
      active: false,
    })),
    activate: vi.fn(async (_scope, solution) => ({
      ...solution.deployment,
      workflowHash: solution.workflow_hash,
      active: true,
    })),
    pause: vi.fn(async (_scope, solution) => ({
      ...solution.deployment,
      workflowHash: solution.workflow_hash,
      active: false,
    })),
    testNative: vi.fn(async (_scope, test) => ({
      status: 'succeeded',
      output: { count: test.input.values.length },
      executionId: `${invocations.length}`,
      responseStatus: 200,
      testArtifactHash: hash(test.workflow),
      cleanup: { status: 'removed' },
    })),
    invoke: vi.fn(async (_scope, _solution, invocation) => ({
      status: 'succeeded',
      output: { count: invocation.input.values.length },
      executionId: `${invocations.length}`,
      responseStatus: 200,
    })),
  };
  const repository = {
    resolveTenant: async () => tenantId,
    solutionTransaction: (_tenant, fn) => fn({ query }),
    solutionBuildTransaction: (_scope, fn) => fn({ query }),
  };
  return {
    value,
    runtime,
    query,
    invocations,
    revisions,
    events,
    service: createSolutionService({ repository, runtime }),
    revisionService: createSolutionRevisionService({ repository, runtime }),
  };
}

const decide = (f, action) =>
  f.service.decide(
    auth,
    id,
    { action, workflowHash: f.value.workflow_hash, environmentId: f.value.environment_id },
    f.value.row_version
  );

describe('native Solution lifecycle', () => {
  it('does not persist an unverified staged artifact as the immutable deployment', async () => {
    const f = fixture();
    f.runtime.deploy.mockResolvedValueOnce({
      workflowId: 'wrong',
      versionId: 'wrong',
      workflowHash: '0'.repeat(64),
      active: true,
    });
    await decide(f, 'deploy');
    expect(f.value.status).toBe('deployment_unknown');
    expect(f.value.deployment).toBeNull();
  });

  it('rejects returned test-artifact mismatches and pending cleanup as acceptance evidence', async () => {
    for (const condition of ['wrong-artifact', 'cleanup-pending']) {
      const f = fixture();
      await decide(f, 'deploy');
      f.runtime.testNative.mockImplementationOnce(async (_scope, test) => ({
        status: 'succeeded',
        output: { count: 0 },
        executionId: '1',
        responseStatus: 200,
        testArtifactHash: condition === 'wrong-artifact' ? '0'.repeat(64) : hash(test.workflow),
        cleanup: { status: condition === 'cleanup-pending' ? 'pending' : 'removed' },
      }));
      const result = await f.service.invoke(
        auth,
        id,
        { mode: 'test', input: { values: [] } },
        `bound_${condition.replace('-', '_')}`
      );
      expect(result.invocation.status).toBe(
        condition === 'wrong-artifact' ? 'outcome_unknown' : 'failed'
      );
      expect(f.value.tested_at).toBeNull();
    }
  });

  it('does not persist secret-like outputs or raw provider diagnostics', async () => {
    const f = fixture();
    const invocation = {
      id,
      mode: 'test',
      input: { values: [] },
      evidence: nativeSolutionTestPlan(f.value),
    };
    f.runtime.testNative.mockImplementationOnce(async (_scope, test) => ({
      status: 'failed',
      output: { api_key: 'sk_live_this_is_not_a_real_key' },
      executionId: '1',
      responseStatus: 500,
      testArtifactHash: hash(test.workflow),
      cleanup: { status: 'removed', rawResponse: 'private raw data' },
      diagnostics: [
        { code: 'NODE_FAILURE', message: 'private provider log', rawData: { secret: 'hidden' } },
      ],
      testConfiguration: { private: 'not permitted' },
    }));
    const result = await executeSolutionInvocation(f.runtime, scope, f.value, invocation);
    expect(result.status).toBe('failed');
    expect(result.output).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/private|hidden|sk_live/);
    expect(result.evidence.cleanup).toEqual({ status: 'removed' });
  });

  it('blocks new dispatch during runtime activation and reconciles an interrupted pause explicitly', async () => {
    const f = fixture();
    await decide(f, 'deploy');
    f.value.tested_at = new Date().toISOString();
    f.runtime.activate.mockImplementationOnce(async (_scope, solution) => {
      await expect(
        f.service.invoke(auth, id, { mode: 'test', input: { values: [] } }, 'during_activation')
      ).rejects.toMatchObject({ code: 'SOLUTION_LIFECYCLE_UNVERIFIED' });
      return { ...solution.deployment, active: true };
    });
    await decide(f, 'activate');
    expect(f.value.status).toBe('active');
    f.runtime.pause.mockRejectedValueOnce(new Error('response lost'));
    await decide(f, 'pause');
    await expect(decide(f, 'activate')).rejects.toMatchObject({
      code: 'SOLUTION_PAUSE_UNVERIFIED',
    });
    await decide(f, 'pause');
    expect(f.value.last_error).toBeNull();
    f.value.last_error = 'PAUSE_PENDING_VERIFICATION';
    f.value.updated_at = new Date(Date.now() - 241_000).toISOString();
    await decide(f, 'pause');
    expect(f.value.last_error).toBeNull();
    expect(f.runtime.testNative).not.toHaveBeenCalled();
  });

  it('stages inactive, requires all agreed cases, publishes, invokes and unpublishes without mutating frozen deployment', async () => {
    const f = fixture();
    await decide(f, 'deploy');
    const original = structuredClone(f.value.deployment);
    expect(f.value.status).toBe('ready');
    expect(f.runtime.activate).not.toHaveBeenCalled();
    await f.service.invoke(
      auth,
      id,
      { mode: 'test', input: { values: [1, 2] } },
      'native_test_two'
    );
    expect(f.value.tested_at).toBeNull();
    await expect(decide(f, 'activate')).rejects.toMatchObject({ code: 'SOLUTION_TEST_REQUIRED' });
    await f.service.invoke(auth, id, { mode: 'test', input: { values: [] } }, 'native_test_empty');
    expect(f.value.tested_at).toBeTruthy();
    await decide(f, 'activate');
    expect(f.value.status).toBe('active');
    expect(f.value.deployment).toEqual(original);
    const result = await f.service.invoke(
      auth,
      id,
      { mode: 'production', input: { values: [1, 2, 3] } },
      'native_production'
    );
    expect(result.invocation.output).toEqual({ count: 3 });
    f.runtime.pause.mockImplementationOnce(async (_scope, solution) => {
      expect(f.value.status).toBe('paused');
      await expect(
        f.service.invoke(
          auth,
          id,
          { mode: 'production', input: { values: [1] } },
          'paused_no_effect'
        )
      ).rejects.toMatchObject({ code: 'SOLUTION_NOT_ACTIVE' });
      return { ...solution.deployment, active: false };
    });
    await decide(f, 'pause');
    expect(f.value.status).toBe('paused');
    expect(f.value.last_error).toBeNull();
    expect(f.value.deployment).toEqual(original);
    expect(f.runtime.invoke).toHaveBeenCalledTimes(1);
  });

  it('known failure and missing receipt never count as a passed test', async () => {
    for (const status of ['failed', 'outcome_unknown']) {
      const f = fixture();
      await decide(f, 'deploy');
      f.runtime.testNative.mockImplementationOnce(async (_scope, test) => ({
        status,
        testArtifactHash: hash(test.workflow),
        cleanup: { status: 'removed' },
        diagnostics: [{ code: 'N8N_NODE_FAILED' }],
        executionId: status === 'failed' ? '1' : null,
      }));
      const response = await f.service.invoke(
        auth,
        id,
        { mode: 'test', input: { values: [] } },
        `test_${status}`
      );
      expect(response.invocation.status).toBe(status);
      expect(f.value.tested_at).toBeNull();
    }
  });

  it('a schema-conforming but wrong expected result is a definite failed acceptance test', async () => {
    const f = fixture();
    await decide(f, 'deploy');
    f.runtime.testNative.mockImplementationOnce(async (_scope, test) => ({
      status: 'succeeded',
      testArtifactHash: hash(test.workflow),
      cleanup: { status: 'removed' },
      output: { count: 999 },
      executionId: '1',
      responseStatus: 200,
    }));
    const response = await f.service.invoke(
      auth,
      id,
      { mode: 'test', input: { values: [] } },
      'wrong_count_case'
    );
    expect(response.invocation.status).toBe('failed');
    expect(response.invocation.executionId).toBe('1');
    expect(f.value.tested_at).toBeNull();
  });

  it('requires an exact known test case and keeps V1 nested input forbidden', async () => {
    const f = fixture();
    await decide(f, 'deploy');
    await expect(
      f.service.invoke(auth, id, { mode: 'test', input: { values: [1] } }, 'unagreed_sample')
    ).rejects.toMatchObject({ status: 400 });
    expect(f.runtime.testNative).not.toHaveBeenCalled();
    expect(() =>
      validateSolutionInvocationInput(
        {
          spec: {
            kind: 'webhook_transform_v1',
            fields: [{ source: 'values', target: 'values', transform: 'copy' }],
          },
        },
        { values: [1] }
      )
    ).toThrow();
  });

  it('ambiguous activation stays admission-closed and preserves immutable deployment', async () => {
    const f = fixture();
    await decide(f, 'deploy');
    f.value.tested_at = new Date().toISOString();
    const original = structuredClone(f.value.deployment);
    f.runtime.activate.mockRejectedValueOnce(new Error('uncertain provider response'));
    await decide(f, 'activate');
    expect(f.value.status).toBe('paused');
    expect(f.value.last_error).toBe('RUNTIME_ACTIVATION_REQUIRES_VERIFICATION');
    expect(f.value.deployment).toEqual(original);
  });

  it('native revision edits keep frozen criteria, stage/test independently and atomically promote after actual pause/publish', async () => {
    const f = fixture();
    await decide(f, 'deploy');
    f.value.status = 'active';
    f.value.tested_at = new Date().toISOString();
    const original = structuredClone(f.value.workflow);
    const opened = await f.revisionService.createDraft(auth, id, {
      expectedVersion: f.value.row_version,
    });
    const revisionId = opened.revision.id;
    const revision = f.revisions[0];
    const changed = structuredClone(revision.workflow);
    changed.nodes[1].position = [300, 10];
    await f.revisionService.saveDraft(auth, id, revisionId, {
      workflow: changed,
      expectedVersion: revision.row_version,
    });
    expect(revision.spec).toEqual(spec());
    await f.revisionService.review(auth, id, revisionId, { expectedVersion: revision.row_version });
    expect(revision.status).toBe('reviewed');
    const decision = (action) =>
      f.revisionService.decide(auth, id, revisionId, {
        action,
        workflowHash: revision.workflow_hash,
        expectedVersion: revision.row_version,
      });
    await decision('approve');
    await decision('deploy');
    const staged = structuredClone(revision.deployment);
    await f.revisionService.invoke(
      auth,
      id,
      revisionId,
      { input: { values: [1, 2] } },
      'revision_test_two'
    );
    expect(revision.tested_at).toBeUndefined();
    await f.revisionService.invoke(
      auth,
      id,
      revisionId,
      { input: { values: [] } },
      'revision_test_empty'
    );
    expect(revision.tested_at).toBeTruthy();
    f.value.last_error = 'ACTIVATION_PENDING_VERIFICATION';
    await expect(decision('activate')).rejects.toMatchObject({ code: 'SOLUTION_LIFECYCLE_BUSY' });
    expect(f.runtime.pause).not.toHaveBeenCalled();
    f.value.last_error = null;
    await decision('activate');
    expect(f.runtime.pause).toHaveBeenCalledTimes(1);
    expect(f.runtime.activate).toHaveBeenCalledTimes(1);
    expect(f.value.active_revision_id).toBe(revisionId);
    expect(revision.status).toBe('active');
    expect(revision.deployment).toEqual(staged);
    expect(f.value.workflow).toEqual(original);
    expect(f.events.at(-1)).toMatchObject({
      kind: 'activated',
      details: { runtimeReceipt: { active: true } },
    });
  });

  it('checks the durable temporary test-artifact hash before touching the runtime', async () => {
    const f = fixture();
    const invocation = {
      id,
      mode: 'test',
      input: { values: [] },
      evidence: { ...nativeSolutionTestPlan(f.value), testArtifactHash: '0'.repeat(64) },
    };
    expect((await executeSolutionInvocation(f.runtime, scope, f.value, invocation)).status).toBe(
      'outcome_unknown'
    );
    expect(f.runtime.testNative).not.toHaveBeenCalled();
  });
});
