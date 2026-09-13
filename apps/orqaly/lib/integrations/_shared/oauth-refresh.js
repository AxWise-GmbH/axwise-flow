/**
 * Phase 5: standard OAuth refresh_token flow.
 *
 * Each provider plugs in a tiny config that knows where to POST and how
 * to read the response. `refreshIfExpiring(credentialId)` is called from
 * an integration's auth.js before every outbound API call. A daily
 * pulse (refresh-credentials) proactively refreshes anything expiring
 * within 24h so business-hours calls never hit a cold refresh.
 */
import { createLogger } from '../../../api/_lib/logger.js';
import { notifyUser } from '../../notifications/dispatch.js';
import {
  OAUTH_CREDENTIAL_SELECT,
  storeOAuthTokenEnvelope,
  readOAuthTokenEnvelope,
  deleteOAuthTokenEnvelope,
} from '../../security/oauth-token-vault.js';

const log = createLogger('integrations.oauth-refresh');

const REFRESH_WINDOW_MS = 5 * 60 * 1000; // refresh if expiring within 5 min
const PROACTIVE_WINDOW_MS = 24 * 3600 * 1000; // daily pulse window

// Provider-specific refresh configs. Add a new provider by adding one row.
const PROVIDERS = {
  stripe: {
    url: 'https://connect.stripe.com/oauth/token',
    clientId: () => process.env.STRIPE_CLIENT_ID,
    clientSecret: () => process.env.STRIPE_CLIENT_SECRET,
  },
  posthog: {
    url: 'https://us.posthog.com/api/oauth/token/',
    clientId: () => process.env.POSTHOG_CLIENT_ID,
    clientSecret: () => process.env.POSTHOG_CLIENT_SECRET,
  },
  ga4: {
    url: 'https://oauth2.googleapis.com/token',
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
  },
  meta_ads: {
    url: 'https://graph.facebook.com/v18.0/oauth/access_token',
    clientId: () => process.env.META_APP_ID,
    clientSecret: () => process.env.META_APP_SECRET,
  },
  google_ads: {
    url: 'https://oauth2.googleapis.com/token',
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
  },
  // KB cloud sources. Token URLs are shared with kb-oauth's initial exchange.
  dropbox: {
    url: 'https://api.dropboxapi.com/oauth2/token',
    clientId: () => process.env.DROPBOX_CLIENT_ID,
    clientSecret: () => process.env.DROPBOX_CLIENT_SECRET,
  },
  onedrive: {
    url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientId: () => process.env.ONEDRIVE_CLIENT_ID,
    clientSecret: () => process.env.ONEDRIVE_CLIENT_SECRET,
  },
};

function isExpiringWithin(expiresAt, windowMs) {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() - Date.now() < windowMs;
}

