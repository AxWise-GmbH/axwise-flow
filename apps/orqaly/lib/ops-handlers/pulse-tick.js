/**
 * Pulse tick HTTP endpoint.
 *
 * Called every minute by Supabase pg_cron (via pg_net) hitting
 *   /api/ops?path=pulse-tick
 * with `Authorization: Bearer <PULSE_SECRET>`. Reads enabled pulses,
 * fires each due one, records the run.
 */
import { jsonError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { createLogger } from '../../api/_lib/logger.js';
import { tick } from '../pulses/tick.js';

const log = createLogger('ops.pulse-tick');

export default async function pulseTick(req, res) {
  const auth = req.headers?.authorization || '';
  const expected = `Bearer ${process.env.PULSE_SECRET || 'dev-secret'}`;
  if (auth !== expected) {
    log.warn(req, 'pulse.tick.unauthorized');
    return jsonError(res, 401, 'Unauthorized');
  }
  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');
  try {
    const result = await tick(admin, { req });
    return res.status(200).json(result);
  } catch (err) {
    log.error(req, 'pulse.tick.failed', err);
    return jsonError(res, 500, err?.message || 'pulse tick failed');
  }
}
