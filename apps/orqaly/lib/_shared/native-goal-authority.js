import {
  validateNativeAxwiseDecisionContracts,
  validateScopeResearchAcceptanceBinding,
} from '../agent-handlers/compact-agent-contracts.js';
import {
  buildContextApprovalSnapshot,
  isApprovalCurrent,
} from '../goal-handlers/approval-audit.js';
import {
  selectWorkShapePlaybook,
  WORK_SHAPE_ROUTE_VERSION,
} from '../goal-handlers/work-shape-playbooks.js';
import {
  hasNativeAxwiseScopeMarkers,
  nativeAxwiseScopeActionBinding,
} from './native-scope-approval.js';

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const LEGACY_RAW_CONTEXT_FIELDS = Object.freeze([
  'goal_title',
  'goal_description',
  'problem_statement',
  'target_audience',
  'desired_outcome',
  'constraints',
]);

function nativeContextApprovalIsCurrent(goal, record) {
  if (!record?.snapshot) return false;
  const intelligence = goal?.data?.axwise_customer_intelligence || {};
  const packet = intelligence.scope_packet;
  if (packet?.research_contract?.evidence?.mode !== 'none') {
    if (
      !String(intelligence.proposal_decision_id || '').trim() ||
      !String(intelligence.research_execution_inputs_hash || '').trim()
    ) {
      return false;
    }
    let acceptance;
    try {
      acceptance = validateScopeResearchAcceptanceBinding(
        goal?.data?.scope_admission?.research_acceptance,
        {
          goal,
          scopePacket: packet,
          proposalDecisionId: intelligence.proposal_decision_id,
          executionInputsHash: intelligence.research_execution_inputs_hash,
        }
      );
    } catch {
      return false;
    }
    const researchPointer = intelligence.research_bundle;
    if (
      researchPointer &&
      researchPointer.scope_research_acceptance_hash !== acceptance.binding_hash
    ) {
      return false;
    }
  }
  if (record.approval_basis === 'accepted_typed_scope') {
    const snapshotIdentity = record.snapshot.native_scope_contract || {};
    if (
      record.status !== 'approved' ||
      String(record.approved_by || '') !== String(goal?.user_id || '') ||
      !packet?.scope_hash ||
      snapshotIdentity.scope_hash !== packet.scope_hash ||
      snapshotIdentity.research_contract_hash !== packet.research_contract?.contract_hash ||
      snapshotIdentity.research_execution_inputs_hash !==
        intelligence.research_execution_inputs_hash
    ) {
      return false;
    }
    return true;
  }
  const liveSnapshot = buildContextApprovalSnapshot(goal);
  // These legacy fields remain in the historical approval shape for backward
  // compatibility, but native scope makes them non-authoritative provenance.
  // Reuse the approved values while checking every canonical/native field so
  // an internal canonical planning view (or stale raw prose) cannot invalidate
  // or redefine the accepted packet.
  for (const field of LEGACY_RAW_CONTEXT_FIELDS) {
    liveSnapshot[field] = record.snapshot[field];
  }
  return isApprovalCurrent('context', liveSnapshot, record);
}

/**
 * Resolve the exact accepted native AxWise scope that downstream stages may
 * consume. A native packet is an authority boundary: once present, malformed,
 * unapproved, or route-drifted state must never fall back to raw goal prose.
 *
 * Legacy goals deliberately return `native: false` so their existing keyword
 * and PO/PM fallbacks remain unchanged.
 */
