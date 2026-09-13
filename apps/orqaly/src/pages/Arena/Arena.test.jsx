import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material';

// The page is a shell over heavy children; stub them so this test is about
// one thing — the guide opens at the right step from every entry point.
vi.mock('./guide/ArenaGuideDialog', () => ({
  default: ({ open, initialStep }) =>
    open ? <div data-testid="guide" data-step={String(initialStep)} /> : null,
}));
vi.mock('./ArenaJobCard', () => ({ default: () => <div data-testid="job" /> }));
vi.mock('./ArenaScoreboard', () => ({ default: () => <div data-testid="scoreboard" /> }));
vi.mock('./DecisionPanel', () => ({ default: () => <div data-testid="decision" /> }));
vi.mock('./ExceptionsCard', () => ({ default: () => <div data-testid="exceptions" /> }));
vi.mock('./RegisterResultDialog', () => ({ default: () => null }));
vi.mock('./ArenaStatCards', () => ({ default: () => <div data-testid="stats" /> }));
vi.mock('../../components/Common/MetricsToggleButton', () => ({
  default: ({ onToggle }) => <button onClick={onToggle}>Metrics</button>,
}));
vi.mock('../../hooks/useShowMetrics', () => ({ useShowMetrics: () => [false, vi.fn()] }));
vi.mock('../../hooks/useSimpleMode', () => ({ useSimpleMode: () => ({ simpleMode: false }) }));
vi.mock('./useArenaLayout', () => ({
  default: () => ({ layout: 'split', setLayout: vi.fn(), isSplit: true, isStacked: false }),
}));
vi.mock('./useArenaBoard', () => ({
  default: () => ({
    board: { jobs: [], totals: { jobs: 0, people: 0, agents: 0, decided: 0 } },
    scoreboard: null,
    decision: null,
    exceptions: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
const setupState = { configured: [], isConfigured: false };
vi.mock('./useArenaSetup', () => ({
  default: () => ({ ...setupState, rates: [], reload: vi.fn() }),
}));
vi.mock('../../services/arenaService', () => ({
  rateArenaSide: vi.fn(),
  recordArenaVerdict: vi.fn(),
  runArenaAgent: vi.fn(),
}));

import Arena from './Arena';

const theme = createTheme();

function setup(path = '/arena') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider theme={theme}>
        <Arena />
      </ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setupState.isConfigured = false;
});

describe('Arena page — guide entry points', () => {
  it('stays closed by default', () => {
    setup();
    expect(screen.queryByTestId('guide')).not.toBeInTheDocument();
  });

  it('opens the guide on first paint when sent from the Assistant (?setup=1)', () => {
    setup('/arena?setup=1');
    expect(screen.getByTestId('guide')).toHaveAttribute('data-step', '0');
  });

  it('opens at the Departments step from the toolbar', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Departments/ }));
    expect(screen.getByTestId('guide')).toHaveAttribute('data-step', 'departments');
  });

  it('opens at the Rates step from the toolbar', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Rates/ }));
    expect(screen.getByTestId('guide')).toHaveAttribute('data-step', 'rates');
  });

  it('offers Set up from the not-configured banner', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Set up' }));
    await waitFor(() => expect(screen.getByTestId('guide')).toBeInTheDocument());
  });
});
