import { useEffect, useSyncExternalStore } from 'react';
import { getUserPrefs, setAxwiseEnabledPref } from '../services/userPrefsService';
import { supabase, hasSupabase } from '../lib/supabase';

// Single client decision point for whether AxWise UI surfaces render AND whether
// the integration is active for this user.
//
//   isAxwiseEnabled = serverEnabled (env hard gate) && userEnabled (per-user kill switch)
//
// serverEnabled  -> env AXWISE_ENABLE, surfaced by the user-prefs GET. Global,
//                   read-only, the hard gate.
// userEnabled    -> the user's persisted axwise_enabled pref (default true). The
//                   "AxWise overlay" master toggle writes it; when off, the
//                   backend skips AxWise entirely (pre-integration behavior) and
//                   every AxWise surface hides. Can only turn AxWise OFF.
//
// Both come from /api/app?path=user-prefs and are cached module-wide, reactive
// via a shared store (same pattern as useHiddenPages). The fetch is retried on
// failure and re-run when Supabase auth settles, so a transient error can't
// wedge AxWise's state. Writing the kill switch is optimistic (flips the store
// immediately) but REVERTS if the persist fails - a switch that silently claims
// to be off while the backend still calls AxWise is worse than an error.

let _server = { enabled: false, userEnabled: true, enforce: 'shadow', loaded: false };
let _inflight = null;
let _authSubscribed = false;

const listeners = new Set();
function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return _server;
}
function notify() {
  listeners.forEach((cb) => cb());
}

async function fetchServerFlag() {
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    // No token yet: leave loaded=false so a later attempt (auth event / next
    // mount) retries once we actually have a session.
    if (!session?.access_token) return;
  }
  const prefs = await getUserPrefs();
  const ax = prefs?.axwise || {};
  _server = {
    enabled: ax.serverEnabled === true,
    userEnabled: ax.userEnabled !== false,
    enforce: typeof ax.enforce === 'string' ? ax.enforce : 'shadow',
    loaded: true,
  };
  notify();
}

// Fetch once on success (sticky), dedupe concurrent callers, and stay retryable
// after a failure so the overlay is never permanently wedged by one bad fetch.
function syncFromServer() {
  if (_server.loaded || _inflight) return;
  _inflight = fetchServerFlag()
    .catch(() => {
      // Keep the disabled default; the next mount / auth event retries.
    })
    .finally(() => {
      _inflight = null;
    });
}

// onAuthStateChange fires immediately with INITIAL_SESSION on subscribe, then on
// later changes - each is a cue to (re)fetch with a valid token.
function ensureAuthResync() {
  if (_authSubscribed || !hasSupabase() || !supabase.auth?.onAuthStateChange) return;
  _authSubscribed = true;
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      syncFromServer();
    }
  });
}

// Optimistic per-user kill switch: flip the shared store now (all AxWise surfaces
// react at once), then persist. On failure, put the previous state back and
// rethrow - the store must never claim an off state the backend doesn't have.
//
// `loaded` is deliberately untouched: forcing it true here would pin
// serverEnabled=false forever if the toggle is hit before the first fetch lands.
// Callers gate the control on `loaded` instead, so that race can't start.
async function setUserEnabled(next) {
  const prev = _server;
  _server = { ..._server, userEnabled: next !== false };
  notify();
  try {
    await setAxwiseEnabledPref(next);
  } catch (err) {
    _server = prev;
    notify();
    throw err;
  }
}

export function useAxwise() {
  const server = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    ensureAuthResync();
    syncFromServer();
  }, []);

  const serverEnabled = server.enabled === true;
  const userEnabled = server.userEnabled !== false;
  return {
    serverEnabled,
    userEnabled,
    enforce: server.enforce,
    loaded: server.loaded,
    isAxwiseEnabled: serverEnabled && userEnabled,
    setUserEnabled,
  };
}

// Exposed so tests (and post-login routing) can force a fresh fetch.
export function resetAxwiseSync() {
  _server = { enabled: false, userEnabled: true, enforce: 'shadow', loaded: false };
  _inflight = null;
}
