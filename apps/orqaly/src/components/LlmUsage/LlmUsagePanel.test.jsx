import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mock recharts so ResponsiveContainer renders without a real layout/ResizeObserver.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-chart">{children}</div>,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: ({ children }) => <div>{children}</div>,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

const useLlmUsageMock = vi.fn();
vi.mock('../../hooks/useLlmUsage', () => ({
  useLlmUsage: (...args) => useLlmUsageMock(...args),
}));

import LlmUsagePanel from './LlmUsagePanel';

const theme = createTheme();
function Wrap({ children }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

function snapshot(overrides = {}) {
  return {
    entity: 'all',
    entityId: null,
    range: { from: '2026-05-24', to: '2026-06-23' },
    totals: {
      tokens: 12400,
      promptTokens: 8000,
      completionTokens: 4400,
      cachedTokens: 2000,
      cost: 1.2345,
      calls: 42,
      errorCalls: 2,
      errorRate: 4.8,
      avgDurationMs: 850,
      p95DurationMs: 1900,
      evaluations: 5,
      approved: 4,
      avgScore: 7.6,
      revenue: 9.5,
      budgetUsd: 50,
      spentUsd: 1.23,
    },
    byModel: [{ provider: 'openai', model: 'gpt-4o', tokens: 9000, cost: 0.9, calls: 30 }],
    byProvider: [{ provider: 'openai', tokens: 9000, cost: 0.9, calls: 30 }],
    byAgent: [{ agentId: 'a1', agentName: 'Scout', tokens: 5000, cost: 0.5, calls: 12 }],
    timeseries: [{ date: '2026-06-22', tokens: 4000, cost: 0.4, calls: 10 }],
    meta: { source: 'server', rowCount: 1 },
    source: 'server',
    ...overrides,
  };
}

function hookReturn(over = {}) {
  const data = over.data || snapshot();
  return {
    data,
    totals: data.totals,
    loading: false,
    error: null,
    refresh: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  useLlmUsageMock.mockReset();
});

describe('LlmUsagePanel', () => {
  // Assert a stat card with the given label shows the given value.
  function expectCard(label, value) {
    const card = screen.getByTestId(`stat-${label}`);
    expect(within(card).getByText(value)).toBeTruthy();
  }

  it('renders totals from a sample snapshot', () => {
    useLlmUsageMock.mockReturnValue(hookReturn());
    render(
      <Wrap>
        <LlmUsagePanel entity="all" />
      </Wrap>
    );

    // Total cost formatted as currency ($1.2345 -> $1.23).
    expectCard('Total Cost', '$1.23');
    // Compact token total.
    expectCard('Total Tokens', '12.4k');
    // Calls count.
    expectCard('Calls', '42');
    // Error rate percent.
    expectCard('Error Rate', '4.8%');
  });

  it('renders a By Model row with name, calls, tokens and cost', () => {
    useLlmUsageMock.mockReturnValue(hookReturn());
    render(
      <Wrap>
        <LlmUsagePanel entity="all" />
      </Wrap>
    );

    expect(screen.getByText('By Model')).toBeTruthy();
    expect(screen.getByText('gpt-4o')).toBeTruthy();
    // Thousands-separated tokens (appears in the By Model row).
    expect(screen.getAllByText('9,000').length).toBeGreaterThan(0);
  });

  it('shows skeletons while loading', () => {
    useLlmUsageMock.mockReturnValue(hookReturn({ loading: true }));
    const { container } = render(
      <Wrap>
        <LlmUsagePanel entity="all" />
      </Wrap>
    );
    expect(container.querySelector('.MuiSkeleton-root')).toBeTruthy();
  });

  it('renders an empty snapshot gracefully and surfaces an unreachable notice', () => {
    const empty = snapshot({
      totals: {
        tokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        cost: 0,
        calls: 0,
        errorCalls: 0,
        errorRate: 0,
        avgDurationMs: 0,
        p95DurationMs: 0,
        evaluations: 0,
        approved: 0,
        avgScore: 0,
        revenue: 0,
        budgetUsd: 0,
        spentUsd: 0,
      },
      byModel: [],
      byProvider: [],
      byAgent: [],
      timeseries: [],
      source: 'client',
      meta: { source: 'client', rowCount: 0 },
    });
    useLlmUsageMock.mockReturnValue(hookReturn({ data: empty }));
    render(
      <Wrap>
        <LlmUsagePanel entity="all" />
      </Wrap>
    );

    expect(screen.getByText(/unreachable/i)).toBeTruthy();
    expect(screen.getByText('No model usage in range')).toBeTruthy();
  });

  it('renders an error message when the hook reports an error', () => {
    useLlmUsageMock.mockReturnValue(hookReturn({ error: new Error('Usage session expired') }));
    render(
      <Wrap>
        <LlmUsagePanel entity="all" />
      </Wrap>
    );
    expect(screen.getByText(/Usage session expired/i)).toBeTruthy();
  });

  it('calls refresh when the refresh button is clicked', () => {
    const refresh = vi.fn();
    useLlmUsageMock.mockReturnValue(hookReturn({ refresh }));
    render(
      <Wrap>
        <LlmUsagePanel entity="all" />
      </Wrap>
    );
    fireEvent.click(screen.getByLabelText('Refresh'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('prompts for an id and disables fetching for a scoped entity with no id', () => {
    useLlmUsageMock.mockReturnValue(hookReturn());
    render(
      <Wrap>
        <LlmUsagePanel entity="goal" />
      </Wrap>
    );
    // Shows the prompt instead of the (would-be-empty) dashboard.
    expect(screen.getByTestId('usage-needs-id')).toBeTruthy();
    expect(screen.queryByTestId('stat-Total Cost')).toBeNull();
    // The hook is told not to fetch, so no 400 is triggered.
    expect(useLlmUsageMock).toHaveBeenCalledWith(
      'goal',
      expect.objectContaining({ enabled: false })
    );
  });

  it('fetches and renders the dashboard when a scoped entity has an id', () => {
    useLlmUsageMock.mockReturnValue(hookReturn());
    render(
      <Wrap>
        <LlmUsagePanel entity="goal" entityId="g-123" />
      </Wrap>
    );
    expect(useLlmUsageMock).toHaveBeenCalledWith(
      'goal',
      expect.objectContaining({ id: 'g-123', enabled: true })
    );
    expect(screen.getByTestId('stat-Total Cost')).toBeTruthy();
    expect(screen.queryByTestId('usage-needs-id')).toBeNull();
  });
});
