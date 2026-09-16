import { useState, useEffect, useCallback } from 'react';
import {
  getAllTools,
  createTool,
  updateTool,
  deleteTool,
  blockTool,
} from '../services/toolService';

export function useTools() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTools = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllTools();
      setTools(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  const addTool = useCallback(async (data) => {
    try {
      const created = await createTool(data);
      setTools((prev) => [created, ...prev]);
      return created;
    } catch (e) {
      console.warn('[useTools] addTool failed:', e);
      return null;
    }
  }, []);

  const editTool = useCallback(async (id, data) => {
    setTools((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));
    updateTool(id, data)
      .then((updated) => {
        if (updated) setTools((prev) => prev.map((t) => (t.id === id ? updated : t)));
      })
      .catch((e) => {
        console.warn('[useTools] editTool failed:', e);
      });
    return data;
  }, []);

  const removeTool = useCallback(async (id) => {
    try {
      await deleteTool(id);
      setTools((prev) => prev.filter((t) => t.id !== id));
      setError(null);
      return true;
    } catch (e) {
      setError(e?.message || 'Failed to delete tool');
      console.warn('[useTools] removeTool failed:', e);
      throw e;
    }
  }, []);

  const toggleBlock = useCallback(async (id) => {
    setTools((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: t.status === 'blocked' ? 'active' : 'blocked' } : t
      )
    );
    blockTool(id).catch((e) => {
      console.warn('[useTools] toggleBlock failed:', e);
    });
  }, []);

  return {
    tools,
    loading,
    error,
    refetch: fetchTools,
    addTool,
    editTool,
    removeTool,
    toggleBlock,
  };
}
