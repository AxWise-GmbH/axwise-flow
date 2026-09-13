import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useGoalRunView, { GOAL_RUN_VIEW_KEY, RUN_VIEWS } from './useGoalRunView';

beforeEach(() => {
  localStorage.clear();
  // The in-memory fallback is module state; reset it between cases.
  renderHook(() => useGoalRunView()).result.current.setView('thread');
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe('useGoalRunView', () => {
  it('offers exactly the two views being compared', () => {
    expect(RUN_VIEWS).toEqual(['thread', 'dashboard']);
  });

  it('defaults to the thread', () => {
    expect(renderHook(() => useGoalRunView()).result.current.view).toBe('thread');
  });

  it('remembers the choice across mounts', () => {
    const first = renderHook(() => useGoalRunView());
    act(() => first.result.current.setView('dashboard'));
    expect(localStorage.getItem(GOAL_RUN_VIEW_KEY)).toBe('dashboard');
    expect(renderHook(() => useGoalRunView()).result.current.view).toBe('dashboard');
  });

  it('keeps every consumer in step', () => {
    const a = renderHook(() => useGoalRunView());
    const b = renderHook(() => useGoalRunView());
    act(() => a.result.current.setView('dashboard'));
    expect(b.result.current.view).toBe('dashboard');
  });

  it('exposes the choice as booleans so callers do not compare strings', () => {
    const { result } = renderHook(() => useGoalRunView());
    expect(result.current.isThread).toBe(true);
    act(() => result.current.setView('dashboard'));
    expect(result.current.isDashboard).toBe(true);
    expect(result.current.isThread).toBe(false);
  });

  it('ignores a value that is not one of the two', () => {
    const { result } = renderHook(() => useGoalRunView());
    act(() => result.current.setView('nonsense'));
    expect(result.current.view).toBe('thread');
  });

  it('falls back to the thread when storage holds something stale', () => {
    localStorage.setItem(GOAL_RUN_VIEW_KEY, 'spinner');
    expect(renderHook(() => useGoalRunView()).result.current.view).toBe('thread');
  });

  // Private browsing throws on both read and write.
  it('still renders when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(renderHook(() => useGoalRunView()).result.current.view).toBe('thread');
  });

  it('still switches for the session when storage rejects a write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useGoalRunView());
    act(() => result.current.setView('dashboard'));
    // The click has to do something, even where the preference cannot persist.
    expect(result.current.view).toBe('dashboard');
  });
});
