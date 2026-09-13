import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import useMediaQuery from '@mui/material/useMediaQuery';
import { useShowMetrics } from './useShowMetrics';
import { useSimpleMode } from './useSimpleMode';

// Control the isMobile media query directly.
vi.mock('@mui/material/useMediaQuery', () => ({ default: vi.fn() }));
// Control simple/advanced mode directly (avoids its localStorage/server sync).
vi.mock('./useSimpleMode', () => ({ useSimpleMode: vi.fn() }));

function setMobile(isMobile) {
  useMediaQuery.mockReturnValue(isMobile);
}

function setSimpleMode(simpleMode) {
  useSimpleMode.mockReturnValue({ simpleMode, setSimpleMode: vi.fn(), toggleSimpleMode: vi.fn() });
}

describe('useShowMetrics', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Existing cases describe advanced-mode behaviour unless a test opts into simple.
    setSimpleMode(false);
  });

  it('defaults to shown on desktop', () => {
    setMobile(false);
    const { result } = renderHook(() => useShowMetrics('dash'));
    expect(result.current[0]).toBe(true);
  });

  it('defaults to hidden on mobile', () => {
    setMobile(true);
    const { result } = renderHook(() => useShowMetrics('dash'));
    expect(result.current[0]).toBe(false);
  });

  it('respects a stored desktop preference', () => {
    setMobile(false);
    localStorage.setItem('orch_show_metrics_dash', 'false');
    const { result } = renderHook(() => useShowMetrics('dash'));
    expect(result.current[0]).toBe(false);
  });

  it('keeps the mobile default hidden even when a desktop preference is stored', () => {
    // A legacy/desktop "shown" preference lives under the base key...
    localStorage.setItem('orch_show_metrics_dash', 'true');
    // ...but mobile reads the __mobile key, which is unset, so it stays hidden.
    setMobile(true);
    const { result } = renderHook(() => useShowMetrics('dash'));
    expect(result.current[0]).toBe(false);
  });

  it('persists an explicit toggle to the device-specific key only', () => {
    setMobile(true);
    const { result } = renderHook(() => useShowMetrics('dash'));

    act(() => result.current[1](true));

    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem('orch_show_metrics_dash__mobile')).toBe('true');
    // The desktop key must remain untouched.
    expect(localStorage.getItem('orch_show_metrics_dash')).toBeNull();
  });

  it('supports functional updates like useState', () => {
    setMobile(false);
    const { result } = renderHook(() => useShowMetrics('dash'));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1]((prev) => !prev));
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem('orch_show_metrics_dash')).toBe('false');
  });

  it('defaults to hidden in simple mode on desktop', () => {
    setSimpleMode(true);
    setMobile(false);
    const { result } = renderHook(() => useShowMetrics('dash'));
    expect(result.current[0]).toBe(false);
  });

  it('lets an explicit "shown" preference win over the simple-mode default', () => {
    setSimpleMode(true);
    setMobile(false);
    localStorage.setItem('orch_show_metrics_dash', 'true');
    const { result } = renderHook(() => useShowMetrics('dash'));
    expect(result.current[0]).toBe(true);
  });
});
