import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import OrgDetailDrawer from './OrgDetailDrawer';
import { ORG_TAB_LABELS } from './drawer/orgDrawerConstants';

vi.mock('../../services/organizationService', () => ({
  getOrgFinances: vi.fn(async () => ({
    'org-1': {
      invested: 2,
      returned: 0,
      expenses: 2,
      net_profit: -2,
      roi: -100,
      token_spend: 2,
      ad_spend: 0,
      service_cost: 0,
      infrastructure: 0,
    },
  })),
  getOrgActivity: vi.fn(async () => ({
    items: [],
    counts: {
      tasks: 1,
      active_goals: 1,
      completed_goals: 0,
      workflows: 0,
      dashboards: 1,
      teams: 1,
      agents: 0,
    },
    previews: { workflows: [], dashboards: [{ id: 'd1', title: 'Ops Dashboard' }] },
    scope_ids: ['org-1'],
  })),
}));

vi.mock('../../services/goalService', () => ({
  listGoals: vi.fn(async () => []),
}));

const org = {
  id: 'org-1',
  name: 'TRAKTOR',
  org_type: 'virtual',
  industry: 'Technology',
  is_active: true,
  created_at: '2026-03-31T00:00:00Z',
  description: 'Test org',
};

const baseProps = {
  open: true,
  onClose: vi.fn(),
  org,
  orgTeamMap: { 'org-1': [] },
  orgAgentMap: { 'org-1': [] },
  allTeams: [],
  allAgents: [],
  concilium: [],
  orgs: [org],
  getTypeColor: () => '#8B5CF6',
  getTypeLabel: () => 'Virtual',
};

function renderDrawer(overrides = {}) {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>
        <OrgDetailDrawer {...baseProps} {...overrides} />
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('OrgDetailDrawer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders six reorganized tabs', async () => {
    renderDrawer();
    for (const label of ORG_TAB_LABELS) {
      expect(await screen.findByRole('tab', { name: label })).toBeInTheDocument();
    }
  });

  it('Overview shows launcher tiles without full finance breakdown labels', async () => {
    renderDrawer();
    expect(await screen.findByText('At a glance')).toBeInTheDocument();
    expect(screen.getAllByText('Teams').length).toBeGreaterThan(0);
    expect(await screen.findByText('Net profit')).toBeInTheDocument();
    expect(screen.queryByText('Expense Breakdown')).not.toBeInTheDocument();
    expect(screen.queryByText('Total Invested')).not.toBeInTheDocument();
  });

  it('Finances tab owns full financial KPI cards', async () => {
    renderDrawer();
    fireEvent.click(await screen.findByRole('tab', { name: 'Finances' }));
    expect(await screen.findByText('Total Invested')).toBeInTheDocument();
    expect(screen.getByText('Expense Breakdown')).toBeInTheDocument();
  });

  it('Governance tab replaces KYB label', async () => {
    renderDrawer();
    fireEvent.click(await screen.findByRole('tab', { name: 'Governance' }));
    expect(await screen.findByText('Structure')).toBeInTheDocument();
    expect(screen.getByText('KYB')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'KYB' })).not.toBeInTheDocument();
  });

  it('Operations tab shows three stacked sections', async () => {
    renderDrawer();
    fireEvent.click(await screen.findByRole('tab', { name: 'Operations' }));
    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
      expect(screen.getByText('Monitoring')).toBeInTheDocument();
      expect(screen.getByText('Activity')).toBeInTheDocument();
    });
  });
});
