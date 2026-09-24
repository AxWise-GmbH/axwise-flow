/*
 * Which language the landing shows. The address says it when it has ?lang=xx (shown, not
 * saved); else the visitor's own earlier pick; else the browser's languages; else English.
 *
 * The pick is kept in localStorage, and only a click writes it: a setting the visitor asked
 * for, so it needs no consent (German TDDDG § 25(2)). The Cookies & Storage page lists it.
 */
import { DEFAULT_LANG, dirOf, findLanguage, matchLanguage } from './languages';

export const LANG_KEY = 'orqanix_lang';

export function readSavedLang() {
  try {
    return findLanguage(window.localStorage.getItem(LANG_KEY))?.code ?? null;
  } catch {
    return null;
  }
}

export function saveLang(code) {
  try {
    window.localStorage.setItem(LANG_KEY, code);
  } catch {
    // Private windows and blocked storage: the pick simply lasts for this visit.
  }
}

export function langFromUrl() {
  try {
    return matchLanguage(new URLSearchParams(window.location.search).get('lang'));
  } catch {
    return null;
  }
}

export function langFromBrowser() {
  try {
    const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const tag of tags) {
      const code = matchLanguage(tag);
      if (code) return code;
    }
  } catch {
    // No navigator (a server, an odd test runner): English.
  }
  return null;
}

export function initialLang() {
  return langFromUrl() ?? readSavedLang() ?? langFromBrowser() ?? DEFAULT_LANG;
}

/** Tells the page (screen readers, fonts, hyphens, direction) what language it is in. */
export function markDocument(code) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = code;
  document.documentElement.dir = dirOf(code);
}
