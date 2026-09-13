/**
 * User API keys CRUD — list, create/replace, soft-delete.
 *
 * GET    /api/app?path=user-api-keys                 -> { keys: [...metadata only] }
 * POST   /api/app?path=user-api-keys                 -> { id, provider, slot, maskedPreview, tail }
 * DELETE /api/app?path=user-api-keys&id=<uuid>       -> { ok }
 *
 * Plaintext is NEVER returned on GET. On POST only a last-4 tail is echoed.
 */
import { cors } from '../../api/_lib/cors.js';
import { isDeepStrictEqual } from 'node:util';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import {
  buildSupabaseAdminClient,
  buildSupabaseUserClient,
} from '../../api/_lib/supabase-server.js';
import { invalidateResolveCache } from '../security/resolve-user-key.js';
import { saveUserApiKey } from './_shared/save-user-api-key.js';
import {
  finalizeToolCredentialDelete,
  loadToolCredentialSnapshot,
  releaseToolCredentialWrite,
  reserveToolCredentialWrite,
  toolIdFromCredentialProvider,
} from './_shared/tool-credential-write-reservation.js';

const log = createLogger('user-api-keys');

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

  const isWrite = req.method === 'POST' || req.method === 'DELETE';
  const rlKey = `user-api-keys:${isWrite ? 'w' : 'r'}:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({
    key: rlKey,
    limit: isWrite ? 10 : 60,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  const userClient = buildSupabaseUserClient(token);

  try {
    if (req.method === 'GET') return await handleList(req, res, userClient, user, done);
    if (req.method === 'POST') return await handleUpsert(req, res, userClient, user, done);
    if (req.method === 'DELETE') return await handleDelete(req, res, userClient, user, done);
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'user-api-keys');
  }
}

async function handleList(req, res, userClient, user, done) {
  const { data, error } = await userClient
    .from('user_api_keys')
    .select(
      'id, provider, slot, label, masked_preview, last_tested_at, last_test_ok, last_test_error, created_at, updated_at'
    )
    .eq('user_id', user.id)
    .eq('is_current', true);

  if (error) {
    log.warn(req, 'list.db_error', { err: error.message });
    done({ status: 500 });
    return jsonError(res, 500, 'Failed to load keys');
  }

  const keys = (data || []).map((row) => ({
    id: row.id,
    provider: row.provider,
    slot: row.slot,
    label: row.label,
    maskedPreview: row.masked_preview,
    lastTestedAt: row.last_tested_at,
    lastTestOk: row.last_test_ok,
    lastTestError: row.last_test_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  done({ status: 200, count: keys.length });
  return res.status(200).json({ keys });
}

const SERVER_FAIL_CODES = new Set([
  'NO_ADMIN',
  'ENCRYPT_FAILED',
  'VAULT_PUT_FAILED',
  'INSERT_FAILED',
]);
function classifyFailure(code) {
  return SERVER_FAIL_CODES.has(code) ? 500 : 400;
}

const KEY_TIMESTAMP_FIELDS = ['superseded_at', 'last_tested_at', 'created_at', 'updated_at'];

function canonicalKeySnapshot(row, { ignoreUpdatedAt = false } = {}) {
  if (!row) return null;
  const snapshot = { ...row };
  if (ignoreUpdatedAt) delete snapshot.updated_at;
  for (const field of KEY_TIMESTAMP_FIELDS) {
    if (ignoreUpdatedAt && field === 'updated_at') continue;
    if (snapshot[field] == null) {
      snapshot[field] = null;
      continue;
    }
    const parsed = Date.parse(snapshot[field]);
    snapshot[field] = Number.isFinite(parsed) ? parsed : snapshot[field];
  }
  return snapshot;
}

function sameKeySnapshot(current, expected, options) {
  return isDeepStrictEqual(
    canonicalKeySnapshot(current, options),
    canonicalKeySnapshot(expected, options)
  );
}

async function inspectKeyDeletion(admin, { original, deletedAt }) {
  try {
    const { data: current, error } = await admin
      .from('user_api_keys')
      .select('*')
      .eq('id', original.id)
      .eq('user_id', original.user_id)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!current) return { state: 'conflict' };

    const expectedDeleted = {
      ...original,
      is_current: false,
      superseded_at: deletedAt,
    };
    if (sameKeySnapshot(current, expectedDeleted, { ignoreUpdatedAt: true })) {
      return { state: 'committed', row: current };
    }
    if (sameKeySnapshot(current, original)) return { state: 'original', row: current };
    return { state: 'conflict', row: current };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function softDeleteKeyExact(admin, { original, deletedAt }) {
  const updateExact = async () => {
    try {
      return await admin
        .from('user_api_keys')
        .update({ is_current: false, superseded_at: deletedAt })
        .eq('id', original.id)
        .eq('user_id', original.user_id)
        .eq('provider', original.provider)
        .eq('slot', original.slot)
        .eq('is_current', true)
        .eq('vault_secret_id', original.vault_secret_id)
        .eq('updated_at', original.updated_at)
        .select('*')
        .maybeSingle();
    } catch (error) {
      return { data: null, error };
    }
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await updateExact();
    if (!response.error) {
      if (!response.data) return { state: 'stale' };
      const expected = { ...original, is_current: false, superseded_at: deletedAt };
      return sameKeySnapshot(response.data, expected, { ignoreUpdatedAt: true })
        ? { state: 'committed', row: response.data }
        : { state: 'conflict', row: response.data };
    }

    const inspection = await inspectKeyDeletion(admin, { original, deletedAt });
    if (inspection.state !== 'original' || attempt === 1) return inspection;
  }

  return { state: 'unknown' };
}

async function handleUpsert(req, res, userClient, user, done) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return jsonError(res, 400, 'Invalid JSON');
    }
  }

  const provider = body?.provider;
  const toolId = toolIdFromCredentialProvider(provider);
  let adminClient = null;
  let toolCredentialReservation = null;
  if (toolId) {
    adminClient = buildSupabaseAdminClient();
    if (!adminClient) {
      done({ status: 503, code: 'NO_ADMIN' });
      return jsonError(res, 503, 'Encrypted credential storage unavailable');
    }
    const loaded = await loadToolCredentialSnapshot({
      admin: adminClient,
      userId: user.id,
      toolId,
    });
    if (!loaded.ok) {
      done({ status: loaded.status || 503, code: loaded.code });
      return jsonError(res, loaded.status || 503, loaded.message);
    }
    const reserved = await reserveToolCredentialWrite({
      admin: adminClient,
      userId: user.id,
      toolSnapshot: loaded.snapshot,
      source: 'user-api-keys',
    });
    if (!reserved.ok) {
      done({ status: reserved.status || 503, code: reserved.code });
      return jsonError(res, reserved.status || 503, reserved.message);
    }
    toolCredentialReservation = reserved.reservation;
  }

  const result = await saveUserApiKey({
    userId: user.id,
    provider,
    slot: body?.slot || 'default',
    label: body?.label || null,
    apiKey: body?.apiKey,
    skipProbe: !!body?.skipProbe,
    adminClient,
    toolCredentialReservation,
  });

  if (!result.success) {
    const statusCode =
      result.status === 409
        ? 409
        : result.status >= 500
          ? result.status
          : classifyFailure(result.code);
    done({ status: statusCode, code: result.code });
    return res.status(statusCode).json({
      success: false,
      error: result.message,
      code: result.code,
      status: result.status || null,
    });
  }

  done({ status: 200, provider: result.row.provider });
  return res.status(200).json({ success: true, ...result.row });
}

async function handleDelete(req, res, userClient, user, done) {
  const id = (req.query?.id || '').trim();
  if (!id) return jsonError(res, 400, 'Missing id');

  const { data: row, error: loadErr } = await userClient
    .from('user_api_keys')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (loadErr) {
    done({ status: 500 });
    return jsonError(res, 500, 'Failed to load key');
  }
  if (!row) {
    done({ status: 404 });
    return jsonError(res, 404, 'Not found');
  }

  if (!row.is_current) {
    done({ status: 200, id, idempotent: true });
    return res.status(200).json({ success: true });
  }

  // All metadata mutation crosses the service boundary. Migration 217 removes
  // direct authenticated INSERT/UPDATE/DELETE grants while retaining owner
  // SELECT, so callers cannot bypass response-loss classification or tool
  // coordination with a direct Supabase write.
  const admin = buildSupabaseAdminClient();
  if (!admin) {
    done({ status: 503, code: 'NO_ADMIN' });
    return jsonError(res, 503, 'Encrypted credential storage unavailable');
  }

  const toolId = toolIdFromCredentialProvider(row.provider);
  let toolReservation = null;
  if (toolId) {
    const loaded = await loadToolCredentialSnapshot({
      admin,
      userId: user.id,
      toolId,
    });
    if (!loaded.ok) {
      done({ status: loaded.status || 503, code: loaded.code });
      return jsonError(res, loaded.status || 503, loaded.message);
    }
    const reserved = await reserveToolCredentialWrite({
      admin,
      userId: user.id,
      toolSnapshot: loaded.snapshot,
      source: 'user-api-keys-delete',
    });
    if (!reserved.ok) {
      done({ status: reserved.status || 503, code: reserved.code });
      return jsonError(res, reserved.status || 503, reserved.message);
    }
    toolReservation = reserved.reservation;
  }

  const deletedAt = new Date().toISOString();
  const deletion = await softDeleteKeyExact(admin, { original: row, deletedAt });
  if (deletion.state !== 'committed') {
    if (toolReservation && ['original', 'stale'].includes(deletion.state)) {
      const released = await releaseToolCredentialWrite({ admin, reservation: toolReservation });
      if (!released.ok) {
        done({ status: 503, code: released.code });
        return jsonError(res, 503, released.message);
      }
    }

    if (deletion.state === 'stale') {
      done({ status: 409, code: 'KEY_DELETE_STALE' });
      return jsonError(res, 409, 'Key changed before deletion. Refresh and retry.');
    }
    if (deletion.state === 'original') {
      done({ status: 503, code: 'KEY_DELETE_FAILED' });
      return jsonError(res, 503, 'Key deletion could not be committed. Retry safely.');
    }
    // Conflict/unknown retains the exact tool marker. Releasing it could allow
    // a browser writer to cross an ambiguously committed credential deletion.
    done({ status: 503, code: 'KEY_DELETE_RECONCILIATION_REQUIRED' });
    return jsonError(res, 503, 'Key deletion needs reconciliation. Refresh before retrying.');
  }

  if (toolReservation) {
    let remaining;
    try {
      const { data, error } = await admin
        .from('user_api_keys')
        .select('id')
        .eq('user_id', user.id)
        .eq('provider', row.provider)
        .eq('is_current', true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      remaining = data || null;
    } catch (error) {
      log.error?.(req, 'delete.remaining-key-state-unknown', {
        id,
        provider: row.provider,
        error: error.message,
      });
      done({ status: 503, code: 'KEY_DELETE_RECONCILIATION_REQUIRED' });
      return jsonError(res, 503, 'Deleted key needs tool-state reconciliation.');
    }

    const finalized = await finalizeToolCredentialDelete({
      admin,
      reservation: toolReservation,
      hasRemainingCredential: Boolean(remaining),
    });
    if (!finalized.ok) {
      done({ status: 503, code: finalized.code });
      return jsonError(res, 503, finalized.message);
    }
  }

  invalidateResolveCache(user.id, row.provider, row.slot);
  done({ status: 200, id });
  return res.status(200).json({ success: true });
}
