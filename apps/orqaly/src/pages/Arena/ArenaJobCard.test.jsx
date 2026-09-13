import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import ArenaJobCard from './ArenaJobCard';

const theme = createTheme();

const BASE = {
  taskId: 'task-1',
  title: 'SMM pack, week 34',
  department: 'marketing',
  departmentLabel: 'Marketing',
  deadline: '2026-08-21',
  goalTitle: 'Q3 Launch',
  status: 'done',
  assignedTo: 'Ilona R.',
  agent: { id: 'a1', name: 'Marta Liepa', role: 'SMM Manager' },
  people: {
    actor_name: 'Ilona R.',
    actor_role: 'SMM Manager',
    rating: 4,
    cost_usd: 142,
    minutes_spent: 190,
    outcome: 'accepted',
    assets: [{ name: 'captions.docx', kind: 'file' }],
    registered_at: '2026-08-20T16:40:00Z',
  },
  agents: {
    actor_name: 'Marta Liepa',
    actor_role: 'SMM Manager',
    rating: 5,
    cost_usd: 0.35,
    minutes_spent: 4,
    outcome: 'accepted',
    run: { mode: 'mirror' },
    assets: [{ name: 'schedule.csv', kind: 'file' }],
    registered_at: '2026-08-20T09:12:00Z',
  },
  verdict: 'agents',
  savings: { money: 141.65, minutes: 186 },
};

function setup(props = {}) {
  const handlers = { onOpen: vi.fn(), onAction: vi.fn(), onRate: vi.fn(), onVerdict: vi.fn() };
  render(
    <ThemeProvider theme={theme}>
      <ArenaJobCard job={BASE} {...handlers} {...props} />
    </ThemeProvider>
  );
  return handlers;
}

describe('ArenaJobCard', () => {
  it('shows the job, its department and its deadline', () => {
    setup();
    expect(screen.getByText('SMM pack, week 34')).toBeInTheDocument();
    expect(screen.getByText('Marketing')).toBeInTheDocument();
    // The date follows the viewer's locale, so assert the parts, not the order.
    expect(screen.getByText(/^due .*(21|Aug).*(Aug|21)/)).toBeInTheDocument();
  });

  it('renders both corners', () => {
    setup();
    expect(screen.getByTestId('arena-side-people')).toBeInTheDocument();
    expect(screen.getByTestId('arena-side-agents')).toBeInTheDocument();
    expect(screen.getByText('Ilona R.')).toBeInTheDocument();
    expect(screen.getByText('Marta Liepa')).toBeInTheDocument();
  });

  it('puts the cost and time of each side on the card', () => {
    setup();
    expect(screen.getByText('€142.00')).toBeInTheDocument();
    expect(screen.getByText('€0.35')).toBeInTheDocument();
    expect(screen.getByText('3h 10m')).toBeInTheDocument();
    expect(screen.getByText('4m')).toBeInTheDocument();
  });

  it('says what the agents saved when both sides delivered', () => {
    setup();
    expect(screen.getByText(/agents saved/)).toBeInTheDocument();
    expect(screen.getByText(/€141\.65/)).toBeInTheDocument();
  });

  it('sits side by side by default and stacks when told to', () => {
    const { unmount } = render(
      <ThemeProvider theme={theme}>
        <ArenaJobCard job={BASE} />
      </ThemeProvider>
    );
    expect(screen.getByTestId('arena-corners')).toHaveAttribute('data-layout', 'split');
    unmount();

    render(
      <ThemeProvider theme={theme}>
        <ArenaJobCard job={BASE} stacked />
      </ThemeProvider>
    );
    expect(screen.getByTestId('arena-corners')).toHaveAttribute('data-layout', 'stacked');
  });

  it('keeps the people corner first in reading order when stacked', () => {
    setup({ stacked: true });
    const corners = screen.getByTestId('arena-corners');
    const order = [...corners.children].map((c) => c.getAttribute('data-testid'));
    expect(order).toEqual(['arena-side-people', 'arena-side-agents']);
  });

  it('records a verdict', () => {
    const { onVerdict } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'People' }));
    expect(onVerdict).toHaveBeenCalledWith('task-1', 'people');
  });

  it('offers to register a result when nobody delivered on the people side', () => {
    const { onAction } = setup({ job: { ...BASE, people: null, savings: null } });
    expect(screen.getByText('Nothing registered yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Register a result/i }));
    expect(onAction).toHaveBeenCalledWith('people');
  });

  it('offers to run the agent when it has not delivered', () => {
    const { onAction } = setup({ job: { ...BASE, agents: null, savings: null } });
    expect(screen.getByText('The agent has not run this')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Run the agent/i }));
    expect(onAction).toHaveBeenCalledWith('agents');
  });

  it('hides the verdict until both corners have delivered', () => {
    setup({ job: { ...BASE, people: null, verdict: null, savings: null } });
    expect(screen.queryByRole('button', { name: 'Tie' })).not.toBeInTheDocument();
  });

  it('shows which mode the agent ran in, so two runs are never confused', () => {
    setup();
    expect(screen.getByText('mirrored task')).toBeInTheDocument();
  });

  it('flags an estimated time so it is not read as measured effort', () => {
    setup({ job: { ...BASE, people: { ...BASE.people, minutes_derived: true } } });
    expect(screen.getByText('3h 10m*')).toBeInTheDocument();
  });

  it('surfaces a result that had to be redone', () => {
    setup({ job: { ...BASE, agents: { ...BASE.agents, outcome: 'rework', reworked_count: 2 } } });
    expect(screen.getByText('sent back 2x')).toBeInTheDocument();
  });
});
