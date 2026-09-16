import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';

import MetricsToggleButton from './MetricsToggleButton';

function renderButton(props = {}) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MetricsToggleButton showMetrics onToggle={() => {}} {...props} />
    </ThemeProvider>,
  );
}

describe('MetricsToggleButton', () => {
  it('always renders the static "Metrics" label, never Show/Hide', () => {
    const { rerender } = renderButton({ showMetrics: true });
    expect(screen.getByRole('button', { name: /metrics/i })).toBeInTheDocument();
    expect(screen.getByText('Metrics')).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={createTheme()}>
        <MetricsToggleButton showMetrics={false} onToggle={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Metrics')).toBeInTheDocument();
    expect(screen.queryByText(/show metrics/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hide metrics/i)).not.toBeInTheDocument();
  });

  it('reflects open/closed state via aria-expanded', () => {
    const { rerender } = renderButton({ showMetrics: true });
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');

    rerender(
      <ThemeProvider theme={createTheme()}>
        <MetricsToggleButton showMetrics={false} onToggle={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    renderButton({ showMetrics: true, onToggle });
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
