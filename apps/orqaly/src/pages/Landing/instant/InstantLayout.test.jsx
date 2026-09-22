import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InstantLayout from './InstantLayout';
import { PAGE_BACKGROUND, PAGE_BACKGROUND_LIGHT } from './palette';
import { THEME_KEY, resetThemeForTests } from './themeMode';

function renderLayout(props) {
  return render(
    <MemoryRouter>
      <InstantLayout title="Test page" {...props}>
        <p>Page body</p>
      </InstantLayout>
    </MemoryRouter>
  );
}

const root = (container) => container.querySelector('[data-landing-root]');

describe('InstantLayout opening', () => {
  afterEach(() => {
    delete document.fonts;
    vi.useRealTimers();
  });

  it('has no loading curtain: the page is there from the first frame', () => {
    const { container } = renderLayout({ entrance: true });
    expect(container.querySelector('.oi-loader')).toBeNull();
    expect(container.querySelector('[data-orb]')).toBeNull();
    expect(container).toHaveTextContent('Page body');
  });

  it('leaves pages without an entrance alone', () => {
    const { container } = renderLayout();
    expect(root(container)).not.toHaveAttribute('data-entrance');
  });

  it('plays at once when the browser has no font API to wait on', () => {
    const { container } = renderLayout({ entrance: true });
    expect(root(container)).toHaveAttribute('data-entrance', 'go');
  });

  it('holds the entrance until the first screen fonts are in', async () => {
    const load = vi.fn(() => Promise.resolve([]));
    document.fonts = { load };
    const { container } = renderLayout({ entrance: true });
    expect(root(container)).toHaveAttribute('data-entrance', 'wait');

    await act(async () => {});
    expect(load).toHaveBeenCalledWith('400 1em Geist');
    // The hero's second line is set in the light weight.
    expect(load).toHaveBeenCalledWith('300 1em Geist');
    expect(root(container)).toHaveAttribute('data-entrance', 'go');
  });

  it('loads no font from Google: the faces come with the site', () => {
    renderLayout({ entrance: true });
    expect(document.head.querySelector('link[href*="fonts.googleapis.com"]')).toBeNull();
  });

  it('never waits longer than 1.5 s for a slow font', () => {
    vi.useFakeTimers();
    document.fonts = { load: () => new Promise(() => {}) };
    const { container } = renderLayout({ entrance: true });
    expect(root(container)).toHaveAttribute('data-entrance', 'wait');

    act(() => vi.advanceTimersByTime(1499));
    expect(root(container)).toHaveAttribute('data-entrance', 'wait');
    act(() => vi.advanceTimersByTime(1));
    expect(root(container)).toHaveAttribute('data-entrance', 'go');
  });
});

describe('InstantLayout look (light / dark)', () => {
  let meta;

  beforeEach(() => {
    window.localStorage.clear();
    resetThemeForTests();
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#000000';
    document.head.append(meta);
  });

  afterEach(() => {
    meta.remove();
    window.localStorage.clear();
    resetThemeForTests();
  });

  it('is dark by default, on the root and on the ground behind the page', () => {
    const { container, unmount } = renderLayout();
    expect(root(container)).toHaveAttribute('data-oi-theme', 'dark');
    expect(root(container)).toHaveStyle({ backgroundColor: PAGE_BACKGROUND });
    expect(document.documentElement.dataset.oiTheme).toBe('dark');
    expect(meta.content).toBe('#000000');
    unmount();
    // Leaving the landing takes the look off the page again.
    expect(document.documentElement.dataset.oiTheme).toBeUndefined();
  });

  it('opens light when the visitor picked light before, bar colour included', () => {
    window.localStorage.setItem(THEME_KEY, 'light');
    const { container, unmount } = renderLayout();
    expect(root(container)).toHaveAttribute('data-oi-theme', 'light');
    expect(root(container)).toHaveStyle({ backgroundColor: PAGE_BACKGROUND_LIGHT });
    expect(document.documentElement.dataset.oiTheme).toBe('light');
    expect(meta.content).toBe(PAGE_BACKGROUND_LIGHT);
    unmount();
    expect(meta.content).toBe('#000000');
  });

  it('turns light from the switch in its footer, and back', () => {
    const { container } = renderLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(root(container)).toHaveAttribute('data-oi-theme', 'light');
    expect(document.documentElement.dataset.oiTheme).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(root(container)).toHaveAttribute('data-oi-theme', 'dark');
  });
});
