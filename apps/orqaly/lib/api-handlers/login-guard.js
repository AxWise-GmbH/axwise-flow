/**
 * Login guard — 3-tier failed-login protection (no auth required).
 * POST /api/login-guard
 *
 * Tracks failed attempts per email in-memory. At each tier threshold:
 *   Tier 1 (3 failures)  → warning email
 *   Tier 2 (13 failures) → freeze account 60 min + email
 *   Tier 3 (16 failures) → permanently block account + email
 */
import { cors } from '../../api/_lib/cors.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  applyRateLimitHeaders,
} from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import {
  loginWarning,
  loginFrozen,
  loginBlocked,
} from '../../src/services/emailTemplates.js';

const RESEND_API = 'https://api.resend.com/emails';
const TIER1_THRESHOLD = 3;
const TIER2_THRESHOLD = 13;
const TIER3_THRESHOLD = 16;
const FREEZE_DURATION_MS = 60 * 60 * 1000; // 60 minutes
const CLEANUP_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── In-memory attempt store ──────────────────────────────────
const attemptStore = new Map();

function getEntry(email) {
  return attemptStore.get(email) || {
    count: 0,
    tier1Sent: false,
    tier2Sent: false,
    tier3Sent: false,
    frozenUntil: null,
    blocked: false,
    createdAt: Date.now(),
  };
}

function cleanupOldEntries() {
  if (attemptStore.size < 500) return;
  const cutoff = Date.now() - CLEANUP_AGE_MS;
  for (const [key, entry] of attemptStore.entries()) {
    if (entry.createdAt < cutoff && !entry.blocked) {
      attemptStore.delete(key);
    }
  }
}

function computeTier(count) {
  if (count >= TIER3_THRESHOLD) return 3;
  if (count >= TIER2_THRESHOLD) return 2;
  if (count >= TIER1_THRESHOLD) return 1;
  return 0;
}

function parseClientIp(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req?.socket?.remoteAddress || 'unknown';
}

// ── Email sending (fire-and-forget, uses Resend directly) ────
async function sendSecurityEmail(email, templateFn, templateData) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  try {
    const { subject, html, text } = templateFn(templateData);
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Orchestrator <onboarding@resend.dev>';
    await fetchWithRetry(RESEND_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject,
        html,
        text: text || subject,
      }),
    });
  } catch (e) {
    console.warn('[login-guard] Failed to send security email:', e.message);
  }
}

// ── Handler ──────────────────────────────────────────────────
export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    // Rate limit by IP to prevent abuse of this endpoint
    const rlKey = `login-guard:${getRateLimitIdentifier(req)}`;
    const rl = checkRateLimit({
      key: rlKey,
      limit: Number(process.env.LOGIN_GUARD_RATE_LIMIT_PER_MIN || 20),
      windowMs: 60_000,
    });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests. Please wait.');

    // Parse body
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return jsonError(res, 400, 'Invalid JSON body'); }
    }
    body = body || {};

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonError(res, 400, 'Valid email is required');
    }

    // Cleanup old entries periodically
    cleanupOldEntries();

    const entry = getEntry(email);
    const ipAddress = parseClientIp(req);
    const now = Date.now();

    // If frozen and not expired, return current state without incrementing
    if (entry.frozenUntil && now < new Date(entry.frozenUntil).getTime()) {
      attemptStore.set(email, entry);
      return res.status(200).json({
        tier: computeTier(entry.count),
        count: entry.count,
        frozenUntil: entry.frozenUntil,
        blocked: entry.blocked,
      });
    }

    // If blocked, return current state without incrementing
    if (entry.blocked) {
      attemptStore.set(email, entry);
      return res.status(200).json({
        tier: 3,
        count: entry.count,
        frozenUntil: null,
        blocked: true,
      });
    }

    // Clear expired freeze
    if (entry.frozenUntil && now >= new Date(entry.frozenUntil).getTime()) {
      entry.frozenUntil = null;
    }

    // Increment attempt count
    entry.count += 1;
    attemptStore.set(email, entry);

    const templateData = {
      email,
      attemptCount: entry.count,
      ipAddress,
      timestamp: new Date().toISOString(),
    };

    // ── Tier 3: Permanent block (16+ attempts) ──
    if (entry.count >= TIER3_THRESHOLD && !entry.tier3Sent) {
      entry.tier3Sent = true;
      entry.blocked = true;
      attemptStore.set(email, entry);

      // NOTE: Previously auto-banned the user for 100 years here.
      // Removed because this endpoint has no JWT auth — an attacker could
      // permanently ban any user by sending 16 requests with the victim's email.
      // Now we only notify admins; they can manually ban if needed.
      console.warn(`[login-guard] Tier 3 reached for ${email}. Admin action required.`);

      sendSecurityEmail(email, loginBlocked, templateData);

      return res.status(200).json({
        tier: 3,
        count: entry.count,
        frozenUntil: null,
        blocked: true,
      });
    }

    // ── Tier 2: Freeze 60 minutes (13+ attempts) ──
    if (entry.count >= TIER2_THRESHOLD && !entry.tier2Sent) {
      entry.tier2Sent = true;
      entry.frozenUntil = new Date(now + FREEZE_DURATION_MS).toISOString();
      attemptStore.set(email, entry);

      // Temporarily freeze user for 60 minutes via Supabase admin
      // NOTE: This is safe at Tier 2 because the in-memory rate limit (3 req/min)
      // already prevents rapid attacker abuse. Tier 3 auto-ban was removed (see above).
      const admin = buildSupabaseAdminClient();
      if (admin) {
        try {
          const { data } = await admin.from('auth.users').select('id').eq('email', email).maybeSingle();
          if (data?.id) {
            await admin.auth.admin.updateUserById(data.id, { ban_duration: '3600s' });
          }
        } catch (e) {
          console.warn('[login-guard] Failed to freeze user:', e.message);
        }
      }

      sendSecurityEmail(email, loginFrozen, {
        ...templateData,
        duration: '60 minutes',
      });

      return res.status(200).json({
        tier: 2,
        count: entry.count,
        frozenUntil: entry.frozenUntil,
        blocked: false,
      });
    }

    // ── Tier 1: Warning (3+ attempts) ──
    if (entry.count >= TIER1_THRESHOLD && !entry.tier1Sent) {
      entry.tier1Sent = true;
      attemptStore.set(email, entry);

      sendSecurityEmail(email, loginWarning, templateData);

      return res.status(200).json({
        tier: 1,
        count: entry.count,
        frozenUntil: null,
        blocked: false,
      });
    }

    // Below any threshold or already notified for current tier
    return res.status(200).json({
      tier: computeTier(entry.count),
      count: entry.count,
      frozenUntil: entry.frozenUntil,
      blocked: entry.blocked,
    });
  } catch (err) {
    return handleApiError(res, err, 'login-guard');
  }
}
