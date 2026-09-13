/**
 * Derive the local dev server's API routes from vercel.json.
 *
 * Reason this exists: scripts/local-api-server.js used to hand-copy the
 * rewrite table out of vercel.json. The two drifted — /api/invite-user was
 * live in prod but 404'd locally — so every endpoint added to vercel.json
 * silently stayed dead under dev:local until someone noticed. Parsing the
 * real file keeps one source of truth.
 *
 * Pure and side-effect free so it can be tested without booting the server.
 */
import { readFileSync } from 'fs';

// `:param` is deliberately absent: Express 5 / path-to-regexp v8 still accept
// `:name` verbatim, so param sources need no rewriting. This guards against a
// future regex source (like the SPA catch-all) reaching app.all() and throwing.
const REGEX_METACHARACTERS = /[()*+?[\]{}^$|\\]/;

/**
 * @param {object} config parsed vercel.json
 * @returns {Array<{source: string, base: string, staticQuery: object, paramQuery: object}>}
 */
export function parseVercelRewrites(config) {
  const rewrites = Array.isArray(config?.rewrites) ? config.rewrites : [];
  const parsed = [];

  for (const entry of rewrites) {
    const source = entry?.source;
    const destination = entry?.destination;
    if (typeof source !== 'string' || typeof destination !== 'string') continue;
    // Drops the SPA catch-all `/((?!api/).*)` -> /index.html.
    if (!source.startsWith('/api/')) continue;
    if (REGEX_METACHARACTERS.test(source)) continue;

    const [base, qs] = destination.split('?');
    const staticQuery = {};
    const paramQuery = {};
    // `new URLSearchParams(undefined)` is empty, so a destination with no
    // query string is safe here.
    for (const [key, value] of new URLSearchParams(qs || '')) {
      if (value.startsWith(':')) paramQuery[key] = value.slice(1);
      else staticQuery[key] = value;
    }

    parsed.push({ source, base, staticQuery, paramQuery });
  }

  // Register param routes last so a literal source like /api/pipeline/status
  // can never be shadowed by /api/pipeline/:action.
  return parsed.sort((a, b) => Number(a.source.includes(':')) - Number(b.source.includes(':')));
}

/**
 * @param {string} vercelJsonPath absolute path to vercel.json
 */
export function loadVercelRewrites(vercelJsonPath) {
  // readFileSync rather than a JSON import assertion: `with { type: 'json' }`
  // support still varies across Node versions.
  return parseVercelRewrites(JSON.parse(readFileSync(vercelJsonPath, 'utf8')));
}
