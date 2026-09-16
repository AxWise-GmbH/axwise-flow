/**
 * Usage Directory Service
 *
 * Client-side fetch for the per-entity usage directory from
 * /api/ops?path=usage-directory (JWT-scoped, server-aggregated). Lists every
 * entity of a type (goal/agent/team/consilium/organization) with its usage
 * rollup + metadata. Mirrors usageService.js: Supabase JWT header, short TTL
 * cache, a typed error, and an empty-shaped fallback when the API is
 * unreachable so the directory renders an empty state instead of crashing.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { UsageApiError } from './usageService';

const API_BASE = '/api/ops';
const CACHE = new Map();
const CACHE_TTL_MS = 45_000;

/** Empty directory snapshot used as the unreachable-API fallback. */
export function emptyDirectory(entity = 'goal') {
  return {
    entity,
    range: { from: null, to: null },
    count: 0,
    items: [],
    totals: { calls: 0, totalTokens: 0, cost: 0 },
    meta: { source: 'client' },
    source: 'client',
  };
}

function cacheKey(entity, opts) {
  return `${entity}::${JSON.stringify(opts || {})}`;
}

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
 * Fetch a usage directory for an entity type.
 * @param {'goal'|'agent'|'team'|'consilium'|'organization'} entity
 * @param {{ from?: string, to?: string, search?: string, status?: string, limit?: number, forceRefresh?: boolean }} [opts]
 */
export async function fetchDirectory(entity = 'goal', opts = {}) {
  const { from, to, search, status, limit, provider, model, source, forceRefresh } = opts;
  const key = cacheKey(entity, { from, to, search, status, limit, provider, model, source });

  if (!forceRefresh && CACHE.has(key)) {
    const cached = CACHE.get(key);
    if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;
  }

  if (!hasSupabase()) return emptyDirectory(entity);

  try {
    const params = new URLSearchParams({ path: 'usage-directory', entity });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (limit) params.set('limit', String(limit));
    if (provider) params.set('provider', provider);
    if (model) params.set('model', model);
    if (source) params.set('source', source);

    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}?${params.toString()}`, { headers });
    if (res.ok) {
      const data = await res.json();
      data.source = 'server';
      CACHE.set(key, { data, fetchedAt: Date.now() });
      return data;
    }
    throw new UsageApiError(
      res.status === 401
        ? 'Usage session expired or unauthorized. Sign in again and retry.'
        : `Usage directory request failed (HTTP ${res.status}).`,
      res.status
    );
  } catch (err) {
    if (err instanceof UsageApiError) throw err;
    if (typeof console !== 'undefined') {
      console.warn('[usage-directory] API unreachable, returning empty snapshot:', err?.message);
    }
    return emptyDirectory(entity);
  }
}

export function clearDirectoryCache() {
  CACHE.clear();
}
