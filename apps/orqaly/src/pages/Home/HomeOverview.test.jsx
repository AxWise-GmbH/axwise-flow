import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

// Control simple/advanced mode: advanced by default so the Beginner-seeding
// effect stays off for the existing block-visibility cases.
vi.mock('../../hooks/useSimpleMode', () => ({ useSimpleMode: vi.fn() }));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia =
    window.matchMedia ||
    ((query) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
});

const homeDataMock = vi.fn();
vi.mock('./useHomeData', () => ({ default: (...args) => homeDataMock(...args) }));
const orgOverviewMock = vi.fn();
vi.mock('./useOrgOverview', () => ({ default: (...args) => orgOverviewMock(...args) }));

import { buildDemoData, buildDemoOrgs } from './demoData';
import HomeOverview from './HomeOverview';
import { useSimpleMode } from '../../hooks/useSimpleMode';

function setSimpleMode(simpleMode) {
  useSimpleMode.mockReturnValue({ simpleMode, setSimpleMode: vi.fn(), toggleSimpleMode: vi.fn() });
}

function snapshot(overrides = {}) {
  return {
    ...buildDemoData(7),
    loading: false,
    error: null,
    isLive: true,
    lastUpdated: 1_700_000_000_000,
    refresh: vi.fn(),
    ...overrides,
  };
}

function renderOverview() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>
        <HomeOverview />
      </ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  homeDataMock.mockReset();
  homeDataMock.mockReturnValue(snapshot());
  orgOverviewMock.mockReset();
  orgOverviewMock.mockReturnValue({ orgs: buildDemoOrgs(), loading: false });
  localStorage.clear();
  setSimpleMode(false);
});

describe('HomeOverview', { timeout: 15_000 }, () => {
  it('renders the org overview and the dense sections', () => {
    renderOverview();
    expect(screen.getAllByText('Orchestratori Holding').length).toBeGreaterThan(0);
    // 'Consilium' also appears as a chat category chip, so allow multiple.
    for (const label of ['Units', 'Consilium']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // ROI and Invested tiles were removed from the metrics strip.
    expect(screen.queryByText('ROI')).not.toBeInTheDocument();
    expect(screen.queryByText('Invested')).not.toBeInTheDocument();
    expect(screen.getByText('Organization structure')).toBeInTheDocument();
    for (const title of [
      'Agents Performance Overview',
      'Goals in Action',
      'Communicator',
      'LLM Usage',
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    // Agent Directory block was removed from the home overview.
    expect(screen.queryByText('Agent Directory')).not.toBeInTheDocument();
  });

  const openFilters = () =>
    fireEvent.click(screen.getByRole('button', { name: /filters & layout/i }));

  it('flips to demo data via the filter dialog', () => {
    renderOverview();
    expect(homeDataMock).toHaveBeenLastCalledWith({
      demo: false,
      windowDays: 7,
      from: null,
      to: null,
      orgSeed: 0,
    });
    openFilters();
    fireEvent.click(screen.getByText('Show demo data'));
    expect(homeDataMock).toHaveBeenLastCalledWith({
      demo: true,
      windowDays: 7,
      from: null,
      to: null,
      orgSeed: 0,
    });
  });

  it('changes the window via the filter dialog', () => {
    renderOverview();
    openFilters();
    fireEvent.click(screen.getByRole('button', { name: /last 30d/i }));
    expect(homeDataMock).toHaveBeenLastCalledWith({
      demo: false,
      windowDays: 30,
      from: null,
      to: null,
      orgSeed: 0,
    });
  });

  it('applies a custom From-To date range that overrides the preset', () => {
    renderOverview();
    openFilters();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-02-01' } });
    expect(homeDataMock).toHaveBeenLastCalledWith({
      demo: false,
      windowDays: 7,
      from: '2026-01-01',
      to: '2026-02-01',
      orgSeed: 0,
    });
  });

  it('opens the filter dialog with block reorder/hide controls', () => {
    renderOverview();
    openFilters();
    expect(screen.getByText('Filters & Layout')).toBeInTheDocument();
    // Each block is listed with a Hide control.
    expect(screen.getByRole('button', { name: /hide Performance/i })).toBeInTheDocument();
  });

  it('hides a block whose id is in the saved home hidden-set', () => {
    localStorage.setItem('orch_home_hidden_sections', JSON.stringify(['performance']));
    renderOverview();
    // The Performance block (title) is gone, but other blocks still render.
    expect(screen.queryByText('Agents Performance Overview')).not.toBeInTheDocument();
    expect(screen.getByText('LLM Usage')).toBeInTheDocument();
  });

  it('seeds the Beginner layout on a simple-mode first visit (no saved layout)', () => {
    setSimpleMode(true);
    renderOverview();
    // Beginner hides Communicator, Organization structure, Key Stats, etc...
    expect(screen.queryByText('Communicator')).not.toBeInTheDocument();
    expect(screen.queryByText('Organization structure')).not.toBeInTheDocument();
    // ...and keeps Goals / LLM Usage visible.
    expect(screen.getAllByText('Goals in Action').length).toBeGreaterThan(0);
    expect(screen.getByText('LLM Usage')).toBeInTheDocument();
    // The applied layout is persisted so the choice sticks across visits.
    expect(localStorage.getItem('orch_home_hidden_sections')).not.toBeNull();
  });

  it('does not reseed when a saved layout already exists, even in simple mode', () => {
    setSimpleMode(true);
    // A user who hid only Performance keeps their layout; Communicator stays visible.
    localStorage.setItem('orch_home_hidden_sections', JSON.stringify(['performance']));
    renderOverview();
    expect(screen.getByText('Communicator')).toBeInTheDocument();
    expect(screen.queryByText('Agents Performance Overview')).not.toBeInTheDocument();
  });

  it('deep-links each metric tile to its org-scoped page', () => {
    renderOverview();
    fireEvent.click(screen.getByRole('button', { name: /open Units/i }));
    expect(navigateMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/^\/organizations\?org=demo-holding/)
    );

    fireEvent.click(screen.getByRole('button', { name: /open Teams/i }));
    expect(navigateMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/^\/agent-hub\?tab=teams&org=demo-holding/)
    );

    fireEvent.click(screen.getByRole('button', { name: /open Agents/i }));
    expect(navigateMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/^\/agent-hub\?tab=agents&org=demo-holding/)
    );

    fireEvent.click(screen.getByRole('button', { name: /open Tools/i }));
    expect(navigateMock).toHaveBeenLastCalledWith('/tools');
  });
});
