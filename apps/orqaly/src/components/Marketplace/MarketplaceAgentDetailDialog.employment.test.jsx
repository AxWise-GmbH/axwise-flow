/**
 * Focused test: the Employment tab on the Marketplace agent dialog shows the
 * agent's organization, consilium board, and assignment date.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('../../services/agentEmploymentService', () => ({ getAgentEmployment: vi.fn() }));
vi.mock('../../services/agentRatingService', () => ({
  getAgentRatings: vi.fn(async () => []),
  submitRating: vi.fn(),
  deleteRating: vi.fn(),
}));
vi.mock('../../services/jobService', () => ({ getAllJobs: vi.fn(async () => []) }));
vi.mock('../../services/teamTaskBackend', () => ({ loadTeamTasks: vi.fn(async () => []) }));
vi.mock('../../lib/supabase', () => ({
  hasSupabase: () => false,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
    },
  },
}));

import { getAgentEmployment } from '../../services/agentEmploymentService';
import MarketplaceAgentDetailDialog from './MarketplaceAgentDetailDialog';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const theme = createTheme();
const Wrap = ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;

beforeEach(() => vi.clearAllMocks());

function open() {
  return render(
    <Wrap>
      <MarketplaceAgentDetailDialog
        open
        agent={{ id: 'a1', name: 'Bogdan Stanescu', role: 'Partner Success Manager' }}
        onClose={() => {}}
      />
    </Wrap>
  );
}

describe('MarketplaceAgentDetailDialog — Employment tab', () => {
  it('shows organization, consilium and assigned date', async () => {
    getAgentEmployment.mockResolvedValue({
      orgs: [
        {
          org_id: 'o1',
          org_name: 'Orqaly Inc.',
          consilium_id: 'b1',
          consilium_name: 'Main Consilium',
          assigned_at: '2026-03-31T00:00:00Z',
        },
      ],
      teams: [
        { team_id: 't1', team_name: 'Growth Pod', role: 'lead', joined_at: '2026-04-01T00:00:00Z' },
      ],
    });
    open();
    fireEvent.click(await screen.findByRole('tab', { name: /Employment/i }));
    expect(await screen.findByText('Orqaly Inc.')).toBeInTheDocument();
    expect(screen.getByText('Main Consilium')).toBeInTheDocument();
    expect(screen.getByText(/Assigned 31\.03\.26/)).toBeInTheDocument();
    expect(screen.getByText('Growth Pod')).toBeInTheDocument();
  });

  it('shows an empty state when the agent is not assigned', async () => {
    getAgentEmployment.mockResolvedValue({ orgs: [], teams: [] });
    open();
    fireEvent.click(await screen.findByRole('tab', { name: /Employment/i }));
    expect(await screen.findByText('Not assigned to any organization yet.')).toBeInTheDocument();
  });
});
