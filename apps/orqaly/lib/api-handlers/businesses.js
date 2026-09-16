/**
 * Businesses HTTP surface — Phase 6.
 *
 * Routes (via query param `op`):
 *   GET  ?op=list                       — list businesses for the user
 *   GET  ?op=get&id=<uuid>              — single business with rollups
 *   POST ?op=create                     — body { name, business_type, description, seed_goal_id }
 *   POST ?op=update&id=<uuid>           — body partial fields
 *   POST ?op=kill&id=<uuid>             — flip master_kill_switch on (pauses everything)
 *   POST ?op=unkill&id=<uuid>           — flip master_kill_switch off
 *   POST ?op=archive&id=<uuid>          — soft-archive
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('businesses');

async function handleList(admin, userId) {
  const { data, error } = await admin
    .from('businesses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return { status: 200, data: data || [] };
}

async function handleGet(admin, userId, query) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };
  const { data: biz } = await admin
    .from('businesses')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!biz) return { status: 404, error: 'Business not found' };

  // Roll-ups (parallel).
  const [goalsRes, pulsesRes, kpisRes, integrationsRes] = await Promise.all([
    admin.from('goals').select('id, title, status, spent_usd, loop_enabled, loop_paused, continuation_goal_id, loop_depth, goal_kind').eq('business_id', id).order('created_at', { ascending: true }),
    admin.from('agent_pulses').select('id, agent_role, action, enabled, trigger_type, last_fired_at').eq('business_id_fk', id),
    admin.from('goal_kpis').select('id, key, label, target, current, direction, unit, last_synced_at').eq('business_id_fk', id),
    admin.from('integration_credentials').select('id, provider, external_account_id, status, expires_at').eq('user_id', userId).contains('metadata', { business_id: id }),
  ]);

  const goals = goalsRes.data || [];
  const totalSpent = goals.reduce((acc, g) => acc + Number(g.spent_usd || 0), 0);

  return {
    status: 200,
    data: {
      ...biz,
      rollups: {
        goal_count: goals.length,
        total_spent_usd: totalSpent,
        chain_active: goals.some((g) => g.loop_enabled && !g.loop_paused),
      },
      goals,
      pulses: pulsesRes.data || [],
      kpis: kpisRes.data || [],
      integrations: integrationsRes.data || [],
    },
  };
}

async function handleCreate(admin, userId, body) {
  const name = String(body?.name || '').trim();
  if (!name) return { status: 400, error: 'name is required' };
  const { data, error } = await admin.from('businesses').insert({
    user_id: userId,
    name,
    business_type: body?.business_type || null,
    description: body?.description || null,
    seed_goal_id: body?.seed_goal_id || null,
    metadata: body?.metadata || {},
  }).select('*').single();
  if (error) return { status: 500, error: error.message };

  // Optionally back-link the seed goal.
  if (body?.seed_goal_id) {
    await admin.from('goals').update({ business_id: data.id }).eq('id', body.seed_goal_id).eq('user_id', userId);
  }
  return { status: 201, data };
}

async function handleUpdate(admin, userId, query, body) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };
  const patch = { updated_at: new Date().toISOString() };
  for (const k of ['name', 'description', 'business_type', 'metadata', 'status']) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  const { data, error } = await admin
    .from('businesses')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return { status: 500, error: error.message };
  return { status: 200, data };
}

async function handleKill(admin, userId, query, body, kill) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };
  const reason = String(body?.reason || (kill ? 'manual_kill' : 'manual_unkill')).slice(0, 240);

  // Flip the master kill switch on the business.
  const { data: biz, error } = await admin
    .from('businesses')
    .update({
      master_kill_switch: kill,
      killed_at: kill ? new Date().toISOString() : null,
      killed_reason: kill ? reason : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error || !biz) return { status: 500, error: error?.message || 'kill failed' };

  // Cascade: pause/unpause every loop chain on every goal in this business
  // AND every pulse. Single statement each so it's fast.
  await admin.from('goals')
    .update({ loop_paused: kill, loop_paused_reason: kill ? `business_kill:${reason}` : null })
    .eq('business_id', id)
    .eq('user_id', userId);
  await admin.from('agent_pulses')
    .update({ enabled: !kill })
    .eq('business_id_fk', id);

  // Audit record (uses goal_log for now since there's no audit table yet).
  await admin.from('goal_log').insert({
    goal_id: biz.seed_goal_id || biz.id,
    event_type: kill ? 'business_killed' : 'business_unkilled',
    details: { business_id: id, reason },
  });

  return { status: 200, data: biz };
}

async function handleArchive(admin, userId, query) {
  return handleUpdate(admin, userId, query, { status: 'archived' });
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const rlKey = `businesses:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
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
      case 'get':
        result = await handleGet(admin, user.id, req.query);
        break;
      case 'create':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleCreate(admin, user.id, req.body || {});
        break;
      case 'update':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleUpdate(admin, user.id, req.query, req.body || {});
        break;
      case 'kill':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleKill(admin, user.id, req.query, req.body || {}, true);
        break;
      case 'unkill':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleKill(admin, user.id, req.query, req.body || {}, false);
        break;
      case 'archive':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleArchive(admin, user.id, req.query);
        break;
      default:
        return jsonError(res, 400, `Invalid op: ${op}`);
    }
    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, 'businesses');
  }
}
