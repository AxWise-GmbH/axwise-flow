import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import AgentCostTokenStat from './AgentCostTokenStat';

vi.mock('../Goals/ReportMetricCell', () => ({
  default: ({ costUsd, tokens }) => (
    <div data-testid="metric-cell">
      <span>${Number(costUsd).toFixed(4)}</span>
      <span>{tokens} tokens</span>
    </div>
  ),
}));

const theme = createTheme();

describe('AgentCostTokenStat', () => {
  it('renders label with stacked cost and tokens', () => {
    render(
      <ThemeProvider theme={theme}>
        <AgentCostTokenStat costUsd={0.2} tokens={0} color={theme.palette.info.main} />
      </ThemeProvider>
    );
    expect(screen.getByText('Cost/Task')).toBeInTheDocument();
    expect(screen.getByText('$0.2000')).toBeInTheDocument();
    expect(screen.getByText('0 tokens')).toBeInTheDocument();
  });
});
