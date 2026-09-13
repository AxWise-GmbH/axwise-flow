/**
 * Send email handler (consolidated under api/router for Vercel Hobby limit).
 * POST /api/send-email
 */
const RESEND_API = 'https://api.resend.com/emails';
const MAX_RECIPIENTS = 10;

import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { sendEmailBodySchema } from '../../api/_lib/validate.js';
import { retryWithBackoff } from '../../api/_lib/retry.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('send-email');

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Timer starts here; emits request.start log ──────────────────────────
  const done = log.startTimer(req, 'request', { method: req.method });

  if (req.method !== 'POST') {
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  }

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized. Sign in and retry.');
  }

  const rlKey = `send-email:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({
    key: rlKey,
    limit: Number(process.env.SEND_EMAIL_RATE_LIMIT_PER_MIN || 12),
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    log.warn(req, 'rate.limited', {
      key: rlKey,
      limit: rl.limit,
      remaining: rl.remaining,
      reset_at: rl.resetAt,
    });
    done({ status: 429 });
    return jsonError(
      res,
      429,
      'Rate limit exceeded for email sending. Please retry shortly.',
      'Too many email requests in the current minute window.'
    );
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    log.error(req, 'config.missing', { field: 'RESEND_API_KEY' });
    done({ status: 500 });
    return jsonError(res, 500, 'RESEND_API_KEY is not configured');
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        done({ status: 400 });
        return jsonError(res, 400, 'Invalid JSON body');
      }
    }
    body = body || {};

    const parsed = sendEmailBodySchema.safeParse(body);

    if (!parsed.success) {
      const msg = parsed.error.errors?.[0]?.message ?? 'Invalid request';
      done({ status: 400 });
      return jsonError(res, 400, msg);
    }

    const { to, subject, text, html } = parsed.data;
    const toList = Array.isArray(to) ? to : [to];
    if (toList.length > MAX_RECIPIENTS) {
      done({ status: 400 });
      return jsonError(res, 400, `Maximum ${MAX_RECIPIENTS} recipients`);
    }

    const fromServer = process.env.RESEND_FROM_EMAIL || 'Orqaly <noreply@orqaly.com>';
    const payload = {
      from: fromServer,
      to: toList,
      subject: String(subject).slice(0, 500),
      ...(html && { html: String(html).slice(0, 50000) }),
      ...(text && !html && { text: String(text).slice(0, 50000) }),
    };

    const response = await retryWithBackoff(
      () =>
        fetch(RESEND_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(payload),
        }),
      { maxRetries: 3, initialDelay: 1000, maxDelay: 10000 }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      log.error(req, 'resend.error', new Error(data.message || 'Failed to send email'), {
        status: response.status,
        recipients: toList.length,
      });
      done({ status: response.status });
      return jsonError(res, response.status, data.message || 'Failed to send email', data.detail);
    }

    done({ status: 200, email_id: data.id, recipients: toList.length });
    return res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    log.error(req, 'unhandled', err);
    done({ status: 500 });
    return handleApiError(res, err, 'send-email');
  }
}
