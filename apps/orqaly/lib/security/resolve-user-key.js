/**
 * Resolve an API key for server-side use: user's encrypted key first, falling
 * back to process.env. All resolutions are auditable.
 */
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { decryptEnvelope, buildAad } from './envelope-crypto.js';
import { readEnvelope } from './vault-storage.js';
import { createLogger } from '../../api/_lib/logger.js';

const DEFAULT_PLATFORM_CREDITS_LIMIT_USD = 50;

const log = createLogger('resolve-user-key');

/** Short in-process cache to avoid per-request DB + vault hits. */
const cache = new Map(); // `${userId}:${provider}:${slot}` -> { entry, expiry }
const TTL_MS = 30_000;

export function invalidateResolveCache(userId, provider, slot = 'default') {
  cache.delete(`${userId}:${provider}:${slot}`);
}

/**
 * @param {object} opts
 * @param {string} opts.userId            - authenticated user id (never trust client-supplied)
 * @param {string} opts.provider          - e.g. 'llm:openai', 'tool:github'
 * @param {string} [opts.slot='default']
 * @param {string} [opts.envVar]          - fallback env var name (optional)
 * @param {boolean} [opts.requireUser]    - if true, refuse to fall back to env
 * @param {string} [opts.reason]          - audit detail
 * @param {object} [opts.platformCreditsCheck] - when set, the fallback below
 *   isn't a plain unmetered platform key — it's the capped "Use platform
 *   credits" path. Before returning a key, verifies this user's running spend
 *   plus this call's pre-flight worst-case estimate would not exceed the cap.
 *   { envVar: string, limitUsd?: number, estimatedCallCostUsd: number }
 * @returns {Promise<{source:'user'|'platform'|'platform-credits'|'none', key:string|null, keyRowId?:string, kekId?:string, platformCreditLimitExceeded?:boolean}>}
 */
