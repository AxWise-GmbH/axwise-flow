/**
 * Concilium cost tracker.
 *
 * Updates concilium_rate_limits counters after every LLM invocation:
 * - Increments request counts (hour, day)
 * - Adds token usage (day)
 * - Adds cost (day, month)
 *
 * Auto-resets expired periods before incrementing.
 */
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('concilium-cost-tracker');

/**
 * Record a completed LLM invocation against the entity's rate limits.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {object} opts
 * @param {string} opts.entityType - 'user' | 'agent' | 'board' | 'team'
 * @param {string} opts.entityId
 * @param {number} opts.tokensUsed - Total tokens consumed
 * @param {number} opts.costUsd - Cost in USD
 * @param {import('http').IncomingMessage} [opts.req]
 * @returns {Promise<{ updated: boolean, overBudget: boolean, reason?: string }>}
 */
export async function recordUsage(admin, { entityType, entityId, tokensUsed, costUsd, req }) {
  // Fetch current rate limit record
  const { data: limit, error: fetchErr } = await admin
    .from('concilium_rate_limits')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle();

  if (fetchErr) {
    log.warn(req, 'cost_tracker.fetch.error', { error: fetchErr.message, entityType, entityId });
    return { updated: false, overBudget: false };
  }

  // No limit record — nothing to track
  if (!limit) {
    return { updated: false, overBudget: false };
  }

  const now = new Date();
  const updates = {};

  // Auto-reset expired periods
  if (now >= new Date(limit.hour_reset_at)) {
    updates.current_requests_hour = 0;
    updates.hour_reset_at = new Date(now.getTime() + 3600_000).toISOString();
  }

  if (now >= new Date(limit.day_reset_at)) {
    updates.current_requests_day = 0;
    updates.current_tokens_day = 0;
    updates.current_cost_day_usd = 0;
    updates.day_reset_at = new Date(now.getTime() + 86400_000).toISOString();
  }

  if (now >= new Date(limit.month_reset_at)) {
    updates.current_cost_month_usd = 0;
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
    nextMonth.setHours(0, 0, 0, 0);
    updates.month_reset_at = nextMonth.toISOString();
  }

  // Compute new counter values (apply resets first, then increment)
  const currentHour = (updates.current_requests_hour ?? limit.current_requests_hour) + 1;
  const currentDay = (updates.current_requests_day ?? limit.current_requests_day) + 1;
  const currentTokens = (updates.current_tokens_day ?? limit.current_tokens_day) + (tokensUsed || 0);
  const currentCostDay =
    Number(updates.current_cost_day_usd ?? limit.current_cost_day_usd) + (costUsd || 0);
  const currentCostMonth =
    Number(updates.current_cost_month_usd ?? limit.current_cost_month_usd) + (costUsd || 0);

  updates.current_requests_hour = currentHour;
  updates.current_requests_day = currentDay;
  updates.current_tokens_day = currentTokens;
  updates.current_cost_day_usd = currentCostDay;
  updates.current_cost_month_usd = currentCostMonth;
  updates.updated_at = now.toISOString();

  // Persist
  const { error: updateErr } = await admin
    .from('concilium_rate_limits')
    .update(updates)
    .eq('id', limit.id);

  if (updateErr) {
    log.warn(req, 'cost_tracker.update.error', { error: updateErr.message, id: limit.id });
    return { updated: false, overBudget: false };
  }

  // Check if any limit is now exceeded (for post-request alerting)
  const overBudget = checkOverBudget(
    { ...limit, ...updates },
    limit
  );

  if (overBudget.exceeded) {
    log.warn(req, 'cost_tracker.over_budget', {
      entityType,
      entityId,
      reason: overBudget.reason,
      current: {
        requests_hour: currentHour,
        requests_day: currentDay,
        tokens_day: currentTokens,
        cost_day: currentCostDay,
        cost_month: currentCostMonth,
      },
    });
  }

  return {
    updated: true,
    overBudget: overBudget.exceeded,
    reason: overBudget.reason,
  };
}

/**
 * Check if any budget threshold is now exceeded after recording usage.
 */
function checkOverBudget(current, limits) {
  if (current.current_requests_hour >= limits.max_requests_per_hour) {
    return { exceeded: true, reason: `Hourly requests: ${current.current_requests_hour}/${limits.max_requests_per_hour}` };
  }
  if (current.current_requests_day >= limits.max_requests_per_day) {
    return { exceeded: true, reason: `Daily requests: ${current.current_requests_day}/${limits.max_requests_per_day}` };
  }
  if (current.current_tokens_day >= limits.max_tokens_per_day) {
    return { exceeded: true, reason: `Daily tokens: ${current.current_tokens_day}/${limits.max_tokens_per_day}` };
  }
  if (Number(current.current_cost_day_usd) >= Number(limits.max_cost_per_day_usd)) {
    return { exceeded: true, reason: `Daily cost: $${Number(current.current_cost_day_usd).toFixed(4)}/$${Number(limits.max_cost_per_day_usd).toFixed(4)}` };
  }
  if (Number(current.current_cost_month_usd) >= Number(limits.max_cost_per_month_usd)) {
    return { exceeded: true, reason: `Monthly cost: $${Number(current.current_cost_month_usd).toFixed(4)}/$${Number(limits.max_cost_per_month_usd).toFixed(4)}` };
  }
  return { exceeded: false };
}
