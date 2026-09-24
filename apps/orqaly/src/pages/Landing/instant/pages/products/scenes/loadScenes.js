/*
 * The six product scenes (one per product; the header menus show the five in NAV_PRODUCTS)
 * live in one lazy chunk, shared by the header menus and the product pages. The header sits
 * outside every error boundary, so it loads the chunk by hand instead of with React.lazy: a
 * failed load (a stale chunk after a deploy, a network drop) only leaves the preview card
 * empty, and the next try starts a fresh request.
 */

let loaded = null;
let request = null;

/** The scenes module if it has already arrived, else null. */
export function peekScenes() {
  return loaded;
}

export function loadScenes() {
  request ??= import('./index.jsx').then(
    (module) => {
      loaded = module;
      return module;
    },
    (error) => {
      request = null;
      throw error;
    }
  );
  return request;
}
