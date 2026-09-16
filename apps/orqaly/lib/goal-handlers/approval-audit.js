import { createHash } from 'node:crypto';
import { goalSkipsTools } from '../_shared/goal-tool-policy.js';
import { stripRuntimePlanState } from '../_shared/plan-snapshot.js';

const APPROVAL_VERSION = 'orqaly_goal_approval_v1';
export const RESEARCH_EXECUTION_PREVIEW_VERSION = 'orqaly_scope_research_execution_preview_v1';
export const RESEARCH_EXECUTION_DESTINATION = 'Google Gemini API';
export const RESEARCH_EXECUTION_PURPOSE = 'Scope-bound customer, executor, and evidence research';
export const RESEARCH_EXECUTION_DATA_CATEGORIES = Object.freeze(
  [
    'Accepted goal/task prose and typed scope/constraints',
    'Business/research brief, questions, geography, and evidence requirements',
    'Executor candidate role/profile/capability fields needed for matching',
    'Generated synthetic participant/interview/persona/PRD content',
    'Public-source snippets and grounded evidence',
  ].sort()
);
export const RESEARCH_EXECUTION_EXCLUDED_CATEGORIES = Object.freeze(
  [
    'Credentials and API secrets',
    'Payment data',
    'Raw auth/session tokens',
    'Unrelated goals',
  ].sort()
);

function exactOrderedList(value, expected) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function buildResearchExecutionPreview({
  proposalDecisionId,
  scopePacket,
  executionInputsHash,
  maximumCostUsd,
  estimatedCostUsd,
  maximumLatencyMs,
  estimatedLatencyMs,
}) {
  return {
    version: RESEARCH_EXECUTION_PREVIEW_VERSION,
    proposal_decision_id: proposalDecisionId,
    scope_hash: scopePacket?.scope_hash || null,
    contract_hash: scopePacket?.research_contract?.contract_hash || null,
    research_execution_inputs_hash: executionInputsHash,
    destination: RESEARCH_EXECUTION_DESTINATION,
    purpose: RESEARCH_EXECUTION_PURPOSE,
    data_categories: [...RESEARCH_EXECUTION_DATA_CATEGORIES],
    excluded_categories: [...RESEARCH_EXECUTION_EXCLUDED_CATEGORIES],
    model: scopePacket?.runtime?.model || null,
    maximum_cost_usd: maximumCostUsd,
    estimated_cost_usd: estimatedCostUsd,
    maximum_latency_ms: maximumLatencyMs,
    estimated_latency_ms: estimatedLatencyMs,
  };
}

/**
 * Validate the exact proposal-bound disclosure immediately before an owner
 * action can authorize research. The browser mirrors this for UX, but this
 * server boundary is authoritative for both API enqueue and worker minting.
 */
export function validateResearchExecutionPreview(goal, scopePacket) {
  const intelligence = goal?.data?.axwise_customer_intelligence || {};
  const preview = intelligence.research_execution_preview;
  const packet = scopePacket || intelligence.scope_packet;
  const executionInputsHash = String(intelligence.research_execution_inputs_hash || '');
  const proposalDecisionId = String(intelligence.decision_id || '').trim();
  const scopeHash = String(packet?.scope_hash || '');
  const contractHash = String(packet?.research_contract?.contract_hash || '');
  const validIdentity =
    preview?.version === RESEARCH_EXECUTION_PREVIEW_VERSION &&
    proposalDecisionId.length > 0 &&
    preview.proposal_decision_id === proposalDecisionId &&
    /^[a-f0-9]{64}$/.test(scopeHash) &&
    preview.scope_hash === scopeHash &&
    /^[a-f0-9]{64}$/.test(contractHash) &&
    preview.contract_hash === contractHash &&
    /^[a-f0-9]{64}$/.test(executionInputsHash) &&
    preview.research_execution_inputs_hash === executionInputsHash &&
    preview.model === packet?.runtime?.model &&
    preview.destination === RESEARCH_EXECUTION_DESTINATION &&
    preview.purpose === RESEARCH_EXECUTION_PURPOSE &&
    exactOrderedList(preview.data_categories, RESEARCH_EXECUTION_DATA_CATEGORIES) &&
    exactOrderedList(preview.excluded_categories, RESEARCH_EXECUTION_EXCLUDED_CATEGORIES);
  const validBounds =
    finiteNumber(preview?.maximum_cost_usd) &&
    preview.maximum_cost_usd >= 0 &&
    finiteNumber(preview?.estimated_cost_usd) &&
    preview.estimated_cost_usd >= 0 &&
    preview.estimated_cost_usd <= preview.maximum_cost_usd &&
    finiteNumber(preview?.maximum_latency_ms) &&
    preview.maximum_latency_ms > 0 &&
    finiteNumber(preview?.estimated_latency_ms) &&
    preview.estimated_latency_ms > 0 &&
    preview.estimated_latency_ms <= preview.maximum_latency_ms;
  if (!validIdentity || !validBounds) {
    const error = new Error(
      'The proposal-bound research execution disclosure is missing, stale, or invalid'
    );
    error.code = 'ORQALY_RESEARCH_EXECUTION_PREVIEW_INVALID';
    throw error;
  }
  return preview;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      if (value[key] !== undefined) result[key] = canonicalize(value[key]);
      return result;
    }, {});
}

function sortedStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(String).filter(Boolean))].sort();
}

function v2ResearchAuthorityPolicy(goal) {
  const policy = goal?.data?.research_policy || {};
  const customer = policy.customer_role_contract || {};
  const critical = policy.critical_claim_policy || {};
  return {
    intent: policy.intent || null,
    customer_role_contract: {
      primary_roles: sortedStrings(customer.primary_roles),
      secondary_roles: sortedStrings(customer.secondary_roles),
      ineligible_roles: sortedStrings(customer.ineligible_roles),
      require_primary_buyer: customer.require_primary_buyer === true,
    },
    critical_claim_policy: {
      required: critical.required === true,
      fail_closed: critical.fail_closed === true,
      freshness_days: Number.isFinite(Number(critical.freshness_days))
        ? Number(critical.freshness_days)
        : null,
      freshness_by_class: Object.fromEntries(
        Object.entries(critical.freshness_by_class || {})
          .map(([key, value]) => [String(key), Number(value)])
          .filter(([, value]) => Number.isFinite(value))
          .sort(([left], [right]) => left.localeCompare(right))
      ),
      mandatory_claim_classes: sortedStrings(critical.mandatory_claim_classes),
      authoritative_current_source_required:
        critical.authoritative_current_source_required === true,
      conflict_resolution_required: critical.conflict_resolution_required === true,
    },
  };
}

function nativeScopeApprovalIdentity(intelligence) {
  const packet = intelligence?.scope_packet;
  if (packet?.version !== 'axwise_scope_packet_v1') return null;
  const validation = intelligence?.scope_validation || {};
  const confirmation = intelligence?.axwise_scope_confirmation || {};
  return {
    packet_version: packet.version,
    scope_ref: packet.scope_ref || null,
    scope_hash: packet.scope_hash || null,
    research_contract_hash: packet.research_contract?.contract_hash || null,
    research_execution_inputs_hash: intelligence.research_execution_inputs_hash || null,
    generation:
      intelligence.generation === null || intelligence.generation === undefined
        ? null
        : String(intelligence.generation),
    scope_updated_at: intelligence.updated_at || null,
    document_status: packet.document_status || null,
    admission_version: packet.admission?.version || null,
    validation_scope_hash: validation.scope_hash || null,
    validation_valid: validation.valid === true,
    validation_ready_for_synthesis: validation.ready_for_synthesis === true,
    confirmation_scope_hash: confirmation.scope_hash || null,
    confirmation_status: confirmation.status || null,
    confirmation_primary_action: confirmation.primary_action || null,
    confirmation_material_question: confirmation.material_question || null,
    confirmation_authorizes_external_actions: confirmation.authorizes_external_actions === true,
  };
}

export function hashApprovalSnapshot(kind, snapshot) {
  return createHash('sha256')
    .update(`${APPROVAL_VERSION}:${kind}:${JSON.stringify(canonicalize(snapshot))}`)
    .digest('hex');
}

export function buildContextApprovalSnapshot(goal) {
  const intelligence = goal?.data?.axwise_customer_intelligence || {};
  const researchBundle = intelligence.research_bundle || {};
  const evidenceV2 = researchBundle.bundle_version === 'axwise_research_bundle_v2';
  const nativeScopeContract = nativeScopeApprovalIdentity(intelligence);
  return {
    goal_id: goal?.id || null,
    goal_title: goal?.title || '',
    goal_description: goal?.description || '',
    problem_statement: goal?.tech_doc?.problem_statement || '',
    target_audience: goal?.tech_doc?.target_audience || '',
    desired_outcome:
      goal?.tech_doc?.success_tiers?.target || goal?.tech_doc?.success_criteria || null,
    constraints: goal?.tech_doc?.constraints || [],
    decision_id: intelligence.decision_id || null,
    request_hash: intelligence.request_hash || null,
    routing_mode: intelligence.routing_mode || null,
    routing_assessment: intelligence.routing_assessment || null,
    degraded: intelligence.degraded === true,
    degraded_reason: intelligence.reason || null,
    ...(nativeScopeContract ? { native_scope_contract: nativeScopeContract } : {}),
    ...(intelligence.research_execution_preview
      ? { research_execution_preview: intelligence.research_execution_preview }
      : {}),
    ...(goal?.data?.research_policy?.market_scope
      ? {
          research_market_scope: {
            scope_hash: goal.data.research_policy.market_scope_hash || null,
            resolved_country_codes: (
              goal.data.research_policy.market_scope.resolved_scope?.countries || []
            )
              .map((item) => String(item.country_code || ''))
              .filter(Boolean)
              .sort(),
          },
        }
      : {}),
    ...(evidenceV2 ? { research_authority_policy: v2ResearchAuthorityPolicy(goal) } : {}),
    persona_resolution: intelligence.persona_resolution || null,
    ...(intelligence.research_bundle
      ? {
          research_bundle: {
            bundle_hash: researchBundle.bundle_hash || null,
            research_prd_hash: researchBundle.research_prd_hash || null,
            ...(researchBundle.context_gate_hash
              ? { context_gate_hash: researchBundle.context_gate_hash }
              : {}),
            selected_persona_ids: [
              ...new Set((researchBundle.selected_persona_ids || []).map(String)),
            ].sort(),
            ...(researchBundle.market_scope_hash
              ? { market_scope_hash: researchBundle.market_scope_hash }
              : {}),
            ...(evidenceV2
              ? {
                  bundle_version: 'axwise_research_bundle_v2',
                  evidence_profile_version: researchBundle.evidence_profile_version || null,
                  evidence_profile_hash: researchBundle.evidence_profile_hash || null,
                  fact_manifest_hash: researchBundle.fact_manifest_hash || null,
                  calculation_manifest_hash: researchBundle.calculation_manifest_hash || null,
                  fact_count: Number(researchBundle.fact_count || 0),
                  calculation_count: Number(researchBundle.calculation_count || 0),
                  required_role_slots: [
                    ...new Set((researchBundle.required_role_slots || []).map(String)),
                  ].sort(),
                }
              : {}),
          },
        }
      : {}),
  };
}

