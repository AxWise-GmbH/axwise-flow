import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('../../../services/conciliumService', () => ({
  getEvaluationHistory: vi.fn(async () => []),
}));
vi.mock('../../../services/conciliumMembersService', () => ({
  getAllMembers: vi.fn(async () => []),
  MEMBER_ROLES: [
    { value: 'chairman', label: 'Chairman' },
    { value: 'evaluator', label: 'Evaluator' },
    { value: 'auditor', label: 'Auditor' },
    { value: 'specialist', label: 'Specialist' },
    { value: 'observer', label: 'Observer' },
  ],
}));

import { getEvaluationHistory } from '../../../services/conciliumService';
import { getAllMembers } from '../../../services/conciliumMembersService';
import ConsiliumActivity from './ConsiliumActivity';

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

beforeEach(() => {
  vi.clearAllMocks();
});

const theme = createTheme();
const Wrap = ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;

const consilium = {
  totals: { boards: 2, members: 11, decisions: 113, approvalRate: 74.3, avgScore: 7.7 },
  boards: [
    {
      id: 'board-1',
      name: 'Main Consilium',
      status: 'active',
      memberCount: 6,
      decisions: 74,
      approvalRate: 78,
      avgScore: 8.2,
    },
    {
      id: 'board-2',
      name: 'E-Comm Board',
      status: 'paused',
      memberCount: 5,
      decisions: 39,
      approvalRate: 69,
      avgScore: 7.2,
    },
  ],
};

const orgs = [
  { id: 'org-1', name: 'Orchestratori Holding', parent_id: null, consilium_id: 'board-1' },
  { id: 'org-2', name: 'E-Commerce Division', parent_id: 'org-1', consilium_id: 'board-2' },
];

