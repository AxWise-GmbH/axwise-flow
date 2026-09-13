/**
 * Manual healer trigger — lets the UI or ops force a single goal through
 * the self-healer immediately instead of waiting for the next cron tick.
 *
 * Route: GET /api/agent?path=heal-goal&id=<goalId>
 * Auth:  goal owner's Supabase JWT
 */
import { cors } from '../../api/_lib/cors.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { createLogger } from '../../api/_lib/logger.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { healGoal } from '../goal-handlers/self-healer.js';

const log = createLogger('heal-goal');

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonError(res, 405, 'Method not allowed');
  }

  const token = getBearerToken(req);
  if (!token) return jsonError(res, 401, 'Missing token');

  const user = await verifySupabaseToken(token);
  if (!user?.id) return jsonError(res, 401, 'Invalid token');

  const goalId = req.query?.id;
  if (!goalId) return jsonError(res, 400, 'id is required');

  try {
    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Supabase not configured');

    // Verify ownership
    const { data: goal, error } = await admin
      .from('goals')
      .select('*')
      .eq('id', goalId)
      .eq('user_id', user.id)
      .single();

    if (error || !goal) return jsonError(res, 404, 'Goal not found');

    const result = await healGoal(admin, goal, { req });
    log.info(req, 'heal-goal.done', { goalId, strategy: result.strategy, action: result.action });
    return res.status(200).json(result);
  } catch (err) {
    return handleApiError(res, err, 'heal-goal');
  }
}
