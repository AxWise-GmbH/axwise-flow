/**
 * Business-modules handler — DB-backed ready-business activation.
 *
 * Replaces the old localStorage-only activation so a user's active ready
 * businesses persist server-side and sync across devices. User-scoped.
 *
 * Routes (via query param `op`):
 *   GET  ?op=list                     — active-module rows for the user
 *   POST ?op=activate                 — body { module_id }
 *   POST ?op=deactivate               — body { module_id }
 *   POST ?op=toggle                   — body { module_id }  (flip active)
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { createLogger } from '../../api/_lib/logger.js';
import { businessModuleToggleSchema } from '../../api/_lib/validate.js';

const log = createLogger('business-modules');

async function handleList(admin, userId) {
  const { data, error } = await admin
    .from('user_business_modules')
    .select('module_id, active')
    .eq('user_id', userId);
  if (error) throw error;
  return { status: 200, data: data || [] };
}

async function setActive(admin, userId, body, active) {
  const parsed = businessModuleToggleSchema.safeParse(body || {});
  if (!parsed.success) return { status: 400, error: parsed.error.issues[0]?.message || 'Invalid module_id' };
  const moduleId = parsed.data.module_id;
  const { data, error } = await admin
    .from('user_business_modules')
    .upsert(
      { user_id: userId, module_id: moduleId, active, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,module_id' }
    )
    .select('module_id, active')
    .single();
  if (error) return { status: 500, error: error.message };
  return { status: 200, data };
}

async function handleToggle(admin, userId, body) {
  const parsed = businessModuleToggleSchema.safeParse(body || {});
  if (!parsed.success) return { status: 400, error: parsed.error.issues[0]?.message || 'Invalid module_id' };
  const moduleId = parsed.data.module_id;
  const { data: existing } = await admin
    .from('user_business_modules')
    .select('active')
    .eq('user_id', userId)
    .eq('module_id', moduleId)
    .maybeSingle();
  const next = existing ? !existing.active : true;
  return setActive(admin, userId, body, next);
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const rlKey = `business-modules:${getRateLimitIdentifier(req, user.id)}`;
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
        result = await handleList(admin, user.id);
        break;
      case 'activate':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await setActive(admin, user.id, req.body || {}, true);
        break;
      case 'deactivate':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await setActive(admin, user.id, req.body || {}, false);
        break;
      case 'toggle':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleToggle(admin, user.id, req.body || {});
        break;
      default:
        return jsonError(res, 400, `Invalid op: ${op}`);
    }
    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, 'business-modules');
  }
}
