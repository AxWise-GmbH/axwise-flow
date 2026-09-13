import { resolveAcceptedNativeGoalAuthority } from '../_shared/native-goal-authority.js';
import { nativeAxwiseScopeActionBinding } from '../_shared/native-scope-approval.js';
import { invalidatedApproval } from './approval-audit.js';
import { updateGoalIfNativeScopeBinding } from './_helpers.js';
import { pendingScopeRevisionToken } from '../_shared/scope-revision-continuation.js';

export const NATIVE_CANONICAL_REPLAN_REASON = 'plan_replaced_by_iteration';

const LEGACY_NATIVE_ACTIONS = new Set(['plan', 'iterate']);
const RAW_RECOVERY_ACTIONS = new Set([
  'scope-admission',
  'customer-intelligence',
  'plan',
  'feasibility-analysis',
  'po-analysis',
  'po-analysis-continue',
  'iterate',
]);

function uniqueReasons(reasons) {
  return [...new Set((Array.isArray(reasons) ? reasons : []).filter(Boolean))];
}

function nativePlanningBinding(goal, authority) {
  if (!authority?.ready || !authority.packet || !authority.route) return null;
  const binding = nativeAxwiseScopeActionBinding(goal);
  if (!binding?.scope_hash || !binding.scope_updated_at || !binding.context_snapshot_hash) {
    return null;
  }
  return {
    ...binding,
    goal_updated_at: goal.updated_at || null,
    planning_authority: {
      context_status: 'approved',
      scope_admission_status: 'accepted',
      scope_hash: authority.packet.scope_hash,
      playbook_id: authority.route.playbook_id,
      route_version: goal.data.work_shape_route.version,
    },
  };
}

/**
 * Resolve a legacy plan/iterate dispatch without ever treating a damaged
 * native packet as legacy input. The historical scope_admission.state_key is
 * intentionally delegated to the centralized marker detector, where a lone
 * stamp remains legacy-compatible.
 */
export function resolveNativeLegacyDispatch(goal, legacyAction, { failedRetry = false } = {}) {
  if (!LEGACY_NATIVE_ACTIONS.has(legacyAction)) {
    return { native: false, safe: true, action: legacyAction, reasons: [] };
  }

  const authority = resolveAcceptedNativeGoalAuthority(goal);
  if (!authority.native) {
    return { native: false, safe: true, action: legacyAction, reasons: [] };
  }

  const expectedStatus = failedRetry ? 'failed' : legacyAction === 'plan' ? 'planning' : 'active';
  const reasons = [...authority.reasons];
  if (goal?.status !== expectedStatus) reasons.push('native_legacy_dispatch_status_changed');
  if (!authority.ready) reasons.push('native_legacy_dispatch_authority_invalid');

  const binding = nativePlanningBinding(goal, authority);
  if (!binding) {
    reasons.push('native_legacy_dispatch_binding_invalid');
  }
  if ((legacyAction === 'iterate' || failedRetry) && !goal?.updated_at) {
    reasons.push('native_legacy_dispatch_goal_snapshot_missing');
  }

  const safe = uniqueReasons(reasons).length === 0;
  return {
    native: true,
    safe,
    action: safe ? 'pm-planning' : null,
    reasons: uniqueReasons(reasons),
    authority,
    binding: safe ? binding : null,
  };
}

function nativeScopeRebuildIsRecoverable(goal) {
  const data = goal?.data || {};
  const intelligence = data.axwise_customer_intelligence || {};
  const revisionToken = pendingScopeRevisionToken(goal);
  if (revisionToken === null) return false;
  if (revisionToken !== undefined) return true;
  // A started Smart Request marker survives the entire lifecycle. It proves
  // native ownership, but it must not authorize silently rebuilding a scope
  // that was already accepted or consumed downstream. Only an explicit,
  // token-bound revision may replace that authority.
  const acceptedOrConsumed = Boolean(
    data.scope_admission?.status === 'accepted' ||
    data.scope_admission?.accepted_at ||
    (data.goal_approvals?.context?.status === 'approved' &&
      data.goal_approvals.context.snapshot?.native_scope_contract != null) ||
    intelligence.previous_scope_contract != null ||
    data.native_planning_attempt != null ||
    data.native_team_formation_attempt != null ||
    data.execution_prd != null ||
    goal?.plan != null
  );
  if (acceptedOrConsumed) return false;
  const smartStatus = String(data.smart_request_admission?.status || '').trim();
  const admissionStatus = String(data.scope_admission?.status || '').trim();
  const intelligenceStatus = String(intelligence.status || '').trim();
  return Boolean(
    (smartStatus && smartStatus !== 'draft') ||
    ['queued', 'started', 'running', 'revision_requested', 'evidence_requested'].includes(
      admissionStatus
    ) ||
    ['queued', 'started', 'running', 'revision_requested', 'evidence_requested'].includes(
      intelligenceStatus
    ) ||
    intelligence.clarification_scope != null
  );
}

