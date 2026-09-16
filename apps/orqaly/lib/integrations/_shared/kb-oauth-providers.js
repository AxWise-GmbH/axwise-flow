/**
 * OAuth config for KB cloud sources (Dropbox, OneDrive). Holds the authorize +
 * token endpoints, scopes and client credentials used by the kb-oauth authorize
 * step and the public oauth-callback exchange. Token URLs match the refresh
 * configs in oauth-refresh.js so refresh keeps working after the first grant.
 *
 * Also provides HMAC-signed `state` (userId + provider + nonce + expiry) so the
 * unauthenticated callback can trust who started the flow.
 */
import crypto from 'node:crypto';

export const KB_OAUTH_PROVIDERS = {
  dropbox: {
    authorizeUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    scopes: ['account_info.read', 'files.metadata.read', 'files.content.read'],
    clientId: () => process.env.DROPBOX_CLIENT_ID,
    clientSecret: () => process.env.DROPBOX_CLIENT_SECRET,
    // Dropbox only issues a refresh_token when asked for offline access.
    extraAuthParams: { token_access_type: 'offline' },
  },
  onedrive: {
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['offline_access', 'User.Read', 'Files.Read', 'Files.Read.All'],
    clientId: () => process.env.ONEDRIVE_CLIENT_ID,
    clientSecret: () => process.env.ONEDRIVE_CLIENT_SECRET,
    extraAuthParams: {},
  },
};

// source_type -> oauth provider key (identity here, but keeps callers decoupled).
export const SOURCE_TO_OAUTH = { dropbox: 'dropbox', onedrive: 'onedrive' };

export function getOAuthProvider(source) {
  const key = SOURCE_TO_OAUTH[source];
  return key ? KB_OAUTH_PROVIDERS[key] : null;
}

export function isOAuthConfigured(source) {
  const p = getOAuthProvider(source);
  return Boolean(p && p.clientId() && p.clientSecret());
}

/** Public base URL for building the callback redirect_uri. */
export function callbackRedirectUri(provider) {
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return `${base}/api/oauth-callback?provider=${provider}`;
}

function stateSecret() {
  // Reuse the envelope KEK as the signing secret; fall back to a dedicated var.
  return process.env.OAUTH_STATE_SECRET || process.env.ORQ_KEK_V1 || '';
}

/** Sign { userId, provider, nonce, exp } into an opaque, tamper-proof state. */
export function signState({ userId, provider, ttlMs = 10 * 60 * 1000 }, nowMs) {
  const payload = { userId, provider, nonce: crypto.randomBytes(8).toString('hex'), exp: nowMs + ttlMs };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** Verify a signed state; returns the payload or null (bad sig / expired). */
export function verifyState(state, nowMs) {
  if (typeof state !== 'string' || !state.includes('.')) return null;
  const [body, sig] = state.split('.');
  const expected = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload?.exp || payload.exp < nowMs) return null;
  return payload;
}
