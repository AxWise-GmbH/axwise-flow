/**
 * KB OAuth - step 1 (authorize). Returns the provider consent URL for a cloud
 * source (Dropbox / OneDrive) with an HMAC-signed `state` tying the flow to the
 * signed-in user. The browser opens the URL; the provider redirects back to the
 * public /api/oauth-callback which exchanges the code and stores the tokens.
 *
 * GET/POST /api/app?path=kb-oauth&action=authorize&provider=dropbox|onedrive
 *   -> { url }
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { applyRateLimitHeaders, checkRateLimit, getRateLimitIdentifier } from '../../api/_lib/rate-limit.js';
import {
  getOAuthProvider,
  isOAuthConfigured,
  callbackRedirectUri,
  signState,
} from '../integrations/_shared/kb-oauth-providers.js';

export default async function handler(req, res) {
  cors(res, req);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const user = await verifySupabaseToken(getBearerToken(req));
    if (!user) return jsonError(res, 401, 'Unauthorized');

    const rl = checkRateLimit({
      key: `kb-oauth:${getRateLimitIdentifier(req, user.id)}`,
      limit: 15,
      windowMs: 60_000,
    });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const action = req.query?.action || req.body?.action || 'authorize';
    const provider = String(req.query?.provider || req.body?.provider || '').toLowerCase();

    if (action !== 'authorize') return jsonError(res, 400, 'Unsupported action');

    const cfg = getOAuthProvider(provider);
    if (!cfg) return jsonError(res, 400, `OAuth is not available for "${provider}".`);
    if (!isOAuthConfigured(provider)) {
      return jsonError(res, 503, `${provider} OAuth is not configured on this server.`);
    }
    if (!process.env.PUBLIC_BASE_URL) {
      return jsonError(res, 503, 'PUBLIC_BASE_URL is not configured (needed for the OAuth redirect).');
    }

    const state = signState({ userId: user.id, provider }, Date.now());
    const params = new URLSearchParams({
      client_id: cfg.clientId(),
      response_type: 'code',
      redirect_uri: callbackRedirectUri(provider),
      scope: cfg.scopes.join(' '),
      state,
      ...(cfg.extraAuthParams || {}),
    });
    const url = `${cfg.authorizeUrl}?${params.toString()}`;
    return res.status(200).json({ url });
  } catch (err) {
    return handleApiError(res, err, 'kb-oauth');
  }
}
