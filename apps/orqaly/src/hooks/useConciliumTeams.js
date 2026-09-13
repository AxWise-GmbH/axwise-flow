import { useState, useEffect, useCallback } from 'react';
import { getAllTeams, addTeam, editTeam, removeTeam } from '../services/conciliumTeamsService';

export function useConciliumTeams() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setTeams(await getAllTeams());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const add = useCallback(async (data) => {
    try {
      const t = await addTeam(data);
      setTeams((p) => [t, ...p]);
      return t;
    } catch (e) {
      console.warn('[useConciliumTeams] add failed:', e);
      return null;
    }
  }, []);

  const edit = useCallback(async (id, updates) => {
    setTeams((p) => p.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    editTeam(id, updates)
      .then((u) => {
        if (u) setTeams((p) => p.map((t) => (t.id === id ? u : t)));
      })
      .catch(console.warn);
  }, []);

  const remove = useCallback(async (id) => {
    setTeams((p) => p.filter((t) => t.id !== id));
    removeTeam(id).catch((e) => console.warn('[useConciliumTeams] remove failed:', e));
  }, []);

  return {
    teams,
    loading,
    error,
    refetch: fetch,
    addTeam: add,
    editTeam: edit,
    removeTeam: remove,
  };
}
