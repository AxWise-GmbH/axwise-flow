import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { getUserPrefs, setHiddenPagesPref } from '../services/userPrefsService';
import { supabase, hasSupabase } from '../lib/supabase';

// Sidebar pages the user has hidden, stored as a JSON array of route strings.
// Reactive across components (Settings panel <-> Sidebar) via a shared store,
// persisted to localStorage for instant UI and synced to the account so the
// preference follows the user across devices. Mirrors useSimpleMode.
const HIDDEN_PAGES_KEY = 'orchestratori_hidden_pages';

// Home is the landing page and can never be hidden - guard every write so a
// stale server value or a bad caller can't strip it from the sidebar.
const ALWAYS_VISIBLE = '/home';

const listeners = new Set();
function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return localStorage.getItem(HIDDEN_PAGES_KEY) || '[]';
}
function notify() {
  listeners.forEach((cb) => cb());
}

function parse(raw) {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((p) => typeof p === 'string' && p !== ALWAYS_VISIBLE) : [];
  } catch {
    return [];
  }
}

function readPaths() {
  return parse(getSnapshot());
}

let _serverSyncStarted = false;
let _lastLocalWriteAt = 0;
const LOCAL_WRITE_GUARD_MS = 30_000;

function writePaths(paths) {
  // Dedupe, drop the always-visible page, and keep only route strings.
  const clean = [...new Set(paths.filter((p) => typeof p === 'string' && p !== ALWAYS_VISIBLE))];
  _lastLocalWriteAt = Date.now();
  localStorage.setItem(HIDDEN_PAGES_KEY, JSON.stringify(clean));
  notify();
  setHiddenPagesPref(clean).catch((err) => {
    // User intent wins for this session - do NOT revert localStorage,
    // otherwise a transient 401/5xx/offline flips pages back under the user.
    console.warn('[useHiddenPages] failed to persist hidden pages to server:', err);
  });
  return clean;
}

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
    if (!Array.isArray(prefs?.hiddenPages)) return;
    const desired = JSON.stringify(
      [...new Set(prefs.hiddenPages.filter((p) => typeof p === 'string' && p !== ALWAYS_VISIBLE))]
    );
    if (getSnapshot() !== desired) {
      localStorage.setItem(HIDDEN_PAGES_KEY, desired);
      notify();
    }
  } catch {
    // Sync failed; localStorage value remains authoritative for this session.
    // Do not reset _serverSyncStarted - re-mount loops must not retry the GET,
    // which could race a recent local toggle and revert it.
  }
}

export function useHiddenPages() {
  const raw = useSyncExternalStore(subscribe, getSnapshot);
  const hiddenPages = useMemo(() => parse(raw), [raw]);

  useEffect(() => {
    syncFromServerOnce();
  }, []);

  const isPageHidden = useCallback((path) => hiddenPages.includes(path), [hiddenPages]);

  const togglePage = useCallback((path) => {
    if (!path || path === ALWAYS_VISIBLE) return;
    const current = readPaths();
    const next = current.includes(path)
      ? current.filter((p) => p !== path)
      : [...current, path];
    writePaths(next);
  }, []);

  const setHiddenPages = useCallback((paths) => {
    writePaths(Array.isArray(paths) ? paths : []);
  }, []);

  const showAll = useCallback(() => {
    writePaths([]);
  }, []);

  const hideAll = useCallback((paths) => {
    writePaths(Array.isArray(paths) ? paths : []);
  }, []);

  return { hiddenPages, isPageHidden, togglePage, setHiddenPages, showAll, hideAll };
}

// Exposed so post-login routing can re-sync after auth state changes.
export function resetHiddenPagesSync() {
  _serverSyncStarted = false;
}
