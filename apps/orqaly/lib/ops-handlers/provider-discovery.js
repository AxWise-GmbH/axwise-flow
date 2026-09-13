/**
 * Provider discovery — Phase 4
 *
 * When a goal says "I need an email tool" (capability) instead of naming a
 * specific provider, Sandris asks Tavily to find candidates, ranks them by
 * free-tier + ToS-friendliness heuristics, and returns the top pick.
 *
 * Called from h40-missing-credential before it skips on no-signup-url.
 * Results are memoized into tools.data so subsequent runs skip the search.
 */
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { createLogger } from '../../api/_lib/logger.js';
import { resolveToolCredential } from '../agent-handlers/tool-credentials.js';

const log = createLogger('provider-discovery');

const TAVILY_URL = 'https://api.tavily.com/search';
const SEARCH_TIMEOUT_MS = 10_000;

// Strong signals that a provider allows programmatic API-key signup.
const POSITIVE_HINTS = [/api.?key/i, /developer/i, /sign.?up/i, /free.?tier/i, /sandbox/i];
// Strong signals to de-prioritize (enterprise-only / invite-only).
const NEGATIVE_HINTS = [/contact.?sales/i, /enterprise.?only/i, /request.?demo/i, /early.?access/i];

/**
 * @param {object} admin — Supabase service-role client
 * @param {string} userId — owner of the tool-web-search credential
 * @param {string} capability — free-text capability description
 * @returns {Promise<{chosen_provider, signup_url, reason, candidates}|null>}
 */
export async function discoverProvider(_admin, userId, capability) {
  if (!capability || typeof capability !== 'string') return null;

  const resolved = await resolveToolCredential({
    def: {
      id: 'tool-web-search',
      connectionType: 'api',
      credentials: [{ key: 'TAVILY_API_KEY' }],
    },
    userId,
  });
  const tavilyKey = resolved.apiKey;
  if (!tavilyKey) {
    log.warn(null, 'provider-discovery.no-tavily-key', { userId });
    return null;
  }

  const query = `${capability} API key developer signup free tier`;
  let searchResults = [];
  try {
    const res = await fetchWithRetry(
      TAVILY_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tavilyKey, query, max_results: 8, search_depth: 'basic' }),
      },
      { timeoutMs: SEARCH_TIMEOUT_MS, retries: 0 }
    );
    const body = await res.json();
    searchResults = body.results || [];
  } catch (err) {
    log.warn(null, 'provider-discovery.search-failed', { error: err.message });
    return null;
  }

  const candidates = rankCandidates(searchResults);
  if (!candidates.length) return null;

  const top = candidates[0];
  return {
    chosen_provider: top.name,
    signup_url: top.signup_url,
    reason: top.reason,
    candidates: candidates
      .slice(0, 5)
      .map((c) => ({ name: c.name, signup_url: c.signup_url, score: c.score })),
  };
}

function rankCandidates(results) {
  const candidates = [];
  for (const r of results || []) {
    if (!r.url) continue;
    let score = 0;
    const blob = `${r.title || ''} ${r.content || ''}`;
    for (const re of POSITIVE_HINTS) if (re.test(blob)) score += 2;
    for (const re of NEGATIVE_HINTS) if (re.test(blob)) score -= 3;
    // Prefer URLs that look like a signup/docs page on the vendor's own domain.
    try {
      const u = new URL(r.url);
      if (/sign.?up|register|create.?account/i.test(u.pathname)) score += 3;
      if (u.pathname === '/' || u.pathname === '') score += 1; // homepage — typical signup entry
      if (/docs|developer|api/i.test(u.pathname)) score += 1;
      candidates.push({
        name: hostnameToProviderName(u.hostname),
        signup_url: guessSignupUrl(u),
        score,
        reason: describeScore(blob, u.pathname),
      });
    } catch {
      /* skip invalid URLs */
    }
  }
  // Deduplicate by provider name, keep highest score
  const byName = new Map();
  for (const c of candidates) {
    const existing = byName.get(c.name);
    if (!existing || existing.score < c.score) byName.set(c.name, c);
  }
  return [...byName.values()].sort((a, b) => b.score - a.score);
}

function hostnameToProviderName(host) {
  return host
    .replace(/^www\./, '')
    .split('.')[0]
    .replace(/[-_]/g, ' ');
}

function guessSignupUrl(u) {
  // Prefer the first-party signup path if present; else vendor homepage.
  if (/sign.?up|register|create.?account/i.test(u.pathname)) return u.toString();
  return `${u.protocol}//${u.hostname}/signup`;
}

function describeScore(blob, pathname) {
  if (/free.?tier|free.?plan/i.test(blob)) return 'Mentions a free tier';
  if (/developer.?api|api.?key/i.test(blob)) return 'Developer-friendly API';
  if (/sign.?up|register/i.test(pathname)) return 'Direct signup URL found';
  return 'General relevance';
}
