/**
 * Dashboard data resolver — batched single-round-trip data fetch.
 *
 * POST /api/app?path=dashboard-query
 * body: {
 *   blocks: [{ id, dataset, measure, group_by, filters, limit }...],
 *   global_filters: { time_range?: { kind, value }, [dim]: value }
 * }
 * → { results: { [block_id]: { rows: [...], total } | { error } } }
 *
 * Per-block errors are returned in the payload so one bad block can't break
 * the whole dashboard. All resolution is dataset-allow-listed (metricCatalog)
 * — no raw SQL surface area.
 *
 * Phase 2 implementation: supports count, sum, avg of allow-listed columns,
 * group_by simple dimensions and time_bucket on timestamp columns, plus the
 * global time_range filter. Cardinality-heavy aggregations leverage Supabase
 * RPC or in-memory roll-up; we use in-memory rollup for now since the data
 * volume is modest.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  applyRateLimitHeaders,
} from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import {
  CATALOG,
  validateAgainstCatalog,
  dimensionField,
} from '../../src/services/metricCatalog.js';
import { runTemplate, validateTemplate } from './customQueryRegistry.js';

const OWNER_COLUMN = {
  goals: 'user_id',
  businesses: 'user_id',
  agent_jobs: 'user_id',
  financial_events: 'user_id',
  leads: 'user_id',
  deliverables: 'user_id',
  partners: 'user_id',
  concilium_agent_reports: 'user_id',
};

function bucketStart(date, bucket) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  if (bucket === 'day') {
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).toISOString().slice(0, 10);
  }
  if (bucket === 'week') {
    // ISO week start (Mon)
    const dow = (d.getUTCDay() + 6) % 7;
    const start = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
    return start.toISOString().slice(0, 10);
  }
  if (bucket === 'month') {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }
  return d.toISOString().slice(0, 10);
}

function applyTimeRange(query, dataset, timeRange) {
  if (!timeRange) return query;
  const tsColumn = pickPrimaryTimestamp(dataset);
  if (!tsColumn) return query;
  if (timeRange.kind === 'last_n_days') {
    const n = Number(timeRange.value);
    if (!Number.isFinite(n) || n <= 0) return query;
    const since = new Date(Date.now() - n * 86400_000).toISOString();
    return query.gte(tsColumn, since);
  }
  if (timeRange.kind === 'absolute' && Array.isArray(timeRange.value)) {
    const [from, to] = timeRange.value;
    if (from) query = query.gte(tsColumn, from);
    if (to) query = query.lte(tsColumn, to);
    return query;
  }
  return query;
}

function pickPrimaryTimestamp(dataset) {
  const def = CATALOG[dataset];
  if (!def) return null;
  const tsDim = def.dimensions.find((d) => /(_at|date)$/i.test(dimensionField(d)));
  return tsDim ? dimensionField(tsDim) : 'created_at';
}

function selectColumnsForBlock(block) {
  const cols = new Set(['id']);
  const measureField = block.data?.measure?.field;
  if (measureField) cols.add(measureField);
  if (block.data?.group_by?.field) cols.add(block.data.group_by.field);
  if (block.filters) Object.keys(block.filters).forEach((k) => cols.add(k));
  const tsCol = pickPrimaryTimestamp(block.data?.dataset);
  if (tsCol) cols.add(tsCol);
  return [...cols].join(', ');
}

function aggregate(rows, measure) {
  if (!rows.length) return 0;
  if (!measure || measure.agg === 'count') return rows.length;
  const field = measure.field;
  const values = rows
    .map((r) => Number(r[field]))
    .filter((n) => Number.isFinite(n));
  if (values.length === 0) return 0;
  switch (measure.agg) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'p95': {
      const sorted = [...values].sort((a, b) => a - b);
      const idx = Math.ceil(0.95 * sorted.length) - 1;
      return sorted[Math.max(0, idx)];
    }
    default:
      return values.length;
  }
}

function groupRows(rows, groupBy) {
  if (!groupBy?.field) return new Map([[null, rows]]);
  const field = groupBy.field;
  const bucket = groupBy.time_bucket;
  const buckets = new Map();
  for (const row of rows) {
    let key = row[field];
    if (bucket && key) key = bucketStart(key, bucket);
    if (key === undefined || key === null) key = 'unknown';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  return buckets;
}

function applyBlockFilters(query, filters) {
  if (!filters) return query;
  for (const [k, v] of Object.entries(filters)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length) query = query.in(k, v);
    } else {
      query = query.eq(k, v);
    }
  }
  return query;
}

async function resolveBlock(admin, userId, block, globalFilters) {
  const dataset = block.data?.dataset;
  if (!dataset) return { error: 'missing dataset' };
  if (!CATALOG[dataset]) return { error: `unknown dataset: ${dataset}` };

  const validation = validateAgainstCatalog({
    dataset,
    measure: block.data?.measure,
    group_by: block.data?.group_by,
    filters: block.filters,
  });
  if (!validation.ok) return { error: validation.error };

  const ownerCol = OWNER_COLUMN[dataset] || 'user_id';
  const columns = selectColumnsForBlock(block);

  let query = admin.from(dataset).select(columns).eq(ownerCol, userId);
  query = applyTimeRange(query, dataset, globalFilters?.time_range);
  query = applyBlockFilters(query, block.filters);

  // Merge global non-time filters that apply to this dataset
  const allowedFilters = new Set(CATALOG[dataset].filters);
  for (const [k, v] of Object.entries(globalFilters || {})) {
    if (k === 'time_range') continue;
    if (!allowedFilters.has(k)) continue;
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length) query = query.in(k, v);
    } else {
      query = query.eq(k, v);
    }
  }

  const limit = Math.min(Number(block.data?.limit || 5000), 5000);
  query = query.limit(limit);

  const { data, error } = await query;
  if (error) return { error: error.message };
  const rows = data || [];

  const groups = groupRows(rows, block.data?.group_by);
  const groupedRows = [];
  for (const [key, items] of groups) {
    groupedRows.push({
      group: key,
      value: aggregate(items, block.data?.measure),
      count: items.length,
    });
  }
  // Sort timeseries by group ascending, categorical by value descending
  if (block.data?.group_by?.time_bucket) {
    groupedRows.sort((a, b) => String(a.group).localeCompare(String(b.group)));
  } else if (block.data?.group_by) {
    groupedRows.sort((a, b) => Number(b.value) - Number(a.value));
  }

  // Compute total/scalar
  const total = aggregate(rows, block.data?.measure);

  return {
    rows: groupedRows,
    total,
    sample_count: rows.length,
  };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'POST only');

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const rlKey = `dashboard-query:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 120, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');

  const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
  const globalFilters = req.body?.global_filters || {};

  if (blocks.length === 0) {
    return res.status(200).json({ results: {} });
  }
  if (blocks.length > 60) {
    return jsonError(res, 400, 'Too many blocks (max 60)');
  }

  try {
    const results = {};
    await Promise.all(
      blocks.map(async (block) => {
        try {
          // Markdown / custom_query handled separately
          if (block.type === 'markdown') {
            results[block.id] = { rows: [], total: 0, sample_count: 0 };
            return;
          }
          if (block.type === 'custom_query') {
            const tplId = block.custom_query?.template_id;
            const params = block.custom_query?.params || {};
            const v = validateTemplate(tplId, params);
            if (!v.ok) {
              results[block.id] = { error: v.error };
              return;
            }
            try {
              results[block.id] = await runTemplate({
                admin,
                userId: user.id,
                templateId: tplId,
                params: v.params,
              });
            } catch (err) {
              results[block.id] = { error: err?.message || 'custom query failed' };
            }
            return;
          }
          results[block.id] = await resolveBlock(admin, user.id, block, globalFilters);
        } catch (err) {
          results[block.id] = { error: err?.message || 'resolve failed' };
        }
      })
    );
    return res.status(200).json({ results });
  } catch (err) {
    return handleApiError(res, err, 'dashboard-query');
  }
}