export function resolveAcceptedNativeGoalAuthority(goal) {
  const data = goal?.data || {};
  const intelligence = data.axwise_customer_intelligence || {};
  const rawPacket = intelligence.scope_packet;
  if (!hasNativeAxwiseScopeMarkers(goal)) {
    return {
      native: false,
      ready: false,
      reasons: [],
      contextApprovalCurrent: null,
      packet: null,
      admission: null,
      deliverable: null,
      researchContract: null,
      route: null,
    };
  }

  const reasons = [];
  if (data.scope_revision?.status === 'pending_rebuild') {
    reasons.push('native_scope_revision_pending');
  }
  let packet = null;
  try {
    packet =
      validateNativeAxwiseDecisionContracts({
        scope_packet: rawPacket,
        scope_validation: intelligence.scope_validation,
        scope_confirmation: intelligence.axwise_scope_confirmation,
        scope_contract_binding: intelligence.scope_contract_binding,
      })?.scope_packet || null;
    if (!packet) reasons.push('native_scope_contract_invalid');
  } catch {
    reasons.push('native_scope_contract_invalid');
  }

  const admission = packet?.admission || null;
  if (!admission) reasons.push('native_scope_admission_contract_missing');

  const contextApproval = data.goal_approvals?.context;
  const contextApprovalCurrent = nativeContextApprovalIsCurrent(goal, contextApproval);
  if (!contextApprovalCurrent) {
    reasons.push('native_context_approval_missing_or_stale');
  }

  const accepted = data.scope_admission || {};
  const route = data.work_shape_route || {};
  const expectedRoute = packet ? selectWorkShapePlaybook({ goal, scopePacket: packet }) : null;
  const scopeHash = packet?.scope_hash || rawPacket?.scope_hash || null;

  if (accepted.status !== 'accepted') reasons.push('native_scope_admission_not_accepted');
  if (!scopeHash || accepted.scope_hash !== scopeHash) {
    reasons.push('native_scope_admission_hash_mismatch');
  }
  if (accepted.route_version !== WORK_SHAPE_ROUTE_VERSION) {
    reasons.push('native_scope_admission_route_version_mismatch');
  }
  if (!expectedRoute || accepted.playbook_id !== expectedRoute.playbook_id) {
    reasons.push('native_scope_admission_playbook_mismatch');
  }
  if (accepted.grants_authorization !== false) {
    reasons.push('native_scope_admission_grants_authorization');
  }
  if (
    expectedRoute &&
    (accepted.requires_authorization !== expectedRoute.requires_authorization ||
      accepted.maximum_side_effect !== expectedRoute.maximum_side_effect)
  ) {
    reasons.push('native_scope_admission_action_risk_mismatch');
  }

  if (route.version !== WORK_SHAPE_ROUTE_VERSION) {
    reasons.push('native_work_shape_route_version_mismatch');
  }
  if (!scopeHash || route.scope_hash !== scopeHash) {
    reasons.push('native_work_shape_route_hash_mismatch');
  }
  if (route.authoritative_scope !== true) {
    reasons.push('native_work_shape_route_not_authoritative');
  }
  if (!expectedRoute || route.playbook_id !== expectedRoute.playbook_id) {
    reasons.push('native_work_shape_route_playbook_mismatch');
  }
  if (
    expectedRoute &&
    (!sameValue(route.work_types, expectedRoute.work_types) ||
      !sameValue(route.required_capabilities, expectedRoute.required_capabilities) ||
      !sameValue(route.requested_actions, expectedRoute.requested_actions) ||
      route.requires_authorization !== expectedRoute.requires_authorization ||
      route.maximum_side_effect !== expectedRoute.maximum_side_effect ||
      route.grants_authorization !== false)
  ) {
    reasons.push('native_work_shape_route_contract_mismatch');
  }

  return {
    native: true,
    ready: reasons.length === 0,
    reasons: [...new Set(reasons)],
    contextApprovalCurrent,
    packet,
    admission,
    deliverable: packet?.deliverable || null,
    researchContract: packet?.research_contract || null,
    route: expectedRoute,
  };
}

/**
 * Resolve the immutable accepted packet used as the base of one explicit
 * owner correction. The replacement is not approved yet, but rebuilding from
 * raw legacy columns would revive stale context. The old packet is therefore
 * a typed baseline and the revision feedback is the only semantic delta.
 */
