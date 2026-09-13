import { createContext, useContext, useState } from 'react';

const TaskManagerContext = createContext(null);

export function TaskManagerProvider({ children }) {
  const [open, setOpen] = useState(false);

  const openTaskManager = () => setOpen(true);
  const closeTaskManager = () => setOpen(false);

  const value = {
    taskManagerOpen: open,
    openTaskManager,
    closeTaskManager,
  };

  return <TaskManagerContext.Provider value={value}>{children}</TaskManagerContext.Provider>;
}

export function useTaskManager() {
  const ctx = useContext(TaskManagerContext);
  if (!ctx) throw new Error('useTaskManager must be used within TaskManagerProvider');
  return ctx;
}
