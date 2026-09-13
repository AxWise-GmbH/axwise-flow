/**
 * useCopilotSidebarData — polls the live signals the CopilotSidebar renders.
 *
 * Keeps MainLayout lean: fetches the activity feed on an interval while the
 * copilot dialog is open. Home-summary counts + notifications are passed in by
 * the caller (MainLayout already owns those), so this hook only owns the feed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getActivityFeed } from '../services/communicatorService';

const POLL_MS = 45_000;

export default function useCopilotSidebarData({ enabled = false } = {}) {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const events = await getActivityFeed({ limit: 15 });
      setActivity(Array.isArray(events) ? events : []);
      setError('');
    } catch (e) {
      setError(e?.message || 'Could not load activity.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    timerRef.current = setInterval(refresh, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, refresh]);

  return { activity, loading, error, refresh };
}
