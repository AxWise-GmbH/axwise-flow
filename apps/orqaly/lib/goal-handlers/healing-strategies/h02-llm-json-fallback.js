/**
 * h02 — LLM JSON parse fallback
 *
 * Symptom: goal.status='failed' with failure_reason indicating LLM returned
 *          unparseable/invalid content.
 * Recovery: re-enqueue failed stage with data.use_fallback=true. Stages
 *           feasibility-analysis, po-analysis, pm-planning each have a
 *           deterministic fallback path that doesn't rely on LLM JSON.
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

const JSON_ERR_RE = /parse|JSON|invalid response|unexpected token|malformed/i;

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
  'execute-phase': 'active',
  'evaluate-phase': 'active',
  iterate: 'active',
};

export const name = 'h02-llm-json-fallback';
export const priority = 15;

export function matches(goal) {
  if (goal.status !== 'failed') return false;
  const reason = goal.data?.failure_reason || '';
  return JSON_ERR_RE.test(reason);
}

export async function apply(admin, goal, { log, triggerProcessNextImpl } = {}) {
  const failureStage = goal.data?.failure_stage || 'feasibility-analysis';
  // Preserve diagnostic suffixes in history, but enqueue a valid action.
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
    // Native recovery never enables a legacy deterministic fallback; its
    // canonical stages must revalidate the exact AxWise contract.
    ...(nativeRecovery.handled ? {} : { use_fallback: true }),
    failure_reason: null,
    failure_stack: null,
    previous_failure: {
      reason: goal.data?.failure_reason,
      stage: failureStage,
      at: goal.data?.failure_at,
    },
  };
  if (nativeRecovery.handled) {
    delete mergedData.use_fallback;
  }
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
        : {
            ...(nativeRecovery.handled ? {} : { useFallback: true }),
            ...scopeRevisionContinuationPayload(goal),
          },
    strategy: name,
    log,
    triggerProcessNextImpl,
  });
  if (!continuation.ok) return { action: 'skipped', reason: continuation.reason };

  await admin.from('goal_log').insert({
    goal_id: goal.id,
    event_type: 'goal_healed',
    details: { strategy: name, stage, original_stage: originalStage, heal_attempts: healAttempts },
  });

  log?.info?.(null, 'self-healer.h02.applied', { goalId: goal.id, stage, healAttempts });
  return {
    action: 'resumed',
    stage,
    healAttempts,
    useFallback: !nativeRecovery.handled,
    jobId: continuation.jobId,
  };
}
