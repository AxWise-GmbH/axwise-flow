/*
 * The landing's words in the chosen language. English lives in the code, next to where it
 * shows: t('hero.title', 'Instant Intelligence.'). Every other language is JSON, fetched when
 * it is picked, so the words never count toward the JavaScript we ship. A key a language
 * lacks shows its English.
 *
 * The words come in parts, so a visit only fetches what its page shows:
 *   ./locales/<code>.json          home page, bar, menus, footer (every page)
 *   ./locales/<area>/<code>.json   one part of the site; its keys start with `<area>.`:
 *                                  pp product pages, sp solution pages, pg features, how it
 *                                  works, speed, about, contact, nw news, lg Legal Center
 * A page asks for its part with useT('<area>').
 *
 * One store for the whole site (not a React provider), so a section rendered on its own
 * still speaks, and the pick outlives a move to another page.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_LANG, findLanguage } from './languages';
import { initialLang, markDocument, saveLang } from './langStore';

export const AREAS = ['pp', 'sp', 'pg', 'nw', 'lg'];

// `no-inline`: a short file stays a real file, not a data: URL inside the script (which
// would count toward the size cap, and the CSP does not let the page fetch data: URLs).
const FILES = import.meta.glob(['./locales/**/*.json', '!./locales/**/en.json'], {
  query: '?url&no-inline',
  import: 'default',
  eager: true,
});

const fileOf = (code, area) =>
  FILES[area ? `./locales/${area}/${code}.json` : `./locales/${code}.json`];

const listeners = new Set();
// Loaded parts, by "code" or "code/area"; English needs none.
const loaded = new Map();
const requests = new Map();
// The parts the pages seen so far asked for: a new language fetches these too.
const wanted = new Set();

let state = { lang: DEFAULT_LANG, words: {} };
let selectionVersion = 0;

function publish(next) {
  state = next;
  listeners.forEach((listener) => listener());
}

function loadPart(code, area) {
  const id = area ? `${code}/${area}` : code;
  if (code === DEFAULT_LANG) return Promise.resolve({});
  if (loaded.has(id)) return Promise.resolve(loaded.get(id));
  const url = fileOf(code, area);
  if (!url) return Promise.resolve({});
  if (!requests.has(id)) {
    const request = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Words for ${id} did not load (${response.status})`);
        return response.json();
      })
      .then((words) => {
        loaded.set(id, words);
        return words;
      })
      .finally(() => requests.delete(id));
    requests.set(id, request);
  }
  return requests.get(id);
}

// Every part of `code` asked for so far, in one list.
async function loadAll(code) {
  const areas = [...wanted];
  const parts = await Promise.all([loadPart(code), ...areas.map((area) => loadPart(code, area))]);
  // The first render starts loading before its effect asks for the page's part. A page
  // can also change during a language pick. Include those new parts before publishing.
  if (wanted.size !== areas.length) return loadAll(code);
  return Object.assign({}, ...parts);
}

/**
 * Shows `code`. The page keeps its current words until the new ones are in, then changes
 * at once. `remember` saves the pick; only a click should pass it.
 */
export function setLang(code, { remember = false } = {}) {
  const language = findLanguage(code);
  if (!language) return Promise.resolve();
  const selection = ++selectionVersion;
  if (remember) saveLang(language.code);
  return loadAll(language.code).then(
    (words) => {
      if (selection !== selectionVersion) return;
      markDocument(language.code);
      publish({ lang: language.code, words });
    },
    () => {
      // A file did not come: stay as we are; the next pick tries again.
    }
  );
}

/** Adds one part of the site to the words of the language on show. */
function want(area) {
  if (!area || wanted.has(area)) return;
  wanted.add(area);
  const { lang } = state;
  if (lang === DEFAULT_LANG) return;
  loadPart(lang, area).then(
    (words) => {
      if (state.lang === lang) publish({ lang, words: { ...state.words, ...words } });
    },
    () => {}
  );
}

let started = false;

/** Picks the first language once, on the first render that asks for words. */
function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const code = initialLang();
  if (code !== DEFAULT_LANG) setLang(code);
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => state;

export function fill(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

export function translate(words, key, english, vars) {
  const value = words[key];
  return fill(typeof value === 'string' && value ? value : english, vars);
}

/**
 * `{ t, lang }`. t(key, english, vars?) → the words for the current language. `area` also
 * fetches that part of the site's words (see the top of this file).
 */
export function useT(area) {
  start();
  useEffect(() => want(area), [area]);
  const { lang, words } = useSyncExternalStore(subscribe, snapshot, snapshot);
  return {
    lang,
    t: (key, english, vars) => translate(words, key, english, vars),
  };
}

export function useLang() {
  start();
  return useSyncExternalStore(subscribe, snapshot, snapshot).lang;
}

/** For tests: back to English, nothing loaded, nothing started. */
export function resetLangForTests() {
  selectionVersion += 1;
  started = false;
  loaded.clear();
  requests.clear();
  wanted.clear();
  markDocument(DEFAULT_LANG);
  publish({ lang: DEFAULT_LANG, words: {} });
}
