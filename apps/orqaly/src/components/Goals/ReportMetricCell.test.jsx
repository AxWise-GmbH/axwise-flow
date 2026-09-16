import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import ReportMetricCell from './ReportMetricCell';

vi.mock('../Common/FormDialog', () => ({
  default: ({ open, title, children, onPrimary }) =>
    open ? (
      <div data-testid="metric-dialog">
        <h2>{title}</h2>
        <div>{children}</div>
        <button type="button" onClick={onPrimary}>
          Close
        </button>
      </div>
    ) : null,
}));

const theme = createTheme();

describe('ReportMetricCell', () => {
  it('renders stacked cost and zero tokens', () => {
    render(
      <ThemeProvider theme={theme}>
        <ReportMetricCell costUsd={0} tokens={0} />
      </ThemeProvider>
    );
    expect(screen.getByText('$0.0000')).toBeInTheDocument();
    expect(screen.getByText('0 tokens')).toBeInTheDocument();
  });

  it('opens info dialog when info icon clicked', () => {
    render(
      <ThemeProvider theme={theme}>
        <ReportMetricCell
          costUsd={0}
          tokens={0}
          tokenInfo={{ title: 'Tokens not tracked', body: 'Historical goal explanation.' }}
        />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByLabelText('Why is this value zero?'));
    expect(screen.getByTestId('metric-dialog')).toBeInTheDocument();
    expect(screen.getByText('Tokens not tracked')).toBeInTheDocument();
    expect(screen.getByText('Historical goal explanation.')).toBeInTheDocument();
  });
});
