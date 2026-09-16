/**
 * useUsageDirectory - React hook for the per-entity usage directory.
 *
 * Wraps usageDirectoryService.fetchDirectory with loading/error state and a
 * refresh fn. Used by EntityDirectory to render usage cards/tables per entity.
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchDirectory, emptyDirectory } from '../services/usageDirectoryService';

/**
 * @param {'goal'|'agent'|'team'|'consilium'|'organization'} entity
 * @param {{ from?: string, to?: string, search?: string, status?: string, limit?: number, enabled?: boolean }} [opts]
 */
export function useUsageDirectory(entity = 'goal', opts = {}) {
  const { from, to, search, status, limit, provider, model, source, enabled = true } = opts;
  const [data, setData] = useState(() => emptyDirectory(entity));
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (force = false) => {
      if (!enabled) {
        setLoading(false);
        return null;
      }
      setLoading(true);
      setError(null);
      try {
        return await fetchDirectory(entity, {
          from,
          to,
          search,
          status,
          limit,
          provider,
          model,
          source,
          forceRefresh: force,
        });
      } catch (err) {
        setError(err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [entity, from, to, search, status, limit, provider, model, source, enabled]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snapshot = await load();
      if (!cancelled && snapshot) setData(snapshot);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = useCallback(async () => {
    const snapshot = await load(true);
    if (snapshot) setData(snapshot);
    return snapshot;
  }, [load]);

  return { data, items: data?.items || [], totals: data?.totals, loading, error, refresh };
}

export default useUsageDirectory;
