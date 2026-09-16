/**
 * Usage analytics handler (consolidated under api/ops for the Vercel free plan).
 * GET /api/ops?path=usage-analytics&entity=all|organization|consilium|goal|team|agent&entityId=...&from=...&to=...
 *
 * Single reconciled source of truth for LLM usage: aggregates llm_usage
 * server-side with the admin client, always scoped to the caller's user_id
 * (RLS-equivalent in code), so even legacy / RLS-hidden rows are counted for
 * their owner without leaking across tenants. Folds concilium_evaluations
 * (eval counts) and payouts (revenue), and goals (budget vs spend).
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError } from '../../api/_lib/errors.js';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  applyRateLimitHeaders,
} from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { usageAnalyticsQuerySchema } from '../../api/_lib/validate.js';

const MAX_RANGE_DAYS = 366;
const MAX_ROWS = 50_000;

// Maps a usage entity to the llm_usage column it filters on.
const ENTITY_COLUMN = {
  organization: 'organization_id',
  consilium: 'consilium_id',
  goal: 'goal_id',
  team: 'team_id',
  agent: 'agent_id',
};

export function resolveRange(from, to) {
  const now = new Date();
  let end = to ? new Date(to) : now;
  if (Number.isNaN(end.getTime())) end = now;
  // A missing `from` means "as far back as allowed" (the full window), not the
  // last 30 days - otherwise an "All" range would hide older usage.
  const fullStart = new Date(end.getTime() - MAX_RANGE_DAYS * 86_400_000);
  let start = from ? new Date(from) : fullStart;
  if (Number.isNaN(start.getTime())) start = fullStart;
  if (start > end) [start, end] = [end, start];
  // Clamp the window so a stray param can not scan the whole table.
  if ((end - start) / 86_400_000 > MAX_RANGE_DAYS) {
    start = new Date(end.getTime() - MAX_RANGE_DAYS * 86_400_000);
  }
  return { start, end };
}

function dayKey(iso) {
  return (iso || '').slice(0, 10);
}

function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
  return sortedAsc[idx];
}

/** Distinct provider/model/source values present in the rows (for filter options). */
export function computeFacets(rows) {
  const providers = new Set();
  const models = new Set();
  const sources = new Set();
  for (const r of rows || []) {
    if (r.provider) providers.add(r.provider);
    if (r.model) models.add(r.model);
    if (r.source) sources.add(r.source);
  }
  return {
    providers: [...providers].sort(),
    models: [...models].sort(),
    sources: [...sources].sort(),
  };
}

/** True when a row matches the optional provider/model/source filters. */
export function matchesUsageFilters(r, { provider, model, source } = {}) {
  return (
    (!provider || r.provider === provider) &&
    (!model || r.model === model) &&
    (!source || r.source === source)
  );
}

// A "block"-shaped decision, normalized across the two integration points:
// copilot.chat logs guard.action ('block'), agent.generate logs a scopeDecision
// ('denied'). Both mean "would not allow".
const BLOCK_DECISIONS = new Set(['denied', 'block', 'blocked']);
function isBlockDecision(d) {
  return typeof d === 'string' && BLOCK_DECISIONS.has(d.toLowerCase());
}

/**
 * AxWise-vs-local divergence over a set of axwise llm_usage rows. Answers the
 * "impact" question: how often does AxWise decide differently than the local
 * heuristic it replaced. Pure over rows (each row's metadata carries ax_decision
 * + local_decision, written by lib/integrations/axwise/tracked.js).
 */
