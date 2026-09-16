import { useState, useEffect, useCallback } from 'react';
import {
  getAllPushesWithTasks,
  createPush,
  updatePush,
  deletePush,
  assignTaskToPush,
  assignMultipleTasksToPush,
  unassignTaskFromPush,
  clearTasksFromPush,
} from '../services/githubPushService';

export function useGithubPushes() {
  const [pushes, setPushes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPushes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllPushesWithTasks();
      setPushes(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPushes();
  }, [fetchPushes]);

  const addPush = useCallback(async (data) => {
    const created = await createPush(data);
    setPushes((prev) => [{ ...created, tasks: [] }, ...prev]);
    return created;
  }, []);

  const editPush = useCallback(async (id, data) => {
    const updated = await updatePush(id, data);
    if (updated) {
      setPushes((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
    }
    return updated;
  }, []);

  const removePush = useCallback(async (id) => {
    await deletePush(id);
    setPushes((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const assignTask = useCallback(async (pushId, taskData) => {
    const saved = await assignTaskToPush(pushId, taskData);
    setPushes((prev) =>
      prev.map((p) => (p.id === pushId ? { ...p, tasks: [...(p.tasks || []), saved] } : p))
    );
    return saved;
  }, []);

  const assignTasks = useCallback(async (pushId, taskDataArray) => {
    const results = await assignMultipleTasksToPush(pushId, taskDataArray);
    setPushes((prev) =>
      prev.map((p) => (p.id === pushId ? { ...p, tasks: [...(p.tasks || []), ...results] } : p))
    );
    return results;
  }, []);

  const unassignTask = useCallback(async (pushId, pushTaskId) => {
    await unassignTaskFromPush(pushTaskId);
    setPushes((prev) =>
      prev.map((p) =>
        p.id === pushId ? { ...p, tasks: (p.tasks || []).filter((t) => t.id !== pushTaskId) } : p
      )
    );
  }, []);

  const clearTasks = useCallback(async (pushId) => {
    await clearTasksFromPush(pushId);
    setPushes((prev) => prev.map((p) => (p.id === pushId ? { ...p, tasks: [] } : p)));
  }, []);

  return {
    pushes,
    loading,
    error,
    refetch: fetchPushes,
    addPush,
    editPush,
    removePush,
    assignTask,
    assignTasks,
    unassignTask,
    clearTasks,
  };
}
