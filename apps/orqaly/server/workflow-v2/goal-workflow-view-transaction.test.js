// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  goalViewId as id,
  goalViewOwner as owner,
  goalViewRows,
} from '../../shared/workflow-v2/fixtures/goal-workflow-view.js';

const state = vi.hoisted(() => ({ pools: [] }));
vi.mock('pg', () => ({
  default: {
    Pool: class {
      constructor(options) {
        this.options = options;
        this.client = { query: vi.fn(), release: vi.fn() };
        this.connect = vi.fn(async () => this.client);
        this.end = vi.fn();
        state.pools.push(this);
      }
    },
  },
}));
import {
  createPostgresRepositories,
  resolveExistingPersonalTenant,
} from './postgres-repository.js';

beforeEach(() => {
  state.pools = [];
});
describe('Goal metadata transaction boundaries (mock driver; no database)', () => {
  it('uses only the API pool and a consistent read-only snapshot with tenant RLS context', async () => {
    const repository = createPostgresRepositories({
      environment: 'preview',
      identityDatabaseUrl: 'postgres://synthetic/identity',
      apiDatabaseUrl: 'postgres://synthetic/api',
      workerDatabaseUrl: 'postgres://synthetic/worker',
    });
    const api = state.pools.find((pool) => pool.options.application_name.endsWith('-api')),
      rows = goalViewRows();
    api.client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM orqaly.workflow_runs AS run')) return { rows: [rows.run] };
      if (sql.includes('FROM orqaly.workflow_stages AS stage')) return { rows: rows.stages };
      if (sql.includes('FROM orqaly.artifacts AS artifact')) return { rows: rows.artifacts };
      return { rows: [] };
    });
    await repository.loadGoalWorkflowView(id(1), owner, id(2));
    expect(api.client.query.mock.calls[0]).toEqual([
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
    ]);
    expect(api.client.query.mock.calls[1]).toEqual([
      "SELECT set_config('orqaly.tenant_id', $1, true)",
      [id(1)],
    ]);
    expect(api.client.query.mock.calls.at(-1)).toEqual(['COMMIT']);
    expect(api.client.query).toHaveBeenCalledTimes(6);
    expect(api.client.release).toHaveBeenCalledTimes(1);
    for (const pool of state.pools.filter((pool) => pool !== api))
      expect(pool.connect).not.toHaveBeenCalled();
  });
  it('rolls back and releases the API client on projection failure', async () => {
    const repository = createPostgresRepositories({
      environment: 'preview',
      apiDatabaseUrl: 'postgres://synthetic/api',
    });
    const pool = state.pools[0];
    pool.client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM orqaly.workflow_runs')) throw new Error('synthetic failure');
      return { rows: [] };
    });
    await expect(repository.loadGoalWorkflowView(id(1), owner, id(2))).rejects.toThrow(
      'synthetic failure'
    );
    expect(pool.client.query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
    expect(pool.client.release).toHaveBeenCalledTimes(1);
  });
  it('cannot fall back to worker credentials when the API pool is absent', () => {
    const repository = createPostgresRepositories({
      environment: 'preview',
      workerDatabaseUrl: 'postgres://synthetic/worker',
    });
    expect(() => repository.loadGoalWorkflowView(id(1), owner, id(2))).toThrow(
      'API database URL is not configured'
    );
    expect(state.pools[0].connect).not.toHaveBeenCalled();
  });
  it('resolves an existing binding inside an identity-role READ ONLY transaction', async () => {
    const repository = createPostgresRepositories({
      environment: 'preview',
      identityDatabaseUrl: 'postgres://synthetic/identity',
    });
    const pool = state.pools[0];
    pool.client.query.mockImplementation(async (sql) => ({
      rows: sql.includes('ensure_personal_tenant') ? [{ tenant_id: id(1), created: false }] : [],
    }));
    expect(await repository.resolveExistingTenant({ userId: owner })).toBe(id(1));
    expect(pool.client.query.mock.calls).toEqual([
      ['BEGIN READ ONLY'],
      ['SELECT tenant_id, created FROM orqaly.ensure_personal_tenant($1, $2)', ['preview', owner]],
      ['COMMIT'],
    ]);
    expect(pool.client.release).toHaveBeenCalledTimes(1);
  });
  it.each(['25006', '42501'])(
    'rolls back denied provisioning/suspended identity (%s) without authorizing a data read',
    async (code) => {
      const client = {
        query: vi.fn(async (sql) => {
          if (sql.includes('ensure_personal_tenant'))
            throw Object.assign(new Error('PRIVATE'), { code });
          return { rows: [] };
        }),
        release: vi.fn(),
      };
      expect(
        await resolveExistingPersonalTenant({ connect: async () => client }, 'preview', owner)
      ).toBeNull();
      expect(client.query.mock.calls[0]).toEqual(['BEGIN READ ONLY']);
      expect(client.query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
      expect(client.release).toHaveBeenCalledTimes(1);
    }
  );
  it('rolls back an impossible created binding rather than committing it', async () => {
    const client = {
      query: vi.fn(async (sql) => ({
        rows: sql.includes('ensure_personal_tenant') ? [{ tenant_id: id(1), created: true }] : [],
      })),
      release: vi.fn(),
    };
    await expect(
      resolveExistingPersonalTenant({ connect: async () => client }, 'preview', owner)
    ).rejects.toThrow(/attempted provisioning/);
    expect(client.query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
