/**
 * Storage-connection credential storage — BYOS counterpart to user_api_keys.
 *
 * Wraps the existing envelope-crypto + Supabase Vault stack so users' storage
 * credentials (Supabase service-role key, S3 secret access key, etc.) are
 * encrypted at rest with a KEK that lives outside the database.
 *
 * Connections are stored in `user_storage_connections` with the encrypted
 * credential blob in vault.secrets pointed to by `vault_secret_id`.
 *
 * Pattern intentionally mirrors lib/api-handlers/_shared/save-user-api-key.js
 * so all BYO-anything flows look the same.
 */
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { encryptEnvelope, decryptEnvelope, buildAad } from './envelope-crypto.js';
import { putEnvelope, readEnvelope, deleteEnvelope } from './vault-storage.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('storage-connections');

const AAD_SCOPE = 'storage';
const VALID_KINDS = new Set(['supabase', 's3', 'r2', 'gcs']);

function buildStorageAad(userId, kind, slot = 'primary') {
  // Same shape as buildAad but namespaced under 'storage' so a leaked
  // user_api_keys envelope can't be replayed against a storage row.
  return buildAad(userId, `${AAD_SCOPE}:${kind}`, slot);
}

function adminOrThrow() {
  const admin = buildSupabaseAdminClient();
  if (!admin) {
    throw new Error('STORAGE_CONN_ADMIN_UNAVAILABLE: missing SUPABASE_SERVICE_ROLE_KEY');
  }
  return admin;
}

/**
 * Save a new storage connection. Encrypts the credential blob (a JSON string
 * containing whatever the backend needs — e.g. service-role key for Supabase,
 * or { accessKeyId, secretAccessKey } for S3) and stores the pointer.
 *
 * Replaces any existing current connection for the same (user, kind, slot)
 * by marking it superseded. The vault row of the old connection stays intact
 * for audit (matches user_api_keys.js pattern).
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {'supabase'|'s3'|'r2'|'gcs'} opts.kind
 * @param {string} [opts.slot='primary']
 * @param {string} [opts.label]
 * @param {object} opts.metadata - safe-to-display backend config (no secrets!)
 * @param {string} opts.credential - the secret blob to encrypt (any string;
 *                                   typically JSON-serialized backend creds)
 * @returns {Promise<{id: string, kind: string, slot: string}>}
 */
