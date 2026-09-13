import { describe, it, expect, vi, beforeEach } from 'vitest';

const tableData = vi.hoisted(() => ({ current: {} }));

vi.mock('../lib/supabase', () => {
  // Thenable builder: select/eq/in all return the builder, which resolves to
  // { data } for its table when awaited.
  const makeBuilder = (table) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      then: (resolve) => resolve({ data: tableData.current[table] ?? [], error: null }),
    };
    return builder;
  };
  return {
    hasSupabase: () => true,
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: (table) => makeBuilder(table),
    },
  };
});

import { getAgentEmployment, getAgentEmploymentMap } from './agentEmploymentService';

beforeEach(() => {
  tableData.current = {};
});

describe('getAgentEmployment', () => {
  it('returns empty when the agent has no assignments', async () => {
    tableData.current = { org_agents: [], agent_team_members: [] };
    const res = await getAgentEmployment('a1');
    expect(res).toEqual({ orgs: [], teams: [] });
  });

  it('enriches org assignments with org name, consilium name, and assigned date', async () => {
    tableData.current = {
      org_agents: [{ org_id: 'o1', created_at: '2026-03-31T00:00:00Z' }],
      organizations: [{ id: 'o1', name: 'Orqaly Inc.', consilium_id: 'b1' }],
      concilium: [{ id: 'b1', name: 'Main Consilium' }],
      agent_team_members: [],
    };
    const res = await getAgentEmployment('a1');
    expect(res.orgs).toEqual([
      {
        org_id: 'o1',
        org_name: 'Orqaly Inc.',
        consilium_id: 'b1',
        consilium_name: 'Main Consilium',
        assigned_at: '2026-03-31T00:00:00Z',
      },
    ]);
  });

  it('returns null consilium_name when the org has no board', async () => {
    tableData.current = {
      org_agents: [{ org_id: 'o1', created_at: '2026-03-31T00:00:00Z' }],
      organizations: [{ id: 'o1', name: 'Traktor', consilium_id: null }],
      agent_team_members: [],
    };
    const res = await getAgentEmployment('a1');
    expect(res.orgs[0].consilium_id).toBeNull();
    expect(res.orgs[0].consilium_name).toBeNull();
  });

  it('returns team memberships with role and join date', async () => {
    tableData.current = {
      org_agents: [],
      agent_team_members: [{ team_id: 't1', role: 'lead', joined_at: '2026-04-01T00:00:00Z' }],
      agent_teams: [{ id: 't1', name: 'Growth Pod' }],
    };
    const res = await getAgentEmployment('a1');
    expect(res.teams).toEqual([
      { team_id: 't1', team_name: 'Growth Pod', role: 'lead', joined_at: '2026-04-01T00:00:00Z' },
    ]);
  });
});

describe('getAgentEmploymentMap', () => {
  it('returns {} for no ids', async () => {
    expect(await getAgentEmploymentMap([])).toEqual({});
  });

  it('keys enriched org rows by agent_id', async () => {
    tableData.current = {
      org_agents: [
        { agent_id: 'a1', org_id: 'o1', created_at: '2026-03-31T00:00:00Z' },
        { agent_id: 'a2', org_id: 'o1', created_at: '2026-04-02T00:00:00Z' },
      ],
      organizations: [{ id: 'o1', name: 'Orqaly Inc.', consilium_id: 'b1' }],
      concilium: [{ id: 'b1', name: 'Main Consilium' }],
    };
    const map = await getAgentEmploymentMap(['a1', 'a2', 'a3']);
    expect(map.a1).toEqual([
      {
        org_id: 'o1',
        org_name: 'Orqaly Inc.',
        consilium_id: 'b1',
        consilium_name: 'Main Consilium',
        assigned_at: '2026-03-31T00:00:00Z',
      },
    ]);
    expect(map.a2[0].org_name).toBe('Orqaly Inc.');
    expect(map.a3).toBeUndefined();
  });
});
