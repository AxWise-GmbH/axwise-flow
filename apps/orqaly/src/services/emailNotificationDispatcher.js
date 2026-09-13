/**
 * Email Notification Dispatcher
 *
 * Client-side dispatcher that:
 * 1. Checks if the action has email notifications enabled (preferences)
 * 2. Builds the email from the matching template
 * 3. Sends the email via /api/send-notification (or /api/send-email fallback)
 *
 * Usage:
 *   import { dispatchEmailNotification } from './emailNotificationDispatcher';
 *   await dispatchEmailNotification('partner_created', { name: 'Acme', ... });
 *
 * The dispatcher is fire-and-forget — it never throws to the caller so that
 * primary business logic is not blocked by email delivery issues.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { loadPreferences, isActionEnabled } from './emailNotificationPreferences';
import { TEMPLATE_MAP, genericNotificationTemplate } from './emailTemplates';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

/** Cache preferences in memory for the session to avoid repeated reads */
let prefsCache = null;
let prefsCacheUserId = null;

async function getPrefs(userId) {
  if (prefsCache && prefsCacheUserId === userId) return prefsCache;
  prefsCache = await loadPreferences(userId);
  prefsCacheUserId = userId;
  return prefsCache;
}

/** Invalidate cache when user changes preferences in Settings */
export function invalidatePrefsCache() {
  prefsCache = null;
  prefsCacheUserId = null;
}

/**
 * Get Supabase access token for API auth.
 */
async function getAccessToken() {
  if (!hasSupabase() || !supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Get current user id and email.
 */
async function getCurrentUser() {
  if (!hasSupabase() || !supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user || null;
  } catch {
    return null;
  }
}

/**
 * Dispatch an email notification for a specific action.
 *
 * @param {string} actionKey  One of the keys from EMAIL_ACTION_CATEGORIES (e.g. 'partner_created')
 * @param {object} data       Template-specific data (e.g. { name, funnelStatus, ... })
 * @returns {Promise<boolean>} true if email was sent, false if skipped or failed
 */
export async function dispatchEmailNotification(actionKey, data = {}) {
  try {
    /* ---- Get current user ---- */
    const user = await getCurrentUser();
    if (!user?.id) return false;

    /* ---- Check preferences ---- */
    const prefs = await getPrefs(user.id);
    if (!isActionEnabled(actionKey, prefs)) return false;

    /* ---- Build email from template (generic fallback for new actions) ---- */
    const templateFn = TEMPLATE_MAP[actionKey];
    const email = templateFn ? templateFn(data) : genericNotificationTemplate(actionKey, data);
    if (!email?.subject) return false;

    /* ---- Send via API ---- */
    const token = await getAccessToken();
    if (!token) {
      console.warn('[email-notify] No access token — skipping email notification');
      return false;
    }

    const apiUrl = `${API_BASE}/api/send-notification`;
    const idempotencyKey = data?.eventId
      ? `${actionKey}/${String(data.eventId).slice(0, 200)}`
      : undefined;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: actionKey,
        data,
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.warn(`[email-notify] API error (${response.status}):`, err.error || err.message);
      return false;
    }

    return true;
  } catch (err) {
    // Fire-and-forget: never block the caller
    console.warn('[email-notify] Dispatch failed:', err?.message || err);
    return false;
  }
}

/**
 * Convenience: dispatch only if Supabase is configured (avoids noisy logs in local-only mode).
 */
export async function maybeNotify(actionKey, data = {}) {
  if (!hasSupabase()) return false;
  return dispatchEmailNotification(actionKey, data);
}
