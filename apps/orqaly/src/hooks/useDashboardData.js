import { useCallback, useEffect, useRef, useState } from 'react';
import { queryDashboardData } from '../services/dashboardService';

/**
 * Fetch data for an array of blocks + dashboard-wide filters.
 *
 * Returns { resultsById, loading, error, refresh }.
 * Re-fetches whenever blocks, global_filters, or refreshKey change.
 *
 * Markdown blocks are skipped (no data needed).
 */
export default function useDashboardData(blocks, globalFilters) {
  const [resultsById, setResultsById] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reqIdRef = useRef(0);

  const queryableBlocks = (blocks || []).filter((b) => b.type !== 'markdown' && b.data?.dataset);

  const signature = JSON.stringify({
    blocks: queryableBlocks.map((b) => ({
      id: b.id,
      type: b.type,
      data: b.data,
      filters: b.filters,
    })),
    globalFilters,
  });

  const fetchOnce = useCallback(async () => {
    if (queryableBlocks.length === 0) {
      setResultsById({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const myId = ++reqIdRef.current;
    try {
      const payload = {
        blocks: queryableBlocks.map((b) => ({
          id: b.id,
          type: b.type,
          data: b.data,
          filters: b.filters,
        })),
        global_filters: globalFilters || {},
      };
      const resp = await queryDashboardData(payload);
      if (myId !== reqIdRef.current) return; // stale
      setResultsById(resp.results || {});
    } catch (err) {
      if (myId !== reqIdRef.current) return;
      setError(err.message || 'Failed to load data');
    } finally {
      if (myId === reqIdRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    fetchOnce();
  }, [fetchOnce]);

  return { resultsById, loading, error, refresh: fetchOnce };
}
