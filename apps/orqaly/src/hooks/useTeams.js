import { useState, useEffect, useCallback } from 'react';
import { getAllTeams, createTeam, updateTeam, deleteTeam } from '../services/teamService';

export function useTeams() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTeams = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllTeams();
      setTeams(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const addTeam = useCallback(async (data) => {
    try {
      const created = await createTeam(data);
      setTeams((prev) => [created, ...prev]);
      return created;
    } catch (e) {
      console.warn('[useTeams] addTeam failed:', e);
      return null;
    }
  }, []);

  const editTeam = useCallback(async (id, data) => {
    setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));
    updateTeam(id, data)
      .then((updated) => {
        if (updated) setTeams((prev) => prev.map((t) => (t.id === id ? updated : t)));
      })
      .catch((e) => {
        console.warn('[useTeams] editTeam failed:', e);
      });
    return data;
  }, []);

  const removeTeam = useCallback(async (id) => {
    setTeams((prev) => prev.filter((t) => t.id !== id));
    deleteTeam(id).catch((e) => {
      console.warn('[useTeams] removeTeam failed:', e);
    });
  }, []);

  return {
    teams,
    loading,
    error,
    refetch: fetchTeams,
    addTeam,
    editTeam,
    removeTeam,
  };
}
