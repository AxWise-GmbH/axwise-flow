/**
 * Shared upsert for user_api_keys: probe → encrypt → vault → insert → supersede prior.
 *
 * Used by:
 *   - POST /api/app?path=user-api-keys           (single-row, interactive save)
 *   - POST /api/app?path=import-keys-apply       (bulk apply after import preview)
 *
 * Returns { success: true, row } on success OR
 *         { success: false, code, message, status? } on probe / storage failure.
 * Never throws on expected failure paths — handlers classify.
 */
import { randomUUID } from 'node:crypto';
import { buildSupabaseAdminClient } from '../../../api/_lib/supabase-server.js';
import { encryptEnvelope, buildAad } from '../../security/envelope-crypto.js';
import { putEnvelope, buildVaultSecretName, deleteEnvelope } from '../../security/vault-storage.js';
import { isKnownProvider, probeProviderKey } from '../../security/provider-catalog.js';
import { invalidateResolveCache } from '../../security/resolve-user-key.js';
import { createLogger } from '../../../api/_lib/logger.js';
import {
  finalizeToolCredentialWrite,
  releaseToolCredentialWrite,
  reservationMatchesToolProvider,
  toolIdFromCredentialProvider,
  verifyToolCredentialWriteReservation,
} from './tool-credential-write-reservation.js';

const log = createLogger('save-user-api-key');

const API_KEY_ROW_FIELDS =
  'id, user_id, provider, slot, label, masked_preview, fingerprint, key_length, vault_secret_id, kek_id, is_current, superseded_at, superseded_by, last_tested_at, last_test_ok, created_at, updated_at';

