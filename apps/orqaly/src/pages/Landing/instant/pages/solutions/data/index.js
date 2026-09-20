// Lazy on purpose: a visitor downloads the copy of the one page they opened, not all ten.
const loaders = import.meta.glob(['./*.js', '!./index.js', '!./*.test.js']);

/** Resolves to the page's data, or to null when no file exists for the slug. */
export function loadSolution(slug) {
  const load = loaders[`./${slug}.js`];
  return load ? load().then((module) => module.default) : Promise.resolve(null);
}
