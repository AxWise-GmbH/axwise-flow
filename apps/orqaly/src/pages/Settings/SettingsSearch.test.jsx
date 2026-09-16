import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import SettingsSearch from './SettingsSearch.jsx';
import { SETTINGS_TABS } from './settingsSections.js';

const theme = createTheme();
function renderSearch(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <SettingsSearch tabs={SETTINGS_TABS} onPick={() => {}} {...props} />
    </ThemeProvider>
  );
}

function type(value) {
  const field = screen.getByLabelText('Search settings');
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value } });
  return field;
}

describe('SettingsSearch', () => {
  it('shows nothing until something is typed', () => {
    renderSearch();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('finds a block by a keyword and names the tab it lives on', () => {
    renderSearch();
    type('telegram');
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  it('hands the hit back when a result is clicked', () => {
    const onPick = vi.fn();
    renderSearch({ onPick });
    type('yubikey');
    fireEvent.click(screen.getByText('Sign-in methods'));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 'security', blockKey: 'signin' })
    );
  });

  it('picks the highlighted result with Enter', () => {
    const onPick = vi.fn();
    renderSearch({ onPick });
    const field = type('language');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 'preferences', blockKey: 'language' })
    );
  });

  it('moves the highlight with the arrow keys', () => {
    const onPick = vi.fn();
    renderSearch({ onPick });
    const field = type('page');
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('says so when nothing matches', () => {
    renderSearch();
    type('zzzzz');
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });

  it('clears on Escape', () => {
    renderSearch();
    const field = type('telegram');
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(field).toHaveValue('');
  });

  it('focuses the field from anywhere with "/"', () => {
    renderSearch();
    fireEvent.keyDown(window, { key: '/', target: document.body });
    expect(screen.getByLabelText('Search settings')).toHaveFocus();
  });

  it('only searches the tabs it was given', () => {
    renderSearch({ tabs: SETTINGS_TABS.filter((t) => !t.partnerHidden) });
    type('audit');
    expect(screen.queryByText('Action log')).toBeNull();
  });
});
