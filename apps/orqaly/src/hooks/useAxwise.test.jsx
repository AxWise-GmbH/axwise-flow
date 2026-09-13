/**
 * Tests for useAxwise - the client decision point for whether AxWise UI surfaces
 * render AND whether the integration is active for this user. Combines
 * serverEnabled (env AXWISE_ENABLE) and userEnabled (persisted per-user kill
 * switch), both from the user-prefs endpoint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { getUserPrefs, setAxwiseEnabledPref } from '../services/userPrefsService';
import { resetAxwiseSync } from './useAxwise';

vi.mock('../services/userPrefsService', () => ({
  getUserPrefs: vi.fn(),
  setAxwiseEnabledPref: vi.fn(async () => ({})),
}));

// Bypass the session check (hasSupabase returns false).
vi.mock('../lib/supabase', () => ({
  hasSupabase: () => false,
  supabase: {},
}));

const axwise = (over = {}) => ({ axwise: { serverEnabled: true, userEnabled: true, enforce: 'shadow', ...over } });

describe('useAxwise', () => {
  beforeEach(() => {
    resetAxwiseSync();
    vi.clearAllMocks();
  });

  it('isAxwiseEnabled=true when server enabled and user enabled', async () => {
    getUserPrefs.mockResolvedValue(axwise());
    const { useAxwise } = await import('./useAxwise');
    const { result } = renderHook(() => useAxwise());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.serverEnabled).toBe(true);
    expect(result.current.userEnabled).toBe(true);
    expect(result.current.isAxwiseEnabled).toBe(true);
    expect(result.current.enforce).toBe('shadow');
  });

  it('isAxwiseEnabled=false when server enabled but the user turned it off', async () => {
    getUserPrefs.mockResolvedValue(axwise({ userEnabled: false }));
    const { useAxwise } = await import('./useAxwise');
    const { result } = renderHook(() => useAxwise());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.serverEnabled).toBe(true);
    expect(result.current.userEnabled).toBe(false);
    expect(result.current.isAxwiseEnabled).toBe(false);
  });

  it('isAxwiseEnabled=false when server disabled', async () => {
    getUserPrefs.mockResolvedValue(axwise({ serverEnabled: false }));
    const { useAxwise } = await import('./useAxwise');
    const { result } = renderHook(() => useAxwise());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.serverEnabled).toBe(false);
    expect(result.current.isAxwiseEnabled).toBe(false);
  });

  it('userEnabled defaults true when the field is absent', async () => {
    getUserPrefs.mockResolvedValue({ axwise: { serverEnabled: true, enforce: 'shadow' } });
    const { useAxwise } = await import('./useAxwise');
    const { result } = renderHook(() => useAxwise());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.userEnabled).toBe(true);
    expect(result.current.isAxwiseEnabled).toBe(true);
  });

  it('surfaces the enforce mode from the server', async () => {
    getUserPrefs.mockResolvedValue(axwise({ enforce: 'authoritative' }));
    const { useAxwise } = await import('./useAxwise');
    const { result } = renderHook(() => useAxwise());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.enforce).toBe('authoritative');
  });

  it('loaded=false while fetching, loaded=true after fetch completes', async () => {
    getUserPrefs.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(axwise()), 50))
    );
    const { useAxwise } = await import('./useAxwise');
    const { result } = renderHook(() => useAxwise());
    expect(result.current.loaded).toBe(false);
    await waitFor(() => expect(result.current.loaded).toBe(true), { timeout: 200 });
    expect(result.current.isAxwiseEnabled).toBe(true);
  });

  it('remains disabled when fetch fails (default safe state)', async () => {
    getUserPrefs.mockRejectedValue(new Error('Network error'));
    const { useAxwise } = await import('./useAxwise');
    const { result } = renderHook(() => useAxwise());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current.loaded).toBe(false);
    expect(result.current.isAxwiseEnabled).toBe(false);
  });

  it('setUserEnabled optimistically flips the state and persists', async () => {
    getUserPrefs.mockResolvedValue(axwise());
    const { useAxwise } = await import('./useAxwise');
    const { result } = renderHook(() => useAxwise());
    await waitFor(() => expect(result.current.isAxwiseEnabled).toBe(true));
    await act(async () => result.current.setUserEnabled(false));
    expect(result.current.userEnabled).toBe(false);
    expect(result.current.isAxwiseEnabled).toBe(false);
    expect(setAxwiseEnabledPref).toHaveBeenCalledWith(false);
  });

  // The kill switch must never report an off state the backend doesn't have:
  // the store used to swallow this rejection, so the UI showed "Off" while the
  // backend happily kept calling AxWise for the user.
  it('setUserEnabled reverts and rethrows when the persist fails', async () => {
    getUserPrefs.mockResolvedValue(axwise());
    // Once, so the rejection can't leak into the next test: clearAllMocks resets
    // recorded calls but keeps a mockRejectedValue implementation.
    setAxwiseEnabledPref.mockRejectedValueOnce(new Error('network'));
    const { useAxwise } = await import('./useAxwise');
    const { result } = renderHook(() => useAxwise());
    await waitFor(() => expect(result.current.isAxwiseEnabled).toBe(true));

    // Caught inside act() so the revert's re-render still flushes; an act() that
    // rejects would leave the assertions reading pre-revert state.
    let caught;
    await act(async () => {
      try {
        await result.current.setUserEnabled(false);
      } catch (e) {
        caught = e;
      }
    });

    expect(caught?.message).toBe('network');
    expect(result.current.userEnabled).toBe(true);
    expect(result.current.isAxwiseEnabled).toBe(true);
  });

  // setUserEnabled used to force loaded=true. Because syncFromServer() early-
  // returns on `loaded`, a toggle taken while the flags were NOT yet loaded (say
  // the first fetch failed) permanently pinned serverEnabled=false: no later
  // mount would ever refetch, so every AxWise surface stayed hidden until reload.
  it('a toggle after a failed fetch does not pin serverEnabled false forever', async () => {
    getUserPrefs.mockRejectedValueOnce(new Error('offline'));
    const { useAxwise } = await import('./useAxwise');
    const first = renderHook(() => useAxwise());
    await waitFor(() => expect(getUserPrefs).toHaveBeenCalledTimes(1));
    expect(first.result.current.loaded).toBe(false);

    // User toggles while the flags are still unloaded.
    await act(async () => first.result.current.setUserEnabled(false));
    first.unmount();

    // A later mount must still be able to fetch the real flags.
    getUserPrefs.mockResolvedValue(axwise());
    const second = renderHook(() => useAxwise());
    await waitFor(() => expect(second.result.current.loaded).toBe(true));
    expect(second.result.current.serverEnabled).toBe(true);
  });

  it('resetAxwiseSync allows re-fetch in a new hook instance', async () => {
    getUserPrefs.mockResolvedValue(axwise());
    const { useAxwise } = await import('./useAxwise');
    const first = renderHook(() => useAxwise());
    await waitFor(() => expect(first.result.current.loaded).toBe(true));
    expect(getUserPrefs).toHaveBeenCalledTimes(1);
    renderHook(() => useAxwise());
    expect(getUserPrefs).toHaveBeenCalledTimes(1); // still 1 (sticky)
    resetAxwiseSync();
    const third = renderHook(() => useAxwise());
    await waitFor(() => expect(third.result.current.loaded).toBe(true));
    expect(getUserPrefs).toHaveBeenCalledTimes(2);
  });
});
