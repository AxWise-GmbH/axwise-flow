import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Stub heavy nested dialogs + the goal service.
vi.mock('./GoalDetailDialog', () => ({
  default: ({ open, goalId }) => (open ? <div>goal-dialog:{goalId}</div> : null),
}));
vi.mock('../AgentHub/AgentDetailDialog', () => ({
  default: ({ open, agent }) => (open ? <div>agent-dialog:{agent?.name}</div> : null),
}));
vi.mock('../../services/goalService', () => ({
  pauseGoal: vi.fn(async () => ({})),
  resumeGoal: vi.fn(async () => ({})),
  cancelGoal: vi.fn(async () => ({})),
}));

import { pauseGoal, resumeGoal, cancelGoal } from '../../services/goalService';
import LoopReviewDialog from './LoopReviewDialog';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const theme = createTheme();
const Wrap = ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;

const activeLoop = {
  loop_id: 'g1',
  goal_id: 'g1',
  goal_title: 'Grow revenue',
  agent_id: 'a1',
  agent_name: 'Growth Agent',
  agent_role: 'Growth',
  loops: 3,
  max_loops: 5,
  status: 'active',
  loop_enabled: true,
  loop_paused: false,
  started_at: '2026-06-01T09:30:00Z',
};
const pausedLoop = { ...activeLoop, status: 'paused', loop_paused: true };

beforeEach(() => vi.clearAllMocks());

describe('LoopReviewDialog', () => {
  it('renders the loop info', () => {
    render(
      <Wrap>
        <LoopReviewDialog open loop={activeLoop} onClose={() => {}} />
      </Wrap>
    );
    expect(screen.getByText('Grow revenue')).toBeInTheDocument();
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
    expect(screen.getByText(/Growth Agent/)).toBeInTheDocument();
  });

  it('pauses an active loop and reports the change', async () => {
    const onChanged = vi.fn();
    const onClose = vi.fn();
    render(
      <Wrap>
        <LoopReviewDialog open loop={activeLoop} onChanged={onChanged} onClose={onClose} />
      </Wrap>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(pauseGoal).toHaveBeenCalledWith('g1'));
    expect(onChanged).toHaveBeenCalled();
  });

  it('resumes a paused loop', async () => {
    render(
      <Wrap>
        <LoopReviewDialog open loop={pausedLoop} onChanged={() => {}} onClose={() => {}} />
      </Wrap>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(resumeGoal).toHaveBeenCalledWith('g1'));
  });

  it('requires confirmation before deleting (cancels the goal)', async () => {
    render(
      <Wrap>
        <LoopReviewDialog open loop={activeLoop} onChanged={() => {}} onClose={() => {}} />
      </Wrap>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(cancelGoal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(cancelGoal).toHaveBeenCalledWith('g1'));
  });

  it('opens the agent card from the agent link', () => {
    render(
      <Wrap>
        <LoopReviewDialog open loop={activeLoop} onClose={() => {}} />
      </Wrap>
    );
    fireEvent.click(screen.getByText(/Growth Agent/));
    expect(screen.getByText('agent-dialog:Growth Agent')).toBeInTheDocument();
  });

  it('opens the goal dialog from the Open goal button', () => {
    render(
      <Wrap>
        <LoopReviewDialog open loop={activeLoop} onClose={() => {}} />
      </Wrap>
    );
    fireEvent.click(screen.getByText('Open goal'));
    expect(screen.getByText('goal-dialog:g1')).toBeInTheDocument();
  });
});