export async function saveStorageConnection({
  userId,
  kind,
  slot = 'primary',
  label = null,
  metadata = {},
  credential,
}) {
  if (!userId) throw new Error('STORAGE_CONN_INVALID: userId required');
  if (!VALID_KINDS.has(kind)) throw new Error(`STORAGE_CONN_INVALID: kind must be one of ${[...VALID_KINDS].join(',')}`);
  if (typeof credential !== 'string' || credential.length === 0) {
    throw new Error('STORAGE_CONN_INVALID: credential must be a non-empty string');
  }
  if (typeof metadata !== 'object' || metadata === null) {
    throw new Error('STORAGE_CONN_INVALID: metadata must be an object');
  }

  const admin = adminOrThrow();
  const aad = buildStorageAad(userId, kind, slot);
  const { envelope, kekId } = encryptEnvelope({ plaintext: credential, aad });

  // Store the encrypted blob in Vault. Name encodes ownership for audit.
  const vaultSecretId = await putEnvelope({
    name: `user_storage_connections/${userId}/${kind}/${slot}/${Date.now()}`,
    envelopeJson: envelope,
    description: `Storage connection ${kind}:${slot} for user ${userId}`,
  });

  // Supersede any existing current connection for this (user, kind, slot).
  await admin
    .from('user_storage_connections')
    .update({ is_current: false, superseded_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('slot', slot)
    .eq('is_current', true);

  const { data, error } = await admin
    .from('user_storage_connections')
    .insert({
      user_id: userId,
      kind,
      slot,
      label,
      metadata,
      vault_secret_id: vaultSecretId,
      kek_id: kekId,
      algorithm: 'AES-256-GCM',
      envelope_version: 1,
      is_current: true,
    })
    .select('id, kind, slot, label, metadata, created_at')
    .single();

  if (error) {
    // Vault row is now orphaned; cron sweeper can clean if needed.
    throw new Error(`STORAGE_CONN_SAVE_FAILED: ${error.message || error}`);
  }
  log.info(null, 'storage-connections.saved', { userId, kind, slot, connectionId: data.id });
  return data;
}

/**
 * Decrypt and return the credential for a connection. Service-side only —
 * never expose this over a user-scoped client. Caller is responsible for
 * having verified ownership (the function double-checks anyway via AAD).
 *
 * @param {string} connectionId
 * @param {string} expectedUserId - must match the row's user_id (defense in depth)
 * @returns {Promise<{credential: string, metadata: object, kind: string, slot: string}>}
 */
export async function readStorageConnection(connectionId, expectedUserId) {
  if (!connectionId) throw new Error('STORAGE_CONN_INVALID: connectionId required');
  const admin = adminOrThrow();

  const { data: row, error } = await admin
    .from('user_storage_connections')
    .select('id, user_id, kind, slot, metadata, vault_secret_id, is_current')
    .eq('id', connectionId)
    .maybeSingle();

  if (error) throw new Error(`STORAGE_CONN_READ_FAILED: ${error.message || error}`);
  if (!row) throw new Error('STORAGE_CONN_NOT_FOUND');
  if (expectedUserId && row.user_id !== expectedUserId) {
    throw new Error('STORAGE_CONN_OWNER_MISMATCH');
  }
  if (!row.is_current) {
    throw new Error('STORAGE_CONN_SUPERSEDED');
  }

  const envelopeJson = await readEnvelope(row.vault_secret_id);
  const expectedAad = buildStorageAad(row.user_id, row.kind, row.slot);
  const { plaintext } = decryptEnvelope(envelopeJson, { expectedAad });

  return {
    credential: plaintext,
    metadata: row.metadata || {},
    kind: row.kind,
    slot: row.slot,
    userId: row.user_id,
  };
}

/**
 * Resolve the current storage connection for a user by kind. Returns the
 * decrypted credential ready for use, or null if no connection is configured
 * (caller should fall back to platform-default storage).
 *
 * Used by StorageWriter.resolveConnection() on every upload.
 */
export async function resolveCurrentConnection(userId, kind, slot = 'primary') {
  if (!userId || !kind) return null;
  const admin = adminOrThrow();

  const { data: row, error } = await admin
    .from('user_storage_connections')
    .select('id, user_id, kind, slot, metadata, vault_secret_id, last_test_ok')
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('slot', slot)
    .eq('is_current', true)
    .maybeSingle();

  if (error) {
    log.warn(null, 'storage-connections.resolve_failed', { userId, kind, err: error.message });
    return null;
  }
  if (!row) return null;

  // Refuse to use a connection that's never passed a probe — protects the
  // user from "your last upload failed because your bucket creds are wrong"
  // in the middle of a goal. The wizard runs a probe before saving so a
  // freshly created connection has last_test_ok = true.
  if (row.last_test_ok === false) {
    log.warn(null, 'storage-connections.resolve_skipped_failed_probe', { userId, kind, connectionId: row.id });
    return null;
  }

  try {
    const envelopeJson = await readEnvelope(row.vault_secret_id);
    const expectedAad = buildStorageAad(userId, kind, slot);
    const { plaintext } = decryptEnvelope(envelopeJson, { expectedAad });
    return {
      connectionId: row.id,
      credential: plaintext,
      metadata: row.metadata || {},
      kind,
      slot,
    };
  } catch (err) {
    log.warn(null, 'storage-connections.resolve_decrypt_failed', { userId, kind, err: err.message });
    return null;
  }
}

/**
 * Delete (soft) a storage connection. The Vault row stays for audit.
 * Existing artifacts already in the user's bucket are left in place — they
 * keep their `storage_connection_id` foreign key (which goes NULL on delete
 * via the FK's ON DELETE SET NULL). New artifacts will fall back to platform
 * default until the user connects a new bucket.
 */
export async function deleteStorageConnection(connectionId, expectedUserId) {
  const admin = adminOrThrow();
  const { data: row, error: readErr } = await admin
    .from('user_storage_connections')
    .select('id, user_id')
    .eq('id', connectionId)
    .maybeSingle();
  if (readErr) throw new Error(`STORAGE_CONN_READ_FAILED: ${readErr.message}`);
  if (!row) throw new Error('STORAGE_CONN_NOT_FOUND');
  if (expectedUserId && row.user_id !== expectedUserId) {
    throw new Error('STORAGE_CONN_OWNER_MISMATCH');
  }

  const { error } = await admin
    .from('user_storage_connections')
    .delete()
    .eq('id', connectionId);
  if (error) throw new Error(`STORAGE_CONN_DELETE_FAILED: ${error.message}`);
  log.info(null, 'storage-connections.deleted', { userId: row.user_id, connectionId });
}

/**
 * Update the connection-test result after running a probe.
 */
export async function recordConnectionTest(connectionId, { ok, error = null }) {
  const admin = adminOrThrow();
  await admin
    .from('user_storage_connections')
    .update({
      last_tested_at: new Date().toISOString(),
      last_test_ok: ok,
      last_test_error: ok ? null : (error || 'probe failed'),
    })
    .eq('id', connectionId);
}

export const _internal = { buildStorageAad, AAD_SCOPE, VALID_KINDS };