function sameNullableTimestamp(left, right) {
  if (left == null || right == null) return left == null && right == null;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function insertedRowMatches(row, expected) {
  return Boolean(
    row &&
    row.id === expected.id &&
    row.user_id === expected.user_id &&
    row.provider === expected.provider &&
    row.slot === expected.slot &&
    (row.label ?? null) === (expected.label ?? null) &&
    row.masked_preview === expected.masked_preview &&
    row.fingerprint === expected.fingerprint &&
    row.key_length === expected.key_length &&
    row.vault_secret_id === expected.vault_secret_id &&
    row.kek_id === expected.kek_id &&
    row.is_current === expected.is_current &&
    (row.superseded_at ?? null) === (expected.superseded_at ?? null) &&
    (row.superseded_by ?? null) === (expected.superseded_by ?? null) &&
    sameNullableTimestamp(row.last_tested_at, expected.last_tested_at) &&
    (row.last_test_ok ?? null) === (expected.last_test_ok ?? null) &&
    Number.isFinite(Date.parse(row.created_at)) &&
    Number.isFinite(Date.parse(row.updated_at))
  );
}

async function inspectApiKeyInsert(admin, expected) {
  try {
    const { data: row, error } = await admin
      .from('user_api_keys')
      .select(API_KEY_ROW_FIELDS)
      .eq('id', expected.id)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!row) return { state: 'absent' };
    return insertedRowMatches(row, expected)
      ? { state: 'committed', row }
      : { state: 'conflict', row };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function loadApiKeyRow(admin, id) {
  try {
    const { data, error } = await admin
      .from('user_api_keys')
      .select(API_KEY_ROW_FIELDS)
      .eq('id', id)
      .maybeSingle();
    return error ? { row: null, error } : { row: data || null, error: null };
  } catch (error) {
    return { row: null, error };
  }
}

async function loadCurrentApiKey(admin, { userId, provider, slot }) {
  try {
    const { data, error } = await admin
      .from('user_api_keys')
      .select(API_KEY_ROW_FIELDS)
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('slot', slot)
      .eq('is_current', true)
      .maybeSingle();
    return error ? { row: null, error } : { row: data || null, error: null };
  } catch (error) {
    return { row: null, error };
  }
}

async function inspectApiKeyRotation(admin, { existing, inserted }) {
  const [oldResult, newResult] = await Promise.all([
    loadApiKeyRow(admin, existing.id),
    loadApiKeyRow(admin, inserted.id),
  ]);
  if (oldResult.error || newResult.error || !oldResult.row || !newResult.row) {
    return { state: 'unknown', error: oldResult.error || newResult.error || null };
  }
  const oldRow = oldResult.row;
  const newRow = newResult.row;
  const oldIdentityMatches =
    oldRow.id === existing.id &&
    oldRow.user_id === existing.user_id &&
    oldRow.provider === existing.provider &&
    oldRow.slot === existing.slot &&
    oldRow.vault_secret_id === existing.vault_secret_id;
  if (!oldIdentityMatches) return { state: 'conflict', oldRow, newRow };
  if (
    insertedRowMatches(newRow, { ...inserted, is_current: true }) &&
    oldRow.is_current === false &&
    oldRow.superseded_by === inserted.id &&
    oldRow.superseded_at &&
    newRow.is_current === true
  ) {
    return { state: 'committed', oldRow, newRow };
  }
  if (
    insertedRowMatches(newRow, { ...inserted, is_current: false }) &&
    oldRow.is_current === true &&
    oldRow.updated_at === existing.updated_at &&
    oldRow.vault_secret_id === existing.vault_secret_id &&
    newRow.is_current === false &&
    !newRow.superseded_at &&
    !newRow.superseded_by
  ) {
    return { state: 'original', oldRow, newRow };
  }
  return { state: 'conflict', oldRow, newRow };
}

async function invokeApiKeyRotation(admin, { existing, inserted }) {
  try {
    const { data, error } = await admin.rpc('rotate_user_api_key_current', {
      p_user_id: inserted.user_id,
      p_provider: inserted.provider,
      p_slot: inserted.slot,
      p_old_id: existing.id,
      p_old_updated_at: existing.updated_at,
      p_old_vault_secret_id: existing.vault_secret_id,
      p_new_id: inserted.id,
      p_new_updated_at: inserted.updated_at,
      p_new_vault_secret_id: inserted.vault_secret_id,
    });
    return error ? { ok: false, error } : { ok: true, data };
  } catch (error) {
    return { ok: false, error };
  }
}

async function inspectExactInactiveApiKey(admin, row) {
  const inspected = await loadApiKeyRow(admin, row.id);
  if (inspected.error) return { state: 'unknown', error: inspected.error };
  if (!inspected.row) return { state: 'absent' };
  return insertedRowMatches(inspected.row, { ...row, is_current: false }) &&
    inspected.row.updated_at === row.updated_at
    ? { state: 'present', row: inspected.row }
    : { state: 'conflict', row: inspected.row };
}

async function deleteExactInactiveApiKey(admin, row) {
  try {
    const { data, error } = await admin
      .from('user_api_keys')
      .delete()
      .eq('id', row.id)
      .eq('user_id', row.user_id)
      .eq('provider', row.provider)
      .eq('slot', row.slot)
      .eq('vault_secret_id', row.vault_secret_id)
      .eq('is_current', false)
      .eq('updated_at', row.updated_at)
      .select('id')
      .maybeSingle();
    if (!error && data) return { state: 'deleted' };
    const inspected = await inspectExactInactiveApiKey(admin, row);
    if (inspected.state === 'absent') return { state: 'deleted' };
    return inspected;
  } catch (error) {
    const inspected = await inspectExactInactiveApiKey(admin, row);
    if (inspected.state === 'absent') return { state: 'deleted' };
    return inspected.state === 'unknown' ? inspected : { ...inspected, error };
  }
}

function reconciliationFailure({ message, rowId, causeCode = null }) {
  return {
    success: false,
    code: 'API_KEY_RECONCILIATION_REQUIRED',
    message,
    status: 503,
    reconciliationRequired: true,
    credentialStored: true,
    rowId,
    ...(causeCode ? { causeCode } : {}),
  };
}

/**
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.provider
 * @param {string} [opts.slot='default']
 * @param {string} [opts.label]
 * @param {string} opts.apiKey          - raw plaintext
 * @param {boolean} [opts.skipProbe=false]
 * @param {object} [opts.adminClient]   - existing service-role client
 * @param {object} [opts.toolCredentialReservation] - required for tool:* writes
 * @returns {Promise<{success, row?, code?, message?, status?}>}
 */
export async function saveUserApiKey({
  userId,
  provider,
  slot = 'default',
  label = null,
  apiKey,
  skipProbe = false,
  adminClient = null,
  toolCredentialReservation = null,
}) {
  if (!userId) return { success: false, code: 'NO_USER', message: 'Missing userId' };
  if (!provider || !isKnownProvider(provider))
    return { success: false, code: 'UNKNOWN_PROVIDER', message: 'Unknown provider' };
  const toolId = toolIdFromCredentialProvider(provider);
  if (toolId && !reservationMatchesToolProvider(toolCredentialReservation, { userId, provider })) {
    return {
      success: false,
      code: 'TOOL_RESERVATION_REQUIRED',
      message: 'A matching tool credential reservation is required',
      status: 409,
    };
  }

  const admin = adminClient || buildSupabaseAdminClient();
  if (!admin) {
    return {
      success: false,
      code: toolId ? 'TOOL_CREDENTIAL_RECONCILIATION_REQUIRED' : 'NO_ADMIN',
      message: toolId
        ? 'Tool credential reservation cannot be reconciled'
        : 'Admin client unavailable',
      status: 503,
      reconciliationRequired: Boolean(toolId),
    };
  }

  const failAndRelease = async (failure) => {
    if (!toolId) return failure;
    const released = await releaseToolCredentialWrite({
      admin,
      reservation: toolCredentialReservation,
    });
    if (released.ok) return failure;
    return {
      success: false,
      code: released.code,
      message: released.message,
      status: released.status || 503,
      reconciliationRequired: true,
      causeCode: failure.code,
    };
  };

  if (typeof apiKey !== 'string' || apiKey.trim().length < 8) {
    return failAndRelease({
      success: false,
      code: 'BAD_INPUT',
      message: 'Missing or too-short apiKey',
      status: 400,
    });
  }

  const trimmed = apiKey.trim();

  if (!skipProbe) {
    const probe = await probeProviderKey(provider, trimmed);
    if (!probe.ok) {
      return failAndRelease({
        success: false,
        code: probe.code || 'PROBE_FAILED',
        message: probe.message || 'Key validation failed',
        status: probe.status || null,
      });
    }
  }

  const aad = buildAad(userId, provider, slot);
  let encrypted;
  try {
    encrypted = encryptEnvelope({ plaintext: trimmed, aad });
  } catch (err) {
    log.warn(null, 'encrypt.failed', { err: err.message });
    return failAndRelease({
      success: false,
      code: 'ENCRYPT_FAILED',
      message: 'Server key encryption unavailable',
      status: 503,
    });
  }

  // The exact marker is checked at the last possible boundary before Vault.
  // A browser registration holding an old pre-registration snapshot therefore
  // cannot persist after a manual writer has changed or reserved the tool.
  if (toolId) {
    const verified = await verifyToolCredentialWriteReservation({
      admin,
      reservation: toolCredentialReservation,
    });
    if (!verified.ok) {
      return {
        success: false,
        code: verified.code,
        message: verified.message,
        status: verified.status || 409,
        reconciliationRequired: Boolean(verified.reconciliationRequired),
      };
    }
  }

  // The metadata row id is generated before Vault so an insert response loss
  // can be reconciled by rereading one exact, unpredictable row.
  const rowId = randomUUID();
  const secretName = buildVaultSecretName({ userId, provider, slot });
  let vaultSecretId;
  try {
    vaultSecretId = await putEnvelope({
      name: secretName,
      envelopeJson: encrypted.envelope,
      description: `BYOK: ${provider} (${slot})`,
    });
  } catch (err) {
    log.warn(null, 'vault.put_failed', { err: err.message });
    return failAndRelease({
      success: false,
      code: 'VAULT_PUT_FAILED',
      message: 'Failed to persist secret',
      status: 503,
    });
  }

  const existingResult = await loadCurrentApiKey(admin, { userId, provider, slot });
  if (existingResult.error) {
    try {
      await deleteEnvelope(vaultSecretId);
    } catch {
      /* best effort */
    }
    log.warn(null, 'current-key.load_failed', { err: existingResult.error.message });
    return failAndRelease({
      success: false,
      code: 'KEY_STATE_LOAD_FAILED',
      message: 'Failed to load current key state',
      status: 503,
    });
  }
  const existing = existingResult.row;

  const lastTestedAt = skipProbe ? null : new Date().toISOString();
  const expectedInsert = {
    id: rowId,
    user_id: userId,
    provider,
    slot,
    label,
    masked_preview: encrypted.maskedPreview,
    fingerprint: encrypted.fingerprint,
    key_length: encrypted.keyLength,
    vault_secret_id: vaultSecretId,
    kek_id: encrypted.kekId,
    // Rotation first creates a non-current candidate. The existing current row
    // remains readable until migration 215 atomically swaps both rows.
    is_current: !existing,
    superseded_at: null,
    superseded_by: null,
    last_tested_at: lastTestedAt,
    last_test_ok: skipProbe ? null : true,
  };

  let insertResponse;
  try {
    insertResponse = await admin
      .from('user_api_keys')
      .insert(expectedInsert)
      .select(API_KEY_ROW_FIELDS)
      .single();
  } catch (error) {
    insertResponse = { data: null, error };
  }

  let inserted = insertResponse.data;
  if (insertResponse.error || !inserted || !insertedRowMatches(inserted, expectedInsert)) {
    const inspection = await inspectApiKeyInsert(admin, expectedInsert);
    if (inspection.state === 'committed') {
      inserted = inspection.row;
    } else if (inspection.state === 'absent') {
      try {
        await deleteEnvelope(vaultSecretId);
      } catch {
        /* An unreferenced encrypted envelope is safe to reconcile separately. */
      }
      log.warn(null, 'insert.proven_absent', {
        err: insertResponse.error?.message || 'missing-or-mismatched response',
      });
      return failAndRelease({
        success: false,
        code: 'INSERT_FAILED',
        message: 'Failed to save key',
        status: 503,
      });
    } else {
      // The row and Vault envelope may both be durable. Deleting either or
      // releasing a tool fence could let a second writer overwrite that state.
      log.warn(null, 'insert.needs_reconciliation', {
        rowId,
        inspectionState: inspection.state,
        err: insertResponse.error?.message || null,
        inspectionErr: inspection.error?.message || null,
      });
      return reconciliationFailure({
        message: 'Credential insert outcome needs reconciliation',
        rowId,
        causeCode: 'INSERT_FAILED',
      });
    }
  }

  if (existing) {
    let rotation = await invokeApiKeyRotation(admin, { existing, inserted });
    if (!rotation.ok) {
      let inspection = await inspectApiKeyRotation(admin, { existing, inserted });
      if (inspection.state === 'committed') {
        inserted = inspection.newRow;
      } else if (inspection.state === 'original') {
        // A proven pre-state is safe to retry: the old row is still current and
        // the exact new row remains non-current.
        rotation = await invokeApiKeyRotation(admin, { existing, inserted });
        if (!rotation.ok) {
          inspection = await inspectApiKeyRotation(admin, { existing, inserted });
        }

        if (rotation.ok || inspection.state === 'committed') {
          if (inspection.newRow) inserted = inspection.newRow;
        } else if (inspection.state === 'original') {
          // Both RPC attempts are proven absent. Remove only the exact inactive
          // candidate before releasing the tool fence; the prior key never
          // stopped being current.
          let cleanup = await deleteExactInactiveApiKey(admin, inspection.newRow);
          if (cleanup.state === 'present') {
            cleanup = await deleteExactInactiveApiKey(admin, cleanup.row);
          }
          if (cleanup.state === 'deleted') {
            try {
              await deleteEnvelope(vaultSecretId);
            } catch {
              /* An unreferenced encrypted envelope is safe to reconcile separately. */
            }
            log.warn(null, 'rotation.proven_absent', {
              rowId,
              err: rotation.error?.message || null,
            });
            return failAndRelease({
              success: false,
              code: 'ROTATION_FAILED',
              message: 'Failed to rotate current key',
              status: 503,
            });
          }

          return reconciliationFailure({
            message: 'Credential rotation cleanup needs reconciliation',
            rowId,
            causeCode: 'ROTATION_FAILED',
          });
        } else {
          return reconciliationFailure({
            message: 'Credential rotation outcome needs reconciliation',
            rowId,
            causeCode: 'ROTATION_FAILED',
          });
        }
      } else {
        return reconciliationFailure({
          message: 'Credential rotation outcome needs reconciliation',
          rowId,
          causeCode: 'ROTATION_FAILED',
        });
      }
    }
  }

  invalidateResolveCache(userId, provider, slot);

  if (toolId) {
    const finalized = await finalizeToolCredentialWrite({
      admin,
      reservation: toolCredentialReservation,
    });
    if (!finalized.ok) {
      return {
        success: false,
        code: finalized.code,
        message: finalized.message,
        status: finalized.status || 503,
        reconciliationRequired: true,
        credentialStored: true,
        rowId: inserted.id,
      };
    }
  }

  return {
    success: true,
    row: {
      id: inserted.id,
      provider,
      slot,
      maskedPreview: encrypted.maskedPreview,
      tail: trimmed.slice(-4),
      createdAt: inserted.created_at,
    },
  };
}
