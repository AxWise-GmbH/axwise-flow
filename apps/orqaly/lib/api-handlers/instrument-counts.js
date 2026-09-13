/**
 * Instrument counts handler — returns how many rows the current user has
 * in each "instrument" surface (Knowledge Base / Workflow / Tasks / Projects).
 *
 * GET /api/app?path=instrument-counts
 *   → 200 { ok: true, counts: { knowledge_base, workflow, tasks, projects } }
 *
 * RLS-scoped (uses the caller's JWT). No service-role bypass.
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
import { buildSupabaseUserClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('instrument-counts');

async function countTable(client, table) {
  const { count, error } = await client
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return Number(count || 0);
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const done = log.startTimer(req, 'request', { method: req.method });

  if (req.method !== 'GET') {
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  }

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized. Sign in and retry.');
  }

  const rlKey = `instrument-counts:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded. Please retry shortly.');
  }

  const client = buildSupabaseUserClient(token);
  if (!client) {
    done({ status: 503 });
    return jsonError(res, 503, 'Database not configured');
  }

  try {
    const [knowledge_base, workflow, tasks, projects] = await Promise.all([
      countTable(client, 'knowledge_documents'),
      countTable(client, 'workflows'),
      countTable(client, 'team_tasks'),
      countTable(client, 'projects'),
    ]);

    done({ status: 200 });
    return res.status(200).json({
      ok: true,
      counts: { knowledge_base, workflow, tasks, projects },
    });
  } catch (err) {
    done({ status: 500, error: err?.message });
    return handleApiError(res, err, 'instrument-counts');
  }
}
