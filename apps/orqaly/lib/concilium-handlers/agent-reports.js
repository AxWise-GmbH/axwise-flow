/**
 * Concilium agent reports handler: submit and list agent activity reports.
 * GET ?agentId= (list by agent), GET ?boardId= (list by board), POST (submit report).
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { checkRateLimit, applyRateLimitHeaders, getRateLimitIdentifier } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('concilium-agent-reports');

const VALID_REPORT_TYPES = ['check_in', 'activity', 'error', 'completion', 'status_change'];

export default async function handler(req, res) {
  const safeReq = req && typeof req === 'object' ? req : {};
  if (!safeReq.headers) safeReq.headers = {};
  cors(res, safeReq);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = getBearerToken(safeReq);
    const user = await verifySupabaseToken(token);
    if (!user) return jsonError(res, 401, 'Unauthorized');

    const rlKey = getRateLimitIdentifier(req, user.id);
    const rl = checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    const endTimer = log.startTimer();

    // ── GET ─────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const agentId = req.query?.agentId;
      const boardId = req.query?.boardId;
      if (!agentId && !boardId) return jsonError(res, 400, 'agentId or boardId query param required');

      let query = admin.from('concilium_agent_reports').select('*').eq('user_id', user.id);
      if (agentId) query = query.eq('agent_id', agentId);
      if (boardId) query = query.eq('board_id', boardId);
      const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
      endTimer('agent-reports:list');
      if (error) return handleApiError(res, error, 'agent-reports:list');
      return res.status(200).json({ reports: data || [] });
    }

    // ── POST (submit report) ────────────────────────────────────────
    if (req.method === 'POST') {
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const { agentId, boardId, report_type, summary, details, requests_made, tokens_used, cost_usd, errors_count, task_id, job_pool_id } = body;
      if (!agentId) return jsonError(res, 400, 'agentId is required');
      if (report_type && !VALID_REPORT_TYPES.includes(report_type)) {
        return jsonError(res, 400, `Invalid report_type. Must be: ${VALID_REPORT_TYPES.join(', ')}`);
      }

      const row = {
        user_id: user.id,
        agent_id: agentId,
        board_id: boardId || null,
        report_type: report_type || 'activity',
        summary: summary || '',
        details: details || {},
        requests_made: requests_made || 0,
        tokens_used: tokens_used || 0,
        cost_usd: cost_usd || 0,
        errors_count: errors_count || 0,
        verified: true,
        ...(task_id && { task_id }),
        ...(job_pool_id && { job_pool_id }),
      };
      const { data, error } = await admin
        .from('concilium_agent_reports')
        .insert(row)
        .select('*')
        .single();
      endTimer('agent-reports:submit');
      if (error) return handleApiError(res, error, 'agent-reports:submit');
      log.info('Report submitted', { agentId, reportType: row.report_type });
      return res.status(201).json({ report: data });
    }

    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    return handleApiError(res, err, 'agent-reports');
  }
}
