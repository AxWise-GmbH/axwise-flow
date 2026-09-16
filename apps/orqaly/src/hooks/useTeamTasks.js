import { useCallback, useEffect, useState } from 'react';
import {
  clearAllTeamTasks,
  createTeamTask,
  deleteTeamTaskById,
  loadTeamTasks,
  updateTeamTaskById,
} from '../services/teamTaskBackend';

export function useTeamTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await loadTeamTasks();
      setTasks(list);
    } catch (e) {
      setError(e?.message || 'Failed to load team tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const addTeamTask = useCallback(async (task) => {
    setTasks((prev) => [task, ...prev]);
    createTeamTask(task).catch((e) => {
      console.warn('[useTeamTasks] addTeamTask failed, reverting:', e);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    });
    return task;
  }, []);

  const patchTeamTask = useCallback(async (id, patch) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t))
    );
    updateTeamTaskById(id, patch).catch((e) => {
      console.warn('[useTeamTasks] patchTeamTask failed:', e);
    });
    return true;
  }, []);

  const removeTeamTask = useCallback(async (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    deleteTeamTaskById(id).catch((e) => {
      console.warn('[useTeamTasks] removeTeamTask failed:', e);
    });
    return true;
  }, []);

  const clearTeamTasks = useCallback(async () => {
    // Only blank the list if the delete actually happened — clearAllTeamTasks
    // returns false when there is no session rather than deleting unscoped.
    const ok = await clearAllTeamTasks();
    if (ok) setTasks([]);
    return ok;
  }, []);

  return {
    tasks,
    loading,
    error,
    refetch,
    addTeamTask,
    patchTeamTask,
    removeTeamTask,
    clearTeamTasks,
  };
}
