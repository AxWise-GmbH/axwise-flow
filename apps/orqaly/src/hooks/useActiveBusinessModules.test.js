/**
 * useActiveBusinessModules — DB-backed activation with a per-user localStorage cache.
 * Modules are reset per test because the hook keeps a module-level store.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const svc = vi.hoisted(() => ({
  listModules: vi.fn(),
  activateModule: vi.fn(),
  deactivateModule: vi.fn(),
  toggleModule: vi.fn(),
}));
const supa = vi.hoisted(() => ({
  hasSupabase: vi.fn(() => true),
  getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-a' } } } })),
}));

vi.mock('../services/businessModuleService', () => svc);
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: supa.getSession } },
  hasSupabase: supa.hasSupabase,
}));

const KEY_A = 'orchestratori_active_business_modules:user-a';
const KEY_B = 'orchestratori_active_business_modules:user-b';
const LEGACY_KEY = 'orchestratori_active_business_modules';

async function loadHook() {
  vi.resetModules();
  return await import('./useActiveBusinessModules.js');
}

function signedInAs(uid) {
  supa.getSession.mockResolvedValue({ data: { session: { user: { id: uid } } } });
}

beforeEach(() => {
  localStorage.clear();
  svc.listModules.mockReset().mockResolvedValue([]);
  svc.activateModule.mockReset().mockResolvedValue({ module_id: 'partners', active: true });
  svc.deactivateModule.mockReset().mockResolvedValue({ module_id: 'partners', active: false });
  supa.hasSupabase.mockReturnValue(true);
  signedInAs('user-a');
});
afterEach(() => vi.clearAllMocks());

describe('useActiveBusinessModules', () => {
  it('hydrates active modules from the DB on mount', async () => {
    svc.listModules.mockResolvedValue([
      { module_id: 'partners', active: true },
      { module_id: 'gambling', active: false },
    ]);
    const { useActiveBusinessModules: useHook } = await loadHook();
    const { result } = renderHook(() => useHook());
    await waitFor(() => expect(result.current.isModuleActive('partners')).toBe(true));
    expect(result.current.isModuleActive('gambling')).toBe(false);
  });

  it('activate is optimistic and writes through to the API', async () => {
    const { useActiveBusinessModules: useHook } = await loadHook();
    const { result } = renderHook(() => useHook());
    await waitFor(() => expect(svc.listModules).toHaveBeenCalled());
    act(() => result.current.activateModule('partners'));
    expect(result.current.isModuleActive('partners')).toBe(true); // optimistic, synchronous
    await waitFor(() => expect(svc.activateModule).toHaveBeenCalledWith('partners'));
    expect(JSON.parse(localStorage.getItem(KEY_A))).toContain('partners');
  });

  it('keeps activation even when the API write fails (no rollback)', async () => {
    svc.activateModule.mockRejectedValue(new Error('network'));
    const { useActiveBusinessModules: useHook } = await loadHook();
    const { result } = renderHook(() => useHook());
    await waitFor(() => expect(svc.listModules).toHaveBeenCalled());
    act(() => result.current.activateModule('partners'));
    expect(result.current.isModuleActive('partners')).toBe(true);
    await waitFor(() => expect(svc.activateModule).toHaveBeenCalledWith('partners'));
    // Still active after the write rejects — the API failure must not hide pages.
    expect(result.current.isModuleActive('partners')).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY_A))).toContain('partners');
  });

  it('hydrate preserves a locally-active module the DB does not know yet (failed write retry)', async () => {
    // Same user's own cache: an activation whose DB write never landed.
    localStorage.setItem(KEY_A, JSON.stringify(['gambling']));
    svc.listModules.mockResolvedValue([]); // DB has no row for it
    const { useActiveBusinessModules: useHook } = await loadHook();
    const { result } = renderHook(() => useHook());
    await waitFor(() => expect(svc.listModules).toHaveBeenCalled());
    // gambling must survive the empty-DB hydrate, and get retried to the DB.
    await waitFor(() => expect(result.current.isModuleActive('gambling')).toBe(true));
    await waitFor(() => expect(svc.activateModule).toHaveBeenCalledWith('gambling'));
  });

  it('hydrate does not resurrect a module the DB knows as inactive', async () => {
    localStorage.setItem(KEY_A, JSON.stringify(['gambling']));
    svc.listModules.mockResolvedValue([{ module_id: 'gambling', active: false }]);
    const { useActiveBusinessModules: useHook } = await loadHook();
    const { result } = renderHook(() => useHook());
    await waitFor(() => expect(svc.listModules).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isModuleActive('gambling')).toBe(false));
  });

  it('works from localStorage only when Supabase is not configured', async () => {
    supa.hasSupabase.mockReturnValue(false);
    const { useActiveBusinessModules: useHook } = await loadHook();
    const { result } = renderHook(() => useHook());
    act(() => result.current.toggleModule('partners'));
    expect(result.current.isModuleActive('partners')).toBe(true);
    expect(svc.listModules).not.toHaveBeenCalled();
    expect(svc.activateModule).not.toHaveBeenCalled();
  });
});

/**
 * The reported bug: signing in as a second account in the same browser showed
 * that account the first account's PARTNERS nav — and hydrate() then uploaded
 * it to the new user's DB row, making the bleed permanent.
 */
