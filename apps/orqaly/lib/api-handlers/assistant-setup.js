/**
 * Unified AI Assistant setup state — load + save the single per-user row.
 *
 * GET  /api/app?path=assistant-setup  -> { setup: { config, steps, activated } | null }
 * POST /api/app?path=assistant-setup  -> { setup: { config, steps, activated } }
 *     body: { config?: object, steps?: object, activated?: boolean }  (partial; merged)
 *
 * Replaces the two localStorage flags the old dialogs used. RLS on
 * assistant_setup scopes rows to the user; we also filter by user.id in code.
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

const log = createLogger('assistant-setup');

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Shape a DB row (or null) into the client-facing setup object. */
function toSetup(row) {
  if (!row) return null;
  return {
    config: row.config || {},
    steps: row.steps || {},
    activated: Boolean(row.activated),
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
    key: `assistant-setup:${isWrite ? 'w' : 'r'}:${getRateLimitIdentifier(req, user.id)}`,
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
    if (req.method === 'GET') return await handleLoad(req, res, userClient, user, done);
    if (req.method === 'POST') return await handleSave(req, res, userClient, user, done);
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'assistant-setup');
  }
}

async function handleLoad(req, res, userClient, user, done) {
  const { data, error } = await userClient
    .from('assistant_setup')
    .select('config, steps, activated, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    log.warn(req, 'load.db_error', { err: error.message });
    done({ status: 500 });
    return jsonError(res, 500, 'Failed to load assistant setup');
  }

  done({ status: 200, found: Boolean(data) });
  return res.status(200).json({ setup: toSetup(data) });
}

async function handleSave(req, res, userClient, user, done) {
  const body = isPlainObject(req.body) ? req.body : {};

  if (body.config !== undefined && !isPlainObject(body.config)) {
    done({ status: 400 });
    return jsonError(res, 400, 'config must be an object');
  }
  if (body.steps !== undefined && !isPlainObject(body.steps)) {
    done({ status: 400 });
    return jsonError(res, 400, 'steps must be an object');
  }
  if (body.activated !== undefined && typeof body.activated !== 'boolean') {
    done({ status: 400 });
    return jsonError(res, 400, 'activated must be a boolean');
  }

  // Load current row so config/steps are MERGED (partial saves don't clobber
  // previously-completed steps or other config keys).
  const { data: existing, error: readErr } = await userClient
    .from('assistant_setup')
    .select('config, steps, activated')
    .eq('user_id', user.id)
    .maybeSingle();

  if (readErr) {
    log.warn(req, 'save.read_error', { err: readErr.message });
    done({ status: 500 });
    return jsonError(res, 500, 'Failed to save assistant setup');
  }

  const merged = {
    user_id: user.id,
    config: { ...(existing?.config || {}), ...(body.config || {}) },
    steps: { ...(existing?.steps || {}), ...(body.steps || {}) },
    activated: body.activated !== undefined ? body.activated : Boolean(existing?.activated),
  };

  const { data, error } = await userClient
    .from('assistant_setup')
    .upsert(merged, { onConflict: 'user_id' })
    .select('config, steps, activated, updated_at')
    .single();

  if (error) {
    log.warn(req, 'save.db_error', { err: error.message });
    done({ status: 500 });
    return jsonError(res, 500, 'Failed to save assistant setup');
  }

  done({ status: 200 });
  return res.status(200).json({ setup: toSetup(data) });
}
