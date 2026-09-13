import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../../components/Assistant/AssistantSetupChatDialog', () => ({
  default: ({ open }) => (open ? <div data-testid="assistant-setup-dialog" /> : null),
}));
// The graph view lazy-loads @xyflow/react; stub it.
vi.mock('../../components/Concilium/graph/ConsiliumTopologyView', () => ({
  default: () => <div data-testid="boards-graph-view" />,
}));

vi.mock('../../hooks/useConcilium', () => ({ useConcilium: () => ({ concilium: [] }) }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'tester@example.com' } }),
}));

vi.mock('../../services/organizationService', () => ({
  listOrganizations: vi.fn(async () => []),
  getOrgFinances: vi.fn(async () => ({})),
  createOrganization: vi.fn(async () => ({})),
}));
vi.mock('../../services/orgTeamService', () => ({ getOrgTeamMap: vi.fn(async () => ({})) }));
vi.mock('../../services/orgAgentService', () => ({ getOrgAgentMap: vi.fn(async () => ({})) }));
vi.mock('../../services/conciliumTeamsService', () => ({ getAllTeams: vi.fn(async () => []) }));
vi.mock('../../services/teamService', () => ({ getAllTeams: vi.fn(async () => []) }));
vi.mock('../../services/agentHubService', () => ({ getAgents: vi.fn(() => []) }));
vi.mock('../../services/toolService', () => ({ getAllTools: vi.fn(async () => []) }));
vi.mock('../../services/communicatorService', () => ({
  getChannels: vi.fn(async () => []),
  getScheduledReports: vi.fn(async () => []),
  getCommunicatorFiles: vi.fn(async () => []),
}));
vi.mock('../../services/userKeysService', () => ({ listUserKeys: vi.fn(async () => []) }));
vi.mock('../../services/storageConnectionsService', () => ({
  listStorageConnections: vi.fn(async () => []),
}));

import SimpleOrganizations, {
  ActivateAssistantDialog,
  OrgProgressTracker,
} from './SimpleOrganizations';

const theme = createTheme();
function Wrap({ children }) {
  return (
    <MemoryRouter>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigateMock.mockClear();
  localStorage.clear();
});

describe('SimpleOrganizations graph view toggle', () => {
  it('defaults to the graph view in simple mode', async () => {
    render(
      <Wrap>
        <SimpleOrganizations />
      </Wrap>
    );
    expect(await screen.findByTestId('boards-graph-view')).toBeTruthy();
  });

  it('switches to cards and remembers the choice', async () => {
    render(
      <Wrap>
        <SimpleOrganizations />
      </Wrap>
    );
    await screen.findByTestId('boards-graph-view'); // graph shown by default
    fireEvent.click(screen.getByLabelText('Cards view'));
    expect(screen.queryByTestId('boards-graph-view')).toBeNull();
    expect(localStorage.getItem('orch_orgs_simple_view')).toBe('cards');
  });
});

describe('SimpleOrganizations action tiles', () => {
  it.each([
    ['Check Consilium - board of directors', '/consilium'],
    ['Explore tools - offered and ready to use', '/tools'],
    ['Agent coordination - your agents', '/agent-hub'],
  ])('navigates to %s -> %s', (label, target) => {
    render(
      <Wrap>
        <SimpleOrganizations />
      </Wrap>
    );
    screen.getByLabelText(label).click();
    expect(navigateMock).toHaveBeenCalledWith(target);
  });

  it('shows the "Agents" tile title', () => {
    render(
      <Wrap>
        <SimpleOrganizations />
      </Wrap>
    );
    expect(screen.getByText('Agents')).toBeInTheDocument();
  });
});

