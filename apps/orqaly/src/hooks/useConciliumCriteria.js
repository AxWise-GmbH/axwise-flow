import { useState, useEffect, useCallback } from 'react';
import {
  getAllCriteria,
  addCriterion,
  editCriterion,
  removeCriterion,
} from '../services/conciliumCriteriaService';

export function useConciliumCriteria(conciliumId) {
  const [criteria, setCriteria] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCriteria = useCallback(async () => {
    if (!conciliumId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getAllCriteria(conciliumId);
      setCriteria(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [conciliumId]);

  useEffect(() => {
    fetchCriteria();
  }, [fetchCriteria]);

  const add = useCallback(
    async (criterionData) => {
      try {
        const created = await addCriterion(conciliumId, criterionData);
        setCriteria((prev) => [...prev, created]);
        return created;
      } catch (e) {
        console.warn('[useConciliumCriteria] add failed:', e);
        return null;
      }
    },
    [conciliumId]
  );

  const edit = useCallback(async (id, updates) => {
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
    editCriterion(id, updates)
      .then((updated) => {
        if (updated) setCriteria((prev) => prev.map((c) => (c.id === id ? updated : c)));
      })
      .catch((e) => {
        console.warn('[useConciliumCriteria] edit failed:', e);
      });
  }, []);

  const remove = useCallback(async (id) => {
    setCriteria((prev) => prev.filter((c) => c.id !== id));
    removeCriterion(id).catch((e) => {
      console.warn('[useConciliumCriteria] remove failed:', e);
    });
  }, []);

  return {
    criteria,
    loading,
    error,
    refetch: fetchCriteria,
    addCriterion: add,
    editCriterion: edit,
    removeCriterion: remove,
  };
}
