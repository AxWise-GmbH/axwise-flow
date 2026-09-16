/**
 * Envelope-encrypted OAuth token storage.
 *
 * integration_credentials contains only non-secret metadata and a pointer to a
 * Supabase Vault row. The Vault value is itself an AES-256-GCM envelope whose
 * AAD binds it to the owning user and provider. Callers may hold the decrypted
 * tokens in memory for an outbound request, but must never write them back to
 * integration_credentials or include them in logs.
 */
import { encryptEnvelope, decryptEnvelope, buildAad } from './envelope-crypto.js';
import { putEnvelope, readEnvelope, deleteEnvelope } from './vault-storage.js';

const OAUTH_SLOT = 'tokens';
const OAUTH_PROVIDER_PREFIX = 'oauth:';

export const OAUTH_CREDENTIAL_SELECT = [
  'id',
  'user_id',
  'provider',
  'external_account_id',
  'expires_at',
  'scope',
  'metadata',
  'last_refreshed_at',
  'refresh_failure_count',
  'status',
  'vault_secret_id',
  'credential_kek_id',
  'credential_algorithm',
  'credential_version',
  'created_at',
  'updated_at',
].join(', ');

export function buildOAuthCredentialAad(userId, provider) {
  if (!userId || !provider) throw new Error('OAUTH_CREDENTIAL_INVALID_IDENTITY');
  return buildAad(userId, `${OAUTH_PROVIDER_PREFIX}${provider}`, OAUTH_SLOT);
}

function normalizeTokens(tokens) {
  const accessToken = typeof tokens?.access_token === 'string' ? tokens.access_token : '';
  const refreshToken = typeof tokens?.refresh_token === 'string' ? tokens.refresh_token : '';
  if (!accessToken) throw new Error('OAUTH_CREDENTIAL_ACCESS_TOKEN_REQUIRED');
  return { access_token: accessToken, refresh_token: refreshToken || null };
}

/** Store an OAuth token pair as an encrypted Vault envelope. */
export async function storeOAuthTokenEnvelope({ userId, provider, tokens }) {
  const normalized = normalizeTokens(tokens);
  const aad = buildOAuthCredentialAad(userId, provider);
  const encrypted = encryptEnvelope({ plaintext: JSON.stringify(normalized), aad });
  const suffix = crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const vaultSecretId = await putEnvelope({
    name: `integration_credentials/${userId}/${provider}/${suffix}`,
    envelopeJson: encrypted.envelope,
    description: `OAuth credential for ${provider}`,
  });
  return {
    vaultSecretId,
    kekId: encrypted.kekId,
    algorithm: 'AES-256-GCM',
    version: 1,
  };
}

/**
 * Read and decrypt one credential row. Any missing pointer, AAD mismatch,
 * corrupt envelope, or malformed payload throws; callers must fail closed.
 */
export async function readOAuthTokenEnvelope(row) {
  if (!row?.vault_secret_id || !row?.user_id || !row?.provider) {
    throw new Error('OAUTH_CREDENTIAL_ENCRYPTED_VALUE_MISSING');
  }
  const envelopeJson = await readEnvelope(row.vault_secret_id);
  const expectedAad = buildOAuthCredentialAad(row.user_id, row.provider);
  const { plaintext } = decryptEnvelope(envelopeJson, { expectedAad });
  let parsed;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    throw new Error('OAUTH_CREDENTIAL_PAYLOAD_INVALID');
  }
  return normalizeTokens(parsed);
}

/** Best-effort cleanup used only after a replacement is durably committed. */
export async function deleteOAuthTokenEnvelope(vaultSecretId) {
  if (!vaultSecretId) return;
  await deleteEnvelope(vaultSecretId);
}

export const _internal = { OAUTH_SLOT, OAUTH_PROVIDER_PREFIX, normalizeTokens };
