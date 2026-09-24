/*
 * Light or dark: the look the landing wears. Dark is the brand's own look and the default;
 * light is only ever the visitor's pick, made with the switch in the footer. The system
 * setting is not followed, on purpose: the black stage is the design.
 *
 * The pick is kept in localStorage, and only a click writes it: a setting the visitor asked
 * for, so it needs no consent (German TDDDG § 25(2)). The Cookies & Storage page lists it.
 *
 * One store for the whole site (not a React provider), so the pick outlives a move to another
 * page, a second open tab follows it, and everything that paints reads the same value. No
 * React in here: the router's loading fallback reads it too.
 */

export const THEME_KEY = 'orqanix_theme';
export const THEMES = ['dark', 'light'];
export const DEFAULT_THEME = 'dark';

export const isTheme = (value) => THEMES.includes(value);

export function readSavedTheme() {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function saveTheme(theme) {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private windows and blocked storage: the pick simply lasts for this visit.
  }
}

const listeners = new Set();
let current = null;

/** The look now: the pick made in this visit, else the saved one, else dark. */
export function getTheme() {
  if (current === null) current = readSavedTheme() ?? DEFAULT_THEME;
  return current;
}

/** Shows `theme` everywhere. `remember` saves it; only a click should pass it. */
export function setTheme(theme, { remember = false } = {}) {
  if (!isTheme(theme)) return;
  if (remember) saveTheme(theme);
  if (theme === getTheme()) return;
  current = theme;
  listeners.forEach((listener) => listener());
}

// Another tab picked (or cleared the storage): follow it, without writing anything back.
function onStorage(event) {
  if (event.key !== THEME_KEY && event.key !== null) return;
  setTheme(readSavedTheme() ?? DEFAULT_THEME);
}

export function subscribe(listener) {
  if (listeners.size === 0) globalThis.window?.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) globalThis.window?.removeEventListener('storage', onStorage);
  };
}

/** For tests: forget this visit's pick, so the next read starts from storage again. */
export function resetThemeForTests() {
  current = null;
}
