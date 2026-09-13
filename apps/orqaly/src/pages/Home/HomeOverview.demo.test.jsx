/**
 * Runtime smoke test for the Home "Metrics" tab demo path.
 *
 * Renders the REAL HomeOverview (no useHomeData/useOrgOverview mocks) with the
 * "Demo data" preference forced on, and asserts that every block actually
 * paints its dummy dataset. The demo path is pure (no network/auth), so this
 * reproduces what a user sees when they flip the toggle — proving the demo
 * wiring end-to-end through the real component tree.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Demo mode never reads live LLM/auth data, but the hooks must resolve.
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'tester@example.com' } }),
}));
vi.mock('../../hooks/useLlmUsage', () => ({
  useLlmUsage: () => ({
    data: { totals: {}, timeseries: [], byModel: [], byProvider: [] },
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

import HomeOverview from './HomeOverview';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia =
    window.matchMedia ||
    ((q) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
});

beforeEach(() => {
  localStorage.clear();
  // Force the demo toggle on the way HomeOverview reads it (localStorage prefs).
  localStorage.setItem('orchestratori_home_prefs', JSON.stringify({ demo: true, windowDays: 7 }));
  // This suite verifies every dashboard block. Persist an explicit full layout
  // so simple mode does not seed the intentionally reduced Beginner template.
  localStorage.setItem('orch_home_hidden_sections', JSON.stringify([]));
  localStorage.setItem('orch_home_section_order', JSON.stringify([]));
  localStorage.setItem('orch_home_block_widths', JSON.stringify([]));
});

function renderHome() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>
        <HomeOverview />
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe(
  'HomeOverview — demo data renders for every Metrics-tab block',
  { timeout: 15_000 },
  () => {
    it('header shows the filter and Explain controls', () => {
      renderHome();
      expect(screen.getByRole('button', { name: /explain/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /filters & layout/i })).toBeInTheDocument();
    });

    it('shows a demo banner and per-block DEMO tags', () => {
      renderHome();
      expect(screen.getByRole('status')).toHaveTextContent(
        /sample numbers, not your live account/i
      );
      // Each PanelCard-based block is tagged with a DEMO chip.
      expect(screen.getAllByText('DEMO').length).toBeGreaterThan(0);
    });

    it('org blocks render demo orgs + metrics', () => {
      renderHome();
      expect(screen.getAllByText('Orchestratori Holding').length).toBeGreaterThan(0);
      // OrgMetrics tiles (Units/Teams/Consilium/Agents/Tools/Tasks) are present.
      for (const tile of ['Units', 'Teams', 'Agents', 'Tools', 'Tasks']) {
        expect(screen.getAllByText(tile).length).toBeGreaterThan(0);
      }
    });

    it('Consilium Activity renders demo boards', () => {
      renderHome();
      expect(screen.getByText('E-Comm Board')).toBeInTheDocument();
      expect(screen.getByText('Fintech Board')).toBeInTheDocument();
    });

    it('Goals & Loops render demo rows', () => {
      renderHome();
      expect(screen.getByText('Goals in Action')).toBeInTheDocument();
      expect(screen.getByText('Loops from Agents')).toBeInTheDocument();
      expect(screen.getAllByText('Growth Agent').length).toBeGreaterThan(0); // a demo loop agent
    });

    it('Activity & Communicator chat render demo content', () => {
      renderHome();
      expect(screen.getByText('Communicator')).toBeInTheDocument();
      expect(screen.getByText('Resolved 32 live chats, satisfaction at 96%.')).toBeInTheDocument();
    });

    it('LLM Usage + Data Operations render demo rows', () => {
      renderHome();
      expect(screen.getByText('LLM Usage')).toBeInTheDocument();
      expect(screen.getByText('Documents')).toBeInTheDocument(); // a dataOps row
    });
  }
);
