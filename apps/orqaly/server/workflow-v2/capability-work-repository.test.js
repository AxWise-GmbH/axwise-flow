// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { canonicalHash } from '../../lib/workflow-v2/canonical.js';
const state = vi.hoisted(() => ({ pools: [] }));
vi.mock('pg', () => ({
  default: {
    Pool: class {
      constructor(options) {
        this.options = options;
        this.client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
        this.connect = vi.fn(async () => this.client);
        this.query = vi.fn(async () => ({ rows: [] }));
        this.end = vi.fn();
        state.pools.push(this);
      }
    },
  },
}));
import {
  createPostgresRepositories,
  readOverviewProjectionWithClient,
  readActivityProjectionWithClient,
} from './postgres-repository.js';
import { createWorkflowCommandService } from './command-service.js';
import { capabilityWorkEnabledFromEnvironment } from './capability-work-config.js';
const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const attestationSource = readFileSync(
  new URL(
    '../../database/workflow-v2/migrations/025_explicit_capability_work.sql',
    import.meta.url
  ),
  'utf8'
).match(
  /CREATE FUNCTION orqaly\.capability_work_schema_ready_025\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/
)[1];
beforeEach(() => {
  state.pools = [];
});

describe('capability repository boundaries (mock driver, not PostgreSQL proof)', () => {
  it('filters capability overview counts, rows and activity by parameterized owner before limiting', async () => {
    const injectedOwner = "user_owner' OR true --";
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    await readOverviewProjectionWithClient(client, id(1), 12, {
      capabilityOwnerUserId: injectedOwner,
    });
    await readActivityProjectionWithClient(client, id(1), 50, {
      capabilityOwnerUserId: injectedOwner,
    });
    expect(client.query.mock.calls).toHaveLength(3);
    for (const [sql] of client.query.mock.calls) {
      expect(sql).toContain("IS DISTINCT FROM 'capability_work_v1'");
      expect(sql).toContain('owner_organization_id IS NULL');
      expect(sql).not.toContain(injectedOwner);
      expect(sql).not.toMatch(/input_payload|artifact\.payload|stage_attempts/);
    }
    expect(client.query.mock.calls[0][0]).toContain('owner_user_id = $2');
    expect(client.query.mock.calls[0][1]).toEqual([id(1), injectedOwner]);
    for (const [sql, args] of client.query.mock.calls.slice(1)) {
      expect(sql).toContain('run.owner_user_id = $3');
      expect(sql.indexOf('run.owner_user_id = $3')).toBeLessThan(sql.indexOf('LIMIT $2'));
      expect(args[2]).toBe(injectedOwner);
    }
  });
  it('preserves default projection helper bindings and threads owner options through repositories', async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    await readOverviewProjectionWithClient(client, id(1), 12);
    await readActivityProjectionWithClient(client, id(1), 50);
    expect(client.query.mock.calls.map(([, args]) => args)).toEqual([
      [id(1)],
      [id(1), 12],
      [id(1), 50],
    ]);
    expect(client.query.mock.calls.map(([sql]) => sql).join('\n')).not.toContain('owner_user_id =');
    const repository = createPostgresRepositories({
      environment: 'preview',
      apiDatabaseUrl: 'postgres://synthetic-only/api',
    });
    await repository.loadOverviewProjection(id(1), 12, { capabilityOwnerUserId: 'user_owner' });
    await repository.loadActivityProjection(id(1), 50, { capabilityOwnerUserId: 'user_owner' });
    const calls = state.pools[0].client.query.mock.calls.filter(([sql]) =>
      sql.includes('owner_user_id =')
    );
    expect(calls).toHaveLength(3);
    expect(calls.every(([, args]) => args.at(-1) === 'user_owner')).toBe(true);
  });
  it('requires an exact explicit feature flag', () => {
    for (const value of [undefined, '', 'false'])
      expect(capabilityWorkEnabledFromEnvironment({ ORQALY_CAPABILITY_WORK_ENABLED: value })).toBe(
        false
      );
    expect(capabilityWorkEnabledFromEnvironment({ ORQALY_CAPABILITY_WORK_ENABLED: 'true' })).toBe(
      true
    );
    for (const value of ['1', 'yes', 'TRUE', true])
      expect(() =>
        capabilityWorkEnabledFromEnvironment({ ORQALY_CAPABILITY_WORK_ENABLED: value })
      ).toThrow();
  });
  it('does not assert unavailable migration readiness when the feature is disabled', async () => {
    const repository = createPostgresRepositories({
      environment: 'preview',
      apiDatabaseUrl: 'postgres://synthetic-only/api',
    });
    await repository.readiness();
    expect(state.pools[0].query.mock.calls).toEqual([['SELECT 1']]);
    expect(() => repository.applyCapabilityTransition(id(1), id(2), {})).toThrow('not enabled');
    expect(state.pools[0].connect).not.toHaveBeenCalled();
  });
  it('fails readiness without the approved migration and cannot use worker credentials for owner commands', async () => {
    const repository = createPostgresRepositories({
      environment: 'preview',
      workerDatabaseUrl: 'postgres://synthetic-only/worker',
      requireCapabilityWork: true,
    });
    await expect(repository.readiness()).rejects.toThrow('capability_work_migration_025_required');
    expect(() => repository.applyCapabilityTransition(id(1), id(2), {})).toThrow(
      'API database URL'
    );
    expect(state.pools[0].connect).not.toHaveBeenCalled();
  });
  it('uses only the API pool and tenant transaction for an enabled owner command', async () => {
    const repository = createPostgresRepositories({
      environment: 'preview',
      apiDatabaseUrl: 'postgres://synthetic-only/api',
      workerDatabaseUrl: 'postgres://synthetic-only/worker',
      requireCapabilityWork: true,
    });
    state.pools[0].client.query.mockImplementation(async (sql) => ({
      rows: sql.includes('apply_capability_transition') ? [{ receipt: { idempotent: false } }] : [],
    }));
    expect(await repository.applyCapabilityTransition(id(1), id(2), { synthetic: true })).toEqual({
      idempotent: false,
    });
    expect(state.pools[0].client.query.mock.calls).toEqual([
      ['BEGIN'],
      ["SELECT set_config('orqaly.tenant_id', $1, true)", [id(1)]],
      [
        'SELECT orqaly.apply_capability_transition($1, $2, $3::jsonb) AS receipt',
        [id(1), id(2), '{"synthetic":true}'],
      ],
      ['COMMIT'],
    ]);
    expect(state.pools[1].connect).not.toHaveBeenCalled();
  });
  it.each([false, null, undefined, 'true', 1])(
    'rejects incomplete schema attestation %s',
    async (ready) => {
      const repository = createPostgresRepositories({
        environment: 'preview',
        apiDatabaseUrl: 'postgres://synthetic-only/api',
        requireCapabilityWork: true,
      });
      state.pools[0].query.mockImplementation(async (sql) => ({
        rows: [
          sql.includes('AS attestation_exists')
            ? {
                wrapper_exists: true,
                attestation_exists: true,
                attestation_source: attestationSource,
                forced_rls: true,
                idle_status: true,
                broad_write: false,
              }
            : { ready },
        ],
      }));
      await expect(repository.readiness()).rejects.toThrow(
        'capability_work_migration_025_required'
      );
    }
  );
  it.each(['api', 'worker'])(
    'requires exact attestation and exclusive %s permissions',
    async (role) => {
      const repository = createPostgresRepositories({
        environment: 'preview',
        [`${role}DatabaseUrl`]: `postgres://synthetic-only/${role}`,
        requireCapabilityWork: true,
      });
      state.pools[0].query.mockImplementation(async (sql) => ({
        rows: [
          sql.includes('AS attestation_exists')
            ? {
                wrapper_exists: true,
                attestation_exists: true,
                attestation_source: attestationSource,
                forced_rls: true,
                idle_status: true,
                broad_write: false,
              }
            : sql.includes('AS can_command')
              ? { can_command: role === 'api' }
              : { ready: true },
        ],
      }));
      await expect(repository.readiness()).resolves.toBeDefined();
      expect(
        state.pools[0].query.mock.calls.some(
          ([sql]) => sql === 'SELECT orqaly.capability_work_schema_ready_025() AS ready'
        )
      ).toBe(true);
    }
  );
  it.each(['scope', 'transcript_corpus', 'simulation'])(
    'binds direct capability %s artifact reads to the exact owner before fetching bytes',
    async (kind) => {
      const repository = createPostgresRepositories({
        environment: 'preview',
        apiDatabaseUrl: 'postgres://synthetic-only/api',
      });
      repository.resolveTenant = vi.fn(async () => id(1));
      const client = state.pools[0].client;
      client.query.mockImplementation(async (sql, args) => {
        if (!sql.includes('FROM orqaly.artifacts AS artifact')) return { rows: [] };
        expect(sql).toContain('owned_run.tenant_id = artifact.tenant_id');
        expect(sql).toContain('owned_run.id = artifact.run_id');
        expect(sql).toContain("IS DISTINCT FROM 'capability_work_v1'");
        expect(sql).toContain('owned_run.owner_user_id = $4');
        expect(sql).toContain('owned_run.owner_organization_id IS NULL');
        expect(sql).not.toMatch(/stage_attempts|input_payload/);
        return {
          rows:
            args[3] === 'user_owner'
              ? [
                  {
                    artifact_id: id(3),
                    artifact_hash: 'a'.repeat(64),
                    artifact_kind: kind,
                    content_type: 'application/json',
                    payload: { text: 'private-source-bytes' },
                    markdown: null,
                    source_artifact_ids: [],
                  },
                ]
              : [],
        };
      });
      const service = createWorkflowCommandService({ repository });
      await expect(service.artifact({ userId: 'user_other' }, id(2), id(3))).rejects.toMatchObject({
        status: 404,
      });
      expect((await service.artifact({ userId: 'user_owner' }, id(2), id(3))).payload.text).toBe(
        'private-source-bytes'
      );
      expect(
        client.query.mock.calls.filter(([sql]) => sql.includes('FROM orqaly.artifacts'))
      ).toHaveLength(2);
    }
  );
  it.each(['AdmitTranscriptCorpusV1', 'AnalyzeEvidenceV1', 'SimulateV1'])(
    'loads only selected bounded grounding records for %s completion',
    async (type) => {
      const repository = createPostgresRepositories({
        environment: 'preview',
        workerDatabaseUrl: 'postgres://synthetic-only/worker',
      });
      const selectedGrounding =
        type === 'SimulateV1'
          ? [{ artifact: { artifactId: id(7) } }, { artifact: { artifactId: id(7) } }]
          : [];
      const inputPayload = { type, ...(type === 'SimulateV1' ? { selectedGrounding } : {}) };
      const client = state.pools[0].client;
      client.query.mockImplementation(async (sql) => {
        if (sql.includes('FROM orqaly.stage_attempts'))
          return {
            rows: [
              {
                stage_kind: 'execution',
                input_payload: inputPayload,
                input_hash: canonicalHash(inputPayload),
              },
            ],
          };
        return { rows: [] };
      });
      await repository.loadActivityContext(id(1), id(2), id(3), {
        includeArtifacts: true,
        inputPayload,
      });
      const artifactCalls = client.query.mock.calls.filter(([sql]) =>
        sql.includes('FROM orqaly.artifacts')
      );
      expect(artifactCalls).toHaveLength(type === 'SimulateV1' ? 1 : 0);
      if (artifactCalls.length) {
        expect(artifactCalls[0][0]).toContain('artifact.tenant_id = $1 AND artifact.run_id = $2');
        expect(artifactCalls[0][0]).toContain('artifact.id = ANY($3::uuid[])');
        expect(artifactCalls[0][1]).toEqual([id(1), id(2), [id(7)]]);
      }
    }
  );
});
