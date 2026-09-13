import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Stub the heavy detail dialogs.
vi.mock('../../components/Goals/GoalDetailDialog', () => ({
  default: ({ open, goalId }) => (open ? <div>goal-dialog:{goalId}</div> : null),
}));
vi.mock('../../components/AgentHub/AgentDetailDialog', () => ({
  default: ({ open, agent }) => (open ? <div>agent-dialog:{agent?.name}</div> : null),
}));

vi.mock('../../services/goalService', () => ({
  getLoops: vi.fn(),
  pauseGoal: vi.fn(async () => ({})),
  resumeGoal: vi.fn(async () => ({})),
  cancelGoal: vi.fn(async () => ({})),
  updateLoopSettings: vi.fn(async () => ({})),
}));

import {
  getLoops,
  pauseGoal,
  resumeGoal,
  cancelGoal,
  updateLoopSettings,
} from '../../services/goalService';
import LoopsTab from './LoopsTab';

const theme = createTheme();
const Wrap = ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;

const LOOPS = [
  {
    loop_id: 'g1',
    goal_id: 'g1',
    goal_title: 'Grow revenue',
    agent_id: 'a1',
    agent_name: 'Growth Agent',
    agent_role: 'Growth',
    loops: 3,
    max_loops: 5,
    status: 'active',
    loop_paused: false,
    loop_advanced: false,
    loop_settings: null,
    loop_depth: 1,
    chain_spend_usd: 4.2,
    started_at: '2026-06-01T09:30:00Z',
  },
  {
    loop_id: 'g2',
    goal_id: 'g2',
    goal_title: 'Cut costs',
    agent_id: null,
    agent_name: 'Unassigned',
    agent_role: '',
    loops: 1,
    max_loops: 0,
    status: 'paused',
    loop_paused: true,
    loop_advanced: true,
    loop_settings: { chain_budget_cap_usd: 20, hitl_every: 2 },
    loop_depth: 3,
    chain_spend_usd: 12.5,
    started_at: '2026-06-02T14:05:00Z',
  },
];

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  getLoops.mockResolvedValue(LOOPS);
});

function renderTab(props = {}) {
  return render(
    <Wrap>
      <LoopsTab theme={theme} isDark={false} {...props} />
    </Wrap>
  );
}

describe('LoopsTab', () => {
  it('renders loop rows with short ids and loop counts', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('Growth Agent')).toBeInTheDocument());
    expect(screen.getByText('3/5')).toBeInTheDocument();
    // Loop ID + Goal ID both show the 8-char short id.
    expect(screen.getAllByText('g1').length).toBeGreaterThan(0);
  });

  it('reports loop stat cards to the parent', async () => {
    const onStatsChange = vi.fn();
    renderTab({ onStatsChange });
    await waitFor(() => expect(onStatsChange).toHaveBeenCalled());
    const cards = onStatsChange.mock.calls.at(-1)[0];
    const byLabel = Object.fromEntries(cards.map((c) => [c.label, c.value]));
    expect(byLabel).toMatchObject({ 'Total Loops': 2, Active: 1, Paused: 1, Agents: 1 });
  });

  it('pauses an active loop', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('Growth Agent')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Pause loop' }));
    await waitFor(() => expect(pauseGoal).toHaveBeenCalledWith('g1'));
  });

  it('resumes a paused loop', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('Unassigned')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Resume loop' }));
    await waitFor(() => expect(resumeGoal).toHaveBeenCalledWith('g2'));
  });

  it('deletes a loop after confirmation (cancels the goal)', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('Growth Agent')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete loop' })[0]);
    // Confirm dialog
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(cancelGoal).toHaveBeenCalledWith('g1'));
  });

  it('opens the loop review dialog from the Review control', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('Growth Agent')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: 'Review loop' })[0]);
    // The dedicated Loop Review dialog (not the full goal dialog) opens.
    await waitFor(() => expect(screen.getByText('Open goal')).toBeInTheDocument());
  });

  it('opens the loop review dialog when a row is clicked', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('Growth Agent')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Growth Agent').closest('tr'));
    await waitFor(() => expect(screen.getByText('Open goal')).toBeInTheDocument());
  });

  it('renders the Advanced badge reflecting loop_advanced', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('Growth Agent')).toBeInTheDocument());
    expect(screen.getByText('Advanced: OFF')).toBeInTheDocument();
    expect(screen.getByText('Advanced: ON')).toBeInTheDocument();
  });

  it('toggles Advanced via updateLoopSettings when the badge is clicked', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('Growth Agent')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Advanced: OFF'));
    await waitFor(() =>
      expect(updateLoopSettings).toHaveBeenCalledWith('g1', { loop_advanced: true })
    );
  });

  it('shows the advanced controls panel only for loops with Advanced on', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('Growth Agent')).toBeInTheDocument());
    // g2 has loop_advanced true -> its panel (and paused reason) is visible.
    expect(screen.getByText('Advanced loop controls')).toBeInTheDocument();
    expect(screen.getByLabelText('Chain budget cap ($)')).toBeInTheDocument();
  });
});
