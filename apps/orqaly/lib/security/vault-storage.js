/**
 * Supabase Vault storage helpers for user_api_keys.
 *
 * Everything goes through the service-role client AND through the
 * public.vault_* SECURITY DEFINER wrappers from migration 185. Both parts matter:
 *
 *  - PostgREST cannot reach the `vault` schema at all ("Invalid schema: vault"),
 *    and exposing it would put vault.decrypted_secrets in reach of anon —
 *    precisely what the vault exists to prevent. So the wrappers are the door.
 *  - `admin.rpc('create_secret')` resolves to public.create_secret, which does not
 *    exist. That is why every BYOK save failed with VAULT_PUT_FAILED and why
 *    user_api_keys sat at 0 rows.
 *
 * Callers are responsible for having verified user ownership first.
 */
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

function adminOrThrow() {
  const admin = buildSupabaseAdminClient();
  if (!admin) {
    throw new Error('VAULT_ADMIN_UNAVAILABLE: missing SUPABASE_SERVICE_ROLE_KEY');
  }
  return admin;
}

/**
 * Store an envelope string as a Supabase Vault secret.
 * @returns {Promise<string>} vault secret id (uuid)
 */
export async function putEnvelope({ name, envelopeJson, description = null }) {
  const admin = adminOrThrow();
  const { data, error } = await admin.rpc('vault_create_secret', {
    new_secret: envelopeJson,
    new_name: name,
    new_description: description,
  });
  if (error) throw new Error(`VAULT_PUT_FAILED: ${error.message || error}`);
  return data; // the new secret's uuid
}

/**
 * Read a vault secret's decrypted value. Only the service role can read
 * vault.decrypted_secrets — never expose this over a user-scoped client.
 */
export async function readEnvelope(vaultSecretId) {
  const admin = adminOrThrow();
  const { data, error } = await admin.rpc('vault_read_secret', { secret_id: vaultSecretId });
  if (error) throw new Error(`VAULT_READ_FAILED: ${error.message || error}`);
  if (!data) throw new Error('VAULT_SECRET_NOT_FOUND');
  return data;
}

/**
 * Replace the value of an existing vault secret (used for rotation).
 */
export async function updateEnvelope(vaultSecretId, envelopeJson) {
  const admin = adminOrThrow();
  const { error } = await admin.rpc('vault_update_secret', {
    secret_id: vaultSecretId,
    new_secret: envelopeJson,
  });
  if (error) throw new Error(`VAULT_UPDATE_FAILED: ${error.message || error}`);
}

/**
 * Delete a vault secret permanently. Called on hard-delete only; soft-deletes
 * in user_api_keys do not remove the underlying vault row so audit/rotation
 * trails remain intact.
 */
export async function deleteEnvelope(vaultSecretId) {
  const admin = adminOrThrow();
  const { error } = await admin.rpc('vault_delete_secret', { secret_id: vaultSecretId });
  if (error) throw new Error(`VAULT_DELETE_FAILED: ${error.message || error}`);
}

export function buildVaultSecretName({ userId, provider, slot }) {
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `user_api_keys/${userId}/${provider}/${slot}/${id}`;
}
