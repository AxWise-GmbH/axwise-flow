import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_THEME,
  THEME_KEY,
  getTheme,
  readSavedTheme,
  resetThemeForTests,
  setTheme,
  subscribe,
} from './themeMode';

describe('themeMode: the light/dark pick', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    resetThemeForTests();
  });

  it('starts dark, the brand look, and stores nothing until the visitor picks', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(getTheme()).toBe('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('opens on the look the visitor picked before', () => {
    window.localStorage.setItem(THEME_KEY, 'light');
    expect(getTheme()).toBe('light');
  });

  it('ignores anything in storage that is not a look', () => {
    window.localStorage.setItem(THEME_KEY, 'purple');
    expect(readSavedTheme()).toBeNull();
    expect(getTheme()).toBe('dark');
  });

  it('saves only a remembered pick (a click), never a passing change', () => {
    setTheme('light');
    expect(getTheme()).toBe('light');
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();

    setTheme('dark', { remember: true });
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('tells its listeners once per real change', () => {
    const listener = vi.fn();
    const stop = subscribe(listener);
    setTheme('light');
    setTheme('light');
    setTheme('sepia');
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    setTheme('dark');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('follows a pick made in another tab', () => {
    const stop = subscribe(() => {});
    window.localStorage.setItem(THEME_KEY, 'light');
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, newValue: 'light' }));
    expect(getTheme()).toBe('light');
    stop();
  });

  it('keeps working when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getTheme()).toBe('dark');
    expect(() => setTheme('light', { remember: true })).not.toThrow();
    expect(getTheme()).toBe('light');
  });
});
