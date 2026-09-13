import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mutable hidden-pages state + spies so tests can drive the panel.
const state = { hiddenPages: [] };
const togglePage = vi.fn();
const showAll = vi.fn();
const hideAll = vi.fn();
vi.mock('../../hooks/useHiddenPages', () => ({
  useHiddenPages: () => ({ ...state, togglePage, showAll, hideAll }),
}));

// AppIcon reads simple mode; force a deterministic value so it renders MUI icons.
vi.mock('../../hooks/useSimpleMode', () => ({
  useSimpleMode: () => ({ simpleMode: false, setSimpleMode: vi.fn(), toggleSimpleMode: vi.fn() }),
}));

import PagesVisibilityPanel from './PagesVisibilityPanel';

const theme = createTheme();
function renderPanel() {
  return render(
    <ThemeProvider theme={theme}>
      <PagesVisibilityPanel />
    </ThemeProvider>
  );
}

function rowFor(label) {
  return screen.getByText(label).closest('[role="listitem"]');
}

describe('PagesVisibilityPanel', () => {
  beforeEach(() => {
    state.hiddenPages = [];
    vi.clearAllMocks();
  });

  it('lists sidebar pages grouped, including Home and a bottom-nav page', () => {
    renderPanel();
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Knowledge')).toBeTruthy();
    expect(screen.getByText('Documentation')).toBeTruthy();
  });

  it('renders Home as locked (always on), with no Hide button', () => {
    renderPanel();
    const home = rowFor('Home');
    expect(within(home).getByText('Always on')).toBeTruthy();
    expect(within(home).queryByRole('button', { name: /hide home/i })).toBeNull();
  });

  it('shows "All pages visible" when nothing is hidden', () => {
    renderPanel();
    expect(screen.getByText('All pages visible')).toBeTruthy();
  });

  it('calls togglePage with the page path when Hide is clicked', () => {
    renderPanel();
    const row = rowFor('Knowledge');
    fireEvent.click(within(row).getByRole('button', { name: /hide knowledge/i }));
    expect(togglePage).toHaveBeenCalledWith('/knowledge-base');
  });

  it('reflects a hidden page: shows the count and a Show action', () => {
    state.hiddenPages = ['/knowledge-base'];
    renderPanel();
    expect(screen.getByText(/1 of \d+ pages hidden/)).toBeTruthy();
    const row = rowFor('Knowledge');
    fireEvent.click(within(row).getByRole('button', { name: /show knowledge/i }));
    expect(togglePage).toHaveBeenCalledWith('/knowledge-base');
  });

  it('Show all is disabled with nothing hidden; Hide all hides every togglable page', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Show all' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Hide all' }));
    expect(hideAll).toHaveBeenCalledTimes(1);
    const paths = hideAll.mock.calls[0][0];
    expect(paths).not.toContain('/home');
    expect(paths).toContain('/knowledge-base');
  });

  it('Show all clears the hidden set when something is hidden', () => {
    state.hiddenPages = ['/knowledge-base'];
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(showAll).toHaveBeenCalledTimes(1);
  });
});
