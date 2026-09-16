// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { verifySolutionRevisionForkReadiness } from './postgres-repository.js';
const healthy = (api) => ({
  rls: true,
  can_read: api,
  can_insert: api,
  can_mutate: false,
  worker_access: false,
  owner_fks: 2,
  revision_owner_fk: true,
  policies: 1,
  owner_policy: true,
});
describe('candidate fork migration021 readiness', () => {
  it('reads zero customer rows as API and checks append-only owner isolation', async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [healthy(true)] }),
    };
    await verifySolutionRevisionForkReadiness(pool, { api: true });
    expect(pool.query.mock.calls[0][0]).toContain('LIMIT 0');
    expect(pool.query.mock.calls[1][0]).toContain('owner_user_id');
  });
  it('never selects customer fork rows as worker', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [healthy(false)] }) };
    await verifySolutionRevisionForkReadiness(pool);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).not.toContain('FROM orqaly.solution_revision_forks');
  });
  it.each([
    { rls: false },
    { can_insert: false },
    { can_mutate: true },
    { worker_access: true },
    { owner_fks: 1 },
    { revision_owner_fk: false },
    { policies: 2 },
    { owner_policy: false },
  ])('fails closed for privilege or ownership drift %j', async (drift) => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...healthy(true), ...drift }] }),
    };
    await expect(verifySolutionRevisionForkReadiness(pool, { api: true })).rejects.toThrow(
      'fork_isolation_invalid'
    );
  });
});
