/**
 * Reports handler (consolidated under api/ops for Vercel free plan).
 * GET /api/reports?type=...&refresh=...
 * GET /api/reports?type=...&op=trends&months=6  — read real history from report_kpi_snapshots
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { buildSupabaseUserClient, buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { aggregateReport, SUPPORTED_REPORT_TYPES } from '../../src/utils/reportAggregation.js';

// Maps the report template id used in the UI to the kpi_set stored in snapshots.
// Each kpi_set is written nightly by snapshot-report-kpis so trend charts have
// real history. Templates whose trends come from another source (e.g. strategy
// scenarios) simply have no historical kpi_set and show the empty-state hint.
const KPI_SET_FOR_TYPE = {
  'tpl-finance-growth': 'finance',
  'tpl-partner-performance': 'partner_perf',
  'tpl-operations-tasks': 'operations',
  'tpl-executive-summary': 'executive',
  'tpl-agent-performance': 'agent',
  'tpl-goal-health': 'goals',
  'tpl-knowledge-base': 'knowledge',
  'tpl-quality-loop': 'quality',
  'tpl-workspace-pulse': 'pulse',
  'tpl-marketing-acquisition': 'marketing',
};

const SNAPSHOT_CACHE = new Map();
const DEFAULT_TTL_MS = 45_000;

// Cache key MUST be user-scoped. The SNAPSHOT_CACHE Map lives at module scope and
// persists across requests on warm serverless instances, so an un-scoped key would
// let one user's aggregated snapshot be served to another within the TTL window.
function cacheKey(userId, reportType, filters) {
  return `${userId}::${reportType}::${JSON.stringify(filters)}`;
}

/** Select that resolves to an empty set instead of throwing if a table is absent. */
async function safeSelect(sb, table, fields, modify) {
  try {
    let query = sb.from(table).select(fields);
    if (modify) query = modify(query);
    const res = await query;
    return res?.error ? [] : res?.data || [];
  } catch {
    return [];
  }
}

// Some tables store the domain object inside a `data` JSONB column; unwrap it.
function unwrapData(rows) {
  return (rows || []).map((r) => (typeof r.data === 'object' && r.data !== null ? r.data : r));
}

async function loadAllData(sb) {
  const [
    partners,
    projects,
    pushes,
    agentJobs,
    goals,
    kbDocs,
    deliverableVersions,
    dashboards,
    strategySnapshots,
  ] = await Promise.all([
    safeSelect(sb, 'partners', '*'),
    safeSelect(sb, 'projects', '*'),
    safeSelect(sb, 'github_pushes', 'pushed_at, created_at'),
    safeSelect(sb, 'agent_jobs', 'id, status, agent_id, agent_name, created_at, completed_at, duration_ms, stage'),
    safeSelect(sb, 'goals', 'id, title, status, stage, created_at, completed_at, estimate_hours, elapsed_hours, blocked_reason'),
    safeSelect(sb, 'knowledge_base_docs', 'id, title, source, created_at, status'),
    safeSelect(sb, 'deliverable_versions', 'id, deliverable_id, deliverable_type, version, approved, created_at'),
    safeSelect(sb, 'dashboards', 'id, name, created_at, auto_generated'),
    safeSelect(sb, 'strategy_center_snapshots', 'period_key, period_label, payload, created_at', (q) =>
      q.order('created_at', { ascending: false }).limit(12)
    ),
  ]);
  return {
    partners: unwrapData(partners),
    projects: unwrapData(projects),
    pushes,
    agentJobs,
    goals,
    kbDocs,
    deliverableVersions,
    dashboards,
    strategySnapshots,
  };
}

function applyFilters(data, filters) {
  let { partners } = data;
  if (filters.partnerId) partners = partners.filter((p) => p.id === filters.partnerId);
  if (filters.team && filters.team !== 'All')
    partners = partners.filter((p) =>
      (p.team || '').toLowerCase().includes(filters.team.toLowerCase())
    );
  if (filters.geo && filters.geo !== 'All') {
    partners = partners.filter((p) => {
      const geos = Array.isArray(p.geos) ? p.geos : p.geo ? [p.geo] : [];
      return geos.some((g) => g === filters.geo);
    });
  }
  if (filters.partner) {
    const q = filters.partner.toLowerCase();
    partners = partners.filter((p) => (p.name || '').toLowerCase().includes(q));
  }
  return { ...data, partners };
}

