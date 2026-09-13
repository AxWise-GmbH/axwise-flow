import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import BudgetTab from './BudgetTab';

const theme = createTheme();

vi.mock('@mui/material', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useMediaQuery: () => true,
  };
});

const sampleGoal = {
  budget_usd: 35,
  spent_usd: 0,
  agentBudget: [
    {
      name: 'Opus Sub',
      completed: 2,
      tasks: 2,
      spent: 0,
      failed: 0,
      avgQuality: 22,
    },
  ],
  phaseBudget: [
    {
      phaseIndex: 0,
      phaseName: 'Planning feasibility and restyled landing page deployment by PM',
      cost: 0,
      qualityScore: 22,
      status: 'completed',
    },
  ],
};

describe('BudgetTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders mobile-friendly phase cards without table headers', () => {
    render(
      <ThemeProvider theme={theme}>
        <BudgetTab goal={sampleGoal} />
      </ThemeProvider>
    );

    expect(screen.getByText(/Cost.*by Phase/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Planning feasibility and restyled landing page deployment by PM/)
    ).toBeInTheDocument();
    expect(screen.getAllByText('22/100').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Status' })).not.toBeInTheDocument();
  });

  it('renders summary cards in a compact grid', () => {
    render(
      <ThemeProvider theme={theme}>
        <BudgetTab goal={sampleGoal} />
      </ThemeProvider>
    );

    expect(screen.getByText('Total Budget')).toBeInTheDocument();
    expect(screen.getByText('Remaining')).toBeInTheDocument();
    expect(screen.getAllByText('$35.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Opus Sub')).toBeInTheDocument();
  });
});
