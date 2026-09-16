import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchArenaBoard,
  fetchArenaScoreboard,
  fetchArenaDecision,
  fetchArenaExceptions,
} from '../../services/arenaService';

/** Default window: the working week the user is currently in. */
export function defaultWindow(now = new Date()) {
  const to = new Date(now);
  const from = new Date(to.getTime() - 6 * 86_400_000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export const ARENA_VIEWS = ['board', 'scoreboard', 'decide'];

/**
 * Everything the Arena page reads.
 *
 * Only the current view is fetched: Decide runs a heavier fold across 90 days,
 * so it stays off the wire until someone asks for it. Errors are caught into
 * state and never thrown, matching useMyAgents.
 */
export default function useArenaBoard({
  view = 'board',
  department = 'all',
  status = 'all',
  q = '',
  from,
  to,
} = {}) {
  const [board, setBoard] = useState(null);
  const [scoreboard, setScoreboard] = useState(null);
  const [decision, setDecision] = useState(null);
  const [exceptions, setExceptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const window = useMemo(() => {
    const fallback = defaultWindow();
    return { from: from || fallback.from, to: to || fallback.to };
  }, [from, to]);

  // Decide reads a quarter, because one good week is not a trend.
  const decisionWindow = useMemo(() => {
    const end = new Date(window.to);
    const start = new Date(end.getTime() - 90 * 86_400_000);
    return { from: start.toISOString().slice(0, 10), to: window.to };
  }, [window.to]);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (view === 'decide') {
        const [d, e] = await Promise.all([
          fetchArenaDecision(decisionWindow),
          fetchArenaExceptions(decisionWindow),
        ]);
        setDecision(d);
        setExceptions(e);
      } else if (view === 'scoreboard') {
        setScoreboard(await fetchArenaScoreboard(window));
      } else {
        const [b, s] = await Promise.all([
          fetchArenaBoard({ ...window, department, status, q }),
          fetchArenaScoreboard(window),
        ]);
        setBoard(b);
        setScoreboard(s);
      }
    } catch (err) {
      setError(err.message || 'Arena could not load');
    } finally {
      setLoading(false);
    }
  }, [view, department, status, q, window, decisionWindow]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    board,
    scoreboard,
    decision,
    exceptions,
    loading,
    error,
    refetch,
    window,
    isConfigured: board?.isConfigured ?? scoreboard != null,
  };
}
