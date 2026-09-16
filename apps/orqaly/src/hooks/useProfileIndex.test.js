import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/agentProfileService', () => ({ listProfiles: vi.fn() }));
vi.mock('../config/predefinedAgentProfiles', () => ({
  PREDEFINED_AGENT_PROFILES: [{ agent_id: 'fallback', display_name: 'Fallback Agent' }],
}));

import { listProfiles } from '../services/agentProfileService';
import useProfileIndex from './useProfileIndex';

beforeEach(() => vi.clearAllMocks());

describe('useProfileIndex', () => {
  it('starts null so a consumer renders before profiles land', () => {
    listProfiles.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useProfileIndex());
    expect(result.current).toBeNull();
  });

  it('indexes the profiles it loaded', async () => {
    listProfiles.mockResolvedValue([{ agent_id: 'a1', display_name: 'Iris Vance' }]);
    const { result } = renderHook(() => useProfileIndex());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.byId.get('a1').display_name).toBe('Iris Vance');
  });

  // A fresh account has no saved profiles; bare role strings would be a
  // worse result than the predefined identities.
  it('falls back to the predefined profiles on an empty list', async () => {
    listProfiles.mockResolvedValue([]);
    const { result } = renderHook(() => useProfileIndex());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.byId.get('fallback')).toBeDefined();
  });

  it('falls back to the predefined profiles when the load fails', async () => {
    listProfiles.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useProfileIndex());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.byId.get('fallback')).toBeDefined();
  });

  it('does not fetch until it is needed', () => {
    renderHook(() => useProfileIndex(false));
    expect(listProfiles).not.toHaveBeenCalled();
  });

  it('ignores a load that lands after unmount', async () => {
    let resolve;
    listProfiles.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    const { unmount } = renderHook(() => useProfileIndex());
    unmount();
    resolve([{ agent_id: 'late' }]);
    await Promise.resolve();
    // No act() warning and no state update on an unmounted hook.
    expect(listProfiles).toHaveBeenCalledTimes(1);
  });
});
