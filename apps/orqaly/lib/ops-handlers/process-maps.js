/**
 * Live process-maps endpoint — serves the curated Goal/Loop/Pulse process spec
 * (lib/ops-handlers/process-maps-spec.js) enriched with live metric values for
 * the /data page "Guides" view.
 *
 * Auth matches data-topology.js: Super Admin only (this lives on the same page).
 * Metrics are computed defensively — user-scoped where the table has a `user_id`
 * column, falling back to a global count if the column is absent. A failing
 * metric returns null rather than breaking the whole payload.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { PROCESS_MAPS } from './process-maps-spec.js';

const METRIC_LABELS = {
  goals_active: { label: 'Active goals' },
  goals_total: { label: 'Total goals' },
  goals_completed_7d: { label: 'Completed (7d)' },
  goals_failed_active: { label: 'Failed goals' },
  agent_jobs_queued: { label: 'Queued jobs' },
  agent_jobs_running: { label: 'Running jobs' },
  team_tasks_active: { label: 'Active tasks' },
  agent_teams_total: { label: 'Teams' },
  tools_configured: { label: 'Tools' },
  knowledge_documents_total: { label: 'KB documents' },
  goal_messages_24h: { label: 'Messages (24h)' },
  llm_usage_24h_calls: { label: 'LLM calls (24h)' },
  llm_usage_24h_cost: { label: 'LLM cost (24h)', format: 'currency' },
  llm_usage_total_cost: { label: 'LLM cost (total)', format: 'currency', approximate: true },
  financial_events_24h: { label: 'Financial events (24h)' },
  loop_enabled_goals: { label: 'Looping goals' },
  agent_pulses_enabled: { label: 'Enabled pulses' },
  pulse_runs_24h: { label: 'Pulse runs (24h)' },
  pulse_cycles_24h: { label: 'Pulse cycles (24h)' },
  concilium_agents_pulsing: { label: 'Autonomous agents' },
};

/**
 * Count rows in `table` after applying `filterFn` to the query builder. Tries a
 * user_id scope first; if that errors (column missing), retries unscoped so the
 * metric still resolves on the super-admin page. Returns a number or null.
 */
async function scopedCount(admin, table, userId, filterFn = (q) => q) {
  const run = (withUser) => {
    let q = admin.from(table).select('*', { count: 'exact', head: true });
    q = filterFn(q);
    if (withUser) q = q.eq('user_id', userId);
    return q;
  };
  let { count, error } = await run(true);
  if (error) ({ count, error } = await run(false));
  return error ? null : count ?? 0;
}

/**
 * Sum a numeric column over recent rows (capped) with the same user-scope
 * fallback. Used for cost indicators — a live signal, not accounting.
 */
async function scopedSum(admin, table, column, userId, filterFn = (q) => q, cap = 2000) {
  const run = (withUser) => {
    let q = admin.from(table).select(column).order('created_at', { ascending: false }).limit(cap);
    q = filterFn(q);
    if (withUser) q = q.eq('user_id', userId);
    return q;
  };
  let { data, error } = await run(true);
  if (error) ({ data, error } = await run(false));
  if (error || !data) return null;
  return data.reduce((acc, row) => acc + (Number(row[column]) || 0), 0);
}

async function computeMetrics(admin, userId) {
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const ACTIVE = ['completed', 'failed', 'cancelled'];

  const jobs = {
    goals_active: scopedCount(admin, 'goals', userId, (q) => q.not('status', 'in', `(${ACTIVE.join(',')})`)),
    goals_total: scopedCount(admin, 'goals', userId),
    goals_completed_7d: scopedCount(admin, 'goals', userId, (q) => q.eq('status', 'completed').gte('created_at', since7d)),
    goals_failed_active: scopedCount(admin, 'goals', userId, (q) => q.eq('status', 'failed')),
    agent_jobs_queued: scopedCount(admin, 'agent_jobs', userId, (q) => q.eq('status', 'queued')),
    agent_jobs_running: scopedCount(admin, 'agent_jobs', userId, (q) => q.eq('status', 'running')),
    team_tasks_active: scopedCount(admin, 'team_tasks', userId, (q) => q.in('status', ['todo', 'in_progress', 'running'])),
    agent_teams_total: scopedCount(admin, 'agent_teams', userId),
    tools_configured: scopedCount(admin, 'tools', userId),
    knowledge_documents_total: scopedCount(admin, 'knowledge_documents', userId),
    goal_messages_24h: scopedCount(admin, 'goal_messages', userId, (q) => q.gte('created_at', since24h)),
    llm_usage_24h_calls: scopedCount(admin, 'llm_usage', userId, (q) => q.gte('created_at', since24h)),
    llm_usage_24h_cost: scopedSum(admin, 'llm_usage', 'estimated_cost_usd', userId, (q) => q.gte('created_at', since24h)),
    llm_usage_total_cost: scopedSum(admin, 'llm_usage', 'estimated_cost_usd', userId),
    financial_events_24h: scopedCount(admin, 'financial_events', userId, (q) => q.gte('created_at', since24h)),
    loop_enabled_goals: scopedCount(admin, 'goals', userId, (q) => q.eq('loop_enabled', true)),
    agent_pulses_enabled: scopedCount(admin, 'agent_pulses', userId, (q) => q.eq('enabled', true)),
    pulse_runs_24h: scopedCount(admin, 'pulse_runs', userId, (q) => q.gte('created_at', since24h)),
    pulse_cycles_24h: scopedCount(admin, 'pulse_cycles', userId, (q) => q.gte('created_at', since24h)),
    concilium_agents_pulsing: scopedCount(admin, 'concilium_agents', userId, (q) => q.eq('pulse_enabled', true)),
  };

  const keys = Object.keys(jobs);
  const values = await Promise.all(keys.map((k) => jobs[k].catch(() => null)));
  const metrics = {};
  keys.forEach((k, i) => {
    metrics[k] = { key: k, label: METRIC_LABELS[k]?.label || k, value: values[i], ...(METRIC_LABELS[k] || {}) };
  });
  return metrics;
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  // ── Auth ──────────────────────────────────────────────────────
  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');

  // ── Super Admin check (same gate as data-topology; shares the /data page) ──
  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (roleRow?.role_id !== 'role-super-admin') {
    return jsonError(res, 403, 'Only Super Admin can access process maps.');
  }

  // ── Rate limit ────────────────────────────────────────────────
  const rlKey = getRateLimitIdentifier(req);
  const rl = checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  try {
    const metrics = await computeMetrics(admin, user.id);
    // Attach resolved metric objects onto each step (in metricKeys order).
    const maps = Object.values(PROCESS_MAPS).map((map) => ({
      ...map,
      steps: map.steps.map((step) => ({
        ...step,
        metrics: (step.metricKeys || []).map((k) => metrics[k]).filter(Boolean),
      })),
    }));
    return res.status(200).json({ maps, metrics, generatedAt: new Date().toISOString() });
  } catch (err) {
    return handleApiError(res, err, 'process-maps');
  }
}