/**
 * Canonicalize a healer/reconciler proposal that would otherwise revive a
 * native row in a raw legacy stage. The caller still owns the exact lifecycle
 * CAS; this function is side-effect free.
 */
export function resolveNativeRecoveryDispatch(goal, proposedAction) {
  const authority = resolveAcceptedNativeGoalAuthority(goal);
  if (!authority.native || !RAW_RECOVERY_ACTIONS.has(proposedAction)) {
    return {
      native: authority.native,
      handled: false,
      safe: true,
      action: proposedAction,
      status: null,
      reasons: authority.native ? authority.reasons : [],
    };
  }

  if (authority.ready) {
    const binding = nativePlanningBinding(goal, authority);
    const reasons = [];
    if (!goal?.updated_at) reasons.push('native_recovery_goal_snapshot_missing');
    if (!binding) reasons.push('native_recovery_binding_invalid');
    return {
      native: true,
      handled: true,
      safe: reasons.length === 0,
      action: reasons.length === 0 ? 'pm-planning' : null,
      status: reasons.length === 0 ? 'planning' : null,
      invalidateExecution: true,
      incrementIteration: proposedAction === 'iterate',
      reasons,
      authority,
      binding,
    };
  }

  if (nativeScopeRebuildIsRecoverable(goal)) {
    const resumeCustomerResearch =
      proposedAction === 'customer-intelligence' ||
      goal?.data?.scope_revision?.kind === 'evidence_refresh';
    return {
      native: true,
      handled: true,
      safe: true,
      action: resumeCustomerResearch ? 'customer-intelligence' : 'scope-admission',
      status: resumeCustomerResearch ? 'researching_customer' : 'analyzing',
      invalidateExecution: false,
      incrementIteration: false,
      reasons: [],
      authority,
    };
  }

  return {
    native: true,
    handled: true,
    safe: false,
    action: null,
    status: null,
    invalidateExecution: false,
    incrementIteration: false,
    reasons: uniqueReasons([
      ...authority.reasons,
      'native_recovery_authority_invalid',
      'native_recovery_scope_rebuild_not_owned',
    ]),
    authority,
  };
}

/** Reserve a reconciler recovery before its canonical queue row is inserted. */
export async function transitionNativeRecoveryToCanonicalStage(admin, goal, recovery) {
  if (!recovery?.handled || !recovery.safe || !recovery.action || !recovery.status) return false;
  const patch = {
    status: recovery.status,
    data: recovery.invalidateExecution
      ? invalidateNativeExecutionForCanonicalReplan(goal.data || {})
      : goal.data || {},
    ...(recovery.incrementIteration ? { iteration: Number(goal.iteration || 0) + 1 } : {}),
  };
  if (recovery.action === 'pm-planning') {
    return updateGoalIfNativeScopeBinding(admin, goal.id, goal.status, recovery.binding, patch);
  }
  if (!goal?.id || !goal?.status || !goal?.updated_at) return false;
  let transition = admin
    .from('goals')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', goal.id)
    .eq('status', goal.status)
    .eq('updated_at', goal.updated_at);
  if (goal.user_id) transition = transition.eq('user_id', goal.user_id);
  const { data, error } = await transition.select('id').maybeSingle();
  if (error) throw new Error(`Native recovery transition failed: ${error.message}`);
  return Boolean(data?.id);
}

/** Keep Gate 1, but make every replaced Gate-2 grant non-executable. */
export function invalidateNativeExecutionForCanonicalReplan(
  data = {},
  reason = NATIVE_CANONICAL_REPLAN_REASON
) {
  const approvals = data.goal_approvals || {};
  const invalidatedExecution = invalidatedApproval(approvals.execution, reason);
  const invalidatedAt = invalidatedExecution?.invalidated_at || new Date().toISOString();
  const next = { ...data };

  if (invalidatedExecution) {
    next.goal_approvals = {
      ...approvals,
      execution: invalidatedExecution,
    };
  }
  if (data.execution_authorization) {
    next.execution_authorization = {
      ...data.execution_authorization,
      status: 'invalidated',
      snapshot_hash: null,
      invalidated_at: invalidatedAt,
      invalidation_reason: reason,
    };
  }

  return next;
}

/**
 * Reserve a native iteration for canonical PM planning. This binds both the
 * lifecycle snapshot and the complete accepted native planning authority so a
 * concurrent correction cannot receive a stale goal.data overwrite.
 */
export async function transitionNativeIterationToCanonicalPlanning(admin, goal) {
  const dispatch = resolveNativeLegacyDispatch(goal, 'iterate');
  if (!dispatch.native || !dispatch.safe) return { ok: false, ...dispatch };

  const transitioned = await updateGoalIfNativeScopeBinding(
    admin,
    goal.id,
    'active',
    dispatch.binding,
    {
      status: 'planning',
      iteration: Number(goal.iteration || 0) + 1,
      data: invalidateNativeExecutionForCanonicalReplan(goal.data || {}),
    }
  );
  return { ok: transitioned, ...dispatch };
}
