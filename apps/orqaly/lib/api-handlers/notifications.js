/**
 * Notifications HTTP surface for the in-app bell, the Web Push subscribe
 * flow, and digest/list reads. The fan-out itself lives in
 * `lib/notifications/dispatch.js` and is invoked from backend hot paths
 * (loop spawn, chain pause, auto-pivot, KPI alerts).
 *
 * Routes (via query param `op`):
 *   GET  ?op=list&since=ISO          — recent notifications for the user
 *   POST ?op=mark-read&id=<uuid>     — mark a single notification read
 *   POST ?op=mark-all-read           — mark every notification read
 *   POST ?op=push-subscribe          — body { endpoint, keys: { p256dh, auth } }
 *   POST ?op=push-unsubscribe        — body { endpoint }
 *   GET  ?op=vapid-public-key        — VAPID public key (publishable)
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('notifications-api');

async function handleList(admin, userId, query) {
  const since = query?.since ? new Date(query.since).toISOString() : null;
  let q = admin.from('notifications')
    .select('id, event_type, payload, priority, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (since) q = q.gte('created_at', since);
  const { data, error } = await q;
  if (error) throw error;
  return { status: 200, data: data || [] };
}

async function handleMarkRead(admin, userId, query) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };
  const { error } = await admin.from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) return { status: 500, error: error.message };
  return { status: 200, data: { id } };
}

async function handleMarkAllRead(admin, userId) {
  const { error } = await admin.from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) return { status: 500, error: error.message };
  return { status: 200, data: { ok: true } };
}

async function handlePushSubscribe(admin, userId, body, req) {
  const endpoint = String(body?.endpoint || '').trim();
  const keys = body?.keys || {};
  if (!endpoint) return { status: 400, error: 'endpoint is required' };
  if (!keys?.p256dh || !keys?.auth) return { status: 400, error: 'keys.p256dh and keys.auth are required' };

  const userAgent = req?.headers?.['user-agent'] || null;
  // Upsert on (user_id, endpoint). Same browser, second call → no duplicate row.
  const { error } = await admin
    .from('push_subscriptions')
    .upsert({ user_id: userId, endpoint, keys, user_agent: userAgent }, { onConflict: 'user_id,endpoint' });
  if (error) {
    log.warn(req, 'push.subscribe.failed', { error: error.message });
    return { status: 500, error: error.message };
  }
  return { status: 200, data: { ok: true } };
}

async function handlePushUnsubscribe(admin, userId, body) {
  const endpoint = String(body?.endpoint || '').trim();
  if (!endpoint) return { status: 400, error: 'endpoint is required' };
  const { error } = await admin.from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint);
  if (error) return { status: 500, error: error.message };
  return { status: 200, data: { ok: true } };
}

function handleVapidPublicKey() {
  // Safe to expose — this is the public half of the VAPID keypair. The
  // frontend uses it to register the subscription. Returns empty when
  // Web Push isn't configured, so the UI can hide the enable button.
  const key = process.env.VAPID_PUBLIC_KEY || '';
  return { status: 200, data: { key } };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const rlKey = `notifications:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');

  const op = (req.query?.op || '').trim();

  try {
    let result;
    switch (op) {
      case 'list':
        result = await handleList(admin, user.id, req.query);
        break;
      case 'mark-read':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleMarkRead(admin, user.id, req.query);
        break;
      case 'mark-all-read':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleMarkAllRead(admin, user.id);
        break;
      case 'push-subscribe':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handlePushSubscribe(admin, user.id, req.body || {}, req);
        break;
      case 'push-unsubscribe':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handlePushUnsubscribe(admin, user.id, req.body || {});
        break;
      case 'vapid-public-key':
        result = handleVapidPublicKey();
        break;
      default:
        return jsonError(res, 400, `Invalid op: ${op}`);
    }

    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, 'notifications-api');
  }
}
