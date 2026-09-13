/**
 * [module: connection-hub]
 * Communicator async worker — consumes `communicator-process` jobs enqueued by
 * the webhook-receiver. Heavy work (LLM call, tool execution, outbound message)
 * runs here so the webhook can 200 OK within Telegram's 6s deadline.
 *
 * Payload shape:
 *   {
 *     type: 'communicator-process',
 *     platform: 'telegram',
 *     update_id: string,
 *     channel_id: uuid,
 *     user_id: uuid,
 *     message: {
 *       chat_id, from_id, text, voice, audio, photo, document, caption, message_id
 *     }
 *   }
 */
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { createLogger } from '../../api/_lib/logger.js';
import {
  processAssistantMessage,
  formatForMessenger,
} from '../communicator-handlers/assistant-bridge.js';
import {
  sendTelegramMessage,
  sendTelegramDocument,
} from '../communicator-handlers/webhook-receiver.js';
import { transcribeVoice } from '../communicator-handlers/voice-transcribe.js';
import { ingestTelegramFile, wrapExternal } from '../communicator-handlers/file-ingest.js';
import { matchSmalltalk } from '../communicator-handlers/smalltalk.js';

const log = createLogger('communicator-process');

const MAX_RETRIES = 3;

function communicatorAuthorityError(message) {
  return new Error(`JOB_OWNER_VALIDATION_ERROR: ${message}`);
}

function normalizedTelegramIds(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return values.map((entry) => String(entry).trim()).filter(Boolean);
}

function telegramDestinationIsAllowed(config, fromId, chatId) {
  const sender = String(fromId || '').trim();
  const chat = String(chatId || '').trim();
  const allowedSenders = normalizedTelegramIds(config?.allowed_ids);
  const knownChats = normalizedTelegramIds(config?.chat_ids);
  return Boolean(
    sender &&
    chat &&
    allowedSenders.includes(sender) &&
    (knownChats.includes(chat) || chat === sender)
  );
}

async function assertCurrentTelegramDestination(admin, { channelId, userId, fromId, chatId }) {
  const { data: channel, error } = await admin
    .from('communication_channels')
    .select('id, config, connected_by, status')
    .eq('id', channelId)
    .eq('connected_by', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !channel || !telegramDestinationIsAllowed(channel.config, fromId, chatId)) {
    throw communicatorAuthorityError('Telegram sender or chat is no longer authorized');
  }
  return channel;
}

