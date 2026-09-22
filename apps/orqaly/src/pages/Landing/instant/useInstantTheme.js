import { useSyncExternalStore } from 'react';
import { orbAccent } from './palette';
import { DEFAULT_THEME, getTheme, subscribe } from './themeMode';

/** 'dark' or 'light'. The page re-renders when it changes, here or in another tab. */
export function useInstantTheme() {
  return useSyncExternalStore(subscribe, getTheme, () => DEFAULT_THEME);
}

/** The line-orb's ink for the current look (LineOrb is a canvas and needs a real colour). */
export function useOrbAccent() {
  return orbAccent(useInstantTheme());
}
