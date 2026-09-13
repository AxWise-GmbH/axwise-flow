import { z } from 'zod';
import { supabase, hasSupabase } from '../lib/supabase';

// If you set `VITE_CAMPAIGNS_API_URL`, it should point to the list endpoint
// (e.g. "https://api.example.com/campaigns" or "https://api.example.com/api/campaigns").
// Otherwise we fall back to `${VITE_API_BASE_URL}/api/campaigns` or `/api/campaigns`.
const CAMPAIGNS_API_URL = (import.meta.env.VITE_CAMPAIGNS_API_URL || '').trim();
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim();

function resolveListUrl() {
  if (CAMPAIGNS_API_URL) return CAMPAIGNS_API_URL;
  if (API_BASE) return `${API_BASE.replace(/\/$/, '')}/api/campaigns`;
  return '/api/campaigns';
}

const BidSchema = z
  .union([
    z.string(),
    z
      .object({
        type: z.string().optional(),
        model: z.string().optional(),
        amount: z.number().optional(),
        value: z.number().optional(),
        currency: z.string().optional(),
      })
      .passthrough(),
  ])
  .optional();

const CampaignSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    name: z.string().optional().default(''),
    status: z.string().optional().default(''),
    channel: z.string().optional().default(''),
    impressions: z.coerce.number().optional().default(0),
    clicks: z.coerce.number().optional().default(0),
    ctr: z.coerce.number().optional(),
    conversions: z.coerce.number().optional().default(0),
    cvr: z.coerce.number().optional(),
    bid: BidSchema,
    cpc: z.coerce.number().optional(),
    cpa: z.coerce.number().optional(),
    spend: z.coerce.number().optional(),
    dailyLimit: z.coerce.number().optional(),
    createdAt: z.string().optional(),
    created: z.string().optional(),
  })
  .passthrough();

function normalizeCampaign(raw) {
  const parsed = CampaignSchema.safeParse(raw);
  if (!parsed.success) {
    // Best-effort fallback: keep row visible even if API shape differs.
    const fallback = raw && typeof raw === 'object' ? raw : {};
    return {
      id: fallback.id ?? `unknown-${Math.random().toString(36).slice(2, 7)}`,
      name: String(fallback.name || ''),
      status: String(fallback.status || ''),
      channel: String(fallback.channel || ''),
      impressions: Number(fallback.impressions || 0),
      clicks: Number(fallback.clicks || 0),
      ctr: typeof fallback.ctr === 'number' ? fallback.ctr : undefined,
      conversions: Number(fallback.conversions || 0),
      cvr: typeof fallback.cvr === 'number' ? fallback.cvr : undefined,
      bid: fallback.bid,
      cpc: typeof fallback.cpc === 'number' ? fallback.cpc : undefined,
      cpa: typeof fallback.cpa === 'number' ? fallback.cpa : undefined,
      spend: typeof fallback.spend === 'number' ? fallback.spend : undefined,
      dailyLimit: typeof fallback.dailyLimit === 'number' ? fallback.dailyLimit : undefined,
      createdAt: fallback.createdAt || fallback.created || undefined,
      _raw: raw,
    };
  }

  const c = parsed.data;
  const createdAt = c.createdAt || c.created || undefined;
  const impressions = Number.isFinite(c.impressions) ? c.impressions : 0;
  const clicks = Number.isFinite(c.clicks) ? c.clicks : 0;
  const conversions = Number.isFinite(c.conversions) ? c.conversions : 0;

  // If API does not send CTR/CVR, derive them for UI parity with the screenshot.
  const ctr = Number.isFinite(c.ctr) ? c.ctr : impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cvr = Number.isFinite(c.cvr) ? c.cvr : clicks > 0 ? (conversions / clicks) * 100 : 0;

  return {
    ...c,
    createdAt,
    impressions,
    clicks,
    conversions,
    ctr,
    cvr,
  };
}

function extractListPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.results)) return payload.results;
  }
  return null;
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function extractErrorMessage(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'number' || typeof payload === 'boolean') return String(payload);
  if (Array.isArray(payload)) {
    // Common patterns: [{ message }], ["..."], etc.
    const first = payload.find(Boolean);
    const fromFirst = extractErrorMessage(first);
    return fromFirst || (payload.length ? 'Request failed.' : '');
  }
  if (typeof payload === 'object') {
    // Most APIs return { error: "..." } or { error: { message: "..." } }.
    const candidates = [payload.error, payload.message, payload.title, payload.msg];
    for (const c of candidates) {
      if (!c) continue;
      if (typeof c === 'string') return c;
      if (typeof c === 'object') {
        const nested = extractErrorMessage(c.message || c.error || c.detail || c.reason);
        if (nested) return nested;
        const json = safeJson(c);
        if (json) return json;
      }
    }

    // Sometimes: { errors: [...] }
    if (payload.errors) {
      const nested = extractErrorMessage(payload.errors);
      if (nested) return nested;
    }

    const json = safeJson(payload);
    return json || 'Request failed.';
  }
  return '';
}

async function fetchJson(url, { signal, headers, method = 'GET', body } = {}) {
  const finalHeaders = { ...(headers || {}) };

  // If calling our own backend, attach Supabase token (when configured) so
  // the server can enforce auth and keep the Keitaro proxy private.
  const isRelativeUrl = typeof url === 'string' && url.startsWith('/');
  if (isRelativeUrl && hasSupabase() && !finalHeaders.Authorization) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) finalHeaders.Authorization = `Bearer ${token}`;
    } catch {
      // Ignore auth header on failure (server may still allow local dev mode).
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...finalHeaders,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msgFromPayload = extractErrorMessage(data);
    const statusLabel = `${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
    const msg = msgFromPayload || `Request failed (${statusLabel})`;
    const detailRaw = data && data.detail ? data.detail : null;
    const detail = extractErrorMessage(detailRaw);
    const err = new Error(
      detail ? `${msg} (${statusLabel}) — ${detail}` : `${msg} (${statusLabel})`
    );
    err.status = res.status;
    err.payload = data;
    err.url = url;
    throw err;
  }
  return data;
}

export const campaignsService = {
  /**
   * List campaigns from API.
   * Expected shapes:
   * - [] (array of campaigns)
   * - { items: [] } / { data: [] } / { results: [] }
   */
  async list({ signal } = {}) {
    const url = resolveListUrl();
    const payload = await fetchJson(url, { signal });
    const list = extractListPayload(payload);
    if (!list) {
      throw new Error(
        'Campaigns API returned an unexpected payload shape (expected an array or {items/data/results}).'
      );
    }
    return list.map(normalizeCampaign);
  },

  /**
   * Optional update method (only used if your API supports PATCH /campaigns/:id).
   * If your backend uses a different route, update this implementation.
   */
  async update(id, patch, { signal } = {}) {
    const listUrl = resolveListUrl();
    // If listUrl ends with `/campaigns`, assume detail routes are `/campaigns/:id`.
    const url = `${String(listUrl).replace(/\/$/, '')}/${encodeURIComponent(String(id))}`;
    const payload = await fetchJson(url, { method: 'PATCH', body: patch, signal });
    return normalizeCampaign(payload);
  },

  /**
   * Optional delete method (only used if your API supports DELETE /campaigns/:id).
   */
  async remove(id, { signal } = {}) {
    const listUrl = resolveListUrl();
    const url = `${String(listUrl).replace(/\/$/, '')}/${encodeURIComponent(String(id))}`;
    await fetchJson(url, { method: 'DELETE', signal });
    return true;
  },
};
