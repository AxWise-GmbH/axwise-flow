import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTaskManager } from '../../context/TaskManagerContext';

/**
 * Route component for /task-manager. Opens the Task Manager dialog
 * and redirects to dashboard so the dialog overlays the current page.
 */
export default function TaskManagerRoute() {
  const navigate = useNavigate();
  const { openTaskManager } = useTaskManager();

  useEffect(() => {
    openTaskManager();
    navigate('/dashboard', { replace: true });
  }, [openTaskManager, navigate]);

  return null;
}
