/*
 * The legal texts. Each document is its own JSON file in ./docs, fetched when it opens, so the
 * words never count toward the JavaScript we ship. Only the lazy Legal Center imports this
 * module: the footer reads the small ./legal.links.js instead.
 *
 * ./docs/<slug>.json is the English text, the binding one. A language may add its own edition
 * at ./docs/<code>/<slug>.json (same shape); a language without one reads the English text.
 *
 * `no-inline` keeps even a short file a real file. Vite would otherwise inline it as a data:
 * URL inside the script (which counts toward the size cap), and the site's CSP does not let
 * the page fetch data: URLs.
 */
import { COMPANY } from '../info/company';
import { DEFAULT_LANG } from '../../i18n/languages';

const FILES = import.meta.glob('./docs/*.json', {
  query: '?url&no-inline',
  import: 'default',
  eager: true,
});
const EDITIONS = import.meta.glob('./docs/*/*.json', {
  query: '?url&no-inline',
  import: 'default',
  eager: true,
});

/** The language whose text of `slug` a reader of `lang` gets: their own, if it exists, else English. */
export function editionOf(slug, lang = DEFAULT_LANG) {
  return lang !== DEFAULT_LANG && EDITIONS[`./docs/${lang}/${slug}.json`] ? lang : DEFAULT_LANG;
}

export function legalDocUrl(slug, lang = DEFAULT_LANG) {
  const edition = editionOf(slug, lang);
  const url =
    edition === DEFAULT_LANG
      ? FILES[`./docs/${slug}.json`]
      : EDITIONS[`./docs/${edition}/${slug}.json`];
  return url ?? null;
}

// One request per document and edition, shared by every visit. A failed request is forgotten,
// so opening the document again tries again instead of replaying the failure.
const requests = new Map();

/** The text of `slug` for a reader of `lang` (see editionOf). */
export function loadLegalDoc(slug, lang = DEFAULT_LANG) {
  const edition = editionOf(slug, lang);
  const id = `${edition}/${slug}`;
  const url = legalDocUrl(slug, edition);
  if (!url) return Promise.reject(new Error(`No legal text for "${slug}"`));
  if (!requests.has(id)) {
    const request = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Legal text did not load (${response.status})`);
        return response.json();
      })
      .then((doc) => {
        if (doc?.meta?.slug !== slug) throw new Error(`The text for "${slug}" is not its own`);
        return doc;
      })
      .catch((error) => {
        requests.delete(id);
        throw error;
      });
    requests.set(id, request);
  }
  return requests.get(id);
}

const filled = (key) => Boolean(COMPANY[key]);

/** A company fact, or '' while it is not filled in. */
export function fillCompany(text) {
  return text.replace(/\{company\.([a-zA-Z]+)\}/g, (_, key) => COMPANY[key] ?? '');
}

/** Plain words for a heading or a table-of-contents entry. */
export function plainText(text) {
  return fillCompany(text).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

// Taken once, as the page loads: the date always comes out in the reader's language.
const DateFormat = Intl.DateTimeFormat;

/** '2026-09-22' in the reader's language: '22 September 2026' in English, '22. September 2026' in German. */
export function formatLegalDate(iso, lang = DEFAULT_LANG) {
  const [year, month, day] = iso.split('-').map(Number);
  // British English, for the day-month-year order legal texts use.
  const locale = lang === DEFAULT_LANG ? 'en-GB' : lang;
  return new DateFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * The blocks one region's version shows: the other region's blocks drop out, so do blocks
 * whose company facts are still empty, and so does any heading left with nothing under it.
 */
export function visibleBlocks(blocks, region) {
  const kept = blocks.filter(
    (block) => (!block.only || block.only === region) && (block.needs ?? []).every(filled)
  );
  const level = (block) => ({ h2: 2, h3: 3 })[block.type] ?? 0;
  // A heading keeps its place only if content (not a heading of its rank or above) follows.
  // Dropping an empty sub-heading can empty its section too, so repeat until nothing changes.
  const pass = (list) =>
    list.filter((block, index) => {
      const own = level(block);
      if (!own) return true;
      const next = list[index + 1];
      return Boolean(next) && (level(next) === 0 || level(next) > own);
    });
  let shown = kept;
  for (let next = pass(shown); next.length !== shown.length; next = pass(shown)) shown = next;
  return shown;
}