describe('Activate Assistant tile buttons', () => {
  it('opens the setup dialog when Setup is clicked', async () => {
    render(
      <Wrap>
        <SimpleOrganizations />
      </Wrap>
    );
    expect(screen.queryByTestId('assistant-setup-dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Setup' }));
    expect(await screen.findByTestId('assistant-setup-dialog')).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('navigates to /assistant when My Assistant is clicked', () => {
    render(
      <Wrap>
        <SimpleOrganizations />
      </Wrap>
    );
    fireEvent.click(screen.getByRole('button', { name: 'My Assistant' }));
    expect(navigateMock).toHaveBeenCalledWith('/assistant');
  });
});

describe('ActivateAssistantDialog responsiveness', () => {
  const originalMatchMedia = window.matchMedia;

  // Mobile = any width-bounded (max-width) media query matches; desktop = none do.
  function mockViewport({ mobile }) {
    window.matchMedia = vi.fn((query) => ({
      matches: mobile ? /max-width/.test(query) : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  const baseProps = {
    open: true,
    onClose: vi.fn(),
    hasAssistant: false,
    setHasAssistant: vi.fn(),
    showToast: vi.fn(),
    orgId: 'org-1',
    hasAgent: false,
    toolCounts: { ready: 0 },
  };

  it('renders full-screen on mobile with the title and primary CTA', async () => {
    mockViewport({ mobile: true });
    render(
      <Wrap>
        <ActivateAssistantDialog {...baseProps} />
      </Wrap>
    );

    expect(await screen.findByText('Activate Assistant Control Panel')).toBeTruthy();
    expect(screen.getByText(/Ready All Modules to Deploy/i)).toBeTruthy();
    // MUI applies this class to the paper only when fullScreen is active.
    expect(document.querySelector('.MuiDialog-paperFullScreen')).toBeTruthy();
  });

  it('is not full-screen on desktop', async () => {
    mockViewport({ mobile: false });
    render(
      <Wrap>
        <ActivateAssistantDialog {...baseProps} />
      </Wrap>
    );

    expect(await screen.findByText('Activate Assistant Control Panel')).toBeTruthy();
    expect(document.querySelector('.MuiDialog-paperFullScreen')).toBeNull();
  });
});

describe('OrgProgressTracker info + guide popups', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    // Desktop viewport: no max-width query matches → guide dialog not full-screen.
    window.matchMedia = vi.fn((query) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  const baseProps = {
    hasOrg: false,
    hasAssistant: false,
    hasConsilium: false,
    hasTeam: false,
  };

  it('renders an (i) info affordance for every step', () => {
    render(
      <Wrap>
        <OrgProgressTracker {...baseProps} />
      </Wrap>
    );
    // The block is collapsed by default; expand it to reveal the steps.
    fireEvent.click(screen.getByText('Onboarding'));
    expect(screen.getAllByLabelText(/^What is /).length).toBe(4);
  });

  it('opens a focused guide popup with the step CTA when More is clicked', async () => {
    render(
      <Wrap>
        <OrgProgressTracker {...baseProps} />
      </Wrap>
    );
    fireEvent.click(screen.getByText('Onboarding')); // expand

    // First step is "Create Organisation".
    fireEvent.click(screen.getAllByRole('button', { name: 'More' })[0]);

    expect(await screen.findByText(/root you connect and build a structure from/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create Organisation' })).toBeTruthy();
  });

  it('calls onAction with the step key and closes the popup when the CTA is clicked', async () => {
    const onAction = vi.fn();
    render(
      <Wrap>
        <OrgProgressTracker {...baseProps} onAction={onAction} />
      </Wrap>
    );
    fireEvent.click(screen.getByText('Onboarding')); // expand

    fireEvent.click(screen.getAllByRole('button', { name: 'More' })[1]); // Activate Assistant
    fireEvent.click(await screen.findByRole('button', { name: 'Activate Assistant' }));

    expect(onAction).toHaveBeenCalledWith('activate-assistant');
    await waitFor(() => {
      expect(screen.queryByText(/check the company, try out features/i)).toBeNull();
    });
  });
});
