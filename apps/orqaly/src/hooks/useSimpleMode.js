import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { getUserPrefs, setUiMode } from '../services/userPrefsService';
import { supabase, hasSupabase } from '../lib/supabase';

const SIMPLE_MODE_KEY = 'orchestratori_simple_mode';

// Shared listeners for cross-component sync
const listeners = new Set();
function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  const stored = localStorage.getItem(SIMPLE_MODE_KEY);
  // Unset preference defaults to card/block view (simple mode), not table-heavy admin UI.
  return stored === null ? 'true' : stored;
}
function notify() {
  listeners.forEach((cb) => cb());
}

let _serverSyncStarted = false;
let _lastLocalWriteAt = 0;
const LOCAL_WRITE_GUARD_MS = 30_000;

async function syncFromServerOnce() {
  if (_serverSyncStarted) return;
  _serverSyncStarted = true;
  try {
    if (hasSupabase()) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
    }
    const prefs = await getUserPrefs();
    if (Date.now() - _lastLocalWriteAt < LOCAL_WRITE_GUARD_MS) return;
    // NULL ui_mode on server = card view default for regular users.
    const desired = !prefs?.uiMode || prefs.uiMode === 'simple' ? 'true' : 'false';
    const stored = localStorage.getItem(SIMPLE_MODE_KEY);
    if (stored !== desired) {
      localStorage.setItem(SIMPLE_MODE_KEY, desired);
      notify();
    }
  } catch {
    // Sync failed; localStorage value remains authoritative for this session.
    // Do not reset _serverSyncStarted - re-mount loops must not retry the GET,
    // which could race a recent local toggle and revert it.
  }
}

export function useSimpleMode() {
  const raw = useSyncExternalStore(subscribe, getSnapshot);
  const simpleMode = raw === 'true';

  useEffect(() => {
    syncFromServerOnce();
  }, []);

  const persist = useCallback((value) => {
    const next = String(!!value);
    _lastLocalWriteAt = Date.now();
    localStorage.setItem(SIMPLE_MODE_KEY, next);
    notify();
    setUiMode(value ? 'simple' : 'advanced').catch((err) => {
      // User intent wins for this session - do NOT revert localStorage,
      // otherwise a transient 401/5xx/offline flips the UI back under the user.
      console.warn('[useSimpleMode] failed to persist uiMode to server:', err);
    });
  }, []);

  const setSimpleMode = useCallback(
    (next) => {
      const value = typeof next === 'function' ? next(getSnapshot() === 'true') : next;
      persist(!!value);
    },
    [persist]
  );

  const toggleSimpleMode = useCallback(() => {
    const current = getSnapshot() === 'true';
    persist(!current);
  }, [persist]);

  return { simpleMode, setSimpleMode, toggleSimpleMode };
}

// Exposed so post-login routing can re-sync after auth state changes.
export function resetSimpleModeSync() {
  _serverSyncStarted = false;
}

export async function fetchUiModeFromServer() {
  try {
    const prefs = await getUserPrefs();
    if (!prefs?.uiMode) return 'simple';
    return prefs.uiMode;
  } catch {
    return 'simple';
  }
}
