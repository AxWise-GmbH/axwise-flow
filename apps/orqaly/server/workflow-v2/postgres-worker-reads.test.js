import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalHash } from '../../lib/workflow-v2/canonical.js';
const { pools } = vi.hoisted(() => ({ pools: [] }));
vi.mock('pg', () => ({
  default: {
    Pool: vi.fn(function () {
      const client = { query: vi.fn(), release: vi.fn() };
      const pool = { connect: vi.fn().mockResolvedValue(client), end: vi.fn(), client };
      pools.push(pool);
      return pool;
    }),
  },
}));
import { createPostgresRepositories, loadSnapshotWithClient } from './postgres-repository.js';

const tenant = '00000000-0000-4000-8000-000000000001';
const run = '00000000-0000-4000-8000-000000000002';
const attempt = '00000000-0000-4000-8000-000000000003';
const input = {
  type: 'CompileScopeV2',
  request: 'Synthetic bounded research',
  objectiveOnlyContext: [],
  safeDefaults: {
    geography: [],
    acceptedSourceTypes: [],
    assumptions: [],
    limits: [],
    policies: [],
  },
};

describe('worker bounded database reads', () => {
  beforeEach(() => pools.splice(0));
  it.each(['completed', 'completed_with_evidence_gaps', 'blocked', 'failed', 'cancelled'])(
    'never loads terminal %s attempt payloads on repeated recovery passes',
    async (status) => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [{ status }] }) };
      for (let pass = 0; pass < 3; pass++)
        await expect(
          loadSnapshotWithClient(client, tenant, run, {
            includeLeaseToken: true,
            skipTerminal: true,
          })
        ).resolves.toBeNull();
      expect(client.query).toHaveBeenCalledTimes(3);
      for (const [sql, params] of client.query.mock.calls) {
        expect(sql).not.toContain('input_payload');
        expect(sql).not.toContain('artifact.payload');
        expect(params).toEqual([tenant, run]);
      }
    }
  );
  it('stops after metadata for a missing or RLS-hidden run', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    expect(await loadSnapshotWithClient(client, tenant, run)).toBeNull();
    expect(client.query).toHaveBeenCalledOnce();
  });
  function contextFixture(stageKind = 'compile_scope') {
    const repository = createPostgresRepositories({
      environment: 'preview',
      workerDatabaseUrl: 'postgres://unused',
    });
    const client = pools.at(-1).client;
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM orqaly.stage_attempts'))
        return {
          rows: [
            {
              owner_user_id: 'user_test123',
              owner_organization_id: null,
              mode: 'simple',
              request: 'Synthetic bounded research',
              stage_id: run,
              stage_kind: stageKind,
              attempt_id: attempt,
              attempt_number: 1,
              operation_id: run,
              input_hash: canonicalHash(input),
              input_payload: input,
              operation_status_url: 'https://example.invalid/status',
            },
          ],
        };
      if (sql.includes('FROM orqaly.artifacts'))
        return {
          rows: [
            {
              artifact_id: run,
              artifact_kind: 'scope',
              artifact_hash: 'a'.repeat(64),
              content_type: 'application/json',
              payload: { synthetic: true },
              markdown: null,
              input_hash: canonicalHash(input),
              stage_id: run,
              source_artifact_ids: [],
            },
          ],
        };
      return { rows: [] };
    });
    return { repository, client };
  }
  it('skips artifact, planning agent and duplicate input queries for an upstream poll', async () => {
    const { repository, client } = contextFixture('execute_research');
    const context = await repository.loadActivityContext(tenant, run, attempt, {
      includeArtifacts: false,
      inputPayload: input,
    });
    expect(context).toMatchObject({ inputPayload: input, artifacts: [], agents: [] });
    expect(client.query.mock.calls.map(([sql]) => sql).join('\n')).not.toMatch(
      /attempt\.input_payload|FROM orqaly\.artifacts|list_tenant_agents/
    );
    expect(client.query.mock.calls[1][1]).toEqual([tenant]);
    expect(client.query.mock.calls[2][1]).toEqual([tenant, run, attempt]);
    expect(client.release).toHaveBeenCalledOnce();
  });
  it('still loads complete artifacts for actual completion or internal execution', async () => {
    const { repository, client } = contextFixture();
    const context = await repository.loadActivityContext(tenant, run, attempt);
    expect(context.artifacts[0].payload).toEqual({ synthetic: true });
    expect(client.query.mock.calls.some(([sql]) => sql.includes('attempt.input_payload'))).toBe(
      true
    );
    expect(client.query.mock.calls.some(([sql]) => sql.includes('artifact.markdown'))).toBe(true);
  });
  it('rejects a substituted input before loading artifacts and rolls back', async () => {
    const { repository, client } = contextFixture();
    await expect(
      repository.loadActivityContext(tenant, run, attempt, {
        inputPayload: { ...input, request: 'Different frozen request' },
      })
    ).rejects.toThrow('activity context input hash mismatch');
    expect(client.query.mock.calls.some(([sql]) => sql.includes('FROM orqaly.artifacts'))).toBe(
      false
    );
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
  });
  it('routes only lease recovery through the active-run guarded RPC', async () => {
    const { repository, client } = contextFixture();
    client.query.mockResolvedValue({
      rows: [{ receipt: { skipped: true, reason: 'run_not_active' } }],
    });
    await repository.applyWorkerTransition(tenant, run, { event: { type: 'LeaseExpired' } });
    expect(client.query.mock.calls[2][0]).toContain('orqaly.recover_attempt_lease');
    client.query.mockClear();
    await repository.applyWorkerTransition(tenant, run, { event: { type: 'ActivityDeferred' } });
    expect(client.query.mock.calls[2][0]).toContain('orqaly.apply_transition');
  });
});
