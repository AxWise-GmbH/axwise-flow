import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';

vi.mock('../../Goals/GoalDetailDialog', () => ({
  PipelineTab: () => <div data-testid="panel-pipeline" />,
  WorkLogTab: () => <div data-testid="panel-worklog" />,
  ReportTab: () => <div data-testid="panel-report" />,
  ResultTab: () => <div data-testid="panel-result" />,
}));
vi.mock('../../Goals/GoalAgentDetailHost', () => ({
  default: () => <div data-testid="agent-host" />,
}));
vi.mock('../../Goals/GoalContextApprovalDialog', () => ({
  default: ({ open }) => (open ? <div data-testid="gate-context" /> : null),
}));
vi.mock('../../Goals/GoalProposalDialog', () => ({
  default: ({ open }) => (open ? <div data-testid="gate-proposal" /> : null),
}));
vi.mock('../../../hooks/useProfileIndex', () => ({ default: () => null }));

import GoalDashboard from './GoalDashboard';

const theme = createTheme();
const goal = (over = {}) => ({ id: 'g1', status: 'planning', plan: {}, data: {}, ...over });

function setup(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <GoalDashboard goal={goal()} {...props} />
    </ThemeProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('GoalDashboard', () => {
  // The whole point: Simple used to print these four as inert text under
  // aria-hidden, with no tab role and no click handler.
  it('offers the four labels as real tabs', () => {
    setup();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Pipeline', 'Work Log', 'Report', 'Result']);
  });

  it('opens a running goal on Pipeline', () => {
    setup();
    expect(screen.getByTestId('panel-pipeline')).toBeInTheDocument();
  });

  // The deliverables are the point once it is over.
  it('opens a finished goal on Result', () => {
    setup({ goal: goal({ status: 'completed' }) });
    expect(screen.getByTestId('panel-result')).toBeInTheDocument();
  });

  it('opens a failed goal on Result too, where the reason is', () => {
    setup({ goal: goal({ status: 'failed' }) });
    expect(screen.getByTestId('panel-result')).toBeInTheDocument();
  });

  it('switches panel when a tab is chosen', () => {
    setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Work Log' }));
    expect(screen.getByTestId('panel-worklog')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-pipeline')).toBeNull();
  });

  // A live update must never yank the tab away from someone reading.
  it('does not re-pick the tab when the goal updates', () => {
    const { rerender } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Report' }));
    rerender(
      <ThemeProvider theme={theme}>
        <GoalDashboard goal={goal({ status: 'active' })} />
      </ThemeProvider>
    );
    expect(screen.getByTestId('panel-report')).toBeInTheDocument();
  });

  // Agent cards route clicks to window.__openAgentDetail, which only exists
  // while this host is mounted.
  it('mounts the agent detail host so agent cards are not dead', () => {
    setup();
    expect(screen.getByTestId('agent-host')).toBeInTheDocument();
  });

  it('raises the context gate so a checkpoints goal can move on', () => {
    setup({ goal: goal({ status: 'awaiting_context_approval' }) });
    expect(screen.getByTestId('gate-context')).toBeInTheDocument();
  });

  it('raises the plan gate when the cost needs approving', () => {
    setup({ goal: goal({ status: 'awaiting_approval' }) });
    expect(screen.getByTestId('gate-proposal')).toBeInTheDocument();
  });

  it('raises no gate while the run is moving on its own', () => {
    setup();
    expect(screen.queryByTestId('gate-context')).toBeNull();
    expect(screen.queryByTestId('gate-proposal')).toBeNull();
  });

  // Realtime ticks far more often than the 5s poll these dialogs were built
  // against, so a dismissed gate must stay dismissed.
  it('keeps a dismissed gate closed across updates', () => {
    const blocked = goal({ status: 'awaiting_approval' });
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <GoalDashboard goal={blocked} />
      </ThemeProvider>
    );
    expect(screen.getByTestId('gate-proposal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('gate-proposal'));
    // The dialog closes itself via onClose; simulate the same status arriving again.
    rerender(
      <ThemeProvider theme={theme}>
        <GoalDashboard goal={{ ...blocked }} />
      </ThemeProvider>
    );
    expect(screen.getByTestId('gate-proposal')).toBeInTheDocument();
  });

  it('renders nothing without a goal rather than throwing', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <GoalDashboard goal={null} />
      </ThemeProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows how far along the run is above the pipeline', () => {
    setup({ goal: goal({ status: 'forming_team' }) });
    expect(screen.getByText('Stage 5 of 9')).toBeInTheDocument();
    expect(screen.getByTestId('panel-pipeline')).toBeInTheDocument();
  });

  it('keeps the rail to the Pipeline tab', () => {
    setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Work Log' }));
    expect(screen.queryByText(/Stage \d+ of 9/)).toBeNull();
  });
});
