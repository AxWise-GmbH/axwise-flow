/**
 * Concilium analytics handler: read aggregated analytics for dashboards.
 * GET ?boardId=&period= — returns analytics for a board/period.
 * GET ?summary=true — returns cross-board summary.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { checkRateLimit, applyRateLimitHeaders, getRateLimitIdentifier } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('concilium-analytics');

const VALID_PERIODS = ['hourly', 'daily', 'weekly', 'monthly'];

export default async function handler(req, res) {
  const safeReq = req && typeof req === 'object' ? req : {};
  if (!safeReq.headers) safeReq.headers = {};
  cors(res, safeReq);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  try {
    const token = getBearerToken(safeReq);
    const user = await verifySupabaseToken(token);
    if (!user) return jsonError(res, 401, 'Unauthorized');

    const rlKey = getRateLimitIdentifier(req, user.id);
    const rl = checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    const endTimer = log.startTimer();

    // ── Summary mode: cross-board overview ──────────────────────────
    if (req.query?.summary === 'true') {
      const { data: evaluations, error: evalErr } = await admin
        .from('concilium_evaluations')
        .select('overall_score, approved, estimated_cost_usd, total_tokens, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      endTimer('analytics:summary');
      if (evalErr) return handleApiError(res, evalErr, 'analytics:summary');

      const evals = evaluations || [];
      const summary = {
        totalEvaluations: evals.length,
        approvedCount: evals.filter((e) => e.approved).length,
        rejectedCount: evals.filter((e) => !e.approved).length,
        avgScore: evals.length > 0
          ? parseFloat((evals.reduce((s, e) => s + (parseFloat(e.overall_score) || 0), 0) / evals.length).toFixed(2))
          : 0,
        totalCostUsd: parseFloat(evals.reduce((s, e) => s + (parseFloat(e.estimated_cost_usd) || 0), 0).toFixed(4)),
        totalTokens: evals.reduce((s, e) => s + (e.total_tokens || 0), 0),
      };

      return res.status(200).json({ summary });
    }

    // ── Board-specific analytics ────────────────────────────────────
    const boardId = req.query?.boardId;
    const period = req.query?.period || 'daily';

    if (!VALID_PERIODS.includes(period)) {
      return jsonError(res, 400, `Invalid period. Must be: ${VALID_PERIODS.join(', ')}`);
    }

    let query = admin
      .from('concilium_analytics')
      .select('*')
      .eq('user_id', user.id)
      .eq('period_type', period)
      .order('period_start', { ascending: false })
      .limit(30);

    if (boardId) query = query.eq('board_id', boardId);

    const { data, error } = await query;
    endTimer('analytics:list');
    if (error) return handleApiError(res, error, 'analytics:list');

    return res.status(200).json({ analytics: data || [], period });
  } catch (err) {
    return handleApiError(res, err, 'analytics');
  }
}