export async function resolveUserKey({
  userId,
  provider,
  slot = 'default',
  envVar,
  requireUser = false,
  reason,
  platformCreditsCheck,
}) {
  if (!provider) throw new Error('resolveUserKey: provider required');

  const cacheKey = `${userId || '_none'}:${provider}:${slot}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiry > Date.now()) return hit.entry;

  let result = { source: 'none', key: null };

  if (userId) {
    const admin = buildSupabaseAdminClient();
    if (admin) {
      const { data: row, error } = await admin
        .from('user_api_keys')
        .select('id, vault_secret_id, kek_id, provider, slot, user_id')
        .eq('user_id', userId)
        .eq('provider', provider)
        .eq('slot', slot)
        .eq('is_current', true)
        .maybeSingle();

      if (error) {
        log.warn(null, 'resolve.db_error', { provider, err: error.message });
      } else if (row) {
        try {
          const envelopeJson = await readEnvelope(row.vault_secret_id);
          const expectedAad = buildAad(userId, provider, slot);
          const { plaintext, kekId } = decryptEnvelope(envelopeJson, { expectedAad });
          // Defense in depth — service-role could theoretically return a row
          // with a mismatched user_id; verify before handing out the key.
          if (row.user_id !== userId) throw new Error('ROW_USER_MISMATCH');
          result = { source: 'user', key: plaintext, keyRowId: row.id, kekId };
          await audit({ userId, action: 'SECURITY_KEY_USED', entityId: row.id, details: { provider, slot, reason } });
        } catch (err) {
          log.warn(null, 'resolve.decrypt_failed', {
            provider,
            slot,
            err: err.message,
          });
          // The user HAS a key here; we just could not read it (corrupt envelope,
          // rotated KEK, AAD mismatch). That is materially different from "user has
          // no key" — falling through would silently authenticate as someone else
          // (platform env, or a legacy plaintext row). Flag it so callers that must
          // fail closed can tell the two apart. Existing callers ignore the field
          // and keep their previous fallback behaviour.
          result = { source: 'none', key: null, vaultError: true };
          await audit({
            userId,
            action: 'SECURITY_KEY_USED_FALLBACK_PLATFORM',
            entityId: row.id,
            // `error` is decryptEnvelope's message. Never widen this to include
            // the envelope or ciphertext — audit_log.details is not a secret store.
            details: { provider, slot, reason, error: err.message },
          });
        }
      }
    }
  }

  if (!result.key && !requireUser && platformCreditsCheck) {
    const { envVar: creditsEnvVar, limitUsd = DEFAULT_PLATFORM_CREDITS_LIMIT_USD, estimatedCallCostUsd = 0 } =
      platformCreditsCheck;
    const envVal = process.env[creditsEnvVar];
    if (envVal) {
      let spent;
      try {
        spent = await getPlatformCreditsSpent(userId);
      } catch (err) {
        // Ledger unreadable — fail CLOSED. A hard cap must never treat "we
        // couldn't check" as "nothing spent."
        log.warn(null, 'resolve.platform_credits_check_failed', { userId, err: err.message });
        result = { source: 'none', key: null, platformCreditLimitExceeded: true };
        spent = undefined;
      }
      if (spent !== undefined) {
        if (spent + estimatedCallCostUsd > limitUsd) {
          result = { source: 'none', key: null, platformCreditLimitExceeded: true };
          await audit({
            userId,
            action: 'PLATFORM_CREDIT_LIMIT_BLOCKED',
            entityId: null,
            details: { provider, spentUsd: spent, estimatedCallCostUsd, limitUsd, reason },
          });
        } else {
          result = { source: 'platform-credits', key: envVal };
        }
      }
    }
  }

  if (!result.key && !requireUser && !platformCreditsCheck && envVar) {
    const envVal = process.env[envVar];
    if (envVal) result = { source: 'platform', key: envVal };
  }

  if (!result.key && requireUser) {
    throw new Error(`USER_KEY_REQUIRED: no user key for ${provider}/${slot}`);
  }

  // Cache ONLY a successful user-key resolution. The cache key is
  // `${userId}:${provider}:${slot}` and deliberately omits envVar — so caching a
  // miss would let a call made without an envVar poison a later call that has one
  // (the second caller gets the cached 'none' and never reads process.env for 30s).
  // Widening the key instead would break invalidateResolveCache, which callers
  // (save-user-api-key.js, user-api-keys.js) invoke with the bare 3-part shape.
  // Misses are cheap: one indexed lookup that returned no row.
  if (result.source === 'user') cache.set(cacheKey, { entry: result, expiry: Date.now() + TTL_MS });
  return result;
}

async function audit({ userId, action, entityId, details }) {
  try {
    const admin = buildSupabaseAdminClient();
    if (!admin) return;
    await admin.from('audit_log').insert({
      action,
      entity: 'user_api_keys',
      entity_id: entityId,
      user_id: userId,
      details: JSON.stringify(details || {}),
    });
  } catch {
    // Audit failures must not break the request path.
  }
}

/**
 * This user's running total against the platform_credit_usage ledger. Returns
 * 0 for a genuinely new user (no row yet — nothing spent). Throws on any read
 * failure (no admin client, DB error) so the caller fails CLOSED — for a hard
 * spend cap, an unreadable ledger must never be treated as "$0 spent."
 */
async function getPlatformCreditsSpent(userId) {
  if (!userId) throw new Error('PLATFORM_CREDIT_CHECK_NO_USER');
  const admin = buildSupabaseAdminClient();
  if (!admin) throw new Error('PLATFORM_CREDIT_CHECK_NO_ADMIN_CLIENT');
  const { data, error } = await admin
    .from('platform_credit_usage')
    .select('total_cost_usd')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`PLATFORM_CREDIT_CHECK_DB_ERROR: ${error.message}`);
  return data ? Number(data.total_cost_usd) || 0 : 0;
}
