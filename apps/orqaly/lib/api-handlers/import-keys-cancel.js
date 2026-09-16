/**
 * Cancel a pending import. Marks `key_imports.status = 'cancelled'` and
 * drops the in-memory pending plaintext cache. Does NOT delete storage
 * immediately — retention cron handles that.
 *
 * POST /api/app?path=import-keys-cancel
 * Body: { importId }
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError } from '../../api/_lib/errors.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { dropPending } from './import-keys-preview.js';

const log = createLogger('import-keys-cancel');

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const done = log.startTimer(req, 'request');

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) { done({ status: 401 }); return jsonError(res, 401, 'Unauthorized'); }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return jsonError(res, 400, 'Invalid JSON'); }
  }

  const { importId } = body || {};
  if (!importId) return jsonError(res, 400, 'importId required');

  const admin = buildSupabaseAdminClient();
  if (!admin) { done({ status: 500 }); return jsonError(res, 500, 'Admin client unavailable'); }

  const { error } = await admin
    .from('key_imports')
    .update({ status: 'cancelled' })
    .eq('id', importId)
    .eq('user_id', user.id);

  if (error) {
    done({ status: 500 });
    return jsonError(res, 500, 'Failed to cancel');
  }

  dropPending(importId);
  done({ status: 200 });
  return res.status(200).json({ success: true });
}
