/**
 * [module: connection-hub]
 * Server-side Telegram setWebhook / deleteWebhook for both:
 *   - The platform-shared bot (admin one-time setup, env-var token)
 *   - User-owned BYO bots (per-channel tokens stored in communication_channels)
 *
 * POST /api/communicator/telegram-register
 *   body: { action: 'register' | 'unregister' | 'info', channelId?: uuid, scope?: 'shared' }
 *
 * Auth required (JWT). For 'shared' scope, caller must have users.role = 'admin'.
 */
import { cors } from '../../api/_lib/cors.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('telegram-register');

function publicBaseUrl() {
  const env = process.env.PUBLIC_API_BASE_URL || process.env.VERCEL_URL || '';
  if (env.startsWith('http')) return env;
  if (env) return `https://${env}`;
  return 'https://orchestratori.vercel.app';
}

function webhookUrl() {
  return `${publicBaseUrl()}/api/communicator/webhook/telegram`;
}

function randomSecret(len = 48) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  let s = '';
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  for (let i = 0; i < len; i++) s += ALPHA[arr[i] % ALPHA.length];
  return s;
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const token = getBearerToken(req);
    if (!token) return jsonError(res, 401, 'Missing authorization');
    const auth = await verifySupabaseToken(token);
    if (!auth?.user?.id) return jsonError(res, 401, 'Invalid token');

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    const { action, channelId, scope } = req.body || {};

    // ── Shared-bot path (admin one-time setup) ──
    if (scope === 'shared') {
      const { data: userRow } = await admin
        .from('users')
        .select('role')
        .eq('id', auth.id)
        .maybeSingle();
      if (userRow?.role !== 'admin') {
        return jsonError(res, 403, 'Admin only');
      }
      const botToken = process.env.TELEGRAM_SHARED_BOT_TOKEN;
      const secret = process.env.TELEGRAM_SHARED_SECRET_TOKEN;
      if (!botToken || !secret) {
        return jsonError(res, 503, 'TELEGRAM_SHARED_BOT_TOKEN or TELEGRAM_SHARED_SECRET_TOKEN missing');
      }

      if (action === 'unregister') {
        const resp = await tgCall(botToken, 'deleteWebhook', {});
        return res.status(200).json({ ok: true, scope: 'shared', telegram: resp });
      }
      if (action === 'info') {
        const resp = await tgCall(botToken, 'getWebhookInfo', {});
        return res.status(200).json({ ok: true, scope: 'shared', telegram: resp });
      }
      // register / re-register
      const resp = await tgCall(botToken, 'setWebhook', {
        url: webhookUrl(),
        secret_token: secret,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false,
      });
      return res.status(200).json({ ok: true, scope: 'shared', webhook_url: webhookUrl(), telegram: resp });
    }

    // ── BYO-bot path (per-channel) ──
    if (!channelId) return jsonError(res, 400, 'Missing channelId');

    const { data: channel } = await admin
      .from('communication_channels')
      .select('id, platform, config, connected_by')
      .eq('id', channelId)
      .maybeSingle();

    if (!channel) return jsonError(res, 404, 'Channel not found');
    if (channel.platform !== 'telegram') return jsonError(res, 400, 'Not a Telegram channel');
    if (channel.connected_by !== auth.id) return jsonError(res, 403, 'Not your channel');

    const botToken = channel.config?.bot_token;
    if (!botToken) return jsonError(res, 400, 'Channel has no bot_token');

    if (action === 'unregister') {
      const resp = await tgCall(botToken, 'deleteWebhook', {});
      await admin
        .from('communication_channels')
        .update({ status: 'inactive' })
        .eq('id', channelId)
        .then(() => {})
        .catch(() => {});
      return res.status(200).json({ ok: true, telegram: resp });
    }

    if (action === 'info') {
      const resp = await tgCall(botToken, 'getWebhookInfo', {});
      return res.status(200).json({ ok: true, telegram: resp });
    }

    // register / re-register
    const secret = channel.config?.secret_token || randomSecret();
    const resp = await tgCall(botToken, 'setWebhook', {
      url: webhookUrl(),
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    });
    if (!resp?.ok) {
      log.warn(req, 'tg.setWebhook.fail', { detail: resp });
      return jsonError(res, 502, resp?.description || 'setWebhook failed');
    }

    // Persist secret token + webhook URL + flip status to active.
    await admin
      .from('communication_channels')
      .update({
        status: 'active',
        config: {
          ...channel.config,
          secret_token: secret,
          webhook_url: webhookUrl(),
          webhook_registered_at: new Date().toISOString(),
        },
      })
      .eq('id', channelId)
      .then(() => {})
      .catch(() => {});

    return res.status(200).json({ ok: true, webhook_url: webhookUrl(), telegram: resp });
  } catch (err) {
    return handleApiError(res, err, 'telegram-register');
  }
}

async function tgCall(botToken, method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.json().catch(() => ({ ok: false, description: 'invalid response' }));
}
