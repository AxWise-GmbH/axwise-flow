import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/organizationService', () => ({
  listOrganizations: vi.fn().mockResolvedValue([{ id: 'o1', name: 'Acme', consilium_id: 'c1' }]),
}));
vi.mock('../services/orgTeamService', () => ({
  getOrgTeams: vi.fn().mockResolvedValue(['t1']),
}));
vi.mock('../services/orgAgentService', () => ({
  getOrgAgents: vi.fn().mockResolvedValue(['a1']),
}));
vi.mock('../services/conciliumTeamsService', () => ({
  getAllAgentTeams: vi.fn().mockResolvedValue([{ id: 't1', name: 'Ops', leader_id: 'lead1' }]),
  getAllTeams: vi.fn().mockResolvedValue([]),
}));
vi.mock('../services/agentHubService', () => ({
  getAgents: vi.fn().mockReturnValue([
    { id: 'lead1', name: 'Lead One' },
    { agent_id: 'a1', name: 'Worker' },
  ]),
}));
vi.mock('../services/conciliumService', () => ({
  getAllConcilium: vi.fn().mockResolvedValue([{ id: 'c1', name: 'Board A' }]),
}));
vi.mock('../services/goalService', () => ({
  createGoal: vi.fn().mockResolvedValue({ id: 'g1' }),
}));
vi.mock('../services/communicatorService', () => ({
  getOrgCommunicationTimeline: vi.fn().mockResolvedValue({ events: [], scope: {} }),
  addLog: vi.fn().mockResolvedValue({}),
}));
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'you@test.com' } } }),
    },
  },
}));

import { createGoal } from '../services/goalService';
import { useOrgCommander } from './useOrgCommander';

describe('useOrgCommander dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps team target to team executor', async () => {
    const { result } = renderHook(() => useOrgCommander());
    await waitFor(() => expect(result.current.orgs.length).toBe(1));

    await act(async () => {
      await result.current.dispatch({
        orgId: 'o1',
        target: { type: 'team', id: 't1', label: 'Team: Ops' },
        command: 'Run weekly report',
      });
    });

    expect(createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: 'o1',
        executor_type: 'team',
        executor_id: 't1',
      })
    );
  });

  it('maps consilium target to concilium executor', async () => {
    const { result } = renderHook(() => useOrgCommander());
    await waitFor(() => expect(result.current.orgs.length).toBe(1));

    await act(async () => {
      await result.current.dispatch({
        orgId: 'o1',
        target: { type: 'consilium', id: 'c1', label: 'Consilium: Board A' },
        command: 'Review policy',
      });
    });

    expect(createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        executor_type: 'consilium',
        concilium_id: 'c1',
        executor_id: null,
      })
    );
  });
});