export function resolveNativeScopeRevisionBase(goal) {
  const data = goal?.data || {};
  const revision = data.scope_revision || {};
  const stored = data.axwise_customer_intelligence?.previous_scope_contract || null;
  const applies =
    revision.status === 'pending_rebuild' && revision.base_kind === 'accepted_native_scope';
  if (!applies) {
    return { applies: false, ready: false, reasons: [], packet: null };
  }

  const reasons = [];
  if (stored?.version !== 'orqaly_previous_native_scope_contract_v1') {
    reasons.push('native_revision_base_version_invalid');
  }
  let handoff = null;
  try {
    handoff = validateNativeAxwiseDecisionContracts({
      scope_packet: stored?.scope_packet,
      scope_validation: stored?.scope_validation,
      scope_confirmation: stored?.scope_confirmation,
      scope_contract_binding: stored?.scope_contract_binding,
    });
  } catch {
    reasons.push('native_revision_base_contract_invalid');
  }
  const scopeHash = handoff?.scope_packet?.scope_hash || null;
  if (!scopeHash || stored?.scope_hash !== scopeHash) {
    reasons.push('native_revision_base_hash_invalid');
  }
  if (!scopeHash || revision.source_scope_hash !== scopeHash) {
    reasons.push('native_revision_source_hash_mismatch');
  }
  if (String(stored?.generation ?? '') !== String(revision.source_generation ?? '')) {
    reasons.push('native_revision_source_generation_mismatch');
  }
  const contextApproval = data.goal_approvals?.context || {};
  if (
    !stored?.context_snapshot_hash ||
    stored.context_snapshot_hash !== contextApproval.snapshot_hash ||
    !['approved', 'invalidated'].includes(String(contextApproval.status || ''))
  ) {
    reasons.push('native_revision_context_snapshot_mismatch');
  }

  return {
    applies: true,
    ready: reasons.length === 0,
    reasons: [...new Set(reasons)],
    packet: handoff?.scope_packet || null,
    validation: handoff?.scope_validation || null,
    confirmation: handoff?.scope_confirmation || null,
  };
}

/**
 * Bind a human/API planning restart to the complete accepted native authority
 * and the exact goal row that was reviewed. Returning null for either legacy
 * or damaged native state keeps callers from manufacturing a weaker binding.
 */
export function acceptedNativePlanningActionBinding(
  goal,
  authority = resolveAcceptedNativeGoalAuthority(goal)
) {
  if (!authority?.native || !authority.ready || !goal?.updated_at) return null;
  const binding = nativeAxwiseScopeActionBinding(goal);
  if (!binding?.scope_hash || !binding.scope_updated_at || !binding.context_snapshot_hash) {
    return null;
  }

  return {
    ...binding,
    goal_updated_at: goal.updated_at,
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
 * Bind recovery of the one native state that legitimately has no AxWise
 * packet yet: a Smart Request whose first scope-admission job never got far
 * enough to persist provider output. Once any packet, approval, route,
 * revision, or other downstream authority exists, a missing packet is damage
 * and must stay fail-closed instead of being mistaken for this initial state.
 */
export function initialNativeScopeAdmissionActionBinding(
  goal,
  authority = resolveAcceptedNativeGoalAuthority(goal)
) {
  if (!authority?.native || authority.ready || !goal?.updated_at) return null;

  const data = goal?.data || {};
  const intelligence = data.axwise_customer_intelligence || {};
  const smartAdmission = data.smart_request_admission || {};
  const scopeAdmission = data.scope_admission || {};
  const smartStatus = String(smartAdmission.status || '').trim();
  const startedAt = String(smartAdmission.started_at || '').trim();
  const scopeStatus = String(scopeAdmission.status || '').trim();
  const stateKey = String(scopeAdmission.state_key || '').trim();
  const hasDownstreamAuthority = Boolean(
    Object.prototype.hasOwnProperty.call(intelligence, 'scope_packet') ||
    Object.prototype.hasOwnProperty.call(intelligence, 'scope_validation') ||
    Object.prototype.hasOwnProperty.call(intelligence, 'axwise_scope_confirmation') ||
    Object.prototype.hasOwnProperty.call(intelligence, 'clarification_scope') ||
    Object.prototype.hasOwnProperty.call(intelligence, 'previous_scope_contract') ||
    data.scope_revision != null ||
    data.work_shape_route != null ||
    data.goal_approvals?.context?.snapshot?.native_scope_contract != null
  );

  if (
    !['started', 'enqueue_failed'].includes(smartStatus) ||
    !startedAt ||
    scopeStatus !== 'queued' ||
    stateKey !== 'axwise_customer_intelligence' ||
    scopeAdmission.native_scope === false ||
    hasDownstreamAuthority
  ) {
    return null;
  }

  return {
    version: 'orqaly_initial_native_scope_action_binding_v1',
    goal_updated_at: goal.updated_at,
    smart_admission_status: smartStatus,
    smart_admission_started_at: startedAt,
    scope_admission_status: scopeStatus,
    scope_admission_native: scopeAdmission.native_scope === true,
    scope_admission_queued_at: String(scopeAdmission.queued_at || '').trim() || null,
  };
}
