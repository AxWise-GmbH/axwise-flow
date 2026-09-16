import { useState, useEffect, useCallback } from 'react';
import {
  getAllConcilium,
  createConcilium,
  updateConcilium,
  deleteConcilium,
} from '../services/conciliumService';

export function useConcilium() {
  const [concilium, setConcilium] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchConcilium = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllConcilium();
      setConcilium(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConcilium();
  }, [fetchConcilium]);

  const addConcilium = useCallback(async (data) => {
    try {
      const created = await createConcilium(data);
      setConcilium((prev) => [created, ...prev]);
      return created;
    } catch (e) {
      console.warn('[useConcilium] addConcilium failed:', e);
      return null;
    }
  }, []);

  const editConcilium = useCallback(async (id, data, userName) => {
    setConcilium((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));
    updateConcilium(id, data, userName)
      .then((updated) => {
        if (updated) setConcilium((prev) => prev.map((c) => (c.id === id ? updated : c)));
      })
      .catch((e) => {
        console.warn('[useConcilium] editConcilium failed:', e);
      });
    return data;
  }, []);

  const removeConcilium = useCallback(async (id) => {
    setConcilium((prev) => prev.filter((c) => c.id !== id));
    deleteConcilium(id).catch((e) => {
      console.warn('[useConcilium] removeConcilium failed:', e);
    });
  }, []);

  return {
    concilium,
    loading,
    error,
    refetch: fetchConcilium,
    addConcilium,
    editConcilium,
    removeConcilium,
  };
}
