/**
 * POST /api/app?path=setup-pin
 * Lets super admin set/change the global access PIN.
 * Stores a scrypt hash in the app_settings table.
 */
import crypto from 'node:crypto';
import { cors } from '../../api/_lib/cors.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    // Rate limit — 3 attempts per minute
    const rlKey = `setup-pin:${getRateLimitIdentifier(req)}`;
    const rl = checkRateLimit({ key: rlKey, limit: 3, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many attempts. Try again later.');

    // Auth
    const token = getBearerToken(req);
    if (!token) return jsonError(res, 401, 'Missing authorization token');
    const user = await verifySupabaseToken(token);
    if (!user?.id) return jsonError(res, 401, 'Invalid or expired token');

    // Super admin check
    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (roleRow?.role_id !== 'role-super-admin') {
      return jsonError(res, 403, 'Only Super Admin can set the access PIN.');
    }

    // Validate PIN
    const { pin } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!pin || typeof pin !== 'string') {
      return jsonError(res, 400, 'Missing pin');
    }
    const trimmed = pin.trim();
    if (!/^\d{4,8}$/.test(trimmed)) {
      return jsonError(res, 400, 'PIN must be 4-8 digits.');
    }

    // Hash with scrypt
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(trimmed, salt, 64).toString('hex');
    const value = `${salt}:${hash}`;

    // Upsert into app_settings
    const { error } = await admin
      .from('app_settings')
      .upsert(
        { key: 'access_pin', value, updated_by: user.id, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    if (error) {
      console.error('[setup-pin] Upsert error:', error);
      const detail = error.message || error.hint || error.code || 'unknown error';
      return jsonError(res, 500, `Failed to save PIN: ${detail}`);
    }

    return res.status(200).json({ success: true, message: 'Access PIN updated.' });
  } catch (err) {
    return handleApiError(res, err, 'setup-pin');
  }
}
