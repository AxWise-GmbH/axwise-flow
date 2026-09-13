/**
 * Report Service
 *
 * Client-side service for fetching report snapshots and managing report state.
 * Works with the /api/reports endpoint when available, with a client-side
 * aggregation fallback for local development.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { aggregateReport } from '../utils/reportAggregation';

// Re-export the shared aggregation helpers so existing importers (and tests)
// keep working now that the implementation lives in one place.
export {
  aggregateReport,
  buildAgentKpis,
  buildGoalStages,
  buildModuleDigest,
} from '../utils/reportAggregation';

const API_BASE = '/api/reports';
const SNAPSHOT_CACHE = new Map();
const CACHE_TTL_MS = 45_000;

/** Thrown when the Reports API responds but rejects the request (e.g. 401/429). */
export class ReportApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ReportApiError';
    this.status = status;
  }
}

function cacheKey(reportType, filters) {
  return `${reportType}::${JSON.stringify(filters || {})}`;
}

/** Attach the Supabase JWT so /api/reports can authorize the request (RLS-scoped). */
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

export async function fetchReportSnapshot(reportType, filters = {}, forceRefresh = false) {
  const key = cacheKey(reportType, filters);

  if (!forceRefresh && SNAPSHOT_CACHE.has(key)) {
    const cached = SNAPSHOT_CACHE.get(key);
    if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  try {
    const params = new URLSearchParams({ type: reportType, ...filters });
    if (forceRefresh) params.set('refresh', '1');
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}?${params.toString()}`, { headers });
    if (res.ok) {
      const data = await res.json();
      SNAPSHOT_CACHE.set(key, { data, fetchedAt: Date.now() });
      return data;
    }
    // API reachable but rejected the request (e.g. 401 missing/expired session,
    // 429 rate limit). Surface it instead of silently masking it with empty
    // client-side data; the caller's catch turns this into a visible error.
    throw new ReportApiError(
      res.status === 401
        ? 'Reports session expired or unauthorized. Sign in again and retry.'
        : `Reports API request failed (HTTP ${res.status}).`,
      res.status
    );
  } catch (err) {
    if (err instanceof ReportApiError) throw err;
    // Network unreachable (offline, proxy down, dev without API): fall back to
    // client-side aggregation so the page still renders what data it can find.
    if (typeof console !== 'undefined') {
      console.warn('[reports] API unreachable, using client-side aggregation:', err?.message);
    }
  }

  const data = await buildClientSideSnapshot(reportType, filters);
  SNAPSHOT_CACHE.set(key, { data, fetchedAt: Date.now() });
  return data;
}

const INSIGHTS_BASE = '/api/report-insights';
const INSIGHTS_CACHE = new Map();

/**
 * Fetch a real LLM-written narrative for a snapshot (Groq, recorded to
 * llm_usage). Returns { narrative, provider, model } on success.
 * Throws ReportApiError on a rejected request and a plain Error on network
 * failure, so the caller can fall back to the deterministic summary.
 * Cached per (reportType, version) to avoid re-billing on poll / re-render.
 */
export async function fetchReportInsights(snapshot, { templateName } = {}) {
  if (!snapshot?.reportType) throw new Error('Missing report snapshot');
  const cacheId = `${snapshot.reportType}::${snapshot.version || ''}`;
  if (INSIGHTS_CACHE.has(cacheId)) return INSIGHTS_CACHE.get(cacheId);

  const topRows = snapshot.topMovers || snapshot.topPartners || snapshot.campaignLeaderboard || [];
  const body = {
    reportType: snapshot.reportType,
    templateName: templateName || snapshot.reportType,
    kpis: snapshot.kpis || [],
    alerts: snapshot.alerts || [],
    topRows: Array.isArray(topRows) ? topRows.slice(0, 5) : [],
  };

  const headers = { 'Content-Type': 'application/json', ...(await getAuthHeaders()) };
  const res = await fetch(INSIGHTS_BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ReportApiError(
      res.status === 401
        ? 'Session expired - sign in again for AI insights.'
        : `Report insights request failed (HTTP ${res.status}).`,
      res.status
    );
  }
  const data = await res.json();
  INSIGHTS_CACHE.set(cacheId, data);
  return data;
}

export function clearInsightsCache() {
  INSIGHTS_CACHE.clear();
}

async function buildClientSideSnapshot(reportType, filters) {
  const now = new Date();
  const version = `v-${now.getTime()}`;
  const computedAt = now.toISOString();

  const { datasets, usedLocalCache } = await loadDatasets();

  if (filters.partnerId) {
    datasets.partners = datasets.partners.filter((p) => p.id === filters.partnerId);
  }
  if (filters.team && filters.team !== 'All') {
    datasets.partners = datasets.partners.filter((p) =>
      (p.team || '').toLowerCase().includes(filters.team.toLowerCase())
    );
  }
  if (filters.geo && filters.geo !== 'All') {
    datasets.partners = datasets.partners.filter((p) => {
      const geos = p.geos || p.geo || [];
      return Array.isArray(geos) ? geos.includes(filters.geo) : String(geos).includes(filters.geo);
    });
  }

  const payload = aggregateReport(reportType, datasets);

  return {
    reportType,
    version,
    computedAt,
    filters,
    // 'client' = aggregated live from Supabase in the browser; 'local-cache' =
    // built from localStorage because the DB returned nothing. The UI badges
    // these differently so a local cache is never mistaken for live data.
    source: usedLocalCache ? 'local-cache' : 'client',
    ...payload,
  };
}

async function loadDatasets() {
  const out = {
    partners: [],
    projects: [],
    pushes: [],
    agentJobs: [],
    goals: [],
    kbDocs: [],
    deliverableVersions: [],
    dashboards: [],
    strategySnapshots: [],
  };
  let usedLocalCache = false;

  if (hasSupabase()) {
    try {
      const [pRes, prRes, ghRes, ajRes, gRes, kbRes, dvRes, dRes, scRes] = await Promise.all([
        supabase.from('partners').select('*'),
        supabase.from('projects').select('*'),
        supabase.from('github_pushes').select('pushed_at, created_at'),
        safeSelect(
          'agent_jobs',
          'id, status, agent_id, agent_name, created_at, completed_at, duration_ms, stage'
        ),
        safeSelect(
          'goals',
          'id, title, status, stage, created_at, completed_at, estimate_hours, elapsed_hours, blocked_reason'
        ),
        safeSelect('knowledge_base_docs', 'id, title, source, created_at, status'),
        safeSelect(
          'deliverable_versions',
          'id, deliverable_id, deliverable_type, version, approved, created_at'
        ),
        safeSelect('dashboards', 'id, name, created_at, auto_generated'),
        safeSelect('strategy_center_snapshots', 'period_key, period_label, payload, created_at'),
      ]);
      out.partners = mapRows(pRes);
      out.projects = mapRows(prRes);
      out.pushes = pRes && !ghRes?.error ? ghRes?.data || [] : [];
      out.agentJobs = ajRes?.data || [];
      out.goals = gRes?.data || [];
      out.kbDocs = kbRes?.data || [];
      out.deliverableVersions = dvRes?.data || [];
      out.dashboards = dRes?.data || [];
      out.strategySnapshots = (scRes?.data || []).sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
      );
    } catch {
      /* fall through */
    }
  }

  if (out.partners.length === 0) {
    try {
      const raw = localStorage.getItem('orch_partners');
      if (raw) {
        out.partners = JSON.parse(raw);
        if (out.partners.length > 0) usedLocalCache = true;
      }
    } catch {
      /* ignore */
    }
  }
  if (out.projects.length === 0) {
    try {
      const raw = localStorage.getItem('orch_projects');
      if (raw) {
        out.projects = JSON.parse(raw);
        if (out.projects.length > 0) usedLocalCache = true;
      }
    } catch {
      /* ignore */
    }
  }

  return { datasets: out, usedLocalCache };
}

function mapRows(res) {
  if (!res || res.error) return [];
  return (res.data || []).map((r) => (typeof r.data === 'object' && r.data ? r.data : r));
}

async function safeSelect(table, fields) {
  try {
    return await supabase.from(table).select(fields);
  } catch {
    return { data: [], error: null };
  }
}

export function clearSnapshotCache() {
  SNAPSHOT_CACHE.clear();
}

/**
 * Clear all client-held report data on logout so a shared browser never surfaces
 * the previous user's reports. Drops the in-memory snapshot cache and the
 * localStorage datasets the offline fallback reads from.
 */
export function clearReportClientData() {
  clearSnapshotCache();
  clearInsightsCache();
  try {
    localStorage.removeItem('orch_partners');
    localStorage.removeItem('orch_projects');
  } catch {
    /* ignore (storage unavailable) */
  }
}
