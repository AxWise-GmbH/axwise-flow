/**
 * StorageWriter — single entry point for all goal-artifact writes.
 *
 * Every place in the codebase that uploads a deliverable goes through this
 * module. It:
 *   1. Resolves the user's connected storage (BYOS) or falls back to platform
 *      default
 *   2. Validates the path is canonical (lib/storage/path.js)
 *   3. Uploads via the backend (lib/storage/backends/supabase.js)
 *   4. Records a row in `goal_artifacts` so the file is indexed
 *   5. Returns artifact metadata for the caller's response
 *
 * Why a single writer matters:
 *   - One audit trail (every write hits goal_artifacts)
 *   - One quota check (per-user storage cap)
 *   - One canonical layout (no more {timestamp}.png ad-hoc paths)
 *   - One BYOS resolution path (caller doesn't care if it's user or platform)
 *
 * Anything that bypasses StorageWriter and calls
 * `admin.storage.from(...).upload(...)` directly is a regression — Phase 5
 * adds a CI lint to catch this.
 */
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { resolveCurrentConnection } from '../security/storage-connections.js';
import { getStorageQuotaRemaining } from '../security/user-quotas.js';
import { pathFor, assertValidPath } from './path.js';
import { platformDefault, userConnectedBackend } from './backends/supabase.js';
import { createLogger } from '../../api/_lib/logger.js';
import { createHash } from 'node:crypto';

const log = createLogger('storage-writer');

/**
 * Resolve which backend a user's writes should go to. BYOS-connected users
 * get their own bucket; everyone else gets platform default.
 *
 * @returns {Promise<{backend: object, connectionId: string|null}>}
 */
export async function resolveBackend(userId) {
  if (userId) {
    const conn = await resolveCurrentConnection(userId, 'supabase');
    if (conn) {
      return {
        backend: userConnectedBackend({
          connectionId: conn.connectionId,
          credential: conn.credential,
          metadata: conn.metadata,
        }),
        connectionId: conn.connectionId,
      };
    }
  }
  return { backend: platformDefault, connectionId: null };
}

/**
 * Upload an artifact and record it in goal_artifacts.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.goalId
 * @param {string} [opts.taskId]
 * @param {string} opts.kind - one of pdf|image|html|deck|data|report|banner|video|audio|archive|other
 * @param {string} opts.filename
 * @param {Buffer|Uint8Array|string} opts.bytes
 * @param {string} [opts.mime]
 * @param {string} [opts.source] - which code path produced this (audit detail)
 * @param {boolean} [opts.upsert=false]
 * @returns {Promise<{
 *   artifactId: string,
 *   storagePath: string,
 *   storageBucket: string|null,
 *   publicUrl: string|null,
 *   bytes: number,
 *   connectionId: string|null,
 * }>}
 */
export async function upload({
  userId,
  goalId,
  taskId = null,
  kind,
  filename,
  bytes,
  mime = null,
  source = null,
  upsert = false,
}) {
  if (!userId || !goalId) {
    throw new Error('STORAGE_WRITER_INVALID: userId and goalId are required');
  }

  // Build + validate path. assertValidPath throws on regression.
  const storagePath = pathFor({ userId, goalId, kind, filename });
  assertValidPath(storagePath);

  // Normalize input to a Buffer so we can compute size + checksum reliably.
  const buf = Buffer.isBuffer(bytes)
    ? bytes
    : typeof bytes === 'string'
      ? Buffer.from(bytes, 'utf8')
      : Buffer.from(bytes);
  const sizeBytes = buf.length;

  // Quota check — only meaningful for platform-default storage. BYOS users
  // pay for their own bucket so we don't enforce against them.
  const { backend, connectionId } = await resolveBackend(userId);
  if (backend.isPlatformDefault) {
    const admin = buildSupabaseAdminClient();
    const remaining = await getStorageQuotaRemaining(admin, userId);
    if (sizeBytes > remaining) {
      throw new Error(
        `STORAGE_QUOTA_EXCEEDED: this upload (${humanBytes(sizeBytes)}) would exceed your platform-storage quota (${humanBytes(remaining)} remaining). Connect your own storage in Settings → BYOS to avoid this limit.`,
      );
    }
  }

  // Upload to backend.
  const uploadResult = await backend.upload({
    path: storagePath,
    bytes: buf,
    mime,
    upsert,
  });

  // Compute checksum after successful upload (pre-upload checksum on a
  // multi-GB buffer would burn CPU even on uploads that fail).
  const checksum = createHash('sha256').update(buf).digest('hex');

  // Record the artifact row. RLS enforces user_id == auth.uid() on user
  // clients, but service-role bypasses RLS so we set the user_id explicitly.
  const admin = buildSupabaseAdminClient();
  const { data: row, error } = await admin
    .from('goal_artifacts')
    .insert({
      goal_id: goalId,
      task_id: taskId,
      user_id: userId,
      storage_connection_id: connectionId,
      kind,
      storage_path: storagePath,
      storage_bucket: uploadResult.bucket || null,
      public_url: uploadResult.publicUrl || null,
      filename,
      bytes: sizeBytes,
      mime,
      checksum_sha256: checksum,
      source,
    })
    .select('id, storage_path, storage_bucket, public_url, bytes, storage_connection_id')
    .single();

  if (error) {
    // The file is in storage but the row failed — log loudly so we can
    // reconcile manually. Don't try to delete the file here: Phase 2
    // dual-write soak watches for exactly this drift.
    log.error(null, 'storage-writer.row_insert_failed', {
      userId, goalId, kind, storagePath, err: error.message,
    });
    throw new Error(`STORAGE_WRITER_RECORD_FAILED: ${error.message}`);
  }

  log.info(null, 'storage-writer.uploaded', {
    userId, goalId, kind, bytes: sizeBytes, connectionId, source,
  });

  return {
    artifactId: row.id,
    storagePath: row.storage_path,
    storageBucket: row.storage_bucket,
    publicUrl: row.public_url,
    bytes: row.bytes,
    connectionId: row.storage_connection_id,
  };
}

