import { useState, useMemo, useRef, useEffect, useCallback } from 'react';

/**
 * Shared search / filter / sort hook for Marketplace tabs.
 *
 * @param {Array}    items         Raw list from service
 * @param {string[]} searchFields  Fields to text-match (e.g. ['role','description','capabilities'])
 * @param {string}   categoryField Field name used for the legacy single-select category filter
 * @param {object}   [options]
 * @param {Array}    [options.facets] Multi-select facet configs. Each facet:
 *   { key, label, field, array = false, matchAll = false }.
 *   - array: item[field] is an array (tags/capabilities/roles)
 *   - matchAll: array facet requires ALL selected values (default is match-ANY)
 *   Values within one facet are OR-ed (scalar) or ANY/ALL (array); facets are AND-ed.
 */
export default function useMarketplaceSearch(
  items = [],
  searchFields = [],
  categoryField = 'category',
  options = {}
) {
  const { facets = [] } = options;
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [facetFilters, setFacetFilters] = useState({}); // { [key]: string[] }
  const [sortBy, setSortBy] = useState('name');
  const timerRef = useRef(null);

  // Debounce search input (300ms)
  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timerRef.current);
  }, [searchQuery]);

  const filteredItems = useMemo(() => {
    let list = items;

    // Text search
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase();
      list = list.filter((item) =>
        searchFields.some((field) => {
          const val = item[field];
          if (Array.isArray(val)) return val.some((v) => String(v).toLowerCase().includes(q));
          return val && String(val).toLowerCase().includes(q);
        })
      );
    }

    // Legacy single-select category filter
    if (categoryFilter) {
      list = list.filter((item) => item[categoryField] === categoryFilter);
    }

    // Multi-select facet filters (facets AND-ed; values within a facet OR-ed)
    if (facets.length && Object.keys(facetFilters).length) {
      list = list.filter((item) =>
        facets.every((facet) => {
          const selected = facetFilters[facet.key];
          if (!selected || selected.length === 0) return true; // inactive facet passes

          if (facet.array) {
            const vals = item[facet.field];
            const arr = Array.isArray(vals) ? vals.map((v) => String(v)) : [];
            return facet.matchAll
              ? selected.every((s) => arr.includes(s)) // match-ALL
              : selected.some((s) => arr.includes(s)); // match-ANY (default)
          }

          // scalar field: OR across selected values
          return selected.includes(String(item[facet.field]));
        })
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'name': {
          const aName = (a.name || a.role || '').toLowerCase();
          const bName = (b.name || b.role || '').toLowerCase();
          return aName.localeCompare(bName);
        }
        case 'cost':
          return (a.cost_per_task || 0) - (b.cost_per_task || 0);
        case 'rating':
          return (b.rating_avg || 0) - (a.rating_avg || 0);
        case 'installs':
          return (b.install_count || 0) - (a.install_count || 0);
        case 'newest':
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        default:
          return 0;
      }
    });

    return list;
  }, [items, debouncedQuery, categoryFilter, facetFilters, facets, sortBy, searchFields, categoryField]);

  // Toggle one value's membership within one facet (used by chip clicks).
  const toggleFacetValue = useCallback((key, value) => {
    setFacetFilters((prev) => {
      const current = prev[key] || [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (next.length === 0) {
        const { [key]: _drop, ...rest } = prev; // drop empty key to keep object canonical
        return rest;
      }
      return { ...prev, [key]: next };
    });
  }, []);

  const clearFacet = useCallback((key) => {
    setFacetFilters((prev) => {
      if (!prev[key]) return prev;
      const { [key]: _drop, ...rest } = prev;
      return rest;
    });
  }, []);

  const clearAllFacets = useCallback(() => setFacetFilters({}), []);

  const resetFilters = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setCategoryFilter('');
    setFacetFilters({});
    setSortBy('name');
  };

  return {
    filteredItems,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    sortBy,
    setSortBy,
    resultCount: filteredItems.length,
    resetFilters,
    // Facets
    facets,
    facetFilters,
    setFacetFilters,
    toggleFacetValue,
    clearFacet,
    clearAllFacets,
    // Stable primitive for pagination resetOn deps (never pass facetFilters object)
    facetKey: JSON.stringify(facetFilters),
  };
}
