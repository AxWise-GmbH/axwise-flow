import { describe, expect, it, vi } from 'vitest';
import { compileSolutionWorkflow } from './solution-compiler.js';
import {
  createSolutionRevisionService,
  rebaseWorkflowForDraft,
  revisionForkEligibility,
} from './solution-revision-service.js';
import { reviewSolutionWorkflow } from './solution-workflow-review.js';
import { canonicalJsonSha256 } from '../../services/agentic-control-plane/src/domain/canonical.js';

const id = 'a9ae8baa-3bc2-4dc1-a151-f0449ee28dc7';
const draftId = '766a03f3-6444-4432-9ff6-d8ce9dd5a314';
const spec = {
  kind: 'webhook_transform_v1',
  fields: [{ source: 'name', target: 'name', transform: 'trim' }],
};

describe('solution revision boundary', () => {
  it('reserves an independent webhook without changing the source release or its semantics', () => {
    const { workflow } = compileSolutionWorkflow({ id, spec });
    const original = structuredClone(workflow);
    const draft = rebaseWorkflowForDraft(workflow, draftId);
    expect(workflow).toEqual(original);
    expect(draft.nodes.find((node) => node.id === 'receive').parameters.path).toBe(
      `solution-${draftId}`
    );
    expect(draft.nodes.find((node) => node.id === 'receive').webhookId).toBe(draftId);
    const review = reviewSolutionWorkflow({
      solutionId: draftId,
      baseWorkflow: draft,
      baseSpec: spec,
      workflow: draft,
    });
    expect(review.valid).toBe(true);
    expect(review.spec).toEqual(spec);
    expect(review.changes).toEqual([]);
  });
  it('rejects missing authentication before tenant resolution or provider access', async () => {
    const repository = { resolveTenant: vi.fn(), solutionTransaction: vi.fn() };
    const runtime = { deploy: vi.fn() };
    const service = createSolutionRevisionService({ repository, runtime });
    await expect(service.read({}, id)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    });
    expect(repository.resolveTenant).not.toHaveBeenCalled();
    expect(repository.solutionTransaction).not.toHaveBeenCalled();
    expect(runtime.deploy).not.toHaveBeenCalled();
  });
  it('fails owner-scoped lookup before reading any revision or contacting the provider', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = {
      resolveTenant: vi.fn().mockResolvedValue(id),
      solutionTransaction: (_tenant, fn) => fn({ query }),
    };
    const runtime = { deploy: vi.fn() };
    const service = createSolutionRevisionService({ repository, runtime });
    await expect(service.read({ userId: 'user_other' }, id)).rejects.toMatchObject({
      code: 'SOLUTION_NOT_FOUND',
      status: 404,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([id, 'user_other', id]);
    expect(runtime.deploy).not.toHaveBeenCalled();
  });
});

