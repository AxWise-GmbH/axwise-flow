import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'orchestratori-dev-tasks';

/**
 * DevTasksContext — per-page development task manager.
 * Each page (identified by its route path) maintains its own list of dev tasks.
 * Tasks support full task management fields: status, priority, deadline, etc.
 * Tasks are persisted to localStorage.
 */
const DevTasksContext = createContext({
  tasks: {},
  addTask: () => {},
  toggleTask: () => {},
  removeTask: () => {},
  updateTask: () => {},
  patchTask: () => {},
  getPageTasks: () => [],
  getAllTasks: () => [],
});

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (_) {}
}

export function DevTasksProvider({ children }) {
  const [tasks, setTasks] = useState(loadFromStorage);

  const addTask = useCallback((pagePath, text, extra = {}) => {
    if (!text?.trim()) return;
    setTasks((prev) => {
      const pageTasks = prev[pagePath] || [];
      const next = {
        ...prev,
        [pagePath]: [
          ...pageTasks,
          {
            id: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            text: text.trim(),
            done: false,
            status: extra.status || 'todo',
            priority: extra.priority || 'medium',
            deadline: extra.deadline || '',
            assignedTo: extra.assignedTo || '',
            estimate: extra.estimate || '',
            description: extra.description || '',
            createdAt: new Date().toISOString(),
            page: pagePath,
          },
        ],
      };
      saveToStorage(next);
      return next;
    });
  }, []);

  const toggleTask = useCallback((pagePath, taskId) => {
    setTasks((prev) => {
      const pageTasks = (prev[pagePath] || []).map((t) => {
        if (t.id !== taskId) return t;
        const newDone = !t.done;
        return {
          ...t,
          done: newDone,
          status: newDone ? 'done' : t.status === 'done' ? 'todo' : t.status,
        };
      });
      const next = { ...prev, [pagePath]: pageTasks };
      saveToStorage(next);
      return next;
    });
  }, []);

  const removeTask = useCallback((pagePath, taskId) => {
    setTasks((prev) => {
      const pageTasks = (prev[pagePath] || []).filter((t) => t.id !== taskId);
      const next = { ...prev, [pagePath]: pageTasks };
      if (pageTasks.length === 0) delete next[pagePath];
      saveToStorage(next);
      return next;
    });
  }, []);

  const updateTask = useCallback((pagePath, taskId, newText) => {
    setTasks((prev) => {
      const pageTasks = (prev[pagePath] || []).map((t) =>
        t.id === taskId ? { ...t, text: newText } : t
      );
      const next = { ...prev, [pagePath]: pageTasks };
      saveToStorage(next);
      return next;
    });
  }, []);

  const patchTask = useCallback((pagePath, taskId, patch) => {
    setTasks((prev) => {
      const pageTasks = (prev[pagePath] || []).map((t) => {
        if (t.id !== taskId) return t;
        const updated = { ...t, ...patch };
        if (patch.status !== undefined) {
          updated.done = patch.status === 'done';
        }
        if (patch.done !== undefined && patch.status === undefined) {
          updated.status = patch.done ? 'done' : t.status === 'done' ? 'todo' : t.status;
        }
        return updated;
      });
      const next = { ...prev, [pagePath]: pageTasks };
      saveToStorage(next);
      return next;
    });
  }, []);

  const getPageTasks = useCallback((pagePath) => tasks[pagePath] || [], [tasks]);

  const getAllTasks = useCallback(() => {
    const all = [];
    Object.entries(tasks).forEach(([page, pageTasks]) => {
      pageTasks.forEach((t) => all.push({ ...t, page }));
    });
    return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [tasks]);

  const value = useMemo(
    () => ({
      tasks,
      addTask,
      toggleTask,
      removeTask,
      updateTask,
      patchTask,
      getPageTasks,
      getAllTasks,
    }),
    [tasks, addTask, toggleTask, removeTask, updateTask, patchTask, getPageTasks, getAllTasks]
  );

  return <DevTasksContext.Provider value={value}>{children}</DevTasksContext.Provider>;
}

export function useDevTasks() {
  const ctx = useContext(DevTasksContext);
  if (!ctx) throw new Error('useDevTasks must be used within DevTasksProvider');
  return ctx;
}
