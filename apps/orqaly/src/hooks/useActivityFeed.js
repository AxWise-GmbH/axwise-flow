/**
 * [module: connection-hub]
 * useActivityFeed — data hook for the Communicator Activity tab.
 * Polls every 15 s so the local dev worker and production cron both surface
 * new events without a page refresh.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { getActivityFeed } from '../services/communicatorService';

const DEFAULT_FILTERS = { source: 'all', severity: 'all', goalId: null };
const POLL_INTERVAL_MS = 15_000;

export function useActivityFeed() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchEvents = useCallback(async (override) => {
    const f = override || filtersRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getActivityFeed({ ...f, limit: 100 });
      setEvents(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const applyFilters = useCallback(
    (updates) => {
      const next = { ...filtersRef.current, ...updates };
      setFilters(next);
      fetchEvents(next);
    },
    [fetchEvents]
  );

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    fetchEvents(DEFAULT_FILTERS);
  }, [fetchEvents]);

  // Initial load + poll loop. We poll even when the tab is hidden so the
  // event count metric at the Communicator header stays fresh; the cost is
  // one lightweight query every 15s.
  useEffect(() => {
    fetchEvents();
    const id = setInterval(() => fetchEvents(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchEvents]);

  return {
    events,
    loading,
    error,
    filters,
    fetchEvents,
    applyFilters,
    resetFilters,
  };
}
