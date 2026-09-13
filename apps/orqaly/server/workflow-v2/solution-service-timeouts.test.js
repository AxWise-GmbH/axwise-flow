import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSolutionService, publicInvocation } from './solution-service.js';
import { createSolutionRevisionService, publicRevision } from './solution-revision-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const solutionId = '33333333-3333-4333-8333-333333333333';
const auth = { userId: 'user_owner' };
const workflowHash = 'a'.repeat(64);
const now = Date.parse('2026-09-05T12:00:00Z');

afterEach(() => vi.restoreAllMocks());

function fixture(ageMs) {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  const value = {
    id: solutionId,
    tenant_id: tenantId,
    owner_user_id: auth.userId,
    environment_id: 'preview-environment',
    status: 'deploying',
    row_version: 1,
    workflow_hash: workflowHash,
    updated_at: new Date(now - ageMs).toISOString(),
  };
  const query = vi.fn(async (sql) => {
    if (sql.includes('SELECT * FROM orqaly.customer_solutions')) return { rows: [value] };
    if (sql.includes('SELECT * FROM orqaly.solution_invocations')) return { rows: [] };
    throw new Error('Unexpected mutation in read-only timeout fixture');
  });
  const runtime = { describe: (id) => ({ id }), deploy: vi.fn() };
  const service = createSolutionService({
    runtime,
    repository: {
      resolveTenant: async () => tenantId,
      solutionTransaction: async (_tenant, callback) => callback({ query }),
    },
  });
  return { service, query, runtime };
}

describe('Solution runtime cold-start status windows', () => {
  it.each([120_001, 195_000, 240_000])(
    'keeps revision deployment and its retry gate aligned at %dms',
    async (ageMs) => {
      vi.spyOn(Date, 'now').mockReturnValue(now);
      const revision = {
        status: 'deploying',
        row_version: 1,
        workflow_hash: workflowHash,
        updated_at: new Date(now - ageMs).toISOString(),
      };
      expect(publicRevision(revision).status).toBe('deploying');
      const query = vi.fn(async (sql) => {
        if (sql.includes('SELECT * FROM orqaly.customer_solutions'))
          return { rows: [{ id: solutionId }] };
        if (sql.includes('SELECT * FROM orqaly.solution_revisions')) return { rows: [revision] };
        throw new Error('Unexpected mutation during bounded deployment');
      });
      const runtime = { deploy: vi.fn() };
      const service = createSolutionRevisionService({
        runtime,
        repository: {
          resolveTenant: async () => tenantId,
          solutionTransaction: async (_tenant, callback) => callback({ query }),
        },
      });
      await expect(
        service.decide(auth, solutionId, '44444444-4444-4444-8444-444444444444', {
          action: 'deploy',
          workflowHash,
          expectedVersion: 1,
        })
      ).rejects.toMatchObject({ code: 'SOLUTION_REVISION_STATE' });
      expect(runtime.deploy).not.toHaveBeenCalled();
    }
  );

  it('still reports a revision deployment as unknown after the shared window', () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(
      publicRevision({ status: 'deploying', updated_at: new Date(now - 240_001) }).status
    ).toBe('deployment_unknown');
  });

  it.each([60_001, 105_000, 150_000])('keeps a bounded invocation running at %dms', (ageMs) => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(publicInvocation({ status: 'running', created_at: new Date(now - ageMs) }).status).toBe(
      'running'
    );
  });

  it('still reports an abandoned invocation as unknown after the bounded window', () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(
      publicInvocation({ status: 'running', created_at: new Date(now - 150_001) }).status
    ).toBe('outcome_unknown');
    expect(publicInvocation({ status: 'outcome_unknown', created_at: new Date(now) }).status).toBe(
      'outcome_unknown'
    );
  });

  it.each([120_001, 195_000, 240_000])(
    'does not offer reconciliation during a bounded deployment at %dms',
    async (ageMs) => {
      const { service, runtime } = fixture(ageMs);
      expect((await service.read(auth, solutionId)).solution.status).toBe('deploying');
      await expect(
        service.decide(
          auth,
          solutionId,
          {
            action: 'deploy',
            workflowHash,
            environmentId: 'preview-environment',
          },
          1
        )
      ).rejects.toMatchObject({ code: 'SOLUTION_STATE' });
      expect(runtime.deploy).not.toHaveBeenCalled();
    }
  );

  it('reports a deployment past the same bounded window as requiring reconciliation', async () => {
    const { service, query } = fixture(240_001);
    expect((await service.read(auth, solutionId)).solution.status).toBe('deployment_unknown');
    expect(query.mock.calls.every(([sql]) => sql.trimStart().startsWith('SELECT'))).toBe(true);
  });
});