describe('useActiveBusinessModules — cross-user isolation', () => {
  it('does not leak one user cached modules into another user session', async () => {
    // user-a has partners active and cached.
    localStorage.setItem(KEY_A, JSON.stringify(['partners']));
    // user-b signs in on the same browser; their DB has no rows at all.
    signedInAs('user-b');
    svc.listModules.mockResolvedValue([]);

    const { useActiveBusinessModules: useHook } = await loadHook();
    const { result } = renderHook(() => useHook());
    await waitFor(() => expect(svc.listModules).toHaveBeenCalled());

    // No read bleed: user-b must not see user-a's module.
    expect(result.current.isModuleActive('partners')).toBe(false);
    // No write bleed: user-a's module must not be uploaded to user-b's row.
    expect(svc.activateModule).not.toHaveBeenCalled();
    // user-a's cache is untouched.
    expect(JSON.parse(localStorage.getItem(KEY_A))).toEqual(['partners']);
  });

  it('keeps each user cache under its own key', async () => {
    const { useActiveBusinessModules: useHook } = await loadHook();
    const { result } = renderHook(() => useHook());
    await waitFor(() => expect(svc.listModules).toHaveBeenCalled());
    act(() => result.current.activateModule('partners'));
    await waitFor(() => expect(localStorage.getItem(KEY_A)).toBeTruthy());
    expect(localStorage.getItem(KEY_B)).toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('drops the legacy un-namespaced key rather than importing it', async () => {
    // Cannot be attributed to any uid, so it must not become this user's state.
    localStorage.setItem(LEGACY_KEY, JSON.stringify(['partners']));
    svc.listModules.mockResolvedValue([]);
    const { useActiveBusinessModules: useHook } = await loadHook();
    const { result } = renderHook(() => useHook());
    await waitFor(() => expect(svc.listModules).toHaveBeenCalled());
    expect(result.current.isModuleActive('partners')).toBe(false);
    expect(svc.activateModule).not.toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('reads nothing and hydrates nothing when signed out', async () => {
    supa.getSession.mockResolvedValue({ data: { session: null } });
    localStorage.setItem(KEY_A, JSON.stringify(['partners']));
    const { useActiveBusinessModules: useHook } = await loadHook();
    const { result } = renderHook(() => useHook());
    await Promise.resolve();
    expect(result.current.isModuleActive('partners')).toBe(false);
    expect(svc.listModules).not.toHaveBeenCalled();
  });

  it('resetActiveBusinessModules clears state so the next user starts empty', async () => {
    svc.listModules.mockResolvedValue([{ module_id: 'partners', active: true }]);
    const mod = await loadHook();
    const { result } = renderHook(() => mod.useActiveBusinessModules());
    await waitFor(() => expect(result.current.isModuleActive('partners')).toBe(true));
    act(() => mod.resetActiveBusinessModules());
    expect(result.current.isModuleActive('partners')).toBe(false);
  });
});
