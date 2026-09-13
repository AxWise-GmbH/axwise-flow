/**
 * h04 — Stuck active goal, no queued jobs
 *
 * Symptom: non-terminal goal, updated_at > 15 min ago, no queued/running
 *          jobs. The existing reconciler covers many of these but skips
 *          statuses in its NEEDS_USER_ACTION set. This strategy is a
 *          stricter second safety net: if a goal has been silent for 15+
 *          minutes, we re-enqueue the correct action.
 *
 * The `matches` function is synchronous; the staleness + queue check are
 * done by the self-healer using the ctx it passes in (hasQueuedJob,
 * ageMinutes) so `matches` stays pure.
 */
import { enqueueHealingContinuation, transitionHealingGoal } from './_exact-recovery.js';
import {
  pendingScopeRevisionToken,
  scopeRevisionContinuationPayload,
} from '../../_shared/scope-revision-continuation.js';
import { hasNativeAxwiseScopeMarkers } from '../../_shared/native-scope-approval.js';
import {
  invalidateNativeExecutionForCanonicalReplan,
  resolveNativeRecoveryDispatch,
} from '../native-legacy-dispatch.js';

const STAGE_MAP = {
  feasibility: 'feasibility-analysis',
  analyzing: 'po-analysis',
  researching_customer: 'customer-intelligence',
  planning: 'pm-planning',
  forming_team: 'team-formation',
  provisioning_tools: 'tool-provisioning',
  awaiting_tools: 'tool-provisioning',
  estimating: 'discovery-estimation',
  awaiting_approval: 'client-approval',
  active: 'evaluate-phase', // default if active and stuck
};

const STALE_MIN = 15;

export const name = 'h04-stuck-no-queue';
export const priority = 25;

export function matches(goal, ctx = {}) {
  if (!STAGE_MAP[goal.status]) return false;
  if (ctx.hasQueuedJob) return false;
  if ((ctx.ageMinutes || 0) < STALE_MIN) return false;
  return true;
}

export async function apply(admin, goal, { log, triggerProcessNextImpl } = {}) {
  const phases = goal.plan?.phases || [];
  const healAttempts = (goal.data?.heal_attempts || 0) + 1;
  const nowIso = new Date().toISOString();

  let action = STAGE_MAP[goal.status];
  const revisionToken = pendingScopeRevisionToken(goal);
  if (
    revisionToken === null &&
    (goal.status === 'analyzing' || goal.status === 'researching_customer')
  ) {
    return { action: 'skipped', reason: 'pending scope rebuild token is missing' };
  }
  let extra = scopeRevisionContinuationPayload(goal);

  // Scope-first Smart Requests share the legacy `analyzing` status. Preserve
  // their durable admission marker when recovering a missing queue job instead
  // of moving them into the old software-specific PO stage.
  if (goal.status === 'analyzing' && hasNativeAxwiseScopeMarkers(goal)) {
    action = 'scope-admission';
  }

  // If active, mirror goal-reconciler.js::diagnoseNextAction logic
  if (goal.status === 'active') {
    const nextPhaseIdx = phases.findIndex((p) => p.status !== 'completed');
    if (nextPhaseIdx === -1) {
      action = 'complete';
    } else {
      const phase = phases[nextPhaseIdx];
      if (phase.status === 'failed') {
        action = 'iterate';
        extra = { failedPhaseIndex: nextPhaseIdx, feedback: 'Phase failed — healer retry' };
      } else if (phase.status === 'executing') {
        action = 'evaluate-phase';
        extra = { phaseIndex: nextPhaseIdx };
      } else {
        action = 'execute-phase';
        extra = { phaseIndex: nextPhaseIdx };
      }
    }
  }

  const nativeRecovery = resolveNativeRecoveryDispatch(goal, action);
  if (nativeRecovery.handled) {
    if (!nativeRecovery.safe) {
      return {
        action: 'skipped',
        reason: nativeRecovery.reasons.join(', ') || 'native recovery authority is invalid',
      };
    }
    action = nativeRecovery.action;
    extra = action === 'pm-planning' ? {} : scopeRevisionContinuationPayload(goal);
  }

  let mergedData = {
    ...(goal.data || {}),
    heal_attempts: healAttempts,
    last_heal_strategy: name,
    last_heal_at: nowIso,
  };
  if (nativeRecovery.invalidateExecution) {
    mergedData = invalidateNativeExecutionForCanonicalReplan(mergedData);
  }

  const transitionPatch = {
    data: mergedData,
    updated_at: nowIso,
    ...(nativeRecovery.status ? { status: nativeRecovery.status } : {}),
    ...(nativeRecovery.incrementIteration ? { iteration: Number(goal.iteration || 0) + 1 } : {}),
  };

  const transition = await transitionHealingGoal(admin, goal, transitionPatch, {
    strategy: name,
    log,
  });
  if (!transition.ok) return { action: 'skipped', reason: transition.reason };

  const continuation = await enqueueHealingContinuation(admin, goal, transition, {
    action,
    extra,
    strategy: name,
    log,
    triggerProcessNextImpl,
  });
  if (!continuation.ok) return { action: 'skipped', reason: continuation.reason };

  await admin.from('goal_log').insert({
    goal_id: goal.id,
    event_type: 'goal_healed',
    details: { strategy: name, action, heal_attempts: healAttempts },
  });

  log?.info?.(null, 'self-healer.h04.applied', { goalId: goal.id, action, healAttempts });
  return { action: 'resumed', enqueued: action, healAttempts, jobId: continuation.jobId };
}
