import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePulseBarPref } from './usePulseBarPref';

const KEY = 'orchestratori_pulsebar_pref';

describe('usePulseBarPref', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('defaults to visible + collapsed', () => {
    const { result } = renderHook(() => usePulseBarPref());
    expect(result.current.hidden).toBe(false);
    expect(result.current.view).toBe('collapsed');
  });

  it('persists hidden across hook instances', () => {
    const first = renderHook(() => usePulseBarPref());
    act(() => first.result.current.setHidden(true));
    expect(JSON.parse(localStorage.getItem(KEY)).hidden).toBe(true);

    const second = renderHook(() => usePulseBarPref());
    expect(second.result.current.hidden).toBe(true);
  });

  it('toggles hidden', () => {
    const { result } = renderHook(() => usePulseBarPref());
    act(() => result.current.toggleHidden());
    expect(result.current.hidden).toBe(true);
    act(() => result.current.toggleHidden());
    expect(result.current.hidden).toBe(false);
  });

  it('sets a valid view and rejects an invalid one', () => {
    const { result } = renderHook(() => usePulseBarPref());
    act(() => result.current.setView('minimized'));
    expect(result.current.view).toBe('minimized');
    act(() => result.current.setView('bogus'));
    expect(result.current.view).toBe('minimized'); // unchanged
  });

  it('recovers from corrupt localStorage', () => {
    localStorage.setItem(KEY, '{not json');
    const { result } = renderHook(() => usePulseBarPref());
    expect(result.current.hidden).toBe(false);
    expect(result.current.view).toBe('collapsed');
  });

  describe('visible field', () => {
    it('defaults to true when no stored preference exists', () => {
      const { result } = renderHook(() => usePulseBarPref());
      expect(result.current.visible).toBe(true);
    });

    it('persists visible=false across hook instances', () => {
      const first = renderHook(() => usePulseBarPref());
      act(() => first.result.current.setVisible(false));
      expect(JSON.parse(localStorage.getItem(KEY)).visible).toBe(false);

      const second = renderHook(() => usePulseBarPref());
      expect(second.result.current.visible).toBe(false);
    });

    it('toggles visible', () => {
      const { result } = renderHook(() => usePulseBarPref());
      expect(result.current.visible).toBe(true);
      act(() => result.current.toggleVisible());
      expect(result.current.visible).toBe(false);
      act(() => result.current.toggleVisible());
      expect(result.current.visible).toBe(true);
    });

    it('back-compat: an older stored object without visible defaults to true', () => {
      // Pre-visible shape: no visible field stored.
      localStorage.setItem(KEY, JSON.stringify({ hidden: true, view: 'collapsed' }));
      const { result } = renderHook(() => usePulseBarPref());
      expect(result.current.visible).toBe(true);
      expect(result.current.hidden).toBe(true);
      expect(result.current.view).toBe('collapsed');
    });

    it('back-compat: visible=false is preserved after upgrade when explicitly set', () => {
      // A user who explicitly turned off visible.
      localStorage.setItem(KEY, JSON.stringify({ visible: false, hidden: false, view: 'collapsed' }));
      const { result } = renderHook(() => usePulseBarPref());
      expect(result.current.visible).toBe(false);
    });

    it('persists visible alongside hidden and view', () => {
      const { result } = renderHook(() => usePulseBarPref());
      act(() => {
        result.current.setVisible(false);
        result.current.setHidden(true);
        result.current.setView('minimized');
      });
      const stored = JSON.parse(localStorage.getItem(KEY));
      expect(stored.visible).toBe(false);
      expect(stored.hidden).toBe(true);
      expect(stored.view).toBe('minimized');
    });
  });
});
