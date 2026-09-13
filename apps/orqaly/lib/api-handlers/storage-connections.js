/**
 * Storage connections CRUD — list, create, test, delete.
 *
 * GET    /api/app?path=storage-connections                       -> { connections: [metadata only] }
 * POST   /api/app?path=storage-connections                       -> { id, kind, slot, label, lastTestOk }
 * POST   /api/app?path=storage-connections&action=test&id=<uuid> -> { ok, error?, testedAt }
 * DELETE /api/app?path=storage-connections&id=<uuid>             -> { ok }
 *
 * Credentials are NEVER returned on GET. The wizard always runs a probe
 * upload BEFORE the row is committed, so a saved row already has a passing
 * test result.
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
  saveStorageConnection,
  deleteStorageConnection,
  recordConnectionTest,
  readStorageConnection,
} from '../security/storage-connections.js';
import { probeUserConnection, invalidateClientCache } from '../storage/backends/supabase.js';
import { probeUserConnection as probeS3Connection } from '../storage/backends/s3.js';

const log = createLogger('storage-connections');

const VALID_KINDS = new Set(['supabase', 's3', 'r2', 'gcs']);

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
  const rlKey = `storage-connections:${isWrite ? 'w' : 'r'}:${getRateLimitIdentifier(req, user.id)}`;
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
    if (req.method === 'GET')    return await handleList(req, res, userClient, user, done);
    if (req.method === 'POST') {
      const action = req.query?.action || req.body?.action;
      if (action === 'test') return await handleTest(req, res, user, done);
      return await handleCreate(req, res, user, done);
    }
    if (req.method === 'DELETE') return await handleDelete(req, res, user, done);
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'storage-connections');
  }
}

async function handleList(req, res, userClient, user, done) {
  const { data, error } = await userClient
    .from('user_storage_connections')
    .select('id, kind, slot, label, metadata, last_tested_at, last_test_ok, last_test_error, created_at, updated_at')
    .eq('user_id', user.id)
    .eq('is_current', true)
    .order('created_at', { ascending: false });

  if (error) {
    log.warn(req, 'list.db_error', { err: error.message });
    done({ status: 500 });
    return jsonError(res, 500, 'Failed to load connections');
  }

  done({ status: 200, count: data?.length || 0 });
  return res.status(200).json({
    connections: (data || []).map((row) => ({
      id: row.id,
      kind: row.kind,
      slot: row.slot,
      label: row.label,
      metadata: row.metadata,
      lastTestedAt: row.last_tested_at,
      lastTestOk: row.last_test_ok,
      lastTestError: row.last_test_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
}

async function handleCreate(req, res, user, done) {
  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  const kind = String(body.kind || '').toLowerCase();
  const slot = body.slot ? String(body.slot) : 'primary';
  const label = body.label ? String(body.label).slice(0, 100) : null;
  const metadata = (typeof body.metadata === 'object' && body.metadata) ? body.metadata : {};
  const credential = body.credential;

  if (!VALID_KINDS.has(kind)) {
    done({ status: 400 });
    return jsonError(res, 400, `kind must be one of ${[...VALID_KINDS].join(', ')}`);
  }
  if (typeof credential !== 'string' || credential.length === 0) {
    done({ status: 400 });
    return jsonError(res, 400, 'credential (JSON string with backend creds) required');
  }

  // Probe BEFORE committing the row so a wrong key doesn't get persisted as
  // a "current" connection. Probe runs a tiny upload + delete against the
  // user's stated bucket to validate end-to-end access.
  if (kind === 'supabase' || kind === 's3') {
    const probeFn = kind === 's3' ? probeS3Connection : probeUserConnection;
    const probe = await probeFn({ credential, metadata });
    if (!probe.ok) {
      done({ status: 400, probeFailed: true });
      return jsonError(res, 400, `Connection probe failed: ${probe.error || 'unknown error'}`);
    }
  }
  // (r2/gcs probes added when those backends are implemented)

  let saved;
  try {
    saved = await saveStorageConnection({
      userId: user.id,
      kind,
      slot,
      label,
      metadata,
      credential,
    });
  } catch (err) {
    log.warn(req, 'create.failed', { err: err.message });
    done({ status: 500 });
    return jsonError(res, 500, err.message);
  }

  // Record the successful probe as the initial test state. This means
  // resolveCurrentConnection will trust the connection on the first goal.
  await recordConnectionTest(saved.id, { ok: true });
  invalidateClientCache(); // force re-resolve on next upload

  done({ status: 201, connectionId: saved.id });
  return res.status(201).json({
    id: saved.id,
    kind: saved.kind,
    slot: saved.slot,
    label: saved.label,
    metadata: saved.metadata,
    lastTestOk: true,
  });
}

async function handleTest(req, res, user, done) {
  const id = req.query?.id || req.body?.id;
  if (!id) {
    done({ status: 400 });
    return jsonError(res, 400, 'id query param or body field required');
  }

  let conn;
  try {
    conn = await readStorageConnection(id, user.id);
  } catch (err) {
    if (err.message === 'STORAGE_CONN_NOT_FOUND') {
      done({ status: 404 });
      return jsonError(res, 404, 'Connection not found');
    }
    if (err.message === 'STORAGE_CONN_OWNER_MISMATCH') {
      done({ status: 403 });
      return jsonError(res, 403, 'Forbidden');
    }
    log.warn(req, 'test.read_failed', { err: err.message });
    done({ status: 500 });
    return jsonError(res, 500, err.message);
  }

  let probe;
  if (conn.kind === 'supabase') {
    probe = await probeUserConnection({ credential: conn.credential, metadata: conn.metadata });
  } else if (conn.kind === 's3') {
    probe = await probeS3Connection({ credential: conn.credential, metadata: conn.metadata });
  } else {
    probe = { ok: false, error: `${conn.kind} probe not yet implemented` };
  }
  await recordConnectionTest(id, probe);

  done({ status: 200, probeOk: probe.ok });
  return res.status(200).json({
    ok: probe.ok,
    error: probe.error || null,
    testedAt: new Date().toISOString(),
  });
}

async function handleDelete(req, res, user, done) {
  const id = req.query?.id || req.body?.id;
  if (!id) {
    done({ status: 400 });
    return jsonError(res, 400, 'id query param required');
  }

  try {
    await deleteStorageConnection(id, user.id);
  } catch (err) {
    if (err.message === 'STORAGE_CONN_NOT_FOUND') {
      done({ status: 404 });
      return jsonError(res, 404, 'Connection not found');
    }
    if (err.message === 'STORAGE_CONN_OWNER_MISMATCH') {
      done({ status: 403 });
      return jsonError(res, 403, 'Forbidden');
    }
    log.warn(req, 'delete.failed', { err: err.message });
    done({ status: 500 });
    return jsonError(res, 500, err.message);
  }
  invalidateClientCache();

  done({ status: 200 });
  return res.status(200).json({ ok: true });
}