export function computeDivergence(rows) {
  const byOp = new Map();
  const diverged = [];
  const totals = { calls: 0, paired: 0, axStricter: 0, localStricter: 0, agree: 0, degraded: 0 };
  for (const r of rows || []) {
    const meta = r.metadata || {};
    const ax = meta.ax_decision ?? null;
    const loc = meta.local_decision ?? null;
    const op = r.operation || 'unknown';
    const slot = byOp.get(op) || {
      operation: op,
      calls: 0,
      paired: 0,
      axStricter: 0,
      localStricter: 0,
      agree: 0,
      degraded: 0,
    };
    slot.calls += 1;
    totals.calls += 1;
    if (r.status === 'degraded' || r.status === 'error' || r.status === 'timeout') {
      slot.degraded += 1;
      totals.degraded += 1;
    }
    if (ax != null && loc != null) {
      slot.paired += 1;
      totals.paired += 1;
      const axB = isBlockDecision(ax);
      const locB = isBlockDecision(loc);
      if (axB && !locB) {
        slot.axStricter += 1;
        totals.axStricter += 1;
        diverged.push({
          when: r.created_at,
          operation: op,
          ax,
          local: loc,
          direction: 'axwise_stricter',
        });
      } else if (locB && !axB) {
        slot.localStricter += 1;
        totals.localStricter += 1;
        diverged.push({
          when: r.created_at,
          operation: op,
          ax,
          local: loc,
          direction: 'local_stricter',
        });
      } else {
        slot.agree += 1;
        totals.agree += 1;
      }
    }
    byOp.set(op, slot);
  }
  return {
    totals,
    byOperation: [...byOp.values()].sort((a, b) => b.calls - a.calls),
    diverged: diverged.slice(0, 50),
  };
}

/** Aggregate raw llm_usage rows into the response payload. */
export function aggregateUsage(rows) {
  const byModel = new Map();
  const byProvider = new Map();
  const byAgent = new Map();
  const byDay = new Map();
  const durations = [];

  let tokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let cachedTokens = 0;
  let cost = 0;
  let durationSum = 0;
  let errorCalls = 0;
  const calls = rows.length;

  for (const r of rows) {
    const provider = r.provider || 'unknown';
    const model = r.model || 'unknown';
    const rowTokens =
      Number(r.total_tokens || 0) ||
      Number(r.prompt_tokens || 0) + Number(r.completion_tokens || 0);
    const rowCost = Number(r.estimated_cost_usd || 0);
    const dur = Number(r.duration_ms || 0);

    tokens += rowTokens;
    promptTokens += Number(r.prompt_tokens || 0);
    completionTokens += Number(r.completion_tokens || 0);
    cachedTokens += Number(r.cached_tokens || 0);
    cost += rowCost;
    durationSum += dur;
    if (dur > 0) durations.push(dur);
    if (r.status && r.status !== 'ok') errorCalls += 1;

    const mKey = `${provider}/${model}`;
    const m = byModel.get(mKey) || { provider, model, tokens: 0, cost: 0, calls: 0 };
    m.tokens += rowTokens;
    m.cost += rowCost;
    m.calls += 1;
    byModel.set(mKey, m);

    const p = byProvider.get(provider) || { provider, tokens: 0, cost: 0, calls: 0 };
    p.tokens += rowTokens;
    p.cost += rowCost;
    p.calls += 1;
    byProvider.set(provider, p);

    const agentId = r.agent_id || null;
    const agentName = r.agent_name || r.agent_id || 'Unattributed';
    const aKey = agentId || agentName;
    const a = byAgent.get(aKey) || { agentId, agentName, tokens: 0, cost: 0, calls: 0 };
    a.tokens += rowTokens;
    a.cost += rowCost;
    a.calls += 1;
    byAgent.set(aKey, a);

    const dKey = dayKey(r.created_at);
    const d = byDay.get(dKey) || { date: dKey, tokens: 0, cost: 0, calls: 0, durationSum: 0 };
    d.tokens += rowTokens;
    d.cost += rowCost;
    d.calls += 1;
    d.durationSum += dur;
    byDay.set(dKey, d);
  }

  const sortedDur = durations.sort((x, y) => x - y);
  const byCostDesc = (x, y) => y.cost - x.cost;

  return {
    totals: {
      tokens,
      promptTokens,
      completionTokens,
      cachedTokens,
      cost: Number(cost.toFixed(6)),
      calls,
      errorCalls,
      errorRate: calls > 0 ? Number((errorCalls / calls).toFixed(4)) : 0,
      avgDurationMs: calls > 0 ? Math.round(durationSum / calls) : 0,
      p95DurationMs: percentile(sortedDur, 95),
    },
    byModel: [...byModel.values()].sort(byCostDesc),
    byProvider: [...byProvider.values()].sort(byCostDesc),
    byAgent: [...byAgent.values()].sort(byCostDesc),
    timeseries: [...byDay.values()]
      .sort((x, y) => (x.date < y.date ? -1 : 1))
      .map((d) => ({
        date: d.date,
        tokens: d.tokens,
        cost: d.cost,
        calls: d.calls,
        avgDurationMs: d.calls > 0 ? Math.round(d.durationSum / d.calls) : 0,
      })),
  };
}

