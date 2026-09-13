// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import { nativeOutboundFixture } from '../../scripts/fixtures/native-outbound-workflow.mjs';
import { createSolutionConversationService } from './solution-conversation-service.js';
import { normalizeNativeBundle } from './native-workflow-bundle.js';
import { bindNativeConnections, describeNativeConnection } from './native-workflow-connections.js';
import { createBoundedHttpPolicy } from './native-workflow-review.js';

function fixture({
  missing = false,
  suspended = false,
  changed = false,
  unsupported = false,
} = {}) {
  const tenantId = randomUUID(),
    solutionId = randomUUID(),
    revisionId = randomUUID(),
    buildId = randomUUID(),
    runId = randomUUID(),
    userId = 'user_setuptest';
  const artifact = nativeOutboundFixture();
  const root = normalizeNativeBundle({ ...artifact, id: solutionId });
  const source = {
    id: solutionId,
    tenant_id: tenantId,
    owner_user_id: userId,
    build_request_id: buildId,
    environment_id: 'scoped-environment',
    workflow: root.workflow,
    workflow_hash: root.workflowHash,
    spec: root.spec,
    row_version: 3,
    active_revision_id: null,
    status: 'active',
    deployment: { workflowId: 'existing-root' },
    name: 'Alert workflow',
  };
  const record = {
    id: randomUUID(),
    revision_id: revisionId,
    member_id: '',
    requirement_id: 'receiver',
    member_requirement_id: 'receiver',
    environment_id: source.environment_id,
    credential_type: 'orqalyBoundedHttp',
    provider_credential_id: 'opaque-owned-test-selector',
    status: 'saved',
    scope: describeNativeConnection({
      requirement: artifact.spec.connections[0],
      workflow: artifact.workflow,
      environmentId: source.environment_id,
    }).scope,
  };
  const bound = normalizeNativeBundle({
    workflow: bindNativeConnections(
      artifact.workflow,
      artifact.spec,
      [record],
      source.environment_id
    ),
    spec: artifact.spec,
    id: revisionId,
  });
  const revision = {
    id: revisionId,
    solution_id: solutionId,
    tenant_id: tenantId,
    owner_user_id: userId,
    row_version: 1,
    status: 'draft',
    workflow: bound.workflow,
    workflow_hash: bound.workflowHash,
    spec: bound.spec,
  };
  if (changed) {
    revision.workflow.nodes[1].parameters.url = 'https://another.example.org/alerts';
    revision.workflow_hash = hash(revision.workflow);
  }
  const previous = {
    id: randomUUID(),
    solution_id: solutionId,
    status: 'completed',
    mode: 'change',
    message: 'Send an alert to the chosen receiver.',
    request_key: 'previous_change',
    command: { workflowHash: root.workflowHash },
    reply: { phase: 'needs_setup', setupRef: { revisionId } },
    result: { response: artifact },
    context_snapshot: { continuationCount: 0 },
    created_at: new Date().toISOString(),
  };
  const agent = {
    id: randomUUID(),
    name: 'Alert agent',
    profileVersion: 1,
    roleLabel: 'Workflow designer',
    description: 'Task-scoped designer',
    instructions: 'Prepare a draft only.',
    profileHash: 'a'.repeat(64),
  };
  const sourceBuild = {
    source_snapshot: {
      runId,
      taskHash: 'b'.repeat(64),
      title: 'Alert receiver',
      taskText: previous.message,
      contextHash: 'c'.repeat(64),
    },
    agent_snapshot: agent,
    run_id: runId,
  };
  const turns = [previous];
  const query = vi.fn(async (sql, values) => {
    if (sql.includes('SELECT * FROM orqaly.customer_solutions')) return { rows: [source] };
    if (sql.includes('FROM orqaly.solution_connections')) return { rows: [] };
    if (sql.includes('SELECT * FROM orqaly.solution_revisions')) return { rows: [revision] };
    if (sql.includes('SELECT * FROM orqaly.solution_revision_connections'))
      return { rows: missing ? [] : [record] };
    if (sql.includes('SELECT status FROM orqaly.tenants'))
      return { rows: [{ status: suspended ? 'suspended' : 'active' }] };
    if (sql.includes('FROM orqaly.solution_build_requests')) return { rows: [sourceBuild] };
    if (sql.includes('FROM orqaly.solution_invocations')) return { rows: [] };
    if (sql.includes('SELECT * FROM orqaly.solution_conversation_turns')) {
      if (sql.includes('(id=$4 OR request_key=$5)'))
        return {
          rows: turns.filter((turn) => turn.id === values[3] || turn.request_key === values[4]),
        };
      if (sql.includes('AND id=$4')) return { rows: turns.filter((turn) => turn.id === values[3]) };
      return { rows: [...turns].reverse() };
    }
    if (sql.includes('INSERT INTO orqaly.solution_conversation_turns')) {
      turns.push({
        id: values[2],
        mode: values[4],
        message: values[5],
        request_key: values[6],
        request_hash: values[7],
        command: values[8],
        context_snapshot: values[9],
        context_hash: values[10],
        operation_id: values[11],
        envelope: values[12],
        target_revision_id: values[13],
        status: 'queued',
        created_at: new Date().toISOString(),
      });
      return { rows: [] };
    }
    throw new Error(`Unexpected synthetic query: ${sql}`);
  });
  const runtime = {
    nativePolicy: vi.fn(() =>
      unsupported ? null : createBoundedHttpPolicy({ imageDigest: `sha256:${'d'.repeat(64)}` })
    ),
    createNativeCredential: vi.fn(),
    reconcileNativeCredential: vi.fn(),
    invoke: vi.fn(),
  };
  const model = { submit: vi.fn(), poll: vi.fn() };
  const repository = {
    revisionConnectionsEnabled: true,
    resolveTenant: vi.fn(async () => tenantId),
    solutionBuildTransaction: async (_scope, fn) => fn({ query }),
    claimSolutionConversationTurnV2: vi.fn(),
  };
  const service = createSolutionConversationService({
    repository,
    runtime,
    axwiseClient: model,
    enabled: true,
  });
  const command = {
    turnId: randomUUID(),
    mode: 'auto',
    message: 'The secure connection is saved. Continue this draft.',
    expectedSolutionVersion: source.row_version,
    workflowHash: source.workflow_hash,
    draft: {
      id: revisionId,
      rowVersion: revision.row_version,
      workflowHash: revision.workflow_hash,
    },
    continuation: { turnId: previous.id, kind: 'resume_setup' },
  };
  return {
    turns,
    command,
    model,
    runtime,
    source,
    revision,
    service,
    send: () => service.send({ userId }, solutionId, command, 'resume_scoped_setup'),
  };
}
describe('explicit conversation setup continuation', () => {
  it('queues a new scoped design operation only after real saved metadata matches the exact unchanged proposal', async () => {
    const f = fixture();
    const original = hash(f.source);
    const result = await f.send();
    expect(result.replayed).toBe(false);
    expect(f.turns).toHaveLength(2);
    const queued = f.turns[1];
    expect(queued.status).toBe('queued');
    expect(queued.target_revision_id).toBe(f.revision.id);
    expect(queued.envelope.operationType).toBe('PrepareSolutionV2');
    expect(JSON.stringify(queued.envelope)).not.toContain('opaque-owned-test-selector');
    expect(
      queued.context_snapshot.authoritativeWorkflow.nodes[1].credentials.orqalyBoundedHttp.id
    ).toBe('opaque-owned-test-selector');
    expect(hash(f.source)).toBe(original);
    expect(f.model.submit).not.toHaveBeenCalled();
    expect(f.runtime.createNativeCredential).not.toHaveBeenCalled();
    expect(f.runtime.invoke).not.toHaveBeenCalled();
    expect((await f.send()).replayed).toBe(true);
    expect(f.turns).toHaveLength(2);
  });
  it.each(['missing', 'suspended', 'changed', 'unsupported'])(
    'does not resume when %s invalidates the exact setup',
    async (kind) => {
      const f = fixture({ [kind]: true });
      await expect(f.send()).rejects.toBeDefined();
      expect(f.turns).toHaveLength(1);
      expect(f.model.submit).not.toHaveBeenCalled();
      expect(f.runtime.createNativeCredential).not.toHaveBeenCalled();
      expect(f.runtime.invoke).not.toHaveBeenCalled();
    }
  );
});
