import { useState, useEffect, useCallback, useRef } from 'react';
import { hasSupabase } from '../lib/supabase';
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../services/dashboardTemplatesService';

/**
 * Loads the user's saved (custom) dashboard layout templates for a surface and
 * exposes create/update/remove mutations. Degrades gracefully to an empty list
 * when Supabase is not configured / the user is signed out, so built-in
 * templates and the rest of the dialog keep working.
 *
 * @param {{ surface?: string }} [opts]
 */
export function useDashboardTemplates({ surface = 'home' } = {}) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Avoid setState after unmount (the async fetch can resolve post-teardown).
  const mounted = useRef(true);

  const refetch = useCallback(async () => {
    if (!hasSupabase()) {
      if (mounted.current) {
        setTemplates([]);
        setLoading(false);
      }
      return;
    }
    if (mounted.current) {
      setLoading(true);
      setError(null);
    }
    try {
      const rows = await listTemplates({ surface });
      if (mounted.current) setTemplates(Array.isArray(rows) ? rows : []);
    } catch (err) {
      if (mounted.current) {
        setError(err.message || 'Failed to load templates');
        setTemplates([]);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [surface]);

  useEffect(() => {
    mounted.current = true;
    refetch();
    return () => {
      mounted.current = false;
    };
  }, [refetch]);

  const create = useCallback(
    async ({ name, hidden = [], order = [], widths = [] }) => {
      const created = await createTemplate({ name, surface, hidden, order, widths });
      await refetch();
      return created;
    },
    [surface, refetch]
  );

  const update = useCallback(
    async (id, patch) => {
      const updated = await updateTemplate(id, patch);
      await refetch();
      return updated;
    },
    [refetch]
  );

  const remove = useCallback(
    async (id) => {
      await deleteTemplate(id);
      await refetch();
    },
    [refetch]
  );

  return { templates, loading, error, refetch, create, update, remove };
}

export default useDashboardTemplates;
