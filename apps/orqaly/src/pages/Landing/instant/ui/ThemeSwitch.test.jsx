import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ThemeSwitch from './ThemeSwitch';
import { THEME_KEY, getTheme, resetThemeForTests } from '../themeMode';

const html = document.documentElement;

describe('ThemeSwitch', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetThemeForTests();
  });

  afterEach(() => {
    delete document.startViewTransition;
    delete html.animate;
    delete window.matchMedia;
    html.classList.remove('oi-theme-swap');
  });

  it('shows the sun on the dark page and offers the light one', () => {
    render(<ThemeSwitch />);
    const button = screen.getByRole('button', { name: 'Switch to light mode' });
    expect(button).toHaveAttribute('data-mode', 'dark');
    // Icon only: the name is for screen readers, nothing is written on the button.
    expect(button.textContent).toBe('');
  });

  it('turns the page light, saves the pick, and then offers dark', () => {
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(getTheme()).toBe('light');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light');

    const moon = screen.getByRole('button', { name: 'Switch to dark mode' });
    expect(moon).toHaveAttribute('data-mode', 'light');
    fireEvent.click(moon);
    expect(getTheme()).toBe('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('spreads the new look as a circle from the switch, one swap at a time', async () => {
    let finish;
    html.animate = vi.fn();
    document.startViewTransition = vi.fn((update) => {
      update();
      return {
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        finished: new Promise((resolve) => {
          finish = resolve;
        }),
      };
    });
    render(<ThemeSwitch />);
    const button = screen.getByRole('button');
    button.getBoundingClientRect = () => ({ left: 100, top: 200, width: 44, height: 44 });

    fireEvent.click(button);
    expect(document.startViewTransition).toHaveBeenCalledTimes(1);
    expect(getTheme()).toBe('light');
    // Other transitions wait while the look changes (theme.css).
    expect(html).toHaveClass('oi-theme-swap');

    await act(async () => {});
    expect(html.animate).toHaveBeenCalledWith(
      {
        clipPath: [
          'circle(0px at 122px 222px)',
          expect.stringMatching(/^circle\([\d.]+px at 122px 222px\)$/),
        ],
      },
      expect.objectContaining({ pseudoElement: '::view-transition-new(root)' })
    );

    // A press while the circle is still growing changes nothing.
    fireEvent.click(button);
    expect(document.startViewTransition).toHaveBeenCalledTimes(1);
    expect(getTheme()).toBe('light');

    await act(async () => finish());
    expect(html).not.toHaveClass('oi-theme-swap');
  });

  it('swaps at once, without the circle, for reduced motion', () => {
    window.matchMedia = vi.fn(() => ({ matches: true }));
    document.startViewTransition = vi.fn();
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole('button'));
    expect(document.startViewTransition).not.toHaveBeenCalled();
    expect(getTheme()).toBe('light');
  });

  it('works where the browser has no View Transitions', () => {
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole('button'));
    expect(getTheme()).toBe('light');
  });
});
