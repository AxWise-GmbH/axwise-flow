/**
 * Agent Profiles handler — CRUD for the agent_profiles table.
 * Routes: get, list, upsert, delete, seed
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('agent-profiles');

/* ── Get single profile by agent_id ─────────────────────────────────────── */
async function handleGet(admin, user, query) {
  const { agent_id } = query;
  if (!agent_id) return { status: 400, error: 'agent_id is required' };

  const { data, error } = await admin
    .from('agent_profiles')
    .select('*')
    .eq('agent_id', agent_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { status: 404, error: 'Profile not found' };
  return { status: 200, data };
}

/* ── List all profiles for the authenticated user ───────────────────────── */
async function handleList(admin, user, query) {
  let q = admin
    .from('agent_profiles')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (query?.search) q = q.ilike('display_name', `%${query.search}%`);

  const { data, error } = await q;
  if (error) throw error;
  return { status: 200, data: data || [] };
}

/* ── Upsert a profile ───────────────────────────────────────────────────── */
async function handleUpsert(admin, user, body) {
  const { agent_id } = body;
  if (!agent_id) return { status: 400, error: 'agent_id is required' };

  const row = {
    ...body,
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from('agent_profiles')
    .upsert(row, { onConflict: 'agent_id,user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return { status: 200, data };
}

/* ── Delete a profile by id ─────────────────────────────────────────────── */
async function handleDelete(admin, user, query) {
  const { id } = query;
  if (!id) return { status: 400, error: 'id is required' };

  const { error } = await admin
    .from('agent_profiles')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw error;
  return { status: 200, data: { deleted: true } };
}

/* ── Seed profiles (idempotent bulk insert) ─────────────────────────────── */
async function handleSeed(admin, user, body) {
  const { profiles } = body;
  if (!Array.isArray(profiles) || profiles.length === 0) return { status: 400, error: 'profiles array is required' };

  let inserted = 0;
  for (const profile of profiles) {
    if (!profile.agent_id) { log.warn('seed-skip', { reason: 'missing agent_id' }); continue; }

    // Check if profile already exists for this agent + user
    const { data: existing } = await admin
      .from('agent_profiles')
      .select('id')
      .eq('agent_id', profile.agent_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) continue;

    const { error } = await admin.from('agent_profiles').insert({
      ...profile,
      user_id: user.id,
      updated_at: new Date().toISOString(),
    });
    if (error) { log.warn('seed-skip', { agent_id: profile.agent_id, error: error.message }); continue; }
    inserted++;
  }

  return { status: 200, data: { seeded: inserted, total: profiles.length } };
}

/* ── Main handler ────────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const rl = checkRateLimit({ key: getRateLimitIdentifier(req, user), limit: 60, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded');

  const admin = buildSupabaseAdminClient();
  const op = req.query?.op;
  const body = req.body || {};

  try {
    let result;
    switch (op) {
      case 'get':
        result = await handleGet(admin, user, req.query);
        break;
      case 'list':
        result = await handleList(admin, user, req.query);
        break;
      case 'upsert':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleUpsert(admin, user, body);
        break;
      case 'delete':
        if (req.method !== 'DELETE') return jsonError(res, 405, 'DELETE only');
        result = await handleDelete(admin, user, req.query);
        break;
      case 'seed':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleSeed(admin, user, body);
        break;
      default:
        return jsonError(res, 400, 'Invalid op');
    }
    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, 'agent-profiles');
  }
}