/** Verify the requested entity belongs to the caller; returns false if not. */
async function ownsEntity(admin, entity, entityId, userId) {
  try {
    if (entity === 'organization') {
      const { data } = await admin
        .from('organizations')
        .select('id')
        .eq('id', entityId)
        .eq('user_id', userId)
        .maybeSingle();
      return !!data;
    }
    if (entity === 'consilium') {
      const { data } = await admin
        .from('concilium')
        .select('id')
        .eq('id', entityId)
        .eq('user_id', userId)
        .maybeSingle();
      return !!data;
    }
    if (entity === 'goal') {
      const { data } = await admin
        .from('goals')
        .select('id')
        .eq('id', entityId)
        .eq('user_id', userId)
        .maybeSingle();
      return !!data;
    }
  } catch {
    /* fall through */
  }
  // team/agent are scoped implicitly by the user_id filter on llm_usage.
  return true;
}

/** Budget vs spend for goal / organization entities (0 elsewhere). */
async function resolveBudget(admin, entity, entityId, userId, spentFallback) {
  try {
    if (entity === 'goal') {
      const { data } = await admin
        .from('goals')
        .select('budget_usd, spent_usd')
        .eq('id', entityId)
        .eq('user_id', userId)
        .maybeSingle();
      if (data)
        return { budgetUsd: Number(data.budget_usd || 0), spentUsd: Number(data.spent_usd || 0) };
    }
    if (entity === 'organization') {
      const { data } = await admin
        .from('goals')
        .select('budget_usd, spent_usd')
        .eq('org_id', entityId)
        .eq('user_id', userId);
      if (Array.isArray(data)) {
        return {
          budgetUsd: data.reduce((s, g) => s + Number(g.budget_usd || 0), 0),
          spentUsd: data.reduce((s, g) => s + Number(g.spent_usd || 0), 0),
        };
      }
    }
  } catch {
    /* best effort */
  }
  return { budgetUsd: 0, spentUsd: Number(spentFallback || 0) };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

  const rl = checkRateLimit({
    key: getRateLimitIdentifier(req, user.id),
    limit: 30,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  const parsed = usageAnalyticsQuerySchema.safeParse(req.query || {});
  if (!parsed.success) {
    return jsonError(res, 400, parsed.error.issues?.[0]?.message || 'Invalid query');
  }
  const { entity, entityId, from, to, provider, model, source } = parsed.data;
  const { start, end } = resolveRange(from, to);

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database connection not configured');

  // detail=divergence: AxWise-vs-local impact view. Self-contained, user-scoped
  // (no entity ownership needed), reads the ax_decision/local_decision metadata.
  const detail = typeof req.query?.detail === 'string' ? req.query.detail : null;
  if (detail === 'divergence') {
    const { data: axRows, error: axErr } = await admin
      .from('llm_usage')
      .select('created_at, operation, status, metadata')
      .eq('user_id', user.id)
      .eq('source', 'axwise')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);
    if (axErr) return jsonError(res, 500, axErr.message);
    return res.status(200).json({
      detail: 'divergence',
      range: { from: start.toISOString(), to: end.toISOString() },
      ...computeDivergence(axRows || []),
    });
  }

  if (entity !== 'all') {
    const owns = await ownsEntity(admin, entity, entityId, user.id);
    if (!owns) return jsonError(res, 404, 'Entity not found');
  }

  // ── llm_usage rows for this owner + range + entity slice ──
  let query = admin
    .from('llm_usage')
    .select(
      'provider, model, source, prompt_tokens, completion_tokens, total_tokens, cached_tokens, estimated_cost_usd, duration_ms, status, agent_id, agent_name, created_at'
    )
    .eq('user_id', user.id)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  const col = ENTITY_COLUMN[entity];
  if (col && entityId) query = query.eq(col, entityId);

  const { data: usageRows, error: usageErr } = await query;
  if (usageErr) return jsonError(res, 500, usageErr.message);

  // Facets reflect all rows in range (so any provider/model/source stays
  // selectable); the aggregation uses the provider/model/source-filtered set.
  const allRows = usageRows || [];
  const facets = computeFacets(allRows);
  const agg = aggregateUsage(
    allRows.filter((r) => matchesUsageFilters(r, { provider, model, source }))
  );

  // ── concilium_evaluations: counts + score (same owner / range) ──
  let evaluations = 0;
  let approved = 0;
  let avgScore = 0;
  const scoreByDay = new Map(); // date -> { sum, n } for the daily quality sparkline
  try {
    let evalQuery = admin
      .from('concilium_evaluations')
      .select('overall_score, approved, concilium_id, created_at')
      .eq('user_id', user.id)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .limit(MAX_ROWS);
    // concilium_evaluations spells the board column with an n (concilium_id),
    // unlike llm_usage's consilium_id. Filtering the wrong name silently
    // dropped every consilium eval to 0.
    if (entity === 'consilium' && entityId) evalQuery = evalQuery.eq('concilium_id', entityId);
    const { data: evals } = await evalQuery;
    if (Array.isArray(evals) && (entity === 'all' || entity === 'consilium' || entity === 'goal')) {
      evaluations = evals.length;
      approved = evals.filter((e) => e.approved === true).length;
      avgScore =
        evaluations > 0
          ? Number(
              (evals.reduce((s, e) => s + Number(e.overall_score || 0), 0) / evaluations).toFixed(2)
            )
          : 0;
      for (const e of evals) {
        const k = dayKey(e.created_at);
        const s = scoreByDay.get(k) || { sum: 0, n: 0 };
        s.sum += Number(e.overall_score || 0);
        s.n += 1;
        scoreByDay.set(k, s);
      }
    }
  } catch {
    /* evaluations are optional context */
  }

  // ── payouts: marketplace revenue (owner + range). Only at the 'all' level:
  // payouts.agent_id is a uuid FK in a different id space than llm_usage.agent_id
  // (TEXT), so per-entity revenue is not slice-able without a separate join. ──
  let revenue = 0;
  if (entity === 'all') {
    try {
      const { data: pays } = await admin
        .from('payouts')
        .select('gross_amount')
        .eq('user_id', user.id)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .limit(MAX_ROWS);
      if (Array.isArray(pays)) revenue = pays.reduce((s, p) => s + Number(p.gross_amount || 0), 0);
    } catch {
      /* payouts optional */
    }
  }

  const budget = await resolveBudget(admin, entity, entityId, user.id, agg.totals.cost);

  return res.status(200).json({
    entity,
    entityId: entityId || null,
    range: { from: start.toISOString(), to: end.toISOString() },
    totals: {
      ...agg.totals,
      evaluations,
      approved,
      avgScore,
      revenue: Number(revenue.toFixed(2)),
      budgetUsd: Number(budget.budgetUsd.toFixed(4)),
      spentUsd: Number(budget.spentUsd.toFixed(4)),
    },
    byModel: agg.byModel,
    byProvider: agg.byProvider,
    byAgent: agg.byAgent,
    timeseries: agg.timeseries.map((d) => {
      const s = scoreByDay.get(d.date);
      return { ...d, avgScore: s && s.n ? Number((s.sum / s.n).toFixed(2)) : 0 };
    }),
    facets,
    meta: { source: 'llm_usage', rowCount: allRows.length, generatedAt: new Date().toISOString() },
  });
}
