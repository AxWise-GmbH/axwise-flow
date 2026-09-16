// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { readGoalWorkflowViewWithClient } from './goal-workflow-view-repository.js';
import { GOAL_WORKFLOW_VIEW_LIMITS as limits } from '../../shared/workflow-v2/goal-workflow-view-contract.js';
import {
  goalViewId as id,
  goalViewOwner as owner,
  goalViewRows,
} from '../../shared/workflow-v2/fixtures/goal-workflow-view.js';

function clientFor(rows = goalViewRows()) {
  return {
    query: vi
      .fn()
      .mockResolvedValueOnce({ rows: rows.run ? [rows.run] : [] })
      .mockResolvedValueOnce({ rows: rows.stages })
      .mockResolvedValueOnce({ rows: rows.artifacts }),
  };
}
const read = (client) => readGoalWorkflowViewWithClient(client, id(1), owner, id(2));
describe('owned Goal metadata reader', () => {
  it('performs three bounded, owner-and-tenant-scoped SELECTs, with no attempt or body reads', async () => {
    const client = clientFor();
    const result = await read(client);
    expect(client.query).toHaveBeenCalledTimes(3);
    for (const [sql, params] of client.query.mock.calls) {
      expect(sql.trim()).toMatch(/^SELECT /);
      expect(sql).toContain('run.owner_user_id = $3');
      expect(sql).toMatch(/tenant_id = \$1/);
      expect(sql).toContain('LIMIT');
      expect(sql).not.toMatch(
        /input_payload|stage_attempts|lease_|\.payload\b|\.markdown\b|assistant|workflow_events|\b(?:INSERT|UPDATE|DELETE|CALL)\b/i
      );
      expect(params.slice(0, 3)).toEqual([id(1), id(2), owner]);
    }
    expect(client.query.mock.calls[1][1][3]).toBe(limits.stages + 1);
    expect(client.query.mock.calls[2][1]).toEqual([
      id(1),
      id(2),
      owner,
      [id(4)],
      limits.lineage + 1,
      limits.outputs + 1,
    ]);
    expect(client.query.mock.calls[2][0]).toContain('artifact.id = ANY($4::uuid[])');
    expect(result.snapshot.attempts).toEqual([]);
    expect(result.artifactRecords[0]).toMatchObject({
      artifactId: id(4),
      runId: id(2),
      sourceArtifactIds: [id(5)],
    });
  });
  it.each(['other tenant', 'other owner', 'unknown run'])(
    'stops after the owned-run miss: %s',
    async () => {
      const client = clientFor({ ...goalViewRows(), run: null });
      expect(await read(client)).toBeNull();
      expect(client.query).toHaveBeenCalledTimes(1);
    }
  );
  it.each(['id', 'tenant_id', 'owner_user_id'])(
    'fails closed if the driver returns a mismatched run %s',
    async (field) => {
      const rows = goalViewRows();
      rows.run[field] = field === 'owner_user_id' ? 'user_other' : id(99);
      const client = clientFor(rows);
      await expect(read(client)).rejects.toThrow(/owner mismatch/);
      expect(client.query).toHaveBeenCalledTimes(1);
    }
  );
  it.each(['tenant_id', 'run_id'])('rejects foreign stage %s', async (field) => {
    const rows = goalViewRows();
    rows.stages[0][field] = id(99);
    await expect(read(clientFor(rows))).rejects.toThrow(/stage mismatch/);
  });
  it.each(['tenant_id', 'run_id', 'artifact_id'])('rejects foreign artifact %s', async (field) => {
    const rows = goalViewRows();
    rows.artifacts[0][field] = id(99);
    await expect(read(clientFor(rows))).rejects.toThrow(/artifact mismatch/);
  });
  it.each(['run', 'stage'])(
    'rejects missing or mismatched joined %s artifact identity before metadata loading',
    async (kind) => {
      const rows = goalViewRows();
      (kind === 'run' ? rows.run : rows.stages[0]).artifact_id = id(99);
      const client = clientFor(rows);
      await expect(read(client)).rejects.toThrow(/pointer mismatch/);
      expect(client.query).toHaveBeenCalledTimes(2);
    }
  );
  it('detects stage overflow without fetching later outputs or increasing query count', async () => {
    const rows = goalViewRows();
    rows.stages = Array.from({ length: limits.stages + 1 }, (_, n) => ({
      ...rows.stages[0],
      id: id(100 + n),
      ordinal: n,
      output_artifact_id: n === limits.stages ? id(999) : id(4),
      artifact_id: n === limits.stages ? id(999) : id(4),
    }));
    const client = clientFor(rows),
      result = await read(client);
    expect(result.snapshot.stages).toHaveLength(limits.stages);
    expect(result.coverage.stages.complete).toBe(false);
    expect(result.coverage.outputs.complete).toBe(false);
    expect(client.query.mock.calls[2][1][3]).toEqual([id(4)]);
    expect(client.query).toHaveBeenCalledTimes(3);
  });
  it('bounds lineage and explicitly identifies incomplete output lineage', async () => {
    const rows = goalViewRows();
    rows.artifacts[0].source_artifact_ids = Array.from({ length: limits.lineage + 1 }, (_, n) =>
      id(1000 + n)
    );
    const result = await read(clientFor(rows));
    expect(result.artifactRecords[0].sourceArtifactIds).toHaveLength(limits.lineage);
    expect(result.coverage.lineage.incompleteArtifactIds).toEqual([id(4)]);
  });
  it('marks missing batched metadata as incomplete, not complete-empty', async () => {
    const rows = goalViewRows();
    rows.artifacts = [];
    const result = await read(clientFor(rows));
    expect(result.coverage.outputs).toMatchObject({ complete: false, loaded: 1 });
  });
  it('keeps three queries even when no stages or outputs exist', async () => {
    const rows = goalViewRows();
    rows.run.final_artifact_id = null;
    rows.stages = [];
    rows.artifacts = [];
    const client = clientFor(rows),
      result = await read(client);
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[2][1][3]).toEqual([]);
    expect(result.coverage.outputs).toMatchObject({ loaded: 0, complete: true });
  });
  it('does not carry accidental row bodies, transcripts, or leases into the projection', async () => {
    const rows = goalViewRows();
    for (const row of [rows.run, ...rows.stages, ...rows.artifacts])
      Object.assign(row, {
        payload: 'PRIVATE_BODY',
        markdown: 'PRIVATE_MARKDOWN',
        input_payload: 'PRIVATE_INPUT',
        lease_token: 'PRIVATE_LEASE',
        transcript: 'PRIVATE_TRANSCRIPT',
      });
    expect(JSON.stringify(await read(clientFor(rows)))).not.toContain('PRIVATE_');
  });
  it('uses an API-only repeatable-read/read-only tenant transaction without changing legacy reads', () => {
    const source = readFileSync(new URL('./postgres-repository.js', import.meta.url), 'utf8');
    expect(source).toContain(
      "readOnlySnapshot ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN'"
    );
    const method = source.slice(
      source.indexOf('    loadGoalWorkflowView('),
      source.indexOf('    loadArtifact(')
    );
    expect(method).toMatch(/withTenantClient\(\s*apiPool,\s*tenantId/);
    expect(method).toContain('{ readOnlySnapshot: true }');
    expect(method).not.toContain('workerPool');
    expect(source.match(/readOnlySnapshot: true/g)).toHaveLength(1);
  });
});
