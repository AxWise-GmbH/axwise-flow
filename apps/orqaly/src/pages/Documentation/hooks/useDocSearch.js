import { useState, useEffect, useMemo, useCallback } from 'react';

const MIN_LEN = 2;
const MAX_RESULTS = 24;
const DEBOUNCE_MS = 180;

/**
 * In-memory, dependency-free search over a prebuilt documentation index.
 * Ranks title matches above subtitle above body, caps the result count, and
 * debounces the query. Returns a flat ranked list for the search dropdown.
 *
 * @param {Array<{id,tab,type,title,subtitle,body}>} index
 */
export function useDocSearch(index) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const results = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (q.length < MIN_LEN) return [];
    const scored = [];
    for (const rec of index) {
      const title = (rec.title || '').toLowerCase();
      const subtitle = (rec.subtitle || '').toLowerCase();
      const body = (rec.body || '').toLowerCase();
      let score = 0;
      if (title.includes(q)) score += title.startsWith(q) ? 4 : 3;
      if (subtitle.includes(q)) score += 2;
      if (body.includes(q)) score += 1;
      if (score > 0) scored.push({ rec, score });
    }
    scored.sort((a, b) => b.score - a.score || a.rec.title.localeCompare(b.rec.title));
    return scored.slice(0, MAX_RESULTS).map((s) => s.rec);
  }, [debounced, index]);

  const clear = useCallback(() => {
    setQuery('');
    setDebounced('');
  }, []);

  return { query, setQuery, results, hasQuery: debounced.trim().length >= MIN_LEN, clear };
}

export default useDocSearch;
