/**
 * Campaigns handler (consolidated under api/ops for Vercel free plan).
 * GET /api/campaigns
 */
import { cors } from '../../api/_lib/cors.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { getBearerToken, verifySupabaseToken, getSupabaseUrl } from '../../api/_lib/auth.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';

const CAMPAIGNS_CACHE = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000;

function getKeitaroConfig() {
  const trackerUrl = (process.env.KEITARO_TRACKER_URL || process.env.KEITARO_BASE_URL || '').trim();
  const apiKey = (process.env.KEITARO_API_KEY || '').trim();
  return { trackerUrl, apiKey };
}

function normalizeStatus(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'active') return 'Active';
  if (lower === 'disabled' || lower === 'inactive') return 'Disabled';
  if (lower === 'paused') return 'Paused';
  if (lower === 'stopped') return 'Stopped';
  return raw;
}

function numberOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function normalizeKeitaroCampaign(item) {
  const row = item && typeof item === 'object' ? item : {};
  const id = pick(row, ['id', 'campaign_id', 'campaignId', 'ID']);
  const name = pick(row, ['name', 'title']) || '';
  const alias = pick(row, ['alias', 'code']) || '';
  const statusRaw = pick(row, ['state', 'status', 'enabled']);
  const status =
    typeof statusRaw === 'boolean'
      ? statusRaw
        ? 'Active'
        : 'Disabled'
      : normalizeStatus(statusRaw);
  const channel =
    pick(row, ['traffic_source_name', 'trafficSourceName', 'source_name']) ||
    (row.traffic_source && (row.traffic_source.name || row.traffic_source.title)) ||
    (row.traffic_source_id ? `TS#${row.traffic_source_id}` : 'Keitaro');
  const stats = row.stats && typeof row.stats === 'object' ? row.stats : {};
  const impressions = numberOrZero(pick(row, ['impressions']) ?? pick(stats, ['impressions']));
  const clicks = numberOrZero(pick(row, ['clicks']) ?? pick(stats, ['clicks']));
  const conversions = numberOrZero(
    pick(row, ['conversions', 'leads', 'actions']) ??
      pick(stats, ['conversions', 'leads', 'actions'])
  );
  const spend = Number(pick(row, ['cost', 'spend']) ?? pick(stats, ['cost', 'spend']) ?? 0) || 0;
  const cpc =
    clicks > 0 ? spend / clicks : numberOrZero(pick(row, ['cpc']) ?? pick(stats, ['cpc']));
  const cpa =
    conversions > 0
      ? spend / conversions
      : numberOrZero(pick(row, ['cpa']) ?? pick(stats, ['cpa']));
  const dailyLimit = numberOrZero(pick(row, ['daily_limit', 'dailyLimit', 'day_limit']));
  const createdAt = pick(row, ['created_at', 'createdAt', 'created']);
  return {
    id,
    name: alias && alias !== name ? `${name}\n${alias}` : name,
    status,
    channel,
    impressions,
    clicks,
    conversions,
    bid: pick(row, ['bid', 'cpm', 'cpc_bid', 'bid_model']),
    cpc,
    cpa,
    spend,
    dailyLimit,
    createdAt,
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

async function maybeRequireAuth(req, res) {
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) {
    if (process.env.VERCEL_ENV === 'production') {
      return { ok: false, response: jsonError(res, 503, 'Auth not configured') };
    }
    return { ok: true, user: null };
  }
  const token = getBearerToken(req);
  if (!token)
    return { ok: false, response: jsonError(res, 401, 'Missing Authorization Bearer token') };
  const user = await verifySupabaseToken(token);
  if (!user) return { ok: false, response: jsonError(res, 401, 'Invalid or expired token') };
  return { ok: true, user };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');
  try {
    const auth = await maybeRequireAuth(req, res);
    if (!auth.ok) return auth.response;

    const rlKey = getRateLimitIdentifier(req);
    const rl = checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    if (CAMPAIGNS_CACHE.data && Date.now() - CAMPAIGNS_CACHE.fetchedAt < CACHE_TTL_MS) {
      return res.status(200).json(CAMPAIGNS_CACHE.data);
    }
    const { trackerUrl, apiKey } = getKeitaroConfig();
    if (!trackerUrl)
      return jsonError(
        res,
        503,
        'Keitaro is not configured',
        'Set KEITARO_TRACKER_URL (or KEITARO_BASE_URL) on the server.'
      );
    if (!apiKey)
      return jsonError(res, 503, 'Keitaro is not configured', 'Set KEITARO_API_KEY on the server.');
    const base = trackerUrl.replace(/\/$/, '');
    const url = `${base}/admin_api/v1/campaigns`;
    const upstream = await fetchWithRetry(
      url,
      {
        method: 'GET',
        headers: { Accept: 'application/json', 'Api-Key': apiKey },
      },
      { timeoutMs: 8000, retries: 1 }
    );
    const contentType = upstream.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await upstream.json().catch(() => null)
      : await upstream.text().catch(() => '');
    if (!upstream.ok) {
      const msg =
        typeof payload === 'string'
          ? payload.slice(0, 600)
          : payload?.error || payload?.message || 'Keitaro request failed';
      return jsonError(res, upstream.status || 502, 'Keitaro API error', msg);
    }
    const list = extractListPayload(payload);
    if (!list)
      return jsonError(
        res,
        502,
        'Keitaro API returned unexpected payload',
        'Expected an array or {items/data/results}.'
      );
    const normalized = list
      .map(normalizeKeitaroCampaign)
      .filter((c) => c.id !== undefined && c.id !== null);
    CAMPAIGNS_CACHE.data = normalized;
    CAMPAIGNS_CACHE.fetchedAt = Date.now();
    return res.status(200).json(normalized);
  } catch (err) {
    return handleApiError(res, err, 'campaigns');
  }
}
