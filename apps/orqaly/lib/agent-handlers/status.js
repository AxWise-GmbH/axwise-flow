/**
 * Get job status by id. For polling after 202 enqueue.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import {
  checkRateLimit,
  applyRateLimitHeaders,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';

export default async function handler(req, res) {
  const safeReq = req && typeof req === 'object' ? req : {};
  if (!safeReq.headers) safeReq.headers = {};
  cors(res, safeReq);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  // ── Auth ──────────────────────────────────────────────────────
  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

  try {
    const rlKey = getRateLimitIdentifier(req);
    const rl = checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const id = (req.query?.id || '').trim();
    if (!id) return jsonError(res, 400, 'Missing query id');

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Agent jobs not configured');

    const { data: row, error } = await admin
      .from('agent_jobs')
      .select('id, status, result, error, created_at, updated_at, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      const msg = error.message || 'Lookup failed';
      if ((msg.includes('agent_jobs') && msg.includes('schema cache')) || error.code === '42P01')
        return jsonError(res, 503, 'agent_jobs table missing; run migration 017_agent_jobs.sql');
      return jsonError(res, 500, msg);
    }
    if (!row) return jsonError(res, 404, 'Job not found');

    return res.status(200).json({
      job_id: row.id,
      status: row.status,
      result: row.result ?? undefined,
      error: row.error ?? undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  } catch (err) {
    return handleApiError(res, err, 'agent/status');
  }
}
