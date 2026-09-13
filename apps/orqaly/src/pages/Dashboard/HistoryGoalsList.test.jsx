import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { HistoryGoalsList } from './Dashboard';

const theme = createTheme();

function makeGoals(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `g${i + 1}`,
    title: `Goal ${i + 1}`,
    status: 'completed',
    spent_usd: 0.01,
    // Descending timestamps so the list sorts as "Goal 1" first.
    created_at: `2026-06-${String(30 - i).padStart(2, '0')}T10:00:00Z`,
  }));
}

function renderList(goals, overrides = {}) {
  const props = {
    goals,
    theme,
    dateFrom: '',
    dateTo: '',
    onDateFromChange: () => {},
    onDateToChange: () => {},
    statuses: [],
    onStatusesChange: () => {},
    costMin: '',
    costMax: '',
    onCostMinChange: () => {},
    onCostMaxChange: () => {},
    search: '',
    onSearchChange: () => {},
    onOpenGoal: () => {},
    historyKind: 'goals',
    onHistoryKindChange: () => {},
    ...overrides,
  };
  const utils = render(
    <ThemeProvider theme={theme}>
      <HistoryGoalsList {...props} />
    </ThemeProvider>
  );
  const rerenderWith = (nextGoals, nextOverrides = {}) =>
    utils.rerender(
      <ThemeProvider theme={theme}>
        <HistoryGoalsList {...props} goals={nextGoals} {...nextOverrides} />
      </ThemeProvider>
    );
  return { ...utils, rerenderWith };
}

describe('HistoryGoalsList', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders only the first 10 goals but counts them all in the header', () => {
    renderList(makeGoals(30));

    expect(screen.getByText('Goal 1')).toBeInTheDocument();
    expect(screen.getByText('Goal 10')).toBeInTheDocument();
    expect(screen.queryByText('Goal 11')).not.toBeInTheDocument();
    expect(screen.getByText('30 of 30 goals')).toBeInTheDocument();
  });

  it('shows the next slice when a page number is clicked', async () => {
    renderList(makeGoals(30));

    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));

    await waitFor(() => expect(screen.getByText('Goal 11')).toBeInTheDocument());
    expect(screen.getByText('Goal 20')).toBeInTheDocument();
    expect(screen.queryByText('Goal 1')).not.toBeInTheDocument();
  });

  it('switches the page size to 25', async () => {
    renderList(makeGoals(30));

    fireEvent.click(screen.getByRole('button', { name: '10 / page' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '25 / page' }));

    await waitFor(() => expect(screen.getByText('Goal 25')).toBeInTheDocument());
    expect(screen.queryByText('Goal 26')).not.toBeInTheDocument();
  });

  it('no longer renders the old infinite-scroll summary', () => {
    renderList(makeGoals(30));
    expect(screen.queryByText(/Showing 5 of 30/)).not.toBeInTheDocument();
  });

  it('keeps the current page when a background refresh grows the goal list', async () => {
    const { rerenderWith } = renderList(makeGoals(30));

    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    await waitFor(() => expect(screen.getByText('Goal 11')).toBeInTheDocument());

    // The 10s in-flight poll swaps in a longer array; the page must survive it.
    rerenderWith(makeGoals(31));

    await waitFor(() => expect(screen.getByText('Goal 11')).toBeInTheDocument());
    expect(screen.queryByText('Goal 1')).not.toBeInTheDocument();
  });

  it('snaps back to the first page when a filter changes', async () => {
    const { rerenderWith } = renderList(makeGoals(30));

    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    await waitFor(() => expect(screen.getByText('Goal 11')).toBeInTheDocument());

    rerenderWith(makeGoals(30), { search: 'Goal' });

    await waitFor(() => expect(screen.getByText('Goal 1')).toBeInTheDocument());
  });

  it('hides the pager entirely when everything fits on one page', () => {
    renderList(makeGoals(4));

    expect(screen.getByText('Goal 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to page 2' })).not.toBeInTheDocument();
  });
});

// The row is now how a past goal is picked back up. Details keep their own
// control so the two do not fight over the same tap.
describe('HistoryGoalsList - reopening a goal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('hands the goal id to onOpenGoal when the row is clicked', () => {
    const onOpenGoal = vi.fn();
    renderList(makeGoals(3), { onOpenGoal });

    fireEvent.click(screen.getByText('Goal 2'));
    expect(onOpenGoal).toHaveBeenCalledWith('g2');
  });

  it('opens the details dialog from its own button', () => {
    const onOpenGoal = vi.fn();
    const onOpenDetails = vi.fn();
    renderList(makeGoals(3), { onOpenGoal, onOpenDetails });

    fireEvent.click(screen.getByRole('button', { name: 'Details for Goal 2' }));
    expect(onOpenDetails).toHaveBeenCalledWith('g2');
    // The row's own handler must not also fire, or details would open behind
    // a thread the user did not ask for.
    expect(onOpenGoal).not.toHaveBeenCalled();
  });

  it('draws no details button when the host does not offer one', () => {
    renderList(makeGoals(3), { onOpenGoal: vi.fn() });
    expect(screen.queryByRole('button', { name: /^Details for/ })).toBeNull();
  });
});
