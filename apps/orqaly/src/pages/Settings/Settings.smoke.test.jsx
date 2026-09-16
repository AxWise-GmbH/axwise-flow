/**
 * A render of the whole page, thin on purpose: it exists to prove the tabbed
 * shell mounts, that only the active tab is on screen, and that the URL picks
 * the tab. The individual controls are covered by the tab suites.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'u1', email: 'misters.builder@gmail.com', displayName: 'Mr.V' } }),
}));
vi.mock('../../context/NotificationContext', () => ({
  useNotifications: () => ({ pushNotification: vi.fn() }),
}));
// Mutable so a test can ask what a non-admin sees without a second test file.
const access = vi.hoisted(() => ({ isPartnerRole: false, roleId: 'role-super-admin' }));
vi.mock('../../context/PartnerAccessContext', () => ({
  usePartnerAccessOptional: () => access,
}));
vi.mock('../../context/ThemeContext', () => ({
  useThemeMode: () => ({
    toggleColorMode: vi.fn(),
    primaryColor: '#10B981',
    setPrimaryColor: vi.fn(),
    motivationEnabled: true,
    setMotivationEnabled: vi.fn(),
    motivationLanguage: 'en',
    setMotivationLanguage: vi.fn(),
    logoDefaultPage: '/home',
    setLogoDefaultPage: vi.fn(),
    devMode: false,
    setDevMode: vi.fn(),
    iconSet: 'mui',
    setIconSet: vi.fn(),
    brandName: '',
    setBrandName: vi.fn(),
    brandSubtitle: '',
    setBrandSubtitle: vi.fn(),
    brandLogo: '',
    setBrandLogo: vi.fn(),
  }),
}));
vi.mock('../../hooks/useSimpleMode', () => ({
  useSimpleMode: () => ({ simpleMode: true, toggleSimpleMode: vi.fn() }),
}));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  hasSupabase: () => false,
}));
vi.mock('../../lib/auth', () => ({
  getSignInMethods: async () => [],
  changePassword: vi.fn(),
}));
vi.mock('../../services/profileDataBackend', () => ({
  resetProfileStorageFlag: vi.fn(),
  loadNotes: async () => [],
  loadTodos: async () => [],
  loadArchivedNotes: async () => [],
  loadArchivedTodos: async () => [],
  addNote: vi.fn(),
  addTodo: vi.fn(),
  updateNote: vi.fn(),
  updateTodo: vi.fn(),
  archiveNote: vi.fn(),
  archiveTodo: vi.fn(),
  unarchiveNote: vi.fn(),
  unarchiveTodo: vi.fn(),
  deleteNote: vi.fn(),
  deleteTodo: vi.fn(),
}));
vi.mock('../../services/auditLogBackend', () => ({
  logAction: vi.fn(),
  loadAuditLogs: async () => [],
  loadSettingsActionLogs: async () => [],
}));
vi.mock('../../services/rolesPermissionsService', () => ({
  loadRoles: async () => [],
  getRoleIdForUser: async () => 'role-super-admin',
}));
vi.mock('../../services/emailNotificationDispatcher', () => ({ invalidatePrefsCache: vi.fn() }));
vi.mock('../../services/publicBookingService', () => ({
  default: { getSettings: async () => ({}), saveSettings: vi.fn() },
}));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn();
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
});

import Settings from './Settings.jsx';

function renderSettings(url = '/settings') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ThemeProvider theme={createTheme({ palette: { mode: 'dark' } })}>
        <Settings />
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('Settings page', () => {
  beforeEach(() => {
    window.localStorage.clear();
    access.isPartnerRole = false;
    access.roleId = 'role-super-admin';
  });

  it('opens on Profile, as three sections rather than one slab', async () => {
    renderSettings();
    expect(await screen.findByRole('tab', { name: /Profile/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Todo list')).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toBeInTheDocument();
  });

  it('shows only the tab that is open', async () => {
    renderSettings();
    await screen.findByText('Account');
    // Security is a tab, but its controls are not on the page.
    expect(screen.getByRole('tab', { name: /Security/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Current password')).toBeNull();
  });

  it('opens the tab the URL names', async () => {
    renderSettings('/settings?section=preferences');
    expect(await screen.findByText('Interface')).toBeInTheDocument();
    expect(screen.getByText('Accent colour')).toBeInTheDocument();
    expect(screen.queryByLabelText('Display name')).toBeNull();
  });

  it('switches tabs when a pill is clicked', async () => {
    renderSettings();
    await screen.findByText('Account');
    fireEvent.click(screen.getByRole('tab', { name: /Security/i }));
    await waitFor(() => expect(screen.getByLabelText('Current password')).toBeInTheDocument());
    expect(screen.queryByLabelText('Display name')).toBeNull();
  });

  it('carries the search field for finding a setting across tabs', async () => {
    renderSettings();
    await screen.findByText('Account');
    expect(screen.getByLabelText('Search settings')).toBeInTheDocument();
  });
  it('renders every other tab from the same section language', async () => {
    renderSettings('/settings?section=branding');
    expect(await screen.findByText('App identity')).toBeInTheDocument();
    expect(screen.getByText('Logo')).toBeInTheDocument();
    expect(screen.getByLabelText('App name')).toBeInTheDocument();
  });

  it('gives a super admin all three security blocks', async () => {
    renderSettings('/settings?section=security');
    expect(await screen.findByText('Password')).toBeInTheDocument();
    expect(screen.getByText('PIN')).toBeInTheDocument();
    expect(screen.getByText('Sign-in methods')).toBeInTheDocument();
  });

  it('drops a role-gated block instead of showing an empty section', async () => {
    access.roleId = 'role-manager';
    try {
      renderSettings('/settings?section=security');
      expect(await screen.findByText('Password')).toBeInTheDocument();
      expect(screen.queryByText('PIN')).toBeNull();
    } finally {
      access.roleId = 'role-super-admin';
    }
  });

  it('keeps a tab search hit reachable from another tab', async () => {
    renderSettings();
    await screen.findByText('Account');
    const field = screen.getByLabelText('Search settings');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'sidebar' } });
    fireEvent.click(await screen.findByText('Sidebar pages'));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Pages/i })).toHaveAttribute('aria-selected', 'true')
    );
  });
});
