/**
 * Composio connect handler — OAuth flow and connection management.
 *
 * Routes:
 *   GET  /api/app?path=composio-connect  — list connected Composio apps
 *   POST /api/app?path=composio-connect  { appName, redirectUrl? } — initiate OAuth
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
import { isComposioConfigured } from '../composio/client.js';
import { initiateComposioConnection, listComposioConnections } from '../composio/executor.js';

const log = createLogger('composio-connect');

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const done = log.startTimer(req, 'request', { method: req.method });

  // ── Auth ──────────────────────────────────────────────────────
  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  // ── Rate limit: 20 req / min ──────────────────────────────────
  const rlKey = `composio-connect:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  // ── Check Composio is configured ──────────────────────────────
  if (!isComposioConfigured()) {
    done({ status: 503 });
    return jsonError(res, 503, 'Composio is not configured. Add COMPOSIO_API_KEY to environment.');
  }

  try {
    if (req.method === 'GET') {
      return await handleListConnections(req, res, user, done);
    }
    if (req.method === 'POST') {
      return await handleInitiateConnection(req, res, user, done);
    }
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'composio-connect');
  }
}

/**
 * GET — List user's connected Composio apps.
 */
async function handleListConnections(req, res, user, done) {
  const entityId = user.id;
  const connections = await listComposioConnections(entityId);

  const mapped = connections.map((c) => ({
    id: c.id || c.connectedAccountId,
    appName: c.appName || c.integrationId,
    status: c.status || 'active',
    createdAt: c.createdAt,
  }));

  done({ status: 200, count: mapped.length });
  return res.status(200).json({ connections: mapped });
}

/**
 * POST — Initiate OAuth connection for a Composio app.
 */
async function handleInitiateConnection(req, res, user, done) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return jsonError(res, 400, 'Invalid JSON'); }
  }

  const { appName, redirectUrl } = body || {};
  if (!appName) {
    done({ status: 400 });
    return jsonError(res, 400, 'Missing appName');
  }

  const entityId = user.id;
  const result = await initiateComposioConnection(appName, entityId, redirectUrl);

  if (result.error) {
    done({ status: 400, appName, error: result.error });
    return res.status(400).json({ success: false, error: result.error });
  }

  log.info(req, 'composio.connection.initiated', { appName, entityId });
  done({ status: 200, appName });

  return res.status(200).json({
    success: true,
    appName,
    redirectUrl: result.redirectUrl,
    connectionId: result.connectionId,
    status: result.status,
  });
}
