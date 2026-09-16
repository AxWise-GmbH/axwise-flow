import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/userPrefsService', () => ({
  getUserPrefs: vi.fn(),
  setHiddenPagesPref: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
  hasSupabase: vi.fn(),
}));

const HIDDEN_PAGES_KEY = 'orchestratori_hidden_pages';

async function loadHook() {
  vi.resetModules();
  return import('./useHiddenPages');
}

describe('useHiddenPages', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    const { hasSupabase } = await import('../lib/supabase');
    hasSupabase.mockReturnValue(false);
    const { setHiddenPagesPref, getUserPrefs } = await import('../services/userPrefsService');
    setHiddenPagesPref.mockResolvedValue({});
    getUserPrefs.mockResolvedValue({ hiddenPages: [] });
  });

  it('defaults to no hidden pages', async () => {
    const { useHiddenPages } = await loadHook();
    const { result } = renderHook(() => useHiddenPages());
    expect(result.current.hiddenPages).toEqual([]);
  });

  it('togglePage hides then shows a page, persisting to localStorage and the server', async () => {
    const { setHiddenPagesPref } = await import('../services/userPrefsService');
    const { useHiddenPages } = await loadHook();
    const { result } = renderHook(() => useHiddenPages());

    act(() => result.current.togglePage('/campaigns'));
    expect(result.current.hiddenPages).toEqual(['/campaigns']);
    expect(JSON.parse(localStorage.getItem(HIDDEN_PAGES_KEY))).toEqual(['/campaigns']);
    await waitFor(() => expect(setHiddenPagesPref).toHaveBeenCalledWith(['/campaigns']));

    act(() => result.current.togglePage('/campaigns'));
    expect(result.current.hiddenPages).toEqual([]);
    expect(JSON.parse(localStorage.getItem(HIDDEN_PAGES_KEY))).toEqual([]);
    await waitFor(() => expect(setHiddenPagesPref).toHaveBeenLastCalledWith([]));
  });

  it('never stores /home even if asked to hide it', async () => {
    const { useHiddenPages } = await loadHook();
    const { result } = renderHook(() => useHiddenPages());

    act(() => result.current.togglePage('/home'));
    expect(result.current.hiddenPages).toEqual([]);

    act(() => result.current.setHiddenPages(['/home', '/data']));
    expect(result.current.hiddenPages).toEqual(['/data']);
  });

  it('showAll clears and hideAll sets the hidden set', async () => {
    const { useHiddenPages } = await loadHook();
    const { result } = renderHook(() => useHiddenPages());

    act(() => result.current.hideAll(['/campaigns', '/data', '/home']));
    expect(result.current.hiddenPages).toEqual(['/campaigns', '/data']);

    act(() => result.current.showAll());
    expect(result.current.hiddenPages).toEqual([]);
  });

  it('isPageHidden reflects the current set', async () => {
    const { useHiddenPages } = await loadHook();
    const { result } = renderHook(() => useHiddenPages());
    act(() => result.current.togglePage('/data'));
    expect(result.current.isPageHidden('/data')).toBe(true);
    expect(result.current.isPageHidden('/campaigns')).toBe(false);
  });

  it('does NOT revert localStorage when the server PUT fails', async () => {
    const { setHiddenPagesPref } = await import('../services/userPrefsService');
    setHiddenPagesPref.mockRejectedValue(new Error('network down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { useHiddenPages } = await loadHook();
    const { result } = renderHook(() => useHiddenPages());

    act(() => result.current.togglePage('/campaigns'));
    expect(JSON.parse(localStorage.getItem(HIDDEN_PAGES_KEY))).toEqual(['/campaigns']);

    await waitFor(() => expect(setHiddenPagesPref).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));

    expect(JSON.parse(localStorage.getItem(HIDDEN_PAGES_KEY))).toEqual(['/campaigns']);
    expect(result.current.hiddenPages).toEqual(['/campaigns']);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('adopts the server value on first sync when no recent local write', async () => {
    const { getUserPrefs } = await import('../services/userPrefsService');
    getUserPrefs.mockResolvedValue({ hiddenPages: ['/data', '/campaigns'] });

    const { useHiddenPages } = await loadHook();
    const { result } = renderHook(() => useHiddenPages());

    await waitFor(() => expect(getUserPrefs).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(HIDDEN_PAGES_KEY))).toEqual(['/data', '/campaigns'])
    );
    expect(result.current.hiddenPages).toEqual(['/data', '/campaigns']);
  });

  it('syncFromServerOnce does not clobber a fresh local toggle (race guard)', async () => {
    const { getUserPrefs } = await import('../services/userPrefsService');
    let resolveGet;
    getUserPrefs.mockReturnValue(
      new Promise((res) => {
        resolveGet = res;
      })
    );

    const { useHiddenPages } = await loadHook();
    const { result } = renderHook(() => useHiddenPages());

    // User toggles before the sync GET resolves.
    act(() => result.current.togglePage('/data'));
    expect(JSON.parse(localStorage.getItem(HIDDEN_PAGES_KEY))).toEqual(['/data']);

    // Stale server value arrives after the local write.
    resolveGet({ hiddenPages: [] });
    await new Promise((r) => setTimeout(r, 0));

    expect(JSON.parse(localStorage.getItem(HIDDEN_PAGES_KEY))).toEqual(['/data']);
    expect(result.current.hiddenPages).toEqual(['/data']);
  });

  it('failed initial sync does not re-trigger on subsequent mounts', async () => {
    const { getUserPrefs } = await import('../services/userPrefsService');
    getUserPrefs.mockRejectedValue(new Error('boom'));

    const { useHiddenPages } = await loadHook();

    const first = renderHook(() => useHiddenPages());
    await waitFor(() => expect(getUserPrefs).toHaveBeenCalledTimes(1));
    first.unmount();

    const second = renderHook(() => useHiddenPages());
    await new Promise((r) => setTimeout(r, 0));
    second.unmount();

    expect(getUserPrefs).toHaveBeenCalledTimes(1);
  });
});
