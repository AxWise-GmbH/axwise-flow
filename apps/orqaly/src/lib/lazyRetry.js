import { lazy } from 'react';

export const RELOAD_FLAG = 'chunk-reload-once';

const RETRY_DELAY_MS = 1500;

// A stale module URL — a dead ?v=<hash> after a dep re-optimize, or a hashed
// chunk removed by a deploy — can never come back by retrying the same URL.
// Only a reload can discover the new one. Covers Vite's dev and build wordings
// plus Safari's.
const STALE_MODULE_RE =
  /error loading dynamically imported module|failed to fetch dynamically imported module|importing a module script failed/i;

export function isStaleModuleError(err) {
  return STALE_MODULE_RE.test(err?.message || '');
}

// sessionStorage throws in private-mode Safari; a storage failure must never
// swallow the original import error, so every access degrades to "no flag".
function readFlag(key) {
  try {
    return window.sessionStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function writeFlag(key) {
  try {
    window.sessionStorage.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
}

function clearFlag(key) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Import with backoff, then self-heal once if the module URL went stale.
 * Exported separately from lazyRetry so it can be tested without React.lazy.
 */
export function loadWithRetry(importFn, retries = 2) {
  const attempt = (remaining) =>
    importFn().catch((err) => {
      if (remaining > 0) {
        return new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS)).then(() =>
          attempt(remaining - 1)
        );
      }
      // Retries exhausted. The sessionStorage flag caps recovery at one reload
      // per tab, so a genuinely missing chunk surfaces in ErrorBoundaryPage
      // instead of looping — the trap main.jsx warns about.
      if (isStaleModuleError(err) && !readFlag(RELOAD_FLAG) && writeFlag(RELOAD_FLAG)) {
        window.location.reload();
        // Never resolves: keeps Suspense pending so the error page cannot flash
        // while the reload is in flight.
        return new Promise(() => {});
      }
      throw err;
    });

  return attempt(retries).then((mod) => {
    clearFlag(RELOAD_FLAG);
    return mod;
  });
}

/**
 * Retry wrapper for lazy route imports — prevents reload loops on slow mobile
 * connections when chunk loading fails (vite:preloadError).
 */
export function lazyRetry(importFn, retries = 2) {
  return lazy(() => loadWithRetry(importFn, retries));
}
