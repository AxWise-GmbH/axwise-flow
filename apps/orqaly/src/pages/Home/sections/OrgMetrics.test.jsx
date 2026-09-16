import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import OrgMetrics from './OrgMetrics';

beforeAll(() => {
  // Reduced-motion = land on final values immediately (no rAF count-up) and
  // treat content as in-view, so assertions are deterministic.
  window.matchMedia = (query) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
});

const theme = createTheme();
const Wrap = ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;

const metrics = { units: 0, teams: 0, consilium: 1, agents: 0, tools: 18, tasks: 0 };

describe('OrgMetrics', () => {
  it('renders a bar for each metric with its label and value', () => {
    render(
      <Wrap>
        <OrgMetrics metrics={metrics} />
      </Wrap>
    );
    for (const label of ['Units', 'Teams', 'Consilium', 'Agents', 'Tools', 'Tasks']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    // The four zero metrics all render "0".
    expect(screen.getAllByText('0').length).toBe(4);
  });

  it('fires onMetricClick with the metric key when a bar is clicked', () => {
    const onMetricClick = vi.fn();
    render(
      <Wrap>
        <OrgMetrics metrics={metrics} onMetricClick={onMetricClick} />
      </Wrap>
    );
    fireEvent.click(screen.getByText('Tools').closest('button'));
    expect(onMetricClick).toHaveBeenCalledWith('tools');
  });

  it('renders skeletons while loading', () => {
    const { container } = render(
      <Wrap>
        <OrgMetrics loading />
      </Wrap>
    );
    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
  });
});
