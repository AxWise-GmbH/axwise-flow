import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({
  auth: {
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_one',
    getToken: vi.fn(async () => 'clerk-token'),
  },
  client: {
    assistantThreads: vi.fn(),
    overview: vi.fn(),
  },
  createClient: vi.fn(),
}));

h.createClient.mockImplementation(() => h.client);

vi.mock('@clerk/react', () => ({ useAuth: () => h.auth }));
vi.mock('../../workflow-v2/api.js', () => ({
  createWorkflowV2Client: (...args) => h.createClient(...args),
}));
vi.mock('../../pages/Standart/primitives/BrandOrb.jsx', () => ({
  default: ({ size, title }) => (
    <span role="img" aria-label={title} data-testid="brand-orb" data-size={size} />
  ),
}));

import GcpStandardNav, {
  GCP_STANDARD_NAV_BRAND_SIZE,
  GCP_STANDARD_NAV_COLLAPSE_CONTROL_SIZE,
  GCP_STANDARD_NAV_RAIL_WIDTH,
  GCP_STANDARD_NAV_WIDTH,
} from './GcpStandardNav.jsx';
import { gcpNavCollapsedStorageKey } from './gcpNavChrome.js';
import { gcpNavStorageKey } from './gcpNavItems.js';

const theme = createTheme({ palette: { mode: 'dark' } });

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function navTree(initialEntry = '/assistant', props = {}) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <ThemeProvider theme={theme}>
        <GcpStandardNav variant="permanent" {...props} />
        <LocationProbe />
      </ThemeProvider>
    </MemoryRouter>
  );
}

function mount(initialEntry = '/assistant', props = {}) {
  return render(navTree(initialEntry, props));
}

function openMoreMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  return screen.getByRole('menu', { name: 'More workspace utilities' });
}

function openEditSidebar() {
  openMoreMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Edit sidebar' }));
}

function workflow(id, title, status = 'completed') {
  return {
    id,
    title,
    status,
    updatedAt: '2026-09-01T09:00:00.000Z',
  };
}