export async function handleCommunicatorProcess(payload, req, expectedUserId) {
  const admin = buildSupabaseAdminClient();
  if (!admin) throw new Error('Database not configured');

  const { platform, channel_id, user_id, message } = payload || {};
  const durableUserId = typeof expectedUserId === 'string' ? expectedUserId.trim() : '';
  if (!durableUserId || user_id !== durableUserId) {
    throw communicatorAuthorityError(
      'communicator job owner does not match the durable queue owner'
    );
  }
  if (platform !== 'telegram') {
    return {
      type: 'communicator-process',
      skipped: true,
      reason: `platform ${platform} not implemented`,
    };
  }
  if (!channel_id || !user_id || !message) {
    return { type: 'communicator-process', error: 'missing channel_id/user_id/message' };
  }

  // Load the channel for the bot token and personality.
  const { data: channel } = await admin
    .from('communication_channels')
    .select('id, config, connected_by, status')
    .eq('id', channel_id)
    .eq('connected_by', durableUserId)
    .maybeSingle();

  if (!channel || channel.connected_by !== durableUserId) {
    throw communicatorAuthorityError('communication channel is not owned by the durable owner');
  }
  if (channel.status !== 'active') {
    return { type: 'communicator-process', skipped: true, reason: 'channel inactive' };
  }

  const botToken = channel.config?.bot_token || process.env.TELEGRAM_SHARED_BOT_TOKEN;
  const chatId = message.chat_id;
  const fromId = message.from_id;
  if (!telegramDestinationIsAllowed(channel.config, fromId, chatId)) {
    throw communicatorAuthorityError('Telegram sender or chat is not authorized by the channel');
  }
  const sendAuthorized = async (text, opts) => {
    await assertCurrentTelegramDestination(admin, {
      channelId: channel.id,
      userId: durableUserId,
      fromId,
      chatId,
    });
    return sendOutbound(botToken, chatId, text, opts);
  };
  const sendAuthorizedWithRetry = async (text, opts) => {
    return sendOutboundWithRetry(botToken, chatId, text, opts, () =>
      assertCurrentTelegramDestination(admin, {
        channelId: channel.id,
        userId: durableUserId,
        fromId,
        chatId,
      })
    );
  };

  // 1. Resolve input text.
  //    Priority: explicit text → transcribed voice/audio → caption → "(empty)".
  let inputText = (message.text || '').trim();
  let inputType = 'text';

  if (!inputText && (message.voice || message.audio)) {
    const fileObj = message.voice || message.audio;
    const sttStartedAt = Date.now();
    // Track Groq Whisper transcription spend (~$0.0006/min, whisper-large-v3-turbo).
    const recordStt = async (status, errorType = null) => {
      try {
        const { recordLlmUsage } = await import('../goal-handlers/_helpers.js');
        const durationSec = Number(fileObj.duration || 0);
        await recordLlmUsage(admin, {
          userId: user_id,
          provider: 'groq',
          model: 'whisper-large-v3-turbo',
          estimatedCostUsd: status === 'ok' && durationSec > 0 ? (durationSec / 60) * 0.0006 : 0,
          durationMs: Date.now() - sttStartedAt,
          status,
          errorType,
          source: 'voice-transcribe',
          operation: 'transcription',
          description: 'telegram-voice',
        });
      } catch {
        /* usage recording is best-effort */
      }
    };
    try {
      inputText = await transcribeVoice(botToken, fileObj);
      inputType = 'voice';
      await recordStt('ok');
    } catch (err) {
      log.warn(req, 'voice.transcribe.failed', { error: err.message });
      await recordStt('error', 'transcription_failed');
      await sendAuthorized("I couldn't hear that - try typing it?");
      return { type: 'communicator-process', error: 'voice transcription failed' };
    }
  }

  if (!inputText && message.caption) inputText = String(message.caption).trim();

  // ── Phase 2: file attachments (photo or document) ──
  // Telegram delivers photos as an array of size variants — we pick the largest.
  // Documents come as a single object. Either way we ingest and append the
  // extracted text as <external> context for the assistant.
  let fileBlock = '';
  let ingestedFile = null;
  if (message.photo?.length || message.document) {
    const fileObj = message.document ? message.document : message.photo[message.photo.length - 1]; // largest variant

    try {
      ingestedFile = await ingestTelegramFile(admin, botToken, {
        userId: user_id,
        channelId: channel.id,
        fileObj,
      });
      if (ingestedFile.extractedText) {
        fileBlock =
          '\n\n' +
          wrapExternal(ingestedFile.extractedText, {
            src: 'telegram-file',
            fileId: ingestedFile.fileId,
          });
      }
    } catch (err) {
      log.warn(req, 'file.ingest.failed', { error: err.message });
      await sendAuthorized(`Couldn't process that file: ${err.message}`);
      return { type: 'communicator-process', error: 'file ingest failed' };
    }

    // If no caption + no other text: just confirm the file was received.
    if (!inputText) {
      const extractedPreview = ingestedFile.extractedText
        ? `\n\n<i>Extracted ${ingestedFile.extractedText.length} chars (${ingestedFile.extractionMethod}).</i>`
        : '\n\n<i>(No text extracted — file stored as-is.)</i>';
      await sendAuthorized(
        `📎 Got it: <b>${escapeHtml(ingestedFile.filename)}</b> (${formatBytes(ingestedFile.bytes)}).${extractedPreview}\n\nAdd a caption next time (e.g. "make a goal from this") and I'll act on it.`
      );
      return {
        type: 'communicator-process',
        fileId: ingestedFile.fileId,
        hasText: !!ingestedFile.extractedText,
      };
    }
  }

  if (!inputText && !ingestedFile) {
    return { type: 'communicator-process', skipped: true, reason: 'empty input' };
  }

  // Append the sandboxed file content (if any) to the user's caption.
  if (fileBlock) inputText = `${inputText}${fileBlock}`;

  // 2. /style slash command — flip channel personality, no LLM call.
  const styleMatch = inputText.match(/^\/style\s+(\w+)/i);
  if (styleMatch) {
    const next = styleMatch[1].toLowerCase();
    const allowed = ['professional', 'friendly', 'technical', 'creative', 'minimal'];
    if (!allowed.includes(next)) {
      await sendAuthorized(`Unknown style. Pick one of: ${allowed.join(', ')}.`);
      return { type: 'communicator-process', error: 'invalid style' };
    }
    await admin
      .from('communication_channels')
      .update({ config: { ...channel.config, personality: next } })
      .eq('id', channel_id)
      .eq('connected_by', durableUserId)
      .then(() => {})
      .catch(() => {});
    await sendAuthorized(`✓ Style set to <b>${next}</b>.`);
    return { type: 'communicator-process', style: next };
  }

  // 3. /audit slash command — return last 50 actions for transparency.
  if (/^\/audit\b/i.test(inputText)) {
    const { data: rows } = await admin
      .from('command_history')
      .select('input, parsed_intent, status, created_at')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(50);
    const lines = (rows || []).map((r) => {
      const ts = new Date(r.created_at).toLocaleString();
      const intent = r.parsed_intent || 'conversation';
      return `${ts} · ${r.status} · ${intent} · ${(r.input || '').slice(0, 80)}`;
    });
    const reply = lines.length
      ? `<b>Last ${lines.length} actions:</b>\n<pre>${escapeHtml(lines.join('\n'))}</pre>`
      : 'No actions logged yet.';
    await sendAuthorized(reply);
    return { type: 'communicator-process', audit: lines.length };
  }

  // 4. /help slash command.
  if (/^\/help\b/i.test(inputText)) {
    const reply = [
      '<b>Orqaly Telegram bot</b>',
      '',
      'Just talk normally — I understand natural language. Examples:',
      '• <i>list my goals</i>',
      '• <i>create a goal: research X, budget 50</i>',
      '• <i>send me a partner summary</i>',
      '• <i>what reports do I have?</i>',
      '',
      '<b>Slash commands:</b>',
      '/style &lt;name&gt; — professional · friendly · technical · creative · minimal',
      '/audit — show last 50 actions',
      '/unlink — disconnect this channel',
      '/help — this message',
    ].join('\n');
    await sendAuthorized(reply);
    return { type: 'communicator-process', help: true };
  }

  // 4.5. Smalltalk fast-path — free instant replies for greetings/thanks/etc.
  //      No LLM call → $0 cost, <200ms latency. Substantive requests
  //      (anything with platform nouns or action verbs) fall through.
  const personality = channel.config?.personality || 'professional';
  const small = matchSmalltalk(inputText, {
    personality,
    firstName: channel.config?.first_name || '',
  });
  if (small) {
    await sendAuthorized(small.reply);
    await admin
      .from('command_history')
      .insert({
        user_id,
        input: inputText,
        parsed_intent: 'smalltalk',
        output: small.reply,
        status: 'success',
        platform: 'telegram',
        metadata: {
          smalltalk: true,
          intent: small.intent,
          cost: 0,
          personality,
          thread_id: `tg-${chatId}`,
        },
      })
      .then(
        () => {},
        () => {}
      );
    return { type: 'communicator-process', smalltalk: small.intent, cost: 0, inputType };
  }

  // 5. Route through the assistant bridge.
  const result = await processAssistantMessage(admin, user_id, inputText, {
    platform: 'telegram',
    threadId: `tg-${chatId}`,
    personality,
    channelId: channel.id,
    inputType,
  });

  // 6. Format reply + attach confirmation buttons when needed.
  const replyText = formatForMessenger(result);
  const opts = {};

  if (result.needsConfirmation && result.pendingCallIds?.length) {
    // Each pending call gets its own Approve/Reject button row.
    const rows = result.pendingCallIds.map((pcId, idx) => [
      {
        text: `✓ Approve${result.pendingCallIds.length > 1 ? ` #${idx + 1}` : ''}`,
        callback_data: `confirm:approve:${pcId}`,
      },
      {
        text: `✕ Reject${result.pendingCallIds.length > 1 ? ` #${idx + 1}` : ''}`,
        callback_data: `confirm:reject:${pcId}`,
      },
    ]);
    opts.reply_markup = { inline_keyboard: rows };
  } else if (result.viewLinks?.length) {
    // Add [View in app] buttons for created entities.
    const rows = result.viewLinks.map((link) => [{ text: `🔗 ${link.label}`, url: link.url }]);
    opts.reply_markup = { inline_keyboard: rows };
  }

  // ── Phase 5c: PDF attachment delivery ──
  // If any toolResult carried an `attachment` (e.g. report.send rendered a PDF),
  // send the document first WITH the summary as caption + a "View in app" button,
  // then skip the redundant text reply.
  const attachment = pickAttachment(result);
  if (attachment) {
    // Brief heads-up while the upload runs (PDFs ~30 KB, but UX courtesy).
    await sendAuthorized('📊 <i>Sending your report…</i>');
    const docOpts = {
      reply_markup: attachment.deepLink
        ? { inline_keyboard: [[{ text: '🔗 Open in app', url: attachment.deepLink }]] }
        : undefined,
      mimeType: attachment.mimeType,
    };
    await assertCurrentTelegramDestination(admin, {
      channelId: channel.id,
      userId: durableUserId,
      fromId,
      chatId,
    });
    const ok = await sendTelegramDocument(
      botToken,
      chatId,
      attachment.buffer,
      attachment.filename,
      attachment.caption || replyText,
      docOpts
    );
    if (!ok) {
      // Fall back to text if document upload failed.
      await sendAuthorizedWithRetry(replyText, opts);
    }
  } else {
    await sendAuthorizedWithRetry(replyText, opts);
  }

  return {
    type: 'communicator-process',
    cost: result.cost,
    tools: result.calls?.map((c) => c.tool) || [],
    inputType,
    attachment: !!attachment,
  };
}

/** Scan toolResults for an attachment payload (set by Phase 5c report.send). */
function pickAttachment(result) {
  for (const tr of result.toolResults || []) {
    if (tr.result?.attachment?.buffer) return tr.result.attachment;
  }
  return null;
}

// ── helpers ────────────────────────────────────────────────────────────────

async function sendOutbound(token, chatId, text, opts) {
  try {
    await sendTelegramMessage(token, chatId, text, opts);
  } catch (err) {
    log.warn(null, 'outbound.failed', { error: err.message });
  }
}

async function sendOutboundWithRetry(token, chatId, text, opts, authorize = null) {
  const delays = [0, 15_000, 60_000];
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
    try {
      if (authorize) await authorize();
      await sendTelegramMessage(token, chatId, text, opts);
      return true;
    } catch (err) {
      log.warn(null, 'outbound.retry', { attempt: i + 1, error: err.message });
    }
  }
  log.error(null, 'outbound.giveup', { chatId });
  return false;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatBytes(n) {
  const x = Number(n) || 0;
  if (x < 1024) return `${x} B`;
  if (x < 1024 * 1024) return `${(x / 1024).toFixed(1)} KB`;
  return `${(x / 1024 / 1024).toFixed(1)} MB`;
}
