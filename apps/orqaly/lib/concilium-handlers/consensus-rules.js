/**
 * Concilium consensus rules handler: Get/update consensus rules per board.
 * GET ?conciliumId= (get rules), PUT ?conciliumId= (update rules).
 * One consensus rule set per board (unique constraint).
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { checkRateLimit, applyRateLimitHeaders, getRateLimitIdentifier } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('concilium-consensus');

const VALID_TYPES = ['unanimous', 'majority', 'weighted', 'custom'];
const VALID_SPLIT_STRATEGIES = ['chairman_decides', 'reject', 'escalate_to_human', 're_evaluate'];

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

    const conciliumId = req.query?.conciliumId;
    if (!conciliumId) return jsonError(res, 400, 'conciliumId query param required');

    const endTimer = log.startTimer();

    // ── GET ─────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { data, error } = await admin
        .from('concilium_consensus_rules')
        .select('*')
        .eq('concilium_id', conciliumId)
        .eq('user_id', user.id)
        .maybeSingle();
      endTimer('consensus:get');
      if (error) return handleApiError(res, error, 'consensus:get');
      if (!data) {
        // Return defaults if no rules configured yet
        return res.status(200).json({
          rules: {
            concilium_id: conciliumId,
            consensus_type: 'majority',
            quorum: 2,
            approval_threshold: 0.50,
            split_decision_strategy: 'chairman_decides',
            custom_rules: {},
          },
          exists: false,
        });
      }
      return res.status(200).json({ rules: data, exists: true });
    }

    // ── PUT (upsert) ────────────────────────────────────────────────
    if (req.method === 'PUT') {
      // Verify board ownership
      const { data: board, error: boardErr } = await admin
        .from('concilium')
        .select('id')
        .eq('id', conciliumId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (boardErr) return handleApiError(res, boardErr, 'consensus:verify-board');
      if (!board) return jsonError(res, 404, 'Board not found');

      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const { consensus_type, quorum, approval_threshold, split_decision_strategy, custom_rules } = body;

      if (consensus_type && !VALID_TYPES.includes(consensus_type)) {
        return jsonError(res, 400, `Invalid consensus_type. Must be: ${VALID_TYPES.join(', ')}`);
      }
      if (split_decision_strategy && !VALID_SPLIT_STRATEGIES.includes(split_decision_strategy)) {
        return jsonError(res, 400, `Invalid split_decision_strategy. Must be: ${VALID_SPLIT_STRATEGIES.join(', ')}`);
      }
      if (quorum !== undefined && (typeof quorum !== 'number' || quorum < 1)) {
        return jsonError(res, 400, 'quorum must be a positive integer');
      }
      if (approval_threshold !== undefined && (approval_threshold < 0 || approval_threshold > 1)) {
        return jsonError(res, 400, 'approval_threshold must be between 0 and 1');
      }

      const row = {
        user_id: user.id,
        concilium_id: conciliumId,
        consensus_type: consensus_type || 'majority',
        quorum: quorum ?? 2,
        approval_threshold: approval_threshold ?? 0.50,
        split_decision_strategy: split_decision_strategy || 'chairman_decides',
        custom_rules: custom_rules || {},
        updated_at: new Date().toISOString(),
      };

      // Upsert: insert or update on conflict
      const { data, error } = await admin
        .from('concilium_consensus_rules')
        .upsert(row, { onConflict: 'concilium_id' })
        .select('*')
        .single();
      endTimer('consensus:upsert');
      if (error) return handleApiError(res, error, 'consensus:upsert');
      log.info('Consensus rules updated', { boardId: conciliumId, userId: user.id, type: data.consensus_type });
      return res.status(200).json({ rules: data });
    }

    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    return handleApiError(res, err, 'consensus');
  }
}
