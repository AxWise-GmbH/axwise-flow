import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  cancelGoal,
  pauseGoal,
  resumeGoal,
  toggleAutopilot,
  toggleLoop,
} from '../../services/goalService';

/**
 * The run controls behind the Actions menu.
 *
 * Extracted from GoalDetailDialog so more than one screen can offer them:
 * the goal dialog, and the New Goal surface, which otherwise gives you no way
 * to pause or cancel the run it just started.
 *
 * Delete deliberately does not call a service. It routes through /pin, which
 * takes the confirmation, so a destructive action always crosses a deliberate
 * step rather than firing from a menu click.
 */
export default function useGoalActions(goalId, { onRefresh, onLeave } = {}) {
  const navigate = useNavigate();
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');

  const run = useCallback(
    async (action) => {
      if (!goalId) return;

      if (action === 'delete') {
        onLeave?.();
        navigate(
          `/pin?mode=delete&goalId=${goalId}&next=${encodeURIComponent(
            typeof window === 'undefined' ? '/' : window.location.pathname
          )}`
        );
        return;
      }

      setPending(action);
      setError('');
      try {
        if (action === 'pause') await pauseGoal(goalId);
        else if (action === 'resume') await resumeGoal(goalId);
        else if (action === 'cancel') await cancelGoal(goalId);
        else if (action === 'toggle-autopilot-on') await toggleAutopilot(goalId, true);
        else if (action === 'toggle-autopilot-off') await toggleAutopilot(goalId, false);
        else if (action === 'toggle-loop-on') await toggleLoop(goalId, true);
        else if (action === 'toggle-loop-off') await toggleLoop(goalId, false);
        else return;
        await onRefresh?.();
      } catch (err) {
        // Say which action failed. "Something went wrong" after clicking Pause
        // leaves the user unsure whether the run is still going.
        setError(err?.message || `Could not ${action.replace(/-/g, ' ')} this goal.`);
      } finally {
        setPending('');
      }
    },
    [goalId, navigate, onLeave, onRefresh]
  );

  return { run, pending, error, clearError: () => setError('') };
}
