import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mobile toggle: PulseBar reads useMediaQuery from @mui/material.
const mq = vi.hoisted(() => ({ mobile: false }));
vi.mock('@mui/material', async (orig) => {
  const actual = await orig();
  return { ...actual, useMediaQuery: () => mq.mobile };
});

// SimpleDock exports dockSurfaceBg used by PulseBar; keep the real export.
const prefState = { hidden: false, view: 'collapsed' };
const setView = vi.fn();
vi.mock('../../hooks/usePulseBarPref', () => ({
  usePulseBarPref: () => ({ ...prefState, setView, setHidden: vi.fn(), toggleHidden: vi.fn() }),
}));

const feedState = {
  events: [],
  summary: {
    total: 0,
    axwise: 0,
    degraded: 0,
    blocked: 0,
    diverged: 0,
    problems: 0,
    worst: 'ok',
  },
  loading: false,
  error: null,
  refresh: vi.fn(),
};
vi.mock('../../hooks/usePulseFeed', () => ({
  usePulseFeed: () => feedState,
}));

import PulseBar from './PulseBar';

const theme = createTheme();
function renderBar() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <PulseBar />
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('PulseBar', () => {
  beforeEach(() => {
    prefState.hidden = false;
    prefState.view = 'collapsed';
    feedState.events = [];
    feedState.summary = {
      total: 0,
      axwise: 0,
      degraded: 0,
      blocked: 0,
      diverged: 0,
      problems: 0,
      worst: 'ok',
    };
    mq.mobile = false;
    vi.clearAllMocks();
  });

  it('mobile: minimized view renders null (header pill handles it instead)', () => {
    mq.mobile = true;
    prefState.view = 'minimized';
    const { container } = renderBar();
    expect(container.firstChild).toBeNull();
  });

  it('mobile: auto-minimizes on mount', () => {
    mq.mobile = true;
    prefState.view = 'collapsed';
    renderBar();
    expect(setView).toHaveBeenCalledWith('minimized');
  });

  it('renders nothing when hidden', () => {
    prefState.hidden = true;
    const { container } = renderBar();
    expect(container.firstChild).toBeNull();
  });

  it('collapsed: shows the latest request inline (log at a glance)', () => {
    feedState.events = [
      {
        id: 'ax:1',
        kind: 'axwise',
        who: 'you',
        what: 'copilot.chat -> allowed',
        where: 'copilot.chat',
        when: new Date().toISOString(),
        severity: 'ok',
        durationMs: 40,
      },
    ];
    feedState.summary = {
      total: 3,
      axwise: 3,
      degraded: 1,
      diverged: 0,
      problems: 1,
      worst: 'warn',
    };
    renderBar();
    expect(screen.getByText('AxWise')).toBeTruthy();
    // Latest request rendered inline: where + severity + duration (+ degraded badge).
    expect(
      screen.getByText(
        (t) => t.includes('copilot.chat') && t.includes('40ms') && t.includes('1 degraded')
      )
    ).toBeTruthy();
    // Collapsed view does not render the expanded event list (the `what` text).
    expect(screen.queryByText(/copilot.chat -> allowed/)).toBeNull();
  });

  it('collapsed: reports the latest AxWise call instead of a newer generic goal event', () => {
    feedState.events = [
      {
        id: 'goal:1',
        kind: 'goal',
        where: 'AI Agent Consultation Service for EU',
        when: new Date().toISOString(),
        severity: 'ok',
      },
      {
        id: 'ax:goal:1',
        kind: 'axwise',
        where: 'goal.orchestrate',
        when: new Date(Date.now() - 1000).toISOString(),
        severity: 'warn',
      },
    ];
    feedState.summary = {
      total: 2,
      axwise: 1,
      degraded: 1,
      diverged: 0,
      problems: 1,
      worst: 'warn',
    };

    renderBar();

    expect(
      screen.getByText((text) => text.includes('goal.orchestrate') && text.includes('warn'))
    ).toBeTruthy();
    expect(
      screen.queryByText((text) => text.includes('AI Agent Consultation Service for EU'))
    ).toBeNull();
  });

  it('collapsed: labels failed research as blocked, never degraded', () => {
    feedState.events = [
      {
        id: 'ax:research',
        kind: 'axwise',
        where: 'goal.customer-intelligence',
        when: new Date().toISOString(),
        severity: 'error',
      },
    ];
    feedState.summary = {
      total: 1,
      axwise: 1,
      degraded: 0,
      blocked: 1,
      diverged: 0,
      problems: 1,
      worst: 'error',
    };

    renderBar();

    expect(screen.getByText((text) => text.includes('1 research blocked'))).toBeTruthy();
    expect(screen.queryByText((text) => text.includes('degraded'))).toBeNull();
  });

  it('collapsed with no activity: shows the no-activity hint', () => {
    renderBar();
    expect(screen.getByText('AxWise')).toBeTruthy();
    expect(screen.getByText(/no activity yet/i)).toBeTruthy();
  });

  it('minimize button switches the view to minimized', () => {
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: /minimize axwise status bar/i }));
    expect(setView).toHaveBeenCalledWith('minimized');
  });

  it('minimized: renders the corner pill that expands on click', () => {
    prefState.view = 'minimized';
    feedState.summary = { total: 2, axwise: 2, degraded: 0, diverged: 0, problems: 0, worst: 'ok' };
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: /expand axwise status bar/i }));
    expect(setView).toHaveBeenCalledWith('collapsed');
  });

  it('expanded: lists events with who/what', () => {
    prefState.view = 'expanded';
    feedState.events = [
      {
        id: 'ax:1',
        kind: 'axwise',
        who: 'you',
        what: 'copilot.chat -> allowed',
        where: 'copilot.chat',
        when: new Date().toISOString(),
        status: 'ok',
        severity: 'ok',
        durationMs: 42,
        href: '/axwise-analytics',
      },
    ];
    feedState.summary = { total: 1, axwise: 1, degraded: 0, diverged: 0, problems: 0, worst: 'ok' };
    renderBar();
    expect(screen.getByText(/copilot.chat -> allowed/)).toBeTruthy();
    expect(screen.getByText('42ms')).toBeTruthy();
  });

  it('expanded with no events: shows the empty hint', () => {
    prefState.view = 'expanded';
    renderBar();
    expect(screen.getByText(/No AxWise activity yet/i)).toBeTruthy();
  });

  it('clicking an axwise row expands the inline detail in place; clicking again collapses', () => {
    prefState.view = 'expanded';
    feedState.events = [
      {
        id: 'ax:1',
        kind: 'axwise',
        who: 'you',
        what: 'copilot.chat -> allowed',
        where: 'copilot.chat',
        when: new Date().toISOString(),
        status: 'ok',
        severity: 'ok',
        durationMs: 42,
        axDecision: 'allowed',
        localDecision: 'allow',
        traceId: 'tr-1',
        href: '/axwise-analytics',
      },
    ];
    feedState.summary = { total: 1, axwise: 1, degraded: 0, diverged: 0, problems: 0, worst: 'ok' };
    renderBar();
    // Detail hidden initially.
    expect(screen.queryByText('Endpoint')).toBeNull();
    // Click the row -> inline detail appears (renders section labels).
    fireEvent.click(screen.getByText(/copilot.chat -> allowed/));
    expect(screen.getByText('Endpoint')).toBeTruthy();
    expect(screen.getByText('Applied')).toBeTruthy();
    // Click again -> collapses.
    fireEvent.click(screen.getByText(/copilot.chat -> allowed/));
    expect(screen.queryByText('Endpoint')).toBeNull();
  });
});
