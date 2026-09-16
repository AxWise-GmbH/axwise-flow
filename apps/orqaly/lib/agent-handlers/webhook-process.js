/**
 * Webhook handler for Supabase Database Webhooks.
 *
 * Triggered on INSERT into agent_jobs table. Verifies the webhook
 * signature, then immediately processes the newly queued job.
 * This replaces the daily cron as the primary processing trigger.
 */
import crypto from 'node:crypto';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { processNextJob } from './job-processor.js';

const log = createLogger('webhook-process');

/**
 * Verify webhook auth token.
 * Accepts either a direct token match (x-webhook-token) or
 * HMAC-SHA256 signature (x-supabase-signature) for backwards compat.
 */
function verifyWebhookAuth(req) {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!secret) return false;

  // Direct token match (sent by pg_net trigger)
  const token = req.headers?.['x-webhook-token'];
  if (token) {
    try {
      return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret));
    } catch {
      return false;
    }
  }

  // HMAC signature fallback
  const sig = req.headers?.['x-supabase-signature'];
  if (!sig) return false;

  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  if (!verifyWebhookAuth(req)) {
    log.warn(req, 'webhook.auth_failed');
    return jsonError(res, 401, 'Invalid webhook signature');
  }

  const { type, table, record } = req.body || {};
  if (type !== 'INSERT' || table !== 'agent_jobs') {
    return res.status(200).json({ skipped: true, reason: `Ignored event: ${type} on ${table}` });
  }

  const jobId = record?.id || null;
  const done = log.startTimer(req, 'webhook-process');

  try {
    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Agent jobs not configured');

    // Process the specific job that triggered the webhook, not just the oldest
    const result = await processNextJob(admin, null, jobId);

    done({ status: 200, ...result });
    return res.status(200).json(result);
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'agent/webhook-process');
  }
}
