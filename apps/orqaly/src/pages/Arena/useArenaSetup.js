import { useCallback, useEffect, useState } from 'react';
import { fetchArenaDepartments, fetchArenaRates } from '../../services/arenaService';

/**
 * The two things Arena needs configured before its numbers mean anything: which
 * departments the business runs, and what its people cost.
 *
 * A failure here is swallowed on purpose. Setup is supporting data - if it
 * cannot be read, the board still works, it just shows no money and no
 * department filter.
 */
export default function useArenaSetup() {
  const [configured, setConfigured] = useState([]);
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [departments, rateRows] = await Promise.all([
        fetchArenaDepartments(),
        fetchArenaRates(),
      ]);
      setConfigured(departments.configured || []);
      setRates(rateRows || []);
    } catch {
      setConfigured([]);
      setRates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    configured,
    rates,
    loading,
    reload,
    isConfigured: configured.some((c) => c.enabled),
  };
}
