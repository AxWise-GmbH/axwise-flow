/**
 * [module: connection-hub]
 * Consilium Log handler: decision audit trail.
 * GET ?op=list       — list evaluations with filters
 * GET ?op=detail     — single evaluation with member_responses
 * GET ?op=analytics  — approval rate, confidence trend
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { checkRateLimit, applyRateLimitHeaders, getRateLimitIdentifier } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('communicator-consilium-log');

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

    const op = (req.query?.op || '').toLowerCase();

    // ── List evaluations ──
    if (op === 'list') {
      const { boardId, approved, dateFrom, dateTo, decisionLevel, search, limit: lim } = req.query || {};

      let q = admin
        .from('concilium_evaluations')
        .select(`
          id, concilium_id, board_id, job_id, user_id,
          overall_score, approved, summary, feedback,
          decision_level, consensus_type,
          human_review_required, human_review_status,
          total_cost_usd, total_tokens, duration_ms,
          model, provider, created_at
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(Number(lim) || 100);

      if (boardId) q = q.eq('concilium_id', boardId);
      if (approved === 'true') q = q.eq('approved', true);
      if (approved === 'false') q = q.eq('approved', false);
      if (decisionLevel && decisionLevel !== 'all') q = q.eq('decision_level', decisionLevel);
      if (dateFrom) q = q.gte('created_at', dateFrom);
      if (dateTo) q = q.lte('created_at', dateTo);
      if (search) q = q.ilike('summary', `%${search}%`);

      const { data: evaluations, error: evalErr } = await q;
      if (evalErr) return handleApiError(res, evalErr, 'consilium-log:list');

      // Fetch board names for display
      const boardIds = [...new Set((evaluations || []).map((e) => e.concilium_id).filter(Boolean))];
      let boardMap = {};
      if (boardIds.length > 0) {
        const { data: boards } = await admin
          .from('concilium')
          .select('id, name')
          .in('id', boardIds);
        boardMap = Object.fromEntries((boards || []).map((b) => [b.id, b.name]));
      }

      const result = (evaluations || []).map((e) => ({
        ...e,
        boardName: boardMap[e.concilium_id] || 'Unknown Board',
      }));

      return res.status(200).json({ evaluations: result, total: result.length });
    }

    // ── Detail: single evaluation with member responses ──
    if (op === 'detail') {
      const { id } = req.query || {};
      if (!id) return jsonError(res, 400, 'id required');

      const { data, error } = await admin
        .from('concilium_evaluations')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (error) return handleApiError(res, error, 'consilium-log:detail');
      if (!data) return jsonError(res, 404, 'Evaluation not found');

      // Fetch board name
      let boardName = 'Unknown Board';
      if (data.concilium_id) {
        const { data: board } = await admin
          .from('concilium')
          .select('name')
          .eq('id', data.concilium_id)
          .single();
        if (board) boardName = board.name;
      }

      return res.status(200).json({ evaluation: { ...data, boardName } });
    }

    // ── Analytics: approval rate, confidence, trends ──
    if (op === 'analytics') {
      const { data: evaluations, error: evalErr } = await admin
        .from('concilium_evaluations')
        .select('overall_score, approved, decision_level, human_review_required, total_cost_usd, total_tokens, created_at, concilium_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(500);

      if (evalErr) return handleApiError(res, evalErr, 'consilium-log:analytics');

      const all = evaluations || [];
      const total = all.length;
      const approvedCount = all.filter((e) => e.approved).length;
      const approvalRate = total > 0 ? approvedCount / total : 0;
      const avgConfidence = total > 0
        ? all.reduce((sum, e) => sum + (Number(e.overall_score) || 0), 0) / total
        : 0;
      const humanReviewCount = all.filter((e) => e.human_review_required).length;
      const totalCost = all.reduce((sum, e) => sum + (Number(e.total_cost_usd) || 0), 0);

      // Decisions by board
      const byBoard = {};
      for (const e of all) {
        const key = e.concilium_id || 'unknown';
        byBoard[key] = (byBoard[key] || 0) + 1;
      }

      // Weekly trend (last 8 weeks)
      const weeklyTrend = [];
      const now = new Date();
      for (let w = 7; w >= 0; w--) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - w * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const weekEvals = all.filter((e) => {
          const d = new Date(e.created_at);
          return d >= weekStart && d < weekEnd;
        });
        const weekTotal = weekEvals.length;
        const weekApproved = weekEvals.filter((e) => e.approved).length;
        weeklyTrend.push({
          weekStart: weekStart.toISOString().slice(0, 10),
          total: weekTotal,
          approved: weekApproved,
          rate: weekTotal > 0 ? weekApproved / weekTotal : 0,
        });
      }

      return res.status(200).json({
        total,
        approvedCount,
        approvalRate,
        avgConfidence,
        humanReviewCount,
        totalCost,
        byBoard,
        weeklyTrend,
      });
    }

    return jsonError(res, 400, `Unknown op: ${op}`);
  } catch (err) {
    return handleApiError(res, err, 'consilium-log');
  }
}
