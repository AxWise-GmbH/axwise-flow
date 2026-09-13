/**
 * Notification fan-out: a single helper that delivers a loop / chain event
 * across all enabled channels (in-app, email, web push).
 *
 * Used by:
 *   - lib/goal-handlers/loop-continuation.js (spawn / pause / heal events)
 *   - lib/goal-handlers/loop-refine-parent.js (failure of refinement chain)
 *   - Phase 4 will add the auto-pivot event
 *
 * Channels:
 *   in-app    → insert a row into `notifications`; the frontend bell polls
 *               this via Supabase Realtime.
 *   email     → Resend (already configured via RESEND_API_KEY). Only for
 *               high-priority events.
 *   web push  → optional. Active when `web-push` is installed AND VAPID
 *               keys are present in env. Stays a graceful no-op otherwise
 *               so this slice can ship today without a new npm dependency.
 */
import { createLogger } from '../../api/_lib/logger.js';
import { fetchWithJobLease } from '../../api/_lib/fetch.js';

const log = createLogger('notifications.dispatch');

// Event copy registry — keeps email subjects and short bodies consistent
// across channels and easy to localize later.
const EVENT_COPY = {
  loop_continuation_spawned: {
    title: 'Next goal in your loop has started',
    body: (p) =>
      `"${p?.continuation_title || 'A new continuation goal'}" was spawned automatically from "${p?.parent_title || 'your previous goal'}". It picks up where the last one left off.`,
    priorityFallback: 'low',
  },
  loop_chain_paused: {
    title: 'A loop chain was paused',
    body: (p) =>
      `The loop chain pausing because: ${p?.reason || 'continuation failed and self-healer could not recover'}. Other chains are unaffected. Open the goal to resume or stop the chain.`,
    priorityFallback: 'high',
  },
  loop_auto_pivot_fired: {
    title: 'Loop auto-pivoted to fix flat ROI',
    body: (p) =>
      `Performance was flat for ${p?.flat_iterations || 'several'} iterations, so the loop spawned an optimization goal: "${p?.optimization_title || 'optimization continuation'}". The chain keeps running.`,
    priorityFallback: 'medium',
  },
  loop_kpi_alert: {
    title: 'KPI alert on a loop chain',
    body: (p) =>
      `${p?.kpi_name || 'A KPI'} crossed a threshold: ${p?.detail || 'see the goal for details'}.`,
    priorityFallback: 'medium',
  },
};

function copyFor(event) {
  const c = EVENT_COPY[event.event_type] || {};
  return {
    title: c.title || event.event_type,
    body:
      typeof c.body === 'function'
        ? c.body(event.payload || {})
        : c.body || JSON.stringify(event.payload || {}).slice(0, 280),
    priority: event.priority || c.priorityFallback || 'medium',
  };
}

// ── In-app channel ────────────────────────────────────────────────────
async function deliverInApp(admin, userId, event) {
  try {
    const { error } = await admin.from('notifications').insert({
      user_id: userId,
      event_type: event.event_type,
      payload: event.payload || {},
      priority: event.priority || 'medium',
    });
    if (error) {
      log.warn(null, 'inapp.insert.failed', {
        error: error.message,
        userId,
        event: event.event_type,
      });
      return false;
    }
    return true;
  } catch (err) {
    log.warn(null, 'inapp.exception', { error: err.message });
    return false;
  }
}

// ── Email channel (Resend) ────────────────────────────────────────────
async function deliverEmail(admin, userId, event) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;

  // Get the user's email from Supabase Auth.
  let email = null;
  try {
    const { data: userRow } = await admin.auth.admin.getUserById(userId);
    email = userRow?.user?.email || null;
  } catch (err) {
    log.warn(null, 'email.user-lookup.failed', { userId, error: err.message });
    return false;
  }
  if (!email) return false;

  const { title, body } = copyFor(event);
  const from = process.env.RESEND_FROM_EMAIL || 'Orqaly <onboarding@resend.dev>';

  try {
    const res = await fetchWithJobLease('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: title,
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px;padding:16px;">
          <h2 style="margin:0 0 12px 0;font-size:18px;">${escapeHtml(title)}</h2>
          <p style="margin:0 0 12px 0;color:#444;line-height:1.5;">${escapeHtml(body)}</p>
          <p style="margin:24px 0 0 0;font-size:12px;color:#888;">Sent by Orqaly autonomous loop.</p>
        </div>`,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      log.warn(null, 'email.send.failed', { status: res.status, detail: detail.slice(0, 200) });
      return false;
    }
    return true;
  } catch (err) {
    log.warn(null, 'email.send.exception', { error: err.message });
    return false;
  }
}

function escapeHtml(s) {
  return String(s || '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

// ── Web Push channel ──────────────────────────────────────────────────
// Active when the `web-push` package is installed AND VAPID keys are in
// env. Stays a graceful no-op otherwise — this slice ships today without
// requiring a new npm dependency; install `web-push` later and these
// pushes start firing automatically.
async function deliverWebPush(admin, userId, event) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;

  let webpush;
  try {
    // Dynamic import so the absence of web-push doesn't crash this module.
    // The package name is built at runtime (template string + variable) so
    // Vite's static analyzer can't pre-resolve it — the import only runs
    // when VAPID keys are present, and only on the Node serverless side.
    const pkg = 'web' + '-push';
    webpush = (await import(/* @vite-ignore */ pkg)).default;
  } catch {
    return false;
  }
  webpush.setVapidDetails(
    VAPID_SUBJECT || 'mailto:noreply@orchestratori.app',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, keys')
    .eq('user_id', userId);
  if (!subs || subs.length === 0) return false;

  const { title, body } = copyFor(event);
  const notificationPayload = JSON.stringify({
    title,
    body,
    event_type: event.event_type,
    payload: event.payload || {},
  });

  let delivered = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        notificationPayload
      );
      delivered++;
      await admin
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', sub.id);
    } catch (err) {
      // 404/410 → subscription is gone; clean it up.
      if (err.statusCode === 404 || err.statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        log.warn(null, 'push.send.failed', {
          sub_id: sub.id,
          status: err.statusCode,
          error: err.body || err.message,
        });
      }
    }
  }
  return delivered > 0;
}

// ── Top-level fan-out ─────────────────────────────────────────────────
/**
 * Deliver an event to the user across all enabled channels. Safe to call
 * from any backend hot path — every individual channel swallows its own
 * errors so a single failure can't kill the caller.
 *
 * @param {object} admin   Supabase admin client (service-role).
 * @param {string} userId  Recipient user id.
 * @param {{ event_type: string, priority?: 'low'|'medium'|'high', payload?: object }} event
 */
export async function notifyUser(admin, userId, event) {
  if (!admin || !userId || !event?.event_type) return { inapp: false, email: false, push: false };

  const priority = event.priority || copyFor(event).priority;

  // Always deliver in-app.
  const inapp = await deliverInApp(admin, userId, event);

  // Email & push are gated by priority. High → always. Medium → email + push.
  // Low → in-app only (drives email digest later; for now silent).
  const wantEmail = priority === 'high';
  const wantPush = priority === 'high' || priority === 'medium';

  const [email, push] = await Promise.all([
    wantEmail ? deliverEmail(admin, userId, event) : Promise.resolve(false),
    wantPush ? deliverWebPush(admin, userId, event) : Promise.resolve(false),
  ]);

  return { inapp, email, push, priority };
}
