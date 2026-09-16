import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { supabase, hasSupabase } from '../lib/supabase';

const ReplicatorContext = createContext(null);

export function useReplicators() {
  const ctx = useContext(ReplicatorContext);
  if (!ctx) throw new Error('useReplicators must be used within ReplicatorProvider');
  return ctx;
}

export function useReplicatorsOptional() {
  return useContext(ReplicatorContext);
}

export function ReplicatorProvider({ children }) {
  const { user } = useAuth();
  const [replicators, setReplicators] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  const fetchReplicators = useCallback(async () => {
    if (!user?.uid || !hasSupabase()) {
      setReplicators([]);
      setLoaded(true);
      return;
    }
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('replicators')
        .select(
          'id, slug, display_name, icon_name, icon_url, integration_type, status, created_at, replicator_pages(id, slug, title, description, position)'
        )
        .eq('status', 'active')
        .order('created_at', { ascending: true });
      if (queryError) throw queryError;
      const normalized = (data || []).map((r) => ({
        ...r,
        pages: (r.replicator_pages || [])
          .slice()
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((p) => ({
            id: p.id,
            slug: p.slug,
            title: p.title,
            description: p.description,
            position: p.position,
          })),
      }));
      setReplicators(normalized);
    } catch (err) {
      setError(err);
      setReplicators([]);
    } finally {
      setLoaded(true);
    }
  }, [user?.uid]);

  useEffect(() => {
    setLoaded(false);
    fetchReplicators();
  }, [fetchReplicators]);

  const value = useMemo(
    () => ({
      replicators,
      loaded,
      error,
      refresh: fetchReplicators,
      getBySlug: (slug) => replicators.find((r) => r.slug === slug) || null,
    }),
    [replicators, loaded, error, fetchReplicators]
  );

  return <ReplicatorContext.Provider value={value}>{children}</ReplicatorContext.Provider>;
}
