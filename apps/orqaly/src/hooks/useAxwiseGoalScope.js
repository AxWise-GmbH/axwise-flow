import { useSyncExternalStore } from 'react';

// Goal detail is often rendered as a modal while the route remains /job-pool.
// Keep that transient selection outside the router so global AxWise surfaces can
// show the opened goal's status without changing or polluting the page URL.
let selectedGoalId = null;
const listeners = new Set();

function normalizeGoalId(goalId) {
  const value = typeof goalId === 'string' ? goalId.trim() : '';
  return value || null;
}

function emit() {
  for (const listener of listeners) listener();
}

export function setAxwiseGoalScope(goalId) {
  const next = normalizeGoalId(goalId);
  if (next === selectedGoalId) return;
  selectedGoalId = next;
  emit();
}

export function clearAxwiseGoalScope(goalId) {
  const expected = normalizeGoalId(goalId);
  if (expected && selectedGoalId !== expected) return;
  setAxwiseGoalScope(null);
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return selectedGoalId;
}

export function useAxwiseGoalScope() {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
