/**
 * [module: connection-hub]
 * Inline-button callback dispatcher.
 *
 * Telegram sends a `callback_query` update when the user taps an inline
 * keyboard button. The button's `callback_data` is a short string we route
 * by colon-separated prefix:
 *
 *   confirm:approve:<pending_id>   ← approve held high-risk tool call
 *   confirm:reject:<pending_id>    ← reject
 *   goal:cancel:<goal_id>          ← cancel an in-flight goal
 *   goal:view:<goal_id>            ← (URL-only buttons handle view)
 *   digest:snooze:1h
 *   digest:dismiss
 *
 * All callbacks acknowledge via answerCallbackQuery to clear the spinner.
 */
import { createLogger } from '../../api/_lib/logger.js';
import { sendTelegramMessage } from './webhook-receiver.js';
import { executeToolCall } from './assistant-bridge.js';

const log = createLogger('communicator-callback');

export async function dispatchCallback(req, res, admin, body, ctx) {
  const cq = body.callback_query;
  if (!cq) return res.status(200).json({ ok: true });

  const data = cq.data || '';
  const fromId = String(cq.from?.id || '');
  const messageId = cq.message?.message_id;
  const chatId = cq.message?.chat?.id;

  // 1. Resolve the channel by sender (gate 2).
  const { data: channels } = await admin
    .from('communication_channels')
    .select('id, config, connected_by, status')
    .eq('platform', 'telegram')
    .eq('status', 'active');

  const channel = (channels || []).find((c) => {
    const allowed = String(c.config?.allowed_ids || '').split(',').map((s) => s.trim());
    return allowed.includes(fromId);
  });

  if (!channel || !channel.connected_by) {
    await answer(cq.id, '');
    return res.status(200).json({ ok: true });
  }

  // 2. Secret-token gate (for shared bot).
  const expectedSecret = channel.config?.secret_token || ctx.sharedSecret || '';
  if (expectedSecret && ctx.incomingSecret && ctx.incomingSecret !== expectedSecret) {
    return res.status(401).json({ ok: false });
  }

  const botToken = channel.config?.bot_token || process.env.TELEGRAM_SHARED_BOT_TOKEN;

  // 3. Route by prefix.
  const [scope, action, ...rest] = data.split(':');

  try {
    if (scope === 'confirm') {
      return handleConfirm(res, admin, channel, botToken, cq, action, rest[0]);
    }
    if (scope === 'goal' && action === 'cancel') {
      return handleGoalCancel(res, admin, channel, botToken, cq, rest[0]);
    }
    if (scope === 'digest') {
      return handleDigest(res, admin, channel, botToken, cq, action, rest[0]);
    }

    await answer(cq.id, 'Unknown action');
    return res.status(200).json({ ok: true });
  } catch (err) {
    log.error(req, 'callback.failed', err, { data });
    await answer(cq.id, 'Error');
    return res.status(200).json({ ok: true });
  }

  async function answer(callbackQueryId, text) {
    if (!botToken) return;
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text || '' }),
    }).then(() => {}, () => {});
  }

  async function editKeyboard(chatId, messageId, newMarkup) {
    if (!botToken || !chatId || !messageId) return;
    await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: newMarkup || { inline_keyboard: [] },
      }),
    }).then(() => {}, () => {});
  }

  async function handleConfirm(res, admin, channel, botToken, cq, action, pendingId) {
    if (!pendingId) {
      await answer(cq.id, 'Missing id');
      return res.status(200).json({ ok: true });
    }

    const { data: pending } = await admin
      .from('pending_tool_calls')
      .select('*')
      .eq('id', pendingId)
      .maybeSingle();

    if (!pending) {
      await answer(cq.id, 'Already resolved or expired');
      await editKeyboard(chatId, messageId, { inline_keyboard: [] });
      return res.status(200).json({ ok: true });
    }
    if (pending.user_id !== channel.connected_by) {
      await answer(cq.id, 'Not your action');
      return res.status(200).json({ ok: true });
    }
    if (pending.resolved_at) {
      await answer(cq.id, `Already ${pending.resolution}`);
      return res.status(200).json({ ok: true });
    }
    if (new Date(pending.expires_at) < new Date()) {
      await admin
        .from('pending_tool_calls')
        .update({ resolved_at: new Date().toISOString(), resolution: 'expired' })
        .eq('id', pendingId);
      await answer(cq.id, 'Expired');
      await editKeyboard(chatId, messageId, { inline_keyboard: [] });
      return res.status(200).json({ ok: true });
    }

    if (action === 'reject') {
      await admin
        .from('pending_tool_calls')
        .update({ resolved_at: new Date().toISOString(), resolution: 'rejected' })
        .eq('id', pendingId);
      await answer(cq.id, '✕ Rejected');
      await editKeyboard(chatId, messageId, { inline_keyboard: [] });
      await sendTelegramMessage(botToken, chatId, `✕ Rejected: <b>${escapeHtml(pending.tool)}</b>`);
      return res.status(200).json({ ok: true });
    }

    if (action === 'approve') {
      try {
        const result = await executeToolCall(admin, pending.user_id, pending.tool, pending.args || {});
        await admin
          .from('pending_tool_calls')
          .update({ resolved_at: new Date().toISOString(), resolution: 'approved' })
          .eq('id', pendingId);
        await answer(cq.id, '✓ Done');
        await editKeyboard(chatId, messageId, { inline_keyboard: [] });
        const summary = result?.message || (result?.created ? `Created: ${JSON.stringify(result.created)}` : '✓ Done');
        await sendTelegramMessage(botToken, chatId, `✓ ${escapeHtml(pending.tool)}: ${escapeHtml(String(summary).slice(0, 500))}`);
      } catch (err) {
        await answer(cq.id, '✕ Error');
        await sendTelegramMessage(botToken, chatId, `✕ ${escapeHtml(pending.tool)} failed: ${escapeHtml(err.message)}`);
      }
      return res.status(200).json({ ok: true });
    }

    await answer(cq.id, 'Unknown action');
    return res.status(200).json({ ok: true });
  }

  async function handleGoalCancel(res, admin, channel, botToken, cq, goalId) {
    if (!goalId) {
      await answer(cq.id, 'Missing goal id');
      return res.status(200).json({ ok: true });
    }
    const { data: goal } = await admin
      .from('goals')
      .select('id, user_id, title, status')
      .eq('id', goalId)
      .maybeSingle();
    if (!goal || goal.user_id !== channel.connected_by) {
      await answer(cq.id, 'Not your goal');
      return res.status(200).json({ ok: true });
    }
    if (['complete', 'cancelled', 'failed'].includes(goal.status)) {
      await answer(cq.id, `Already ${goal.status}`);
      await editKeyboard(chatId, messageId, { inline_keyboard: [] });
      return res.status(200).json({ ok: true });
    }
    await admin
      .from('goals')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', goalId);
    await answer(cq.id, '✓ Goal cancelled');
    await editKeyboard(chatId, messageId, { inline_keyboard: [] });
    await sendTelegramMessage(botToken, chatId, `✓ Cancelled goal: <b>${escapeHtml(goal.title || goalId)}</b>`);
    return res.status(200).json({ ok: true });
  }

  async function handleDigest(res, admin, channel, botToken, cq, action, arg) {
    if (action === 'dismiss') {
      await answer(cq.id, '✓ Dismissed');
      await editKeyboard(chatId, messageId, { inline_keyboard: [] });
      return res.status(200).json({ ok: true });
    }
    if (action === 'snooze') {
      // Marker only — Phase 3 push helper checks this when scheduling next push.
      await admin
        .from('communication_channels')
        .update({
          config: {
            ...channel.config,
            snoozed_until: snoozeUntil(arg || '1h').toISOString(),
          },
        })
        .eq('id', channel.id);
      await answer(cq.id, `Snoozed ${arg || '1h'}`);
      await editKeyboard(chatId, messageId, { inline_keyboard: [] });
      return res.status(200).json({ ok: true });
    }
    await answer(cq.id, 'Unknown digest action');
    return res.status(200).json({ ok: true });
  }
}

function snoozeUntil(spec) {
  const now = Date.now();
  const m = String(spec || '1h').match(/^(\d+)([hm])$/i);
  if (!m) return new Date(now + 3600_000);
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  return new Date(now + n * (unit === 'h' ? 3600_000 : 60_000));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
