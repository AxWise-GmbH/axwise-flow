import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import TokenByPhaseChart from './TokenByPhaseChart';

const theme = createTheme();

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-chart">{children}</div>,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

describe('TokenByPhaseChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders cost-only heading when no token data', () => {
    render(
      <ThemeProvider theme={theme}>
        <TokenByPhaseChart
          goal={{
            phaseBudget: [
              { phaseName: 'Planning', phaseIndex: -1, cost: 0.01, status: 'completed' },
            ],
          }}
        />
      </ThemeProvider>
    );

    expect(screen.getByText('Cost by Phase')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-chart')).toBeInTheDocument();
    expect(screen.queryByText(/Token data unavailable/i)).not.toBeInTheDocument();
  });

  it('shows tokens heading when tokenSummary has llm info', () => {
    render(
      <ThemeProvider theme={theme}>
        <TokenByPhaseChart
          goal={{
            tokenSummary: {
              hasTokenData: false,
              hasLlmInfo: true,
              totalTokens: 0,
              totalTokenCostUsd: 0,
            },
            phaseBudget: [
              {
                phaseName: 'Build',
                phaseIndex: 0,
                cost: 0.01,
                tokens: 0,
                tokenCostUsd: 0,
                status: 'completed',
              },
            ],
          }}
        />
      </ThemeProvider>
    );

    expect(screen.getByText('Tokens & Cost by Phase')).toBeInTheDocument();
  });
});
