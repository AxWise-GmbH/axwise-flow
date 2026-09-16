import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import GoalWorkLog from './GoalWorkLog';

vi.mock('../../services/budgetRequestService', () => ({
  listBudgetRequests: vi.fn(async () => []),
  reviewBudgetRequest: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  hasSupabase: vi.fn(() => false),
  supabase: {},
}));

describe('GoalWorkLog active task counters', () => {
  it('excludes cancelled and superseded rows from totals, phases, and visible work', async () => {
    const goal = {
      id: 'goal-1',
      status: 'active',
      data: { axwise_orchestration: { decision_id: 'decision-1' } },
      plan: { phases: [{ name: 'Commercial design', status: 'executing', jobs: [] }] },
    };
    const tasks = [
      {
        id: 'retired-cancelled',
        title: 'Cancelled old task',
        status: 'cancelled',
        data: { phase_index: 0, axwise_decision_id: 'decision-1' },
      },
      {
        id: 'retired-superseded',
        title: 'Superseded old task',
        status: 'superseded',
        data: { phase_index: 0, axwise_decision_id: 'decision-1' },
      },
      {
        id: 'current-done',
        title: 'Current completed task',
        status: 'done',
        data: { phase_index: 0, axwise_decision_id: 'decision-1' },
      },
      {
        id: 'current-todo',
        title: 'Current pending task',
        status: 'todo',
        data: { phase_index: 0, axwise_decision_id: 'decision-1' },
      },
    ];
    const documents = [
      {
        id: 'foundational-plan',
        title: 'Current planning context',
        category: 'goal-plan',
        metadata: { goal_id: 'goal-1' },
      },
      {
        id: 'retired-output',
        title: 'Retired phase output',
        category: 'goal-output',
        metadata: { goal_id: 'goal-1', axwise_decision_id: 'decision-old' },
      },
      {
        id: 'current-output',
        title: 'Current phase output',
        category: 'goal-output',
        metadata: { goal_id: 'goal-1', axwise_decision_id: 'decision-1' },
      },
    ];

    render(
      <ThemeProvider theme={createTheme()}>
        <GoalWorkLog goal={goal} tasks={tasks} documents={documents} />
      </ThemeProvider>
    );

    expect(await screen.findByText('1/2 tasks')).toBeDefined();
    expect(screen.getAllByText('1/2').length).toBeGreaterThan(0);
    expect(screen.getByText('Current completed task')).toBeDefined();
    expect(screen.getByText('Current pending task')).toBeDefined();
    expect(screen.queryByText('Cancelled old task')).toBeNull();
    expect(screen.queryByText('Superseded old task')).toBeNull();
    expect(screen.getByText('Current planning context')).toBeDefined();
    expect(screen.getByText('Current phase output')).toBeDefined();
    expect(screen.queryByText('Retired phase output')).toBeNull();
  });
});
