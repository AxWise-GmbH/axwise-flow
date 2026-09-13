import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'orqaly_arena_layout';
export const ARENA_LAYOUTS = ['split', 'stacked'];
const DEFAULT_LAYOUT = 'split';

// Shared so a switch and every job card re-render together, mirroring the
// pattern useGoalRunView already uses for a cross-component preference.
const listeners = new Set();

// Private browsing throws on both read and write. Hold the choice here so the
// switch still works for the session, it just does not survive a reload.
let memoryLayout = null;

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  if (memoryLayout) return memoryLayout;
  try {
    const stored = localStorage.getItem(KEY);
    return ARENA_LAYOUTS.includes(stored) ? stored : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function getServerSnapshot() {
  return DEFAULT_LAYOUT;
}

/**
 * Whether the two corners of a job sit side by side or one under the other.
 *
 * Per-browser and deliberately not synced to the server: it is a viewing
 * preference, not a property of the work. Narrow screens and Simple mode force
 * stacked regardless — the page computes that and disables the switch, so the
 * control never claims to do something it cannot.
 */
export default function useArenaLayout() {
  const layout = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLayout = useCallback((next) => {
    if (!ARENA_LAYOUTS.includes(next)) return;
    memoryLayout = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Kept in memory instead; lost on reload, but the switch still works.
    }
    listeners.forEach((cb) => cb());
  }, []);

  return { layout, setLayout, isSplit: layout === 'split', isStacked: layout === 'stacked' };
}

export { KEY as ARENA_LAYOUT_KEY };
