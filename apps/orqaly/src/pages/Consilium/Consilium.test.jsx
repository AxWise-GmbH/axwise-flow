import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// BoardList owns its card/table view internally; this page test only needs a
// marker so it can verify section navigation.
vi.mock('../../components/Concilium/BoardList', () => ({
  default: () => <div data-testid="board-list">boards</div>,
}));

// Other tab panels + layout wrappers are not under test here.
vi.mock('../../components/Concilium/MemberList', () => ({ default: () => null }));
vi.mock('../../components/Concilium/CriteriaPanel', () => ({ default: () => null }));
vi.mock('../../components/Concilium/AgentLifecyclePanel', () => ({ default: () => null }));
vi.mock('../../components/Concilium/AnalyticsDashboard', () => ({ default: () => null }));
vi.mock('../../components/Concilium/SecurityEventsPanel', () => ({ default: () => null }));
vi.mock('../../components/Common/PageLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('../../components/Common/BentoCard', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('../../components/Common/MetricsToggleButton', () => ({ default: () => null }));

vi.mock('../../services/conciliumMembersBackend', () => ({
  loadMemberCountsByBoard: vi.fn(async () => ({})),
}));
vi.mock('../../hooks/useConcilium', () => ({
  useConcilium: () => ({
    concilium: [],
    addConcilium: vi.fn(),
    editConcilium: vi.fn(),
    removeConcilium: vi.fn(),
  }),
}));
vi.mock('../../hooks/useJobs', () => ({ useJobs: () => ({ jobs: [] }) }));
vi.mock('../../hooks/useShowMetrics', () => ({ useShowMetrics: () => [false, vi.fn()] }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import Consilium from './Consilium';

const theme = createTheme();

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/consilium']}>
      <ThemeProvider theme={theme}>
        <Consilium />
      </ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => localStorage.clear());

describe('Consilium section navigation', () => {
  it('keeps the section tabs available and switches from boards to governance', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Members' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Governance' })).toBeTruthy();
    expect(screen.getByTestId('board-list')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Governance' }));

    expect(screen.queryByTestId('board-list')).toBeNull();
    expect(screen.getByText('Tool Approval Mode')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Members' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Governance' })).toBeTruthy();
  });
});
