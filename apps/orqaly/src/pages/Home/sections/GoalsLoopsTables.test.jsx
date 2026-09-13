import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import GoalsLoopsTables from './GoalsLoopsTables';

// The detail dialogs are heavy and pull in app contexts; stub them so this test
// can assert only that the right one opens with the right id/agent.
vi.mock('../../../components/Goals/GoalDetailDialog', () => ({
  default: ({ open, goalId }) => (open ? <div>goal-dialog:{goalId}</div> : null),
}));
vi.mock('../../../components/AgentHub/AgentDetailDialog', () => ({
  default: ({ open, agent }) => (open ? <div>agent-dialog:{agent?.name}</div> : null),
}));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const theme = createTheme();
const Wrap = ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;

const loops = {
  total: 2,
  rows: [
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
      started_at: '2026-06-02T14:05:00Z',
    },
  ],
};

describe('GoalsLoopsTables goals table', () => {
  const goals = {
    total: 2,
    rows: [
      {
        _id: 'goal-1',
        goal: 'Grow revenue',
        status: 'Active',
        phase: { current: 2, total: 4, title: 'Work Log' },
        date: '27.06\n14:23:11',
      },
      {
        _id: 'goal-2',
        goal: 'Cut costs',
        status: 'Active',
        phase: { current: 4, total: 4, title: 'Result' },
        date: '26.06\n09:41:55',
      },
    ],
  };

  it('opens the goal detail dialog when a goal row is clicked', () => {
    render(
      <Wrap>
        <GoalsLoopsTables goals={goals} loops={{ rows: [] }} />
      </Wrap>
    );
    fireEvent.click(screen.getByText('Grow revenue'));
    expect(screen.getByText('goal-dialog:goal-1')).toBeInTheDocument();
  });

  it('shows a Date column instead of the rank "#" column', () => {
    render(
      <Wrap>
        <GoalsLoopsTables goals={goals} loops={{ rows: [] }} />
      </Wrap>
    );
    // RankedTable renders the raw column key ("date") and capitalizes it via CSS.
    expect(screen.getByText(/^date$/i)).toBeInTheDocument();
    expect(screen.queryByText('#')).not.toBeInTheDocument();
    // Date and time are stacked (newline); testing-library normalizes it to a space.
    expect(screen.getByText('27.06 14:23:11')).toBeInTheDocument();
  });

  it('renders a Phase column (not Completion) with an N/4 lifecycle indicator', () => {
    render(
      <Wrap>
        <GoalsLoopsTables goals={goals} loops={{ rows: [] }} />
      </Wrap>
    );
    // RankedTable renders the raw column key ("phase") and capitalizes it via CSS,
    // so match case-insensitively.
    expect(screen.getByText(/^phase$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^completion$/i)).not.toBeInTheDocument();
    // The phase is shown as an "N/4" indicator, with the stage name as a tooltip.
    expect(screen.getByText('2/4')).toBeInTheDocument();
    expect(screen.getByText('4/4')).toBeInTheDocument();
    expect(screen.getByTitle('Work Log')).toBeInTheDocument();
  });
});

describe('GoalsLoopsTables loops table', () => {
  it('renders the Agent / Goal / Loops / Started columns and loop counts', () => {
    render(
      <Wrap>
        <GoalsLoopsTables goals={{ rows: [] }} loops={loops} />
      </Wrap>
    );
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('Loops')).toBeInTheDocument();
    expect(screen.getByText('Started')).toBeInTheDocument();
    expect(screen.getByText('Growth Agent')).toBeInTheDocument();
    expect(screen.getByText('3/5')).toBeInTheDocument();
    // dd.mm.yy hh:mm (local time — assert the format, not a tz-specific value)
    expect(screen.getAllByText(/^\d{2}\.\d{2}\.\d{2} \d{2}:\d{2}$/).length).toBe(2);
  });

  it('opens the goal dialog when a goal is clicked', () => {
    render(
      <Wrap>
        <GoalsLoopsTables goals={{ rows: [] }} loops={loops} />
      </Wrap>
    );
    fireEvent.click(screen.getByText('Grow revenue'));
    expect(screen.getByText('goal-dialog:g1')).toBeInTheDocument();
  });

  it('opens the agent dialog when an agent with an id is clicked', () => {
    render(
      <Wrap>
        <GoalsLoopsTables goals={{ rows: [] }} loops={loops} />
      </Wrap>
    );
    fireEvent.click(screen.getByText('Growth Agent'));
    expect(screen.getByText('agent-dialog:Growth Agent')).toBeInTheDocument();
  });

  it('does not make an unassigned agent clickable', () => {
    render(
      <Wrap>
        <GoalsLoopsTables goals={{ rows: [] }} loops={loops} />
      </Wrap>
    );
    const unassigned = screen.getByText('Unassigned');
    expect(unassigned.closest('button')).toBeNull();
  });
});
