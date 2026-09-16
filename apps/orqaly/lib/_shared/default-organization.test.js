import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_ORG_NAME, resolveDefaultOrgId, resolveGoalOrgId } from './default-organization.js';

describe('default-organization', () => {
  it('exports Traktor as default org name', () => {
    expect(DEFAULT_ORG_NAME).toBe('Traktor');
  });

  function organizationAdmin(results) {
    const filters = [];
    const orders = [];
    let call = 0;
    return {
      filters,
      orders,
      from: vi.fn(() => {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn((column, value) => {
            filters.push([call, column, value]);
            return query;
          }),
          ilike: vi.fn((column, value) => {
            filters.push([call, column, value]);
            return query;
          }),
          order: vi.fn((column, options) => {
            orders.push([call, column, options]);
            return query;
          }),
          limit: vi.fn(() => query),
          maybeSingle: vi.fn(async () => results[call++]),
        };
        return query;
      }),
    };
  }

  it('resolveDefaultOrgId prefers an active Traktor organization', async () => {
    const admin = organizationAdmin([{ data: { id: 'traktor-uuid' }, error: null }]);

    const id = await resolveDefaultOrgId(admin, 'user-1');

    expect(id).toBe('traktor-uuid');
    expect(admin.from).toHaveBeenCalledTimes(1);
    expect(admin.filters).toEqual([
      [0, 'user_id', 'user-1'],
      [0, 'is_active', true],
      [0, 'name', DEFAULT_ORG_NAME],
    ]);
  });

  it('falls back deterministically to the first active user-owned organization', async () => {
    const admin = organizationAdmin([
      { data: null, error: null },
      { data: { id: 'oldest-active-org' }, error: null },
    ]);

    const id = await resolveDefaultOrgId(admin, 'user-1');

    expect(id).toBe('oldest-active-org');
    expect(admin.from).toHaveBeenCalledTimes(2);
    expect(admin.filters).toContainEqual([1, 'user_id', 'user-1']);
    expect(admin.filters).toContainEqual([1, 'is_active', true]);
    expect(admin.orders.filter(([query]) => query === 1)).toEqual([
      [1, 'created_at', { ascending: true }],
      [1, 'id', { ascending: true }],
    ]);
  });

  it('returns null rather than selecting an unscoped organization after a lookup error', async () => {
    const admin = organizationAdmin([{ data: null, error: { message: 'database unavailable' } }]);

    await expect(resolveDefaultOrgId(admin, 'user-1')).resolves.toBeNull();
    expect(admin.from).toHaveBeenCalledTimes(1);
  });

  it('returns null when the user has no active organization', async () => {
    const admin = organizationAdmin([
      { data: null, error: null },
      { data: null, error: null },
    ]);

    await expect(resolveDefaultOrgId(admin, 'user-1')).resolves.toBeNull();
  });

  it('resolveGoalOrgId verifies an explicit orgId is active and user-owned', async () => {
    const admin = organizationAdmin([{ data: { id: 'custom' }, error: null }]);
    const id = await resolveGoalOrgId(admin, 'user-1', { orgId: 'custom' });
    expect(id).toBe('custom');
    expect(admin.filters).toEqual([
      [0, 'id', 'custom'],
      [0, 'user_id', 'user-1'],
      [0, 'is_active', true],
    ]);
  });

  it('resolveGoalOrgId rejects inactive or foreign explicit organizations', async () => {
    const admin = organizationAdmin([{ data: null, error: null }]);

    await expect(
      resolveGoalOrgId(admin, 'user-1', { orgId: 'foreign-or-inactive' })
    ).resolves.toBeNull();
    expect(admin.filters).toContainEqual([0, 'user_id', 'user-1']);
    expect(admin.filters).toContainEqual([0, 'is_active', true]);
  });

  it('resolveGoalOrgId fails closed when explicit organization verification errors', async () => {
    const admin = organizationAdmin([
      { data: null, error: { message: 'organization lookup unavailable' } },
    ]);

    await expect(resolveGoalOrgId(admin, 'user-1', { orgId: 'org-1' })).rejects.toThrow(
      'Unable to verify the selected organization'
    );
  });

  it('resolveGoalOrgId inherits parent org before default', async () => {
    const admin = {
      from: vi.fn((table) => {
        if (table === 'goals') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(function () {
                return this;
              }),
              maybeSingle: vi.fn(async () => ({ data: { org_id: 'parent-org' }, error: null })),
            })),
          };
        }
        return { select: vi.fn() };
      }),
    };
    const id = await resolveGoalOrgId(admin, 'user-1', { parentGoalId: 'g-parent' });
    expect(id).toBe('parent-org');
  });
});
