/*
 * The About page's long text. Each language is one JSON file in ./about, fetched when the
 * page opens, so the words never count toward the JavaScript we ship (the pattern of the
 * legal documents and the news articles). A language without its own file reads English.
 */
import { DEFAULT_LANG } from '../../i18n/languages';

const FILES = import.meta.glob('./about/*.json', {
  query: '?url&no-inline',
  import: 'default',
  eager: true,
});

const urlOf = (lang) => FILES[`./about/${lang}.json`];

// One request per language, shared by every visit; a failed one is forgotten so the next
// visit tries again.
const requests = new Map();

function load(lang) {
  if (!requests.has(lang)) {
    const request = fetch(urlOf(lang))
      .then((response) => {
        if (!response.ok) throw new Error(`About text did not load (${response.status})`);
        return response.json();
      })
      .catch((error) => {
        requests.delete(lang);
        throw error;
      });
    requests.set(lang, request);
  }
  return requests.get(lang);
}

/** The About text in `lang`; English when that language has no file or it fails to load. */
export function loadAboutCopy(lang = DEFAULT_LANG) {
  if (lang === DEFAULT_LANG || !urlOf(lang)) return load(DEFAULT_LANG);
  return load(lang).catch(() => load(DEFAULT_LANG));
}
