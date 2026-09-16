import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useArenaLayout, { ARENA_LAYOUT_KEY, ARENA_LAYOUTS } from './useArenaLayout';

beforeEach(() => {
  localStorage.clear();
  // The in-memory fallback is module state; reset it between cases.
  const reset = renderHook(() => useArenaLayout());
  act(() => reset.result.current.setLayout('split'));
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

/**
 * A pristine copy of the module, with the in-memory fallback still unset.
 * Needed for the cases that assert what happens when localStorage is the only
 * source — once setLayout has run, memory wins and storage is never read.
 */
async function freshHook() {
  vi.resetModules();
  const mod = await import('./useArenaLayout');
  return renderHook(() => mod.default());
}

describe('useArenaLayout', () => {
  it('offers exactly the two shapes a job card can take', () => {
    expect(ARENA_LAYOUTS).toEqual(['split', 'stacked']);
  });

  it('starts side by side', () => {
    const { result } = renderHook(() => useArenaLayout());
    expect(result.current.layout).toBe('split');
    expect(result.current.isSplit).toBe(true);
    expect(result.current.isStacked).toBe(false);
  });

  it('remembers the choice for next time', () => {
    const { result } = renderHook(() => useArenaLayout());
    act(() => result.current.setLayout('stacked'));
    expect(result.current.isStacked).toBe(true);
    expect(localStorage.getItem(ARENA_LAYOUT_KEY)).toBe('stacked');
  });

  it('reads a stored choice back on a later visit', async () => {
    localStorage.setItem(ARENA_LAYOUT_KEY, 'stacked');
    const { result } = await freshHook();
    expect(result.current.layout).toBe('stacked');
  });

  it('ignores a stored value that is not a real layout', async () => {
    localStorage.setItem(ARENA_LAYOUT_KEY, 'diagonal');
    const { result } = await freshHook();
    expect(result.current.layout).toBe('split');
  });

  it('survives storage that throws on read, as in private browsing', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { result } = await freshHook();
    expect(result.current.layout).toBe('split');
  });

  it('ignores a layout it does not recognise', () => {
    const { result } = renderHook(() => useArenaLayout());
    act(() => result.current.setLayout('diagonal'));
    expect(result.current.layout).toBe('split');
  });

  it('keeps working for the session when storage throws on write', () => {
    const { result } = renderHook(() => useArenaLayout());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    act(() => result.current.setLayout('stacked'));
    expect(result.current.isStacked).toBe(true);
  });

  it('moves every consumer together, so a switch and the cards never disagree', () => {
    const a = renderHook(() => useArenaLayout());
    const b = renderHook(() => useArenaLayout());
    act(() => a.result.current.setLayout('stacked'));
    expect(b.result.current.layout).toBe('stacked');
  });
});