/**
 * Read real historical snapshots for trend lines. Returns the last `months`
 * months grouped by calendar month. If no snapshots exist yet (fresh install,
 * cron hasn't run), returns an empty array — the UI shows an empty-state hint.
 */
async function loadTrends(userId, reportType, months) {
  // Templates with no historical kpi_set (e.g. strategy, whose trends come from
  // scenario snapshots) get no injected history - they keep their own data.
  const kpiSet = KPI_SET_FOR_TYPE[reportType];
  if (!kpiSet) return [];
  const admin = buildSupabaseAdminClient();
  if (!admin) return [];

  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data, error } = await admin
    .from('report_kpi_snapshots')
    .select('snapshot_date, values')
    .eq('user_id', userId)
    .eq('kpi_set', kpiSet)
    .gte('snapshot_date', sinceIso)
    .order('snapshot_date', { ascending: true });

  if (error || !data || data.length === 0) return [];

  // Bucket by YYYY-MM, take the last snapshot of each month.
  const monthMap = new Map();
  for (const row of data) {
    const key = (row.snapshot_date || '').slice(0, 7);
    if (!key) continue;
    monthMap.set(key, row.values || {});
  }
  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Spread each kpi_set's stored numeric values so every template's trend chart
  // plots its own metrics (TrendChart auto-detects the numeric series).
  return [...monthMap.entries()].map(([yyyymm, v]) => {
    const monthIdx = Number(yyyymm.slice(5, 7)) - 1;
    const numeric = {};
    for (const [k, val] of Object.entries(v || {})) {
      if (typeof val === 'number') numeric[k] = val;
    }
    return { month: MONTH_LABELS[monthIdx] || yyyymm, ...numeric };
  });
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  // ── Auth ──────────────────────────────────────────────────────
  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

  // ── Rate limit ────────────────────────────────────────────────
  const rlKey = getRateLimitIdentifier(req);
  const rl = checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  try {
    const { type, refresh: forceRefresh, op, months: monthsParam, ...filterParams } = req.query || {};
    if (!type) return jsonError(res, 400, 'Missing required "type" query parameter');
    // Reject unknown templates instead of silently masquerading as the executive
    // summary (the previous behaviour). Keeps every template honest about its data.
    if (!SUPPORTED_REPORT_TYPES.includes(type)) {
      return jsonError(res, 400, `Unknown report type "${type}"`);
    }

    // ── op=trends: real historical KPI snapshots ─────────────────
    if (op === 'trends') {
      const months = Math.min(Math.max(parseInt(monthsParam, 10) || 6, 1), 24);
      const trends = await loadTrends(user.id, type, months);
      return res.status(200).json({ reportType: type, months, trends });
    }

    const filters = {};
    Object.entries(filterParams).forEach(([k, v]) => {
      if (v && v !== 'All') filters[k] = v;
    });
    const key = cacheKey(user.id, type, filters);
    if (!forceRefresh && SNAPSHOT_CACHE.has(key)) {
      const cached = SNAPSHOT_CACHE.get(key);
      if (Date.now() - cached.fetchedAt < DEFAULT_TTL_MS) return res.status(200).json(cached.data);
    }
    const sb = buildSupabaseUserClient(token);
    if (!sb) return jsonError(res, 503, 'Database connection not configured');
    const rawData = await loadAllData(sb);
    const filtered = applyFilters(rawData, filters);
    const payload = aggregateReport(type, filtered);

    // Pull real historical trends into the payload so the time-series sections
    // share the same honest data. Only overwrite when history exists, so module
    // templates that build their own trend data (e.g. strategy scenarios) keep it.
    const historicalTrends = await loadTrends(user.id, type, 6);
    if (historicalTrends.length > 0) {
      payload.trends = historicalTrends;
      payload.partnerTrends = historicalTrends;
      payload.performanceTrend = historicalTrends;
    }

    const now = new Date();
    const snapshot = {
      reportType: type,
      version: `v-${now.getTime()}`,
      computedAt: now.toISOString(),
      filters,
      source: 'server',
      ...payload,
    };
    SNAPSHOT_CACHE.set(key, { data: snapshot, fetchedAt: Date.now() });
    try {
      await sb.from('report_snapshots').insert({
        user_id: user.id,
        report_type: type,
        filters,
        version: snapshot.version,
        computed_at: snapshot.computedAt,
        payload: snapshot,
      });
    } catch {
      /* non-critical */
    }
    return res.status(200).json(snapshot);
  } catch (err) {
    return handleApiError(res, err, 'reports');
  }
}
