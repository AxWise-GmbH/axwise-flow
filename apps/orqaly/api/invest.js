/**
 * Investment API dispatcher.
 * Routes: investors, deals, commitments, pools
 */
import { jsonError, handleApiError } from './_lib/errors.js';
import { applySecurityHeaders } from './_lib/security-headers.js';
import { enforceDemoWriteGuard } from './_lib/demo-guard.js';
import { verifySupabaseToken, getBearerToken } from './_lib/auth.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from './_lib/rate-limit.js';
import { buildSupabaseAdminClient } from './_lib/supabase-server.js';
import { createLogger } from './_lib/logger.js';

import investors from '../lib/invest-handlers/investors.js';
import deals from '../lib/invest-handlers/deals.js';
import commitments from '../lib/invest-handlers/commitments.js';
import pools from '../lib/invest-handlers/pools.js';
import documents from '../lib/invest-handlers/documents.js';

const log = createLogger('invest');

const HANDLERS = { investors, deals, commitments, pools, documents };

export default async function handler(req, res) {
  applySecurityHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const rl = checkRateLimit({ key: getRateLimitIdentifier(req, user), limit: 60, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded');

  const path = (req.query?.path || '').trim().toLowerCase();
  const fn = HANDLERS[path];
  if (!fn) return jsonError(res, 404, `Unknown path: ${path}`);

  if (await enforceDemoWriteGuard(req, res)) return;
  const done = log.startTimer(req, 'request', { method: req.method, path });
  try {
    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Not configured');
    const result = await fn(admin, user, req);
    if (result.error) return jsonError(res, result.status, result.error);
    done({ status: result.status });
    return res.status(result.status).json(result.data);
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, `invest/${path}`);
  }
}