function forkFixture({ sourceStatus = 'ready', unresolved = false, existingDraft = false } = {}) {
  const tenantId = '66d7837a-2b06-4248-ae1a-8c5f3c0022b2';
  const userId = 'user_forkowner';
  const base = compileSolutionWorkflow({ id, spec });
  const sourceWorkflow = rebaseWorkflowForDraft(base.workflow, draftId);
  sourceWorkflow.nodes.find((node) => node.id === 'transform').parameters.jsonOutput =
    '={{ { "name": $json.body.name.toUpperCase() } }}';
  const parent = {
    tenant_id: tenantId,
    owner_user_id: userId,
    id,
    workflow: base.workflow,
    workflow_hash: base.workflowHash,
    spec,
    version: 1,
    row_version: 7,
    active_revision_id: null,
    deployment: { workflowId: 'original', versionId: 'original-version' },
  };
  const source = {
    tenant_id: tenantId,
    owner_user_id: userId,
    solution_id: id,
    id: draftId,
    version: 2,
    base_version: 1,
    base_revision_id: null,
    base_workflow: sourceWorkflow,
    base_spec: spec,
    workflow: sourceWorkflow,
    workflow_hash: canonicalJsonSha256(sourceWorkflow),
    spec,
    status: sourceStatus,
    row_version: 9,
    approved_at: '2026-09-07T08:00:00Z',
    tested_at: '2026-09-07T08:01:00Z',
    review: { valid: true },
    deployment: { workflowId: 'candidate', versionId: 'candidate-version' },
  };
  const invocation = {
    id: '3c3ff864-1f96-4f32-a9aa-f2c40b928dbf',
    tenant_id: tenantId,
    owner_user_id: userId,
    solution_id: id,
    revision_id: draftId,
    workflow_hash: source.workflow_hash,
    mode: 'test',
    status: unresolved ? 'outcome_unknown' : 'failed',
    input: { name: 'Ada' },
    output: { name: 'ADA' },
    execution_id: '17',
    created_at: '2026-09-07T08:01:00Z',
    evidence: { cleanup: { status: 'removed' } },
  };
  const snapshots = structuredClone({ parent, source, invocation });
  const revisions = [source],
    ledger = [],
    events = [];
  const query = vi.fn(async (sql, values) => {
    if (sql.includes('SELECT * FROM orqaly.customer_solutions')) return { rows: [parent] };
    if (sql.includes('SELECT * FROM orqaly.solution_revision_forks'))
      return { rows: ledger.filter((item) => item.idempotency_key === values[3]) };
    if (sql.includes('SELECT * FROM orqaly.solution_revisions') && sql.includes('ORDER BY'))
      return { rows: [...revisions].reverse() };
    if (sql.includes('SELECT * FROM orqaly.solution_revisions'))
      return { rows: revisions.filter((item) => item.id === values[3]) };
    if (sql.includes('SELECT revision_id,status FROM orqaly.solution_invocations'))
      return { rows: unresolved ? [invocation] : [] };
    if (sql.includes('SELECT * FROM orqaly.solution_invocations')) return { rows: [invocation] };
    if (sql.includes('SELECT id FROM orqaly.solution_revisions'))
      return { rows: existingDraft ? [{ id: 'a0d2cb20-d293-4467-9c50-aed808e73467' }] : [] };
    if (sql.includes('COALESCE(MAX(version)')) return { rows: [{ version: 3 }] };
    if (sql.includes('INSERT INTO orqaly.solution_revisions')) {
      const item = {
        tenant_id: values[0],
        solution_id: values[1],
        id: values[2],
        owner_user_id: values[3],
        version: values[4],
        base_revision_id: values[5],
        base_version: values[6],
        base_workflow: values[7],
        base_spec: values[8],
        workflow: values[9],
        workflow_hash: values[10],
        spec: values[11],
        status: 'draft',
        row_version: 0,
        review: null,
        approved_at: null,
        tested_at: null,
        deployment: null,
      };
      revisions.push(item);
      return { rows: [item] };
    }
    if (sql.includes('INSERT INTO orqaly.solution_revision_forks')) {
      ledger.push({
        idempotency_key: values[3],
        request_hash: values[4],
        source_revision_id: values[5],
        source_row_version: values[6],
        source_workflow_hash: values[7],
        target_revision_id: values[8],
      });
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO orqaly.solution_revision_events')) {
      events.push(values);
      return { rows: [] };
    }
    throw new Error(`Unexpected fixture query: ${sql}`);
  });
  const runtime = { deploy: vi.fn(), invoke: vi.fn(), activate: vi.fn() };
  const repository = {
    resolveTenant: vi.fn(async () => tenantId),
    solutionBuildTransaction: vi.fn(async (scope, callback) => {
      expect(scope).toEqual({ tenantId, userId });
      return callback({ query });
    }),
  };
  return {
    service: createSolutionRevisionService({ repository, runtime }),
    auth: { userId },
    query,
    parent,
    source,
    invocation,
    snapshots,
    revisions,
    ledger,
    events,
    runtime,
    command: { expectedVersion: source.row_version, workflowHash: source.workflow_hash },
  };
}

