/**
 * KPI anomaly detection + auto-pivot.
 *
 * Phase 4 autonomy fix: when a KPI breaches its threshold, the system
 * automatically spawns an optimization continuation goal scoped to that
 * specific KPI gap — no human approval, no chain pause.
 */
import { createLogger } from '../../api/_lib/logger.js';
import { createContinuationGoal } from '../goal-handlers/loop-continuation.js';
import { notifyUser } from '../notifications/dispatch.js';
import { hasNativeAxwiseScopeMarkers } from '../_shared/native-scope-approval.js';

const log = createLogger('kpi.anomaly');

/**
 * Scan goal_kpis rows for the given user. Returns an array of anomalies:
 *   [{ kpi, goal, breach_pct, direction }]
 */
export async function detectAnomalies(admin, { userId }) {
  if (!userId) return [];
  const { data: kpis, error } = await admin
    .from('goal_kpis')
    .select(
      'id, user_id, goal_id, business_id, key, label, target, current, prev, direction, threshold_pct, source, unit, last_synced_at, metadata'
    )
    .eq('user_id', userId);
  if (error || !kpis || kpis.length === 0) return [];

  const anomalies = [];
  for (const k of kpis) {
    if (k.current == null || k.target == null) continue;
    const t = Number(k.target);
    const c = Number(k.current);
    if (!Number.isFinite(t) || !Number.isFinite(c) || t === 0) continue;
    const deltaPct = ((c - t) / Math.abs(t)) * 100;
    const breached =
      k.direction === 'higher_is_better'
        ? deltaPct <= -Number(k.threshold_pct || 20)
        : deltaPct >= Number(k.threshold_pct || 20);
    if (!breached) continue;
    anomalies.push({ kpi: k, breach_pct: Number(deltaPct.toFixed(1)) });
  }
  return anomalies;
}

/**
 * For an anomaly, spawn an optimization continuation goal scoped to
 * fixing it. Returns the new goal or null when skipped.
 */
export async function maybeAutoPivot(admin, anomaly, { req } = {}) {
  const { kpi } = anomaly;
  if (!kpi?.goal_id || !kpi?.user_id) return null;

  // Load the parent goal (chain head).
  const { data: parent } = await admin
    .from('goals')
    .select(
      'id, user_id, title, description, budget_usd, loop_chain_root_id, loop_depth, loop_enabled, loop_paused, data'
    )
    .eq('id', kpi.goal_id)
    .eq('user_id', kpi.user_id)
    .maybeSingle();
  if (!parent || parent.loop_paused) return null;

  // A KPI optimization is a new objective and therefore a new scope. Never
  // downgrade a native parent into a raw legacy feasibility child. Record a
  // visible, deterministic stop so the owner can initiate a fresh Smart Request.
  if (hasNativeAxwiseScopeMarkers(parent)) {
    await admin.from('goal_log').insert({
      goal_id: parent.id,
      event_type: 'native_kpi_pivot_blocked',
      details: {
        reason: 'native_optimization_requires_new_scope_confirmation',
        kpi_key: kpi.key,
        breach_pct: anomaly.breach_pct,
      },
    });
    try {
      await notifyUser(admin, parent.user_id, {
        event_type: 'loop_chain_paused',
        priority: 'medium',
        payload: {
          goalId: parent.id,
          reason: 'native_scope_confirmation_required',
          kpi: kpi.label || kpi.key,
        },
      });
    } catch (error) {
      log.warn(req, 'kpi.native-pivot-notification-failed', {
        goalId: parent.id,
        error: error.message,
      });
    }
    log.info(req, 'kpi.native-pivot-blocked', { parentGoalId: parent.id, kpi: kpi.key });
    return null;
  }

  // Idempotence: don't spawn a second optimization for the same KPI in
  // the last 6 hours.
  const since = new Date(Date.now() - 6 * 3600_000).toISOString();
  const { data: recent } = await admin
    .from('goals')
    .select('id, created_at')
    .eq('parent_goal_id', parent.id)
    .eq('goal_kind', 'optimization')
    .gte('created_at', since)
    .limit(1);
  if (recent && recent.length > 0) return null;

  const title = `[Optimization] Lift ${kpi.label || kpi.key} on "${parent.title}"`;
  const description = [
    `KPI "${kpi.label || kpi.key}" is at ${kpi.current} vs target ${kpi.target} (${anomaly.breach_pct}% off).`,
    `Source: ${kpi.source}. This optimization goal is scoped to closing that gap, not re-doing the parent.`,
    '',
    'Required outcomes:',
    `1. Identify the top three causes of the gap using available signals (logs, analytics, support tickets).`,
    `2. Ship at least one concrete intervention (copy change, redirect, pricing tweak, etc).`,
    `3. Confirm the KPI moves at least halfway toward target in the measurement window.`,
  ].join('\n');

  const optimizationBudget = Math.min(Number(parent.budget_usd || 10) * 0.4, 25);

  try {
    const newGoal = await createContinuationGoal(admin, parent.user_id, {
      title,
      description,
      budget_usd: optimizationBudget,
      target_value: kpi.target,
      target_unit: kpi.unit || 'usd',
      loop_enabled: true,
      parent_goal_id: parent.id,
      loop_depth: Number(parent.loop_depth || 0) + 1,
      loop_chain_root_id: parent.loop_chain_root_id || parent.id,
      _continuation_from: {
        parent_goal_id: parent.id,
        reason: 'kpi_breach',
        kpi_key: kpi.key,
        breach_pct: anomaly.breach_pct,
      },
    });

    await admin.from('goals').update({ goal_kind: 'optimization' }).eq('id', newGoal.id);

    await admin.from('goal_log').insert({
      goal_id: parent.id,
      event_type: 'loop_auto_pivot_fired',
      details: {
        optimization_goal_id: newGoal.id,
        kpi_key: kpi.key,
        breach_pct: anomaly.breach_pct,
      },
    });

    await notifyUser(admin, parent.user_id, {
      event_type: 'loop_auto_pivot_fired',
      priority: 'medium',
      payload: {
        parent_goal_id: parent.id,
        optimization_goal_id: newGoal.id,
        optimization_title: newGoal.title,
        kpi: kpi.label || kpi.key,
        breach_pct: anomaly.breach_pct,
      },
    });

    log.info(req, 'kpi.auto-pivot.ok', { parentGoalId: parent.id, kpi: kpi.key });
    return newGoal;
  } catch (err) {
    log.warn(req, 'kpi.auto-pivot.failed', { kpiId: kpi.id, error: err.message });
    return null;
  }
}
