/**
 * Organization team mapping.
 *
 * Motivation: the goal path wrote `org_agents` from team-formation but never
 * `org_teams` — only the manual assign dialog did. An organization could
 * therefore show Agents (7) and Teams (0) after several goals had already
 * formed teams for it.
 *
 * findOrgStandingTeam() resolves the organization's persistent team: an
 * `agent_teams` row with goal_id NULL, which sits outside migration 192's
 * `WHERE goal_id IS NOT NULL` uniqueness guard and may be shared across goals.
 */
import { describe, it, expect, vi } from 'vitest';
import { registerOrgTeam, findOrgStandingTeam } from './team-assigner.js';

/** Minimal Supabase query-builder double: records calls, returns a fixed result. */
function makeTable(result = { data: [], error: null }) {
  const calls = { filters: [], upserts: [] };
  const builder = {
    calls,
    select: vi.fn(() => builder),
    eq: vi.fn((col, val) => {
      calls.filters.push([col, val]);
      return builder;
    }),
    is: vi.fn((col, val) => {
      calls.filters.push([col, val]);
      return builder;
    }),
    in: vi.fn((col, val) => {
      calls.filters.push([col, val]);
      return builder;
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(result)),
    upsert: vi.fn((rows, opts) => {
      calls.upserts.push([rows, opts]);
      return Promise.resolve({ error: result.error || null });
    }),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

function makeAdmin(tables) {
  return { from: vi.fn((name) => tables[name]) };
}

describe('registerOrgTeam', () => {
  it('upserts the org-to-team mapping', async () => {
    const orgTeams = makeTable();
    const admin = makeAdmin({ org_teams: orgTeams });

    const result = await registerOrgTeam(admin, 'user-1', 'org-1', 'team-1');

    expect(result).toBe(true);
    expect(orgTeams.calls.upserts[0][0]).toEqual({
      user_id: 'user-1',
      org_id: 'org-1',
      team_id: 'team-1',
    });
    expect(orgTeams.calls.upserts[0][1]).toEqual({
      onConflict: 'org_id,team_id',
      ignoreDuplicates: true,
    });
  });

  it('coerces the team id to text, matching the org_teams column type', async () => {
    const orgTeams = makeTable();
    const admin = makeAdmin({ org_teams: orgTeams });

    await registerOrgTeam(admin, 'user-1', 'org-1', 42);

    expect(orgTeams.calls.upserts[0][0].team_id).toBe('42');
  });

  it('is a no-op without an organization, so personal goals write nothing', async () => {
    const orgTeams = makeTable();
    const admin = makeAdmin({ org_teams: orgTeams });

    expect(await registerOrgTeam(admin, 'user-1', null, 'team-1')).toBe(false);
    expect(await registerOrgTeam(admin, 'user-1', 'org-1', null)).toBe(false);
    expect(orgTeams.upsert).not.toHaveBeenCalled();
  });

  it('propagates a write error rather than reporting success', async () => {
    const orgTeams = makeTable({ data: null, error: { message: 'rls denied' } });
    const admin = makeAdmin({ org_teams: orgTeams });

    await expect(registerOrgTeam(admin, 'user-1', 'org-1', 'team-1')).rejects.toMatchObject({
      message: 'rls denied',
    });
  });
});

describe('findOrgStandingTeam', () => {
  it('returns null when the organization has no mapped teams', async () => {
    const admin = makeAdmin({ org_teams: makeTable({ data: [], error: null }) });

    expect(await findOrgStandingTeam(admin, 'user-1', 'org-1')).toBeNull();
  });

  it('resolves the standing team and restricts it to goal_id NULL', async () => {
    const orgTeams = makeTable({ data: [{ team_id: 'team-9' }], error: null });
    const agentTeams = makeTable({ data: [{ id: 'team-9', name: 'TRAKTOR core' }], error: null });
    const admin = makeAdmin({ org_teams: orgTeams, agent_teams: agentTeams });

    const team = await findOrgStandingTeam(admin, 'user-1', 'org-1');

    expect(team).toEqual({ id: 'team-9', name: 'TRAKTOR core' });
    // goal_id NULL is what keeps the team outside migration 192's per-goal
    // uniqueness guard, so it can legitimately be reused across goals.
    expect(agentTeams.is).toHaveBeenCalledWith('goal_id', null);
    expect(agentTeams.calls.filters).toContainEqual(['is_active', true]);
    expect(agentTeams.calls.filters).toContainEqual(['user_id', 'user-1']);
  });

  it('scopes the lookup to the caller, never trusting org_id alone', async () => {
    const orgTeams = makeTable({ data: [{ team_id: 'team-9' }], error: null });
    const agentTeams = makeTable({ data: [], error: null });
    const admin = makeAdmin({ org_teams: orgTeams, agent_teams: agentTeams });

    await findOrgStandingTeam(admin, 'user-1', 'org-1');

    expect(orgTeams.calls.filters).toContainEqual(['user_id', 'user-1']);
    expect(orgTeams.calls.filters).toContainEqual(['org_id', 'org-1']);
  });

  it('returns null without an organization', async () => {
    const admin = makeAdmin({});
    expect(await findOrgStandingTeam(admin, 'user-1', null)).toBeNull();
    expect(admin.from).not.toHaveBeenCalled();
  });
});
