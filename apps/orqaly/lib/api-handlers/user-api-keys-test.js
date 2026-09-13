/**
 * Probe a candidate API key without saving it.
 *
 * POST /api/app?path=user-api-keys-test   { provider, apiKey }
 *   -> { ok, code, status?, latencyMs?, message? }
 *
 * Never echoes the key. Response is sanitized.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { isKnownProvider, probeProviderKey } from '../security/provider-catalog.js';

const log = createLogger('user-api-keys-test');

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const done = log.startTimer(req, 'request');

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  const rl = checkRateLimit({
    key: `user-api-keys-test:${getRateLimitIdentifier(req, user.id)}`,
    limit: 30,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return jsonError(res, 400, 'Invalid JSON'); }
  }

  const { provider, apiKey } = body || {};
  if (!provider || !isKnownProvider(provider)) return jsonError(res, 400, 'Unknown provider');
  if (typeof apiKey !== 'string' || apiKey.trim().length < 8) return jsonError(res, 400, 'Missing apiKey');

  try {
    const probe = await probeProviderKey(provider, apiKey.trim());
    done({ status: 200, code: probe.code });
    return res.status(200).json(probe);
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'user-api-keys-test');
  }
}
