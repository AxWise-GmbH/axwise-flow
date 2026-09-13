import { describe, expect, it, vi } from 'vitest';
import { readPreviewSolutionAssignments } from './solution-preview-scope.mjs';

const scope = {
  tenantId: '6031decc-b21e-48b5-9bd5-3ed3d4dfd024',
  ownerUserId: 'user_preview123',
  environmentId: 'customer-preview-n8n',
};
const id = '2031decc-b21e-48b5-9bd5-3ed3d4dfd024';
const normalize = (calls) =>
  calls.map(([sql, ...args]) => [sql.replace(/\s+/g, ' ').trim(), ...args]);
const expected = [
  ['BEGIN READ ONLY'],
  ["SELECT set_config('orqaly.tenant_id', $1, true)", [scope.tenantId]],
  [
    'SELECT id FROM orqaly.customer_solutions WHERE tenant_id = $1 AND owner_user_id = $2 AND environment_id = $3',
    [scope.tenantId, scope.ownerUserId, scope.environmentId],
  ],
  ['ROLLBACK'],
];

describe('preview assignment lookup under the existing API RLS role', () => {
  it('opens a read-only transaction, binds a local tenant, selects only scoped IDs, and rolls back', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    await expect(readPreviewSolutionAssignments(client, scope)).resolves.toEqual([{ id }]);
    expect(normalize(client.query.mock.calls)).toEqual(expected);
  });

  it('returns an empty assignment list without widening the query or changing roles', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await expect(readPreviewSolutionAssignments(client, scope)).resolves.toEqual([]);
    expect(normalize(client.query.mock.calls)).toEqual(expected);
    expect(client.query.mock.calls.map(([sql]) => sql).join('\n')).not.toMatch(
      /GRANT|ALTER|SET ROLE|DISABLE|COMMIT/i
    );
  });

  it.each([0, 1, 2])(
    'attempts rollback when statement %i fails, without continuing the read',
    async (failureIndex) => {
      const original = new Error('database rejected the scoped read');
      let count = 0;
      const client = {
        query: vi.fn(async () => {
          if (count++ === failureIndex) throw original;
          return { rows: [] };
        }),
      };
      await expect(readPreviewSolutionAssignments(client, scope)).rejects.toBe(original);
      expect(normalize(client.query.mock.calls)).toEqual([
        ...expected.slice(0, failureIndex + 1),
        ['ROLLBACK'],
      ]);
    }
  );

  it('does not mask the original read failure when rollback also fails', async () => {
    const original = new Error('scoped select failed');
    const cleanup = new Error('connection closed during rollback');
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(original)
        .mockRejectedValueOnce(cleanup),
    };
    await expect(readPreviewSolutionAssignments(client, scope)).rejects.toBe(original);
    expect(normalize(client.query.mock.calls)).toEqual(expected);
  });

  it('fails if cleanup fails after a successful read', async () => {
    const cleanup = new Error('rollback failed');
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id }] })
        .mockRejectedValueOnce(cleanup),
    };
    await expect(readPreviewSolutionAssignments(client, scope)).rejects.toBe(cleanup);
    expect(normalize(client.query.mock.calls)).toEqual(expected);
  });

  it('projects only IDs even if a client returns additional fields', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ id, unrelated: 'not returned' }] }),
    };
    await expect(readPreviewSolutionAssignments(client, scope)).resolves.toEqual([{ id }]);
  });

  it.each([
    { ...scope, tenantId: '' },
    { ...scope, ownerUserId: '' },
    { ...scope, environmentId: '' },
    { ...scope, environmentId: "preview' OR true --" },
    { ...scope, role: 'postgres' },
  ])('rejects invalid or expanded scope before opening any transaction', async (invalidScope) => {
    const client = { query: vi.fn() };
    await expect(readPreviewSolutionAssignments(client, invalidScope)).rejects.toThrow();
    expect(client.query).not.toHaveBeenCalled();
  });
});
