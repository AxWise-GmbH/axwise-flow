import { useState, useEffect, useCallback } from 'react';
import {
  getAllRequests,
  createRequest,
  updateRequest,
  deleteRequest,
} from '../services/requestService';

export function useRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllRequests();
      setRequests(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const addRequest = useCallback(async (data) => {
    try {
      const created = await createRequest(data);
      setRequests((prev) => [created, ...prev]);
      return created;
    } catch (e) {
      console.warn('[useRequests] addRequest failed:', e);
      return null;
    }
  }, []);

  const editRequest = useCallback(async (id, data) => {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...data } : r)));
    updateRequest(id, data)
      .then((updated) => {
        if (updated) setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
      })
      .catch((e) => {
        console.warn('[useRequests] editRequest failed:', e);
      });
    return data;
  }, []);

  const removeRequest = useCallback(async (id) => {
    setRequests((prev) => prev.filter((r) => r.id !== id));
    deleteRequest(id).catch((e) => {
      console.warn('[useRequests] removeRequest failed:', e);
    });
  }, []);

  return {
    requests,
    loading,
    error,
    refetch: fetchRequests,
    addRequest,
    editRequest,
    removeRequest,
  };
}