describe('ConsiliumActivity', () => {
  it('renders the aggregate gauges, count stats and active board name', () => {
    render(
      <Wrap>
        <ConsiliumActivity consilium={consilium} orgs={orgs} />
      </Wrap>
    );
    // Header has Approval + Avg Score gauges and Members/Decisions counts.
    for (const label of ['Members', 'Decisions', 'Approval', 'Avg Score']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // The Boards stat now shows the active board name (board-1 is first).
    expect(screen.getAllByText('Main Consilium').length).toBeGreaterThan(0);
    // The Boards control is reachable by its accessible label.
    expect(screen.getByRole('button', { name: 'Boards' })).toBeInTheDocument();
    expect(screen.queryByText('Agents')).not.toBeInTheDocument();
  });

  it('lists each board with its related organization', () => {
    render(
      <Wrap>
        <ConsiliumActivity consilium={consilium} orgs={orgs} />
      </Wrap>
    );
    // Board name appears in both the Boards stat and its row, so use getAllByText.
    expect(screen.getAllByText('Main Consilium').length).toBeGreaterThan(0);
    expect(screen.getAllByText('E-Comm Board').length).toBeGreaterThan(0);
    // Org name + member count share one line now, so match on a substring.
    expect(screen.getByText(/Orchestratori Holding/)).toBeInTheDocument();
    expect(screen.getByText(/E-Commerce Division/)).toBeInTheDocument();
  });

  it('shows a dash for a board with no linked organization', () => {
    const orphan = {
      totals: consilium.totals,
      boards: [
        {
          id: 'board-x',
          name: 'Orphan Board',
          status: 'active',
          memberCount: 2,
          decisions: 0,
          approvalRate: 0,
          avgScore: 0,
        },
      ],
    };
    render(
      <Wrap>
        <ConsiliumActivity consilium={orphan} orgs={orgs} />
      </Wrap>
    );
    // "— · 2 members" — the unlinked org resolves to a dash.
    expect(screen.getByText(/—\s·\s2 members/)).toBeInTheDocument();
  });

  it('fires onBoardClick with the board id when a row is clicked', () => {
    const onBoardClick = vi.fn();
    render(
      <Wrap>
        <ConsiliumActivity consilium={consilium} orgs={orgs} onBoardClick={onBoardClick} />
      </Wrap>
    );
    // The org line is unique to the per-board row, so target the row via it.
    const row = screen.getByText(/Orchestratori Holding/).closest('button');
    fireEvent.click(row);
    expect(onBoardClick).toHaveBeenCalledWith('board-1');
  });

  it('renders an empty state when there are no boards', () => {
    render(
      <Wrap>
        <ConsiliumActivity consilium={{ totals: {}, boards: [] }} orgs={orgs} />
      </Wrap>
    );
    expect(screen.getByText('No Consilium boards yet.')).toBeInTheDocument();
  });

  it('shows an Attach a board CTA in the scoped empty state', () => {
    const onAttachBoard = vi.fn();
    // org-1 (holding) has board-1 in `consilium`; use an org with no board for a scoped empty state.
    const orgsNoBoard = [{ id: 'org-9', name: 'Traktor', parent_id: null, consilium_id: null }];
    render(
      <Wrap>
        <ConsiliumActivity
          consilium={{ totals: {}, boards: [] }}
          orgs={orgsNoBoard}
          selectedOrgId="org-9"
          onAttachBoard={onAttachBoard}
        />
      </Wrap>
    );
    const btn = screen.getByRole('button', { name: /Attach a board/i });
    fireEvent.click(btn);
    expect(onAttachBoard).toHaveBeenCalledWith('org-9');
  });

  it('scopes to a selected division (its own board only)', () => {
    render(
      <Wrap>
        <ConsiliumActivity consilium={consilium} orgs={orgs} selectedOrgId="org-2" />
      </Wrap>
    );
    // Division org-2 → only its board-2; board-1 (holding) is hidden.
    expect(screen.getAllByText('E-Comm Board').length).toBeGreaterThan(0);
    expect(screen.queryByText('Main Consilium')).not.toBeInTheDocument();
    // Subtitle reflects the selected org.
    expect(screen.getByText('Decisions for E-Commerce Division')).toBeInTheDocument();
  });

  it('shows the holding plus its descendants when the holding is selected', () => {
    render(
      <Wrap>
        <ConsiliumActivity consilium={consilium} orgs={orgs} selectedOrgId="org-1" />
      </Wrap>
    );
    // Holding org-1 has child org-2, so both boards show.
    expect(screen.getAllByText('Main Consilium').length).toBeGreaterThan(0);
    expect(screen.getAllByText('E-Comm Board').length).toBeGreaterThan(0);
  });

  it('opens a board picker when there are multiple boards', () => {
    render(
      <Wrap>
        <ConsiliumActivity consilium={consilium} orgs={orgs} />
      </Wrap>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Boards' }));
    expect(screen.getByText('Select a board')).toBeInTheDocument();
  });

  it('shows up to 3 members inline with a More button opening the full list', async () => {
    getAllMembers.mockResolvedValueOnce([
      { id: 'm1', name: 'Aria Chen', role: 'chairman' },
      { id: 'm2', name: 'Bob Vale', role: 'evaluator' },
      { id: 'm3', name: 'Cara Nair', role: 'auditor' },
      { id: 'm4', name: 'Dan Berg', role: 'observer' },
      { id: 'm5', name: 'Eve Ruiz', role: 'specialist' },
    ]);
    render(
      <Wrap>
        <ConsiliumActivity consilium={consilium} orgs={orgs} />
      </Wrap>
    );
    // First 3 members appear inline (eager fetch); the 4th does not.
    expect(await screen.findByText(/Aria Chen/)).toBeInTheDocument();
    expect(screen.getByText(/Cara Nair/)).toBeInTheDocument();
    expect(screen.queryByText(/Dan Berg/)).not.toBeInTheDocument();
    expect(getAllMembers).toHaveBeenCalledWith('board-1');
    // "More (+2)" opens the full list.
    fireEvent.click(screen.getByRole('button', { name: /More \(\+2\)/i }));
    expect(await screen.findByText('Dan Berg')).toBeInTheDocument();
  });

  it('renders a decisions carousel for the active board', async () => {
    getEvaluationHistory.mockResolvedValueOnce([
      {
        id: 'd1',
        approved: true,
        overall_score: 8.4,
        summary: 'Approved the budget',
        decision_level: 'MEDIUM',
        created_at: '2026-06-01T10:00:00Z',
      },
    ]);
    render(
      <Wrap>
        <ConsiliumActivity consilium={consilium} orgs={orgs} />
      </Wrap>
    );
    expect(await screen.findByText('Approved the budget')).toBeInTheDocument();
    expect(getEvaluationHistory).toHaveBeenCalledWith('board-1', 10);
  });

  it('reads members and decisions from props in demo mode', async () => {
    const demoConsilium = {
      ...consilium,
      membersByBoard: { 'board-1': [{ id: 'x1', name: 'Demo Person', role: 'evaluator' }] },
      decisionsByBoard: {
        'board-1': [
          {
            id: 'x2',
            approved: false,
            overall_score: 3,
            summary: 'Demo rejection',
            created_at: '2026-06-01T10:00:00Z',
          },
        ],
      },
    };
    render(
      <Wrap>
        <ConsiliumActivity consilium={demoConsilium} orgs={orgs} demo />
      </Wrap>
    );
    expect(await screen.findByText('Demo rejection')).toBeInTheDocument();
    // Member preview comes from props (no click needed, no live call).
    expect(await screen.findByText(/Demo Person/)).toBeInTheDocument();
    expect(getEvaluationHistory).not.toHaveBeenCalled();
    expect(getAllMembers).not.toHaveBeenCalled();
  });

  it('shows a scoped empty state when the selected org has no board', () => {
    const orgsNoBoard = [{ id: 'org-9', name: 'Empty Org', parent_id: null, consilium_id: null }];
    render(
      <Wrap>
        <ConsiliumActivity consilium={consilium} orgs={orgsNoBoard} selectedOrgId="org-9" />
      </Wrap>
    );
    expect(screen.getByText('No Consilium board for Empty Org.')).toBeInTheDocument();
  });

  it('renders skeletons while loading', () => {
    const { container } = render(
      <Wrap>
        <ConsiliumActivity consilium={null} orgs={orgs} loading />
      </Wrap>
    );
    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
  });
});
