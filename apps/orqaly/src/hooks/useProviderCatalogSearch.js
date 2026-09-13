/**
 * useProviderCatalogSearch(category, initialProvider) - debounced live search
 * of an external provider's catalog for a Marketplace category.
 *
 * Holds the selected provider + search query, debounces the query (400ms),
 * fetches via providerCatalogService, and ignores stale responses so a slow
 * earlier request cannot overwrite a newer one.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchProviderCatalog } from '../services/providerCatalogService';

export default function useProviderCatalogSearch(category, initialProvider = '') {
  const [provider, setProvider] = useState(initialProvider);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const reqId = useRef(0);
  const timerRef = useRef(null);

  // Debounce the query.
  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  // Fetch on provider / category / debounced query change.
  useEffect(() => {
    if (!provider || !category) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    fetchProviderCatalog({ provider, category, q: debouncedQuery })
      .then((list) => {
        if (id !== reqId.current) return; // stale
        setItems(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        if (id !== reqId.current) return; // stale
        setError(err.message || 'Failed to load catalog');
        setItems([]);
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [provider, category, debouncedQuery]);

  const selectProvider = useCallback((next) => {
    setProvider(next);
    setQuery('');
    setDebouncedQuery('');
  }, []);

  return { provider, setProvider: selectProvider, query, setQuery, items, loading, error };
}
