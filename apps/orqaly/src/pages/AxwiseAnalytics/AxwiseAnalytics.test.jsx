import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const health = { totals: {} };
const impact = { totals: {}, byOperation: [] };
const fetchAxwiseHealth = vi.fn(() => Promise.resolve(health));
const fetchAxwiseImpact = vi.fn(() => Promise.resolve(impact));
vi.mock('../../services/axwiseAnalyticsService', () => ({
  fetchAxwiseHealth: (...a) => fetchAxwiseHealth(...a),
  fetchAxwiseImpact: (...a) => fetchAxwiseImpact(...a),
}));

import AxwiseAnalytics from './AxwiseAnalytics';

const theme = createTheme();
function renderPage() {
  return render(
    <ThemeProvider theme={theme}>
      <AxwiseAnalytics />
    </ThemeProvider>
  );
}

describe('AxwiseAnalytics', () => {
  beforeEach(() => {
    health.totals = {};
    impact.totals = {};
    impact.byOperation = [];
    vi.clearAllMocks();
  });

  it('renders health KPIs and impact once loaded', async () => {
    health.totals = { calls: 10, errorCalls: 2, avgDurationMs: 55, p95DurationMs: 120, cost: 0.25 };
    impact.totals = { paired: 4, axStricter: 1, localStricter: 0, agree: 3, degraded: 2 };
    impact.byOperation = [
      { operation: 'agent.generate', calls: 4, axStricter: 1, localStricter: 0, degraded: 0 },
    ];
    renderPage();
    await waitFor(() => expect(screen.getByText('Health')).toBeTruthy());
    expect(screen.getByText('20%')).toBeTruthy(); // 2 of 10 degraded
    expect(screen.getByText('Decision impact')).toBeTruthy();
    expect(screen.getByText('agent.generate')).toBeTruthy();
    expect(screen.getByText('AxWise +1')).toBeTruthy();
  });

  it('shows empty states when there is no data', async () => {
    health.totals = { calls: 0 };
    impact.totals = { paired: 0 };
    renderPage();
    await waitFor(() => expect(screen.getByText(/No AxWise calls recorded/i)).toBeTruthy());
    expect(screen.getByText(/No paired decisions yet/i)).toBeTruthy();
  });
});
