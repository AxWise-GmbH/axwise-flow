import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../services/organizationService', () => ({
  listOrganizations: vi.fn(async () => []),
  getOrgFinances: vi.fn(async () => ({})),
}));
vi.mock('../../services/orgTeamService', () => ({ getOrgTeamMap: vi.fn(async () => ({})) }));
vi.mock('../../services/orgAgentService', () => ({ getOrgAgentMap: vi.fn(async () => ({})) }));
vi.mock('../../services/toolService', () => ({ getAllTools: vi.fn(async () => []) }));
vi.mock('../../services/teamTaskBackend', () => ({ loadTeamTasks: vi.fn(async () => []) }));

import { listOrganizations, getOrgFinances } from '../../services/organizationService';
import { getOrgTeamMap } from '../../services/orgTeamService';
import useOrgOverview from './useOrgOverview';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useOrgOverview', () => {
  it('returns curated demo organizations without hitting the network in demo mode', () => {
    const { result } = renderHook(() => useOrgOverview({ demo: true }));
    expect(listOrganizations).not.toHaveBeenCalled();
    expect(result.current.orgs).toHaveLength(3);
    expect(result.current.orgs[0].name).toBe('Orchestratori Holding');
    expect(result.current.orgs[0].metrics.teams).toBe(12);
  });

  it('lists organizations and computes per-org metrics in live mode', async () => {
    listOrganizations.mockResolvedValueOnce([
      { id: 'o1', name: 'Acme', org_type: 'holding', parent_id: null, consilium_id: 'c1' },
      { id: 'o2', name: 'Sub', org_type: 'subsidiary', parent_id: 'o1' },
    ]);
    getOrgTeamMap.mockResolvedValueOnce({ o1: ['t1', 't2'] });
    getOrgFinances.mockResolvedValueOnce({ o1: { roi: 25, invested: 1000 } });

    const { result } = renderHook(() => useOrgOverview({ demo: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listOrganizations).toHaveBeenCalledTimes(1);

    const o1 = result.current.orgs.find((o) => o.id === 'o1');
    expect(o1.metrics.units).toBe(1); // one child (o2)
    expect(o1.metrics.teams).toBe(2);
    expect(o1.metrics.consilium).toBe(1);
    expect(o1.metrics.roi).toBe(25);
    expect(o1.metrics.invested).toBe(1000);
  });
});
