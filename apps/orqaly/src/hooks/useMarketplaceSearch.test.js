import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useMarketplaceSearch from './useMarketplaceSearch';

const ITEMS = [
  { name: 'Alpha', category: 'a', provider: 'groq', status: 'online', tags: ['x', 'y'] },
  { name: 'Bravo', category: 'b', provider: 'openai', status: 'offline', tags: ['y', 'z'] },
  { name: 'Charlie', category: 'a', provider: 'groq', status: 'online', tags: ['z'] },
  { name: 'Delta', category: 'c', provider: 'anthropic', status: 'busy' }, // no tags
];

const FACETS = [
  { key: 'provider', label: 'Provider', field: 'provider' },
  { key: 'status', label: 'Status', field: 'status' },
  { key: 'tags', label: 'Tags', field: 'tags', array: true },
];

function names(result) {
  return result.current.filteredItems.map((i) => i.name).sort();
}

describe('useMarketplaceSearch — backward compatibility', () => {
  it('single-select category filter still works with the 3-arg call', () => {
    const { result } = renderHook(() =>
      useMarketplaceSearch(ITEMS, ['name'], 'category')
    );
    expect(result.current.resultCount).toBe(4);
    act(() => result.current.setCategoryFilter('a'));
    expect(names(result)).toEqual(['Alpha', 'Charlie']);
  });

  it('resetFilters clears the legacy category filter', () => {
    const { result } = renderHook(() =>
      useMarketplaceSearch(ITEMS, ['name'], 'category')
    );
    act(() => result.current.setCategoryFilter('a'));
    act(() => result.current.resetFilters());
    expect(result.current.resultCount).toBe(4);
    expect(result.current.categoryFilter).toBe('');
  });

  it('does not apply facets when none are configured', () => {
    const { result } = renderHook(() =>
      useMarketplaceSearch(ITEMS, ['name'], 'category')
    );
    expect(result.current.facets).toEqual([]);
    expect(result.current.facetKey).toBe('{}');
  });
});

describe('useMarketplaceSearch — facets', () => {
  const render = () =>
    renderHook(() => useMarketplaceSearch(ITEMS, ['name'], 'category', { facets: FACETS }));

  it('scalar facet OR-s selected values within the facet', () => {
    const { result } = render();
    act(() => result.current.toggleFacetValue('provider', 'groq'));
    expect(names(result)).toEqual(['Alpha', 'Charlie']);
    act(() => result.current.toggleFacetValue('provider', 'anthropic'));
    expect(names(result)).toEqual(['Alpha', 'Charlie', 'Delta']);
  });

  it('AND-s different facets together', () => {
    const { result } = render();
    act(() => {
      result.current.toggleFacetValue('provider', 'groq');
      result.current.toggleFacetValue('status', 'online');
    });
    expect(names(result)).toEqual(['Alpha', 'Charlie']);
    act(() => result.current.toggleFacetValue('status', 'offline'));
    // provider groq AND (status online OR offline) -> still both groq items (both online)
    expect(names(result)).toEqual(['Alpha', 'Charlie']);
  });

  it('array facet matches ANY selected value by default', () => {
    const { result } = render();
    act(() => result.current.toggleFacetValue('tags', 'z'));
    expect(names(result)).toEqual(['Bravo', 'Charlie']);
    act(() => result.current.toggleFacetValue('tags', 'x'));
    // tag x OR z
    expect(names(result)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('array facet with matchAll requires ALL selected values', () => {
    const matchAllFacets = [{ key: 'tags', label: 'Tags', field: 'tags', array: true, matchAll: true }];
    const { result } = renderHook(() =>
      useMarketplaceSearch(ITEMS, ['name'], 'category', { facets: matchAllFacets })
    );
    act(() => {
      result.current.toggleFacetValue('tags', 'y');
      result.current.toggleFacetValue('tags', 'z');
    });
    // only Bravo has both y and z
    expect(names(result)).toEqual(['Bravo']);
  });

  it('toggleFacetValue adds then removes, dropping the key when empty', () => {
    const { result } = render();
    act(() => result.current.toggleFacetValue('provider', 'groq'));
    expect(result.current.facetFilters).toEqual({ provider: ['groq'] });
    act(() => result.current.toggleFacetValue('provider', 'groq'));
    expect(result.current.facetFilters).toEqual({});
    expect(result.current.resultCount).toBe(4);
  });

  it('an inactive (empty) facet is a no-op', () => {
    const { result } = render();
    expect(result.current.resultCount).toBe(4);
    expect(result.current.facetKey).toBe('{}');
  });

  it('items missing the array field are excluded when that facet is active, without throwing', () => {
    const { result } = render();
    act(() => result.current.toggleFacetValue('tags', 'x'));
    // Delta has no tags -> excluded
    expect(names(result)).toEqual(['Alpha']);
  });

  it('facetKey reflects the current selection and clears with clearAllFacets', () => {
    const { result } = render();
    act(() => result.current.toggleFacetValue('provider', 'groq'));
    expect(result.current.facetKey).toBe(JSON.stringify({ provider: ['groq'] }));
    act(() => result.current.clearAllFacets());
    expect(result.current.facetKey).toBe('{}');
  });

  it('clearFacet clears just one facet', () => {
    const { result } = render();
    act(() => {
      result.current.toggleFacetValue('provider', 'groq');
      result.current.toggleFacetValue('status', 'online');
    });
    act(() => result.current.clearFacet('provider'));
    expect(result.current.facetFilters).toEqual({ status: ['online'] });
  });

  it('resetFilters clears facets in addition to search and category', () => {
    const { result } = render();
    act(() => {
      result.current.setCategoryFilter('a');
      result.current.toggleFacetValue('provider', 'groq');
    });
    act(() => result.current.resetFilters());
    expect(result.current.categoryFilter).toBe('');
    expect(result.current.facetFilters).toEqual({});
    expect(result.current.resultCount).toBe(4);
  });

  it('search composes with facets (AND-ed)', async () => {
    const { result } = render();
    act(() => result.current.toggleFacetValue('provider', 'groq'));
    act(() => result.current.setSearchQuery('Alpha'));
    await waitFor(() => expect(names(result)).toEqual(['Alpha']));
  });
});
