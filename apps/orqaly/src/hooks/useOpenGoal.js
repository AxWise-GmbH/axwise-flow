/**
 * useOpenGoal — which goal the home surface is currently sitting inside.
 *
 * The open goal used to be plain component state on the dashboard, so it died
 * the moment you looked at any other page: coming back put you in front of an
 * empty composer, with the run you were watching reachable only through
 * History. A goal is a place you stay in until you leave it deliberately -
 * by starting a new one, or by opening a different one.
 *
 * Backed by sessionStorage rather than a module variable so a reload keeps you
 * in the goal too, and rather than localStorage so tomorrow's tab starts clean.
 * Only a real goal id is ever stored: a request that has been typed but has not
 * yet produced a goal row has nothing to come back to.
 */
import { useSyncExternalStore } from 'react';

const OPEN_GOAL_KEY = 'orchestratori_open_goal_id';

const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

/** Read outside React - the dashboard seeds its thread from this on mount. */
export function getOpenGoalId() {
  try {
    return window.sessionStorage.getItem(OPEN_GOAL_KEY) || null;
  } catch {
    // Private modes and blocked storage: the feature degrades to per-mount
    // state, which is exactly the old behaviour.
    return null;
  }
}

export function setOpenGoalId(goalId) {
  const next = typeof goalId === 'string' ? goalId.trim() : '';
  if (!next) return clearOpenGoalId();
  if (next === getOpenGoalId()) return;
  try {
    window.sessionStorage.setItem(OPEN_GOAL_KEY, next);
  } catch {
    /* ignore */
  }
  notify();
}

export function clearOpenGoalId() {
  if (getOpenGoalId() === null) return;
  try {
    window.sessionStorage.removeItem(OPEN_GOAL_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

export function useOpenGoalId() {
  return useSyncExternalStore(subscribe, getOpenGoalId, () => null);
}
