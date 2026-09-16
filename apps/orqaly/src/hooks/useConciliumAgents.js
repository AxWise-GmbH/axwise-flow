import { useState, useEffect, useCallback } from 'react';
import {
  getAllAgents,
  createAgent,
  acceptAgent,
  pauseAgent,
  resumeAgent,
  terminateAgent,
  removeAgent,
} from '../services/conciliumAgentsService';

export function useConciliumAgents(boardId = null) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setAgents(await getAllAgents(boardId));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const add = useCallback(async (data) => {
    try {
      const a = await createAgent(data);
      setAgents((p) => [a, ...p]);
      return a;
    } catch (e) {
      console.warn('[useConciliumAgents] add failed:', e);
      return null;
    }
  }, []);

  const accept = useCallback(async (id) => {
    const u = await acceptAgent(id);
    setAgents((p) => p.map((a) => (a.id === id ? u : a)));
    return u;
  }, []);

  const pause = useCallback(async (id) => {
    const u = await pauseAgent(id);
    setAgents((p) => p.map((a) => (a.id === id ? u : a)));
    return u;
  }, []);

  const resume_ = useCallback(async (id) => {
    const u = await resumeAgent(id);
    setAgents((p) => p.map((a) => (a.id === id ? u : a)));
    return u;
  }, []);

  const terminate = useCallback(async (id, reason) => {
    const u = await terminateAgent(id, reason);
    setAgents((p) => p.map((a) => (a.id === id ? u : a)));
    return u;
  }, []);

  const remove = useCallback(async (id) => {
    setAgents((p) => p.filter((a) => a.id !== id));
    removeAgent(id).catch((e) => console.warn('[useConciliumAgents] remove failed:', e));
  }, []);

  return {
    agents,
    loading,
    error,
    refetch: fetch,
    addAgent: add,
    acceptAgent: accept,
    pauseAgent: pause,
    resumeAgent: resume_,
    terminateAgent: terminate,
    removeAgent: remove,
  };
}
