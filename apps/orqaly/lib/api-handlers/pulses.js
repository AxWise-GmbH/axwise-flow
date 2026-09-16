/**
 * [module: api-gateway]
 * Pulses HTTP surface — user-authenticated pulse actions.
 *
 * Routes (via query param `op`):
 *   POST ?op=fire-now  body { pulseId } — fire a pulse immediately
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { fireOne } from '../pulses/tick.js';

export default async function pulses(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'POST only');

  const token = getBearerToken(req);
  const user = token ? await verifySupabaseToken(token) : null;
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const rlKey = `pulses:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');

  const op = (req.query?.op || '').trim();

  try {
    if (op !== 'fire-now') return jsonError(res, 400, `Invalid op: ${op}`);

    const pulseId = String(req.body?.pulseId || '').trim();
    if (!pulseId) return jsonError(res, 400, 'pulseId is required');

    const { data: pulse, error: fetchErr } = await admin
      .from('agent_pulses')
      .select('*')
      .eq('id', pulseId)
      .eq('user_id', user.id)
      .single();

    if (fetchErr || !pulse) return jsonError(res, 404, 'Pulse not found');

    const result = await fireOne(admin, pulse, { req });
    const goalIds = result?.outcome?.goalIds || [];

    return res.status(200).json({
      status: result.status,
      goalIds,
      outcome: result.outcome || null,
      error: result.error || null,
    });
  } catch (err) {
    return handleApiError(res, err, 'pulses-api');
  }
}