beforeEach(() => {
  h.auth.isLoaded = true;
  h.auth.isSignedIn = true;
  h.auth.userId = 'user_one';
  h.auth.getToken = vi.fn(async () => 'clerk-token');
  h.client.assistantThreads.mockReset().mockResolvedValue({
    threads: [
      {
        id: 'thread-1',
        title: 'Launch research',
        updatedAt: '2026-09-01T10:00:00.000Z',
      },
    ],
  });
  h.client.overview.mockReset().mockResolvedValue({
    workflows: [workflow('run-1', 'Prepare the launch brief')],
  });
  h.createClient.mockReset().mockImplementation(() => h.client);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('GcpStandardNav', () => {
  it('uses the exact PR59 geometry, hides account chrome, and restores the rail per Clerk user', async () => {
    const first = mount('/home', {
      accountControl: <button type="button">Account</button>,
    });
    await waitFor(() => expect(screen.getByText('Launch research')).toBeInTheDocument());

    expect(GCP_STANDARD_NAV_WIDTH).toBe(260);
    expect(GCP_STANDARD_NAV_RAIL_WIDTH).toBe(56);
    expect(GCP_STANDARD_NAV_BRAND_SIZE).toBe(38);
    expect(GCP_STANDARD_NAV_COLLAPSE_CONTROL_SIZE).toBe(28);
    expect(screen.getByTestId('brand-orb')).toHaveAttribute('data-size', '38');
    expect(screen.queryByText('AxWise inside')).not.toBeInTheDocument();
    expect(screen.getByText('Orqanix')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse workspace menu' })).toHaveAttribute(
      'data-control-size',
      '28'
    );
    expect(screen.getByTestId('gcp-standard-nav-aside')).toHaveAttribute('data-collapsed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse workspace menu' }));

    expect(screen.getByTestId('gcp-standard-nav-aside')).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByRole('navigation', { name: 'Orqanix workspace' })).toHaveAttribute(
      'data-nav-mode',
      'rail'
    );
    expect(screen.getByTestId('brand-orb')).toHaveAttribute('data-size', '38');
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Notifications' })).not.toBeInTheDocument();
    openMoreMenu();
    expect(screen.getByRole('menuitem', { name: 'Notifications' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByText('Orqanix')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(window.localStorage.getItem(gcpNavCollapsedStorageKey('user_one'))).toBe('1')
    );

    first.unmount();
    mount('/home');
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('gcp-standard-nav-aside')).toHaveAttribute('data-collapsed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Intelligence' }));
    expect(screen.getByTestId('gcp-standard-nav-aside')).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByRole('button', { name: 'Intelligence' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('loads real Clerk-authenticated chat and Goal recents and exposes accessible folds', async () => {
    mount();

    expect(screen.getByRole('button', { name: 'Recents' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    await waitFor(() => expect(screen.getByText('Launch research')).toBeInTheDocument());
    expect(screen.getByText('Prepare the launch brief')).toBeInTheDocument();
    expect(h.createClient).toHaveBeenCalledWith(h.auth.getToken);
    expect(h.client.assistantThreads).toHaveBeenCalledWith({ limit: 12 });
    expect(h.client.overview).toHaveBeenCalledWith({ limit: 12 });
    expect(screen.getByTestId('gcp-nav-disclosure-recents')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('gcp-nav-disclosure-intelligence')).toHaveAttribute(
      'data-open',
      'false'
    );
    const primaryList = screen
      .getByRole('navigation', { name: 'Orqanix workspace' })
      .querySelector('ul');
    expect(primaryList).not.toBeNull();
    expect([...primaryList.children].every((child) => child.tagName === 'LI')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Intelligence' }));
    expect(screen.getByRole('button', { name: 'Intelligence' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByTestId('gcp-nav-disclosure-intelligence')).toHaveAttribute(
      'data-open',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Recents' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Agents' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Capabilities' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Knowledge' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Results' })).toBeInTheDocument();
  });

  it('dispatches the new-conversation event before navigating to a unique query', async () => {
    const listener = vi.fn();
    window.addEventListener('orqaly:new-assistant-conversation', listener);
    mount('/assistant?thread=thread-1');
    await waitFor(() => expect(screen.getByText('Launch research')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));

    expect(listener).toHaveBeenCalledOnce();
    expect(screen.getByTestId('location').textContent).toMatch(/^\/assistant\?new=.+/u);
    window.removeEventListener('orqaly:new-assistant-conversation', listener);
  });

  it('stores pins under the signed-in Clerk user and restores no cross-user data', async () => {
    const first = mount();
    await waitFor(() => expect(screen.getByText('Launch research')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Pin Launch research' }));

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(gcpNavStorageKey('user_one')));
      expect(saved.pins).toEqual([
        expect.objectContaining({ id: 'chat:thread-1', label: 'Launch research' }),
      ]);
    });
    first.unmount();

    h.auth.userId = 'user_two';
    const second = mount();
    await waitFor(() => expect(h.client.assistantThreads).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Pinned' }));
    await waitFor(() => expect(screen.getByText('Nothing pinned yet')).toBeInTheDocument());
    second.unmount();

    h.auth.userId = 'user_one';
    mount();
    await waitFor(() => expect(h.client.assistantThreads).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole('button', { name: /^Pinned/u }));
    await waitFor(() => {
      const pinnedPanel = document.getElementById('gcp-nav-pinned-panel');
      expect(within(pinnedPanel).getByText('Launch research')).toBeInTheDocument();
    });
  });

  it('removes recents immediately when the Clerk user, API client, or sign-in state changes', async () => {
    const view = mount();
    await waitFor(() => expect(screen.getByText('Launch research')).toBeInTheDocument());

    const never = () => new Promise(() => {});
    const nextClient = { assistantThreads: vi.fn(never), overview: vi.fn(never) };
    h.auth.userId = 'user_two';
    h.auth.getToken = vi.fn(async () => 'different-clerk-token');
    h.createClient.mockReturnValue(nextClient);
    view.rerender(navTree());

    expect(screen.queryByText('Launch research')).not.toBeInTheDocument();
    expect(screen.queryByText('Prepare the launch brief')).not.toBeInTheDocument();

    h.auth.isSignedIn = false;
    h.auth.userId = null;
    await act(async () => {
      view.rerender(navTree());
      await Promise.resolve();
    });

    expect(screen.queryByText('Launch research')).not.toBeInTheDocument();
    expect(screen.queryByText('Prepare the launch brief')).not.toBeInTheDocument();
  });

  it('persists sidebar visibility honestly as browser-local customization', async () => {
    const first = mount('/home');
    await waitFor(() => expect(screen.getByText('Launch research')).toBeInTheDocument());
    openEditSidebar();
    expect(
      screen.getByText(/saved in this browser for this signed-in account/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Home' }));
    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(gcpNavStorageKey('user_one')));
      expect(saved.hiddenSectionIds).toContain('home');
    });
    first.unmount();

    mount('/home');
    await waitFor(() => expect(screen.getByText('Launch research')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
    openEditSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
  });

  it('persists accessible section order and divider customization', async () => {
    const first = mount('/home');
    await waitFor(() => expect(screen.getByText('Launch research')).toBeInTheDocument());
    expect(screen.getByRole('separator', { name: 'Divider before Workspace' })).toHaveAttribute(
      'data-section-gap-before',
      'structure'
    );
    openEditSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Move Home up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add divider before Home' }));

    expect(screen.getByRole('button', { name: 'Move Home up' })).not.toBeDisabled();
    expect(screen.getByRole('separator', { name: 'Divider before Home' })).toBeInTheDocument();
    const home = screen.getByRole('button', { name: 'Home' });
    const pinned = screen.getByRole('button', { name: 'Pinned' });
    expect(home.compareDocumentPosition(pinned) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(gcpNavStorageKey('user_one')));
      expect(saved.sectionOrder.slice(0, 3)).toEqual(['recents', 'home', 'pinned']);
      expect(saved.sectionGapIds).toContain('home');
    });
    first.unmount();

    mount('/home');
    await waitFor(() => expect(screen.getByText('Launch research')).toBeInTheDocument());
    expect(screen.getByRole('separator', { name: 'Divider before Home' })).toBeInTheDocument();
    openEditSidebar();
    expect(screen.getByRole('button', { name: 'Remove divider before Home' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('renders one PR59 footer line with Settings and a labelled More menu', async () => {
    mount('/notification-center');
    await waitFor(() => expect(screen.getByText('Launch research')).toBeInTheDocument());

    const utilities = screen.getByRole('group', { name: 'Workspace utilities' });
    expect(within(utilities).getByText('Orqanix')).toBeInTheDocument();
    expect(within(utilities).getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(within(utilities).getByRole('button', { name: 'More' })).toHaveAttribute(
      'aria-haspopup',
      'menu'
    );
    openMoreMenu();
    expect(screen.getByRole('menuitem', { name: 'Notifications' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('menuitem', { name: 'Activity & Usage' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Edit sidebar' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Activity & Usage' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/audit-log');
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/settings');

    openEditSidebar();
    expect(screen.getByRole('region', { name: 'Edit sidebar' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/settings');
  });

  it('keeps the responsive phone drawer full-width and closes it after navigation', async () => {
    mount('/assistant', { variant: 'mobile' });
    expect(screen.queryByRole('navigation', { name: 'Orqanix workspace' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open workspace menu' }));
    const drawerNav = await screen.findByRole('navigation', { name: 'Orqanix workspace' });
    expect(drawerNav).toHaveAttribute('data-nav-mode', 'drawer');
    expect(screen.getByRole('button', { name: 'Close workspace menu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/home');
    await waitFor(() =>
      expect(screen.queryByRole('navigation', { name: 'Orqanix workspace' })).not.toBeInTheDocument()
    );
  });
});
