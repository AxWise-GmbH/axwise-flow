import { describe, expect, it, vi } from 'vitest';
const { pools } = vi.hoisted(() => ({ pools: [] }));
vi.mock('pg', () => ({
  default: {
    Pool: vi.fn(function (options) {
      const pool = {
        options,
        query: vi
          .fn()
          .mockResolvedValue({
            rows: [
              { isolated_tables: 3, build_grants: true, api_grants: true, retest_grants: true, verification_grants: true },
            ],
          }),
        end: vi.fn(),
      };
      pools.push(pool);
      return pool;
    }),
  },
}));
import { createPostgresRepositories } from './postgres-repository.js';

describe('native build repository feature-gated readiness and worker claim', () => {
  it('does not require migration015 when the new capability flag is off', async () => {
    const repository = createPostgresRepositories({
      environment: 'preview',
      apiDatabaseUrl: 'postgres://not-used',
    });
    const pool = pools.at(-1);
    await repository.readiness();
    expect(pool.query.mock.calls).toEqual([['SELECT 1']]);
  });
  it('requires the native schema/grants only when explicitly enabled', async () => {
    const repository = createPostgresRepositories({
      environment: 'preview',
      apiDatabaseUrl: 'postgres://not-used',
      requireNativeWorkflowBuilds: true,
    });
    const pool = pools.at(-1);
    await repository.readiness();
    expect(pool.query.mock.calls.some(([sql]) => sql.includes('native_test_lease_token'))).toBe(
      true
    );
    expect(pool.query.mock.calls.at(-1)[1]).toEqual([true]);
  });
  it('calls only the worker-scoped retest claim RPC and never trusts supplied owner selectors', async () => {
    const repository = createPostgresRepositories({
      environment: 'preview',
      workerDatabaseUrl: 'postgres://not-used',
      requireNativeWorkflowBuilds: true,
    });
    const pool = pools.at(-1);
    const token = '2031decc-b21e-48b5-9bd5-3ed3d4dfd024';
    const claim = { buildRequestId: token, rowVersion: 4, workflowHash: 'a'.repeat(64) };
    pool.query.mockResolvedValueOnce({ rows: [{ claim }] });
    await expect(repository.claimNativeWorkflowRetest(token)).resolves.toEqual(claim);
    expect(pool.query).toHaveBeenCalledExactlyOnceWith(
      'SELECT orqaly.claim_native_workflow_retest($1::uuid) AS claim',
      [token]
    );
  });
  it('does not fall back to API authority for retest claiming', async () => {
    const repository = createPostgresRepositories({
      environment: 'preview',
      apiDatabaseUrl: 'postgres://not-used',
    });
    const pool = pools.at(-1);
    await expect(
      repository.claimNativeWorkflowRetest('2031decc-b21e-48b5-9bd5-3ed3d4dfd024')
    ).rejects.toThrow('Worker database URL is not configured');
    expect(pool.query).not.toHaveBeenCalled();
  });
});
