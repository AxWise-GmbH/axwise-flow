/**
 * POST /api/verify-pin
 * Validates an access PIN server-side.
 * Checks DB (app_settings) first, falls back to ACCESS_PIN env var.
 */
import crypto from 'node:crypto';
import { cors } from '../../api/_lib/cors.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

/** Verify a PIN against a scrypt salt:hash string. */
function verifyScryptPin(pin, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(pin, salt, 64).toString('hex');
  const a = Buffer.from(derived, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    // Strict rate limit — 5 attempts per minute per IP
    const rlKey = `verify-pin:${getRateLimitIdentifier(req)}`;
    const rl = checkRateLimit({ key: rlKey, limit: 5, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many attempts. Try again later.');

    const { pin } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!pin || typeof pin !== 'string') {
      return jsonError(res, 400, 'Missing pin');
    }

    const trimmed = pin.trim();

    // 1) Check DB-stored PIN first (set by super admin in Settings)
    const admin = buildSupabaseAdminClient();
    if (admin) {
      try {
        const { data } = await admin
          .from('app_settings')
          .select('value')
          .eq('key', 'access_pin')
          .maybeSingle();

        if (data?.value) {
          const valid = verifyScryptPin(trimmed, data.value);
          if (valid) return res.status(200).json({ valid: true });
          return res.status(401).json({ valid: false, error: 'Invalid PIN' });
        }
      } catch {
        // Table may not exist yet — fall through to env var
      }
    }

    // 2) Fall back to ACCESS_PIN env var
    const serverPin = (process.env.ACCESS_PIN || '').trim();
    if (!serverPin) {
      return jsonError(res, 503, 'Access PIN not configured on server.');
    }

    const a = Buffer.from(trimmed.padEnd(64, '\0'));
    const b = Buffer.from(serverPin.padEnd(64, '\0'));
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return res.status(200).json({ valid: true });
    }

    return res.status(401).json({ valid: false, error: 'Invalid PIN' });
  } catch (err) {
    return handleApiError(res, err, 'verify-pin');
  }
}
