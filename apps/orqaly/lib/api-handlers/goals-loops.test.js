/**
 * Tests for handleLoops — the Home / Requests "loops" feed: looped goals with
 * their looping agent (team lead) resolved, with an Unassigned fallback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { handleLoops, handleUpdateLoopSettings } from './goals.js';

const user = { id: 'user-1' };

function makeAdmin({ goals = [], teams = [], agents = [], chainSpend = [] } = {}) {
  const goalsTable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: goals, error: null }),
  };
  const teamsTable = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: teams, error: null }),
  };
  const agentsTable = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: agents, error: null }),
  };
  const chainTable = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: chainSpend, error: null }),
  };
  const tables = { goals: goalsTable, agent_teams: teamsTable, agents: agentsTable, chain_spend_v: chainTable };
  return { from: (t) => tables[t], _tables: tables };
}

describe('handleLoops', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an empty list when no looped goals exist', async () => {
    const admin = makeAdmin({ goals: [] });
    const result = await handleLoops(admin, user);
    expect(result.status).toBe(200);
    expect(result.data).toEqual([]);
    // No lead resolution when there are no goals.
    expect(admin._tables.agent_teams.in).not.toHaveBeenCalled();
  });

  it('resolves the team lead agent for a looped goal', async () => {
    const admin = makeAdmin({
      goals: [{ id: 'g1', title: 'Grow revenue', status: 'active', iteration: 3, max_iterations: 5, loop_enabled: true, loop_paused: false, created_at: '2026-06-01T10:00:00Z' }],
      teams: [{ goal_id: 'g1', leader_id: 'a1' }],
      agents: [{ id: 'a1', name: 'Growth Agent', category: 'growth' }],
    });
    const result = await handleLoops(admin, user);
    expect(result.status).toBe(200);
    expect(result.data).toHaveLength(1);
    const row = result.data[0];
    expect(row).toMatchObject({
      loop_id: 'g1',
      goal_id: 'g1',
      goal_title: 'Grow revenue',
      agent_id: 'a1',
      agent_name: 'Growth Agent',
      agent_role: 'growth',
      loops: 3,
      max_loops: 5,
      status: 'active',
      loop_enabled: true,
      loop_paused: false,
      started_at: '2026-06-01T10:00:00Z',
    });
  });

  it('falls back to Unassigned when a goal has no team lead', async () => {
    const admin = makeAdmin({
      goals: [{ id: 'g2', title: 'Untitled', status: 'paused', iteration: 1, max_iterations: 0, loop_enabled: false, loop_paused: true, created_at: '2026-06-02T10:00:00Z' }],
      teams: [],
      agents: [],
    });
    const result = await handleLoops(admin, user);
    const row = result.data[0];
    expect(row.agent_id).toBeNull();
    expect(row.agent_name).toBe('Unassigned');
    expect(row.agent_role).toBe('');
    expect(row.loops).toBe(1);
  });

  it('scopes the goals query to the authenticated user', async () => {
    const admin = makeAdmin({ goals: [] });
    await handleLoops(admin, user);
    expect(admin._tables.goals.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('surfaces advanced-control fields and chain spend per row', async () => {
    const admin = makeAdmin({
      goals: [{
        id: 'g1', title: 'Grow', status: 'completed', iteration: 2, max_iterations: 5,
        loop_enabled: true, loop_paused: true, loop_paused_reason: 'chain_budget_cap',
        loop_advanced: true, loop_settings: { chain_budget_cap_usd: 20, hitl_every: 3 },
        loop_depth: 4, loop_chain_root_id: 'root-1', budget_usd: 10,
        created_at: '2026-06-01T10:00:00Z',
      }],
      chainSpend: [{ chain_root_id: 'root-1', spent_usd: 23.5, goal_count: 5, max_depth: 4 }],
    });
    const row = (await handleLoops(admin, user)).data[0];
    expect(row).toMatchObject({
      loop_advanced: true,
      loop_paused_reason: 'chain_budget_cap',
      loop_depth: 4,
      chain_spend_usd: 23.5,
    });
    expect(row.loop_settings).toEqual({ chain_budget_cap_usd: 20, hitl_every: 3 });
  });
});

// ── handleUpdateLoopSettings ────────────────────────────────────────

function makeSettingsAdmin({ goal = null } = {}) {
  const updates = [];
  return {
    from(table) {
      if (table !== 'goals') throw new Error(`unmocked ${table}`);
      return {
        select: () => ({
          eq: function () { return this; },
          single: async () => ({ data: goal, error: null }),
        }),
        update(patch) {
          return { eq: (_c, id) => { updates.push({ id, patch }); return Promise.resolve({ error: null }); } };
        },
      };
    },
    __debug: { updates },
  };
}

describe('handleUpdateLoopSettings', () => {
  it('persists loop_advanced and shallow-merges loop_settings', async () => {
    const admin = makeSettingsAdmin({ goal: { id: 'g1', loop_advanced: false, loop_settings: { convergence_min_gain: 5 } } });
    const result = await handleUpdateLoopSettings(admin, user, { id: 'g1' }, {
      id: 'g1', loop_advanced: true, loop_settings: { hitl_every: 2 },
    });
    expect(result.status).toBe(200);
    const patch = admin.__debug.updates[0].patch;
    expect(patch.loop_advanced).toBe(true);
    expect(patch.loop_settings).toEqual({ convergence_min_gain: 5, hitl_every: 2 });
  });

  it('rejects a goal the user does not own (404)', async () => {
    const admin = makeSettingsAdmin({ goal: null });
    const result = await handleUpdateLoopSettings(admin, user, { id: 'nope' }, { id: 'nope', loop_advanced: true });
    expect(result.status).toBe(404);
  });

  it('rejects an empty patch', async () => {
    const admin = makeSettingsAdmin({ goal: { id: 'g1' } });
    const result = await handleUpdateLoopSettings(admin, user, { id: 'g1' }, { id: 'g1' });
    expect(result.status).toBe(400);
  });

  it('rejects out-of-range settings', async () => {
    const admin = makeSettingsAdmin({ goal: { id: 'g1' } });
    const result = await handleUpdateLoopSettings(admin, user, { id: 'g1' }, {
      id: 'g1', loop_settings: { convergence_min_gain: 500 },
    });
    expect(result.status).toBe(400);
  });
});