export function buildExecutionApprovalSnapshot(
  goal,
  authorizationManifest = goal?.data?.execution_authorization?.manifest ||
    goal?.data?.execution_authorization_manifest ||
    null
) {
  const data = goal?.data || {};
  const contextApproval = data.goal_approvals?.context || {};
  return {
    goal_id: goal?.id || null,
    iteration: Number(goal?.iteration || 0),
    budget_usd: Number(goal?.budget_usd || 0),
    context_approval_hash:
      contextApproval.status === 'approved' ? contextApproval.snapshot_hash || null : null,
    context_decision_id: data.axwise_customer_intelligence?.decision_id || null,
    orchestration_decision: data.axwise_orchestration || null,
    team_id: goal?.agent_team_id || goal?.team_id || null,
    authorization_manifest: authorizationManifest,
    required_tools: data.required_tools || [],
    unconfigured_tools: data.unconfigured_tools || [],
    tool_mode: data.tool_mode || null,
    // Hash the effective policy, not its redundant persistence shape. The
    // durable tool_mode remains after execute-phase clears the legacy one-shot
    // skip_tools flag, and that equivalent representation must not invalidate
    // a human approval while an already-authorized task is starting.
    skip_tools: goalSkipsTools(goal),
    plan: goal?.plan ? stripRuntimePlanState(goal.plan) : null,
    proposal: goal?.proposal || null,
  };
}

export function pendingApproval(kind, snapshot, previous = null) {
  const requestedAt = new Date().toISOString();
  const replacesApproved = previous?.status === 'approved';
  const preservesInvalidation = previous?.status === 'invalidated';
  const invalidatedAt = preservesInvalidation
    ? previous.invalidated_at || requestedAt
    : replacesApproved
      ? requestedAt
      : null;
  return {
    version: APPROVAL_VERSION,
    kind,
    status: 'pending',
    snapshot_hash: hashApprovalSnapshot(kind, snapshot),
    snapshot: canonicalize(snapshot),
    requested_at: requestedAt,
    approved_at: null,
    approved_by: null,
    // Re-planning invalidates the old execution package before team formation
    // builds the replacement. Preserve that audit marker when the replacement
    // pending record is created; clearing it makes the reapproval indistinguishable
    // from a goal that never had an approved execution package.
    invalidated_at: invalidatedAt,
    ...(invalidatedAt && previous?.invalidation_reason
      ? { invalidation_reason: previous.invalidation_reason }
      : {}),
  };
}

export function approvedApproval(kind, snapshot, approvedBy, previous = null) {
  const approvedAt = new Date().toISOString();
  return {
    version: APPROVAL_VERSION,
    kind,
    status: 'approved',
    snapshot_hash: hashApprovalSnapshot(kind, snapshot),
    snapshot: canonicalize(snapshot),
    requested_at: previous?.requested_at || approvedAt,
    approved_at: approvedAt,
    approved_by: approvedBy || null,
  };
}

export function invalidatedApproval(record, reason) {
  if (!record) return null;
  return {
    ...record,
    status: 'invalidated',
    invalidated_at: new Date().toISOString(),
    invalidation_reason: reason,
  };
}

export function isApprovalCurrent(kind, snapshot, record) {
  return (
    record?.version === APPROVAL_VERSION &&
    record?.status === 'approved' &&
    record?.snapshot_hash === hashApprovalSnapshot(kind, snapshot)
  );
}

export { APPROVAL_VERSION };
