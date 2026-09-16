/**
 * Resolve a kb_connections row to the credential its ingest core needs, from the
 * method recorded in credential_ref.kind:
 *   - 'oauth' -> load integration_credentials by credential_id, refresh if due,
 *                return { method:'oauth', token: <access_token> }
 *   - 'byok'  -> resolveUserKey(provider) -> { method:'byok', token: <key> }.
 *               For Mega the "key" is a JSON {email,password} blob, returned as
 *               { method:'byok', creds: {email,password} } instead of a token.
 *   - 'none'  -> file-import only -> { method:'none' } (no server credential).
 *
 * Secrets never touch kb_connections; they live in integration_credentials (OAuth)
 * or the vault via resolveUserKey (BYOK). Throws an Error with `.status` when a
 * required credential is missing so the handler can surface a clean 400.
 */
import { resolveUserKey } from '../../security/resolve-user-key.js';
import { refreshIfExpiring } from '../../integrations/_shared/oauth-refresh.js';

/** Default BYOK provider id per source (matches provider-catalog + Settings -> Keys). */
export const BYOK_PROVIDER = {
  notion: 'data:notion',
  dropbox: 'data:dropbox',
  onedrive: 'data:onedrive',
  'google-drive': 'data:google-drive',
  mega: 'data:mega',
};

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function resolveConnectionAuth({ admin, userId, conn }) {
  const ref = conn?.credential_ref && typeof conn.credential_ref === 'object' ? conn.credential_ref : {};
  const kind = ref.kind || 'byok';

  if (kind === 'none') return { method: 'none' };

  if (kind === 'oauth') {
    const credentialId = ref.credential_id;
    if (!credentialId) throw fail(400, 'OAuth connection is missing its credential.');
    const cred = await refreshIfExpiring(admin, credentialId);
    if (!cred || !cred.access_token) {
      throw fail(400, 'OAuth credential expired - please reconnect.');
    }
    return { method: 'oauth', token: cred.access_token, credential: cred };
  }

  // byok (default)
  const provider = ref.provider || BYOK_PROVIDER[conn.source_type];
  if (!provider) throw fail(400, `No credential provider for ${conn.source_type}.`);
  const resolved = await resolveUserKey({ userId, provider, reason: 'kb-connection-sync' });
  if (!resolved.key) throw fail(400, `No ${conn.source_type} credential connected.`);

  if (conn.source_type === 'mega') {
    let creds;
    try {
      creds = JSON.parse(resolved.key);
    } catch {
      throw fail(400, 'Mega credential is malformed (expected {email,password}).');
    }
    if (!creds?.email || !creds?.password) throw fail(400, 'Mega credential needs email + password.');
    return { method: 'byok', creds };
  }

  return { method: 'byok', token: resolved.key };
}
