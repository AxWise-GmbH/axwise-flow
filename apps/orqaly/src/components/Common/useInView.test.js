/**
 * useInView reveals content even when the observed element isn't mounted yet.
 *
 * Regression guard for the bug where blocks that first render a loading state
 * (so `ref.current` is null at mount) never armed the IntersectionObserver and
 * stayed `inView=false` forever — leaving staggered rows at opacity:0.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import useInView from './useInView';

beforeAll(() => {
  // Real-browser-like: IntersectionObserver exists, reduced-motion off → inView
  // starts false (so the effect path under test runs).
  globalThis.IntersectionObserver = class {
    constructor() {}
    observe() {}
    disconnect() {}
  };
  window.matchMedia = (q) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  });
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('useInView', () => {
  it('starts not-in-view in a real-browser environment', () => {
    const { result } = renderHook(() => useInView());
    expect(result.current[1]).toBe(false);
  });

  it('reveals via the fallback timer even when ref.current is null at mount', () => {
    // ref is never attached to a DOM node → el is null on mount.
    const { result } = renderHook(() => useInView());
    expect(result.current[1]).toBe(false);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(result.current[1]).toBe(true);
  });
});
