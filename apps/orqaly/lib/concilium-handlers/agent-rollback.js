/**
 * Agent Rollback: restore data to pre-agent-write state.
 *
 * POST /api/concilium?path=agent-rollback&change_id=xxx
 * Restores previous_state from agent_change_log to the target table.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { checkRateLimit, applyRateLimitHeaders, getRateLimitIdentifier } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('agent-rollback');

// Map entity_type to Supabase table name
const ENTITY_TABLE_MAP = {
  partner: 'partners',
  injection_material: 'injection_materials',
};

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
    const rl = checkRateLimit({ key: rlKey, limit: 10, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    const endTimer = log.startTimer();

    // ── GET: list changes ───────────────────────────────────────
    if (req.method === 'GET') {
      const agentId = req.query?.agent_id;
      let query = admin.from('agent_change_log').select('*').eq('user_id', user.id);
      if (agentId) query = query.eq('agent_id', agentId);
      if (req.query?.rolled_back === 'false') query = query.eq('rolled_back', false);

      const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
      endTimer('rollback:list');
      if (error) return handleApiError(res, error, 'rollback:list');
      return res.status(200).json({ changes: data || [] });
    }

    // ── POST: execute rollback ──────────────────────────────────
    if (req.method === 'POST') {
      const changeId = req.query?.change_id;
      if (!changeId) return jsonError(res, 400, 'change_id query param required');

      // Load change record
      const { data: change, error: fetchErr } = await admin
        .from('agent_change_log')
        .select('*')
        .eq('id', changeId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchErr) return handleApiError(res, fetchErr, 'rollback:fetch');
      if (!change) return jsonError(res, 404, 'Change record not found');
      if (change.rolled_back) return jsonError(res, 400, 'Change already rolled back');

      // Determine target table
      const tableName = ENTITY_TABLE_MAP[change.entity_type];
      if (!tableName) {
        return jsonError(res, 400, `Unknown entity type: ${change.entity_type}`);
      }

      // Restore previous state
      const previousState = change.previous_state;
      if (!previousState || typeof previousState !== 'object') {
        return jsonError(res, 400, 'Invalid previous state');
      }

      // Remove fields that shouldn't be in the update
      const restoreData = { ...previousState };
      delete restoreData.id;
      delete restoreData.created_at;
      delete restoreData.user_id;

      const { data: restored, error: restoreErr } = await admin
        .from(tableName)
        .update(restoreData)
        .eq('id', change.entity_id)
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (restoreErr) return handleApiError(res, restoreErr, 'rollback:restore');

      // Mark change as rolled back
      await admin.from('agent_change_log')
        .update({ rolled_back: true, rolled_back_at: new Date().toISOString() })
        .eq('id', changeId);

      // Audit log
      await admin.from('audit_log').insert({
        action: 'Agent change rolled back',
        entity: change.entity_type,
        entity_id: change.entity_id,
        user_id: user.id,
        user_email: '',
        details: JSON.stringify({
          v: 2,
          summary: `Rolled back ${change.tool_id} on ${change.entity_type} ${change.entity_id}`,
          change_id: changeId,
          agent_id: change.agent_id,
        }),
        actor_type: 'user',
      }).then(null, () => {});

      endTimer('rollback:execute');
      log.info('Rollback executed', { changeId, entityType: change.entity_type, entityId: change.entity_id });

      return res.status(200).json({
        rolled_back: true,
        change_id: changeId,
        entity_type: change.entity_type,
        entity_id: change.entity_id,
        restored_data: restored,
      });
    }

    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    return handleApiError(res, err, 'agent-rollback');
  }
}
