/**
 * Ratings handler — unified stars + optional comment for agents and skills.
 *
 * Routes:
 *   POST op=submit           { target_type: 'agent'|'skill', target_id, stars, comment? }
 *   GET  op=mine             target_type, target_id
 *   GET  op=aggregate        target_type, target_id     -> { avg, count }
 *   GET  op=aggregate-bulk   target_type, ids (comma-separated, max 100)
 *
 * Agent ratings persist in `agent_ratings` (067 migration).
 * Skill ratings persist in `marketplace_ratings` with item_type='skill' (085).
 * Skills denormalize avg+count onto `agent_skill_packs` via migration 113.
 *
 * On every successful submit, an `audit_log` row is written with
 * action='rating.submitted' so the Activity tab surfaces it.
 *
 * Access control:
 *   - agent: any authenticated user may rate any agent.
 *   - skill: user must have the skill installed on ≥1 of their agents.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('ratings');

const MAX_COMMENT = 280;

function validateSubmit(body) {
  const { target_type, target_id, stars, comment } = body || {};
  if (!['agent', 'skill'].includes(target_type)) return 'target_type must be agent or skill';
  if (!target_id) return 'target_id is required';
  const n = Number(stars);
  if (!Number.isFinite(n) || n < 1 || n > 5 || !Number.isInteger(n)) return 'stars must be an integer 1..5';
  if (comment != null) {
    if (typeof comment !== 'string') return 'comment must be a string';
    if (comment.length > MAX_COMMENT) return `comment exceeds ${MAX_COMMENT} chars`;
  }
  return null;
}

async function userHasSkillInstalled(admin, userId, skillId) {
  const { data, error } = await admin
    .from('agent_installed_skills')
    .select('id')
    .eq('user_id', userId)
    .eq('skill_id', skillId)
    .limit(1);
  if (error) { log.warn('install-check-failed', { error: error.message }); return false; }
  return Array.isArray(data) && data.length > 0;
}

async function recomputeSkillAggregate(admin, skillId) {
  const { data } = await admin
    .from('marketplace_ratings')
    .select('rating')
    .eq('item_type', 'skill')
    .eq('item_id', skillId);
  if (!data) return;
  const count = data.length;
  const avg = count ? Math.round((data.reduce((s, r) => s + (Number(r.rating) || 0), 0) / count) * 100) / 100 : 0;
  await admin
    .from('agent_skill_packs')
    .update({ rating_avg: avg, rating_count: count })
    .eq('id', skillId);
}

async function logRating(admin, user, { target_type, target_id, stars, comment, previous_stars }) {
  try {
    await admin.from('audit_log').insert({
      action: 'rating.submitted',
      entity: target_type,
      entity_id: String(target_id),
      user_id: user.id,
      user_email: user.email || null,
      details: JSON.stringify({ stars, previous_stars: previous_stars ?? null, has_comment: Boolean(comment) }),
      actor_type: 'user',
    });
  } catch (e) {
    log.warn('audit-log.insert.failed', { error: e.message });
  }
}

async function handleSubmit(admin, user, body) {
  const err = validateSubmit(body);
  if (err) return { status: 400, error: err };
  const { target_type, target_id, stars, comment } = body;

  if (target_type === 'skill') {
    const allowed = await userHasSkillInstalled(admin, user.id, target_id);
    if (!allowed) return { status: 403, error: 'Install the skill on an agent before rating.' };
  }

  // Capture previous rating for audit delta
  let previous_stars = null;
  if (target_type === 'agent') {
    const { data: prev } = await admin.from('agent_ratings')
      .select('rating').eq('user_id', user.id).eq('agent_id', target_id)
      .maybeSingle();
    previous_stars = prev?.rating ?? null;

    const { error: upErr } = await admin.from('agent_ratings').upsert(
      { user_id: user.id, agent_id: target_id, rating: stars, comment: comment || null, rating_type: 'individual' },
      { onConflict: 'user_id,agent_id' },
    );
    if (upErr) throw upErr;
  } else {
    const { data: prev } = await admin.from('marketplace_ratings')
      .select('rating').eq('user_id', user.id).eq('item_id', target_id).eq('item_type', 'skill')
      .maybeSingle();
    previous_stars = prev?.rating ?? null;

    const { error: upErr } = await admin.from('marketplace_ratings').upsert(
      { user_id: user.id, item_id: target_id, item_type: 'skill', rating: stars, comment: comment || null },
      { onConflict: 'user_id,item_id,item_type' },
    );
    if (upErr) throw upErr;

    await recomputeSkillAggregate(admin, target_id);
  }

  await logRating(admin, user, { target_type, target_id, stars, comment, previous_stars });

  const agg = await aggregateFor(admin, target_type, target_id);
  return { status: 200, data: { ok: true, ...agg } };
}

async function aggregateFor(admin, target_type, target_id) {
  if (target_type === 'agent') {
    const { data } = await admin.from('agent_ratings')
      .select('rating').eq('agent_id', target_id);
    const count = data?.length || 0;
    const avg = count ? Math.round((data.reduce((s, r) => s + (Number(r.rating) || 0), 0) / count) * 100) / 100 : 0;
    return { avg, count };
  }
  const { data } = await admin.from('marketplace_ratings')
    .select('rating').eq('item_type', 'skill').eq('item_id', target_id);
  const count = data?.length || 0;
  const avg = count ? Math.round((data.reduce((s, r) => s + (Number(r.rating) || 0), 0) / count) * 100) / 100 : 0;
  return { avg, count };
}

async function handleAggregate(admin, query) {
  const { target_type, target_id } = query || {};
  if (!['agent', 'skill'].includes(target_type)) return { status: 400, error: 'target_type must be agent or skill' };
  if (!target_id) return { status: 400, error: 'target_id is required' };
  const agg = await aggregateFor(admin, target_type, target_id);
  return { status: 200, data: agg };
}

async function handleAggregateBulk(admin, query) {
  const { target_type } = query || {};
  const idsRaw = query?.ids || '';
  if (target_type !== 'skill' && target_type !== 'agent') {
    return { status: 400, error: 'target_type must be agent or skill' };
  }
  const ids = String(idsRaw).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
  if (!ids.length) return { status: 200, data: {} };

  let rows = [];
  if (target_type === 'agent') {
    const { data } = await admin.from('agent_ratings').select('agent_id, rating').in('agent_id', ids);
    rows = (data || []).map((r) => ({ id: r.agent_id, rating: r.rating }));
  } else {
    const { data } = await admin.from('marketplace_ratings')
      .select('item_id, rating').eq('item_type', 'skill').in('item_id', ids);
    rows = (data || []).map((r) => ({ id: r.item_id, rating: r.rating }));
  }
  const map = {};
  for (const row of rows) {
    const k = String(row.id);
    if (!map[k]) map[k] = { sum: 0, count: 0 };
    map[k].sum += Number(row.rating) || 0;
    map[k].count += 1;
  }
  const out = {};
  for (const k of Object.keys(map)) {
    out[k] = { avg: Math.round((map[k].sum / map[k].count) * 100) / 100, count: map[k].count };
  }
  return { status: 200, data: out };
}

async function handleMine(admin, user, query) {
  const { target_type, target_id } = query || {};
  if (!['agent', 'skill'].includes(target_type)) return { status: 400, error: 'target_type must be agent or skill' };
  if (!target_id) return { status: 400, error: 'target_id is required' };

  if (target_type === 'agent') {
    const { data } = await admin.from('agent_ratings')
      .select('rating, comment, updated_at').eq('user_id', user.id).eq('agent_id', target_id)
      .maybeSingle();
    return { status: 200, data: data || null };
  }
  const { data } = await admin.from('marketplace_ratings')
    .select('rating, comment, updated_at').eq('user_id', user.id).eq('item_id', target_id).eq('item_type', 'skill')
    .maybeSingle();
  return { status: 200, data: data || null };
}

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
      case 'submit':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleSubmit(admin, user, body);
        break;
      case 'aggregate':
        result = await handleAggregate(admin, req.query);
        break;
      case 'aggregate-bulk':
        result = await handleAggregateBulk(admin, req.query);
        break;
      case 'mine':
        result = await handleMine(admin, user, req.query);
        break;
      default:
        return jsonError(res, 400, 'Invalid op');
    }
    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, 'ratings');
  }
}