/**
 * Generate a fresh signed URL for an existing artifact. Used by the export
 * endpoint and any UI that needs a time-limited link to a private file.
 */
export async function signedUrl(artifactId, { expiresIn = 3600, expectedUserId = null } = {}) {
  const admin = buildSupabaseAdminClient();
  const { data: row, error } = await admin
    .from('goal_artifacts')
    .select('id, user_id, storage_connection_id, storage_path, storage_bucket')
    .eq('id', artifactId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(`STORAGE_WRITER_READ_FAILED: ${error.message}`);
  if (!row) throw new Error('STORAGE_WRITER_NOT_FOUND');
  if (expectedUserId && row.user_id !== expectedUserId) {
    throw new Error('STORAGE_WRITER_OWNER_MISMATCH');
  }

  // Resolve the appropriate backend for this artifact. If it has a
  // storage_connection_id, use that connection; otherwise platform default.
  let backend;
  if (row.storage_connection_id) {
    const conn = await resolveCurrentConnection(row.user_id, 'supabase');
    if (!conn || conn.connectionId !== row.storage_connection_id) {
      // The connection has been rotated/deleted; can't sign.
      throw new Error('STORAGE_WRITER_CONNECTION_GONE');
    }
    backend = userConnectedBackend({
      connectionId: conn.connectionId,
      credential: conn.credential,
      metadata: conn.metadata,
    });
  } else {
    backend = platformDefault;
  }

  return backend.signedUrl({
    bucket: row.storage_bucket || undefined,
    path: row.storage_path,
    expiresIn,
  });
}

/**
 * Soft-delete an artifact (mark deleted_at + remove the underlying file).
 * Hard-delete of the row is left to a retention cron.
 */
export async function deleteArtifact(artifactId, { expectedUserId = null } = {}) {
  const admin = buildSupabaseAdminClient();
  const { data: row, error } = await admin
    .from('goal_artifacts')
    .select('id, user_id, storage_connection_id, storage_path, storage_bucket')
    .eq('id', artifactId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(`STORAGE_WRITER_READ_FAILED: ${error.message}`);
  if (!row) return { deleted: false, reason: 'already deleted or missing' };
  if (expectedUserId && row.user_id !== expectedUserId) {
    throw new Error('STORAGE_WRITER_OWNER_MISMATCH');
  }

  // Try to remove the file. Failures here don't block the row soft-delete —
  // the file becomes an orphan that Phase 5 quarantine catches.
  let backend;
  try {
    if (row.storage_connection_id) {
      const conn = await resolveCurrentConnection(row.user_id, 'supabase');
      if (conn && conn.connectionId === row.storage_connection_id) {
        backend = userConnectedBackend({
          connectionId: conn.connectionId,
          credential: conn.credential,
          metadata: conn.metadata,
        });
      }
    } else {
      backend = platformDefault;
    }
    if (backend) {
      await backend.delete({ bucket: row.storage_bucket || undefined, path: row.storage_path });
    }
  } catch (delErr) {
    log.warn(null, 'storage-writer.file_delete_failed', { artifactId, err: delErr.message });
  }

  await admin
    .from('goal_artifacts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', artifactId);

  return { deleted: true };
}

function humanBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export const _internal = { humanBytes };
