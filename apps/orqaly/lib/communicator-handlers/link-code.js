/**
 * [module: connection-hub]
 * Link-code lifecycle for the shared-bot onboarding flow.
 *
 * Endpoints (mounted via api/communicator.js):
 *   POST /api/communicator/link-code  { action: 'start' }            → auth-required, creates a code
 *   POST /api/communicator/link-code  { action: 'status', code }     → auth-required, polls (channel created yet?)
 *
 * The redeem path is called by the Telegram webhook directly (no HTTP).
 */
import { cors } from '../../api/_lib/cors.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('communicator-link-code');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // unambiguous
const CODE_LEN = 6;
const TTL_MIN = 10;

function makeCode() {
  let out = '';
  const arr = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(arr);
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[arr[i] % ALPHABET.length];
  return out;
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const token = getBearerToken(req);
    if (!token) return jsonError(res, 401, 'Missing authorization');
    const auth = await verifySupabaseToken(token);
    if (!auth?.id) return jsonError(res, 401, 'Invalid token');

    const userId = auth.id;
    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    const { action, code } = req.body || {};

    if (action === 'start') {
      const sharedBot = (process.env.TELEGRAM_SHARED_BOT_USERNAME || '').toLowerCase();
      if (!sharedBot) {
        return jsonError(res, 503, 'Shared bot not configured. Set TELEGRAM_SHARED_BOT_USERNAME.');
      }
      // Clean up old codes for this user (best-effort).
      await admin
        .from('telegram_link_codes')
        .delete()
        .eq('user_id', userId)
        .or(`used_at.not.is.null,expires_at.lt.${new Date().toISOString()}`)
        .then(() => {})
        .catch(() => {});

      // Generate fresh code (retry up to 3 times on collision).
      let inserted = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const c = makeCode();
        const { data, error } = await admin
          .from('telegram_link_codes')
          .insert({
            code: c,
            user_id: userId,
            bot_username: sharedBot,
            expires_at: new Date(Date.now() + TTL_MIN * 60_000).toISOString(),
          })
          .select('code, expires_at')
          .maybeSingle();
        if (!error && data) { inserted = data; break; }
      }
      if (!inserted) return jsonError(res, 500, 'Could not generate link code');

      return res.status(200).json({
        ok: true,
        code: inserted.code,
        expires_at: inserted.expires_at,
        bot_username: sharedBot,
        deep_link: `https://t.me/${sharedBot}?start=${inserted.code}`,
        ttl_seconds: TTL_MIN * 60,
      });
    }

    if (action === 'status') {
      if (!code) return jsonError(res, 400, 'Missing code');
      const { data: codeRow } = await admin
        .from('telegram_link_codes')
        .select('code, user_id, used_at, expires_at')
        .eq('code', String(code).toUpperCase())
        .eq('user_id', userId)
        .maybeSingle();
      if (!codeRow) return res.status(200).json({ ok: true, status: 'unknown' });
      if (codeRow.used_at) {
        // Find the matching channel to confirm.
        const { data: ch } = await admin
          .from('communication_channels')
          .select('id, status, config')
          .eq('connected_by', userId)
          .eq('platform', 'telegram')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return res.status(200).json({
          ok: true,
          status: 'linked',
          channel: ch ? { id: ch.id, telegram_username: ch.config?.telegram_username || null } : null,
        });
      }
      if (new Date(codeRow.expires_at) < new Date()) {
        return res.status(200).json({ ok: true, status: 'expired' });
      }
      return res.status(200).json({ ok: true, status: 'pending' });
    }

    if (action === 'cancel') {
      if (!code) return jsonError(res, 400, 'Missing code');
      await admin
        .from('telegram_link_codes')
        .delete()
        .eq('code', String(code).toUpperCase())
        .eq('user_id', userId)
        .then(() => {})
        .catch(() => {});
      return res.status(200).json({ ok: true });
    }

    return jsonError(res, 400, `Unknown action: ${action}`);
  } catch (err) {
    return handleApiError(res, err, 'communicator-link-code');
  }
}

/**
 * Server-side redeem (called by webhook-receiver when /start CODE is sent).
 * Idempotent: re-using a code after success is a no-op.
 */
export async function redeemLinkCode(admin, opts) {
  const { code, telegramUserId, telegramUsername, firstName, lastName, chatId, botUsername } = opts;

  if (!code || !telegramUserId) return { ok: false, error: 'missing code or telegram id' };

  const { data: codeRow } = await admin
    .from('telegram_link_codes')
    .select('code, user_id, used_at, expires_at')
    .eq('code', String(code).toUpperCase())
    .maybeSingle();

  if (!codeRow) return { ok: false, error: 'code not found' };
  if (codeRow.used_at) {
    // Replay tolerance: return the existing channel for that user.
    const { data: ch } = await admin
      .from('communication_channels')
      .select('id')
      .eq('connected_by', codeRow.user_id)
      .eq('platform', 'telegram')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { ok: true, replayed: true, channelId: ch?.id || null };
  }
  if (new Date(codeRow.expires_at) < new Date()) {
    return { ok: false, error: 'code expired' };
  }

  // Single-channel rule: deactivate any other active Telegram channel for
  // this user. The UI also enforces this, but the DB is the source of truth
  // — prevents double routing and duplicate notifications when a user
  // re-links from a new device without first disconnecting.
  await admin
    .from('communication_channels')
    .update({ status: 'inactive' })
    .eq('connected_by', codeRow.user_id)
    .eq('platform', 'telegram')
    .eq('status', 'active')
    .then(() => {}, () => {});

  // Build allowed_ids = the redeemer's Telegram ID. Multi-device share the same id.
  const config = {
    shared: true,
    allowed_ids: String(telegramUserId),
    chat_ids: [String(chatId)],
    telegram_username: telegramUsername || '',
    first_name: firstName || '',
    last_name: lastName || '',
    bot_username: botUsername || (process.env.TELEGRAM_SHARED_BOT_USERNAME || '').toLowerCase(),
    secret_token: process.env.TELEGRAM_SHARED_SECRET_TOKEN || '',
    personality: 'professional',
    linked_at: new Date().toISOString(),
  };

  const { data: ch, error: insErr } = await admin
    .from('communication_channels')
    .insert({
      platform: 'telegram',
      name: `Telegram · @${telegramUsername || telegramUserId}`,
      config,
      status: 'active',
      connected_by: codeRow.user_id,
      last_active: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle();

  if (insErr) {
    log.error(null, 'link.code.channel_insert_failed', insErr);
    return { ok: false, error: 'could not create channel' };
  }

  await admin
    .from('telegram_link_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code', codeRow.code)
    .then(() => {})
    .catch(() => {});

  return { ok: true, channelId: ch?.id || null, userId: codeRow.user_id };
}
