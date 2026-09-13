/**
 * Human gate 1: confirm AxWise's customer/problem/executor understanding.
 * Planning cannot begin until the authenticated goal owner approves the exact
 * context snapshot. Revisions and evidence requests invalidate later approval.
 */
import { createLogger } from '../../../api/_lib/logger.js';
import { randomUUID } from 'node:crypto';
import {
  enqueueGoalAction,
  loadGoal,
  logGoalEvent,
  restoreGoalIfScopeRevision,
  updateGoalIfNativeScopeBinding,
  updateGoalIfStatus,
} from '../_helpers.js';
import {
  approvedApproval,
  buildContextApprovalSnapshot,
  invalidatedApproval,
  isApprovalCurrent,
  pendingApproval,
  validateResearchExecutionPreview,
} from '../approval-audit.js';
import { verifyGoalResearchContextGate } from '../../integrations/axwise/research-contract.js';
import { selectWorkShapePlaybook, WORK_SHAPE_ROUTE_VERSION } from '../work-shape-playbooks.js';
import { isCanonicalAxwiseScopeGoal } from '../../_shared/scope-chat-intent.js';
import {
  nativeAxwiseScopeActionBinding,
  nativeAxwiseScopeActionBindingMatches,
  nativeAxwiseScopeApprovalBlock,
} from '../../_shared/native-scope-approval.js';
import {
  createScopeResearchAcceptanceBinding,
  validateNativeAxwiseDecisionContracts,
} from '../../agent-handlers/compact-agent-contracts.js';

const log = createLogger('goal-stage:context-approval');

function approvalData(goal, context, execution) {
  return {
    ...(goal.data || {}),
    goal_approvals: {
      ...(goal.data?.goal_approvals || {}),
      ...(context !== undefined ? { context } : {}),
      ...(execution !== undefined ? { execution } : {}),
    },
  };
}

