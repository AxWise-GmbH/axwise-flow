import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDocSearch } from './useDocSearch';
import { buildDocSearchIndex } from '../data/searchIndex';

const index = buildDocSearchIndex();

describe('useDocSearch', () => {
  it('returns no results for an empty or too-short query', () => {
    const { result } = renderHook(() => useDocSearch(index));
    expect(result.current.results).toEqual([]);
    act(() => result.current.setQuery('a'));
    expect(result.current.results).toEqual([]);
  });

  it('finds ranked matches after the debounce', async () => {
    const { result } = renderHook(() => useDocSearch(index));
    act(() => result.current.setQuery('consilium'));
    await waitFor(() => expect(result.current.results.length).toBeGreaterThan(0));
    expect(
      result.current.results.some(
        (r) => r.tab === 'consilium' || r.title.toLowerCase().includes('consilium')
      )
    ).toBe(true);
  });

  it('matches a provider name and clears back to empty', async () => {
    const { result } = renderHook(() => useDocSearch(index));
    act(() => result.current.setQuery('groq'));
    await waitFor(() =>
      expect(result.current.results.some((r) => r.title.toLowerCase().includes('groq'))).toBe(true)
    );
    act(() => result.current.clear());
    expect(result.current.query).toBe('');
    await waitFor(() => expect(result.current.results).toEqual([]));
  });
});
