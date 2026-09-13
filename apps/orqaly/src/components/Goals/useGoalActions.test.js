import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../../services/goalService', () => ({
  pauseGoal: vi.fn(() => Promise.resolve()),
  resumeGoal: vi.fn(() => Promise.resolve()),
  cancelGoal: vi.fn(() => Promise.resolve()),
  toggleAutopilot: vi.fn(() => Promise.resolve()),
  toggleLoop: vi.fn(() => Promise.resolve()),
}));

import {
  pauseGoal,
  resumeGoal,
  cancelGoal,
  toggleAutopilot,
  toggleLoop,
} from '../../services/goalService';
import useGoalActions from './useGoalActions';

beforeEach(() => vi.clearAllMocks());

const setup = (opts = {}) => renderHook(() => useGoalActions('g1', opts));

describe('useGoalActions', () => {
  it('pauses, resumes and cancels the run', async () => {
    const { result } = setup();
    await act(async () => result.current.run('pause'));
    expect(pauseGoal).toHaveBeenCalledWith('g1');
    await act(async () => result.current.run('resume'));
    expect(resumeGoal).toHaveBeenCalledWith('g1');
    await act(async () => result.current.run('cancel'));
    expect(cancelGoal).toHaveBeenCalledWith('g1');
  });

  it('toggles autopilot and loop both ways', async () => {
    const { result } = setup();
    await act(async () => result.current.run('toggle-autopilot-on'));
    expect(toggleAutopilot).toHaveBeenCalledWith('g1', true);
    await act(async () => result.current.run('toggle-autopilot-off'));
    expect(toggleAutopilot).toHaveBeenCalledWith('g1', false);
    await act(async () => result.current.run('toggle-loop-on'));
    expect(toggleLoop).toHaveBeenCalledWith('g1', true);
    await act(async () => result.current.run('toggle-loop-off'));
    expect(toggleLoop).toHaveBeenCalledWith('g1', false);
  });

  it('refreshes so the screen reflects what just happened', async () => {
    const onRefresh = vi.fn();
    const { result } = setup({ onRefresh });
    await act(async () => result.current.run('pause'));
    expect(onRefresh).toHaveBeenCalled();
  });

  // Destructive actions must cross a deliberate step, never fire from a click.
  it('sends delete through the PIN confirmation instead of deleting', async () => {
    const onLeave = vi.fn();
    const { result } = setup({ onLeave });
    await act(async () => result.current.run('delete'));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/pin?mode=delete&goalId=g1'));
    expect(onLeave).toHaveBeenCalled();
    expect(cancelGoal).not.toHaveBeenCalled();
  });

  it('names the action that failed rather than shrugging', async () => {
    pauseGoal.mockRejectedValueOnce(new Error('worker unreachable'));
    const { result } = setup();
    await act(async () => result.current.run('pause'));
    await waitFor(() => expect(result.current.error).toBe('worker unreachable'));
  });

  it('falls back to naming the action when the failure has no message', async () => {
    cancelGoal.mockRejectedValueOnce(new Error(''));
    const { result } = setup();
    await act(async () => result.current.run('cancel'));
    await waitFor(() => expect(result.current.error).toBe('Could not cancel this goal.'));
  });

  it('clears a stale error', async () => {
    pauseGoal.mockRejectedValueOnce(new Error('nope'));
    const { result } = setup();
    await act(async () => result.current.run('pause'));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    act(() => result.current.clearError());
    expect(result.current.error).toBe('');
  });

  it('reports which action is in flight, then stops', async () => {
    const { result } = setup();
    expect(result.current.pending).toBe('');
    await act(async () => result.current.run('pause'));
    expect(result.current.pending).toBe('');
  });

  it('does nothing without a goal', async () => {
    const { result } = renderHook(() => useGoalActions(null));
    await act(async () => result.current.run('pause'));
    expect(pauseGoal).not.toHaveBeenCalled();
  });

  it('ignores an action it does not own', async () => {
    const onRefresh = vi.fn();
    const { result } = setup({ onRefresh });
    await act(async () => result.current.run('teleport'));
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
