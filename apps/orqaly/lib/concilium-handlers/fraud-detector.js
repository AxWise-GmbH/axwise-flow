/**
 * Concilium fraud detector.
 *
 * Analyzes request patterns for abuse indicators:
 * - Rapid-fire requests (velocity check)
 * - Cost anomalies (sudden spikes)
 * - Repeated failures (possible probing)
 * - Suspicious timing (coordinated attacks)
 *
 * Can auto-quarantine entities when critical thresholds are hit.
 */
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('concilium-fraud');

// ── Thresholds ───────────────────────────────────────────────────

const THRESHOLDS = {
  // Rapid-fire: more than N requests in M seconds indicates spam
  rapidFire: { requests: 10, windowSeconds: 60 },

  // Cost anomaly: if a single request costs more than N times the average
  costAnomalyMultiplier: 5,

  // Repeated failures: N consecutive failures triggers review
  maxConsecutiveFailures: 5,

  // Auto-quarantine: N fraud events in 1 hour triggers quarantine
  autoQuarantineThreshold: 3,
  autoQuarantineWindowHours: 1,
};

// ── Public API ───────────────────────────────────────────────────

/**
 * Analyze a request for fraud indicators.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {object} opts
 * @param {string} opts.entityType - 'user' | 'agent' | 'board'
 * @param {string} opts.entityId
 * @param {string} [opts.userId]
 * @param {string} [opts.boardId]
 * @param {number} [opts.requestCostUsd] - Cost of this specific request
 * @param {boolean} [opts.requestFailed] - Whether the request resulted in failure
 * @param {import('http').IncomingMessage} [opts.req]
 * @returns {Promise<{ clean: boolean, events: Array<object>, quarantined: boolean }>}
 */
export async function analyzeRequest(admin, opts) {
  const { entityType, entityId, userId, boardId, requestCostUsd, requestFailed, req } = opts;
  const events = [];
  let quarantined = false;

  // 1. Check rapid-fire pattern
  const rapidFire = await checkRapidFire(admin, { entityType, entityId, userId, boardId });
  if (rapidFire.detected) {
    events.push(rapidFire.event);
  }

  // 2. Check cost anomaly
  if (requestCostUsd != null && requestCostUsd > 0) {
    const costAnomaly = await checkCostAnomaly(admin, { entityType, entityId, userId, boardId, cost: requestCostUsd });
    if (costAnomaly.detected) {
      events.push(costAnomaly.event);
    }
  }

  // 3. Check repeated failures
  if (requestFailed) {
    const failures = await checkRepeatedFailures(admin, { entityType, entityId, userId, boardId });
    if (failures.detected) {
      events.push(failures.event);
    }
  }

  // Log fraud events
  if (events.length > 0) {
    await logFraudEvents(admin, events, req);

    // Check if auto-quarantine threshold is reached
    quarantined = await maybeAutoQuarantine(admin, { entityType, entityId, userId, req });
  }

  return {
    clean: events.length === 0,
    events,
    quarantined,
  };
}

// ── Detection methods ────────────────────────────────────────────

/**
 * Check for rapid-fire request pattern by counting recent fraud events.
 */
async function checkRapidFire(admin, { entityType, entityId, userId, boardId }) {
  const windowStart = new Date(
    Date.now() - THRESHOLDS.rapidFire.windowSeconds * 1000
  ).toISOString();

  // Count recent evaluations for this entity (using security events as proxy)
  const { count, error } = await admin
    .from('concilium_security_events')
    .select('id', { count: 'exact', head: true })
    .eq('board_id', boardId || entityId)
    .gte('created_at', windowStart);

  if (error || count == null) return { detected: false };

  if (count >= THRESHOLDS.rapidFire.requests) {
    return {
      detected: true,
      event: {
        user_id: userId || null,
        agent_id: entityType === 'agent' ? entityId : null,
        board_id: boardId || null,
        event_type: 'rapid_fire_requests',
        severity: 'high',
        description: `${count} security events in ${THRESHOLDS.rapidFire.windowSeconds}s window`,
        details: { count, window_seconds: THRESHOLDS.rapidFire.windowSeconds },
        request_count: count,
        auto_action: 'throttle',
      },
    };
  }

  return { detected: false };
}

