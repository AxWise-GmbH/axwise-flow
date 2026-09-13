/**
 * Focused test: the Organizations table renders a "Consilium" column (just left
 * of Teams) showing each org's linked board. Heavy deps are stubbed so the test
 * only exercises the table render.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('../../hooks/useSimpleMode', () => ({ useSimpleMode: () => ({ simpleMode: false }) }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
// The graph view lazy-loads @xyflow/react; stub it.
vi.mock('../../components/Concilium/graph/ConsiliumTopologyView', () => ({
  default: () => <div data-testid="boards-graph-view" />,
}));
vi.mock('../../hooks/useConcilium', () => ({
  useConcilium: () => ({ concilium: [{ id: 'b1', name: 'Main Consilium' }] }),
}));
vi.mock('../../hooks/useShowMetrics', () => ({ useShowMetrics: () => [false, vi.fn()] }));

vi.mock('../../services/organizationService', () => ({
  listOrganizations: vi.fn(async () => [
    {
      id: 'o1',
      name: 'Traktor',
      org_type: 'virtual',
      industry: 'Technology',
      consilium_id: 'b1',
      created_at: '2026-03-31T00:00:00Z',
    },
  ]),
  createOrganization: vi.fn(),
  updateOrganization: vi.fn(),
  deleteOrganization: vi.fn(),
  getOrgFinances: vi.fn(async () => ({})),
}));
vi.mock('../../services/orgTeamService', () => ({
  getOrgTeamMap: vi.fn(async () => ({})),
  setOrgTeams: vi.fn(),
}));
vi.mock('../../services/orgAgentService', () => ({
  getOrgAgentMap: vi.fn(async () => ({})),
  setOrgAgents: vi.fn(),
}));
vi.mock('../../services/conciliumTeamsService', () => ({ getAllTeams: vi.fn(async () => []) }));
vi.mock('../../services/teamService', () => ({ getAllTeams: vi.fn(async () => []) }));
vi.mock('../../services/agentHubService', () => ({ getAgents: vi.fn(async () => []) }));

// Stub heavy dialogs/drawers so we only render the table.
vi.mock('../../components/Organizations/OrgAssignDialog', () => ({ default: () => null }));
vi.mock('../../components/AgentHub/AgentDetailDialog', () => ({ default: () => null }));
vi.mock('../../components/Organizations/OrgArchitectureDialog', () => ({ default: () => null }));
vi.mock('../../components/Organizations/OrgDetailDrawer', () => ({ default: () => null }));

import Organizations from './Organizations';

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

const Wrap = ({ children }) => (
  <MemoryRouter>
    <ThemeProvider theme={createTheme()}>{children}</ThemeProvider>
  </MemoryRouter>
);

beforeEach(() => localStorage.clear());

describe('Organizations table — Consilium column', () => {
  it('renders a Consilium header and the linked board name in the row', async () => {
    render(
      <Wrap>
        <Organizations />
      </Wrap>
    );
    // Column header.
    expect(await screen.findByText('Consilium')).toBeInTheDocument();
    // Linked board chip for the org row.
    expect(await screen.findByText('Main Consilium')).toBeInTheDocument();
  });
});

describe('Organizations advanced — graph view toggle', () => {
  it('switches to the graph view and remembers it', async () => {
    render(
      <Wrap>
        <Organizations />
      </Wrap>
    );
    await screen.findByText('Traktor'); // wait for the list to load
    fireEvent.click(screen.getByLabelText('Graph view'));
    expect(await screen.findByTestId('boards-graph-view')).toBeInTheDocument();
    expect(localStorage.getItem('orch_orgs_view')).toBe('graph');
  });
});