export async function handle(admin, payload, req) {
  const goal = await loadGoal(admin, payload.goalId);
  const action = payload.context_action;
  const currentContext = goal.data?.goal_approvals?.context;
  const currentExecution = goal.data?.goal_approvals?.execution;
  const snapshot = buildContextApprovalSnapshot(goal);

  // Human actions are asynchronous jobs. Require the gate state again in the
  // worker so a click queued just before cancellation cannot revive the goal.
  // The no-action branch is also gate-local; customer-intelligence creates the
  // pending snapshot before this handler is ever invoked.
  if (goal.status !== 'awaiting_context_approval') {
    return {
      type: 'orchestrate-goal',
      action: 'context-approval',
      goalId: goal.id,
      status: 'not_awaiting_context_approval',
    };
  }

  const nativeScopeBinding = nativeAxwiseScopeActionBinding(goal);
  const nativeScopeProposal = Boolean(
    nativeScopeBinding && goal.data?.scope_admission?.status !== 'accepted'
  );
  let nativeHandoff = null;
  if (action === 'approve') {
    if (nativeScopeBinding) {
      try {
        const intelligence = goal.data?.axwise_customer_intelligence || {};
        nativeHandoff = validateNativeAxwiseDecisionContracts({
          scope_packet: intelligence.scope_packet,
          scope_validation: intelligence.scope_validation,
          scope_confirmation: intelligence.axwise_scope_confirmation,
          scope_contract_binding: intelligence.scope_contract_binding,
        });
        if (nativeHandoff.scope_packet.research_contract.evidence.mode === 'existing') {
          throw new Error('reserved evidence mode existing is unsupported in contract v1');
        }
      } catch {
        return {
          type: 'orchestrate-goal',
          action: 'context-approval',
          goalId: goal.id,
          status: 'blocked_native_scope',
          code: 'native_scope_not_ready',
          materialQuestion: null,
        };
      }
    }
    if (nativeScopeBinding && String(payload.approved_by || '') !== String(goal.user_id || '')) {
      return {
        type: 'orchestrate-goal',
        action: 'context-approval',
        goalId: goal.id,
        status: 'blocked_native_scope',
        code: 'native_scope_owner_mismatch',
        materialQuestion: null,
      };
    }
    const nativeScopeBlock = nativeAxwiseScopeApprovalBlock(goal);
    if (nativeScopeBlock) {
      await logGoalEvent(admin, goal.id, 'context_approval_blocked_native_scope', {
        code: nativeScopeBlock.code,
        material_question_required: Boolean(nativeScopeBlock.materialQuestion),
      });
      return {
        type: 'orchestrate-goal',
        action: 'context-approval',
        goalId: goal.id,
        status: 'blocked_native_scope',
        code: nativeScopeBlock.code,
        materialQuestion: nativeScopeBlock.materialQuestion,
      };
    }
  }
  if (
    nativeScopeBinding &&
    (currentContext?.status !== 'pending' ||
      currentContext.snapshot_hash !== pendingApproval('context', snapshot).snapshot_hash ||
      !nativeAxwiseScopeActionBindingMatches(goal, payload.native_scope_binding))
  ) {
    await logGoalEvent(admin, goal.id, 'context_approval_stale_native_scope', {
      action: action || null,
      scope_hash: nativeScopeBinding.scope_hash,
      generation: nativeScopeBinding.generation,
      context_snapshot_hash: nativeScopeBinding.context_snapshot_hash,
    });
    return {
      type: 'orchestrate-goal',
      action: 'context-approval',
      goalId: goal.id,
      status: 'stale_native_scope',
    };
  }
  const transitionGate = (updates) =>
    nativeScopeBinding
      ? updateGoalIfNativeScopeBinding(
          admin,
          goal.id,
          'awaiting_context_approval',
          nativeScopeBinding,
          updates
        )
      : updateGoalIfStatus(admin, goal.id, 'awaiting_context_approval', updates);

  if (action === 'approve') {
    // First approval accepts the immutable typed scope and its evidence policy;
    // it does not pretend the contracted evidence already exists. Research and
    // persona simulation are authorized only by this exact accepted packet.
    if (!nativeScopeProposal) {
      const researchGate = await verifyGoalResearchContextGate(admin, goal);
      if (researchGate.status !== 'ready') {
        await logGoalEvent(admin, goal.id, 'context_approval_blocked_research_quality', {
          issues: researchGate.issues || [],
          research_bundle_hash:
            goal.data?.axwise_customer_intelligence?.research_bundle?.bundle_hash || null,
        });
        return {
          type: 'orchestrate-goal',
          action: 'context-approval',
          goalId: goal.id,
          status: 'blocked_research_quality',
          issues: researchGate.issues || [],
        };
      }
    }
    if (
      currentContext?.status !== 'pending' ||
      currentContext.snapshot_hash !== pendingApproval('context', snapshot).snapshot_hash
    ) {
      const pending = pendingApproval('context', snapshot, currentContext);
      const transitioned = await transitionGate({
        status: 'awaiting_context_approval',
        data: approvalData(goal, pending, invalidatedApproval(currentExecution, 'context_changed')),
      });
      if (!transitioned) {
        return {
          type: 'orchestrate-goal',
          action: 'context-approval',
          goalId: goal.id,
          status: 'state_changed',
        };
      }
      await logGoalEvent(admin, goal.id, 'context_approval_invalidated', {
        reason: 'context_changed_before_approval',
        snapshot_hash: pending.snapshot_hash,
      });
      return {
        type: 'orchestrate-goal',
        action: 'context-approval',
        goalId: goal.id,
        status: 'stale_context',
      };
    }

    const approved = {
      ...approvedApproval('context', snapshot, payload.approved_by, currentContext),
      ...(nativeScopeProposal ? { approval_basis: 'accepted_typed_scope' } : {}),
    };
    const workShapeRoute = selectWorkShapePlaybook({
      goal,
      scopePacket: goal.data?.axwise_customer_intelligence?.scope_packet || null,
    });
    const approvedData = approvalData(
      goal,
      approved,
      invalidatedApproval(currentExecution, 'context_reapproved')
    );
    const researchNeeded = Boolean(
      nativeScopeProposal &&
      nativeHandoff?.scope_packet?.research_contract?.evidence?.mode !== 'none'
    );
    const intelligence = goal.data?.axwise_customer_intelligence || {};
    let researchAcceptance = null;
    if (researchNeeded) {
      const executionInputsHash = String(intelligence.research_execution_inputs_hash || '');
      if (!/^[a-f0-9]{64}$/.test(executionInputsHash) || !intelligence.decision_id) {
        return {
          type: 'orchestrate-goal',
          action: 'context-approval',
          goalId: goal.id,
          status: 'blocked_native_scope',
          code: 'native_scope_execution_inputs_invalid',
          materialQuestion: null,
        };
      }
      try {
        validateResearchExecutionPreview(goal, nativeHandoff.scope_packet);
      } catch {
        return {
          type: 'orchestrate-goal',
          action: 'context-approval',
          goalId: goal.id,
          status: 'blocked_native_scope',
          code: 'native_scope_execution_preview_invalid',
          materialQuestion: null,
        };
      }
      researchAcceptance = createScopeResearchAcceptanceBinding({
        version: 'orqaly_scope_research_acceptance_v1',
        org_id: String(goal.org_id),
        user_id: String(goal.user_id),
        goal_id: String(goal.id),
        proposal_decision_id: String(intelligence.decision_id),
        scope_hash: nativeHandoff.scope_packet.scope_hash,
        contract_hash: nativeHandoff.scope_packet.research_contract.contract_hash,
        execution_inputs_hash: executionInputsHash,
        acceptance_id: randomUUID(),
        accepted_at: approved.approved_at,
        accepted_by_user_id: String(goal.user_id),
      });
    }
    const approvedScopeData = nativeScopeProposal
      ? {
          ...approvedData,
          axwise_customer_intelligence: {
            ...(approvedData.axwise_customer_intelligence || {}),
            status: researchNeeded ? 'scope_confirmed' : 'scope_accepted_no_research',
            proposal_decision_id: intelligence.decision_id || null,
            job_id: null,
            research_bundle: null,
          },
        }
      : approvedData;
    const { scope_admission: _legacyScopeAdmission, ...legacyApprovedData } = approvedScopeData;
    const nextStage =
      nativeScopeProposal && researchNeeded ? 'customer-intelligence' : 'pm-planning';
    const nextStatus = nextStage === 'customer-intelligence' ? 'researching_customer' : 'planning';
    const transitioned = await transitionGate({
      status: nextStatus,
      data: nativeScopeBinding
        ? {
            ...approvedScopeData,
            work_shape_route: workShapeRoute,
            scope_admission: {
              ...Object.fromEntries(
                Object.entries(goal.data?.scope_admission || {}).filter(
                  ([key]) => key !== 'research_acceptance'
                )
              ),
              version: 1,
              native_scope: true,
              status: 'accepted',
              state_key: 'axwise_customer_intelligence',
              scope_hash: workShapeRoute.scope_hash,
              playbook_id: workShapeRoute.playbook_id,
              route_version: workShapeRoute.version,
              accepted_at: approved.approved_at,
              requires_authorization: workShapeRoute.requires_authorization,
              maximum_side_effect: workShapeRoute.maximum_side_effect,
              grants_authorization: false,
              ...(researchAcceptance ? { research_acceptance: researchAcceptance } : {}),
              updated_at: approved.approved_at,
            },
          }
        : {
            ...legacyApprovedData,
            work_shape_route: workShapeRoute,
          },
    });
    if (!transitioned) {
      return {
        type: 'orchestrate-goal',
        action: 'context-approval',
        goalId: goal.id,
        status: 'state_changed',
      };
    }
    await logGoalEvent(admin, goal.id, 'context_approved', {
      approved_by: payload.approved_by || null,
      approved_at: approved.approved_at,
      snapshot_hash: approved.snapshot_hash,
      decision_id: goal.data?.axwise_customer_intelligence?.decision_id || null,
      playbook_id: workShapeRoute.playbook_id,
      route_source: workShapeRoute.source,
      requires_authorization: workShapeRoute.requires_authorization,
      maximum_side_effect: workShapeRoute.maximum_side_effect,
      next_stage: nextStage,
    });
    await enqueueGoalAction(admin, nextStage, goal.id);
    log.info(req, 'context-approval.approved', { goalId: goal.id });
    return {
      type: 'orchestrate-goal',
      action: 'context-approval',
      goalId: goal.id,
      status: 'approved',
      playbookId: workShapeRoute.playbook_id,
      nextAction: nextStage,
    };
  }

  if (action === 'revise' || action === 'request-evidence') {
    const feedback = String(payload.feedback || '')
      .trim()
      .slice(0, 4000);
    const intelligence = goal.data?.axwise_customer_intelligence || {};
    const revisionRequested = action === 'revise';
    const canonicalScopeRevision = revisionRequested && isCanonicalAxwiseScopeGoal(goal);
    const canonicalEvidenceRefresh =
      action === 'request-evidence' && isCanonicalAxwiseScopeGoal(goal);
    const canonicalNativeRestart = canonicalScopeRevision || canonicalEvidenceRefresh;
    const revisionToken = canonicalNativeRestart ? randomUUID() : null;
    const revisedAt = new Date().toISOString();
    const previousNativeScope = intelligence.scope_packet?.scope_hash
      ? {
          version: 'orqaly_previous_native_scope_contract_v1',
          packet_version: intelligence.scope_packet.version || null,
          scope_ref: intelligence.scope_packet.scope_ref || null,
          scope_hash: intelligence.scope_packet.scope_hash,
          confirmation_scope_hash: intelligence.axwise_scope_confirmation?.scope_hash || null,
          generation: intelligence.generation ?? null,
          scope_updated_at: intelligence.updated_at || null,
          context_snapshot_hash: currentContext.snapshot_hash || null,
          scope_packet: intelligence.scope_packet,
          scope_validation: intelligence.scope_validation || null,
          scope_confirmation: intelligence.axwise_scope_confirmation || null,
          scope_contract_binding: intelligence.scope_contract_binding || null,
          revised_at: revisedAt,
        }
      : intelligence.previous_scope_contract || null;
    const request = {
      feedback,
      requested_by: payload.approved_by || null,
      requested_at: revisedAt,
    };
    const nextIntelligence = {
      ...intelligence,
      status: action === 'request-evidence' ? 'evidence_requested' : 'revision_requested',
      decision_id: null,
      request_hash: null,
      persona_resolution: null,
      working_hypothesis: null,
      ...(canonicalNativeRestart
        ? {
            parent_decision_id: null,
            job_id: null,
            generation: null,
            request_id: null,
            requested_at: null,
            current_stage: null,
            progress_percentage: 0,
            elapsed_ms: 0,
            stage_durations_ms: {},
            stage_trace: [],
            last_poll_error: null,
            routing_mode: null,
            scorer_version: null,
            router_version: null,
            routing_assessment: null,
            candidate_agent_ids: [],
            completed_at: null,
            completed_research_iterations: 0,
            clarification_source_research_run: null,
            research_bundle: null,
            research_bundle_summary: null,
            research_bundle_full: null,
            research_failure: null,
            retry_count: 0,
            retry_of_decision_id: null,
            retry_of_job_id: null,
            retried_at: null,
          }
        : {}),
      ...(canonicalNativeRestart
        ? {
            previous_scope_contract: previousNativeScope,
            scope_packet: null,
            scope_validation: null,
            quality_contract: null,
            axwise_scope_confirmation: null,
            scope_contract_binding: null,
            research_execution_inputs_hash: null,
            proposal_decision_id: null,
            axwise_scope_handoff: null,
          }
        : {}),
      ...(action === 'request-evidence' ? { user_research_request: request } : {}),
    };
    const revisedData = {
      ...approvalData(
        goal,
        invalidatedApproval(currentContext, action),
        invalidatedApproval(currentExecution, action)
      ),
      axwise_customer_intelligence: nextIntelligence,
      work_shape_route: null,
      ...(canonicalNativeRestart ? { context_revision_feedback: feedback } : {}),
    };
    const {
      scope_admission: _legacyAdmission,
      scope_revision: _legacyRevision,
      ...legacyRevisedData
    } = revisedData;
    const transitioned = await transitionGate({
      status: action === 'request-evidence' ? 'researching_customer' : 'analyzing',
      data: canonicalNativeRestart
        ? {
            ...revisedData,
            scope_admission: {
              version: 1,
              native_scope: true,
              status: action === 'request-evidence' ? 'evidence_requested' : 'revision_requested',
              state_key: 'axwise_customer_intelligence',
              scope_hash: null,
              playbook_id: null,
              route_version: goal.data?.scope_admission?.route_version || WORK_SHAPE_ROUTE_VERSION,
              accepted_at: null,
              requires_authorization: false,
              maximum_side_effect: 'none',
              grants_authorization: false,
              updated_at: new Date().toISOString(),
            },
            scope_revision: {
              version: 'orqaly_scope_revision_v1',
              status: 'pending_rebuild',
              base_kind: previousNativeScope
                ? 'accepted_native_scope'
                : 'preliminary_scope_proposal',
              revision_token: revisionToken,
              kind: canonicalEvidenceRefresh ? 'evidence_refresh' : 'scope_correction',
              desired_outcome: feedback,
              source_decision_id: intelligence.decision_id || null,
              source_scope_hash: intelligence.scope_packet?.scope_hash || null,
              source_generation: intelligence.generation ?? null,
              source_job_id: intelligence.job_id || null,
              requested_by: payload.approved_by || null,
              requested_at: revisedAt,
            },
          }
        : legacyRevisedData,
    });
    if (!transitioned) {
      return {
        type: 'orchestrate-goal',
        action: 'context-approval',
        goalId: goal.id,
        status: 'state_changed',
      };
    }
    await logGoalEvent(admin, goal.id, 'context_revision_requested', {
      kind: action,
      feedback,
      requested_by: payload.approved_by || null,
    });
    const revisionAction = canonicalScopeRevision ? 'scope-admission' : 'po-analysis';
    try {
      await enqueueGoalAction(
        admin,
        action === 'request-evidence' ? 'customer-intelligence' : revisionAction,
        goal.id,
        feedback
          ? {
              revision_feedback: feedback,
              ...(canonicalNativeRestart ? { scope_revision_token: revisionToken } : {}),
            }
          : {}
      );
    } catch (error) {
      if (canonicalNativeRestart) {
        const restored = await restoreGoalIfScopeRevision(
          admin,
          goal.id,
          canonicalEvidenceRefresh ? 'researching_customer' : 'analyzing',
          revisionToken,
          { status: goal.status, data: goal.data },
          canonicalEvidenceRefresh ? 'evidence_requested' : 'revision_requested'
        );
        await logGoalEvent(admin, goal.id, 'context_revision_enqueue_failed', {
          revision_token: revisionToken,
          restored,
          error: error?.message || 'scope-admission enqueue failed',
        });
      }
      throw error;
    }
    return {
      type: 'orchestrate-goal',
      action: 'context-approval',
      goalId: goal.id,
      status: action,
    };
  }

  if (isApprovalCurrent('context', snapshot, currentContext)) {
    return {
      type: 'orchestrate-goal',
      action: 'context-approval',
      goalId: goal.id,
      status: 'approved',
    };
  }
  const pending = pendingApproval('context', snapshot, currentContext);
  const transitioned = await transitionGate({
    status: 'awaiting_context_approval',
    data: approvalData(goal, pending, invalidatedApproval(currentExecution, 'context_pending')),
  });
  if (!transitioned) {
    return {
      type: 'orchestrate-goal',
      action: 'context-approval',
      goalId: goal.id,
      status: 'state_changed',
    };
  }
  return {
    type: 'orchestrate-goal',
    action: 'context-approval',
    goalId: goal.id,
    status: 'awaiting_context_approval',
  };
}
