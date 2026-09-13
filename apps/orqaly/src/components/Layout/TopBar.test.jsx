import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import TopBar from './TopBar';

// TopBar pulls in many app contexts; mock them to the minimum the setup
// widget needs, and stub the heavy child components so the header mounts.
vi.mock('../../context/NotificationContext', () => ({
  useNotifications: () => ({
    notifications: [],
    openNotificationCenter: vi.fn(),
    humanTaskPendingCount: 0,
    openHumanTaskInbox: vi.fn(),
  }),
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'tester@example.com' }, logout: vi.fn() }),
}));
vi.mock('../../context/ThemeContext', () => ({ useThemeMode: () => ({ devMode: false }) }));
// Mutable so individual tests can flip to advanced mode.
const modeState = vi.hoisted(() => ({ simpleMode: true }));
vi.mock('../../hooks/useSimpleMode', () => ({
  useSimpleMode: () => ({ simpleMode: modeState.simpleMode, toggleSimpleMode: vi.fn() }),
}));
vi.mock('../../context/DevTasksContext', () => ({
  useDevTasks: () => ({ getAllTasks: () => [] }),
}));
vi.mock('../../pages/Setup/useSetupProgress', () => ({
  useSetupProgress: () => ({
    completedSteps: 2,
    totalSteps: 4,
    loading: false,
    allRequiredDone: false,
  }),
}));
vi.mock('../../pages/Organizations/useOrgProgress', () => ({
  useOrgProgress: () => ({ completed: 1, total: 4, loading: false, allDone: false }),
}));
vi.mock('../Search/GlobalSearch', () => ({ default: () => null }));
vi.mock('../VoiceControl/VoiceControlButton', () => ({ default: () => null }));
vi.mock('../VoiceControl/AiOrb', () => ({ default: () => null }));
vi.mock('../Common/DevTasksPopover', () => ({ default: () => null }));
vi.mock('../Onboarding/WelcomeGuideV2', () => ({ default: () => null }));
vi.mock('./AccountGlassMenuPanel', () => ({ default: () => null }));

// Mutable so tests can simulate mobile (matches: true) vs desktop (false).
let mediaMatches = false;
beforeAll(() => {
  window.matchMedia = (query) => ({
    matches: mediaMatches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
});

afterEach(() => {
  modeState.simpleMode = true;
  mediaMatches = false;
});

function renderTopBarOnSetup(primaryMain) {
  const theme = createTheme({ palette: { mode: 'dark', primary: { main: primaryMain } } });
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={['/setup']}>
        <TopBar />
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('TopBar setup-progress widget', () => {
  it('colours the progress arc with the theme accent, not a hardcoded emerald', () => {
    const { container } = renderTopBarOnSetup('#DC2626'); // Red preset
    const arc = container.querySelector('circle[stroke-linecap="round"]');
    expect(arc).not.toBeNull();
    expect(arc.getAttribute('stroke')).toBe('#DC2626');
    expect(arc.getAttribute('stroke')).not.toMatch(/#10b981|#34d399/i);
  });

  it('follows a different accent (no fixed green)', () => {
    const { container } = renderTopBarOnSetup('#2563EB'); // Blue preset
    const arc = container.querySelector('circle[stroke-linecap="round"]');
    expect(arc.getAttribute('stroke')).toBe('#2563EB');
  });
});

describe('TopBar organizations-progress pill', () => {
  it('renders the org progress pill next to the back button on /organizations', () => {
    const theme = createTheme({ palette: { mode: 'dark', primary: { main: '#DC2626' } } });
    const { getByText } = render(
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={['/organizations']}>
          <TopBar />
        </MemoryRouter>
      </ThemeProvider>
    );
    expect(getByText('Organizations')).toBeTruthy();
    expect(getByText('1/4')).toBeTruthy();
    expect(getByText('1 of 4 steps')).toBeTruthy();
  });
});

describe('TopBar page-name badge (every simple-mode page)', () => {
  function renderOn(path) {
    const theme = createTheme({ palette: { mode: 'dark', primary: { main: '#DC2626' } } });
    return render(
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={[path]}>
          <TopBar />
        </MemoryRouter>
      </ThemeProvider>
    );
  }

  it('shows the name badge on a previously-unmapped page (/consilium)', () => {
    expect(renderOn('/consilium').getByText('Consilium')).toBeTruthy();
  });

  it('shows a Dashboard badge (no longer treated as home)', () => {
    expect(renderOn('/dashboard').getByText('Dashboard')).toBeTruthy();
  });
});

describe('TopBar advanced-mode page-name pill (mobile only)', () => {
  function renderAdvancedOn(path) {
    const theme = createTheme({ palette: { mode: 'dark', primary: { main: '#DC2626' } } });
    return render(
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={[path]}>
          <TopBar />
        </MemoryRouter>
      </ThemeProvider>
    );
  }

  it('shows the page-name pill next to the burger on mobile', () => {
    modeState.simpleMode = false;
    mediaMatches = true; // isMobile
    expect(renderAdvancedOn('/workflow').getByText('Workflow')).toBeTruthy();
  });

  it('does not show the pill on desktop advanced (sidebar + search instead)', () => {
    modeState.simpleMode = false;
    mediaMatches = false; // desktop
    expect(renderAdvancedOn('/workflow').queryByText('Workflow')).toBeNull();
  });
});
