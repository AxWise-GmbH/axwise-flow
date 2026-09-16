/**
 * Goal stage: evidence-aware customer and executor persona resolution.
 *
 * Asks AxWise to select direct, evidence-assisted, research-assisted, or human
 * clarification first. A+B persona research starts only when AxWise's bounded
 * value-of-information router selects it.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createLogger } from '../../../api/_lib/logger.js';
import {
  enqueueGoalAction,
  loadGoal,
  logGoalEvent,
  notifyGoalEvent,
  updateGoal,
} from '../_helpers.js';
import { autoApprovalAllowed, autoApprovalMarker, withAutoApprovalCount } from '../hitl-policy.js';
import { customerScopeHash } from '../scope-confirmation.js';
import { isAxwiseEnabled } from '../../integrations/axwise/config.js';
import { isAxwiseUserDisabled } from '../../integrations/axwise/user-flag.js';
import {
  createOrchestrationDecision,
  getPersonaResearchResult,
  getPersonaResearchStatus,
  refreshOrchestrationResearch,
} from '../../integrations/axwise/orchestration-client.js';
import {
  buildCustomerRoutingRequest,
  contextResolutionFromDecision,
  createWorkingPersonaHypothesis,
  ownerClarificationContext,
  sanitizePersonaResolution,
} from '../../integrations/axwise/customer-intelligence.js';
import { evidenceProfileV2ExecutionEnabledForModel } from '../../integrations/axwise/evidence-contract-v2.js';
import {
  extractAxwiseResearchBundle,
  importGoalResearchBundle,
} from '../../integrations/axwise/research-bundle.js';
import { verifyGoalResearchContextGate } from '../../integrations/axwise/research-contract.js';
import {
  approvedApproval,
  buildResearchExecutionPreview,
  buildContextApprovalSnapshot,
  invalidatedApproval,
  pendingApproval,
} from '../approval-audit.js';
import {
  CompactScopeContractError,
  validateNativeAxwiseScopeContractBinding,
  validateNativeAxwiseScopeRuntimeBinding,
  validateScopeResearchAcceptanceBinding,
  validateNativeAxwiseDecisionContracts,
} from '../../agent-handlers/compact-agent-contracts.js';
import {
  nativeAxwiseScopeActionBinding,
  nativeAxwiseScopeApprovalBlock,
} from '../../_shared/native-scope-approval.js';
import { pendingScopeRevisionToken } from '../../_shared/scope-revision-continuation.js';

const log = createLogger('goal-stage:customer-intelligence');
const TERMINAL_SUCCESS = new Set(['completed', 'completed_with_warnings']);
const TERMINAL_FAILURE = new Set(['failed', 'cancelled']);
const ELIGIBLE_GOAL_STATUSES = new Set(['analyzing', 'researching_customer']);
const MIN_RESEARCH_POLL_DELAY_MS = 1_000;
const DEFAULT_RESEARCH_POLL_DELAY_MS = 3_000;

/**
 * Validate the native AxWise handoff before it crosses the persistence trust
 * boundary. `scope_confirmation` is renamed because that key already belongs
 * to Orqaly's owner-acceptance CAS record.
 */
export function persistedAxwiseScopeContract(decision) {
  const handoff = validateNativeAxwiseDecisionContracts(decision);
  if (!handoff) return {};
  if (handoff.scope_packet.research_contract.evidence.mode === 'existing') {
    throw new CompactScopeContractError(
      'AxWise evidence mode existing is reserved but unsupported until a portable signed bundle compiler is available',
      'AXWISE_SCOPE_EVIDENCE_MODE_UNSUPPORTED'
    );
  }
  const executionInputsHash = decision?.research_execution_inputs_hash;
  if (executionInputsHash != null && !/^[a-f0-9]{64}$/.test(String(executionInputsHash))) {
    throw new CompactScopeContractError(
      'AxWise research_execution_inputs_hash is invalid',
      'AXWISE_RESEARCH_EXECUTION_INPUTS_HASH_INVALID'
    );
  }
  return {
    scope_packet: handoff.scope_packet,
    scope_validation: handoff.scope_validation,
    scope_contract_binding: handoff.scope_contract_binding,
    quality_contract: handoff.quality_contract,
    axwise_scope_confirmation: handoff.scope_confirmation,
    ...(executionInputsHash ? { research_execution_inputs_hash: String(executionInputsHash) } : {}),
  };
}

function acceptedResearchContract(goal) {
  const packet = goal?.data?.axwise_customer_intelligence?.scope_packet || null;
  const acceptance = goal?.data?.scope_admission?.research_acceptance || null;
  const proposalDecisionId = goal?.data?.axwise_customer_intelligence?.proposal_decision_id || null;
  const executionInputsHash =
    goal?.data?.axwise_customer_intelligence?.research_execution_inputs_hash || null;
  if (!packet || packet.research_contract?.evidence?.mode === 'none') return null;
  if (!proposalDecisionId || !executionInputsHash) {
    throw new CompactScopeContractError(
      'Accepted AxWise research is missing its durable proposal decision or execution inputs identity',
      'ORQALY_AXWISE_RESEARCH_PROPOSAL_IDENTITY_MISSING'
    );
  }
  const providerParentDecisionId =
    goal?.data?.axwise_customer_intelligence?.parent_decision_id || null;
  if (
    goal?.data?.axwise_customer_intelligence?.job_id &&
    String(providerParentDecisionId || '') !== String(proposalDecisionId)
  ) {
    throw new CompactScopeContractError(
      'Accepted AxWise research job is not linked to the durable proposal decision',
      'ORQALY_AXWISE_RESEARCH_PROPOSAL_LINK_MISMATCH'
    );
  }
  return validateScopeResearchAcceptanceBinding(acceptance, {
    goal,
    scopePacket: packet,
    proposalDecisionId,
    executionInputsHash,
  });
}

function assertScopeResearchAcceptanceEcho(goal, value) {
  const expected = acceptedResearchContract(goal);
  if (!expected) return null;
  return validateScopeResearchAcceptanceBinding(value, {
    goal,
    scopePacket: goal.data.axwise_customer_intelligence.scope_packet,
    proposalDecisionId: expected.proposal_decision_id,
    executionInputsHash: expected.execution_inputs_hash,
    expected,
  });
}

function assertScopeResearchAcceptanceEnvelope(
  goal,
  value,
  {
    nestedJobKey = null,
    requireTaskContext = false,
    expectedJobId = null,
    requireTopJobId = false,
    requireExecutionInputsHash = false,
  } = {}
) {
  const expected = acceptedResearchContract(goal);
  if (!expected) return null;
  const packet = goal.data.axwise_customer_intelligence.scope_packet;
  validateNativeAxwiseScopeContractBinding(value?.scope_contract_binding, packet);
  validateNativeAxwiseScopeRuntimeBinding(value?.scope_runtime_binding, packet);
  assertScopeResearchAcceptanceEcho(goal, value?.scope_research_acceptance);
  if (requireTaskContext) {
    validateNativeAxwiseScopeRuntimeBinding(
      value?.configuration?.task_context?.scope_runtime_binding,
      packet
    );
    assertScopeResearchAcceptanceEcho(
      goal,
      value?.configuration?.task_context?.scope_research_acceptance
    );
  }
  if (nestedJobKey) {
    validateNativeAxwiseScopeContractBinding(value?.[nestedJobKey]?.scope_contract_binding, packet);
    validateNativeAxwiseScopeRuntimeBinding(value?.[nestedJobKey]?.scope_runtime_binding, packet);
    assertScopeResearchAcceptanceEcho(goal, value?.[nestedJobKey]?.scope_research_acceptance);
  }
  if (requireExecutionInputsHash) {
    if (String(value?.research_execution_inputs_hash || '') !== expected.execution_inputs_hash) {
      throw new CompactScopeContractError(
        'AxWise research execution inputs hash changed after owner acceptance',
        'ORQALY_AXWISE_RESEARCH_EXECUTION_INPUTS_MISMATCH'
      );
    }
  }
  if (expectedJobId != null) {
    const exactJobId = String(expectedJobId || '');
    if (!exactJobId) {
      throw new CompactScopeContractError(
        'Orqaly durable AxWise research job identity is missing',
        'ORQALY_AXWISE_RESEARCH_JOB_ID_MISSING'
      );
    }
    if (requireTopJobId && String(value?.job_id || '') !== exactJobId) {
      throw new CompactScopeContractError(
        'AxWise research envelope job_id does not match the durable job',
        'ORQALY_AXWISE_RESEARCH_JOB_ID_MISMATCH'
      );
    }
    if (nestedJobKey && String(value?.[nestedJobKey]?.job_id || '') !== exactJobId) {
      throw new CompactScopeContractError(
        'AxWise nested research job_id does not match the durable job',
        'ORQALY_AXWISE_RESEARCH_JOB_ID_MISMATCH'
      );
    }
  }
  return expected;
}

export function assertRefreshedScopeContractMatches(goal, decision) {
  const existing = goal?.data?.axwise_customer_intelligence || {};
  if (!existing.scope_packet) return persistedAxwiseScopeContract(decision);
  const expected = validateNativeAxwiseDecisionContracts({
    scope_packet: existing.scope_packet,
    scope_validation: existing.scope_validation,
    scope_confirmation: existing.axwise_scope_confirmation,
    scope_contract_binding: existing.scope_contract_binding,
  });
  const refreshed = validateNativeAxwiseDecisionContracts(decision);
  if (
    !expected ||
    !refreshed ||
    refreshed.scope_packet.scope_hash !== expected.scope_packet.scope_hash ||
    refreshed.scope_packet.research_contract.contract_hash !==
      expected.scope_packet.research_contract.contract_hash
  ) {
    throw new CompactScopeContractError(
      'AxWise post-research decision changed the dispatched scope research contract',
      'AXWISE_REFRESHED_SCOPE_CONTRACT_MISMATCH'
    );
  }
  assertScopeResearchAcceptanceEnvelope(goal, decision, {
    requireExecutionInputsHash: true,
  });
  return {
    scope_packet: refreshed.scope_packet,
    scope_validation: refreshed.scope_validation,
    scope_contract_binding: refreshed.scope_contract_binding,
    quality_contract: refreshed.quality_contract,
    axwise_scope_confirmation: refreshed.scope_confirmation,
    scope_research_acceptance: decision.scope_research_acceptance,
  };
}

