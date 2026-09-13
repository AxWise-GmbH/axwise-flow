import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../hooks/useSimpleMode', () => ({
  useSimpleMode: () => ({
    simpleMode: true,
    setSimpleMode: vi.fn(),
    toggleSimpleMode: vi.fn(),
  }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { displayName: 'mister', email: 'misters.builder@gmail.com', id: 'user-1' },
    logout: vi.fn(),
  }),
}));

vi.mock('../../context/NotificationContext', () => ({
  useNotifications: () => ({
    notifications: [],
    openNotificationCenter: vi.fn(),
    closeNotificationCenter: vi.fn(),
    openHumanTaskInbox: vi.fn(),
    closeHumanTaskInbox: vi.fn(),
    humanTaskPendingCount: 0,
    pushNotification: vi.fn(),
  }),
}));

vi.mock('../../context/ThemeContext', () => ({
  useThemeMode: () => ({
    mode: 'dark',
    toggleColorMode: vi.fn(),
    devMode: false,
  }),
}));

vi.mock('../../context/DevTasksContext', () => ({
  useDevTasks: () => ({
    getAllTasks: () => [],
  }),
}));

vi.mock('../../pages/Setup/useSetupProgress', () => ({
  useSetupProgress: () => ({
    completedSteps: 0,
    totalSteps: 5,
    loading: false,
    allRequiredDone: false,
  }),
}));

vi.mock('../../pages/Organizations/useOrgProgress', () => ({
  useOrgProgress: () => ({
    completed: 0,
    total: 4,
    loading: false,
    allDone: false,
  }),
}));

import TopBar from './TopBar';

const theme = createTheme({ palette: { mode: 'dark' } });

function renderTopBar() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <ThemeProvider theme={theme}>
        <TopBar hideSidebarToggle />
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('TopBar simple mode menu', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders the glass tile account menu without the Profile & Settings row', () => {
    renderTopBar();
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));

    expect(screen.getByText('Platform mode')).toBeInTheDocument();
    expect(screen.getByText('Human tasks')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Setup')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Sign out/i })).toBeInTheDocument();
    expect(screen.queryByText('Profile & Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Manage your profile and preferences')).not.toBeInTheDocument();
  });

  it('navigates to /settings when Profile tile is clicked', () => {
    renderTopBar();
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));

    fireEvent.click(screen.getByText('Profile'));

    expect(mockNavigate).toHaveBeenCalledWith('/settings');
  });
});
