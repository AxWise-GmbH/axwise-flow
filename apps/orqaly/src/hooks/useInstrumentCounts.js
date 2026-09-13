import { useEffect, useState } from 'react';
import { supabase, hasSupabase } from '../lib/supabase';

/**
 * Counts of rows the current user has in each "instrument" surface
 * (Knowledge Base / Workflow / Tasks / Projects), fetched in a single
 * RLS-scoped call from /api/instrument-counts.
 */
export function useInstrumentCounts() {
  const [counts, setCounts] = useState({
    knowledge_base: null,
    workflow: null,
    tasks: null,
    projects: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (hasSupabase()) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
        }
        const res = await fetch('/api/instrument-counts', { headers });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data?.ok && data.counts) {
          setCounts(data.counts);
        } else {
          setError(data?.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load counts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { counts, loading, error };
}
