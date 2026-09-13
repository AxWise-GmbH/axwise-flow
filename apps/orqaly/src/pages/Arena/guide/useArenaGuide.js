import { useCallback, useEffect, useState } from 'react';
import { fetchArenaGuideProgress } from '../../../services/arenaService';

/**
 * The guide's derived completion map. Nothing is stored per step - each flag
 * falls out of the data the step actually produces (departments configured,
 * stack rows saved, every catalog tool connected, no gaps left, every role
 * countered by an agent, a rate on file), so reopening always shows the truth.
 */
export default function useArenaGuide({ enabled = true } = {}) {
  const [done, setDone] = useState({});
  const [composioConfigured, setComposioConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchArenaGuideProgress();
      setDone(data.done || {});
      setComposioConfigured(!!data.composioConfigured);
    } catch {
      // A progress read failing must not block the guide - steps just show open.
      setDone({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  return { done, composioConfigured, loading, reload };
}
