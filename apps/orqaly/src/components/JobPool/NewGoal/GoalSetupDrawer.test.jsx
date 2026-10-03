import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';

vi.mock('../../../services/organizationService', () => ({ listOrganizations: vi.fn() }));
vi.mock('../../../services/conciliumService', () => ({ getAllConcilium: vi.fn() }));
vi.mock('../../../hooks/useOrgRoster', () => ({
  useOrgRoster: vi.fn(() => ({ roster: { targets: [] }, loading: false })),
}));
vi.mock('../../../hooks/useAxwise', () => ({ useAxwise: vi.fn() }));

import { listOrganizations } from '../../../services/organizationService';
import { getAllConcilium } from '../../../services/conciliumService';
import { useOrgRoster } from '../../../hooks/useOrgRoster';
import { useAxwise } from '../../../hooks/useAxwise';
import { getGoalSetup, resetGoalSetup, setGoalSetupOrg } from '../../../hooks/useGoalSetup';
import GoalSetupDrawer from './GoalSetupDrawer';

const setUserEnabled = vi.fn().mockResolvedValue(undefined);

function renderDrawer(props = {}) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <GoalSetupDrawer open onClose={vi.fn()} {...props} />
    </ThemeProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetGoalSetup();
  listOrganizations.mockResolvedValue([{ id: 'o1', name: 'Acme', consilium_id: 'c1' }]);
  getAllConcilium.mockResolvedValue([
    { id: 'c1', name: 'Board A' },
    { id: 'c2', name: 'Board B' },
  ]);
  useOrgRoster.mockReturnValue({
    roster: {
      targets: [
        { type: 'organization', id: 'o1', label: 'Acme' },
        { type: 'team', id: 't1', label: 'Team: Ops' },
        { type: 'agent', id: 'a1', label: 'Agent: Worker' },
      ],
    },
    loading: false,
  });
  useAxwise.mockReturnValue({
    serverEnabled: true,
    userEnabled: true,
    enforce: 'shadow',
    loaded: true,
    isAxwiseEnabled: true,
    setUserEnabled,
  });
});

describe('GoalSetupDrawer', () => {
  // The whole point of this surface: four decisions on screen at once, not a
  // wizard you have to open one step at a time.
  it('shows every section without any interaction', async () => {
    renderDrawer();
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByText('Consilium')).toBeInTheDocument();
    expect(screen.getByText('Team or agent')).toBeInTheDocument();
    expect(screen.getByText('AxWise')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Board A')).toBeInTheDocument());
    // The type prefix useOrgRoster bakes into the label is stripped for display.
    expect(screen.getByRole('radio', { name: /Ops/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Worker/ })).toBeInTheDocument();
  });

  it('defaults to a workspace so the goal is never left without one', async () => {
    renderDrawer();
    await waitFor(() => expect(getGoalSetup().orgId).toBe('o1'));
  });

  it('marks the board that governs the workspace', async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getByText('Governs this workspace')).toBeInTheDocument());
  });

  it('records a picked team as the goal target', async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getByRole('radio', { name: /Ops/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('radio', { name: /Ops/ }));
    expect(getGoalSetup().target).toMatchObject({ type: 'team', id: 't1' });
  });

  it('hands the goal back to the whole workspace when the pick is undone', async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getByText('Board A')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Board A'));
    expect(getGoalSetup().target).toMatchObject({ type: 'consilium', id: 'c1' });
    fireEvent.click(screen.getByText('Board A'));
    expect(getGoalSetup().target).toBeNull();
  });

  it('leaves the org picker alone when a workspace was already chosen elsewhere', async () => {
    setGoalSetupOrg('o1');
    renderDrawer();
    await waitFor(() => expect(screen.getByText('Board A')).toBeInTheDocument());
    expect(getGoalSetup().orgId).toBe('o1');
  });

  it('toggles the AxWise user pref', async () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('switch', { name: 'AxWise cognitive overlay' }));
    expect(setUserEnabled).toHaveBeenCalledWith(false);
  });

  // The env gate is the server's call; offering a switch that cannot take
  // effect would just look broken.
  it('disables the AxWise switch when the server has it off, and says why', () => {
    useAxwise.mockReturnValue({
      serverEnabled: false,
      userEnabled: true,
      enforce: 'shadow',
      loaded: true,
      isAxwiseEnabled: false,
      setUserEnabled,
    });
    renderDrawer();
    expect(screen.getByRole('switch', { name: 'AxWise cognitive overlay' })).toBeDisabled();
    expect(screen.getByText(/Turned off on this server/)).toBeInTheDocument();
  });
});