/**
 * Check if a request cost is anomalously high compared to recent average.
 */
async function checkCostAnomaly(admin, { entityType, entityId, userId, boardId, cost }) {
  // Get average cost from recent evaluations
  const { data, error } = await admin
    .from('concilium_evaluations')
    .select('estimated_cost_usd')
    .eq('concilium_id', boardId || entityId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data || data.length < 3) return { detected: false };

  const costs = data.map((r) => Number(r.estimated_cost_usd || 0)).filter((c) => c > 0);
  if (costs.length === 0) return { detected: false };

  const avgCost = costs.reduce((sum, c) => sum + c, 0) / costs.length;

  if (cost > avgCost * THRESHOLDS.costAnomalyMultiplier && avgCost > 0) {
    return {
      detected: true,
      event: {
        user_id: userId || null,
        agent_id: entityType === 'agent' ? entityId : null,
        board_id: boardId || null,
        event_type: 'cost_anomaly',
        severity: 'medium',
        description: `Request cost $${cost.toFixed(4)} is ${(cost / avgCost).toFixed(1)}x the average ($${avgCost.toFixed(4)})`,
        details: { request_cost: cost, avg_cost: avgCost, multiplier: cost / avgCost },
        cost_attempted: cost,
        auto_action: 'none',
      },
    };
  }

  return { detected: false };
}

/**
 * Check for repeated consecutive failures (possible probing/abuse).
 */
async function checkRepeatedFailures(admin, { entityType, entityId, userId, boardId }) {
  const { data, error } = await admin
    .from('concilium_fraud_events')
    .select('event_type')
    .eq('event_type', 'repeated_failures')
    .or(`user_id.eq.${userId},agent_id.eq.${entityId}`)
    .order('created_at', { ascending: false })
    .limit(THRESHOLDS.maxConsecutiveFailures);

  if (error) return { detected: false };

  const recentFailures = data?.length || 0;

  if (recentFailures >= THRESHOLDS.maxConsecutiveFailures - 1) {
    return {
      detected: true,
      event: {
        user_id: userId || null,
        agent_id: entityType === 'agent' ? entityId : null,
        board_id: boardId || null,
        event_type: 'repeated_failures',
        severity: 'high',
        description: `${recentFailures + 1} consecutive failures detected`,
        details: { failure_count: recentFailures + 1 },
        auto_action: 'throttle',
      },
    };
  }

  return { detected: false };
}

// ── Logging & quarantine ─────────────────────────────────────────

async function logFraudEvents(admin, events, req) {
  const rows = events.map((e) => ({
    ...e,
    reviewed: false,
    created_at: new Date().toISOString(),
  }));

  const { error } = await admin.from('concilium_fraud_events').insert(rows);
  if (error) {
    log.warn(req, 'fraud_event.insert.error', { error: error.message, count: rows.length });
  }
}

/**
 * Auto-quarantine an entity if too many fraud events occurred recently.
 */
async function maybeAutoQuarantine(admin, { entityType, entityId, userId, req }) {
  const windowStart = new Date(
    Date.now() - THRESHOLDS.autoQuarantineWindowHours * 3600_000
  ).toISOString();

  // Count recent fraud events for this entity
  let query = admin
    .from('concilium_fraud_events')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', windowStart);

  if (entityType === 'user' && userId) {
    query = query.eq('user_id', userId);
  } else {
    query = query.eq('agent_id', entityId);
  }

  const { count, error } = await query;
  if (error || count == null) return false;

  if (count >= THRESHOLDS.autoQuarantineThreshold) {
    // Quarantine the entity in rate_limits table
    const { error: updateErr } = await admin
      .from('concilium_rate_limits')
      .update({
        quarantined: true,
        quarantine_reason: `Auto-quarantined: ${count} fraud events in ${THRESHOLDS.autoQuarantineWindowHours}h`,
        quarantined_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('entity_type', entityType)
      .eq('entity_id', entityId);

    if (updateErr) {
      log.warn(req, 'auto_quarantine.update.error', { error: updateErr.message, entityType, entityId });
      return false;
    }

    log.warn(req, 'auto_quarantine.triggered', {
      entityType,
      entityId,
      fraud_events: count,
      window_hours: THRESHOLDS.autoQuarantineWindowHours,
    });

    return true;
  }

  return false;
}
