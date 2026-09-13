/**
 * Knowledge Base source connections: CRUD + sync-now + test.
 *
 * GET    /api/app?path=kb-connections                          -> { connections, capabilities }
 * POST   /api/app?path=kb-connections                          -> upsert { connection }
 * POST   /api/app?path=kb-connections&action=sync&id=<uuid>    -> run a download sync -> { synced }
 * POST   /api/app?path=kb-connections&action=test&id=<uuid>    -> { ok, method|error }
 * DELETE /api/app?path=kb-connections&id=<uuid>                -> { deleted: true }
 *
 * Sources: notion, obsidian, google-drive, dropbox, onedrive, mega. Each connects
 * by one of three methods recorded in credential_ref.kind - 'oauth', 'byok', or
 * 'none' (file import). Secrets are NEVER stored here: OAuth tokens live in
 * integration_credentials, BYOK keys / Mega creds in the vault (user_api_keys).
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
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { kbConnectionBodySchema } from '../../api/_lib/validate.js';
import { resolveConnectionAuth, BYOK_PROVIDER } from './_shared/kb-connection-auth.js';
import { runConnectionSync } from './_shared/kb-sync-dispatch.js';

const log = createLogger('kb-connections');

const VALID_SOURCES = new Set(['notion', 'obsidian', 'google-drive', 'dropbox', 'onedrive', 'mega']);
// Only Notion is federated-live today; everything else is download / import only.
const LIVE_CAPABLE = new Set(['notion']);

// Connection methods each source can offer (drives the UI precedence).
const SOURCE_METHODS = {
  notion: ['byok'],
  obsidian: ['import'],
  // Google Drive stays BYOK-token + import (no Google OAuth app required).
  'google-drive': ['byok', 'import'],
  dropbox: ['oauth', 'byok', 'import'],
  onedrive: ['oauth', 'byok', 'import'],
  mega: ['byok', 'import'],
};

// Env pairs that make the OAuth method "configured" (no dead Connect buttons).
const OAUTH_ENV = {
  dropbox: ['DROPBOX_CLIENT_ID', 'DROPBOX_CLIENT_SECRET'],
  onedrive: ['ONEDRIVE_CLIENT_ID', 'ONEDRIVE_CLIENT_SECRET'],
};
function oauthConfigured(source) {
  const envs = OAUTH_ENV[source];
  return Boolean(envs && envs.every((e) => process.env[e]));
}

async function loadConnection(admin, userId, id) {
  if (!id) return null;
  const { data } = await admin
    .from('kb_connections')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  return data || null;
}

/** { [source]: { methods, oauthConfigured, byokPresent, liveCapable } } for the UI. */
async function buildCapabilities(admin, userId) {
  const providers = Object.values(BYOK_PROVIDER);
  const { data: keys } = await admin
    .from('user_api_keys')
    .select('provider')
    .eq('user_id', userId)
    .eq('is_current', true)
    .in('provider', providers);
  const byok = new Set((keys || []).map((k) => k.provider));
  const caps = {};
  for (const s of VALID_SOURCES) {
    caps[s] = {
      methods: SOURCE_METHODS[s] || [],
      oauthConfigured: oauthConfigured(s),
      byokPresent: byok.has(BYOK_PROVIDER[s]),
      liveCapable: LIVE_CAPABLE.has(s),
    };
  }
  return caps;
}

async function recordSyncState(admin, userId, id, patch) {
  await admin
    .from('kb_connections')
    .update({ last_synced_at: new Date().toISOString(), ...patch })
    .eq('id', id)
    .eq('user_id', userId)
    .then(null, () => {});
}

