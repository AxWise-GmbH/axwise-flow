import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../services/organizationService', () => ({ listOrganizations: vi.fn() }));
vi.mock('../../services/conciliumService', () => ({ getAllConcilium: vi.fn() }));
vi.mock('../../services/conciliumTeamsService', () => ({ getAllTeams: vi.fn() }));

import { listOrganizations } from '../../services/organizationService';
import { getAllConcilium } from '../../services/conciliumService';
import { getAllTeams } from '../../services/conciliumTeamsService';
import { useOrgProgress } from './useOrgProgress';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  listOrganizations.mockResolvedValue([]);
  getAllConcilium.mockResolvedValue([]);
  getAllTeams.mockResolvedValue([]);
});

describe('useOrgProgress', () => {
  it('does not fetch when disabled and reports zero progress', () => {
    const { result } = renderHook(() => useOrgProgress({ enabled: false }));
    expect(listOrganizations).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ completed: 0, total: 4, loading: false });
  });

  it('counts all four milestone signals when present', async () => {
    localStorage.setItem('orch_assistant_active', 'true');
    listOrganizations.mockResolvedValue([{ id: 'o1' }]);
    getAllConcilium.mockResolvedValue([{ id: 'b1' }]);
    getAllTeams.mockResolvedValue([{ id: 't1' }]);
    const { result } = renderHook(() => useOrgProgress({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.completed).toBe(4);
    expect(result.current.total).toBe(4);
    expect(result.current.allDone).toBe(true);
  });

  it('counts only the organization when other signals are empty', async () => {
    listOrganizations.mockResolvedValue([{ id: 'o1' }]);
    const { result } = renderHook(() => useOrgProgress({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.completed).toBe(1);
    expect(result.current.allDone).toBe(false);
  });
});
