import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/userPrefsService', () => ({
  getUserPrefs: vi.fn(),
  setUiMode: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
  hasSupabase: vi.fn(),
}));

const SIMPLE_MODE_KEY = 'orchestratori_simple_mode';

async function loadHook() {
  vi.resetModules();
  return import('./useSimpleMode');
}

describe('useSimpleMode', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    const { hasSupabase } = await import('../lib/supabase');
    hasSupabase.mockReturnValue(false);
  });

  it('toggleSimpleMode flips the persisted value and notifies subscribers', async () => {
    const { setUiMode, getUserPrefs } = await import('../services/userPrefsService');
    setUiMode.mockResolvedValue({});
    getUserPrefs.mockResolvedValue({ uiMode: null });

    const { useSimpleMode } = await loadHook();
    const { result } = renderHook(() => useSimpleMode());

    expect(result.current.simpleMode).toBe(true);

    act(() => result.current.toggleSimpleMode());
    expect(result.current.simpleMode).toBe(false);
    expect(localStorage.getItem(SIMPLE_MODE_KEY)).toBe('false');
    await waitFor(() => expect(setUiMode).toHaveBeenCalledWith('advanced'));

    act(() => result.current.toggleSimpleMode());
    expect(result.current.simpleMode).toBe(true);
    expect(localStorage.getItem(SIMPLE_MODE_KEY)).toBe('true');
    await waitFor(() => expect(setUiMode).toHaveBeenLastCalledWith('simple'));
  });

  it('does NOT revert localStorage when the server PUT fails (regression: switch-back bug)', async () => {
    const { setUiMode, getUserPrefs } = await import('../services/userPrefsService');
    getUserPrefs.mockResolvedValue({ uiMode: null });
    // Server PUT rejects - the user's intent must still win for this session.
    setUiMode.mockRejectedValue(new Error('network down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    localStorage.setItem(SIMPLE_MODE_KEY, 'true'); // start in simple mode

    const { useSimpleMode } = await loadHook();
    const { result } = renderHook(() => useSimpleMode());

    expect(result.current.simpleMode).toBe(true);

    // Toggle simple -> advanced.
    act(() => result.current.toggleSimpleMode());
    expect(result.current.simpleMode).toBe(false);
    expect(localStorage.getItem(SIMPLE_MODE_KEY)).toBe('false');

    await waitFor(() => expect(setUiMode).toHaveBeenCalledWith('advanced'));
    // Give the rejection a tick to propagate.
    await new Promise((r) => setTimeout(r, 0));

    // The bug was: catch reverted localStorage back to 'true'. Must stay 'false'.
    expect(localStorage.getItem(SIMPLE_MODE_KEY)).toBe('false');
    expect(result.current.simpleMode).toBe(false);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('syncFromServerOnce does not overwrite a fresh local toggle (race guard)', async () => {
    const { setUiMode, getUserPrefs } = await import('../services/userPrefsService');
    setUiMode.mockResolvedValue({});
    // Server returns the STALE value (simple) - the user has just toggled to advanced locally.
    let resolveGet;
    getUserPrefs.mockReturnValue(
      new Promise((res) => {
        resolveGet = res;
      })
    );

    localStorage.setItem(SIMPLE_MODE_KEY, 'true'); // start in simple mode

    const { useSimpleMode } = await loadHook();
    const { result } = renderHook(() => useSimpleMode());

    // User toggles before the sync GET resolves.
    act(() => result.current.toggleSimpleMode());
    expect(localStorage.getItem(SIMPLE_MODE_KEY)).toBe('false');

    // Now the slow GET resolves with the stale server value.
    resolveGet({ uiMode: 'simple' });
    await new Promise((r) => setTimeout(r, 0));

    // The guard must prevent the stale GET from clobbering the recent local write.
    expect(localStorage.getItem(SIMPLE_MODE_KEY)).toBe('false');
    expect(result.current.simpleMode).toBe(false);
  });

  it('failed initial sync does not re-trigger on subsequent mounts', async () => {
    const { setUiMode, getUserPrefs } = await import('../services/userPrefsService');
    setUiMode.mockResolvedValue({});
    getUserPrefs.mockRejectedValue(new Error('boom'));

    const { useSimpleMode } = await loadHook();

    const first = renderHook(() => useSimpleMode());
    await waitFor(() => expect(getUserPrefs).toHaveBeenCalledTimes(1));
    first.unmount();

    const second = renderHook(() => useSimpleMode());
    // Give the useEffect a chance to run.
    await new Promise((r) => setTimeout(r, 0));
    second.unmount();

    // Sync should not retry - one call total for the page load.
    expect(getUserPrefs).toHaveBeenCalledTimes(1);
  });

  it('resetSimpleModeSync allows a fresh sync (used by post-login flow)', async () => {
    const { setUiMode, getUserPrefs } = await import('../services/userPrefsService');
    setUiMode.mockResolvedValue({});
    getUserPrefs.mockResolvedValue({ uiMode: 'simple' });

    const mod = await loadHook();
    const { useSimpleMode, resetSimpleModeSync } = mod;

    const first = renderHook(() => useSimpleMode());
    await waitFor(() => expect(getUserPrefs).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(localStorage.getItem(SIMPLE_MODE_KEY)).toBe('true'));
    first.unmount();

    // Simulate post-login: explicit reset re-enables sync.
    resetSimpleModeSync();
    localStorage.clear();

    const second = renderHook(() => useSimpleMode());
    await waitFor(() => expect(getUserPrefs).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(localStorage.getItem(SIMPLE_MODE_KEY)).toBe('true'));
    second.unmount();
  });
});