export default async function handler(req, res) {
  cors(res, req);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const user = await verifySupabaseToken(getBearerToken(req));
    if (!user) return jsonError(res, 401, 'Unauthorized');

    const isWrite = req.method !== 'GET';
    const rl = checkRateLimit({
      key: `kb-connections:${isWrite ? 'w' : 'r'}:${getRateLimitIdentifier(req, user.id)}`,
      limit: isWrite ? 20 : 60,
      windowMs: 60_000,
    });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    // ── list ────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { data, error } = await admin
        .from('kb_connections')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_current', true)
        .order('created_at', { ascending: true });
      if (error) return handleApiError(res, error, 'kb-connections:list');
      const capabilities = await buildCapabilities(admin, user.id);
      return res.status(200).json({ connections: data || [], capabilities });
    }

    // ── delete ──────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const id = req.query?.id;
      if (!id) return jsonError(res, 400, 'id required');
      const { error } = await admin
        .from('kb_connections')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) return handleApiError(res, error, 'kb-connections:delete');
      return res.status(200).json({ deleted: true });
    }

    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

    const action = req.query?.action || req.body?.action;
    const body = typeof req.body === 'object' && req.body ? req.body : {};

    // ── sync now (download) ─────────────────────────────────────────────
    if (action === 'sync') {
      const conn = await loadConnection(admin, user.id, req.query?.id);
      if (!conn) return jsonError(res, 404, 'Connection not found');
      try {
        const count = await runConnectionSync({ admin, userId: user.id, conn });
        await recordSyncState(admin, user.id, conn.id, {
          last_sync_ok: true,
          last_sync_error: null,
          docs_synced_count: count,
        });
        log.info(req, 'kb-connection.synced', { source: conn.source_type, count });
        return res.status(200).json({ synced: count });
      } catch (err) {
        // A 4xx (import-only / missing credential) is a user-config issue, not a
        // failed pull - don't stamp last_sync_error for those.
        const status = err?.status || 500;
        if (status >= 500) {
          await recordSyncState(admin, user.id, conn.id, {
            last_sync_ok: false,
            last_sync_error: String(err?.message || err).slice(0, 500),
          });
        }
        return jsonError(res, status, err?.message || 'Sync failed');
      }
    }

    // ── test ────────────────────────────────────────────────────────────
    if (action === 'test') {
      const conn = await loadConnection(admin, user.id, req.query?.id);
      if (!conn) return jsonError(res, 404, 'Connection not found');
      if (conn.source_type === 'obsidian') return res.status(200).json({ ok: true, method: 'import' });
      try {
        const auth = await resolveConnectionAuth({ admin, userId: user.id, conn });
        return res.status(200).json({ ok: true, method: auth.method });
      } catch (err) {
        return res.status(200).json({ ok: false, error: err?.message || 'Not connected' });
      }
    }

    // ── upsert (save) ───────────────────────────────────────────────────
    const parsed = kbConnectionBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(res, 400, parsed.error.issues?.[0]?.message || 'Invalid connection payload');
    }
    const source_type = parsed.data.source_type;
    if (!VALID_SOURCES.has(source_type)) return jsonError(res, 400, 'Invalid source_type');
    const slot = parsed.data.slot || 'primary';
    const mode = parsed.data.mode === 'live' ? 'live' : 'sync';
    if (mode === 'live' && !LIVE_CAPABLE.has(source_type)) {
      return jsonError(res, 400, `${source_type} does not support live mode (download or import only).`);
    }

    // Default the credential pointer when the client didn't specify one.
    let credentialRef =
      parsed.data.credential_ref && Object.keys(parsed.data.credential_ref).length
        ? parsed.data.credential_ref
        : null;
    if (!credentialRef) {
      credentialRef =
        source_type === 'obsidian'
          ? { kind: 'none' }
          : { kind: 'byok', provider: BYOK_PROVIDER[source_type] };
    }

    const patch = {
      label: parsed.data.label ?? null,
      mode,
      enabled: parsed.data.enabled !== false,
      scope: parsed.data.scope && typeof parsed.data.scope === 'object' ? parsed.data.scope : {},
      credential_ref: credentialRef,
    };
    if (parsed.data.sync_interval_secs !== undefined) {
      patch.sync_interval_secs = parsed.data.sync_interval_secs
        ? Number(parsed.data.sync_interval_secs)
        : null;
    }

    const existing = (
      await admin
        .from('kb_connections')
        .select('id')
        .eq('user_id', user.id)
        .eq('source_type', source_type)
        .eq('slot', slot)
        .eq('is_current', true)
        .maybeSingle()
    ).data;

    let connection;
    if (existing) {
      const { data, error } = await admin
        .from('kb_connections')
        .update(patch)
        .eq('id', existing.id)
        .eq('user_id', user.id)
        .select('*')
        .single();
      if (error) return handleApiError(res, error, 'kb-connections:update');
      connection = data;
    } else {
      const { data, error } = await admin
        .from('kb_connections')
        .insert({ user_id: user.id, source_type, slot, ...patch })
        .select('*')
        .single();
      if (error) return handleApiError(res, error, 'kb-connections:create');
      connection = data;
    }
    return res.status(200).json({ connection });
  } catch (err) {
    return handleApiError(res, err, 'kb-connections');
  }
}
