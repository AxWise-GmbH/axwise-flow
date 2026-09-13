import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import useSettingsTab from './useSettingsTab.js';
import { SETTINGS_LAST_TAB_KEY } from './settingsSections.js';

const TAB_IDS = ['profile', 'security', 'preferences'];

function Harness({ tabIds = TAB_IDS }) {
  const { activeTab, focusBlockKey, selectTab, clearFocus } = useSettingsTab(tabIds);
  const location = useLocation();
  return (
    <div>
      <span data-testid="active">{activeTab || 'none'}</span>
      <span data-testid="focus">{focusBlockKey || 'none'}</span>
      <span data-testid="search">{location.search}</span>
      <button type="button" onClick={() => selectTab('preferences')}>
        go preferences
      </button>
      <button type="button" onClick={() => selectTab('security', 'signin')}>
        go signin
      </button>
      <button type="button" onClick={() => selectTab(null)}>
        go nowhere
      </button>
      <button type="button" onClick={clearFocus}>
        clear focus
      </button>
    </div>
  );
}

function renderAt(url = '/settings', props = {}) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Harness {...props} />
    </MemoryRouter>
  );
}

describe('useSettingsTab', () => {
  beforeEach(() => {
    window.localStorage.removeItem(SETTINGS_LAST_TAB_KEY);
    window.scrollTo = vi.fn();
  });

  it('opens the tab the URL asks for', () => {
    renderAt('/settings?section=security');
    expect(screen.getByTestId('active')).toHaveTextContent('security');
  });

  it('accepts ?tab= as an alias', () => {
    renderAt('/settings?tab=preferences');
    expect(screen.getByTestId('active')).toHaveTextContent('preferences');
  });

  it('falls back to the first tab for a section that is not on the rail', () => {
    renderAt('/settings?section=devmode');
    expect(screen.getByTestId('active')).toHaveTextContent('profile');
  });

  it('reopens the remembered tab when the URL says nothing', () => {
    window.localStorage.setItem(SETTINGS_LAST_TAB_KEY, 'preferences');
    renderAt('/settings');
    expect(screen.getByTestId('active')).toHaveTextContent('preferences');
  });

  it('writes the chosen tab to the URL and remembers it', () => {
    renderAt('/settings');
    fireEvent.click(screen.getByRole('button', { name: 'go preferences' }));
    expect(screen.getByTestId('active')).toHaveTextContent('preferences');
    expect(screen.getByTestId('search')).toHaveTextContent('section=preferences');
    expect(window.localStorage.getItem(SETTINGS_LAST_TAB_KEY)).toBe('preferences');
  });

  it('drops a stale ?tab= alias when it rewrites the URL', () => {
    renderAt('/settings?tab=profile');
    fireEvent.click(screen.getByRole('button', { name: 'go preferences' }));
    expect(screen.getByTestId('search')).not.toHaveTextContent('tab=');
  });

  it('carries a block pick from search across the tab change, then clears it', () => {
    renderAt('/settings');
    fireEvent.click(screen.getByRole('button', { name: 'go signin' }));
    expect(screen.getByTestId('active')).toHaveTextContent('security');
    expect(screen.getByTestId('focus')).toHaveTextContent('signin');
    fireEvent.click(screen.getByRole('button', { name: 'clear focus' }));
    expect(screen.getByTestId('focus')).toHaveTextContent('none');
  });

  it('ignores a selection with no tab id', () => {
    renderAt('/settings?section=security');
    fireEvent.click(screen.getByRole('button', { name: 'go nowhere' }));
    expect(screen.getByTestId('active')).toHaveTextContent('security');
  });

  it('reports no tab when the rail is empty', () => {
    renderAt('/settings', { tabIds: [] });
    expect(screen.getByTestId('active')).toHaveTextContent('none');
  });
});
