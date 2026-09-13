import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('../../hooks/useSimpleMode', () => ({
  useSimpleMode: () => ({ simpleMode: true, setSimpleMode: vi.fn(), toggleSimpleMode: vi.fn() }),
}));

vi.mock('../../services/goalService', () => ({
  listGoals: vi.fn(async () => [
    { id: 'g1', status: 'active', updated_at: new Date().toISOString() },
    { id: 'g2', status: 'needs_human', updated_at: new Date().toISOString() },
  ]),
}));

vi.mock('../../services/dashboardService', () => ({
  listDashboards: vi.fn(async () => ({
    dashboards: [{ id: 'd1', config: { blocks: [{ id: 'b1' }, { id: 'b2' }] } }],
  })),
}));

vi.mock('../../hooks/useInstrumentCounts', () => ({
  useInstrumentCounts: () => ({
    counts: { knowledge_base: 42, workflow: 8, tasks: 156, projects: 12 },
    loading: false,
    error: null,
  }),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

import DashboardHub from './DashboardHub';

const theme = createTheme();
function Wrap({ children }) {
  return (
    <MemoryRouter initialEntries={['/hub']}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DashboardHub (Reports page)', () => {
  it('uses the compact mkt-landing layout with an org-style showcase', async () => {
    const { container } = render(
      <Wrap>
        <DashboardHub />
      </Wrap>
    );
    await screen.findByText('Your Actions');
    expect(container.querySelector('.mkt-landing[data-compact="1"]')).toBeTruthy();
    expect(container.querySelector('.mkt-tile--hub-showcase')).toBeTruthy();
    expect(container.querySelector('.mkt-grid--hub-instruments')).toBeTruthy();
  });

  it('does not render the old tab bar (Overview / Dashboards / Reports / Results)', async () => {
    render(
      <Wrap>
        <DashboardHub />
      </Wrap>
    );
    await screen.findByText('Your Actions');
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Overview' })).toBeNull();
  });

  it('renders the three scrollable hub cards with updated copy', async () => {
    render(
      <Wrap>
        <DashboardHub />
      </Wrap>
    );
    expect(await screen.findByText('Your Actions')).toBeTruthy();
    expect(await screen.findByText('Dashboard')).toBeTruthy();
    expect(await screen.findByText('Report')).toBeTruthy();
    expect(await screen.findByText('Communication')).toBeTruthy();
    expect(screen.getByText('Build your interactive metrics from live data')).toBeTruthy();
    expect(screen.getByText('Generate professional reports for everything')).toBeTruthy();
    expect(screen.getByText('Look inside communication, processes and goals')).toBeTruthy();
  });

  it('shows related metrics under each hub card when data is loaded', async () => {
    render(
      <Wrap>
        <DashboardHub />
      </Wrap>
    );
    await screen.findByText('Dashboard');
    await waitFor(() => {
      expect(screen.getByText('saved')).toBeTruthy();
      expect(screen.getByText('live blocks')).toBeTruthy();
      expect(screen.getByText('templates')).toBeTruthy();
      expect(screen.getByText('need response')).toBeTruthy();
      expect(screen.getByText('events · 24h')).toBeTruthy();
    });
  });

  it('clicking the Dashboard card navigates to /dashboards', async () => {
    render(
      <Wrap>
        <DashboardHub />
      </Wrap>
    );
    const card = await screen.findByText('Dashboard');
    fireEvent.click(card);
    expect(navigateMock).toHaveBeenCalledWith('/dashboards');
  });

  it('clicking the Report card navigates to /reports', async () => {
    render(
      <Wrap>
        <DashboardHub />
      </Wrap>
    );
    const card = await screen.findByText('Report');
    fireEvent.click(card);
    expect(navigateMock).toHaveBeenCalledWith('/reports');
  });

  it('clicking the Communication card navigates to /communicator', async () => {
    render(
      <Wrap>
        <DashboardHub />
      </Wrap>
    );
    const card = await screen.findByText('Communication');
    fireEvent.click(card);
    expect(navigateMock).toHaveBeenCalledWith('/communicator');
  });

  it('renders the Instruments block with 4 tiles using counts from the hook', async () => {
    render(
      <Wrap>
        <DashboardHub />
      </Wrap>
    );
    expect(await screen.findByText('Instruments')).toBeTruthy();
    expect(screen.getByText('Knowlage')).toBeTruthy();
    expect(screen.getByText('Workflow')).toBeTruthy();
    expect(screen.getByText('Tasks')).toBeTruthy();
    expect(screen.getByText('Projects')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('42')).toBeTruthy();
    });
  });

  it('clicking the Knowlage instrument navigates to /knowledge-base', async () => {
    render(
      <Wrap>
        <DashboardHub />
      </Wrap>
    );
    const tile = await screen.findByText('Knowlage');
    fireEvent.click(tile);
    expect(navigateMock).toHaveBeenCalledWith('/knowledge-base');
  });
});
