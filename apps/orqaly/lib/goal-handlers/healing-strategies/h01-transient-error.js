/**
 * h01 — Transient error retry
 *
 * Symptom: goal.status='failed' and failure_reason matches a known
 *          transient error pattern (network, 5xx, rate limit, timeout).
 * Recovery: reset status to failure_stage, clear failure_reason,
 *           re-enqueue the failed action.
 *
 * This is the strategy that would have recovered the "black man socks" goal
 * (Groq 429 rate limit on po-analysis).
 */
import { enqueueHealingContinuation, transitionHealingGoal } from './_exact-recovery.js';
import {
  pendingScopeRevisionToken,
  scopeRevisionContinuationPayload,
} from '../../_shared/scope-revision-continuation.js';
import {
  invalidateNativeExecutionForCanonicalReplan,
  resolveNativeRecoveryDispatch,
} from '../native-legacy-dispatch.js';

const TRANSIENT_RE =
  /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|5\d\d|429|rate.?limit|overloaded|network|fetch failed|timed out|timeout|socket hang up|overload/i;

const STAGE_TO_STATUS = {
  'scope-admission': 'analyzing',
  'feasibility-analysis': 'feasibility',
  'po-analysis': 'analyzing',
  'po-analysis-continue': 'analyzing',
  'customer-intelligence': 'researching_customer',
  'pm-planning': 'planning',
  'team-formation': 'forming_team',
  'tool-provisioning': 'provisioning_tools',
  'discovery-estimation': 'estimating',
  'client-approval': 'awaiting_approval',
  'execute-phase': 'active',
  'evaluate-phase': 'active',
  iterate: 'active',
  complete: 'active',
};

export const name = 'h01-transient-error';
export const priority = 10;

export function matches(goal) {
  if (goal.status !== 'failed') return false;
  const reason = goal.data?.failure_reason || '';
  return TRANSIENT_RE.test(reason);
}

export async function apply(admin, goal, { log, triggerProcessNextImpl } = {}) {
  const failureStage = goal.data?.failure_stage || 'feasibility-analysis';
  // Failure metadata may append diagnostic context (for example
  // `po-analysis:quick`). Queue payloads need the registered action only.
  const originalStage = failureStage.split(':')[0];
  let stage = originalStage;
  let resetStatus = STAGE_TO_STATUS[stage] || 'feasibility';
  const nativeRecovery = resolveNativeRecoveryDispatch(goal, stage);
  if (nativeRecovery.handled) {
    if (!nativeRecovery.safe) {
      return {
        action: 'skipped',
        reason: nativeRecovery.reasons.join(', ') || 'native recovery authority is invalid',
      };
    }
    stage = nativeRecovery.action;
    resetStatus = nativeRecovery.status;
  }
  const revisionToken = pendingScopeRevisionToken(goal);
  if (
    revisionToken === null &&
    (stage === 'scope-admission' || stage === 'customer-intelligence')
  ) {
    return { action: 'skipped', reason: 'pending scope rebuild token is missing' };
  }
  const healAttempts = (goal.data?.heal_attempts || 0) + 1;
  const nowIso = new Date().toISOString();

  let mergedData = {
    ...(goal.data || {}),
    heal_attempts: healAttempts,
    last_heal_strategy: name,
    last_heal_at: nowIso,
    // Clear the failure so stages and reconciler see a clean slate
    failure_reason: null,
    failure_stack: null,
    // Preserve original for the healing_log
    previous_failure: {
      reason: goal.data?.failure_reason,
      stage: failureStage,
      at: goal.data?.failure_at,
    },
  };
  if (nativeRecovery.invalidateExecution) {
    mergedData = invalidateNativeExecutionForCanonicalReplan(mergedData);
  }

  const transitionPatch = {
    status: resetStatus,
    data: mergedData,
    updated_at: nowIso,
    ...(nativeRecovery.incrementIteration ? { iteration: Number(goal.iteration || 0) + 1 } : {}),
  };

  const transition = await transitionHealingGoal(admin, goal, transitionPatch, {
    strategy: name,
    log,
  });
  if (!transition.ok) return { action: 'skipped', reason: transition.reason };

  const continuation = await enqueueHealingContinuation(admin, goal, transition, {
    action: stage,
    extra:
      nativeRecovery.handled && stage === 'pm-planning'
        ? {}
        : scopeRevisionContinuationPayload(goal),
    strategy: name,
    log,
    triggerProcessNextImpl,
  });
  if (!continuation.ok) return { action: 'skipped', reason: continuation.reason };

  await admin.from('goal_log').insert({
    goal_id: goal.id,
    event_type: 'goal_healed',
    details: {
      strategy: name,
      stage,
      original_stage: originalStage,
      heal_attempts: healAttempts,
      reason: goal.data?.failure_reason,
    },
  });

  log?.info?.(null, 'self-healer.h01.applied', { goalId: goal.id, stage, healAttempts });

  return { action: 'resumed', stage, healAttempts, jobId: continuation.jobId };
}
