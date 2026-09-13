/**
 * [module: connection-hub]
 * Webhook receiver: inbound messages from Telegram, Discord, Slack, generic webhooks.
 * No JWT auth — uses platform-specific verification (secret token + allowed_ids).
 * POST ?platform=telegram|discord|slack|webhook
 *
 * Design (Phase 1):
 *   - Acknowledge Telegram only after the durable row is inserted and an exact
 *     Preview dispatch is registered; retryable failures remain unacknowledged.
 *   - Heavy work (LLM, tool calls, outbound) is enqueued to agent_jobs and
 *     consumed by lib/agent-handlers/communicator-process.js.
 *   - Idempotency via processed_updates(platform, update_id).
 *   - Four-gate closure for Telegram: secret_token, allowed_ids, owner-scoped
 *     RLS on channels, tool-call user scoping in the bridge.
 */
import { cors } from '../../api/_lib/cors.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { createLogger } from '../../api/_lib/logger.js';
import { fetchWithJobLease } from '../../api/_lib/fetch.js';
import { redeemLinkCode } from './link-code.js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { deterministicAgentJobId, enqueueAgentJob } from '../goal-handlers/_helpers.js';
import {
  resolveWorkerDeploymentIdentity,
  resolveWorkerScope,
  WORKER_DEPLOYMENT_PAYLOAD_KEY,
} from '../agent-handlers/worker-scope.js';

const log = createLogger('communicator-webhook');

// In-memory rate limit (per-fromId, 10/min). Cold-start resets; that's
// acceptable — for stricter limits use the DB-backed rate-limit helper.
const RATE_BUCKET = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const TELEGRAM_JOB_GENERATION_KEY = '_telegramJobGeneration';
const TELEGRAM_PREDECESSOR_JOB_KEY = '_telegramPredecessorJobId';

function timingSafeSecretEquals(expected, incoming) {
  const expectedDigest = createHash('sha256').update(String(expected)).digest();
  const incomingDigest = createHash('sha256').update(String(incoming)).digest();
  return timingSafeEqual(expectedDigest, incomingDigest);
}

function validateTelegramSecret(expected, incoming) {
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: 'Telegram webhook secret is not configured',
    };
  }
  if (!incoming || !timingSafeSecretEquals(expected, incoming)) {
    return { ok: false, status: 401, error: 'invalid secret token' };
  }
  return { ok: true };
}

function rejectInvalidTelegramSecret(res, expected, incoming) {
  const validation = validateTelegramSecret(expected, incoming);
  if (validation.ok) return null;
  return res.status(validation.status).json({ ok: false, error: validation.error });
}

function expectedTelegramChannelSecret(channel, sharedSecret) {
  const config = channel?.config || {};
  // A BYO bot must carry its own secret. Falling back to the shared-bot secret
  // would turn a missing per-channel credential into cross-bot authorization.
  if (config.bot_token) return config.secret_token || '';
  return config.secret_token || sharedSecret || '';
}

function telegramRequestedJobId(updateId, channelId, generation) {
  if (generation === 0) {
    // Preserve the first-generation identity used before recovery generations
    // were introduced so an already durable row remains the idempotency fence.
    return deterministicAgentJobId('telegram-communicator-process', { updateId });
  }
  return deterministicAgentJobId('telegram-communicator-process-recovery', {
    updateId,
    channelId,
    generation,
  });
}

function telegramRuntimeJobId(requestedId, env) {
  const workerScope = resolveWorkerScope(env);
  const deploymentIdentity = resolveWorkerDeploymentIdentity(env);
  if (deploymentIdentity) {
    return deterministicAgentJobId('preview-deployment-agent-job', {
      id: requestedId,
      deployment: deploymentIdentity,
    });
  }
  return workerScope === 'local'
    ? deterministicAgentJobId('local-agent-job', { id: requestedId })
    : requestedId;
}

function telegramJobGeneration(job) {
  const raw = job?.payload?.[TELEGRAM_JOB_GENERATION_KEY];
  if (raw === undefined || raw === null) return 0;
  const generation = Number(raw);
  return Number.isSafeInteger(generation) && generation >= 1 ? generation : null;
}

