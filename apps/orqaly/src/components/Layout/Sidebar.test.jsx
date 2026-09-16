import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Force advanced (grouped) mode as an admin with no business modules / features /
// replicators active, so only the static CONTROL POINT + INSTRUMENTS groups render.
vi.mock('../../hooks/useSimpleMode', () => ({
  useSimpleMode: () => ({ simpleMode: false, setSimpleMode: vi.fn(), toggleSimpleMode: vi.fn() }),
}));
vi.mock('../../context/PartnerAccessContext', () => ({
  usePartnerAccessOptional: () => ({
    isPartnerRole: false,
    roleId: 'role-super-admin',
    loaded: true,
  }),
}));
// Mutable branding state so individual tests can exercise custom logo/name/subtitle.
const themeState = {
  motivationEnabled: false,
  motivationLanguage: 'en',
  logoDefaultPage: '/home',
  brandName: '',
  brandSubtitle: '',
  brandLogo: '',
};
vi.mock('../../context/ThemeContext', () => ({
  useThemeMode: () => themeState,
}));
vi.mock('../../hooks/useEnabledFeatures', () => ({
  useEnabledFeatures: () => ({ enabledFeatures: [] }),
}));
vi.mock('../../hooks/useActiveBusinessModules', () => ({
  useActiveBusinessModules: () => ({ isModuleActive: () => false }),
}));
// Mutable hidden-pages state so individual tests can hide a page.
const hiddenPagesState = { hiddenPages: [] };
vi.mock('../../hooks/useHiddenPages', () => ({
  useHiddenPages: () => hiddenPagesState,
}));
vi.mock('../../context/ReplicatorContext', () => ({
  useReplicatorsOptional: () => null,
}));
// Confetti touches the canvas on logo click; stub it so the import stays inert.
vi.mock('../../utils/confettiCanvas', () => ({ fireConfetti: vi.fn() }));

import Sidebar, { ALL_BOTTOM_NAV_ITEMS, CONSUMER_NAV_ITEMS, NAV_GROUPS } from './Sidebar';

const theme = createTheme();

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <ThemeProvider theme={theme}>
        <Sidebar mobileOpen onMobileClose={vi.fn()} />
      </ThemeProvider>
    </MemoryRouter>
  );
}

// The row <li> that holds a given nav label, so we can look for its BETA chip.
function rowFor(label) {
  return screen.getByText(label).closest('li');
}

describe('Sidebar branding header', () => {
  afterEach(() => {
    themeState.brandName = '';
    themeState.brandSubtitle = '';
    themeState.brandLogo = '';
  });

  it('shows the default name and subtitle when no branding is set', () => {
    renderSidebar();
    expect(screen.getByText('Orchestrator')).toBeTruthy();
    expect(screen.getByText('Admin Dashboard')).toBeTruthy();
  });

  it('renders custom name, subtitle, and logo image when branding is set', () => {
    themeState.brandName = 'Acme Corp';
    themeState.brandSubtitle = 'Mission Control';
    themeState.brandLogo = 'data:image/png;base64,AAAA';
    renderSidebar();
    expect(screen.getByText('Acme Corp')).toBeTruthy();
    expect(screen.getByText('Mission Control')).toBeTruthy();
    expect(screen.queryByText('Orchestrator')).toBeNull();
    const imgs = Array.from(document.querySelectorAll('img'));
    expect(imgs.some((el) => el.getAttribute('src') === 'data:image/png;base64,AAAA')).toBe(true);
  });
});

describe('Sidebar hidden pages', () => {
  afterEach(() => {
    hiddenPagesState.hiddenPages = [];
  });

  it('renders a nav page by default (nothing hidden)', () => {
    renderSidebar();
    expect(screen.getByText('Knowledge')).toBeTruthy();
  });

  it('omits a page the user has hidden while keeping the others and Home', () => {
    hiddenPagesState.hiddenPages = ['/knowledge-base'];
    renderSidebar();
    expect(screen.queryByText('Knowledge')).toBeNull();
    expect(screen.getByText('Tools')).toBeTruthy();
    expect(screen.getByText('Home')).toBeTruthy();
  });

  it('never hides Home even if its path is in the hidden set', () => {
    hiddenPagesState.hiddenPages = ['/home'];
    renderSidebar();
    expect(screen.getByText('Home')).toBeTruthy();
  });
});

describe('Sidebar catalog naming', () => {
  it('keeps both nav variants on one route and one Personal Catalog label', () => {
    const advanced = NAV_GROUPS.flatMap((group) => group.items).find(
      (item) => item.path === '/marketplace'
    );
    const consumer = CONSUMER_NAV_ITEMS.find((item) => item.path === '/marketplace');

    expect(advanced?.label).toBe('Personal Catalog');
    expect(consumer?.label).toBe('Personal Catalog');
  });
});

describe('Sidebar advanced-mode Beta badges', () => {
  it('keeps only the retained Reports beta surface', () => {
    renderSidebar();
    expect(screen.getAllByText('BETA')).toHaveLength(1);
  });

  it('places the BETA badge on Reports', () => {
    renderSidebar();
    expect(within(rowFor('Reports')).getByText('BETA')).toBeTruthy();
    expect(screen.queryByText('Dashboards')).toBeNull();
    expect(screen.queryByText('Replicators')).toBeNull();
  });

  it('does not badge a non-beta item like Knowledge', () => {
    renderSidebar();
    expect(within(rowFor('Knowledge')).queryByText('BETA')).toBeNull();
  });
});

describe('Sidebar lean navigation', () => {
  it('merges duplicate work surfaces and hides deferred modules', () => {
    const items = NAV_GROUPS.flatMap((group) => group.items);
    expect(items.find((item) => item.label === 'Goals')?.path).toBe(
      '/assistant?section=goals'
    );
    expect(items.some((item) => item.path === '/workflow')).toBe(false);
    expect(items.some((item) => item.path === '/partners')).toBe(false);
    expect(items.some((item) => item.path === '/replicators')).toBe(false);
    expect(ALL_BOTTOM_NAV_ITEMS.some((item) => item.path === '/roles')).toBe(false);
  });
});
