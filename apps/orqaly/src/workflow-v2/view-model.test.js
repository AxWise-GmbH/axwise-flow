import { describe, expect, it } from 'vitest';
import {
  activeApproval,
  approvalIdempotencyKey,
  artifactRefs,
  goalWorkflowViewRefreshKey,
  normalizedRunItems,
  runProgress,
  stageDisplayName,
} from './view-model.js';

describe('workflow v2 view model', () => {
  it('binds the displayed approval to the exact producer artifact', () => {
    const artifact = { artifactId: 'a', artifactHash: 'h', kind: 'scope' };
    const workflow = {
      stages: [
        { id: 'compile', kind: 'compile_scope', inputHash: 'input', outputArtifact: artifact },
        { id: 'gate', kind: 'gate_1', status: 'awaiting_approval' },
      ],
    };
    expect(activeApproval(workflow)).toEqual({
      kind: 'scope',
      gate: workflow.stages[1],
      producer: workflow.stages[0],
      artifact,
    });
  });

  it('scopes approval idempotency to the run and immutable artifact', () => {
    expect(
      approvalIdempotencyKey(
        { run: { id: 'run-a' } },
        { kind: 'scope', artifact: { artifactHash: 'a'.repeat(64) } }
      )
    ).toBe(`run-a:scope:${'a'.repeat(64)}`);
  });

  it('deduplicates immutable refs and reveals execution artifacts only in Advanced', () => {
    const shared = { artifactId: 'scope', artifactHash: 'a'.repeat(64), kind: 'scope' };
    const task = { artifactId: 'task', artifactHash: 'b'.repeat(64), kind: 'task_result' };
    const workflow = {
      stages: [
        { kind: 'compile_scope', outputArtifact: shared },
        { kind: 'compile_scope', outputArtifact: shared },
        { kind: 'execution', outputArtifact: task },
      ],
    };

    expect(artifactRefs(workflow)).toEqual([shared]);
    expect(artifactRefs(workflow, { includeExecution: true })).toEqual([shared, task]);
  });

  it('normalizes list summaries and full snapshots for one run library', () => {
    expect(
      normalizedRunItems({
        workflows: [{ id: 'summary-run' }, { run: { id: 'snapshot-run' }, stages: [] }],
      })
    ).toEqual([{ run: { id: 'summary-run' } }, { run: { id: 'snapshot-run' }, stages: [] }]);
  });

  it('counts cancelled stages as settled and names execution stages compactly', () => {
    expect(
      runProgress({
        stages: [{ status: 'completed' }, { status: 'cancelled' }, { status: 'ready' }],
      })
    ).toEqual({ completed: 2, total: 3 });
    expect(stageDisplayName({ kind: 'execution', stageKey: 'execution_product-prd' })).toBe(
      'Product prd'
    );
  });

  it('reports every stage settled when direct promotion cancels unused synthesis', () => {
    expect(
      runProgress({
        stages: [
          ...Array.from({ length: 7 }, () => ({ status: 'completed' })),
          { status: 'cancelled' },
        ],
      })
    ).toEqual({ completed: 8, total: 8 });
  });
});

describe('selected Goal metadata refresh key', () => {
  const snapshot = () => ({
    run: { id: 'run-a', rowVersion: 9, status: 'running', finalArtifact: null },
    stages: [
      {
        id: 'stage-a',
        ordinal: 0,
        kind: 'execution',
        stageKey: 'execution_draft',
        rowVersion: 4,
        status: 'running',
        inputHash: 'a'.repeat(64),
        outputArtifact: null,
      },
    ],
  });

  it('keeps identical selected snapshots stable across new object identities', () => {
    const value = snapshot();
    expect(goalWorkflowViewRefreshKey(structuredClone(value))).toBe(
      goalWorkflowViewRefreshKey(value)
    );
    expect(goalWorkflowViewRefreshKey(null)).toBe('');
  });

  it.each(['rowVersion', 'status', 'inputHash', 'outputArtifact', 'added stage'])(
    'detects changed stage %s without a changed run version',
    (field) => {
      const original = snapshot(),
        changed = structuredClone(original);
      if (field === 'added stage') changed.stages.push({ ...changed.stages[0], id: 'stage-b' });
      else
        changed.stages[0][field] =
          field === 'rowVersion'
            ? 5
            : field === 'outputArtifact'
              ? { artifactId: 'output-a', artifactHash: 'b'.repeat(64), kind: 'task_result' }
              : field === 'status'
                ? 'completed'
                : 'c'.repeat(64);
      expect(changed.run.rowVersion).toBe(original.run.rowVersion);
      expect(goalWorkflowViewRefreshKey(changed)).not.toBe(goalWorkflowViewRefreshKey(original));
    }
  );

  it.each(['artifactId', 'artifactHash', 'kind'])(
    'detects an exact output reference %s change',
    (field) => {
      const original = snapshot();
      original.stages[0].outputArtifact = {
        artifactId: 'output-a',
        artifactHash: 'b'.repeat(64),
        kind: 'task_result',
      };
      const changed = structuredClone(original);
      changed.stages[0].outputArtifact[field] = `changed-${field}`;
      expect(goalWorkflowViewRefreshKey(changed)).not.toBe(goalWorkflowViewRefreshKey(original));
    }
  );

  it.each(['finalArtifact', 'evidenceReadiness', 'status', 'rowVersion'])(
    'detects changed run %s metadata',
    (field) => {
      const original = snapshot(),
        changed = structuredClone(original);
      changed.run[field] =
        field === 'finalArtifact'
          ? { artifactId: 'output-a', artifactHash: 'b'.repeat(64), kind: 'final_markdown' }
          : field === 'rowVersion'
            ? 10
            : field === 'status'
              ? 'completed'
              : 'ready';
      expect(goalWorkflowViewRefreshKey(changed)).not.toBe(goalWorkflowViewRefreshKey(original));
    }
  );

  it('reads at most 120 public stages and never reads bodies, attempts or history', () => {
    const value = snapshot();
    const failIfRead = () => {
      throw new Error('Private metadata must not be inspected');
    };
    for (const key of ['attempts', 'history', 'artifacts', 'approvals', 'dependencies'])
      Object.defineProperty(value, key, { get: failIfRead });
    Object.defineProperty(value.run, 'request', { get: failIfRead });
    Object.defineProperty(value.stages[0], 'inputPayload', { get: failIfRead });
    value.stages = Array.from({ length: 120 }, () => value.stages[0]);
    const overflow = {};
    Object.defineProperty(overflow, 'id', { get: failIfRead });
    value.stages.push(overflow);
    const key = goalWorkflowViewRefreshKey(value);
    expect(JSON.parse(key)[6]).toHaveLength(120);
    expect(key).not.toContain('Private');
  });
});