function telegramBusinessPayload(payload) {
  const businessPayload = { ...(payload || {}) };
  delete businessPayload[WORKER_DEPLOYMENT_PAYLOAD_KEY];
  delete businessPayload[TELEGRAM_JOB_GENERATION_KEY];
  delete businessPayload[TELEGRAM_PREDECESSOR_JOB_KEY];
  return businessPayload;
}

async function loadTelegramJobGenerations(admin, basePayload, env) {
  const workerScope = resolveWorkerScope(env);
  const deploymentIdentity = resolveWorkerDeploymentIdentity(env);
  try {
    let query = admin
      .from('agent_jobs')
      .select('id, user_id, status, worker_scope, payload, created_at, updated_at')
      .eq('user_id', basePayload._userId)
      .eq('worker_scope', workerScope)
      .contains('payload', {
        type: basePayload.type,
        platform: basePayload.platform,
        update_id: basePayload.update_id,
        channel_id: basePayload.channel_id,
        user_id: basePayload.user_id,
        _userId: basePayload._userId,
      });
    if (deploymentIdentity) {
      query = query.eq(`payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`, deploymentIdentity);
    }
    const { data: rows, error } = await query.order('created_at', { ascending: false }).limit(50);
    if (error) return { state: 'unknown', error };

    const candidates = Array.isArray(rows) ? rows : [];
    const expectedBusinessPayload = telegramBusinessPayload(basePayload);
    const exact = [];
    for (const row of candidates) {
      const generation = telegramJobGeneration(row);
      const samePartition =
        row?.worker_scope === workerScope &&
        (deploymentIdentity
          ? row?.payload?.[WORKER_DEPLOYMENT_PAYLOAD_KEY] === deploymentIdentity
          : !row?.payload?.[WORKER_DEPLOYMENT_PAYLOAD_KEY]);
      const requestedId =
        generation === null
          ? null
          : telegramRequestedJobId(basePayload.update_id, basePayload.channel_id, generation);
      if (
        generation === null ||
        !samePartition ||
        row.user_id !== basePayload._userId ||
        row.id !== telegramRuntimeJobId(requestedId, env) ||
        !isDeepStrictEqual(telegramBusinessPayload(row?.payload), expectedBusinessPayload)
      ) {
        return { state: 'conflict', row };
      }
      exact.push({ ...row, generation });
    }
    return { state: 'present', rows: exact };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

/**
 * Pick one deterministic generation for a Telegram update. A terminal exact
 * generation is immutable, so a webhook retry advances to generation N+1.
 * Concurrent retries derive the same next id and collapse through the queue
 * primary key; a queued/running/done generation is reused instead.
 */
export async function enqueueTelegramProcessingJob(
  admin,
  { updateId, channel, chatId, fromId, text, message },
  { env = process.env, enqueueAgentJobImpl = null } = {}
) {
  const ownerId = typeof channel?.connected_by === 'string' ? channel.connected_by.trim() : '';
  if (!ownerId) throw new Error('Telegram processing job requires a durable channel owner');
  const basePayload = {
    type: 'communicator-process',
    platform: 'telegram',
    update_id: updateId,
    channel_id: channel.id,
    user_id: ownerId,
    _userId: ownerId,
    userId: ownerId,
    message: {
      chat_id: String(chatId),
      from_id: fromId,
      text,
      voice: message.voice || null,
      audio: message.audio || null,
      photo: message.photo || null,
      document: message.document || null,
      caption: message.caption || '',
      message_id: message.message_id,
    },
  };

  if (!updateId) {
    const job = { user_id: ownerId, payload: basePayload };
    return enqueueAgentJobImpl
      ? await enqueueAgentJobImpl(admin, job, { env })
      : await enqueueAgentJob(admin, job, { env });
  }

  const inspection = await loadTelegramJobGenerations(admin, basePayload, env);
  if (inspection.state !== 'present') {
    const error = new Error(
      `Telegram job generations could not be reconciled safely (${inspection.state})`
    );
    error.code = 'TELEGRAM_JOB_RECONCILIATION_REQUIRED';
    error.reconciliationState = inspection.state;
    error.cause = inspection.error;
    throw error;
  }

  const generations = inspection.rows || [];
  const latest = generations.reduce(
    (selected, candidate) =>
      !selected || candidate.generation > selected.generation ? candidate : selected,
    null
  );
  const terminal = latest && ['failed', 'cancelled'].includes(latest.status);
  const generation = latest ? latest.generation + (terminal ? 1 : 0) : 0;
  const payload =
    generation === 0
      ? basePayload
      : {
          ...basePayload,
          [TELEGRAM_JOB_GENERATION_KEY]: generation,
          [TELEGRAM_PREDECESSOR_JOB_KEY]: terminal
            ? latest.id
            : latest?.payload?.[TELEGRAM_PREDECESSOR_JOB_KEY],
        };
  const job = {
    id: telegramRequestedJobId(updateId, channel.id, generation),
    user_id: ownerId,
    payload,
  };
  const options = { idempotent: true, env };
  return enqueueAgentJobImpl
    ? await enqueueAgentJobImpl(admin, job, options)
    : await enqueueAgentJob(admin, job, options);
}

function isRateLimited(key) {
  const now = Date.now();
  const arr = (RATE_BUCKET.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  RATE_BUCKET.set(key, arr);
  return arr.length > RATE_MAX;
}

function rejectRateLimitedTelegram(req, res, fromId) {
  if (!isRateLimited(`tg:${fromId}`)) return null;
  log.warn(req, 'webhook.telegram.rate_limited', { fromId });
  // Don't echo a rate-limit error to spammy clients; just drop.
  return res.status(200).json({ ok: true, rate_limited: true });
}

export default async function handler(req, res) {
  const safeReq = req && typeof req === 'object' ? req : {};
  if (!safeReq.headers) safeReq.headers = {};
  cors(res, safeReq);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const platform = (req.query?.platform || '').toLowerCase();
  if (!['telegram', 'discord', 'slack', 'webhook'].includes(platform)) {
    return jsonError(res, 400, `Unsupported platform: ${platform}`);
  }

  try {
    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    if (platform === 'telegram') return handleTelegram(req, res, admin);
    if (platform === 'discord') return handleDiscord(req, res);
    if (platform === 'slack') return handleSlack(req, res);
    if (platform === 'webhook') return handleWebhook(req, res, admin);

    return jsonError(res, 400, 'Unsupported platform');
  } catch (err) {
    return handleApiError(res, err, 'webhook-receiver');
  }
}

// ─── Telegram ──────────────────────────────────────────────────────────────

export async function handleTelegram(req, res, admin) {
  const body = req.body || {};

  // 1. Acknowledge non-message updates (channel posts, my_chat_member, etc.).
  if (!body.message && !body.callback_query) {
    return res.status(200).json({ ok: true });
  }

  // 2. Secret-token verification (gate 1).
  //    If a channel was registered with a secret_token, the inbound MUST
  //    carry the matching X-Telegram-Bot-Api-Secret-Token header. The shared
  //    bot also requires SHARED_SECRET; BYO bots use their own per-channel
  //    secret_token from communication_channels.config.
  const incomingSecret = req.headers['x-telegram-bot-api-secret-token'] || '';
  const sharedSecret = process.env.TELEGRAM_SHARED_SECRET_TOKEN || '';
  const sharedBotUsername = (process.env.TELEGRAM_SHARED_BOT_USERNAME || '').toLowerCase();

  // 3. Idempotency (gate against retries).
  const updateId = body.update_id != null ? String(body.update_id) : null;
  if (updateId) {
    const { data: seen } = await admin
      .from('processed_updates')
      .select('update_id')
      .eq('platform', 'telegram')
      .eq('update_id', updateId)
      .maybeSingle();
    if (seen) {
      return res.status(200).json({ ok: true, dedup: true });
    }
  }

  // 4. Branch: callback_query (inline button tap) vs message.
  if (body.callback_query) {
    const callbackFromId = String(body.callback_query.from?.id || '');
    const { data: callbackChannels } = await admin
      .from('communication_channels')
      .select('id, config, connected_by, status')
      .eq('platform', 'telegram')
      .eq('status', 'active');
    const callbackChannel = (callbackChannels || []).find((candidate) => {
      const allowed = String(candidate.config?.allowed_ids || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      return allowed.includes(callbackFromId);
    });
    if (!callbackChannel?.connected_by) {
      return res.status(401).json({ ok: false, error: 'invalid secret token' });
    }
    const callbackSecretFailure = rejectInvalidTelegramSecret(
      res,
      expectedTelegramChannelSecret(callbackChannel, sharedSecret),
      incomingSecret
    );
    if (callbackSecretFailure) return callbackSecretFailure;
    return handleTelegramCallback(req, res, admin, body, incomingSecret, sharedSecret);
  }

  // ─── message ──
  const message = body.message;
  const fromId = String(message.from?.id || '');
  const chatId = message.chat?.id;
  const text = message.text || message.caption || '';

  if (!fromId || !chatId) return res.status(200).json({ ok: true });

  // 5. /link or /start onboarding before allowed_ids check.
  //    Accepts: "/start ABC123" (Telegram deep-link default) or "/link ABC123"
  const linkMatch = text.match(/^\/(?:start|link)\s+([A-Z0-9]{4,12})/i);
  if (linkMatch) {
    // Shared-bot path requires SHARED_SECRET; BYO bot codes are not supported
    // here. Missing configuration/header and mismatches all fail closed before
    // link-code redemption or any durable write.
    const linkSecretFailure = rejectInvalidTelegramSecret(res, sharedSecret, incomingSecret);
    if (linkSecretFailure) {
      log.warn(req, 'webhook.telegram.link.bad_secret');
      return linkSecretFailure;
    }
    const linkRateLimit = rejectRateLimitedTelegram(req, res, fromId);
    if (linkRateLimit) return linkRateLimit;
    const code = linkMatch[1].toUpperCase();
    const result = await redeemLinkCode(admin, {
      code,
      telegramUserId: fromId,
      telegramUsername: message.from?.username || '',
      firstName: message.from?.first_name || '',
      lastName: message.from?.last_name || '',
      chatId: String(chatId),
      botUsername: sharedBotUsername,
    });
    await markUpdateProcessed(admin, 'telegram', updateId, result.channelId || null);

    const replyText = result.ok
      ? '✓ Linked to Orqaly.\n\nTry one of these:\n• <b>list my goals</b>\n• <b>create a goal: research X, budget 50</b>\n• <b>send me a partner summary</b>'
      : `Couldn't link: ${result.error}\n\nGenerate a new code in Orqaly → Settings → Connect Telegram.`;

    await sendTelegramMessage(process.env.TELEGRAM_SHARED_BOT_TOKEN, chatId, replyText);
    return res.status(200).json({ ok: true, linked: result.ok });
  }

  // 7. /unlink — disconnect this channel.
  if (/^\/unlink(\s|$)/i.test(text)) {
    const { data: ch } = await admin
      .from('communication_channels')
      .select('id, config')
      .eq('platform', 'telegram')
      .contains('config', { allowed_ids: fromId })
      .limit(1)
      .maybeSingle();
    const unlinkSecretFailure = rejectInvalidTelegramSecret(
      res,
      ch ? expectedTelegramChannelSecret(ch, sharedSecret) : sharedSecret,
      incomingSecret
    );
    if (unlinkSecretFailure) {
      log.warn(req, 'webhook.telegram.unlink.bad_secret', { channelId: ch?.id || null });
      return unlinkSecretFailure;
    }
    const unlinkRateLimit = rejectRateLimitedTelegram(req, res, fromId);
    if (unlinkRateLimit) return unlinkRateLimit;
    if (ch) {
      await admin.from('communication_channels').update({ status: 'inactive' }).eq('id', ch.id);
      await sendTelegramMessage(
        process.env.TELEGRAM_SHARED_BOT_TOKEN,
        chatId,
        '✓ Disconnected. Open Orqaly to re-link any time.'
      );
    } else {
      await sendTelegramMessage(
        process.env.TELEGRAM_SHARED_BOT_TOKEN,
        chatId,
        'No active link found for you.'
      );
    }
    await markUpdateProcessed(admin, 'telegram', updateId, ch?.id || null);
    return res.status(200).json({ ok: true });
  }

  // 8. Find channel by allowed sender.
  //    Pull active channels and check allowed_ids client-side (supports both
  //    string and array formats, plus shared bot vs BYO bot).
  const { data: channels } = await admin
    .from('communication_channels')
    .select('id, config, status, connected_by')
    .eq('platform', 'telegram')
    .eq('status', 'active');

  const channel = (channels || []).find((c) => {
    const cfg = c.config || {};
    const allowed = String(cfg.allowed_ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return allowed.includes(fromId);
  });

  // 9. Authenticate before stranger logging, channel activity writes, queue
  // admission, or replies. Unknown senders can only enter the shared-bot path
  // with the shared webhook secret; BYO requests require a matched channel.
  const expectedSecret = channel
    ? expectedTelegramChannelSecret(channel, sharedSecret)
    : sharedSecret;
  const channelSecretFailure = rejectInvalidTelegramSecret(res, expectedSecret, incomingSecret);
  if (channelSecretFailure) {
    log.warn(req, 'webhook.telegram.bad_secret', { channelId: channel?.id || null });
    return channelSecretFailure;
  }
  const channelRateLimit = rejectRateLimitedTelegram(req, res, fromId);
  if (channelRateLimit) return channelRateLimit;

  // 10. Stranger gate — log + maybe reply once.
  if (!channel?.connected_by) {
    await logStranger(admin, {
      fromId,
      username: message.from?.username || '',
      firstName: message.from?.first_name || '',
      lastName: message.from?.last_name || '',
      message: text.slice(0, 200),
      botUsername: sharedBotUsername,
    });
    await markUpdateProcessed(admin, 'telegram', updateId, null);
    // Reply once per 24h (handled in logStranger via last_replied_at).
    return res.status(200).json({ ok: true });
  }

  // 11. Persist chat_id on first inbound (used by Phase 3 push).
  const knownChatIds = Array.isArray(channel.config?.chat_ids) ? channel.config.chat_ids : [];
  if (!knownChatIds.includes(String(chatId))) {
    await admin
      .from('communication_channels')
      .update({
        last_active: new Date().toISOString(),
        config: { ...channel.config, chat_ids: [...knownChatIds, String(chatId)] },
      })
      .eq('id', channel.id)
      .then(() => {})
      .catch(() => {});
  } else {
    await admin
      .from('communication_channels')
      .update({ last_active: new Date().toISOString() })
      .eq('id', channel.id)
      .then(() => {})
      .catch(() => {});
  }

  // 12. Enqueue async processing (decouple from webhook deadline).
  const job = await enqueueTelegramProcessingJob(admin, {
    updateId,
    channel,
    chatId,
    fromId,
    text,
    message,
  });

  await markUpdateProcessed(admin, 'telegram', updateId, channel.id);

  // 13. Optional "typing…" hint so user knows the bot heard them.
  const botToken = channel.config?.bot_token || process.env.TELEGRAM_SHARED_BOT_TOKEN;
  if (botToken && chatId) {
    fetchWithJobLease(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    }).then(
      () => {},
      () => {}
    );
  }

  return res.status(200).json({ ok: true, queued: true, job_id: job.id });
}

async function handleTelegramCallback(req, res, admin, body, incomingSecret, sharedSecret) {
  // Defer to dedicated dispatcher.
  const { dispatchCallback } = await import('./callback-dispatcher.js');
  return dispatchCallback(req, res, admin, body, { incomingSecret, sharedSecret });
}

// ─── Discord (scaffold, unchanged) ─────────────────────────────────────────

async function handleDiscord(req, res) {
  const body = req.body || {};
  if (body.type === 1) return res.status(200).json({ type: 1 });

  const content = body.data?.options?.[0]?.value || body.content || '';

  // Discord ownership/signature verification is not implemented yet. Do not
  // persist an unowned row that could later be mistaken for tenant activity.

  return res.status(200).json({
    type: 4,
    data: { content: `Command received: "${content}"\nController integration coming soon.` },
  });
}

// ─── Slack (scaffold, unchanged) ───────────────────────────────────────────

async function handleSlack(req, res) {
  const body = req.body || {};
  if (body.challenge) return res.status(200).json({ challenge: body.challenge });

  const event = body.event || {};
  const text = event.text || '';
  if (!text) return res.status(200).json({ ok: true });

  // Slack ownership/signature verification is not implemented yet. Do not
  // persist an unowned row that could later be mistaken for tenant activity.

  return res.status(200).json({ ok: true });
}

// ─── Generic webhook (secret-verified inbound) ─────────────────────────────

async function handleWebhook(req, res, admin) {
  const body = req.body || {};
  const secret = req.headers['x-webhook-secret'] || req.query?.secret;
  if (!secret) return jsonError(res, 401, 'Missing webhook secret');

  const { data: channels } = await admin
    .from('communication_channels')
    .select('id, config, status, connected_by')
    .eq('platform', 'webhook')
    .eq('status', 'active');

  const channel = (channels || []).find((c) => c.config?.secret === secret);
  if (!channel?.connected_by) return jsonError(res, 401, 'Invalid webhook secret');

  await admin
    .from('communication_logs')
    .insert({
      thread_id: crypto.randomUUID(),
      user_id: channel.connected_by,
      sender_type: 'system',
      sender_name: 'Webhook',
      content: body.content || body.message || JSON.stringify(body).slice(0, 500),
      context_type: 'command',
      platform: 'webhook',
      metadata: { ...body, channel_id: channel.id },
    })
    .then(
      () => {},
      () => {}
    );

  await admin
    .from('communication_channels')
    .update({ last_active: new Date().toISOString() })
    .eq('id', channel.id)
    .then(() => {})
    .catch(() => {});

  return res.status(200).json({ ok: true, received: true });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function markUpdateProcessed(admin, platform, updateId, channelId) {
  if (!updateId) return;
  await admin
    .from('processed_updates')
    .insert({ platform, update_id: updateId, channel_id: channelId })
    .then(() => {})
    .catch(() => {});
}

async function logStranger(admin, { fromId, username, firstName, lastName, message, botUsername }) {
  if (!fromId) return;
  const now = new Date().toISOString();

  // Upsert: increment attempt_count on conflict.
  const { data: existing } = await admin
    .from('communicator_strangers')
    .select('id, attempt_count, last_replied_at')
    .eq('telegram_user_id', fromId)
    .eq('bot_username', botUsername || '')
    .maybeSingle();

  let isNewStranger = false;

  if (existing) {
    await admin
      .from('communicator_strangers')
      .update({
        attempt_count: (existing.attempt_count || 1) + 1,
        last_seen_at: now,
        telegram_username: username || null,
        first_name: firstName || null,
        last_name: lastName || null,
      })
      .eq('id', existing.id)
      .then(() => {})
      .catch(() => {});

    // Reply at most once per 24h.
    const lastReplied = existing.last_replied_at ? new Date(existing.last_replied_at).getTime() : 0;
    const dayMs = 24 * 3600 * 1000;
    if (Date.now() - lastReplied >= dayMs) {
      await maybeReplyStranger(admin, existing.id, fromId, botUsername);
    }
  } else {
    isNewStranger = true;
    const { data: created } = await admin
      .from('communicator_strangers')
      .insert({
        telegram_user_id: fromId,
        telegram_username: username || null,
        first_name: firstName || null,
        last_name: lastName || null,
        first_message: (message || '').slice(0, 200),
        bot_username: botUsername || '',
      })
      .select('id')
      .maybeSingle();
    if (created?.id) {
      await maybeReplyStranger(admin, created.id, fromId, botUsername);
    }
  }

  // ── Threshold alert: >5 distinct strangers in last hour → ping admins,
  // at most once per hour. Only triggered on NEW strangers (avoids spam
  // from a single confused user re-DMing).
  if (isNewStranger) {
    await maybeFireThresholdAlert(admin, botUsername).catch(() => {});
  }
}

// State: last admin alert timestamp (per cold-start). Acceptable to reset on
// redeploy — at worst we send one extra alert.
let _lastStrangerAlertAt = 0;
const STRANGER_ALERT_THRESHOLD = 5;
const STRANGER_ALERT_WINDOW_MS = 60 * 60 * 1000; // 1h
const STRANGER_ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1h

async function maybeFireThresholdAlert(admin, botUsername) {
  if (Date.now() - _lastStrangerAlertAt < STRANGER_ALERT_COOLDOWN_MS) return;

  const since = new Date(Date.now() - STRANGER_ALERT_WINDOW_MS).toISOString();
  const { count } = await admin
    .from('communicator_strangers')
    .select('id', { count: 'exact', head: true })
    .gte('first_seen_at', since);

  if ((count || 0) < STRANGER_ALERT_THRESHOLD) return;

  // Found a probe pattern. Push to every admin user via notifyUser.
  _lastStrangerAlertAt = Date.now();

  const { data: admins } = await admin.from('users').select('id').eq('role', 'admin');

  if (!admins || admins.length === 0) return;

  const appUrl = process.env.PUBLIC_APP_URL || 'https://orchestratori.vercel.app';
  const { notifyUser } = await import('../utils/notify-user.js');
  for (const a of admins) {
    await notifyUser(admin, a.id, 'stranger.threshold', {
      title: `⚠️ ${count} unknown Telegram users tried to DM @${botUsername || 'the bot'} in the last hour`,
      body: 'Check the Strangers tab in Communicator for details. This may be a probe.',
      deepLink: `${appUrl}/communicator?tab=strangers`,
      buttons: [
        { text: 'Review strangers', url: `${appUrl}/communicator?tab=strangers` },
        { text: 'Dismiss', callback_data: 'digest:dismiss' },
      ],
    }).then(
      () => {},
      () => {}
    );
  }
}

async function maybeReplyStranger(admin, strangerId, fromId, botUsername) {
  // Polite one-liner so legitimate-but-unlinked users know what to do.
  const token = process.env.TELEGRAM_SHARED_BOT_TOKEN;
  if (!token) return;
  await sendTelegramMessage(
    token,
    fromId,
    "Hi! I don't recognize you yet. Open Orqaly → Settings → Connect Telegram to link your account."
  );
  await admin
    .from('communicator_strangers')
    .update({ last_replied_at: new Date().toISOString() })
    .eq('id', strangerId)
    .then(() => {})
    .catch(() => {});
}

export async function sendTelegramMessage(botToken, chatId, text, opts = {}) {
  if (!botToken || !chatId) return;
  const payload = {
    chat_id: chatId,
    text: String(text).slice(0, 4096),
    parse_mode: opts.parseMode || 'HTML',
    disable_web_page_preview: true,
  };
  if (opts.reply_markup) payload.reply_markup = opts.reply_markup;
  try {
    await fetchWithJobLease(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {}
}

/**
 * Send a document (PDF / file) via Telegram Bot API sendDocument.
 *
 * @param {string} botToken
 * @param {string|number} chatId
 * @param {Buffer} fileBuffer
 * @param {string} filename       e.g. 'executive-2026-05-17.pdf'
 * @param {string} [caption]      HTML-formatted, capped at 1024 chars
 * @param {object} [opts]
 * @param {object} [opts.reply_markup] inline keyboard
 * @param {string} [opts.mimeType] default application/pdf
 * @returns {Promise<boolean>}
 */
export async function sendTelegramDocument(
  botToken,
  chatId,
  fileBuffer,
  filename,
  caption = '',
  opts = {}
) {
  if (!botToken || !chatId || !fileBuffer?.length) return false;
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) {
    form.append('caption', String(caption).slice(0, 1024));
    form.append('parse_mode', 'HTML');
  }
  if (opts.reply_markup) form.append('reply_markup', JSON.stringify(opts.reply_markup));
  form.append(
    'document',
    new Blob([fileBuffer], { type: opts.mimeType || 'application/pdf' }),
    filename || 'report.pdf'
  );
  try {
    const res = await fetchWithJobLease(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      log.warn(null, 'tg.sendDocument.failed', {
        status: res.status,
        detail: detail.slice(0, 200),
      });
      return false;
    }
    return true;
  } catch (err) {
    log.warn(null, 'tg.sendDocument.error', { error: err.message });
    return false;
  }
}
