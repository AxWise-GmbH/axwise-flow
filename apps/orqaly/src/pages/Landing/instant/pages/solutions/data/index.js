import { SKIP_KEYS, localeWords, localize } from '../../../i18n/localize';

// Lazy on purpose: a visitor downloads the copy of the one page they opened, not all ten.
const loaders = import.meta.glob(['./*.js', '!./index.js', '!./*.test.js']);

/** Resolves to the page's data, or to null when no file exists for the slug. */
export function loadSolution(slug) {
  const load = loaders[`./${slug}.js`];
  return load ? load().then((module) => module.default) : Promise.resolve(null);
}

// Fields that steer the drawing, not words on screen: states, roles, who speaks, file names,
// links to other pages. `source` (a clip's source line), `to` (a draft's addressee) and
// `scene` (the pictures) are words here, unlike in the shared list.
export const SOLUTION_SKIP = new Set(
  [...SKIP_KEYS, 'state', 'role', 'from', 'file', 'related'].filter(
    (name) => !['source', 'to', 'scene'].includes(name)
  )
);

const prefixOf = (data) => `sp.${data.slug}`;

/** The page's data in the current language; keys are `sp.<slug>.<path>`. */
export function localizeSolution(data, t) {
  return localize(data, prefixOf(data), t, SOLUTION_SKIP);
}

/** { key: English } for one page, as localizeSolution asks for it. */
export function solutionWords(data) {
  return localeWords(data, prefixOf(data), SOLUTION_SKIP);
}
