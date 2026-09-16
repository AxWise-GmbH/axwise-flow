import { useState, useEffect, useCallback } from 'react';
import {
  getAllProjects,
  createProject,
  updateProject,
  deleteProject,
} from '../services/projectService';

export function useProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllProjects();
      setProjects(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const addProject = useCallback(async (data) => {
    setProjects((prev) => [data, ...prev]);
    createProject(data)
      .then((created) => {
        setProjects((prev) => prev.map((p) => (p.id === data.id ? created : p)));
      })
      .catch((e) => {
        console.warn('[useProjects] addProject failed, reverting:', e);
        setProjects((prev) => prev.filter((p) => p.id !== data.id));
      });
    return data;
  }, []);

  const editProject = useCallback(async (id, data) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
    updateProject(id, data)
      .then((updated) => {
        if (updated) setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
      })
      .catch((e) => {
        console.warn('[useProjects] editProject failed:', e);
      });
    return data;
  }, []);

  const removeProject = useCallback(async (id) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    deleteProject(id).catch((e) => {
      console.warn('[useProjects] removeProject failed:', e);
    });
  }, []);

  return {
    projects,
    loading,
    error,
    refetch: fetchProjects,
    addProject,
    editProject,
    removeProject,
  };
}
