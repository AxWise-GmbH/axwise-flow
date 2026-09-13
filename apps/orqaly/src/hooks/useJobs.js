import { useState, useEffect, useCallback } from 'react';
import { getAllJobs, createJob, updateJob, deleteJob } from '../services/jobService';

export function useJobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllJobs();
      setJobs(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const addJob = useCallback(async (data) => {
    try {
      const created = await createJob(data);
      setJobs((prev) => [created, ...prev]);
      return created;
    } catch (e) {
      console.warn('[useJobs] addJob failed:', e);
      return null;
    }
  }, []);

  const editJob = useCallback(async (id, data) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...data } : j)));
    updateJob(id, data)
      .then((updated) => {
        if (updated) setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
      })
      .catch((e) => {
        console.warn('[useJobs] editJob failed:', e);
      });
    return data;
  }, []);

  const removeJob = useCallback(async (id) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    deleteJob(id).catch((e) => {
      console.warn('[useJobs] removeJob failed:', e);
    });
  }, []);

  return {
    jobs,
    loading,
    error,
    refetch: fetchJobs,
    addJob,
    editJob,
    removeJob,
  };
}
