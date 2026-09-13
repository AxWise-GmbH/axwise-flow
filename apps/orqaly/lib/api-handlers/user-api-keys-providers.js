/**
 * Static catalog of providers the UI renders. Platform-fallback availability
 * (based on server env) is exposed per provider so the UI can show "platform
 * default available" vs "not configured".
 *
 * GET /api/app?path=user-api-keys-providers  -> { providers: [...] }
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError } from '../../api/_lib/errors.js';
import { createLogger } from '../../api/_lib/logger.js';
import { PROVIDER_CATALOG } from '../security/provider-catalog.js';

const log = createLogger('user-api-keys-providers');

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  const done = log.startTimer(req, 'request');

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  const providers = Object.entries(PROVIDER_CATALOG).map(([id, entry]) => ({
    id,
    envVar: entry.envVar,
    hasProbe: !!entry.probe,
    platformFallbackAvailable: !!(entry.envVar && process.env[entry.envVar]),
  }));

  done({ status: 200, count: providers.length });
  return res.status(200).json({ providers });
}
