import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { clearOpenGoalId, getOpenGoalId, setOpenGoalId, useOpenGoalId } from './useOpenGoal';

describe('useOpenGoal', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    clearOpenGoalId();
  });

  it('starts with no goal open', () => {
    const { result } = renderHook(() => useOpenGoalId());
    expect(result.current).toBeNull();
  });

  it('remembers the open goal for every reader', () => {
    const { result } = renderHook(() => useOpenGoalId());
    act(() => setOpenGoalId('g1'));
    expect(result.current).toBe('g1');
    expect(getOpenGoalId()).toBe('g1');
  });

  // The point of the whole hook: a reload, or a trip to another page and back,
  // has to land in the same goal.
  it('survives storage being read fresh, as it is on a remount', () => {
    setOpenGoalId('g1');
    expect(window.sessionStorage.getItem('orchestratori_open_goal_id')).toBe('g1');
  });

  it('replaces the open goal when another one is opened', () => {
    setOpenGoalId('g1');
    setOpenGoalId('g2');
    expect(getOpenGoalId()).toBe('g2');
  });

  it('forgets it on the way out', () => {
    setOpenGoalId('g1');
    act(() => clearOpenGoalId());
    expect(getOpenGoalId()).toBeNull();
  });

  // A request that has been typed but has not produced a goal row yet has
  // nothing to come back to, so an empty id must not be stored.
  it('stores nothing for a goal that does not exist yet', () => {
    setOpenGoalId('');
    expect(getOpenGoalId()).toBeNull();
    setOpenGoalId(null);
    expect(getOpenGoalId()).toBeNull();
  });
});
