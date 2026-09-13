import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
});

import SettingsTabRail from './SettingsTabRail.jsx';

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: PersonOutlinedIcon },
  { id: 'meetings', label: 'Calendar', icon: EventAvailableOutlinedIcon },
  { id: 'payments', label: 'Payments', icon: CreditCardOutlinedIcon },
];

const theme = createTheme();
function renderRail(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <SettingsTabRail sections={SECTIONS} activeId="profile" onSelect={() => {}} {...props} />
    </ThemeProvider>
  );
}

describe('SettingsTabRail', () => {
  it('renders every section as a tab', () => {
    renderRail();
    expect(screen.getByRole('tab', { name: /Profile/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Calendar/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Payments/i })).toBeInTheDocument();
  });

  it('marks the active section as selected and gives it the only tab stop', () => {
    renderRail({ activeId: 'meetings' });
    const calendar = screen.getByRole('tab', { name: /Calendar/i });
    expect(calendar).toHaveAttribute('aria-selected', 'true');
    expect(calendar).toHaveAttribute('tabindex', '0');
    const profile = screen.getByRole('tab', { name: /Profile/i });
    expect(profile).toHaveAttribute('aria-selected', 'false');
    expect(profile).toHaveAttribute('tabindex', '-1');
  });

  it('points each tab at the panel it controls', () => {
    renderRail();
    expect(screen.getByRole('tab', { name: /Profile/i })).toHaveAttribute(
      'aria-controls',
      'settings-panel-profile'
    );
  });

  it('calls onSelect with the section id when a tab is clicked', () => {
    const onSelect = vi.fn();
    renderRail({ onSelect });
    fireEvent.click(screen.getByRole('tab', { name: /Payments/i }));
    expect(onSelect).toHaveBeenCalledWith('payments');
  });

  it('moves through tabs with the arrow keys and wraps around', () => {
    const onSelect = vi.fn();
    renderRail({ onSelect });
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenCalledWith('meetings');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith('payments');
  });

  it('jumps to the first and last tab with Home and End', () => {
    const onSelect = vi.fn();
    renderRail({ onSelect, activeId: 'meetings' });
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith('payments');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(onSelect).toHaveBeenLastCalledWith('profile');
  });

  it('leans a pill toward the pointer and lets go on leave', () => {
    renderRail();
    const pill = screen.getByRole('tab', { name: /Profile/i });
    fireEvent.pointerMove(pill, { clientX: 200, clientY: 40 });
    expect(pill.style.getPropertyValue('--mx')).not.toBe('');
    fireEvent.pointerLeave(pill);
    expect(pill.style.getPropertyValue('--mx')).toBe('0');
  });

  it('renders the search and view-options slots', () => {
    renderRail({
      searchSlot: <button type="button">search</button>,
      viewOptionsButton: <button type="button">options</button>,
    });
    expect(screen.getByRole('button', { name: 'search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'options' })).toBeInTheDocument();
  });

  it('renders the sticky desktop bar (no media match) with all tabs', () => {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
    renderRail({ sticky: true });
    expect(screen.getByRole('tab', { name: /Profile/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Payments/i })).toBeInTheDocument();
  });

  it('portals the bar to the document on mobile (media match) and still fires onSelect', () => {
    window.matchMedia = (query) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
    const onSelect = vi.fn();
    renderRail({ sticky: true, onSelect });
    fireEvent.click(screen.getByRole('tab', { name: /Calendar/i }));
    expect(onSelect).toHaveBeenCalledWith('meetings');
  });
});
