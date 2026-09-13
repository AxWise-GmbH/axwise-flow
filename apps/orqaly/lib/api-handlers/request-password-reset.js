/**
 * Request password reset handler (consolidated under api/router for Vercel Hobby limit).
 * POST /api/request-password-reset
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('request-password-reset');

const RESEND_API = 'https://api.resend.com/emails';
const ROLES_MIGRATION_HINT =
  'Run the Roles & Permissions migration (supabase/migrations/013_roles_permissions.sql).';

function isMissingTableError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema cache');
}

async function ensureSuperAdmin({ admin, userId, res }) {
  let callerRoleId = null;
  try {
    const { data: roleRow, error: roleErr } = await admin
      .from('user_roles')
      .select('role_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (roleErr && isMissingTableError(roleErr))
      return {
        ok: false,
        response: jsonError(
          res,
          500,
          'Roles & permissions tables are not initialized',
          ROLES_MIGRATION_HINT
        ),
      };
    if (roleErr)
      return { ok: false, response: jsonError(res, 500, 'Failed to verify inviter role') };
    callerRoleId = roleRow?.role_id || null;
  } catch (e) {
    if (isMissingTableError(e))
      return {
        ok: false,
        response: jsonError(
          res,
          500,
          'Roles & permissions tables are not initialized',
          ROLES_MIGRATION_HINT
        ),
      };
    return { ok: false, response: jsonError(res, 500, 'Failed to verify inviter role') };
  }
  let superCount = 0;
  try {
    const { count, error } = await admin
      .from('user_roles')
      .select('user_id', { count: 'exact', head: true })
      .eq('role_id', 'role-super-admin');
    if (error && isMissingTableError(error))
      return {
        ok: false,
        response: jsonError(
          res,
          500,
          'Roles & permissions tables are not initialized',
          ROLES_MIGRATION_HINT
        ),
      };
    if (error)
      return { ok: false, response: jsonError(res, 500, 'Failed to verify authorization state') };
    superCount = count || 0;
  } catch (e) {
    if (isMissingTableError(e))
      return {
        ok: false,
        response: jsonError(
          res,
          500,
          'Roles & permissions tables are not initialized',
          ROLES_MIGRATION_HINT
        ),
      };
    return { ok: false, response: jsonError(res, 500, 'Failed to verify authorization state') };
  }
  if (superCount === 0 && callerRoleId !== 'role-super-admin') {
    const { error: upErr } = await admin
      .from('user_roles')
      .upsert(
        { user_id: userId, role_id: 'role-super-admin', assigned_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    if (upErr)
      return { ok: false, response: jsonError(res, 500, 'Failed to bootstrap Super Admin role') };
    callerRoleId = 'role-super-admin';
  }
  if (callerRoleId !== 'role-super-admin')
    return {
      ok: false,
      response: jsonError(res, 403, 'Only Super Admin can send password reset.'),
    };
  return { ok: true };
}

function getRecoveryRedirectTo() {
  const prod = 'https://orchestratori.vercel.app/auth/callback?flow=recovery';
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (isProd) return prod;
  const explicit =
    process.env.INVITE_REDIRECT_TO ||
    process.env.AUTH_REDIRECT_TO ||
    process.env.PUBLIC_APP_REDIRECT_TO ||
    '';
  if (explicit)
    return explicit.replace(/\/$/, '') + (explicit.includes('?') ? '&' : '?') + 'flow=recovery';
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL}/auth/callback?flow=recovery`;
  return process.env.VITE_DEV_APP_URL
    ? `${String(process.env.VITE_DEV_APP_URL).replace(/\/$/, '')}/auth/callback?flow=recovery`
    : prod;
}

function getPasswordResetHtml(confirmationUrl) {
  const escaped = (confirmationUrl || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Reset Your Password</title></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;line-height:1.6;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <p style="text-align:center;font-size:20px;font-weight:700;color:#0f172a;margin-bottom:24px;">Orchestrator</p>
  <div style="background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);border:1px solid #e2e8f0;overflow:hidden;">
    <div style="height:4px;background:linear-gradient(90deg,#3b82f6 0%,#6366f1 100%);"></div>
    <div style="padding:32px 28px;">
      <h1 style="margin:0 0 20px;font-size:22px;font-weight:600;color:#0f172a;">Reset your password</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#334155;">You requested a password reset. Click the button below to set a new password. This link will expire in 1 hour.</p>
      <p style="margin-top:28px;"><a href="${escaped}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#fff;text-decoration:none;background:linear-gradient(180deg,#3b82f6 0%,#2563eb 100%);border-radius:8px;">Reset password</a></p>
    </div>
  </div>
</div>
</body>
</html>`;
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
  try {
    const token = getBearerToken(req);
    const user = await verifySupabaseToken(token);
    if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');
    const rl = checkRateLimit({
      key: `request-password-reset:${getRateLimitIdentifier(req, user.id)}`,
      limit: Number(process.env.PASSWORD_RESET_RATE_LIMIT_PER_MIN || 10),
      windowMs: 60_000,
    });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded. Please retry shortly.');
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return jsonError(res, 400, 'Invalid JSON body');
      }
    }
    body = body || {};
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return jsonError(res, 400, 'Valid email is required');
    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 500, 'SUPABASE_SERVICE_ROLE_KEY is required');
    const authz = await ensureSuperAdmin({ admin, userId: user.id, res });
    if (!authz.ok) return authz.response;
    const redirectTo = getRecoveryRedirectTo();
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });
    if (linkError) return jsonError(res, 400, linkError.message || 'Failed to generate reset link');
    const actionLink =
      linkData?.properties?.action_link ||
      linkData?.action_link ||
      linkData?.properties?.confirmation_url;
    if (!actionLink) return jsonError(res, 500, 'Reset link was not returned');
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      log.warn(req, 'config.missing', { field: 'RESEND_API_KEY' });
      return res.status(200).json({
        success: true,
        email,
        emailSent: false,
        link: actionLink,
        reason: 'email_not_configured',
        note: 'Email service not configured. Copy the reset link and send it to the user.',
      });
    }
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Orchestrator <onboarding@resend.dev>';
    const html = getPasswordResetHtml(actionLink);
    const response = await fetchWithRetry(RESEND_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({ from: fromEmail, to: [email], subject: 'Reset your password', html }),
    });
    const resendBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = resendBody.message || 'Failed to send email';
      log.error(req, 'resend.error', new Error(msg), {
        status: response.status,
        name: resendBody.name,
      });
      const isResendTesting =
        /only send.*your own email|verify.*domain|testing/i.test(msg) ||
        (response.status === 403 && resendBody.name === 'validation_error');
      // Degrade gracefully on any send failure: the admin always gets a usable
      // recovery link to deliver manually, while the real error is logged above.
      return res.status(200).json({
        success: true,
        email,
        emailSent: false,
        link: actionLink,
        reason: isResendTesting ? 'domain_unverified' : 'send_failed',
        note: isResendTesting
          ? 'Email domain not verified. Copy the reset link and send it to the user.'
          : `Email could not be sent (${msg}). Copy the reset link and send it to the user.`,
      });
    }
    return res.status(200).json({ success: true, email, emailSent: true });
  } catch (err) {
    return handleApiError(res, err, 'request-password-reset');
  }
}
