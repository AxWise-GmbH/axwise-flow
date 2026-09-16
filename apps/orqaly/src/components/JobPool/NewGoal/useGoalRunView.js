import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'orqaly_goal_run_view';
export const RUN_VIEWS = ['thread', 'dashboard'];
const DEFAULT_VIEW = 'thread';

// Shared so both a selector and a consumer re-render together, mirroring the
// pattern useSimpleMode already uses for a cross-component preference.
const listeners = new Set();

// Private browsing throws on both read and write. Hold the choice here so the
// selector still works for the session, it just does not survive a reload.
let memoryView = null;

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  if (memoryView) return memoryView;
  try {
    const stored = localStorage.getItem(KEY);
    return RUN_VIEWS.includes(stored) ? stored : DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
}

function getServerSnapshot() {
  return DEFAULT_VIEW;
}

/**
 * Which shape a running goal takes: the thread it was written in, or the
 * four-tab dashboard.
 *
 * Both ship so the two can be compared on real runs rather than from a mockup.
 * The choice is per-browser and deliberately not synced to the server: it is a
 * viewing preference, not a property of the goal.
 */
export default function useGoalRunView() {
  const view = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setView = useCallback((next) => {
    if (!RUN_VIEWS.includes(next)) return;
    memoryView = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Kept in memory instead; lost on reload, but the switch still works.
    }
    listeners.forEach((cb) => cb());
  }, []);

  return { view, setView, isThread: view === 'thread', isDashboard: view === 'dashboard' };
}

export { KEY as GOAL_RUN_VIEW_KEY };
