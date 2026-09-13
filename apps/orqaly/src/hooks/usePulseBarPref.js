import { useCallback, useMemo, useSyncExternalStore } from 'react';

// Persisted preferences for AxWise UI surfaces, shared reactively across the
// Settings toggle, MainLayout, and the bar itself (useSyncExternalStore + a
// shared store, same pattern as useHiddenPages). localStorage-only: this is a
// per-device developer/observability preference, no account sync needed.
//
//   { visible: boolean, hidden: boolean, view: 'collapsed' | 'expanded' | 'minimized' }
//
// visible -> master switch for ALL AxWise surfaces (PulseBar, /axwise-analytics
//            route, Audit Log AxWise tab). Combined with the backend enable flag
//            in useAxwise(). Off = the whole overlay is gone.
// hidden  -> sub-toggle for the bar only (Settings > Pages hides just the strip).
// view    -> in-bar state: collapsed (one line, default), expanded (event list),
//            minimized (tiny corner pill so it stays out of the way while working).
const PREF_KEY = 'orchestratori_pulsebar_pref';
const DEFAULT = { visible: true, hidden: false, view: 'collapsed' };
const VIEWS = new Set(['collapsed', 'expanded', 'minimized']);

const listeners = new Set();
function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return localStorage.getItem(PREF_KEY) || '';
}
function notify() {
  listeners.forEach((cb) => cb());
}

function parse(raw) {
  if (!raw) return DEFAULT;
  try {
    const obj = JSON.parse(raw);
    return {
      // Back-compat: an older stored object without `visible` defaults to true
      // so existing users keep the overlay they had before this field existed.
      visible: typeof obj?.visible === 'boolean' ? obj.visible : DEFAULT.visible,
      hidden: typeof obj?.hidden === 'boolean' ? obj.hidden : DEFAULT.hidden,
      view: VIEWS.has(obj?.view) ? obj.view : DEFAULT.view,
    };
  } catch {
    return DEFAULT;
  }
}

function write(next) {
  localStorage.setItem(PREF_KEY, JSON.stringify(next));
  notify();
}

export function usePulseBarPref() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => '');
  const pref = useMemo(() => parse(raw), [raw]);

  const setHidden = useCallback((hidden) => {
    const current = parse(getSnapshot());
    write({ ...current, hidden: Boolean(hidden) });
  }, []);

  const toggleHidden = useCallback(() => {
    const current = parse(getSnapshot());
    write({ ...current, hidden: !current.hidden });
  }, []);

  const setView = useCallback((view) => {
    if (!VIEWS.has(view)) return;
    const current = parse(getSnapshot());
    write({ ...current, view });
  }, []);

  const setVisible = useCallback((visible) => {
    const current = parse(getSnapshot());
    write({ ...current, visible: Boolean(visible) });
  }, []);

  const toggleVisible = useCallback(() => {
    const current = parse(getSnapshot());
    write({ ...current, visible: !current.visible });
  }, []);

  return {
    visible: pref.visible,
    hidden: pref.hidden,
    view: pref.view,
    setHidden,
    toggleHidden,
    setView,
    setVisible,
    toggleVisible,
  };
}
