import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('../../services/dashboardService', () => ({
  listDashboards: () => Promise.resolve({ owned: [], shared: [] }),
  listTemplates: () => Promise.resolve([]),
  deleteDashboard: vi.fn(),
  duplicateDashboard: vi.fn(),
  forkTemplate: vi.fn(),
}));
vi.mock('../../components/Dashboards/NewDashboardDialog', () => ({ default: () => null }));
vi.mock('../../components/Dashboards/DashboardActivityDialog', () => ({ default: () => null }));
// The page-name title now lives in the top bar; the header shows the "?" help instead.
vi.mock('../../components/Common/PageExplain', () => ({
  default: () => <button type="button" aria-label="Explain this page" />,
}));

import DashboardList from './DashboardList';

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (q) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }
});

function renderList() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <DashboardList />
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('DashboardList header', () => {
  it('hides the page-name title but keeps the view toggle + New on the toolbar row, plus the "?"', async () => {
    renderList();
    expect(await screen.findByLabelText('Card view')).toBeInTheDocument();
    expect(screen.getByLabelText('List view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
    expect(screen.getByLabelText('Explain this page')).toBeInTheDocument();
    expect(screen.queryByText('Dashboards')).toBeNull();
  });

  it('still renders the category tab bar', async () => {
    renderList();
    expect(await screen.findByText('My dashboards')).toBeInTheDocument();
  });
});
