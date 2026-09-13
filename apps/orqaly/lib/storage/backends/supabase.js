/**
 * Supabase Storage backend for the StorageWriter abstraction.
 *
 * Two modes:
 *  - Platform-default: uses the project's own Supabase admin client (built
 *    via api/_lib/supabase-server.js → SUPABASE_SERVICE_ROLE_KEY).
 *  - User-connected (BYOS): builds a separate Supabase client pointing at the
 *    user's own project URL + service-role key (resolved + decrypted by
 *    lib/security/storage-connections.js).
 *
 * Both modes share the same upload / signedUrl / delete methods so the rest
 * of the codebase doesn't care which one is in use.
 */
import { createClient } from '@supabase/supabase-js';
import { buildSupabaseAdminClient } from '../../../api/_lib/supabase-server.js';
import { createLogger } from '../../../api/_lib/logger.js';

const log = createLogger('storage-backend-supabase');

// Lazy-built client cache keyed by URL so we don't create a new client on
// every upload. Cleared on connection delete via invalidateClientCache().
const userClientCache = new Map(); // `${url}::${keyHash}` -> SupabaseClient

function buildUserClient(url, serviceRoleKey) {
  const cacheKey = `${url}::${serviceRoleKey.slice(-12)}`;
  if (userClientCache.has(cacheKey)) return userClientCache.get(cacheKey);
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  userClientCache.set(cacheKey, client);
  return client;
}

export function invalidateClientCache() {
  userClientCache.clear();
}

/**
 * Upload to Supabase Storage. Returns the public/signed URL and the bucket
 * the file landed in.
 *
 * @param {object} opts
 * @param {object} opts.client - Supabase client (admin or user-connected)
 * @param {string} opts.bucket
 * @param {string} opts.path - canonical path (validated upstream)
 * @param {Buffer|Blob|Uint8Array|string} opts.bytes
 * @param {string} [opts.mime]
 * @param {boolean} [opts.upsert=false]
 * @returns {Promise<{path: string, bucket: string, publicUrl: string|null}>}
 */
async function uploadVia(client, { bucket, path, bytes, mime, upsert = false }) {
  const { data, error } = await client.storage
    .from(bucket)
    .upload(path, bytes, {
      contentType: mime || 'application/octet-stream',
      upsert,
    });
  if (error) throw new Error(`SUPABASE_STORAGE_UPLOAD_FAILED: ${error.message || error}`);

  // Try to get a public URL — works only if the bucket is public. For
  // private buckets the caller should request a signed URL separately.
  let publicUrl = null;
  try {
    const { data: urlData } = client.storage.from(bucket).getPublicUrl(path);
    publicUrl = urlData?.publicUrl || null;
  } catch {
    // Some buckets don't have a public URL; that's fine.
  }
  return { path: data?.path || path, bucket, publicUrl };
}

async function signedUrlVia(client, { bucket, path, expiresIn = 3600 }) {
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) throw new Error(`SUPABASE_STORAGE_SIGN_FAILED: ${error.message || error}`);
  return data?.signedUrl || null;
}

async function deleteVia(client, { bucket, path }) {
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) throw new Error(`SUPABASE_STORAGE_DELETE_FAILED: ${error.message || error}`);
}

/**
 * Platform-default backend. Uses your own Supabase admin client and the
 * conventional bucket from connection metadata (or 'goal-deliverables' if
 * none specified).
 */
export const platformDefault = {
  kind: 'supabase',
  isPlatformDefault: true,

  resolve() {
    const admin = buildSupabaseAdminClient();
    if (!admin) throw new Error('STORAGE_BACKEND_UNAVAILABLE: missing SUPABASE_SERVICE_ROLE_KEY');
    return { client: admin, bucket: 'goal-deliverables' };
  },

  async upload({ bucket, path, bytes, mime, upsert }) {
    const { client, bucket: defaultBucket } = this.resolve();
    return uploadVia(client, { bucket: bucket || defaultBucket, path, bytes, mime, upsert });
  },
  async signedUrl({ bucket, path, expiresIn }) {
    const { client, bucket: defaultBucket } = this.resolve();
    return signedUrlVia(client, { bucket: bucket || defaultBucket, path, expiresIn });
  },
  async delete({ bucket, path }) {
    const { client, bucket: defaultBucket } = this.resolve();
    return deleteVia(client, { bucket: bucket || defaultBucket, path });
  },
};

/**
 * Build a user-connected backend from a decrypted credential blob.
 * Credential format for kind=supabase:
 *   JSON.stringify({ url, serviceRoleKey, bucket?: 'goal-deliverables' })
 */
export function userConnectedBackend({ connectionId, credential, metadata }) {
  let parsed;
  try {
    parsed = JSON.parse(credential);
  } catch {
    throw new Error('STORAGE_CREDENTIAL_INVALID: expected JSON {url, serviceRoleKey, bucket?}');
  }
  const { url, serviceRoleKey } = parsed;
  if (!url || !serviceRoleKey) {
    throw new Error('STORAGE_CREDENTIAL_INVALID: url + serviceRoleKey required');
  }
  const bucket = parsed.bucket || metadata?.bucket || 'goal-deliverables';
  const client = buildUserClient(url, serviceRoleKey);

  return {
    kind: 'supabase',
    isPlatformDefault: false,
    connectionId,
    bucket,
    async upload({ bucket: b, path, bytes, mime, upsert }) {
      return uploadVia(client, { bucket: b || bucket, path, bytes, mime, upsert });
    },
    async signedUrl({ bucket: b, path, expiresIn }) {
      return signedUrlVia(client, { bucket: b || bucket, path, expiresIn });
    },
    async delete({ bucket: b, path }) {
      return deleteVia(client, { bucket: b || bucket, path });
    },
  };
}

/**
 * Probe a user-connected backend with a small test upload. Used by the
 * Settings wizard before saving a connection AND on demand later.
 * Always cleans up the probe file even on success.
 */
export async function probeUserConnection({ credential, metadata }) {
  const backend = userConnectedBackend({ connectionId: 'probe', credential, metadata });
  const probePath = `_tmp/probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const probeBytes = Buffer.from('orchestratori-storage-probe');
  try {
    await backend.upload({ path: probePath, bytes: probeBytes, mime: 'text/plain', upsert: true });
    // Verify we can also delete (catches read-only service-role keys).
    await backend.delete({ path: probePath });
    return { ok: true };
  } catch (err) {
    // Best-effort cleanup if upload succeeded but delete didn't.
    try { await backend.delete({ path: probePath }); } catch { /* ignore */ }
    log.warn(null, 'storage-backend.probe_failed', { err: err.message });
    return { ok: false, error: err.message };
  }
}