describe('exact frozen candidate fork and persisted receipts', () => {
  it('copies the selected failed candidate, changes only transport identity, and resets all authority', async () => {
    const f = forkFixture();
    const result = await f.service.forkRevision(f.auth, id, draftId, f.command, 'fork-candidate-1');
    const draft = result.revision;
    expect(draft.id).not.toBe(draftId);
    expect(draft.version).toBe(3);
    expect(draft.status).toBe('draft');
    expect(draft.rowVersion).toBe(0);
    expect(draft.approvedAt).toBeNull();
    expect(draft.testedAt).toBeNull();
    expect(draft.deployment).toBeNull();
    expect(draft.review).toBeNull();
    expect(draft.workflow).toEqual(rebaseWorkflowForDraft(f.source.workflow, draft.id));
    expect(
      draft.workflow.nodes.find((node) => node.id === 'transform').parameters.jsonOutput
    ).toContain('toUpperCase');
    expect(result.invocations).toMatchObject([
      {
        revisionId: draftId,
        workflowHash: f.source.workflow_hash,
        executionId: '17',
        status: 'failed',
      },
    ]);
    expect(result.invocations.some((receipt) => receipt.revisionId === draft.id)).toBe(false);
    expect({ parent: f.parent, source: f.source, invocation: f.invocation }).toEqual(f.snapshots);
    expect(f.runtime.deploy).not.toHaveBeenCalled();
    expect(f.runtime.invoke).not.toHaveBeenCalled();
  });
  it('replays the same durable fork after a lost response without duplicating or resetting the new draft', async () => {
    const f = forkFixture();
    const first = await f.service.forkRevision(f.auth, id, draftId, f.command, 'fork-candidate-1');
    f.revisions.at(-1).row_version = 3;
    const second = await f.service.forkRevision(f.auth, id, draftId, f.command, 'fork-candidate-1');
    expect(second.revision.id).toBe(first.revision.id);
    expect(second.revision.rowVersion).toBe(3);
    expect(f.ledger).toHaveLength(1);
    expect(f.revisions).toHaveLength(2);
    await expect(
      f.service.forkRevision(
        f.auth,
        id,
        draftId,
        { ...f.command, expectedVersion: 10 },
        'fork-candidate-1'
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it.each(['hash', 'version'])('rejects stale %s before creating a draft', async (field) => {
    const f = forkFixture();
    await expect(
      f.service.forkRevision(
        f.auth,
        id,
        draftId,
        {
          ...f.command,
          ...(field === 'hash' ? { workflowHash: 'f'.repeat(64) } : { expectedVersion: 8 }),
        },
        'fork-candidate-1'
      )
    ).rejects.toMatchObject({ code: 'SOLUTION_REVISION_CHANGED' });
    expect(f.ledger).toHaveLength(0);
    expect(f.revisions).toHaveLength(1);
  });
  it('never overwrites an existing editable draft', async () => {
    const f = forkFixture({ existingDraft: true });
    await expect(
      f.service.forkRevision(f.auth, id, draftId, f.command, 'fork-candidate-1')
    ).rejects.toMatchObject({ code: 'SOLUTION_EDITABLE_DRAFT_EXISTS' });
    expect(f.ledger).toHaveLength(0);
  });
  it.each(['active', 'deploying', 'deployment_unknown', 'draft'])(
    'blocks %s sources',
    async (sourceStatus) => {
      const f = forkFixture({ sourceStatus });
      await expect(
        f.service.forkRevision(f.auth, id, draftId, f.command, 'fork-candidate-1')
      ).rejects.toMatchObject({ code: 'SOLUTION_REVISION_FORK_BLOCKED' });
    }
  );
  it('retains the unresolved effect barrier even for an old candidate receipt', async () => {
    const f = forkFixture({ unresolved: true });
    expect(revisionForkEligibility(f.source, [f.invocation]).allowed).toBe(false);
    await expect(
      f.service.forkRevision(f.auth, id, draftId, f.command, 'fork-candidate-1')
    ).rejects.toMatchObject({ code: 'SOLUTION_REVISION_FORK_BLOCKED' });
    expect(f.ledger).toHaveLength(0);
  });
});
