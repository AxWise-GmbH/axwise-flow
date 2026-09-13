import { useState, useEffect, useCallback } from 'react';
import { getAnalytics, getSummary } from '../services/conciliumAnalyticsService';

export function useConciliumAnalytics(boardId = null, period = 'daily') {
  const [analytics, setAnalytics] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, sum] = await Promise.all([getAnalytics(boardId, period), getSummary()]);
      setAnalytics(data);
      setSummary(sum);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [boardId, period]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { analytics, summary, loading, error, refetch: fetch };
}
