import { enqueueGoalAction } from './_helpers.js';
import {
  resolveNativeRecoveryDispatch,
  transitionNativeRecoveryToCanonicalStage,
} from './native-legacy-dispatch.js';
import { scopeRevisionContinuationPayload } from '../_shared/scope-revision-continuation.js';
import { hasNativeAxwiseScopeMarkers } from '../_shared/native-scope-approval.js';

/**
 * Intercept a queued legacy stage before it can read or persist raw goal prose.
 * Returns null for a genuine legacy goal; native callers return the result
 * directly and must not execute the legacy handler body.
 */
export async function guardNativeLegacyStageEntry(admin, goal, proposedAction) {
  if (!hasNativeAxwiseScopeMarkers(goal) && goal?.parent_goal_id) {
    const { data: parent, error } = await admin
      .from('goals')
      .select('id,data')
      .eq('id', goal.parent_goal_id)
      .eq('user_id', goal.user_id)
      .maybeSingle();
    if (error) {
      return {
        type: 'orchestrate-goal',
        action: proposedAction,
        goalId: goal.id,
        status: 'parent_authority_unavailable',
      };
    }
    if (parent && hasNativeAxwiseScopeMarkers(parent)) {
      return {
        type: 'orchestrate-goal',
        action: proposedAction,
        goalId: goal.id,
        status: 'native_authority_blocked',
        reasons: ['native_continuation_requires_scope_confirmation'],
      };
    }
  }
  const recovery = resolveNativeRecoveryDispatch(goal, proposedAction);
  if (!recovery.handled) return null;

  if (!recovery.safe || !recovery.action || !recovery.status) {
    return {
      type: 'orchestrate-goal',
      action: proposedAction,
      goalId: goal?.id,
      status: 'native_authority_blocked',
      reasons: recovery.reasons || [],
    };
  }

  const transitioned = await transitionNativeRecoveryToCanonicalStage(admin, goal, recovery);
  if (!transitioned) {
    return {
      type: 'orchestrate-goal',
      action: proposedAction,
      goalId: goal?.id,
      status: 'state_changed',
    };
  }

  const continuation = ['scope-admission', 'customer-intelligence'].includes(recovery.action)
    ? scopeRevisionContinuationPayload(goal)
    : {};
  await enqueueGoalAction(admin, recovery.action, goal.id, continuation);
  return {
    type: 'orchestrate-goal',
    action: proposedAction,
    goalId: goal.id,
    status: 'native_stage_redirected',
    redirectedAction: recovery.action,
  };
}
