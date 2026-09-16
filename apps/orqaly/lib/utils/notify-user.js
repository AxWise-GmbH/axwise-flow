/**
 * [module: connection-hub + notifications]
 * notifyUser — proactive push from system → user's connected channels.
 *
 * Currently delivers to Telegram (only platform with an outbound path). Looks
 * up every active communication_channels row for the user, sends to each
 * persisted chat_id, with 3-try exponential backoff. Logs to
 * communication_logs as sender_type='system' for the activity feed.
 *
 * Honours an optional notification_prefs jsonb column on users (added in a
 * future migration). Defaults to "all events enabled" if the column / key
 * isn't set — fail-open so a new user gets pinged out of the box.
 */
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('notify-user');

const RETRY_DELAYS_MS = [0, 15_000, 60_000];

/**
 * @param {object} admin  Supabase admin client (service role)
 * @param {string} userId
 * @param {string} eventType   stable key, e.g. 'goal.completed', 'goal.failed', 'stranger.threshold'
 * @param {object} message     { title, body, deepLink, buttons? }
 *   - title:    short headline (<= 80 chars)
 *   - body:     longer detail (markdown-ish; HTML-escaped before send)
 *   - deepLink: optional URL to surface as "🔗 …" line / button
 *   - buttons:  optional [{ text, callback_data? | url? }] — wraps in inline_keyboard
 * @returns {Promise<{ sent: number, failed: number }>}
 */
export async function notifyUser(admin, userId, eventType, message) {
  if (!admin || !userId || !eventType) return { sent: 0, failed: 0 };

  // 1. Look up user prefs (best-effort; column may not exist yet).
  let prefs = {};
  try {
    const { data: u } = await admin
      .from('users')
      .select('notification_prefs')
      .eq('id', userId)
      .maybeSingle();
    if (u?.notification_prefs && typeof u.notification_prefs === 'object') {
      prefs = u.notification_prefs;
    }
  } catch {
    /* column doesn't exist yet — default to on */
  }

  // Pref keys: explicit false disables; missing = default on.
  if (prefs[eventType] === false) {
    return { sent: 0, failed: 0, skipped: true, reason: 'user opt-out' };
  }

  // 2. Find active Telegram channels for this user.
  const { data: channels } = await admin
    .from('communication_channels')
    .select('id, config')
    .eq('connected_by', userId)
    .eq('platform', 'telegram')
    .eq('status', 'active');

  if (!channels || channels.length === 0) {
    return { sent: 0, failed: 0, skipped: true, reason: 'no active channel' };
  }

  // 3. Build the message text.
  const text = renderTelegramMessage(message);

  // 4. Build reply_markup if buttons supplied.
  const replyMarkup = buildReplyMarkup(message);

  // 5. Send to each channel × each chat_id, with retry per send.
  let sent = 0;
  let failed = 0;
  for (const ch of channels) {
    // Skip snoozed channels (set via callback dispatcher digest:snooze).
    const snoozedUntil = ch.config?.snoozed_until ? new Date(ch.config.snoozed_until) : null;
    if (snoozedUntil && snoozedUntil > new Date()) continue;

    const botToken = ch.config?.bot_token || process.env.TELEGRAM_SHARED_BOT_TOKEN;
    const chatIds = Array.isArray(ch.config?.chat_ids) ? ch.config.chat_ids : [];
    if (!botToken || chatIds.length === 0) continue;

    for (const chatId of chatIds) {
      const ok = await sendWithRetry(botToken, chatId, text, replyMarkup);
      if (ok) sent++;
      else failed++;
    }

    // Log to communication_logs for the activity feed.
    await admin
      .from('communication_logs')
      .insert({
        thread_id: crypto.randomUUID(),
        user_id: userId,
        sender_type: 'system',
        sender_name: 'Orqaly',
        content: `${message.title || ''}\n${message.body || ''}`.trim().slice(0, 1000),
        context_type: 'general',
        platform: 'telegram',
        metadata: { event_type: eventType, channel_id: ch.id, sent, failed },
      })
      .then(() => {})
      .then(
        () => {},
        () => {}
      );
  }

  return { sent, failed };
}

// ── helpers ────────────────────────────────────────────────────────────────

function renderTelegramMessage(msg) {
  const lines = [];
  if (msg.title) lines.push(`<b>${escapeHtml(msg.title)}</b>`);
  if (msg.body) lines.push(escapeHtml(msg.body));
  if (msg.deepLink) lines.push(`\n🔗 ${msg.deepLink}`);
  return lines.join('\n').slice(0, 4000);
}

function buildReplyMarkup(msg) {
  const buttons = msg.buttons;
  if (!Array.isArray(buttons) || buttons.length === 0) return null;
  // One button per row. Each accepts callback_data OR url.
  return {
    inline_keyboard: buttons.map((b) => {
      const btn = { text: String(b.text || 'Open') };
      if (b.url) btn.url = b.url;
      else if (b.callback_data) btn.callback_data = b.callback_data;
      else btn.callback_data = 'noop';
      return [btn];
    }),
  };
}

async function sendWithRetry(botToken, chatId, text, replyMarkup) {
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (RETRY_DELAYS_MS[attempt]) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
    try {
      const body = {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };
      if (replyMarkup) body.reply_markup = replyMarkup;
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) return true;
      const detail = await res.text().catch(() => '');
      log.warn(null, 'notify.retry', {
        attempt: attempt + 1,
        status: res.status,
        detail: detail.slice(0, 120),
      });
    } catch (err) {
      log.warn(null, 'notify.retry.error', { attempt: attempt + 1, error: err.message });
    }
  }
  log.error(null, 'notify.giveup', { chatId });
  return false;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