async function callRefresh(provider, refreshToken) {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);
  const clientId = cfg.clientId();
  const clientSecret = cfg.clientSecret();
  if (!clientId || !clientSecret) throw new Error(`Missing client credentials for ${provider}`);

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    // OAuth error bodies are not safe to retain: providers may reflect token
    // fragments. Status is sufficient for retry/reauthorization decisions.
    const err = new Error(`Refresh failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Refresh a credential if it's about to expire. Cheap to call before
 * every outbound API call — short-circuits when the token isn't due.
 */
export async function refreshIfExpiring(admin, credentialId) {
  const { data: stored, error } = await admin
    .from('integration_credentials')
    .select(OAUTH_CREDENTIAL_SELECT)
    .eq('id', credentialId)
    .maybeSingle();
  if (error) {
    log.warn(null, 'oauth.read.failed', { credentialId });
    return null;
  }
  if (!stored || stored.status !== 'active') return null;
  const cred = await hydrateCredential(admin, stored);
  if (!cred) return null;
  if (!isExpiringWithin(cred.expires_at, REFRESH_WINDOW_MS)) return cred;
  return doRefresh(admin, cred);
}

async function hydrateCredential(admin, stored) {
  try {
    const tokens = await readOAuthTokenEnvelope(stored);
    return { ...stored, ...tokens };
  } catch {
    // Missing migration, missing Vault row, wrong KEK and tampering all have the
    // same safe outcome: no outbound request and an explicit reconnect state.
    await markNeedsReauth(admin, stored, 'encrypted credential unavailable');
    log.warn(null, 'oauth.decrypt.failed', {
      credentialId: stored.id,
      provider: stored.provider,
    });
    return null;
  }
}

async function doRefresh(admin, cred) {
  if (!cred.refresh_token) {
    await markNeedsReauth(admin, cred, 'refresh authorization unavailable');
    return null;
  }
  let replacement = null;
  try {
    const r = await callRefresh(cred.provider, cred.refresh_token);
    const expiresAt = r.expires_in
      ? new Date(Date.now() + Number(r.expires_in) * 1000).toISOString()
      : cred.expires_at;
    const tokens = {
      access_token: r.access_token || cred.access_token,
      refresh_token: r.refresh_token || cred.refresh_token,
    };
    replacement = await storeOAuthTokenEnvelope({
      userId: cred.user_id,
      provider: cred.provider,
      tokens,
    });
    const updated = {
      access_token: null,
      refresh_token: null,
      vault_secret_id: replacement.vaultSecretId,
      credential_kek_id: replacement.kekId,
      credential_algorithm: replacement.algorithm,
      credential_version: replacement.version,
      expires_at: expiresAt,
      last_refreshed_at: new Date().toISOString(),
      refresh_failure_count: 0,
      updated_at: new Date().toISOString(),
    };
    const updateResult = await admin
      .from('integration_credentials')
      .update(updated)
      .eq('id', cred.id)
      .eq('user_id', cred.user_id);
    if (updateResult?.error) throw new Error('OAUTH_CREDENTIAL_UPDATE_FAILED');

    if (cred.vault_secret_id && cred.vault_secret_id !== replacement.vaultSecretId) {
      try {
        await deleteOAuthTokenEnvelope(cred.vault_secret_id);
      } catch {
        // The replacement is durable; an orphaned encrypted envelope can be
        // swept later without risking the active credential.
      }
    }
    return { ...cred, ...updated, ...tokens };
  } catch (err) {
    if (replacement?.vaultSecretId) {
      try {
        await deleteOAuthTokenEnvelope(replacement.vaultSecretId);
      } catch {
        // Best effort cleanup only.
      }
    }
    const failures = (cred.refresh_failure_count || 0) + 1;
    await admin
      .from('integration_credentials')
      .update({
        refresh_failure_count: failures,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cred.id);
    if (failures >= 3) {
      await markNeedsReauth(admin, cred, 'refresh failed repeatedly');
    }
    log.warn(null, 'oauth.refresh.failed', {
      provider: cred.provider,
      failures,
      status: err?.status || null,
    });
    return null;
  }
}

async function markNeedsReauth(admin, cred, reason) {
  await admin
    .from('integration_credentials')
    .update({
      status: 'needs_reauth',
      updated_at: new Date().toISOString(),
    })
    .eq('id', cred.id);
  await notifyUser(admin, cred.user_id, {
    event_type: 'loop_kpi_alert',
    priority: 'high',
    payload: {
      kpi_name: `${cred.provider} integration`,
      detail: `Re-authorize ${cred.provider} — ${reason}`,
    },
  });
}

/**
 * Daily pulse handler — refresh everything expiring in the next 24h.
 */
export async function refreshExpiringCredentials(admin) {
  const cutoff = new Date(Date.now() + PROACTIVE_WINDOW_MS).toISOString();
  const { data: storedCredentials, error } = await admin
    .from('integration_credentials')
    .select(OAUTH_CREDENTIAL_SELECT)
    .eq('status', 'active')
    .lte('expires_at', cutoff);
  if (error || !storedCredentials || storedCredentials.length === 0) {
    return { checked: 0, refreshed: 0 };
  }
  let refreshed = 0;
  for (const stored of storedCredentials) {
    const cred = await hydrateCredential(admin, stored);
    if (!cred) continue;
    const r = await doRefresh(admin, cred);
    if (r) refreshed++;
  }
  return { checked: storedCredentials.length, refreshed };
}
