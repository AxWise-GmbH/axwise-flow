/**
 * User setup prefs - default LLM preset, workspace logo, setup-completed flag,
 * UI mode, hidden sidebar pages, and the AxWise kill switch.
 *
 * GET /api/app?path=user-prefs -> { defaultLlmPreset, workspaceLogoUrl, setupCompletedAt, uiMode, hiddenPages, axwise }
 * PUT /api/app?path=user-prefs  -> partial update of any of those fields
 *
 * Backed by columns on public.users (migrations 148, 149, 177, 181).
 *
 * The returned `axwise` block mixes two sources: serverEnabled/enforce are env
 * (global, read-only here), userEnabled is the per-account axwise_enabled column
 * this handler owns. See docs/axwise-integration.md.
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
import {
  isAxwiseEnabled,
  axwiseEnforcement,
  clearAxwiseUserFlagCache,
} from '../integrations/axwise/index.js';

const log = createLogger('user-prefs');

const ALLOWED_PRESETS = new Set(['cheapest', 'smartest', 'fastest']);
const ALLOWED_UI_MODES = new Set(['simple', 'advanced']);
const MAX_URL_LEN = 2048;
const MAX_HIDDEN_PAGES = 100;
const MAX_PAGE_PATH_LEN = 128;

// Hidden pages must be an array of route strings ("/campaigns", ...).
function isValidHiddenPages(v) {
  if (!Array.isArray(v) || v.length > MAX_HIDDEN_PAGES) return false;
  return v.every(
    (p) => typeof p === 'string' && p.startsWith('/') && p.length <= MAX_PAGE_PATH_LEN
  );
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

  const isWrite = req.method === 'PUT' || req.method === 'POST';
  const rl = checkRateLimit({
    key: `user-prefs:${isWrite ? 'w' : 'r'}:${getRateLimitIdentifier(req, user.id)}`,
    limit: isWrite ? 20 : 60,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  const userClient = buildSupabaseUserClient(token);

  try {
    if (req.method === 'GET') return await handleGet(req, res, userClient, user, done);
    if (req.method === 'PUT' || req.method === 'POST') return await handlePut(req, res, userClient, user, done);
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'user-prefs');
  }
}

async function handleGet(req, res, userClient, user, done) {
  const { data, error } = await userClient
    .from('users')
    .select('default_llm_preset, workspace_logo_url, setup_completed_at, ui_mode, hidden_pages, axwise_enabled')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    log.warn(req, 'get.db_error', { err: error.message });
    done({ status: 500 });
    return jsonError(res, 500, 'Failed to load prefs');
  }

  done({ status: 200 });
  return res.status(200).json({
    defaultLlmPreset: data?.default_llm_preset || null,
    workspaceLogoUrl: data?.workspace_logo_url || null,
    setupCompletedAt: data?.setup_completed_at || null,
    uiMode: data?.ui_mode || 'simple',
    hiddenPages: Array.isArray(data?.hidden_pages) ? data.hidden_pages : [],
    // AxWise capability + kill switch. serverEnabled = env AXWISE_ENABLE (hard
    // global gate, not a DB column). userEnabled = per-account axwise_enabled
    // column (default true). Effective on = serverEnabled && userEnabled.
    axwise: {
      serverEnabled: isAxwiseEnabled(),
      userEnabled: data?.axwise_enabled !== false,
      enforce: axwiseEnforcement(),
    },
  });
}

async function handlePut(req, res, userClient, user, done) {
  const body = req.body || {};
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, 'defaultLlmPreset')) {
    const v = body.defaultLlmPreset;
    if (v !== null && !ALLOWED_PRESETS.has(v)) {
      done({ status: 400 });
      return jsonError(res, 400, 'defaultLlmPreset must be cheapest|smartest|fastest or null');
    }
    patch.default_llm_preset = v;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'workspaceLogoUrl')) {
    const v = body.workspaceLogoUrl;
    if (v !== null && (typeof v !== 'string' || v.length > MAX_URL_LEN)) {
      done({ status: 400 });
      return jsonError(res, 400, 'workspaceLogoUrl must be string ≤ 2048 chars or null');
    }
    patch.workspace_logo_url = v;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'setupCompleted') && body.setupCompleted === true) {
    patch.setup_completed_at = new Date().toISOString();
  }

  if (Object.prototype.hasOwnProperty.call(body, 'uiMode')) {
    const v = body.uiMode;
    if (v !== null && !ALLOWED_UI_MODES.has(v)) {
      done({ status: 400 });
      return jsonError(res, 400, 'uiMode must be simple|advanced or null');
    }
    patch.ui_mode = v;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'hiddenPages')) {
    const v = body.hiddenPages;
    if (!isValidHiddenPages(v)) {
      done({ status: 400 });
      return jsonError(
        res,
        400,
        `hiddenPages must be an array of ≤ ${MAX_HIDDEN_PAGES} route strings`
      );
    }
    patch.hidden_pages = v;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'axwiseEnabled')) {
    const v = body.axwiseEnabled;
    if (typeof v !== 'boolean') {
      done({ status: 400 });
      return jsonError(res, 400, 'axwiseEnabled must be a boolean');
    }
    patch.axwise_enabled = v;
  }

  if (Object.keys(patch).length === 0) {
    done({ status: 400 });
    return jsonError(res, 400, 'Empty patch');
  }

  const { data, error } = await userClient
    .from('users')
    .update(patch)
    .eq('id', user.id)
    .select('default_llm_preset, workspace_logo_url, setup_completed_at, ui_mode, hidden_pages, axwise_enabled')
    .maybeSingle();

  if (error) {
    log.warn(req, 'put.db_error', { err: error.message });
    done({ status: 500 });
    return jsonError(res, 500, 'Failed to save prefs');
  }

  // The kill switch is cached per serverless instance; evict ours so at least
  // this instance honours the new value immediately. Other instances age out on
  // their own TTL.
  if (Object.prototype.hasOwnProperty.call(patch, 'axwise_enabled')) {
    clearAxwiseUserFlagCache(user.id);
  }

  done({ status: 200 });
  return res.status(200).json({
    defaultLlmPreset: data?.default_llm_preset || null,
    workspaceLogoUrl: data?.workspace_logo_url || null,
    setupCompletedAt: data?.setup_completed_at || null,
    uiMode: data?.ui_mode || 'simple',
    hiddenPages: Array.isArray(data?.hidden_pages) ? data.hidden_pages : [],
    // AxWise capability + kill switch. serverEnabled = env AXWISE_ENABLE (hard
    // global gate, not a DB column). userEnabled = per-account axwise_enabled
    // column (default true). Effective on = serverEnabled && userEnabled.
    axwise: {
      serverEnabled: isAxwiseEnabled(),
      userEnabled: data?.axwise_enabled !== false,
      enforce: axwiseEnforcement(),
    },
  });
}
