import { describe, it, expect } from 'vitest';
import { orgScopeFromGoal, resolveGoalKbScope, resolveAgentKbScope } from './kb-scope.js';

// Admin stub whose goals lookup resolves to `row` (or an error when row is null).
function adminWith(row) {
  const filters = [];
  const chain = {
    select: () => chain,
    eq: (field, value) => {
      filters.push([field, value]);
      return chain;
    },
    single: () => Promise.resolve({ data: row, error: row ? null : { message: 'not found' } }),
  };
  return {
    filters,
    from: () => chain,
  };
}

describe('orgScopeFromGoal', () => {
  it('maps a goal org_id/concilium_id to the KB columns', () => {
    expect(orgScopeFromGoal({ org_id: 'o1', concilium_id: 'c1' })).toEqual({
      organization_id: 'o1',
      concilium_id: 'c1',
    });
  });

  it('returns nulls when the goal lacks the fields', () => {
    expect(orgScopeFromGoal({})).toEqual({ organization_id: null, concilium_id: null });
  });

  it('returns nulls for a null/undefined goal', () => {
    expect(orgScopeFromGoal(null)).toEqual({ organization_id: null, concilium_id: null });
    expect(orgScopeFromGoal(undefined)).toEqual({ organization_id: null, concilium_id: null });
  });
});

describe('resolveGoalKbScope', () => {
  it('fetches org/consilium by goal id', async () => {
    const admin = adminWith({ org_id: 'o9', concilium_id: 'c9' });
    const scope = await resolveGoalKbScope(admin, 'g1', 'u1');
    expect(scope).toEqual({ organization_id: 'o9', concilium_id: 'c9' });
    expect(admin.filters).toContainEqual(['user_id', 'u1']);
  });

  it('returns nulls when goalId is missing', async () => {
    expect(await resolveGoalKbScope(adminWith({ org_id: 'o9' }), null, 'u1')).toEqual({
      organization_id: null,
      concilium_id: null,
    });
  });

  it('returns nulls when admin is missing', async () => {
    expect(await resolveGoalKbScope(null, 'g1', 'u1')).toEqual({
      organization_id: null,
      concilium_id: null,
    });
  });

  it('coerces absent columns to null', async () => {
    expect(
      await resolveGoalKbScope(adminWith({ org_id: null, concilium_id: null }), 'g1', 'u1')
    ).toEqual({ organization_id: null, concilium_id: null });
  });

  it('never throws when the lookup errors', async () => {
    const throwing = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => {
              throw new Error('boom');
            },
          }),
        }),
      }),
    };
    expect(await resolveGoalKbScope(throwing, 'g1', 'u1')).toEqual({
      organization_id: null,
      concilium_id: null,
    });
  });

  it('fails closed when the durable owner is missing', async () => {
    const admin = adminWith({ org_id: 'victim-org', concilium_id: 'victim-board' });
    expect(await resolveGoalKbScope(admin, 'g1', null)).toEqual({
      organization_id: null,
      concilium_id: null,
    });
    expect(admin.filters).toEqual([]);
  });
});

// Admin stub routing org_agents -> `link` and organizations -> `org`.
function adminAgent({ link = null, org = null } = {}) {
  const filters = [];
  return {
    filters,
    from: (table) => {
      const chain = {
        select: () => chain,
        eq: (field, value) => {
          filters.push([table, field, value]);
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        maybeSingle: () =>
          Promise.resolve({ data: table === 'org_agents' ? link : org, error: null }),
      };
      return chain;
    },
  };
}

describe('resolveAgentKbScope', () => {
  it('resolves org + consilium from the agent org assignment', async () => {
    const admin = adminAgent({ link: { org_id: 'o5' }, org: { consilium_id: 'c5' } });
    const scope = await resolveAgentKbScope(admin, 'a1', 'u1');
    expect(scope).toEqual({ organization_id: 'o5', concilium_id: 'c5' });
    expect(admin.filters).toContainEqual(['org_agents', 'user_id', 'u1']);
    expect(admin.filters).toContainEqual(['organizations', 'user_id', 'u1']);
  });

  it('sets org with null consilium when the org has no linked board', async () => {
    const scope = await resolveAgentKbScope(
      adminAgent({ link: { org_id: 'o5' }, org: { consilium_id: null } }),
      'a1',
      'u1'
    );
    expect(scope).toEqual({ organization_id: 'o5', concilium_id: null });
  });

  it('returns nulls when the agent has no org assignment', async () => {
    expect(await resolveAgentKbScope(adminAgent({ link: null }), 'a1', 'u1')).toEqual({
      organization_id: null,
      concilium_id: null,
    });
  });

  it('returns nulls when agentId, userId, or admin is missing', async () => {
    expect(await resolveAgentKbScope(adminAgent({ link: { org_id: 'o5' } }), null, 'u1')).toEqual({
      organization_id: null,
      concilium_id: null,
    });
    expect(await resolveAgentKbScope(adminAgent({ link: { org_id: 'o5' } }), 'a1', null)).toEqual({
      organization_id: null,
      concilium_id: null,
    });
    expect(await resolveAgentKbScope(null, 'a1', 'u1')).toEqual({
      organization_id: null,
      concilium_id: null,
    });
  });

  it('never throws when the lookup errors', async () => {
    const throwing = {
      from: () => ({
        select: () => {
          throw new Error('boom');
        },
      }),
    };
    expect(await resolveAgentKbScope(throwing, 'a1', 'u1')).toEqual({
      organization_id: null,
      concilium_id: null,
    });
  });
});
