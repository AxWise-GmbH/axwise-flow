/**
 * Notion -> Knowledge Base sync endpoint. Pulls the user's shared Notion pages
 * using their BYOK Notion key and ingests them into knowledge_documents.
 * The ingest core lives in _shared/notion-ingest.js (shared with kb-connections).
 *
 * POST /api/app?path=notion-sync   body: { kb_connection_id? }
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  applyRateLimitHeaders,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { resolveUserKey } from '../security/resolve-user-key.js';
import { syncNotionToKb } from './_shared/notion-ingest.js';

const log = createLogger('notion-sync');

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

  const rlKey = `notion-sync:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 10, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');

  try {
    const resolved = await resolveUserKey({
      userId: user.id,
      provider: 'data:notion',
      reason: 'notion-sync',
    });
    if (!resolved.key) {
      return jsonError(
        res,
        400,
        'Notion API key not found. Please connect your Notion account in Setup first.'
      );
    }

    const connectionId =
      (typeof req.body === 'object' && req.body && req.body.kb_connection_id) || null;
    const { count, pages } = await syncNotionToKb({
      admin,
      userId: user.id,
      apiKey: resolved.key,
      connectionId,
    });

    log.info(req, 'notion.synced', { count });
    return res.status(200).json({ success: true, count, pages });
  } catch (err) {
    if (err?.status) return jsonError(res, err.status, err.message || 'Notion sync failed');
    log.error(req, 'sync.failed', err);
    return handleApiError(res, err, 'notion-sync');
  }
}
