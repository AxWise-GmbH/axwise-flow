import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useSetupSections from './useSetupSections';

describe('useSetupSections - single', () => {
  it('opens the section it was given at mount, and nothing else', () => {
    const { result } = renderHook(() => useSetupSections({ initial: 'keys' }));
    expect(result.current.isExpanded('keys')).toBe(true);
    expect(result.current.isExpanded('data')).toBe(false);
  });

  it('opens one section by closing the last', () => {
    const { result } = renderHook(() => useSetupSections({ initial: 'keys' }));
    act(() => result.current.toggle('data', true));
    expect(result.current.isExpanded('data')).toBe(true);
    expect(result.current.isExpanded('keys')).toBe(false);
  });

  it('closes the open section, leaving none open', () => {
    const { result } = renderHook(() => useSetupSections({ initial: 'keys' }));
    act(() => result.current.toggle('keys', false));
    expect(result.current.isExpanded('keys')).toBe(false);
  });

  it('starts with nothing open when given no initial section', () => {
    const { result } = renderHook(() => useSetupSections());
    expect(result.current.isExpanded('keys')).toBe(false);
  });
});

describe('useSetupSections - multi', () => {
  // The point of the inverted state: everything is open before the hook has
  // been told a single key exists, so a panel cannot paint with its content
  // hidden while it waits to be configured.
  it('reports every section expanded at mount without being told the keys', () => {
    const { result } = renderHook(() => useSetupSections({ mode: 'multi' }));
    ['org', 'board', 'workforce', 'axwise', 'anything-at-all'].forEach((key) => {
      expect(result.current.isExpanded(key)).toBe(true);
    });
  });

  it('collapses one section and leaves the rest alone', () => {
    const { result } = renderHook(() => useSetupSections({ mode: 'multi' }));
    act(() => result.current.toggle('board', false));
    expect(result.current.isExpanded('board')).toBe(false);
    expect(result.current.isExpanded('org')).toBe(true);
  });

  it('round-trips a section back open', () => {
    const { result } = renderHook(() => useSetupSections({ mode: 'multi' }));
    act(() => result.current.toggle('board', false));
    act(() => result.current.toggle('board', true));
    expect(result.current.isExpanded('board')).toBe(true);
  });

  it('holds several sections collapsed at once', () => {
    const { result } = renderHook(() => useSetupSections({ mode: 'multi' }));
    act(() => result.current.toggle('org', false));
    act(() => result.current.toggle('axwise', false));
    expect(result.current.isExpanded('org')).toBe(false);
    expect(result.current.isExpanded('axwise')).toBe(false);
    expect(result.current.isExpanded('board')).toBe(true);
  });
});
