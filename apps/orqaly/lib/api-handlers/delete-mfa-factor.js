/**
 * DELETE /api/delete-mfa-factor
 * Removes all TOTP factors for the authenticated user via the Supabase admin API.
 * Uses the service role key so it bypasses the aal2 requirement.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken, getSupabaseUrl } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return jsonError(res, 405, 'Method not allowed');
  }

  try {
    const token = getBearerToken(req);
    const user = await verifySupabaseToken(token);
    if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

    const rlKey = getRateLimitIdentifier(req);
    const rl = checkRateLimit({ key: rlKey, limit: 5, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const admin = buildSupabaseAdminClient();
    if (!admin) {
      return jsonError(
        res,
        500,
        'Server MFA management is not configured.',
        'Set SUPABASE_SERVICE_ROLE_KEY on the server.'
      );
    }

    // Get the user's enrolled factors via admin getUserById
    const { data: userData, error: userErr } = await admin.auth.admin.getUserById(user.id);
    if (userErr) return jsonError(res, 500, userErr.message || 'Failed to get user data');

    const factors = userData?.user?.factors || [];
    const totpFactors = factors.filter(
      (f) => (f.factor_type || f.factorType || '').toLowerCase() === 'totp'
    );

    if (totpFactors.length === 0) {
      return res.status(200).json({ success: true, message: 'No TOTP factors found', deleted: 0 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabaseUrl = getSupabaseUrl();
    const deleted = [];
    const failed = [];

    for (const factor of totpFactors) {
      const factorId = factor.id || factor.factor_id;
      if (!factorId) continue;

      // Try SDK admin MFA method first (supabase-js v2 recent versions)
      if (typeof admin.auth.admin.mfa?.deleteFactor === 'function') {
        const { error } = await admin.auth.admin.mfa.deleteFactor({
          userId: user.id,
          id: factorId,
        });
        if (error) {
          failed.push({ id: factorId, error: error.message });
        } else {
          deleted.push(factorId);
        }
      } else {
        // Fallback: Supabase Auth admin REST endpoint
        try {
          const resp = await fetch(
            `${supabaseUrl}/auth/v1/admin/users/${user.id}/factors/${factorId}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${serviceRoleKey}`,
                apikey: serviceRoleKey,
              },
            }
          );
          if (resp.ok || resp.status === 404) {
            deleted.push(factorId);
          } else {
            const errData = await resp.json().catch(() => ({}));
            failed.push({ id: factorId, error: errData.message || `HTTP ${resp.status}` });
          }
        } catch (e) {
          failed.push({ id: factorId, error: String(e?.message || e) });
        }
      }
    }

    return res.status(200).json({
      success: failed.length === 0,
      deleted: deleted.length,
      failed,
    });
  } catch (err) {
    return handleApiError(res, err, 'delete-mfa-factor');
  }
}
