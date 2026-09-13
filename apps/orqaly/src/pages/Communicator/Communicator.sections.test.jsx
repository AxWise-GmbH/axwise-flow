import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../hooks/useAgentRoom', () => ({
  useAgentRoom: () => ({
    rooms: [],
    roomsLoading: false,
    roomsError: null,
    selectedRoom: null,
    messages: [],
    messagesLoading: false,
    messagesError: null,
    activeChannel: 'all',
    selectRoom: vi.fn(),
    changeChannel: vi.fn(),
    fetchRooms: vi.fn(),
  }),
}));
vi.mock('../../hooks/useController', () => ({
  useController: () => ({
    executing: false,
    lastResult: null,
    executeCommand: vi.fn(),
    commandHistory: [],
    historyLoading: false,
  }),
}));
vi.mock('../../hooks/useConsiliumLog', () => ({
  useConsiliumLog: () => ({ evaluations: [], loading: false, error: null }),
}));
vi.mock('../../hooks/useActivityFeed', () => ({
  useActivityFeed: () => ({
    events: [],
    loading: false,
    error: null,
    filters: {},
    applyFilters: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock('../../hooks/useOrgCommander', () => ({
  useOrgCommander: () => ({
    orgs: [{ id: 'o1', name: 'Acme' }],
    selectedOrgId: 'o1',
    setSelectedOrgId: vi.fn(),
    roster: {
      teams: [],
      agents: [],
      leads: [],
      consilium: null,
      targets: [{ type: 'organization', id: 'o1', label: 'Acme' }],
    },
    events: [],
    scope: { goalCount: 0 },
    loadingOrgs: false,
    loadingTimeline: false,
    dispatching: false,
    error: null,
    dispatch: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock('../../hooks/useShowMetrics', () => ({
  useShowMetrics: () => [false, vi.fn()],
}));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn(),
  },
  hasSupabase: vi.fn().mockReturnValue(false),
}));

import Communicator from './Communicator';

function renderCommunicator(search = '?view=workspace&section=organizations') {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter initialEntries={[`/communicator${search}`]}>
        <Communicator />
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('Communicator workspace sections', () => {
  it('shows Goal History and Organizations in the sidebar', async () => {
    renderCommunicator('?view=workspace&section=activity');
    expect(await screen.findByText('Goal History')).toBeInTheDocument();
    expect(screen.getByText('Organizations')).toBeInTheDocument();
  });

  it('renders Organizations tab content', async () => {
    renderCommunicator('?view=workspace&section=organizations');
    expect(await screen.findByText('Dispatch command')).toBeInTheDocument();
    expect(screen.getAllByText('Acme').length).toBeGreaterThan(0);
  });
});
