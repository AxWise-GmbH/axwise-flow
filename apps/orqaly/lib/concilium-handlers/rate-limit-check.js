/**
 * Concilium rate limit checker.
 *
 * Queries the concilium_rate_limits table to enforce per-entity caps
 * (requests/hour, requests/day, tokens/day, cost/day, cost/month).
 * Auto-resets counters when periods expire.
 *
 * Called before every concilium LLM invocation.
 */
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('concilium-rate-limit');

/**
 * Check whether an entity is allowed to proceed with a concilium evaluation.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin - Service-role Supabase client
 * @param {object} opts
 * @param {string} opts.entityType - 'user' | 'agent' | 'board' | 'team'
 * @param {string} opts.entityId - The entity identifier
 * @param {string} [opts.userId] - Owner user ID (for creating default limits)
 * @param {import('http').IncomingMessage} [opts.req] - Request for logging context
 * @returns {Promise<{ allowed: boolean, reason?: string, limit?: object }>}
 */
export async function checkConciliumRateLimit(admin, { entityType, entityId, userId, req }) {
  const now = new Date();

  // Fetch existing rate limit record
  const { data: limit, error: fetchErr } = await admin
    .from('concilium_rate_limits')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle();

  if (fetchErr) {
    log.warn(req, 'rate_limit.fetch.error', { error: fetchErr.message, entityType, entityId });
    // Fail open: allow if we can't read limits (don't block on DB errors)
    return { allowed: true };
  }

  // No limit record exists — create default and allow
  if (!limit) {
    if (userId) {
      await createDefaultLimit(admin, { entityType, entityId, userId, req });
    }
    return { allowed: true };
  }

  // Check quarantine
  if (limit.quarantined) {
    return {
      allowed: false,
      reason: `Entity quarantined: ${limit.quarantine_reason || 'policy violation'}`,
      limit,
    };
  }

  // Auto-reset expired periods
  const resets = buildResets(limit, now);
  if (resets) {
    const { error: resetErr } = await admin
      .from('concilium_rate_limits')
      .update({ ...resets, updated_at: now.toISOString() })
      .eq('id', limit.id);

    if (resetErr) {
      log.warn(req, 'rate_limit.reset.error', { error: resetErr.message, id: limit.id });
    } else {
      // Apply resets to local copy
      Object.assign(limit, resets);
    }
  }

  // Check hourly request limit
  if (limit.current_requests_hour >= limit.max_requests_per_hour) {
    return {
      allowed: false,
      reason: `Hourly request limit exceeded (${limit.max_requests_per_hour}/hr)`,
      limit,
    };
  }

  // Check daily request limit
  if (limit.current_requests_day >= limit.max_requests_per_day) {
    return {
      allowed: false,
      reason: `Daily request limit exceeded (${limit.max_requests_per_day}/day)`,
      limit,
    };
  }

  // Check daily token limit
  if (limit.current_tokens_day >= limit.max_tokens_per_day) {
    return {
      allowed: false,
      reason: `Daily token limit exceeded (${limit.max_tokens_per_day}/day)`,
      limit,
    };
  }

  // Check daily cost limit
  if (Number(limit.current_cost_day_usd) >= Number(limit.max_cost_per_day_usd)) {
    return {
      allowed: false,
      reason: `Daily cost limit exceeded ($${limit.max_cost_per_day_usd}/day)`,
      limit,
    };
  }

  // Check monthly cost limit
  if (Number(limit.current_cost_month_usd) >= Number(limit.max_cost_per_month_usd)) {
    return {
      allowed: false,
      reason: `Monthly cost limit exceeded ($${limit.max_cost_per_month_usd}/month)`,
      limit,
    };
  }

  return { allowed: true, limit };
}

/**
 * Build an object of fields that need resetting based on expired periods.
 * Returns null if no resets are needed.
 */
function buildResets(limit, now) {
  const resets = {};
  let hasResets = false;

  if (now >= new Date(limit.hour_reset_at)) {
    resets.current_requests_hour = 0;
    resets.hour_reset_at = new Date(now.getTime() + 3600_000).toISOString();
    hasResets = true;
  }

  if (now >= new Date(limit.day_reset_at)) {
    resets.current_requests_day = 0;
    resets.current_tokens_day = 0;
    resets.current_cost_day_usd = 0;
    resets.day_reset_at = new Date(now.getTime() + 86400_000).toISOString();
    hasResets = true;
  }

  if (now >= new Date(limit.month_reset_at)) {
    resets.current_cost_month_usd = 0;
    // Next month boundary
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
    nextMonth.setHours(0, 0, 0, 0);
    resets.month_reset_at = nextMonth.toISOString();
    hasResets = true;
  }

  return hasResets ? resets : null;
}

/**
 * Create a default rate limit record for a new entity.
 */
async function createDefaultLimit(admin, { entityType, entityId, userId, req }) {
  const { error } = await admin.from('concilium_rate_limits').insert({
    user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    max_requests_per_hour: 100,
    max_requests_per_day: 1000,
    max_tokens_per_day: 500000,
    max_cost_per_day_usd: 10.0,
    max_cost_per_month_usd: 100.0,
    hour_reset_at: new Date(Date.now() + 3600_000).toISOString(),
    day_reset_at: new Date(Date.now() + 86400_000).toISOString(),
    month_reset_at: getNextMonthStart().toISOString(),
  });

  if (error) {
    // Ignore unique constraint violation (another worker may have created it)
    if (!error.message?.includes('unique')) {
      log.warn(req, 'rate_limit.create_default.error', { error: error.message, entityType, entityId });
    }
  }
}

function getNextMonthStart() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}
