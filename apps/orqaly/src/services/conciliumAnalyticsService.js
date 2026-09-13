/**
 * Concilium analytics service: read analytics data for dashboards.
 *
 * Period analytics are derived client-side from `concilium_evaluations`.
 * The `concilium_analytics` aggregation table is never populated by any
 * worker, so reading it returned empty data — we bucket the user's own
 * evaluations by period instead so the dashboard always reflects reality.
 */
import { supabase, hasSupabase } from '../lib/supabase';

function assertSupabase() {
  if (!hasSupabase()) throw new Error('Supabase required for concilium analytics');
}

async function getAuthUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Normalize a timestamp to the start of its period bucket (ISO string).
 * @param {Date} date
 * @param {'hourly'|'daily'|'weekly'|'monthly'} period
 */
export function periodStart(date, period) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  switch (period) {
    case 'hourly':
      d.setMinutes(0, 0, 0);
      break;
    case 'weekly': {
      // Start of ISO week (Monday) at midnight UTC-local.
      d.setHours(0, 0, 0, 0);
      const day = (d.getDay() + 6) % 7; // 0 = Monday
      d.setDate(d.getDate() - day);
      break;
    }
    case 'monthly':
      d.setHours(0, 0, 0, 0);
      d.setDate(1);
      break;
    case 'daily':
    default:
      d.setHours(0, 0, 0, 0);
      break;
  }
  return d.toISOString();
}

/**
 * Bucket raw evaluation rows into period-aggregated analytics rows that
 * match the shape the dashboard expects (period_start, total_evaluations,
 * total_cost_usd, total_tokens, approved/rejected counts, avg score).
 * @param {Array} evaluations
 * @param {string} period
 * @param {string|null} boardId
 */
export function bucketEvaluations(evaluations, period = 'daily', boardId = null) {
  const buckets = new Map();
  for (const e of evaluations || []) {
    if (boardId && e.board_id !== boardId && e.concilium_id !== boardId) continue;
    const key = periodStart(e.created_at, period);
    if (!key) continue;
    if (!buckets.has(key)) {
      buckets.set(key, {
        id: `${period}-${key}`,
        period_type: period,
        period_start: key,
        board_id: boardId || null,
        total_evaluations: 0,
        approved_count: 0,
        rejected_count: 0,
        total_cost_usd: 0,
        total_tokens: 0,
        _scoreSum: 0,
      });
    }
    const b = buckets.get(key);
    b.total_evaluations += 1;
    if (e.approved === true) b.approved_count += 1;
    else if (e.approved === false) b.rejected_count += 1;
    b.total_cost_usd += Number.parseFloat(e.estimated_cost_usd ?? e.total_cost_usd ?? 0) || 0;
    b.total_tokens += Number.parseInt(e.total_tokens ?? 0, 10) || 0;
    b._scoreSum += Number.parseFloat(e.overall_score ?? 0) || 0;
  }
  return [...buckets.values()]
    .map((b) => ({
      ...b,
      avg_overall_score:
        b.total_evaluations > 0
          ? Number.parseFloat((b._scoreSum / b.total_evaluations).toFixed(2))
          : 0,
      total_cost_usd: Number.parseFloat(b.total_cost_usd.toFixed(4)),
      _scoreSum: undefined,
    }))
    .sort((a, b) => new Date(b.period_start) - new Date(a.period_start))
    .slice(0, 30);
}

async function fetchEvaluations(userId, columns) {
  const { data, error } = await supabase
    .from('concilium_evaluations')
    .select(columns)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data || [];
}

export async function getAnalytics(boardId = null, period = 'daily') {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const evals = await fetchEvaluations(
    userId,
    'created_at, overall_score, approved, estimated_cost_usd, total_cost_usd, total_tokens, board_id, concilium_id'
  );
  return bucketEvaluations(evals, period, boardId);
}

export async function getSummary() {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const { data, error } = await supabase
    .from('concilium_evaluations')
    .select('overall_score, approved, estimated_cost_usd, total_tokens')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  const evals = data || [];
  const approvedCount = evals.filter((e) => e.approved === true).length;
  const rejectedCount = evals.filter((e) => e.approved === false).length;
  return {
    totalEvaluations: evals.length,
    approvedCount,
    rejectedCount,
    pendingCount: evals.length - approvedCount - rejectedCount,
    avgScore:
      evals.length > 0
        ? parseFloat(
            (
              evals.reduce((s, e) => s + (parseFloat(e.overall_score) || 0), 0) / evals.length
            ).toFixed(2)
          )
        : 0,
    totalCostUsd: parseFloat(
      evals.reduce((s, e) => s + (parseFloat(e.estimated_cost_usd) || 0), 0).toFixed(4)
    ),
    totalTokens: evals.reduce((s, e) => s + (Number.parseInt(e.total_tokens ?? 0, 10) || 0), 0),
  };
}

/**
 * Group the user's recent evaluations by board so the Home dashboard's
 * Consilium Activity block can show per-board decision stats in one query.
 * Returns a map `{ [boardId]: { decisions, approvedCount, rejectedCount,
 * avgScore (0-10), costUsd, tokens } }`. The board key is `board_id` when
 * present, otherwise `concilium_id` (older rows).
 */
export async function getPerBoardSummary() {
  assertSupabase();
  const userId = await getAuthUserId();
  if (!userId) throw new Error('Must be authenticated');
  const evals = await fetchEvaluations(
    userId,
    'overall_score, approved, estimated_cost_usd, total_cost_usd, total_tokens, board_id, concilium_id'
  );
  const map = {};
  for (const e of evals) {
    const key = e.board_id || e.concilium_id;
    if (!key) continue;
    if (!map[key]) {
      map[key] = {
        decisions: 0,
        approvedCount: 0,
        rejectedCount: 0,
        _scoreSum: 0,
        costUsd: 0,
        tokens: 0,
      };
    }
    const b = map[key];
    b.decisions += 1;
    if (e.approved === true) b.approvedCount += 1;
    else if (e.approved === false) b.rejectedCount += 1;
    b._scoreSum += Number.parseFloat(e.overall_score ?? 0) || 0;
    b.costUsd += Number.parseFloat(e.estimated_cost_usd ?? e.total_cost_usd ?? 0) || 0;
    b.tokens += Number.parseInt(e.total_tokens ?? 0, 10) || 0;
  }
  for (const key of Object.keys(map)) {
    const b = map[key];
    b.avgScore = b.decisions > 0 ? parseFloat((b._scoreSum / b.decisions).toFixed(2)) : 0;
    b.costUsd = parseFloat(b.costUsd.toFixed(4));
    delete b._scoreSum;
  }
  return map;
}
