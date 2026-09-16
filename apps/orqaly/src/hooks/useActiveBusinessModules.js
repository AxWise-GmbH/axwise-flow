import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { hasSupabase, supabase } from '../lib/supabase';
import {
  listModules,
  activateModule as apiActivate,
  deactivateModule as apiDeactivate,
} from '../services/businessModuleService';

/**
 * Active ready-business modules.
 *
 * Backed by the database (`user_business_modules` via business-modules API) so
 * activation persists server-side and syncs across devices. localStorage is
 * kept as a first-paint / offline cache, and is the sole store when Supabase is
 * not configured (local dev without a backend).
 *
 * The cache key is namespaced per user id. It used to be a single per-browser
 * key, which meant signing in as a second account inherited the first account's
 * modules — and hydrate() then treated them as the new user's own local-only
 * activations and uploaded them to their DB row, making the bleed permanent.
 * Namespacing is fail-safe by construction: an unknown uid cannot read another
 * uid's entry no matter how the previous session ended (sign-out, expiry, tab
 * crash, OAuth redirect). The cache's value is skipping the network, not a
 * microtask, so resolving identity first costs nothing.
 *
 * The exported surface is unchanged from the previous version so consumers
 * (Sidebar, MarketplaceBusinessesTab) need no changes.
 */
const LEGACY_KEY = 'orchestratori_active_business_modules';
const KEY_PREFIX = 'orchestratori_active_business_modules:';
const DEFAULT_ACTIVE = '[]';

const listeners = new Set();
let cacheKey = null; // null until identity resolves; no cache read/write before then
let snapshot = DEFAULT_ACTIVE;
let hydrated = false;
let hydrating = null;
let initialising = null;

function readCache() {
  if (typeof localStorage === 'undefined' || !cacheKey) return DEFAULT_ACTIVE;
  return localStorage.getItem(cacheKey) || DEFAULT_ACTIVE;
}

function writeCache(ids) {
  if (typeof localStorage === 'undefined' || !cacheKey) return;
  localStorage.setItem(cacheKey, JSON.stringify(ids));
}

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return snapshot;
}
function notify() {
  listeners.forEach((cb) => cb());
}

// Replace the snapshot string only when it actually changes (useSyncExternalStore
// requires a stable reference between renders when nothing changed).
function setActiveIds(ids) {
  const next = JSON.stringify(ids);
  if (next === snapshot) return;
  snapshot = next;
  writeCache(ids);
  notify();
}

function parseIds(raw) {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function currentIds() {
  return parseIds(snapshot);
}

// 'local' when there is no backend (localStorage is then the only store);
// otherwise the signed-in user's id, or null when signed out.
async function resolveIdentity() {
  if (!hasSupabase()) return 'local';
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// Hydrate from the DB once per session, reconciling with the localStorage cache.
//
// The DB is the source of truth for modules it has a row for. Modules active in
// this user's own cache but unknown to the DB are preserved AND uploaded — that
// is a retry for a write that failed offline, not a migration from another user:
// the cache is per-uid, so `localOnly` can only ever contain this user's own
// activations. Falls back silently to the cache when the request fails.
function hydrate() {
  if (hydrated || hydrating || !hasSupabase()) return;
  const before = snapshot; // detect a toggle that races with this read
  const localActive = currentIds();
  hydrating = listModules()
    .then((rows) => {
      const list = rows || [];
      const dbActive = list.filter((r) => r.active).map((r) => r.module_id);
      const dbKnown = new Set(list.map((r) => r.module_id));
      const localOnly = localActive.filter((id) => !dbKnown.has(id));
      const merged = Array.from(new Set([...dbActive, ...localOnly]));
      // Only apply if no local toggle happened while the request was in flight.
      if (snapshot === before) setActiveIds(merged);
      // Best-effort retry of activations the DB has not recorded yet.
      localOnly.forEach((id) => apiActivate(id).catch(() => {}));
      hydrated = true;
    })
    .catch(() => {
      /* keep the cached value; a later toggle will retry the write */
    })
    .finally(() => {
      hydrating = null;
    });
}

function init() {
  if (cacheKey || initialising) return;
  const before = snapshot; // detect a toggle that races with identity resolution
  initialising = resolveIdentity()
    .then((identity) => {
      // Signed out: no identity, so no cache to trust and nothing to hydrate.
      if (!identity) return;
      cacheKey = KEY_PREFIX + identity;
      // The pre-namespace key cannot be attributed to any uid, so it is dropped
      // rather than imported. Importing it when the DB has no rows is exactly
      // the new-user bleed this fix removes.
      try {
        localStorage.removeItem(LEGACY_KEY);
      } catch {
        /* ignore storage access issues */
      }
      if (snapshot === before) {
        setActiveIds(parseIds(readCache()));
      } else {
        // A toggle landed before identity resolved; persist it rather than
        // clobbering it with the cache we only just became able to read.
        writeCache(currentIds());
      }
      hydrate();
    })
    .catch(() => {})
    .finally(() => {
      initialising = null;
    });
}

/**
 * Drop all in-memory and cached module state.
 *
 * Namespacing keeps one user from reading another's cache, but the module-level
 * snapshot/hydrated singletons survive an SPA user switch with no page reload —
 * so AuthContext calls this on sign-out and on a switch.
 */
export function resetActiveBusinessModules() {
  cacheKey = null;
  snapshot = DEFAULT_ACTIVE;
  hydrated = false;
  hydrating = null;
  initialising = null;
  notify();
}

export function useActiveBusinessModules() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const activeModules = JSON.parse(raw);

  useEffect(() => {
    init();
  }, []);

  const isModuleActive = useCallback(
    (moduleId) => activeModules.includes(moduleId),
    [activeModules]
  );

  // Activation is optimistic (always sticks, like the other business modules);
  // the DB write is best-effort. We deliberately do NOT roll back on a failed
  // write — an unreachable/slow API must never hide the user's pages.
  const activateModule = useCallback((moduleId) => {
    const ids = currentIds();
    if (ids.includes(moduleId)) return;
    setActiveIds([...ids, moduleId]);
    if (hasSupabase()) apiActivate(moduleId).catch(() => {});
  }, []);

  const deactivateModule = useCallback((moduleId) => {
    const ids = currentIds();
    if (!ids.includes(moduleId)) return;
    setActiveIds(ids.filter((id) => id !== moduleId));
    if (hasSupabase()) apiDeactivate(moduleId).catch(() => {});
  }, []);

  const toggleModule = useCallback(
    (moduleId) => {
      if (currentIds().includes(moduleId)) deactivateModule(moduleId);
      else activateModule(moduleId);
    },
    [activateModule, deactivateModule]
  );

  return { activeModules, isModuleActive, toggleModule, activateModule, deactivateModule };
}
