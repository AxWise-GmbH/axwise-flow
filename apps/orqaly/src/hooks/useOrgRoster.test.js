import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/orgTeamService', () => ({ getOrgTeams: vi.fn() }));
vi.mock('../services/orgAgentService', () => ({ getOrgAgents: vi.fn() }));
vi.mock('../services/conciliumTeamsService', () => ({
  getAllAgentTeams: vi.fn(),
  getAllTeams: vi.fn(),
}));
vi.mock('../services/agentHubService', () => ({ getAgents: vi.fn() }));
vi.mock('../services/conciliumService', () => ({ getAllConcilium: vi.fn() }));

import { getOrgTeams } from '../services/orgTeamService';
import { getOrgAgents } from '../services/orgAgentService';
import { getAllAgentTeams, getAllTeams } from '../services/conciliumTeamsService';
import { getAgents } from '../services/agentHubService';
import { getAllConcilium } from '../services/conciliumService';
import { loadOrgRoster, useOrgRoster } from './useOrgRoster';

const ORGS = [{ id: 'o1', name: 'Acme', consilium_id: 'c1' }];

beforeEach(() => {
  vi.clearAllMocks();
  getOrgTeams.mockResolvedValue(['t1']);
  getOrgAgents.mockResolvedValue(['a1']);
  getAllAgentTeams.mockResolvedValue([{ id: 't1', name: 'Ops', leader_id: 'lead1' }]);
  getAllTeams.mockResolvedValue([{ id: 't-unassigned', name: 'Other' }]);
  getAgents.mockReturnValue([
    { id: 'lead1', name: 'Lead One' },
    { agent_id: 'a1', name: 'Worker' },
    { agent_id: 'a2', name: 'Not assigned' },
  ]);
  getAllConcilium.mockResolvedValue([{ id: 'c1', name: 'Board A' }]);
});

describe('loadOrgRoster', () => {
  it('keeps only the teams and agents assigned to the organization', async () => {
    const roster = await loadOrgRoster({ orgId: 'o1', orgs: ORGS });
    expect(roster.teams.map((t) => t.id)).toEqual(['t1']);
    expect(roster.agents.map((a) => a.agent_id)).toEqual(['a1']);
  });

  it('resolves the board governing the organization', async () => {
    const roster = await loadOrgRoster({ orgId: 'o1', orgs: ORGS });
    expect(roster.consilium).toMatchObject({ id: 'c1', name: 'Board A' });
  });

  // An assignment pointing at a board row that is gone is still a real
  // assignment; dropping it would read as "this workspace has no board".
  it('shows an assigned board by id when its row is missing', async () => {
    getAllConcilium.mockResolvedValue([]);
    const roster = await loadOrgRoster({ orgId: 'o1', orgs: ORGS });
    expect(roster.consilium).toEqual({ id: 'c1', name: 'c1' });
  });

  it('offers the whole organization, its teams, leads, agents and board as targets', async () => {
    const roster = await loadOrgRoster({ orgId: 'o1', orgs: ORGS });
    expect(roster.targets.map((t) => t.type)).toEqual([
      'organization',
      'team',
      'team_lead',
      'agent',
      'consilium',
    ]);
  });

  it('returns nothing for no organization instead of querying', async () => {
    const roster = await loadOrgRoster({ orgId: '', orgs: ORGS });
    expect(roster.targets).toEqual([]);
    expect(getOrgTeams).not.toHaveBeenCalled();
  });
});

describe('useOrgRoster', () => {
  it('loads the roster and reports when it is done', async () => {
    const { result } = renderHook(() => useOrgRoster('o1', ORGS));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.roster.teams).toHaveLength(1);
  });

  it('survives a failing lookup with an empty roster', async () => {
    getAllConcilium.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useOrgRoster('o1', ORGS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // getAllConcilium is caught inside loadOrgRoster, so the rest still resolves.
    expect(result.current.roster.teams).toHaveLength(1);
    expect(result.current.roster.consilium).toEqual({ id: 'c1', name: 'c1' });
  });
});
