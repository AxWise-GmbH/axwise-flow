/**
 * Public OAuth callback for KB cloud sources (Dropbox / OneDrive) - no auth
 * header (the provider redirects the browser here). Trust is established by the
 * HMAC-signed `state` minted in kb-oauth. Flow:
 *   1. verify state -> { userId, provider }
 *   2. exchange ?code for tokens at the provider token endpoint
 *   3. upsert integration_credentials (service role)
 *   4. create/link the kb_connections row (credential_ref -> that credential)
 *   5. 302 back to /knowledge-base?connected=<provider> (or ?connected_error=...)
 *
 * GET /api/oauth-callback?provider=dropbox&code=...&state=...
 */
import { applySecurityHeaders } from './_lib/security-headers.js';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  applyRateLimitHeaders,
} from './_lib/rate-limit.js';
import { buildSupabaseAdminClient } from './_lib/supabase-server.js';
import {
  getOAuthProvider,
  callbackRedirectUri,
  verifyState,
} from '../lib/integrations/_shared/kb-oauth-providers.js';
import {
  storeOAuthTokenEnvelope,
  deleteOAuthTokenEnvelope,
} from '../lib/security/oauth-token-vault.js';

function redirect(res, path) {
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  res.statusCode = 302;
  res.setHeader('Location', `${base}${path}`);
  res.end();
}

async function exchangeCode(cfg, provider, code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: cfg.clientId(),
    client_secret: cfg.clientSecret(),
    redirect_uri: callbackRedirectUri(provider),
  });
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    // Provider bodies are not safe diagnostic material: some include token or
    // authorization-code fragments. Keep credential material out of errors.
    throw new Error(`token exchange failed (${res.status})`);
  }
  return res.json();
}

async function storeCredential(admin, userId, provider, tokens) {
  const encrypted = await storeOAuthTokenEnvelope({ userId, provider, tokens });
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
    : null;
  const row = {
    user_id: userId,
    provider,
    // Defense in depth for deployments applying the code before migration 194:
    // never place OAuth bearer material in ordinary table columns.
    access_token: null,
    refresh_token: null,
    vault_secret_id: encrypted.vaultSecretId,
    credential_kek_id: encrypted.kekId,
    credential_algorithm: encrypted.algorithm,
    credential_version: encrypted.version,
    expires_at: expiresAt,
    scope: Array.isArray(tokens.scope) ? tokens.scope.join(' ') : tokens.scope || null,
    status: 'active',
    last_refreshed_at: new Date().toISOString(),
    refresh_failure_count: 0,
    updated_at: new Date().toISOString(),
  };
  let existing;
  try {
    const result = await admin
      .from('integration_credentials')
      .select('id, vault_secret_id')
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle();
    if (result.error) throw result.error;
    existing = result.data;

    if (existing) {
      const updateResult = await admin
        .from('integration_credentials')
        .update(row)
        .eq('id', existing.id)
        .eq('user_id', userId);
      if (updateResult?.error) throw updateResult.error;
      if (existing.vault_secret_id && existing.vault_secret_id !== encrypted.vaultSecretId) {
        try {
          await deleteOAuthTokenEnvelope(existing.vault_secret_id);
        } catch {
          // Replacement is committed. An orphaned encrypted envelope is safer
          // than deleting the new credential or exposing either token.
        }
      }
      return existing.id;
    }

    const insertResult = await admin
      .from('integration_credentials')
      .insert(row)
      .select('id')
      .single();
    if (insertResult.error || !insertResult.data?.id) {
      throw insertResult.error || new Error('credential insert returned no id');
    }
    return insertResult.data.id;
  } catch (err) {
    try {
      await deleteOAuthTokenEnvelope(encrypted.vaultSecretId);
    } catch {
      // Best effort cleanup; never replace the storage error with cleanup detail.
    }
    throw new Error('OAUTH_CREDENTIAL_STORE_FAILED', { cause: err });
  }
}

async function linkConnection(admin, userId, source, credentialId) {
  const credential_ref = { kind: 'oauth', provider: source, credential_id: credentialId };
  const { data: existing } = await admin
    .from('kb_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('source_type', source)
    .eq('slot', 'primary')
    .eq('is_current', true)
    .maybeSingle();
  if (existing) {
    await admin
      .from('kb_connections')
      .update({ credential_ref, mode: 'sync', enabled: true })
      .eq('id', existing.id);
    return;
  }
  await admin.from('kb_connections').insert({
    user_id: userId,
    source_type: source,
    slot: 'primary',
    mode: 'sync',
    credential_ref,
  });
}

export default async function handler(req, res) {
  applySecurityHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const rl = checkRateLimit({
    key: `oauth-callback:${getRateLimitIdentifier(req, null)}`,
    limit: 20,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return redirect(res, '/knowledge-base?connected_error=rate_limited');

  const provider = String(req.query?.provider || '').toLowerCase();
  const code = req.query?.code;
  const state = req.query?.state;
  const oauthError = req.query?.error;

  if (oauthError) return redirect(res, '/knowledge-base?connected_error=provider_denied');

  const cfg = getOAuthProvider(provider);
  if (!cfg || !code || !state) return redirect(res, '/knowledge-base?connected_error=bad_request');

  const payload = verifyState(state, Date.now());
  if (!payload || payload.provider !== provider) {
    return redirect(res, '/knowledge-base?connected_error=invalid_state');
  }

  try {
    const admin = buildSupabaseAdminClient();
    if (!admin) return redirect(res, '/knowledge-base?connected_error=server');
    const tokens = await exchangeCode(cfg, provider, code);
    const credentialId = await storeCredential(admin, payload.userId, provider, tokens);
    if (!credentialId) return redirect(res, '/knowledge-base?connected_error=store_failed');
    await linkConnection(admin, payload.userId, provider, credentialId);
    return redirect(res, `/knowledge-base?connected=${encodeURIComponent(provider)}`);
  } catch {
    return redirect(res, '/knowledge-base?connected_error=exchange_failed');
  }
}
