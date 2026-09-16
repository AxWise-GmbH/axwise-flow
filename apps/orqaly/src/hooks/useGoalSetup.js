/**
 * useGoalSetup — the workspace and executor the next goal will be created with.
 *
 * Session-only and deliberately outside React state. The same choice has to be
 * readable from the dashboard hero composer (where a goal is typed before it
 * exists) and from SmartRequestDialog (which creates it), and those two are not
 * in a parent/child relationship on every screen. Threading props through
 * HeroPromptInput and the dialog would put the goal's destination in two places
 * that can disagree; a module store keeps one answer.
 *
 * Not persisted, matching the assistant's session-scoped org scope: a workspace
 * chosen for one goal should not silently become the default for tomorrow's.
 */
import { useSyncExternalStore } from 'react';

const EMPTY = Object.freeze({ orgId: null, target: null });

let state = EMPTY;
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

function normalizeId(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

/** Pick the workspace. Changing it drops the target: a team belongs to one org. */
export function setGoalSetupOrg(orgId) {
  const next = normalizeId(orgId);
  if (next === state.orgId) return;
  state = { orgId: next, target: null };
  emit();
}

/**
 * Pick who runs it. `null` (or an 'organization' target) means the whole
 * workspace, which is what a goal gets when nothing is picked.
 */
export function setGoalSetupTarget(target) {
  const next =
    target?.type && target?.id && target.type !== 'organization'
      ? { type: target.type, id: String(target.id), label: target.label || '' }
      : null;
  if (next?.type === state.target?.type && next?.id === state.target?.id) return;
  state = { ...state, target: next };
  emit();
}

export function resetGoalSetup() {
  if (state === EMPTY) return;
  state = EMPTY;
  emit();
}

/** Read outside React (submit paths that must not re-render to see the value). */
export function getGoalSetup() {
  return state;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function useGoalSetup() {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
