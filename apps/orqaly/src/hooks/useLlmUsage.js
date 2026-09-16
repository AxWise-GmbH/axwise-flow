/**
 * useLlmUsage - React hook for reconciled LLM usage analytics.
 *
 * Wraps usageService.fetchUsage with loading/error state and a refresh fn.
 * Used by LlmUsagePanel (per-entity) and the unified LLM Usage view.
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchUsage, emptyUsageSnapshot } from '../services/usageService';

/**
 * @param {'all'|'organization'|'consilium'|'goal'|'team'|'agent'} entity
 * @param {{ id?: string, from?: string, to?: string, provider?: string, model?: string, source?: string, enabled?: boolean }} [opts]
 */
export function useLlmUsage(entity = 'all', opts = {}) {
  const { id, from, to, provider, model, source, enabled = true } = opts;
  const [data, setData] = useState(() => emptyUsageSnapshot(entity, id));
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return;
      setLoading(true);
      setError(null);
      try {
        const snapshot = await fetchUsage(entity, {
          id,
          from,
          to,
          provider,
          model,
          source,
          forceRefresh: force,
        });
        setData(snapshot);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [entity, id, from, to, provider, model, source, enabled]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const snapshot = await fetchUsage(entity, { id, from, to, provider, model, source });
        if (!cancelled) setData(snapshot);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entity, id, from, to, provider, model, source, enabled]);

  return {
    data,
    totals: data?.totals,
    facets: data?.facets,
    loading,
    error,
    refresh: () => load(true),
  };
}

export default useLlmUsage;
