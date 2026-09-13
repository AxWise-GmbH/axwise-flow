import { describe, expect, it, vi } from 'vitest';
import { createSolutionRuntime } from './solution-runtime.js';
import { createSolutionService } from './solution-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const otherTenantId = '22222222-2222-4222-8222-222222222222';
const solutionId = '33333333-3333-4333-8333-333333333333';
const auth = { userId: 'user_owner' };
const binding = (id, overrides = {}) => ({
  id,
  tenantId,
  userId: auth.userId,
  name: id,
  region: 'europe-west4',
  origin: `https://${id}.example.test`,
  apiKey: 'local-test-placeholder-only',
  useIdToken: false,
  ...overrides,
});
const firstId = 'customer-preview-001';
const secondId = 'customer-preview-002';

function setup({ occupied = [], bindings, assignmentRace = false, assigned = null } = {}) {
  const runtime = createSolutionRuntime({
    bindings: bindings ?? [binding(firstId), binding(secondId)],
    fetchImpl: vi.fn(() => {
      throw new Error('Provider calls are forbidden in selection tests');
    }),
  });
  const deploy = vi.spyOn(runtime, 'deploy');
  const solution = {
    tenant_id: tenantId,
    owner_user_id: auth.userId,
    id: solutionId,
    environment_id: assigned,
    status: 'draft',
    row_version: 0,
    workflow_hash: 'a'.repeat(64),
  };
  const query = vi.fn(async (sql, params) => {
    expect(params[0]).toBe(tenantId);
    expect(params[1]).toBe(auth.userId);
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.includes('SELECT environment_id')) {
      return {
        rows: occupied
          .filter((id) => params[2].includes(id))
          .map((environment_id) => ({ environment_id })),
      };
    }
    if (sql.includes('SELECT * FROM orqaly.customer_solutions')) return { rows: [solution] };
    if (sql.includes('SELECT * FROM orqaly.solution_invocations')) return { rows: [] };
    if (sql.includes('UPDATE orqaly.customer_solutions') && assignmentRace) {
      throw Object.assign(new Error('unique environment assignment conflict'), { code: '23505' });
    }
    throw new Error('Unexpected selection query');
  });
  const repository = {
    resolveTenant: vi.fn(async () => tenantId),
    solutionTransaction: vi.fn(async (id, callback) => {
      expect(id).toBe(tenantId);
      return callback({ query });
    }),
  };
  return { service: createSolutionService({ repository, runtime }), query, deploy, repository };
}

describe('owner-scoped Solution deployment slot selection', () => {
  it('offers the second owner binding when the first is assigned', async () => {
    const { service, query } = setup({ occupied: [firstId] });
    const result = await service.read(auth, solutionId);
    expect(result.solution.environment.id).toBe(secondId);
    expect(query.mock.calls.find(([sql]) => sql.includes('SELECT environment_id'))[1]).toEqual([
      tenantId,
      auth.userId,
      [firstId, secondId],
    ]);
  });

  it('offers no deployment environment when both owner bindings are occupied', async () => {
    const { service } = setup({ occupied: [firstId, secondId] });
    expect((await service.read(auth, solutionId)).solution.environment).toBeNull();
  });

  it('never offers bindings from another owner or tenant', async () => {
    const { service, query } = setup({
      occupied: [firstId],
      bindings: [
        binding(firstId),
        binding(secondId, { userId: 'user_another' }),
        binding('customer-preview-003', { tenantId: otherTenantId }),
      ],
    });
    expect((await service.read(auth, solutionId)).solution.environment).toBeNull();
    expect(query.mock.calls.find(([sql]) => sql.includes('SELECT environment_id'))[1][2]).toEqual([
      firstId,
    ]);
  });

  it('keeps an existing assigned environment instead of suggesting a replacement', async () => {
    const { service, query } = setup({ assigned: secondId, occupied: [firstId, secondId] });
    expect((await service.read(auth, solutionId)).solution.environment.id).toBe(secondId);
    expect(query.mock.calls.some(([sql]) => sql.includes('SELECT environment_id'))).toBe(false);
  });

  it('can use occupied owner-scoped frontend assets without reading an existing Solution', async () => {
    const { service, query, repository, deploy } = setup({ occupied: [firstId, secondId] });
    expect((await service.authoringEnvironment(auth)).id).toBe(firstId);
    expect(repository.solutionTransaction).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(deploy).not.toHaveBeenCalled();
  });

  it('provides no authoring asset binding for a different owner', async () => {
    const { service, query } = setup({ bindings: [binding(firstId, { userId: 'user_another' })] });
    expect(await service.authoringEnvironment(auth)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('fails an assignment race before any runtime deployment call', async () => {
    const { service, deploy } = setup({ occupied: [firstId], assignmentRace: true });
    await expect(
      service.decide(
        auth,
        solutionId,
        {
          action: 'deploy',
          workflowHash: 'a'.repeat(64),
          environmentId: secondId,
        },
        0
      )
    ).rejects.toMatchObject({ code: 'SOLUTION_ENVIRONMENT_OCCUPIED', status: 409 });
    expect(deploy).not.toHaveBeenCalled();
  });
});