/**
 * AxWise research is durable and asynchronous, but a completed run should not
 * wait for the next minute-level reconciler sweep before Orqaly notices it.
 * Keep the cadence bounded so a bad environment value cannot create either a
 * hot loop or a serverless invocation that sleeps for most of its lifetime.
 */
export function researchPollDelayMs(env = process.env) {
  const configured = Number.parseInt(env.AXWISE_RESEARCH_POLL_MS || '', 10);
  if (!Number.isFinite(configured)) return DEFAULT_RESEARCH_POLL_DELAY_MS;
  return Math.max(MIN_RESEARCH_POLL_DELAY_MS, Math.min(configured, 15_000));
}

async function enqueueNextResearchPoll(
  admin,
  goalId,
  decisionId,
  jobId,
  { revisionToken, delay = true, env = process.env } = {}
) {
  if (delay) {
    const delayMs = researchPollDelayMs(env);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  await enqueueGoalAction(admin, 'customer-intelligence', goalId, {
    research_poll: true,
    research_decision_id: decisionId,
    research_job_id: jobId,
    ...(revisionToken ? { scope_revision_token: revisionToken } : {}),
  });
}

export function boundedResearchFailure(runStatus = {}, terminalStatus = 'failed', existing = {}) {
  const failureSignal = [
    runStatus.failure_code,
    runStatus.error_code,
    runStatus.code,
    runStatus.failure_reason,
    runStatus.reason,
    runStatus.error,
    runStatus.message,
  ]
    .map((value) =>
      String(value || '')
        .slice(0, 200)
        .toLowerCase()
    )
    .join(' ');
  const stage = String(
    runStatus.failed_stage ||
      runStatus.stage ||
      runStatus.current_stage ||
      existing.current_stage ||
      ''
  )
    .trim()
    .slice(0, 80);

  let code = terminalStatus === 'cancelled' ? 'research_cancelled' : 'research_failed';
  let message =
    terminalStatus === 'cancelled'
      ? 'The required customer research was cancelled before completion.'
      : 'The required customer research did not complete, so no customer context was accepted.';

  if (/timeout|deadline/.test(failureSignal)) {
    code = 'research_timeout';
    message = 'The required customer research exceeded its allowed run time.';
  } else if (/ground|source|evidence|citation|authority/.test(failureSignal)) {
    code = 'grounding_failed';
    message = 'Required market evidence could not be verified.';
  } else if (/rate|quota|capacity|busy|unavailable/.test(failureSignal)) {
    code = 'research_service_busy';
    message = 'The research service was temporarily unavailable.';
  } else if (/auth|credential|config/.test(failureSignal)) {
    code = 'research_service_not_ready';
    message = 'The research service is not ready for this run.';
  }

  const retryable =
    code !== 'research_cancelled' &&
    code !== 'research_service_not_ready' &&
    runStatus.retryable !== false;

  return {
    code,
    message,
    stage: stage || null,
    retryable,
  };
}

function errorTelemetry(error) {
  return {
    error_code: error?.code || null,
    http_status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
    axwise_request_id: error?.requestId || null,
  };
}

async function recordCustomerIntelligenceCall(
  admin,
  goal,
  request,
  requestId,
  startedAt,
  decision = null,
  error = null
) {
  try {
    const diagnostic = errorTelemetry(error);
    await admin.from('axwise_calls').insert({
      user_id: goal.user_id,
      org_id: goal.org_id,
      trace_id: decision?.request_id || diagnostic.axwise_request_id || null,
      request_id: requestId,
      integration_point: 'goal.customer-intelligence',
      destination_url: `${(process.env.AXWISE_API_URL || '').replace(/\/+$/, '')}/orchestration/decisions`,
      model: decision?.scorer_version || null,
      status: error ? 'error' : 'ok',
      applied_outcome: error ? 'fallback:local-context' : 'context-routed',
      ax_decision: decision?.status || diagnostic.error_code,
      local_decision: error ? 'orqaly-declared-context' : 'awaiting-context-approval',
      degraded: Boolean(error),
      skipped: false,
      duration_ms: Math.max(0, Date.now() - startedAt),
      cost_usd: 0,
      request_payload: {
        task_id: request?.task?.task_id,
        domain: request?.task?.domain,
        available_agents: request?.available_agents?.length || 0,
        evidence_items: request?.evidence_catalogue?.length || 0,
        hybrid_research_allowed: Boolean(request?.research_policy?.allow_hybrid_research),
      },
      processed_outputs: decision
        ? {
            decision_id: decision.decision_id,
            status: decision.status,
            routing_mode: decision.routing_mode,
            research_job_id: decision.research_job?.job_id || null,
          }
        : null,
      applicable_conditions: error ? diagnostic : null,
    });
  } catch {
    // Integration telemetry must never block goal progress or fallback.
  }
}

export async function loadEligibleAgents(admin, goal) {
  const { data, error } = await admin
    .from('agents')
    .select('id, name, description, category, capabilities, status, metadata')
    .eq('user_id', goal.user_id)
    .eq('status', 'active')
    .limit(500);
  if (error)
    throw new Error(`Unable to load the authenticated Agent Hub catalogue: ${error.message}`);
  let agents = data || [];

  if (goal.org_id) {
    const { data: orgAgents, error: orgAgentsError } = await admin
      .from('org_agents')
      .select('agent_id')
      .eq('org_id', goal.org_id)
      .eq('user_id', goal.user_id);
    if (orgAgentsError) {
      throw new Error(
        `Unable to verify the organization-scoped Agent Hub catalogue: ${orgAgentsError.message}`
      );
    }

    // An organization with no mapped agents intentionally has no candidates.
    // Falling back to every agent owned by the user would leak agents between
    // otherwise isolated projects and could assign the wrong operating team.
    const allowed = new Set((orgAgents || []).map((item) => String(item.agent_id)));
    agents = agents.filter((agent) => allowed.has(String(agent.id)));
  }
  return agents.sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

async function persistState(
  admin,
  goal,
  patch,
  status = 'researching_customer',
  expectedGeneration = null
) {
  const current = await loadGoal(admin, goal.id);
  const existing = current.data?.axwise_customer_intelligence || {};
  const updatedAt = new Date().toISOString();
  const nextIntelligence = {
    ...existing,
    ...patch,
    updated_at: updatedAt,
  };
  const currentAdmission = current.data?.scope_admission || {};
  return updateGoalForActiveGeneration(admin, goal.id, expectedGeneration, {
    status,
    data: {
      ...(current.data || {}),
      axwise_customer_intelligence: nextIntelligence,
      // Provider job state belongs to axwise_customer_intelligence.status.
      // Once the owner accepts a typed packet, its admission and acceptance
      // binding are immutable authority and must survive queued/running/result
      // persistence byte-for-byte.
      scope_admission:
        currentAdmission.status === 'accepted'
          ? currentAdmission
          : {
              ...currentAdmission,
              version: 1,
              native_scope: true,
              status: String(nextIntelligence.status || status || 'running'),
              state_key: 'axwise_customer_intelligence',
              scope_hash: nextIntelligence.scope_packet?.scope_hash || null,
              updated_at: updatedAt,
            },
    },
  });
}

function activeGeneration(goal) {
  const intelligence = goal?.data?.axwise_customer_intelligence || {};
  return {
    status: goal?.status || null,
    decisionId: intelligence.decision_id == null ? null : String(intelligence.decision_id),
    jobId: intelligence.job_id == null ? null : String(intelligence.job_id),
    generation: intelligence.generation == null ? null : String(intelligence.generation),
    revisionToken:
      goal?.data?.scope_revision?.revision_token == null
        ? null
        : String(goal.data.scope_revision.revision_token),
  };
}

async function updateGoalForActiveGeneration(admin, goalId, expected, updates) {
  if (!expected) {
    await updateGoal(admin, goalId, updates);
    return true;
  }
  let query = admin
    .from('goals')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', goalId)
    .eq('status', expected.status);
  const bind = (path, value) => {
    query = value == null ? query.is(path, null) : query.eq(path, value);
  };
  bind('data->axwise_customer_intelligence->>decision_id', expected.decisionId);
  bind('data->axwise_customer_intelligence->>job_id', expected.jobId);
  bind('data->axwise_customer_intelligence->>generation', expected.generation);
  bind('data->scope_revision->>revision_token', expected.revisionToken);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw new Error(`Goal generation update failed: ${error.message}`);
  return Boolean(data?.id);
}

function staleGenerationResult(goal) {
  return {
    type: 'orchestrate-goal',
    action: 'customer-intelligence',
    goalId: goal.id,
    status: 'stale_generation',
  };
}

async function awaitContextApproval(admin, goal, intelligencePatch, expectedGeneration = null) {
  const current = await loadGoal(admin, goal.id);
  const updatedAt = new Date().toISOString();
  const intelligence = {
    ...(current.data?.axwise_customer_intelligence || {}),
    ...intelligencePatch,
    updated_at: updatedAt,
  };
  const nextGoalData = { ...(current.data || {}) };
  const pendingRevision = nextGoalData.scope_revision;
  const replacementScopeHash = intelligencePatch.scope_packet?.scope_hash || null;
  if (
    pendingRevision?.status === 'pending_rebuild' &&
    pendingRevision.kind !== 'evidence_refresh' &&
    pendingRevision.source_scope_hash &&
    replacementScopeHash === pendingRevision.source_scope_hash
  ) {
    const failureReason =
      'AxWise returned the superseded scope hash after an owner correction; the correction was not incorporated.';
    const transitioned = await updateGoalForActiveGeneration(admin, goal.id, expectedGeneration, {
      status: 'needs_human',
      data: {
        ...nextGoalData,
        failure_code: 'axwise_scope_revision_not_applied',
        failure_reason: failureReason,
        scope_revision: {
          ...pendingRevision,
          status: 'rebuild_rejected',
          rejected_scope_hash: replacementScopeHash,
          rejected_at: updatedAt,
        },
        axwise_customer_intelligence: {
          ...intelligence,
          status: 'scope_revision_rejected',
          scope_packet: null,
          scope_validation: null,
          quality_contract: null,
          axwise_scope_confirmation: null,
        },
      },
    });
    if (!transitioned) return null;
    await logGoalEvent(admin, goal.id, 'axwise_scope_revision_rejected', {
      revision_token: pendingRevision.revision_token || null,
      source_scope_hash: pendingRevision.source_scope_hash,
      rejected_scope_hash: replacementScopeHash,
    });
    await notifyGoalEvent(admin, current, 'goal_needs_human', { feedback: failureReason });
    return { scope_revision_rejected: true };
  }
  if (
    (nextGoalData.context_revision_feedback || pendingRevision?.kind === 'evidence_refresh') &&
    intelligencePatch.scope_packet?.scope_hash
  ) {
    // The replacement packet now carries the correction in its canonical
    // intent/ledger/hash. Leaving this transient input behind would force all
    // later retries to rebuild admission again from an already-resolved edit.
    delete nextGoalData.context_revision_feedback;
    if (nextGoalData.scope_revision?.status === 'pending_rebuild') {
      nextGoalData.scope_revision = {
        ...nextGoalData.scope_revision,
        status: 'incorporated',
        replacement_scope_hash: intelligencePatch.scope_packet.scope_hash,
        incorporated_at: updatedAt,
      };
    }
  }
  const candidate = {
    ...current,
    data: { ...nextGoalData, axwise_customer_intelligence: intelligence },
  };
  const approvals = current.data?.goal_approvals || {};
  const contextApproval = pendingApproval(
    'context',
    buildContextApprovalSnapshot(candidate),
    approvals.context
  );
  // Decided before the write so the counter bump lands in the same update.
  const nativeScopeBlock = nativeAxwiseScopeApprovalBlock(candidate);
  const nativeScope = Boolean(nativeAxwiseScopeActionBinding(candidate));
  // Native AxWise Gate 1 is always owner-confirmed. Execution HITL policy may
  // still be unattended, but it cannot silently approve the cognitive scope.
  const autoApprove = !nativeScope && !nativeScopeBlock && autoApprovalAllowed(current, 'context');
  const gateData = {
    ...candidate.data,
    scope_admission: {
      ...Object.fromEntries(
        Object.entries(current.data?.scope_admission || {}).filter(
          ([key]) => key !== 'research_acceptance'
        )
      ),
      version: 1,
      native_scope: true,
      status: 'awaiting_confirmation',
      state_key: 'axwise_customer_intelligence',
      scope_hash: intelligence.scope_packet?.scope_hash || null,
      updated_at: updatedAt,
    },
    goal_approvals: {
      ...approvals,
      context: contextApproval,
      execution: invalidatedApproval(approvals.execution, 'context_changed'),
    },
  };

  const transitioned = await updateGoalForActiveGeneration(admin, goal.id, expectedGeneration, {
    status: 'awaiting_context_approval',
    data: autoApprove ? withAutoApprovalCount(gateData, 'context') : gateData,
  });
  if (!transitioned) return null;
  await logGoalEvent(admin, goal.id, 'awaiting_context_approval', {
    decision_id: intelligence.decision_id || null,
    routing_mode: intelligence.routing_mode || null,
    snapshot_hash: contextApproval.snapshot_hash,
  });

  if (autoApprove) {
    // Unattended goals do not skip this gate — the awaiting_context_approval
    // state above is written durably first, so a lost job leaves a resumable
    // goal rather than a silent bypass. Re-enter the same handler the UI would
    // have called so verifyGoalResearchContextGate and the stale-snapshot guard
    // still run. Suppress the "confirm this" notification: asking the user to
    // review something we are about to approve ourselves is just noise.
    await logGoalEvent(admin, goal.id, 'context_auto_approved', {
      policy: 'hitl_unattended',
      snapshot_hash: contextApproval.snapshot_hash,
    });
    const nativeScopeBinding = nativeAxwiseScopeActionBinding({
      ...current,
      data: gateData,
    });
    await enqueueGoalAction(admin, 'context-approval', goal.id, {
      context_action: 'approve',
      approved_by: current.user_id,
      auto_approval: autoApprovalMarker(contextApproval.snapshot_hash),
      ...(nativeScopeBinding ? { native_scope_binding: nativeScopeBinding } : {}),
    });
    return contextApproval;
  }

  await notifyGoalEvent(admin, current, 'context_ready', {
    feedback: 'AxWise proposed the scope and required capabilities. Confirm or correct it.',
  });
  return contextApproval;
}

async function continueApprovedScopeAfterBoundContext(
  admin,
  goal,
  intelligencePatch,
  expectedGeneration = null
) {
  const current = await loadGoal(admin, goal.id);
  const currentContext = current.data?.goal_approvals?.context;
  const acceptedScope = current.data?.scope_admission;
  if (
    acceptedScope?.native_scope !== true ||
    acceptedScope.status !== 'accepted' ||
    currentContext?.status !== 'approved' ||
    currentContext.approval_basis !== 'accepted_typed_scope' ||
    String(currentContext.approved_by || '') !== String(current.user_id || '')
  ) {
    return null;
  }
  // The first click accepted only the immutable typed scope. An accepted
  // provider dispatch necessarily changes decision/job/context fields, so a
  // broad snapshot comparison would falsely stale that click. The acceptance
  // binding is the narrower durable authority for this transition.
  acceptedResearchContract(current);

  const updatedAt = new Date().toISOString();
  const intelligence = {
    ...(current.data?.axwise_customer_intelligence || {}),
    ...intelligencePatch,
    updated_at: updatedAt,
  };
  const candidate = {
    ...current,
    data: {
      ...(current.data || {}),
      axwise_customer_intelligence: intelligence,
    },
  };
  const researchGate = await verifyGoalResearchContextGate(admin, candidate);
  if (researchGate.status !== 'ready') {
    const reason = 'The exact scope-bound research result did not pass Gate 1.';
    const transitioned = await updateGoalForActiveGeneration(admin, goal.id, expectedGeneration, {
      status: 'needs_human',
      data: {
        ...candidate.data,
        failure_code: 'axwise_research_gate_blocked',
        failure_reason: reason,
        goal_approvals: {
          ...(candidate.data.goal_approvals || {}),
          context: invalidatedApproval(currentContext, 'research_gate_blocked'),
          execution: invalidatedApproval(
            candidate.data.goal_approvals?.execution,
            'research_gate_blocked'
          ),
        },
        axwise_customer_intelligence: {
          ...intelligence,
          status: 'required_research_blocked',
          research_gate: researchGate,
        },
      },
    });
    if (!transitioned) return { stale: true };
    await logGoalEvent(admin, goal.id, 'axwise_required_research_blocked', {
      reason,
      issues: researchGate.issues || [],
      scope_hash: acceptedScope.scope_hash || null,
    });
    await notifyGoalEvent(admin, current, 'goal_needs_human', {
      feedback: reason,
    });
    return { blocked: true, gate: researchGate };
  }

  const finalSnapshot = buildContextApprovalSnapshot(candidate);
  const finalContext = {
    ...approvedApproval('context', finalSnapshot, currentContext.approved_by, currentContext),
    approval_basis: 'accepted_scope_bound_context',
    scope_approval_snapshot_hash: currentContext.snapshot_hash,
    scope_approved_at: currentContext.approved_at,
  };
  const transitioned = await updateGoalForActiveGeneration(admin, goal.id, expectedGeneration, {
    status: 'planning',
    data: {
      ...candidate.data,
      goal_approvals: {
        ...(candidate.data.goal_approvals || {}),
        context: finalContext,
        execution: invalidatedApproval(
          candidate.data.goal_approvals?.execution,
          'scope_bound_context_completed'
        ),
      },
    },
  });
  if (!transitioned) return { stale: true };
  await logGoalEvent(admin, goal.id, 'context_scope_bound_research_accepted', {
    scope_hash: acceptedScope.scope_hash || null,
    scope_approval_snapshot_hash: currentContext.snapshot_hash,
    final_context_snapshot_hash: finalContext.snapshot_hash,
  });
  await enqueueGoalAction(admin, 'pm-planning', goal.id);
  return { continued: true, approval: finalContext, gate: researchGate };
}

function rejectedScopeRevisionResult(goal) {
  return {
    type: 'orchestrate-goal',
    action: 'customer-intelligence',
    goalId: goal.id,
    status: 'needs_human',
    reason: 'scope_revision_not_applied',
  };
}

async function advanceWithoutResearch(
  admin,
  goal,
  reason,
  details = {},
  expectedGeneration = null
) {
  const contextApproval = await awaitContextApproval(
    admin,
    goal,
    {
      status: 'degraded',
      degraded: true,
      reason,
      persona_resolution: null,
      working_hypothesis: null,
      user_research_request: null,
      ...details,
    },
    expectedGeneration
  );
  if (!contextApproval) return staleGenerationResult(goal);
  if (contextApproval.scope_revision_rejected) return rejectedScopeRevisionResult(goal);
  await logGoalEvent(admin, goal.id, 'axwise_customer_intelligence_degraded', {
    reason,
    ...details,
  });
  return {
    type: 'orchestrate-goal',
    action: 'customer-intelligence',
    goalId: goal.id,
    status: 'awaiting_context_approval',
    approvalHash: contextApproval.snapshot_hash,
  };
}

function requiredResearchPolicy(goal) {
  const policy = goal?.data?.research_policy || {};
  const acceptedContract =
    goal?.data?.scope_admission?.status === 'accepted'
      ? goal?.data?.axwise_customer_intelligence?.scope_packet?.research_contract || null
      : null;
  const contractEvidence = acceptedContract?.evidence || null;
  const mode = contractEvidence
    ? contractEvidence.mode === 'grounded'
      ? String(policy.research_mode || 'grounded_fast')
      : contractEvidence.mode === 'none'
        ? 'instant'
        : 'auto'
    : String(policy.research_mode || 'auto');
  const grounded = contractEvidence
    ? contractEvidence.grounding_required === true
    : policy.grounding_required === true || mode.startsWith('grounded_');
  const explicitlyRequested = Boolean(
    String(goal?.data?.axwise_customer_intelligence?.user_research_request?.feedback || '').trim()
  );
  const evidenceRefresh = String(goal?.data?.scope_revision?.kind || '') === 'evidence_refresh';
  const required = contractEvidence
    ? contractEvidence.mode !== 'none' || explicitlyRequested || evidenceRefresh
    : policy.required === true || grounded || explicitlyRequested || evidenceRefresh;
  return {
    policy,
    mode,
    grounded,
    required,
    failClosed: policy.research_fail_closed === true || required,
    location: String(acceptedContract?.geographies?.join(', ') || policy.location || '').trim(),
  };
}

async function pauseForRequiredResearch(
  admin,
  goal,
  reason,
  details = {},
  expectedGeneration = null
) {
  const current = await loadGoal(admin, goal.id);
  const policy = requiredResearchPolicy(current);
  const transitioned = await updateGoalForActiveGeneration(admin, goal.id, expectedGeneration, {
    status: 'needs_human',
    data: {
      ...(current.data || {}),
      failure_reason: String(reason || 'Required customer research is unavailable').slice(0, 500),
      axwise_customer_intelligence: {
        ...(current.data?.axwise_customer_intelligence || {}),
        version: 'orqaly_customer_intelligence_v2',
        status: 'required_research_blocked',
        degraded: false,
        reason: String(reason || 'Required customer research is unavailable').slice(0, 500),
        persona_resolution: null,
        research_policy: policy.policy,
        ...details,
        updated_at: new Date().toISOString(),
      },
    },
  });
  if (!transitioned) return staleGenerationResult(goal);
  await logGoalEvent(admin, goal.id, 'axwise_required_research_blocked', {
    reason: String(reason || '').slice(0, 500),
    research_mode: policy.mode,
    grounding_required: policy.grounded,
    ...details,
  });
  await notifyGoalEvent(admin, current, 'goal_needs_human', {
    feedback: `Required scope research could not continue: ${String(reason || '').slice(0, 300)}`,
  });
  return {
    type: 'orchestrate-goal',
    action: 'customer-intelligence',
    goalId: goal.id,
    status: 'needs_human',
    reason: 'required_research_blocked',
  };
}

async function pauseForInvalidProviderDecision(
  admin,
  goal,
  reason,
  details = {},
  { decision = null, sourceResearch = {}, expectedGeneration = null } = {}
) {
  const current = await loadGoal(admin, goal.id);
  const currentIntelligence = current.data?.axwise_customer_intelligence || {};
  const sourceResearchRun = clarificationSourceResearchRun(
    currentIntelligence,
    decision,
    sourceResearch
  );
  const boundedReason = String(reason || 'AxWise returned an invalid context decision').slice(
    0,
    500
  );
  const transitioned = await updateGoalForActiveGeneration(admin, goal.id, expectedGeneration, {
    status: 'needs_human',
    data: {
      ...(current.data || {}),
      failure_code: 'axwise_context_decision_invalid',
      failure_reason: boundedReason,
      axwise_customer_intelligence: {
        ...currentIntelligence,
        version: 'orqaly_customer_intelligence_v2',
        status: 'provider_contract_failed',
        clarification_kind: 'hard_block',
        clarification_code: 'provider_contract_invalid',
        degraded: false,
        reason: boundedReason,
        persona_resolution: null,
        clarification_scope: null,
        scope_confirmation: null,
        clarification_source_research_run: sourceResearchRun,
        completed_research_iterations: sourceResearchRun?.job_id
          ? Math.max(1, Number(currentIntelligence.completed_research_iterations || 0))
          : Number(currentIntelligence.completed_research_iterations || 0),
        job_id: null,
        generation: null,
        request_id: null,
        request_hash: null,
        requested_at: null,
        ...details,
        updated_at: new Date().toISOString(),
      },
    },
  });
  if (!transitioned) return staleGenerationResult(goal);
  await logGoalEvent(admin, goal.id, 'axwise_customer_intelligence_contract_failed', {
    reason: boundedReason,
    ...details,
  });
  await notifyGoalEvent(admin, current, 'goal_needs_human', {
    feedback: `AxWise returned an invalid scope-admission decision: ${boundedReason.slice(0, 300)}`,
  });
  return {
    type: 'orchestrate-goal',
    action: 'customer-intelligence',
    goalId: goal.id,
    status: 'needs_human',
    reason: 'provider_contract_failed',
  };
}

const AXWISE_ROUTER_VERSION = 'deterministic-voi-v1.0.0';
const SCOPE_CLARIFICATION_REASONS = new Set([
  'objective is underspecified',
  'desired outcome lacks completion detail',
  'task uses generic or unresolved language',
  'stakeholders are unspecified or unresolved',
]);
const SCOPE_CLARIFICATION_SOFT_REASONS = new Set([
  'uncertainty remains too high for a direct recommendation',
]);

function providerClarificationReasons(decision) {
  const assessment = decision?.routing_assessment || {};
  const values = [
    ...(Array.isArray(assessment.reasons) ? assessment.reasons : []),
    assessment.reason,
    decision?.reason,
  ];
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function isNarrowScopeClarification(goal, decision, agents) {
  if (!Array.isArray(agents) || agents.length === 0) return false;
  if (String(decision?.router_version || '') !== AXWISE_ROUTER_VERSION) return false;
  if (
    decision?.routing_assessment?.router_version &&
    String(decision.routing_assessment.router_version) !== AXWISE_ROUTER_VERSION
  ) {
    return false;
  }
  const task = decision?.input_snapshot?.task || {};
  const riskLevel = String(task.risk_level || goal?.risk_level || 'medium').toLowerCase();
  const reversibility = String(task.reversibility || 'reversible').toLowerCase();
  const assessment = decision?.routing_assessment || {};
  if (['high', 'critical'].includes(riskLevel) || reversibility === 'irreversible') return false;
  if (Number(assessment.contradiction || 0) > 0 || Number(assessment.consequence || 0) >= 0.4) {
    return false;
  }
  const reasons = providerClarificationReasons(decision);
  if (reasons.length === 0) return false;
  return (
    reasons.some((reason) => SCOPE_CLARIFICATION_REASONS.has(reason)) &&
    reasons.every(
      (reason) =>
        SCOPE_CLARIFICATION_REASONS.has(reason) || SCOPE_CLARIFICATION_SOFT_REASONS.has(reason)
    )
  );
}

async function pauseForProviderClarification(
  admin,
  goal,
  decision,
  reason,
  {
    sourceResearch = {},
    clarificationCode = 'provider_unspecified',
    expectedGeneration = null,
  } = {}
) {
  const current = await loadGoal(admin, goal.id);
  const currentIntelligence = current.data?.axwise_customer_intelligence || {};
  const sourceResearchRun = clarificationSourceResearchRun(
    currentIntelligence,
    decision,
    sourceResearch
  );
  const reasons = providerClarificationReasons(decision);
  const boundedReason = String(reason || reasons[0] || 'AxWise requires human review').slice(
    0,
    500
  );
  const transitioned = await updateGoalForActiveGeneration(admin, goal.id, expectedGeneration, {
    status: 'needs_human',
    data: {
      ...(current.data || {}),
      failure_code: 'axwise_customer_context_escalated',
      failure_reason: boundedReason,
      axwise_customer_intelligence: {
        ...currentIntelligence,
        version: 'orqaly_customer_intelligence_v2',
        status: 'provider_human_escalation',
        degraded: false,
        decision_id: decision?.decision_id || currentIntelligence.decision_id || null,
        parent_decision_id: decision?.parent_decision_id || null,
        routing_mode: 'human_clarification',
        routing_assessment: decision?.routing_assessment || null,
        clarification_kind: 'hard_block',
        clarification_code: clarificationCode,
        provider_clarification_reasons: reasons,
        reason: boundedReason,
        persona_resolution: null,
        clarification_scope: null,
        scope_confirmation: null,
        clarification_source_research_run: sourceResearchRun,
        completed_research_iterations: sourceResearchRun?.job_id
          ? Math.max(1, Number(currentIntelligence.completed_research_iterations || 0))
          : Number(currentIntelligence.completed_research_iterations || 0),
        job_id: null,
        generation: null,
        request_id: null,
        request_hash: null,
        requested_at: null,
        updated_at: new Date().toISOString(),
      },
    },
  });
  if (!transitioned) return staleGenerationResult(goal);
  await logGoalEvent(admin, goal.id, 'axwise_customer_intelligence_human_escalation', {
    decision_id: decision?.decision_id || null,
    reasons,
    source_research_job_id: sourceResearchRun?.job_id || null,
  });
  await notifyGoalEvent(admin, current, 'goal_needs_human', {
    feedback: `AxWise requires a non-scope human review: ${boundedReason.slice(0, 300)}`,
  });
  return {
    type: 'orchestrate-goal',
    action: 'customer-intelligence',
    goalId: goal.id,
    status: 'needs_human',
    reason: 'provider_human_escalation',
  };
}

function handleResearchFailure(admin, goal, reason, details = {}, expectedGeneration = null) {
  return requiredResearchPolicy(goal).failClosed
    ? pauseForRequiredResearch(admin, goal, reason, details, expectedGeneration)
    : advanceWithoutResearch(admin, goal, reason, details, expectedGeneration);
}

async function advanceWithResolution(
  admin,
  goal,
  agents,
  decision,
  resolution,
  req,
  requestHash = null,
  researchBundlePointer = null,
  expectedGeneration = null
) {
  const scopeContract =
    goal.data?.scope_admission?.status === 'accepted'
      ? assertRefreshedScopeContractMatches(goal, decision)
      : persistedAxwiseScopeContract(decision);
  const sanitized = sanitizePersonaResolution(
    resolution,
    agents.map((agent) => agent.id),
    goal
  );
  const ownerScope = ownerClarificationContext(goal);
  const intelligencePatch = {
    version: 'orqaly_customer_intelligence_v2',
    status: 'completed',
    degraded: false,
    decision_id: decision.decision_id,
    parent_decision_id: decision.parent_decision_id || null,
    routing_mode: decision.routing_mode,
    ...(decision.provider_routing_mode
      ? { provider_routing_mode: decision.provider_routing_mode }
      : {}),
    scorer_version: decision.scorer_version || null,
    router_version: decision.router_version || null,
    routing_assessment: decision.routing_assessment || null,
    ...scopeContract,
    ...(ownerScope
      ? {
          owner_scope_source_decision_id: ownerScope.sourceDecisionId,
          owner_scope_source_scope_hash: ownerScope.sourceScopeHash,
        }
      : {}),
    request_hash: requestHash,
    research_bundle: researchBundlePointer,
    persona_resolution: sanitized,
    working_hypothesis: null,
    user_research_request: null,
    completed_at: new Date().toISOString(),
    authorization: {
      recommended_agent_valid: Boolean(sanitized.recommended_agent),
      checked_agent_ids: agents.map((agent) => String(agent.id)),
      checked_at: new Date().toISOString(),
    },
  };
  const approvedScopeContinuation = await continueApprovedScopeAfterBoundContext(
    admin,
    goal,
    intelligencePatch,
    expectedGeneration
  );
  if (approvedScopeContinuation?.stale) return staleGenerationResult(goal);
  if (approvedScopeContinuation?.blocked) {
    return {
      type: 'orchestrate-goal',
      action: 'customer-intelligence',
      goalId: goal.id,
      status: 'needs_human',
      reason: 'required_research_blocked',
    };
  }
  const contextApproval =
    approvedScopeContinuation?.approval ||
    (await awaitContextApproval(admin, goal, intelligencePatch, expectedGeneration));
  if (!contextApproval) return staleGenerationResult(goal);
  if (contextApproval.scope_revision_rejected) return rejectedScopeRevisionResult(goal);
  await logGoalEvent(admin, goal.id, 'axwise_customer_intelligence_completed', {
    decision_id: decision.decision_id,
    routing_mode: decision.routing_mode,
    research_performed: resolution?.version === 'orqaly_dual_persona_v1',
    customer_persona: sanitized.customer_persona.name,
    recommended_agent_id: sanitized.recommended_agent?.agent_id || null,
    evidence_count: sanitized.evidence_count,
  });
  log.info(req, 'customer-intelligence.completed', {
    goalId: goal.id,
    decisionId: decision.decision_id,
    routingMode: decision.routing_mode,
  });
  return {
    type: 'orchestrate-goal',
    action: 'customer-intelligence',
    goalId: goal.id,
    status: approvedScopeContinuation?.continued ? 'planning' : 'awaiting_context_approval',
    decisionId: decision.decision_id,
    routingMode: decision.routing_mode,
    approvalHash: contextApproval.snapshot_hash,
  };
}

function clarificationSourceResearchRun(currentIntelligence, decision, sourceResearch = {}) {
  if (!currentIntelligence.job_id) {
    return currentIntelligence.clarification_source_research_run || null;
  }
  return {
    decision_id: currentIntelligence.decision_id || null,
    parent_decision_id: decision?.parent_decision_id || null,
    refreshed_decision_id: decision?.decision_id || null,
    job_id: currentIntelligence.job_id,
    request_id: currentIntelligence.request_id || null,
    request_hash: currentIntelligence.request_hash || null,
    routing_mode: currentIntelligence.routing_mode || null,
    requested_at: currentIntelligence.requested_at || null,
    retry_count: Number(currentIntelligence.retry_count || 0),
    generation: currentIntelligence.generation ?? null,
    last_known_status: currentIntelligence.status || null,
    terminal_status: sourceResearch.terminalStatus || null,
    research_bundle: sourceResearch.researchBundlePointer || null,
  };
}

async function requestClarification(
  admin,
  goal,
  decision,
  reason,
  {
    rawResolution = null,
    agents = [],
    sourceResearch = {},
    clarificationKind = 'customer_scope',
    clarificationCode = 'provider_scope_ambiguity',
    expectedGeneration = null,
  } = {}
) {
  const scopeContract = persistedAxwiseScopeContract(decision);
  let workingHypothesis = null;
  if (rawResolution) {
    try {
      workingHypothesis = createWorkingPersonaHypothesis(
        rawResolution,
        agents.map((agent) => agent.id),
        decision,
        goal
      );
    } catch {
      // Invalid or unauthorised research output must not be persisted as a persona preview.
    }
  }
  const inferredScope = buildClarificationScope(goal, decision, workingHypothesis);
  const clarificationScope = {
    ...inferredScope,
    scope_hash: customerScopeHash(decision?.decision_id, inferredScope),
  };
  const current = await loadGoal(admin, goal.id);
  const currentIntelligence = current.data?.axwise_customer_intelligence || {};
  const sourceResearchRun = clarificationSourceResearchRun(
    currentIntelligence,
    decision,
    sourceResearch
  );
  const transitioned = await updateGoalForActiveGeneration(admin, goal.id, expectedGeneration, {
    status: 'awaiting_po_input',
    data: {
      ...(current.data || {}),
      // AxWise already produced a working scope. This gate confirms that one
      // scope; it is not a second interview and must not manufacture three
      // mandatory Product Owner questions. Preserve any genuine Expert PO Q&A
      // as audit/history, but keep it out of this clarification contract.
      po_questions: current.data?.po_questions || [],
      po_answers: current.data?.po_answers || null,
      axwise_customer_intelligence: {
        ...currentIntelligence,
        version: 'orqaly_customer_intelligence_v2',
        status: 'human_clarification',
        decision_id: decision?.decision_id || null,
        parent_decision_id: decision?.parent_decision_id || null,
        routing_mode: 'human_clarification',
        routing_assessment: decision?.routing_assessment || null,
        ...scopeContract,
        clarification_kind: clarificationKind,
        clarification_code: clarificationCode,
        // A completed/failed research job is historical once its provider
        // decision asks for human scope. Keeping it active would make the
        // accepted confirmation poll or refresh the same terminal run again.
        // Preserve its identity for audit, then force a fresh provider
        // routing decision after the owner confirms the scope.
        clarification_source_research_run: sourceResearchRun,
        completed_research_iterations: sourceResearchRun?.job_id
          ? Math.max(1, Number(currentIntelligence.completed_research_iterations || 0))
          : Number(currentIntelligence.completed_research_iterations || 0),
        job_id: null,
        generation: null,
        request_id: null,
        request_hash: null,
        requested_at: null,
        current_stage: null,
        progress_percentage: 0,
        elapsed_ms: 0,
        stage_durations_ms: {},
        stage_trace: [],
        last_poll_error: null,
        clarification_questions: [],
        clarification_scope: clarificationScope,
        // A confirmation is valid only for the decision and scope hash it
        // accepted. A new provider clarification must never inherit it.
        scope_confirmation: null,
        owner_clarification: null,
        reason,
        persona_resolution: null,
        working_hypothesis: workingHypothesis,
        updated_at: new Date().toISOString(),
      },
    },
  });
  if (!transitioned) return staleGenerationResult(goal);
  await logGoalEvent(admin, goal.id, 'axwise_customer_intelligence_clarification', {
    decision_id: decision?.decision_id || null,
    reason,
    scope_summary: clarificationScope.summary,
    target_customer: clarificationScope.target_customer,
    desired_outcome: clarificationScope.desired_outcome,
    trust_status: clarificationScope.trust.status,
    clarification_kind: clarificationKind,
    clarification_code: clarificationCode,
    working_hypothesis_available: Boolean(workingHypothesis),
    source_research_decision_id: sourceResearchRun?.decision_id || null,
    source_research_job_id: sourceResearchRun?.job_id || null,
  });
  return {
    type: 'orchestrate-goal',
    action: 'customer-intelligence',
    goalId: goal.id,
    status: 'awaiting_po_input',
    decisionId: decision?.decision_id || null,
  };
}

function scopeText(value, maximum = 4000) {
  if (Array.isArray(value)) {
    return value
      .map((item) => scopeText(item, maximum))
      .filter(Boolean)
      .join('; ')
      .slice(0, maximum);
  }
  if (value && typeof value === 'object') {
    return scopeText(value.value || value.name || value.label || '', maximum);
  }
  return String(value || '')
    .trim()
    .slice(0, maximum);
}

function scopeList(value, maximum = 25) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(values.map((item) => scopeText(item, 1000)).filter(Boolean))].slice(
    0,
    maximum
  );
}

function buildClarificationScope(goal, decision, workingHypothesis = null) {
  const snapshot = decision?.input_snapshot || {};
  const task = snapshot.task || {};
  const brief = snapshot.research_brief || {};
  const hypothesisPersona = workingHypothesis?.persona_resolution?.customer_persona || {};
  const hypothesisProfile = hypothesisPersona.profile || {};
  const targetCustomer =
    scopeList(task.stakeholders, 1)[0] ||
    scopeText(brief.target_stakeholders, 2000) ||
    scopeText(goal.tech_doc?.target_audience, 2000) ||
    scopeText(hypothesisPersona.name, 2000) ||
    'Affected customer or stakeholder (inferred, not yet verified)';
  const businessIdea =
    scopeText(brief.business_idea, 4000) ||
    scopeText(task.objective, 4000) ||
    scopeText(goal.title, 4000);
  const problem =
    scopeText(brief.problem, 4000) ||
    scopeText(goal.tech_doc?.problem_statement, 4000) ||
    scopeText(hypothesisProfile.problem, 4000) ||
    scopeText(goal.description, 4000) ||
    scopeText(goal.title, 4000);
  const desiredOutcome =
    scopeText(task.desired_outcome, 4000) ||
    scopeText(goal.tech_doc?.success_tiers?.target, 4000) ||
    scopeText(goal.tech_doc?.success_criteria, 4000) ||
    scopeText(hypothesisProfile.desired_outcome, 4000) ||
    businessIdea;
  const constraints = scopeList(
    task.constraints?.length ? task.constraints : goal.tech_doc?.constraints,
    25
  );
  const evidence = (Array.isArray(decision?.evidence) ? decision.evidence : [])
    .slice(0, 25)
    .map((item) => ({
      reference_id: scopeText(item?.reference_id, 255) || null,
      provenance: scopeText(item?.provenance, 120) || null,
      verified: item?.verified === true,
      verification_source: scopeText(item?.verification_source, 255) || null,
      quality: Number.isFinite(Number(item?.quality)) ? Number(item.quality) : null,
    }));
  const routingReasons = scopeList(
    decision?.routing_assessment?.reasons ||
      decision?.routing_assessment?.reason ||
      decision?.routing_reasons ||
      decision?.reason,
    10
  );
  const summary = [
    `Requested work: ${businessIdea}.`,
    `Intended audience or stakeholder: ${targetCustomer}.`,
    problem ? `Problem or opportunity: ${problem}.` : '',
    desiredOutcome ? `Intended outcome: ${desiredOutcome}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 8000);

  return {
    version: 'orqaly_axwise_scope_confirmation_v1',
    source: 'axwise_decision_input_snapshot',
    business_idea: businessIdea,
    target_customer: targetCustomer,
    problem,
    desired_outcome: desiredOutcome,
    industry:
      scopeText(brief.industry, 500) ||
      scopeText(task.domain, 500) ||
      scopeText(goal.parsed_category, 500) ||
      'general_operations',
    location: scopeText(brief.location, 500) || null,
    constraints,
    evidence,
    routing_reasons: routingReasons,
    summary,
    trust: {
      status: 'declared_inferred_unverified',
      verified: false,
      evidence_count: evidence.length,
      verified_evidence_count: evidence.filter((item) => item.verified).length,
    },
  };
}

async function leavePendingForRetry(admin, goal, existing, error, expectedGeneration = null) {
  const transitioned = await persistState(
    admin,
    goal,
    {
      status: existing.status || 'running',
      last_poll_error: error.message,
    },
    'researching_customer',
    expectedGeneration
  );
  if (!transitioned) return staleGenerationResult(goal);
  return {
    type: 'orchestrate-goal',
    action: 'customer-intelligence',
    goalId: goal.id,
    status: 'retry_pending',
    decisionId: existing.decision_id || null,
    jobId: existing.job_id || null,
  };
}

function confirmedScopeDispatchErrorIsNonRetryable(error) {
  if (error?.nonRetryable === true) return true;
  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.status || 0);
  if (/(UPSTREAM_DECISION|IDEMPOTENCY|CONTRACT|INVALID_REQUEST)/.test(code)) return true;
  return status >= 400 && status < 500 && ![408, 429].includes(status);
}

function localProviderContractError(message, code) {
  return Object.assign(new Error(message), {
    code,
    nonRetryable: true,
  });
}

async function leaveConfirmedScopePendingForRetry(
  admin,
  goal,
  existing,
  error,
  expectedGeneration
) {
  const current = await loadGoal(admin, goal.id);
  const currentIntelligence = current.data?.axwise_customer_intelligence || {};
  const lastDispatchError = String(error?.message || error || 'AxWise routing failed').slice(
    0,
    500
  );
  const transitioned = await updateGoalForActiveGeneration(admin, goal.id, expectedGeneration, {
    status: 'researching_customer',
    data: {
      ...(current.data || {}),
      axwise_customer_intelligence: {
        ...currentIntelligence,
        status: 'scope_confirmed',
        job_id: null,
        request_id: null,
        request_hash: null,
        last_dispatch_error: lastDispatchError,
        updated_at: new Date().toISOString(),
      },
    },
  });
  if (!transitioned) return staleGenerationResult(goal);
  await logGoalEvent(admin, goal.id, 'axwise_confirmed_scope_dispatch_retry', {
    decision_id: existing.decision_id || null,
    source_scope_hash: existing.scope_confirmation?.source_scope_hash || null,
    error_code: error?.code || null,
    error: String(error?.message || error || '').slice(0, 500),
  });
  return {
    type: 'orchestrate-goal',
    action: 'customer-intelligence',
    goalId: goal.id,
    status: 'retry_pending',
    reason: 'confirmed_scope_dispatch_failed',
    decisionId: existing.decision_id || null,
  };
}

async function pauseConfirmedScopeDispatchFailure(
  admin,
  goal,
  existing,
  error,
  expectedGeneration
) {
  const current = await loadGoal(admin, goal.id);
  const currentIntelligence = current.data?.axwise_customer_intelligence || {};
  const boundedError = String(error?.message || error || 'AxWise routing failed').slice(0, 500);
  const transitioned = await updateGoalForActiveGeneration(admin, goal.id, expectedGeneration, {
    status: 'needs_human',
    data: {
      ...(current.data || {}),
      failure_code: 'axwise_confirmed_scope_dispatch_failed',
      failure_reason: boundedError,
      axwise_customer_intelligence: {
        ...currentIntelligence,
        status: 'provider_contract_failed',
        clarification_kind: 'hard_block',
        clarification_code: 'provider_contract_invalid',
        job_id: null,
        request_id: null,
        request_hash: null,
        last_dispatch_error: boundedError,
        error_code: error?.code || null,
        http_status: Number(error?.status || 0) || null,
        // Preserve the accepted hash-bound scope for diagnosis/retry. This
        // failure cannot turn it into executable customer context.
        scope_confirmation: currentIntelligence.scope_confirmation,
        persona_resolution: null,
        updated_at: new Date().toISOString(),
      },
    },
  });
  if (!transitioned) return staleGenerationResult(goal);
  await logGoalEvent(admin, goal.id, 'axwise_confirmed_scope_dispatch_blocked', {
    decision_id: existing.decision_id || null,
    source_scope_hash: existing.scope_confirmation?.source_scope_hash || null,
    error_code: error?.code || null,
    http_status: Number(error?.status || 0) || null,
  });
  await notifyGoalEvent(admin, current, 'goal_needs_human', {
    feedback: `The confirmed scope could not be linked to AxWise: ${boundedError.slice(0, 300)}`,
  });
  return {
    type: 'orchestrate-goal',
    action: 'customer-intelligence',
    goalId: goal.id,
    status: 'needs_human',
    reason: 'provider_contract_failed',
  };
}

export async function handle(admin, payload, req) {
  const goal = await loadGoal(admin, payload.goalId);
  const expectedActiveGeneration = activeGeneration(goal);

  // A queued retry can arrive after a person pauses or cancels the goal, or
  // after another worker has already advanced it. Only the two states owned by
  // this stage may call AxWise or mutate the goal.
  if (!ELIGIBLE_GOAL_STATUSES.has(goal.status)) {
    return {
      type: 'orchestrate-goal',
      action: 'customer-intelligence',
      goalId: goal.id,
      status: 'stage_not_eligible',
      goalStatus: goal.status,
    };
  }

  // A scope correction rotates a durable generation token and binds exactly
  // one replacement job to it. An older queued job has no token (or the
  // previous token) and must not load the revised row and run as if it owned
  // the new scope. A worker that loaded before the rotation is stopped by the
  // same token in updateGoalForActiveGeneration's compare-and-set boundary.
  const activeRevisionToken = pendingScopeRevisionToken(goal);
  const payloadRevisionToken = String(payload.scope_revision_token || '').trim();
  if (
    activeRevisionToken !== undefined &&
    (!activeRevisionToken || payloadRevisionToken !== activeRevisionToken)
  ) {
    return {
      type: 'orchestrate-goal',
      action: 'customer-intelligence',
      goalId: goal.id,
      status: 'stale_scope_revision',
    };
  }

  const existing = goal.data?.axwise_customer_intelligence || {};
  const confirmedOwnerScope = ownerClarificationContext(goal);
  if (payload.research_poll === true) {
    const pollMatchesActiveRun =
      Boolean(existing.job_id) &&
      Boolean(existing.decision_id) &&
      Boolean(payload.research_job_id) &&
      Boolean(payload.research_decision_id) &&
      String(payload.research_job_id || '') === String(existing.job_id) &&
      String(payload.research_decision_id || '') === String(existing.decision_id || '');
    if (!pollMatchesActiveRun) {
      return {
        type: 'orchestrate-goal',
        action: 'customer-intelligence',
        goalId: goal.id,
        status: 'stale_research_poll',
      };
    }
  }
  const researchPolicy = requiredResearchPolicy(goal);

  if (
    goal.data?.scope_admission?.status === 'accepted' &&
    researchPolicy.grounded &&
    !researchPolicy.location
  ) {
    if (confirmedOwnerScope) {
      return pauseConfirmedScopeDispatchFailure(
        admin,
        goal,
        existing,
        localProviderContractError(
          'A research location is required for grounded customer research',
          'ORQALY_AXWISE_RESEARCH_LOCATION_MISSING'
        ),
        expectedActiveGeneration
      );
    }
    return pauseForRequiredResearch(
      admin,
      goal,
      'A research location is required for grounded customer research',
      {},
      expectedActiveGeneration
    );
  }

  if (!isAxwiseEnabled()) {
    if (confirmedOwnerScope) {
      return leaveConfirmedScopePendingForRetry(
        admin,
        goal,
        existing,
        Object.assign(new Error('AxWise is disabled by the deployment kill switch'), {
          code: 'ORQALY_AXWISE_DEPLOYMENT_DISABLED',
        }),
        expectedActiveGeneration
      );
    }
    return handleResearchFailure(
      admin,
      goal,
      'AxWise is disabled by the deployment kill switch',
      {},
      expectedActiveGeneration
    );
  }
  if (await isAxwiseUserDisabled(admin, goal.user_id)) {
    if (confirmedOwnerScope) {
      return pauseConfirmedScopeDispatchFailure(
        admin,
        goal,
        existing,
        localProviderContractError(
          'AxWise is disabled for this user',
          'ORQALY_AXWISE_USER_DISABLED'
        ),
        expectedActiveGeneration
      );
    }
    return handleResearchFailure(
      admin,
      goal,
      'AxWise is disabled for this user',
      {},
      expectedActiveGeneration
    );
  }
  if (!goal.org_id) {
    if (confirmedOwnerScope) {
      return pauseConfirmedScopeDispatchFailure(
        admin,
        goal,
        existing,
        localProviderContractError(
          'Goal has no organisation context',
          'ORQALY_AXWISE_ORGANISATION_MISSING'
        ),
        expectedActiveGeneration
      );
    }
    return handleResearchFailure(
      admin,
      goal,
      'Goal has no organisation context',
      {},
      expectedActiveGeneration
    );
  }

  const tenant = { orgId: String(goal.org_id), userId: String(goal.user_id) };
  let agents;
  try {
    agents = await loadEligibleAgents(admin, goal);
  } catch (error) {
    if (confirmedOwnerScope) {
      return leaveConfirmedScopePendingForRetry(
        admin,
        goal,
        existing,
        error,
        expectedActiveGeneration
      );
    }
    return handleResearchFailure(admin, goal, error.message, {}, expectedActiveGeneration);
  }

  const requestId = randomUUID();
  const request = buildCustomerRoutingRequest({ goal, agents });
  const requestHash = createHash('sha256')
    .update(JSON.stringify(request))
    .digest('hex')
    .slice(0, 20);

  if (existing.persona_resolution && existing.request_hash === requestHash) {
    const contextApproval = await awaitContextApproval(
      admin,
      goal,
      existing,
      expectedActiveGeneration
    );
    if (!contextApproval) return staleGenerationResult(goal);
    if (contextApproval.scope_revision_rejected) return rejectedScopeRevisionResult(goal);
    return {
      type: 'orchestrate-goal',
      action: 'customer-intelligence',
      goalId: goal.id,
      status: 'awaiting_context_approval',
      decisionId: existing.decision_id || null,
      routingMode: existing.routing_mode || null,
      approvalHash: contextApproval.snapshot_hash,
    };
  }

  // A durable provider job owns its lifecycle once dispatched. Request-shape
  // changes or rollout closure must not replace it before status/result import.
  // Explicit retries clear job_id and therefore re-enter the gated dispatch.
  if (!existing.job_id && (!existing.decision_id || existing.request_hash !== requestHash)) {
    const startedAt = Date.now();
    let decision = null;
    let callRecorded = false;
    try {
      const evidenceProfile = goal.data?.research_policy?.business_evidence_profile;
      if (
        evidenceProfile &&
        !evidenceProfileV2ExecutionEnabledForModel(evidenceProfile.economic_model)
      ) {
        throw localProviderContractError(
          'A goal-pinned business evidence profile cannot dispatch a new AxWise decision while its v2 economic model is disabled',
          'ORQALY_AXWISE_EXECUTION_CONFIG_DISABLED'
        );
      }
      decision = await createOrchestrationDecision(request, {
        idempotencyKey: `orqaly-context:${goal.id}:iteration:${Number(goal.iteration || 0)}:${requestHash}${Number(existing.retry_count || 0) > 0 ? `:retry:${Number(existing.retry_count)}` : ''}${activeRevisionToken ? `:scope-revision:${activeRevisionToken}` : ''}`,
        requestId,
      });
      if (
        !decision?.decision_id ||
        decision?.contract_version !== '1.0' ||
        String(decision?.task_id) !== String(goal.id) ||
        decision?.requires_orqaly_authorization !== true
      ) {
        throw localProviderContractError(
          'AxWise returned an invalid customer-context decision',
          'ORQALY_AXWISE_DECISION_INVALID'
        );
      }
      const decisionScopeContract = persistedAxwiseScopeContract(decision);
      if (
        request.upstream_decision_id &&
        String(decision.parent_decision_id || '') !== String(request.upstream_decision_id)
      ) {
        throw localProviderContractError(
          'AxWise returned a customer-context decision that is not linked to the accepted scope',
          'ORQALY_AXWISE_UPSTREAM_LINK_INVALID'
        );
      }
      await recordCustomerIntelligenceCall(admin, goal, request, requestId, startedAt, decision);
      callRecorded = true;

      const admissionOnlyDispatch = request.scope_research_acceptance == null;
      if (admissionOnlyDispatch) {
        if (request.scope_state?.research_contract) {
          throw localProviderContractError(
            'AxWise research contract was redispatched without explicit owner acceptance',
            'ORQALY_AXWISE_SCOPE_ACCEPTANCE_MISSING'
          );
        }
        if (decision.research_job?.job_id) {
          throw localProviderContractError(
            'AxWise started research before the typed scope was approved',
            'ORQALY_AXWISE_PREAPPROVAL_RESEARCH_STARTED'
          );
        }
        if (decision.scope_research_acceptance != null) {
          throw localProviderContractError(
            'AxWise returned a research acceptance before Orqaly authorized one',
            'ORQALY_AXWISE_PREAPPROVAL_ACCEPTANCE_INVALID'
          );
        }
        if (
          decisionScopeContract.scope_packet?.research_contract?.evidence?.mode !== 'none' &&
          !/^[a-f0-9]{64}$/.test(String(decision.research_execution_inputs_hash || ''))
        ) {
          throw localProviderContractError(
            'AxWise admission proposal omitted its exact research execution inputs hash',
            'ORQALY_AXWISE_RESEARCH_EXECUTION_INPUTS_HASH_MISSING'
          );
        }
        const contextApproval = await awaitContextApproval(
          admin,
          goal,
          {
            version: 'orqaly_customer_intelligence_v2',
            status: 'scope_proposed',
            degraded: false,
            decision_id: decision.decision_id,
            routing_mode: decision.routing_mode,
            scorer_version: decision.scorer_version || null,
            router_version: decision.router_version || null,
            routing_assessment: decision.routing_assessment || null,
            ...decisionScopeContract,
            ...(decisionScopeContract.scope_packet?.research_contract?.evidence?.mode !== 'none'
              ? {
                  research_execution_preview: buildResearchExecutionPreview({
                    proposalDecisionId: decision.decision_id,
                    scopePacket: decisionScopeContract.scope_packet,
                    executionInputsHash: decision.research_execution_inputs_hash,
                    maximumCostUsd: Number(request.research_policy?.maximum_research_cost || 0),
                    estimatedCostUsd: Number(request.research_policy?.estimated_research_cost || 0),
                    maximumLatencyMs: Number(
                      request.research_policy?.maximum_research_latency_ms || 0
                    ),
                    estimatedLatencyMs: Number(
                      request.research_policy?.estimated_research_latency_ms || 0
                    ),
                  }),
                }
              : {}),
            job_id: null,
            request_id: decision.request_id || requestId,
            request_hash: requestHash,
            requested_at: new Date().toISOString(),
            candidate_agent_ids: agents.map((agent) => String(agent.id)),
            persona_resolution: null,
            research_bundle: null,
          },
          expectedActiveGeneration
        );
        if (!contextApproval) return staleGenerationResult(goal);
        if (contextApproval.scope_revision_rejected) return rejectedScopeRevisionResult(goal);
        return {
          type: 'orchestrate-goal',
          action: 'customer-intelligence',
          goalId: goal.id,
          status: 'awaiting_context_approval',
          decisionId: decision.decision_id,
          routingMode: decision.routing_mode,
          approvalHash: contextApproval.snapshot_hash,
        };
      }

      assertScopeResearchAcceptanceEnvelope(goal, decision, {
        nestedJobKey: decision.routing_mode === 'research_assisted' ? 'research_job' : null,
        expectedJobId:
          decision.routing_mode === 'research_assisted'
            ? decision.research_job?.job_id || null
            : null,
        requireExecutionInputsHash: true,
      });
      if (
        decision.routing_mode === 'research_assisted' &&
        String(decision.research_job?.decision_id || '') !== String(decision.decision_id || '')
      ) {
        throw localProviderContractError(
          'AxWise research job is not linked to its accepted dispatch decision',
          'ORQALY_AXWISE_RESEARCH_JOB_DECISION_MISMATCH'
        );
      }

      if (
        researchPolicy.required &&
        (decision.routing_mode !== 'research_assisted' || !decision.research_job?.job_id)
      ) {
        return pauseForRequiredResearch(
          admin,
          goal,
          `AxWise did not start the required ${researchPolicy.mode} research run (routing mode: ${decision.routing_mode || 'missing'})`,
          { decision_id: decision.decision_id || null },
          expectedActiveGeneration
        );
      }

      const stakeholderResolved = Boolean(
        String(confirmedOwnerScope?.targetCustomer || goal.tech_doc?.target_audience || '').trim()
      );
      if (
        ['direct', 'evidence_assisted', 'human_controlled'].includes(decision.routing_mode) &&
        !stakeholderResolved
      ) {
        return requestClarification(
          admin,
          goal,
          decision,
          'The affected customer or stakeholder is unresolved; Orqaly will not create a goal persona from an unsupported assumption',
          {
            clarificationKind: 'customer_scope',
            clarificationCode: 'missing_stakeholder',
            expectedGeneration: expectedActiveGeneration,
          }
        );
      }
      if (['direct', 'evidence_assisted', 'human_controlled'].includes(decision.routing_mode)) {
        return advanceWithResolution(
          admin,
          goal,
          agents,
          decision,
          contextResolutionFromDecision(goal, decision, agents),
          req,
          requestHash,
          null,
          expectedActiveGeneration
        );
      }
      if (decision.routing_mode === 'human_clarification') {
        if (!isNarrowScopeClarification(goal, decision, agents)) {
          return pauseForProviderClarification(
            admin,
            goal,
            decision,
            providerClarificationReasons(decision)[0] ||
              'AxWise requires human review beyond confirming customer scope',
            {
              clarificationCode: 'provider_unspecified',
              expectedGeneration: expectedActiveGeneration,
            }
          );
        }
        return requestClarification(
          admin,
          goal,
          decision,
          'AxWise could not resolve the affected stakeholder or outcome safely from current evidence',
          {
            clarificationKind: 'customer_scope',
            clarificationCode: 'provider_scope_ambiguity',
            expectedGeneration: expectedActiveGeneration,
          }
        );
      }
      if (decision.routing_mode !== 'research_assisted' || !decision.research_job?.job_id) {
        throw localProviderContractError(
          'AxWise research-assisted decision did not contain a research job',
          'ORQALY_AXWISE_RESEARCH_JOB_MISSING'
        );
      }
      const persisted = await persistState(
        admin,
        goal,
        {
          version: 'orqaly_customer_intelligence_v2',
          status: decision.research_job.status || 'queued',
          degraded: false,
          decision_id: decision.decision_id,
          parent_decision_id: decision.parent_decision_id,
          routing_mode: decision.routing_mode,
          scorer_version: decision.scorer_version || null,
          router_version: decision.router_version || null,
          routing_assessment: decision.routing_assessment || null,
          ...decisionScopeContract,
          job_id: decision.research_job.job_id,
          request_id: decision.request_id || requestId,
          request_hash: requestHash,
          requested_at: new Date().toISOString(),
          candidate_agent_ids: agents.map((agent) => String(agent.id)),
          ...(confirmedOwnerScope
            ? {
                owner_scope_source_decision_id: confirmedOwnerScope.sourceDecisionId,
                owner_scope_source_scope_hash: confirmedOwnerScope.sourceScopeHash,
              }
            : {}),
        },
        'researching_customer',
        expectedActiveGeneration
      );
      if (!persisted) return staleGenerationResult(goal);
      await logGoalEvent(admin, goal.id, 'axwise_customer_intelligence_started', {
        decision_id: decision.decision_id,
        routing_mode: decision.routing_mode,
        job_id: decision.research_job.job_id,
        candidate_count: agents.length,
      });
      log.info(req, 'customer-intelligence.started', {
        goalId: goal.id,
        decisionId: decision.decision_id,
        jobId: decision.research_job.job_id,
        candidateCount: agents.length,
      });
      // Preview has no cron. Persist and wake the first exact poll before this
      // dispatch job exits; later polls retain the bounded delay below.
      await enqueueNextResearchPoll(
        admin,
        goal.id,
        decision.decision_id,
        decision.research_job.job_id,
        { revisionToken: activeRevisionToken, delay: false }
      );
      return {
        type: 'orchestrate-goal',
        action: 'customer-intelligence',
        goalId: goal.id,
        status: decision.research_job.status || 'queued',
        decisionId: decision.decision_id,
        routingMode: decision.routing_mode,
        jobId: decision.research_job.job_id,
      };
    } catch (error) {
      if (!callRecorded) {
        await recordCustomerIntelligenceCall(
          admin,
          goal,
          request,
          requestId,
          startedAt,
          decision,
          error
        );
      }
      log.warn(req, 'customer-intelligence.start-failed', {
        goalId: goal.id,
        error: error.message,
      });
      // A malformed semantic handoff is not optional research unavailability.
      // Falling back here would let the same invalid packet advance through a
      // thinner inferred scope, so contract failures always park visibly.
      if (
        error instanceof CompactScopeContractError ||
        String(error?.code || '').startsWith('COMPACT_SCOPE_')
      ) {
        return pauseForInvalidProviderDecision(
          admin,
          goal,
          `AxWise returned an invalid scope handoff: ${error.message}`,
          {
            received_decision_id: decision?.decision_id || null,
            contract_error_code: error.code || 'COMPACT_SCOPE_PACKET_INVALID',
          },
          {
            decision,
            expectedGeneration: expectedActiveGeneration,
          }
        );
      }
      if (confirmedOwnerScope) {
        return confirmedScopeDispatchErrorIsNonRetryable(error)
          ? pauseConfirmedScopeDispatchFailure(
              admin,
              goal,
              existing,
              error,
              expectedActiveGeneration
            )
          : leaveConfirmedScopePendingForRetry(
              admin,
              goal,
              existing,
              error,
              expectedActiveGeneration
            );
      }
      return handleResearchFailure(
        admin,
        goal,
        error.message,
        errorTelemetry(error),
        expectedActiveGeneration
      );
    }
  }

  let runStatus;
  try {
    runStatus = await getPersonaResearchStatus(existing.job_id, tenant);
    assertScopeResearchAcceptanceEnvelope(goal, runStatus, {
      expectedJobId: existing.job_id,
      requireTopJobId: true,
    });
  } catch (error) {
    log.warn(req, 'customer-intelligence.status-failed', {
      goalId: goal.id,
      jobId: existing.job_id,
      error: error.message,
    });
    if (error instanceof CompactScopeContractError) {
      return pauseForInvalidProviderDecision(
        admin,
        goal,
        `AxWise research status broke the accepted scope binding: ${error.message}`,
        {
          source_decision_id: existing.decision_id || null,
          job_id: existing.job_id || null,
          contract_error_code: error.code,
        },
        { expectedGeneration: expectedActiveGeneration }
      );
    }
    // A transient status failure is not a terminal research result. Leave the
    // stage pending so the reconciler retries with the same durable job.
    return leavePendingForRetry(admin, goal, existing, error, expectedActiveGeneration);
  }

  const status = runStatus?.status || 'running';
  if (!TERMINAL_SUCCESS.has(status) && !TERMINAL_FAILURE.has(status)) {
    const persisted = await persistState(
      admin,
      goal,
      {
        status,
        current_stage: runStatus?.stage || runStatus?.current_stage || null,
        progress_percentage: Number(runStatus?.progress_percentage || 0),
        elapsed_ms: Number(runStatus?.elapsed_ms || 0),
        stage_durations_ms: runStatus?.stage_durations_ms || {},
        stage_trace: Array.isArray(runStatus?.stage_trace) ? runStatus.stage_trace.slice(-25) : [],
        last_poll_error: null,
      },
      'researching_customer',
      expectedActiveGeneration
    );
    if (!persisted) return staleGenerationResult(goal);
    // The previous implementation returned here with no successor job. A
    // provider run that completed one second after this status check could sit
    // unnoticed until a later cron/reconciler pass. Queue the next bounded
    // poll before finishing this job; enqueueGoalAction also wakes the worker,
    // while the minute cron remains the durable fallback.
    await enqueueNextResearchPoll(admin, goal.id, existing.decision_id, existing.job_id, {
      revisionToken: activeRevisionToken,
    });
    return {
      type: 'orchestrate-goal',
      action: 'customer-intelligence',
      goalId: goal.id,
      status,
      jobId: existing.job_id,
    };
  }

  if (TERMINAL_FAILURE.has(status)) {
    const failure = boundedResearchFailure(runStatus, status, existing);
    if (researchPolicy.failClosed) {
      return pauseForRequiredResearch(
        admin,
        goal,
        failure.message,
        {
          decision_id: existing.decision_id || null,
          job_id: existing.job_id || null,
          research_failure: failure,
          current_stage: failure.stage,
        },
        expectedActiveGeneration
      );
    }
    return pauseForProviderClarification(
      admin,
      goal,
      {
        decision_id: existing.decision_id,
        routing_mode: 'human_clarification',
        routing_assessment: existing.routing_assessment,
      },
      `AxWise research ended with status ${status}; human evidence is required`,
      {
        sourceResearch: { terminalStatus: status },
        clarificationCode: 'research_terminal_failure',
        expectedGeneration: expectedActiveGeneration,
      }
    );
  }

  let refreshedDecision;
  let rawResolution;
  let researchBundlePointer = null;
  let completedResultLoaded = false;
  try {
    refreshedDecision = await refreshOrchestrationResearch(existing.decision_id, tenant, {
      idempotencyKey: `orqaly-context-refresh:${goal.id}:${existing.decision_id}:${existing.job_id}`,
      requestId: randomUUID(),
    });
    assertRefreshedScopeContractMatches(goal, refreshedDecision);
    const completed = await getPersonaResearchResult(existing.job_id, tenant);
    completedResultLoaded = true;
    assertScopeResearchAcceptanceEnvelope(goal, completed, {
      nestedJobKey: 'job',
      expectedJobId: existing.job_id,
      requireTopJobId: true,
    });
    const researchBundle = extractAxwiseResearchBundle(completed);
    if (!researchBundle && researchPolicy.failClosed) {
      throw new Error('AxWise completed run is missing the required research bundle');
    }
    if (researchBundle) {
      const imported = await importGoalResearchBundle(admin, goal, researchBundle, {
        externalRunId: existing.job_id,
      });
      researchBundlePointer = imported.pointer;
    }
    rawResolution =
      researchBundle?.persona_resolution ||
      completed?.result?.data?.persona_resolution ||
      completed?.data?.persona_resolution;
  } catch (error) {
    log.warn(req, 'customer-intelligence.result-retry', {
      goalId: goal.id,
      jobId: existing.job_id,
      error: error.message,
    });
    // Once the provider's terminal result is available, normalization and
    // persistence errors are deterministic trust-boundary failures for this
    // run. Do not poll the same invalid payload forever. Network failures
    // before that point remain retryable with the same durable job.
    if (
      error instanceof CompactScopeContractError ||
      error?.code === 'AXWISE_REFRESHED_SCOPE_CONTRACT_MISMATCH'
    ) {
      return pauseForInvalidProviderDecision(
        admin,
        goal,
        error.message,
        {
          source_decision_id: existing.decision_id || null,
          received_decision_id: refreshedDecision?.decision_id || null,
          contract_error_code: error.code,
        },
        {
          decision: refreshedDecision,
          sourceResearch: { terminalStatus: status },
          expectedGeneration: expectedActiveGeneration,
        }
      );
    }
    if (researchPolicy.failClosed && completedResultLoaded) {
      return pauseForRequiredResearch(
        admin,
        goal,
        error.message,
        {
          decision_id: existing.decision_id || null,
          job_id: existing.job_id || null,
        },
        expectedActiveGeneration
      );
    }
    return leavePendingForRetry(admin, goal, existing, error, expectedActiveGeneration);
  }

  if (
    !refreshedDecision?.decision_id ||
    refreshedDecision?.contract_version !== '1.0' ||
    String(refreshedDecision?.task_id) !== String(goal.id) ||
    refreshedDecision?.requires_orqaly_authorization !== true ||
    String(refreshedDecision?.parent_decision_id) !== String(existing.decision_id)
  ) {
    return pauseForInvalidProviderDecision(
      admin,
      goal,
      'AxWise returned an invalid or unlinked post-research context decision',
      {
        source_decision_id: existing.decision_id || null,
        received_decision_id: refreshedDecision?.decision_id || null,
        received_parent_decision_id: refreshedDecision?.parent_decision_id || null,
      },
      {
        decision: refreshedDecision,
        sourceResearch: { terminalStatus: status, researchBundlePointer },
        expectedGeneration: expectedActiveGeneration,
      }
    );
  }
  try {
    persistedAxwiseScopeContract(refreshedDecision);
  } catch (error) {
    return pauseForInvalidProviderDecision(
      admin,
      goal,
      `AxWise returned an invalid scope handoff after research: ${error.message}`,
      {
        source_decision_id: existing.decision_id || null,
        received_decision_id: refreshedDecision?.decision_id || null,
        contract_error_code: error.code || 'COMPACT_SCOPE_PACKET_INVALID',
      },
      {
        decision: refreshedDecision,
        sourceResearch: { terminalStatus: status, researchBundlePointer },
        expectedGeneration: expectedActiveGeneration,
      }
    );
  }
  if (refreshedDecision.routing_mode === 'human_clarification') {
    const sourceResearch = {
      terminalStatus: status,
      researchBundlePointer,
    };
    if (!isNarrowScopeClarification(goal, refreshedDecision, agents)) {
      return pauseForProviderClarification(
        admin,
        goal,
        refreshedDecision,
        providerClarificationReasons(refreshedDecision)[0] ||
          'AxWise requires human review beyond confirming customer scope',
        {
          sourceResearch,
          clarificationCode: 'provider_unspecified',
          expectedGeneration: expectedActiveGeneration,
        }
      );
    }
    return requestClarification(
      admin,
      goal,
      refreshedDecision,
      'Research completed without enough reliable evidence; AxWise requires clarification',
      {
        rawResolution,
        agents,
        sourceResearch,
        clarificationKind: 'customer_scope',
        clarificationCode: 'provider_scope_ambiguity',
        expectedGeneration: expectedActiveGeneration,
      }
    );
  }

  try {
    const result = await advanceWithResolution(
      admin,
      goal,
      agents,
      refreshedDecision,
      rawResolution,
      req,
      existing.request_hash || requestHash,
      researchBundlePointer,
      expectedActiveGeneration
    );
    return result;
  } catch (error) {
    log.warn(req, 'customer-intelligence.result-invalid', {
      goalId: goal.id,
      jobId: existing.job_id,
      error: error.message,
    });
    return pauseForProviderClarification(
      admin,
      goal,
      refreshedDecision,
      `AxWise research result was unusable: ${error.message}`,
      {
        sourceResearch: { terminalStatus: status, researchBundlePointer },
        clarificationCode: 'research_result_unusable',
        expectedGeneration: expectedActiveGeneration,
      }
    );
  }
}
