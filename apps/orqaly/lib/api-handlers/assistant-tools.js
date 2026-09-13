/**
 * Assistant tools catalog endpoint.
 * GET /api/app?path=assistant-tools
 *
 * Returns the full TOOL_CATALOG plus risk-level groupings so the frontend
 * "View Actions → Command Catalog" browser can render a searchable, grouped,
 * risk-tagged list without duplicating the catalog source-of-truth.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { TOOL_CATALOG, RISK_LEVELS, getRiskLevel } from './assistant-chat.js';

const log = createLogger('assistant-tools');

let cachedResponse = null;

function buildResponse() {
  if (cachedResponse) return cachedResponse;
  cachedResponse = {
    tools: TOOL_CATALOG.map((t) => ({
      name: t.name,
      description: t.description || '',
      params: t.params || {},
      category: (t.name.split('.')[0] || 'other'),
      risk: getRiskLevel(t.name),
    })),
    risk: {
      safe: [...RISK_LEVELS.safe],
      medium: [...RISK_LEVELS.medium],
      high: [...RISK_LEVELS.high],
      critical: [...RISK_LEVELS.critical],
    },
  };
  return cachedResponse;
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonError(res, 405, 'GET only');

  const done = log.startTimer(req, 'request', { method: req.method });

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  const rlKey = `assistant-tools:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  done({ status: 200 });
  return res.status(200).json({ ok: true, ...buildResponse() });
}
