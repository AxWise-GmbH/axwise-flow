import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');
  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (roleRow?.role_id !== 'role-super-admin') {
    return jsonError(res, 403, 'Only Super Admin can toggle features.');
  }

  const { entityId, disabled, pin, reason } = req.body || {};
  if (!entityId || typeof disabled !== 'boolean') {
    return jsonError(res, 400, 'Missing entityId or disabled flag');
  }

  // PIN verification — check against admin_pin in user_roles metadata or a simple env var
  const expectedPin = process.env.ADMIN_PIN || '1234';
  if (!pin || String(pin) !== String(expectedPin)) {
    // Log failed attempt
    try {
      await admin.from('audit_log').insert({
        action: 'toggle_feature_failed',
        entity: 'feature_flags',
        entity_id: entityId,
        user_id: user.id,
        user_email: user.email,
        details: JSON.stringify({ reason: 'Invalid PIN' }),
      });
    } catch { /* silent */ }
    return jsonError(res, 403, 'Invalid PIN');
  }

  try {
    // Upsert feature flag
    const { error: upsertErr } = await admin
      .from('feature_flags')
      .upsert({
        entity_id: entityId,
        disabled,
        disabled_by: user.id,
        disabled_at: disabled ? new Date().toISOString() : null,
        reason: reason || (disabled ? 'Disabled via Data page' : 'Re-enabled via Data page'),
      }, { onConflict: 'entity_id' });

    if (upsertErr) return jsonError(res, 500, upsertErr.message);

    // Audit log
    await admin.from('audit_log').insert({
      action: disabled ? 'feature_disabled' : 'feature_enabled',
      entity: 'feature_flags',
      entity_id: entityId,
      user_id: user.id,
      user_email: user.email,
      details: JSON.stringify({ disabled, reason }),
    });

    return res.status(200).json({ ok: true, entityId, disabled });
  } catch (err) {
    return jsonError(res, 500, err.message);
  }
}
