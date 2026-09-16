/**
 * Multiple AI assistants per user, each scoped to an organization.
 *
 * GET  /api/app?path=assistants
 *      -> { assistants: [...], currentId }
 * POST /api/app?path=assistants   body: { action, ... }
 *      action 'create' { organizationId?, name? }       -> new current assistant
 *      action 'switch' { id }                            -> make `id` current
 *      action 'save'   { id, config?, steps?, activated? } (partial; merged)
 *      action 'rename' { id, name }
 *      action 'delete' { id }                            -> remove; promote another
 *
 * RLS on `assistants` scopes rows to the owner; we also filter by user.id in
 * code. Exactly one assistant per user is current (DB partial unique index).
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseUserClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('assistants');

const SELECT_COLS = 'id, organization_id, name, config, steps, activated, is_current, updated_at';

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toAssistant(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id || null,
    name: row.name || 'My Assistant',
    config: row.config || {},
    steps: row.steps || {},
    activated: Boolean(row.activated),
    isCurrent: Boolean(row.is_current),
    updatedAt: row.updated_at || null,
  };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const done = log.startTimer(req, 'request', { method: req.method });

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  const isWrite = req.method === 'POST';
  const rl = checkRateLimit({
    key: `assistants:${isWrite ? 'w' : 'r'}:${getRateLimitIdentifier(req, user.id)}`,
    limit: isWrite ? 30 : 120,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  const userClient = buildSupabaseUserClient(token);
  if (!userClient) {
    done({ status: 500 });
    return jsonError(res, 500, 'Server not configured');
  }

  try {
    if (req.method === 'GET') return await handleList(req, res, userClient, user, done);
    if (req.method === 'POST') return await handleWrite(req, res, userClient, user, done);
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'assistants');
  }
}

async function listAll(userClient, user) {
  const { data, error } = await userClient
    .from('assistants')
    .select(SELECT_COLS)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(toAssistant);
}

function respondList(res, assistants, done, status = 200) {
  const current = assistants.find((a) => a.isCurrent) || assistants[0] || null;
  done({ status });
  return res.status(status).json({ assistants, currentId: current ? current.id : null });
}

async function handleList(req, res, userClient, user, done) {
  const assistants = await listAll(userClient, user);
  return respondList(res, assistants, done);
}

/** Clear is_current on all of a user's assistants (so a new one can be set). */
async function clearCurrent(userClient, user) {
  const { error } = await userClient
    .from('assistants')
    .update({ is_current: false })
    .eq('user_id', user.id)
    .eq('is_current', true);
  if (error) throw error;
}

async function handleWrite(req, res, userClient, user, done) {
  const body = isPlainObject(req.body) ? req.body : {};
  const action = body.action;

  if (action === 'create') {
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : 'My Assistant';
    const organizationId = typeof body.organizationId === 'string' && body.organizationId ? body.organizationId : null;
    await clearCurrent(userClient, user);
    const { data, error } = await userClient
      .from('assistants')
      .insert({ user_id: user.id, organization_id: organizationId, name, is_current: true })
      .select(SELECT_COLS)
      .single();
    if (error) throw error;
    const assistants = await listAll(userClient, user);
    done({ status: 201, created: data.id });
    return res.status(201).json({ assistant: toAssistant(data), assistants, currentId: data.id });
  }

  if (action === 'switch') {
    if (!body.id) return jsonError(res, 400, 'id is required');
    await clearCurrent(userClient, user);
    const { error } = await userClient
      .from('assistants')
      .update({ is_current: true })
      .eq('user_id', user.id)
      .eq('id', body.id);
    if (error) throw error;
    const assistants = await listAll(userClient, user);
    return respondList(res, assistants, done);
  }

  if (action === 'rename') {
    if (!body.id) return jsonError(res, 400, 'id is required');
    if (typeof body.name !== 'string' || !body.name.trim()) return jsonError(res, 400, 'name is required');
    const { error } = await userClient
      .from('assistants')
      .update({ name: body.name.trim().slice(0, 120) })
      .eq('user_id', user.id)
      .eq('id', body.id);
    if (error) throw error;
    const assistants = await listAll(userClient, user);
    return respondList(res, assistants, done);
  }

  if (action === 'save') {
    if (!body.id) return jsonError(res, 400, 'id is required');
    if (body.config !== undefined && !isPlainObject(body.config)) return jsonError(res, 400, 'config must be an object');
    if (body.steps !== undefined && !isPlainObject(body.steps)) return jsonError(res, 400, 'steps must be an object');
    if (body.activated !== undefined && typeof body.activated !== 'boolean') return jsonError(res, 400, 'activated must be a boolean');

    // Merge so partial saves don't clobber prior config/steps.
    const { data: existing, error: readErr } = await userClient
      .from('assistants')
      .select('config, steps, activated')
      .eq('user_id', user.id)
      .eq('id', body.id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!existing) return jsonError(res, 404, 'Assistant not found');

    const patch = {
      config: { ...(existing.config || {}), ...(body.config || {}) },
      steps: { ...(existing.steps || {}), ...(body.steps || {}) },
      activated: body.activated !== undefined ? body.activated : Boolean(existing.activated),
    };
    if (body.organizationId !== undefined) {
      patch.organization_id = typeof body.organizationId === 'string' && body.organizationId ? body.organizationId : null;
    }
    const { data, error } = await userClient
      .from('assistants')
      .update(patch)
      .eq('user_id', user.id)
      .eq('id', body.id)
      .select(SELECT_COLS)
      .single();
    if (error) throw error;
    done({ status: 200 });
    return res.status(200).json({ assistant: toAssistant(data) });
  }

  if (action === 'delete') {
    if (!body.id) return jsonError(res, 400, 'id is required');
    const { data: removed, error } = await userClient
      .from('assistants')
      .delete()
      .eq('user_id', user.id)
      .eq('id', body.id)
      .select('is_current')
      .maybeSingle();
    if (error) throw error;
    // If the deleted one was current, promote the most recent remaining row.
    let assistants = await listAll(userClient, user);
    if (removed?.is_current && assistants.length && !assistants.some((a) => a.isCurrent)) {
      const promote = assistants[assistants.length - 1];
      await userClient.from('assistants').update({ is_current: true }).eq('user_id', user.id).eq('id', promote.id);
      assistants = await listAll(userClient, user);
    }
    return respondList(res, assistants, done);
  }

  done({ status: 400 });
  return jsonError(res, 400, 'Unknown action');
}
