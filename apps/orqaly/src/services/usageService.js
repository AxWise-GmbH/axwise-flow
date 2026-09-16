/**
 * Usage Service
 *
 * Client-side fetch for reconciled LLM usage analytics from the
 * /api/ops?path=usage-analytics endpoint (JWT-scoped, server-aggregated).
 * Mirrors reportService.js: Supabase JWT header, short TTL cache, a typed
 * error for API rejections, and an empty-shaped fallback when the API is
 * unreachable so panels render an empty state instead of crashing.
 */
import { supabase, hasSupabase } from '../lib/supabase';

const API_BASE = '/api/ops';
const USAGE_CACHE = new Map();
const CACHE_TTL_MS = 45_000;

/** Thrown when the usage API responds but rejects the request (e.g. 401/429). */
export class UsageApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'UsageApiError';
    this.status = status;
  }
}

/** Empty snapshot used as the unreachable-API fallback (same shape as the server). */
export function emptyUsageSnapshot(entity = 'all', entityId = null) {
  return {
    entity,
    entityId: entityId || null,
    range: { from: null, to: null },
    totals: {
      tokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      cost: 0,
      calls: 0,
      errorCalls: 0,
      errorRate: 0,
      avgDurationMs: 0,
      p95DurationMs: 0,
      evaluations: 0,
      approved: 0,
      avgScore: 0,
      revenue: 0,
      budgetUsd: 0,
      spentUsd: 0,
    },
    byModel: [],
    byProvider: [],
    byAgent: [],
    timeseries: [],
    meta: { source: 'client', rowCount: 0 },
    source: 'client',
  };
}

function cacheKey(entity, opts) {
  return `${entity}::${JSON.stringify(opts || {})}`;
}

/** Attach the Supabase JWT so the endpoint can authorize + scope by user. */
async function getAuthHeaders() {
  const headers = {};
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

/**
 * Fetch a usage snapshot.
 * @param {'all'|'organization'|'consilium'|'goal'|'team'|'agent'} entity
 * @param {{ id?: string, from?: string, to?: string, forceRefresh?: boolean }} [opts]
 */
export async function fetchUsage(entity = 'all', opts = {}) {
  const { id, from, to, provider, model, source, forceRefresh } = opts;
  const key = cacheKey(entity, { id, from, to, provider, model, source });

  if (!forceRefresh && USAGE_CACHE.has(key)) {
    const cached = USAGE_CACHE.get(key);
    if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;
  }

  // This legacy endpoint is authorized with a Supabase JWT. The lean GCP
  // runtime deliberately has no Supabase browser client, so do not probe an
  // API surface that is not part of the Preview release.
  if (!hasSupabase()) return emptyUsageSnapshot(entity, id);

  try {
    const params = new URLSearchParams({ path: 'usage-analytics', entity });
    if (id) params.set('entityId', id);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (provider) params.set('provider', provider);
    if (model) params.set('model', model);
    if (source) params.set('source', source);

    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}?${params.toString()}`, { headers });
    if (res.ok) {
      const data = await res.json();
      data.source = 'server';
      USAGE_CACHE.set(key, { data, fetchedAt: Date.now() });
      return data;
    }
    throw new UsageApiError(
      res.status === 401
        ? 'Usage session expired or unauthorized. Sign in again and retry.'
        : `Usage API request failed (HTTP ${res.status}).`,
      res.status
    );
  } catch (err) {
    if (err instanceof UsageApiError) throw err;
    if (typeof console !== 'undefined') {
      console.warn('[usage] API unreachable, returning empty snapshot:', err?.message);
    }
    return emptyUsageSnapshot(entity, id);
  }
}

export function clearUsageCache() {
  USAGE_CACHE.clear();
}

/** Empty divergence snapshot (unreachable-API fallback, same shape as the server). */
export function emptyDivergenceSnapshot() {
  return {
    detail: 'divergence',
    range: { from: null, to: null },
    totals: { calls: 0, paired: 0, axStricter: 0, localStricter: 0, agree: 0, degraded: 0 },
    byOperation: [],
    diverged: [],
    source: 'client',
  };
}

/**
 * Fetch AxWise-vs-local divergence (the "impact" view) over a date range.
 * @param {{ from?: string, to?: string, forceRefresh?: boolean }} [opts]
 */
export async function fetchAxwiseDivergence(opts = {}) {
  const { from, to, forceRefresh } = opts;
  const key = cacheKey('divergence', { from, to });
  if (!forceRefresh && USAGE_CACHE.has(key)) {
    const cached = USAGE_CACHE.get(key);
    if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;
  }
  if (!hasSupabase()) return emptyDivergenceSnapshot();
  try {
    const params = new URLSearchParams({
      path: 'usage-analytics',
      entity: 'all',
      detail: 'divergence',
    });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}?${params.toString()}`, { headers });
    if (res.ok) {
      const data = await res.json();
      data.source = 'server';
      USAGE_CACHE.set(key, { data, fetchedAt: Date.now() });
      return data;
    }
    throw new UsageApiError(
      res.status === 401
        ? 'Usage session expired or unauthorized. Sign in again and retry.'
        : `Usage API request failed (HTTP ${res.status}).`,
      res.status
    );
  } catch (err) {
    if (err instanceof UsageApiError) throw err;
    if (typeof console !== 'undefined') {
      console.warn('[usage] divergence API unreachable, returning empty snapshot:', err?.message);
    }
    return emptyDivergenceSnapshot();
  }
}
