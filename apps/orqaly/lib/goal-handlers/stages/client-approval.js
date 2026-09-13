/**
 * Human gate 2: approve the final execution proposal.
 *
 * This gate is mandatory in both simple and advanced modes. Approval is tied
 * to the exact context, plan, team, tools, AxWise decision, budget and proposal
 * snapshot; any material change requires a fresh sign-off.
 */
import { createLogger } from '../../../api/_lib/logger.js';
import {
  enqueueGoalAction,
  finishGoalExecutionApprovalAttempt,
  loadGoal,
  logGoalEvent,
  notifyGoalEvent,
  reserveGoalExecutionApproval,
  updateGoalIfStatus,
  updateGoalIfNativeScopeBinding,
} from '../_helpers.js';
import {
  approvedApproval,
  buildContextApprovalSnapshot,
  buildExecutionApprovalSnapshot,
  invalidatedApproval,
  isApprovalCurrent,
  pendingApproval,
} from '../approval-audit.js';
import {
  loadExecutionAuthorizationManifest,
  stampTaskExecutionAuthorization,
} from '../execution-authorization.js';
import { autoApprovalAllowed, autoApprovalMarker, withAutoApprovalCount } from '../hitl-policy.js';
import {
  acceptedNativePlanningActionBinding,
  resolveAcceptedNativeGoalAuthority,
} from '../../_shared/native-goal-authority.js';
import { invalidateNativeExecutionForCanonicalReplan } from '../native-legacy-dispatch.js';
import { randomUUID } from 'node:crypto';

const log = createLogger('goal-stage:client-approval');
const CLIENT_GATE_PREPARATION_STATUSES = new Set([
  'estimating',
  'awaiting_tools',
  'awaiting_approval',
]);

function stateChangedResult(goal) {
  return {
    type: 'orchestrate-goal',
    action: 'client-approval',
    goalId: goal.id,
    status: 'state_changed',
  };
}

function withApprovals(goal, patch) {
  return {
    ...(goal.data || {}),
    goal_approvals: { ...(goal.data?.goal_approvals || {}), ...patch },
  };
}

function withExecutionAuthorization(goal, manifest, status, snapshotHash = null, extra = {}) {
  return {
    ...(goal.data || {}),
    execution_authorization: {
      status,
      snapshot_hash: snapshotHash,
      manifest,
      ...extra,
    },
  };
}

function authorizationPauseStatus(manifest) {
  return manifest?.issues?.some((issue) => issue.code.startsWith('task_tool_'))
    ? 'awaiting_tools'
    : 'awaiting_approval';
}

function nextExecutionPhaseIndex(goal) {
  const phases = Array.isArray(goal?.plan?.phases) ? goal.plan.phases : [];
  const index = phases.findIndex(
    (phase) => !['completed', 'skipped'].includes(String(phase?.status || '').toLowerCase())
  );
  return index === -1 ? phases.length : index;
}

async function loadAuthorizationOrPause(admin, goal, expectedStatus) {
  try {
    const manifest = await loadExecutionAuthorizationManifest(admin, goal);
    if (manifest.valid) return { manifest };
    const status = authorizationPauseStatus(manifest);
    const transitioned = await updateGoalIfStatus(admin, goal.id, expectedStatus, {
      status,
      data: withExecutionAuthorization(goal, manifest, 'invalid'),
    });
    if (!transitioned) return { manifest, status: 'state_changed', stateChanged: true };
    await logGoalEvent(admin, goal.id, 'execution_authorization_incomplete', {
      issues: manifest.issues,
    });
    return { manifest, status };
  } catch (error) {
    const transitioned = await updateGoalIfStatus(admin, goal.id, expectedStatus, {
      status: 'awaiting_approval',
      data: {
        ...(goal.data || {}),
        execution_authorization: {
          status: 'inspection_failed',
          snapshot_hash: null,
          manifest: null,
          error: String(error.message || error).slice(0, 500),
        },
      },
    });
    if (!transitioned) {
      return { manifest: null, status: 'state_changed', stateChanged: true };
    }
    await logGoalEvent(admin, goal.id, 'execution_authorization_inspection_failed', {
      error: String(error.message || error).slice(0, 500),
    });
    return { manifest: null, status: 'awaiting_approval' };
  }
}

export async function handle(admin, payload, req) {
  const goal = await loadGoal(admin, payload.goalId);

  if (payload.approval_action) {
    if (goal.status !== 'awaiting_approval') {
      return {
        type: 'orchestrate-goal',
        action: 'client-approval',
        goalId: goal.id,
        status: 'not_awaiting_approval',
      };
    }
    return handleApprovalAction(admin, goal, payload, req);
  }

  if (!CLIENT_GATE_PREPARATION_STATUSES.has(goal.status)) {
    return {
      type: 'orchestrate-goal',
      action: 'client-approval',
      goalId: goal.id,
      status: 'not_ready_for_approval',
    };
  }
  const expectedStatus = goal.status;

  const contextSnapshot = buildContextApprovalSnapshot(goal);
  const contextApproval = goal.data?.goal_approvals?.context;
  if (!isApprovalCurrent('context', contextSnapshot, contextApproval)) {
    const pendingContext = pendingApproval('context', contextSnapshot, contextApproval);
    const transitioned = await updateGoalIfStatus(admin, goal.id, expectedStatus, {
      status: 'awaiting_context_approval',
      data: withApprovals(goal, {
        context: pendingContext,
        execution: invalidatedApproval(
          goal.data?.goal_approvals?.execution,
          'context_approval_missing_or_stale'
        ),
      }),
    });
    if (!transitioned) return stateChangedResult(goal);
    await logGoalEvent(admin, goal.id, 'context_approval_required', {
      reason: 'Final proposal cannot be approved against stale customer context',
      snapshot_hash: pendingContext.snapshot_hash,
    });
    return {
      type: 'orchestrate-goal',
      action: 'client-approval',
      goalId: goal.id,
      status: 'awaiting_context_approval',
    };
  }

  const authorization = await loadAuthorizationOrPause(admin, goal, expectedStatus);
  if (authorization.stateChanged) return stateChangedResult(goal);
  if (!authorization.manifest?.valid) {
    return {
      type: 'orchestrate-goal',
      action: 'client-approval',
      goalId: goal.id,
      status: 'authorization_incomplete',
      goalStatus: authorization.status,
      issues: authorization.manifest?.issues || [],
    };
  }
  const goalWithAuthorization = {
    ...goal,
    data: withExecutionAuthorization(goal, authorization.manifest, 'pending'),
  };
  const snapshot = buildExecutionApprovalSnapshot(goalWithAuthorization, authorization.manifest);
  const current = goal.data?.goal_approvals?.execution;
  if (
    isApprovalCurrent('execution', snapshot, current) &&
    goal.data?.execution_authorization?.status === 'approved' &&
    goal.data.execution_authorization.snapshot_hash === current.snapshot_hash
  ) {
    return {
      type: 'orchestrate-goal',
      action: 'client-approval',
      goalId: goal.id,
      status: 'approved',
    };
  }
  const pending = pendingApproval('execution', snapshot, current);
  // Decided before the write so the counter bump lands in the same CAS update.
  const autoApprove = autoApprovalAllowed(goal, 'execution');
  const gateData = {
    ...withExecutionAuthorization(goal, authorization.manifest, 'pending', pending.snapshot_hash),
    goal_approvals: {
      ...(goal.data?.goal_approvals || {}),
      execution: pending,
    },
  };
  const transitioned = await updateGoalIfStatus(admin, goal.id, expectedStatus, {
    status: 'awaiting_approval',
    data: autoApprove ? withAutoApprovalCount(gateData, 'execution') : gateData,
  });
  if (!transitioned) return stateChangedResult(goal);

  await logGoalEvent(admin, goal.id, 'awaiting_approval', {
    proposal_cost: goal.proposal?.total_cost?.total,
    proposal_time: goal.proposal?.estimates?.total_estimated_time_minutes,
    snapshot_hash: pending.snapshot_hash,
    context_approval_hash: contextApproval.snapshot_hash,
  });

  if (autoApprove) {
    // Unattended goals do not skip this gate. awaiting_approval is written
    // durably above, so a lost job parks the goal instead of silently running
    // it. Re-entering the handler keeps loadAuthorizationOrPause and
    // stampTaskExecutionAuthorization in the path: an invalid manifest still
    // fails closed. Enqueue only from this entry branch — never from
    // handleApprovalAction, whose stale_proposal path would otherwise
    // re-trigger itself forever.
    await logGoalEvent(admin, goal.id, 'execution_auto_approved', {
      policy: 'hitl_unattended',
      snapshot_hash: pending.snapshot_hash,
      proposal_cost: goal.proposal?.total_cost?.total,
    });
    await enqueueGoalAction(admin, 'client-approval', goal.id, {
      approval_action: 'approve',
      approved_by: goal.user_id,
      auto_approval: autoApprovalMarker(pending.snapshot_hash),
    });
    return {
      type: 'orchestrate-goal',
      action: 'client-approval',
      goalId: goal.id,
      status: 'awaiting_approval',
      approvalHash: pending.snapshot_hash,
      autoApproving: true,
    };
  }

  await notifyGoalEvent(admin, goal, 'proposal_ready', {
    feedback: `Proposal ready: ${goal.plan?.phases?.length || 0} phases, estimated $${(
      goal.proposal?.total_cost?.total || 0
    ).toFixed(
      2
    )}, ~${goal.proposal?.estimates?.total_estimated_time_minutes || '?'} minutes. Review and approve to start.`,
  });

  return {
    type: 'orchestrate-goal',
    action: 'client-approval',
    goalId: goal.id,
    status: 'awaiting_approval',
    approvalHash: pending.snapshot_hash,
  };
}

async function handleApprovalAction(admin, goal, payload, req) {
  const action = payload.approval_action;
  const approvals = goal.data?.goal_approvals || {};

  if (action === 'approve') {
    const contextSnapshot = buildContextApprovalSnapshot(goal);
    if (!isApprovalCurrent('context', contextSnapshot, approvals.context)) {
      const pendingContext = pendingApproval('context', contextSnapshot, approvals.context);
      const transitioned = await updateGoalIfStatus(admin, goal.id, 'awaiting_approval', {
        status: 'awaiting_context_approval',
        data: withApprovals(goal, {
          context: pendingContext,
          execution: invalidatedApproval(approvals.execution, 'context_changed'),
        }),
      });
      if (!transitioned) return stateChangedResult(goal);
      return {
        type: 'orchestrate-goal',
        action: 'client-approval',
        goalId: goal.id,
        status: 'stale_context',
      };
    }

    const authorization = await loadAuthorizationOrPause(admin, goal, 'awaiting_approval');
    if (authorization.stateChanged) return stateChangedResult(goal);
    if (!authorization.manifest?.valid) {
      return {
        type: 'orchestrate-goal',
        action: 'client-approval',
        goalId: goal.id,
        status: 'authorization_incomplete',
        goalStatus: authorization.status,
        issues: authorization.manifest?.issues || [],
      };
    }
    const goalWithAuthorization = {
      ...goal,
      data: withExecutionAuthorization(goal, authorization.manifest, 'pending'),
    };
    const snapshot = buildExecutionApprovalSnapshot(goalWithAuthorization, authorization.manifest);
    if (
      approvals.execution?.status !== 'pending' ||
      approvals.execution.snapshot_hash !== pendingApproval('execution', snapshot).snapshot_hash
    ) {
      const pending = pendingApproval('execution', snapshot, approvals.execution);
      const transitioned = await updateGoalIfStatus(admin, goal.id, 'awaiting_approval', {
        status: 'awaiting_approval',
        data: {
          ...withExecutionAuthorization(
            goal,
            authorization.manifest,
            'pending',
            pending.snapshot_hash
          ),
          goal_approvals: {
            ...(goal.data?.goal_approvals || {}),
            execution: pending,
          },
        },
      });
      if (!transitioned) return stateChangedResult(goal);
      await logGoalEvent(admin, goal.id, 'execution_approval_invalidated', {
        reason: 'proposal_changed_before_approval',
        snapshot_hash: pending.snapshot_hash,
      });
      return {
        type: 'orchestrate-goal',
        action: 'client-approval',
        goalId: goal.id,
        status: 'stale_proposal',
      };
    }

    const nativeAuthority = resolveAcceptedNativeGoalAuthority(goal);
    const nativeBinding = nativeAuthority.native
      ? acceptedNativePlanningActionBinding(goal, nativeAuthority)
      : null;
    if (nativeAuthority.native && (!nativeAuthority.ready || !nativeBinding)) {
      return {
        type: 'orchestrate-goal',
        action: 'client-approval',
        goalId: goal.id,
        status: 'native_scope_not_ready',
        reasons: nativeAuthority.reasons,
      };
    }

    const approved = approvedApproval(
      'execution',
      snapshot,
      payload.approved_by,
      approvals.execution
    );
    const approvalAttemptToken = randomUUID();
    const approvalAttemptStartedAt = new Date().toISOString();
    const reserved = await reserveGoalExecutionApproval(admin, goal, {
      snapshotHash: approvals.execution.snapshot_hash,
      attemptToken: approvalAttemptToken,
      startedAt: approvalAttemptStartedAt,
      nativeBinding,
    });
    if (!reserved) return stateChangedResult(goal);
    try {
      await stampTaskExecutionAuthorization(
        admin,
        goal,
        authorization.manifest,
        approved.snapshot_hash
      );
    } catch (error) {
      await finishGoalExecutionApprovalAttempt(admin, goal.id, {
        attemptToken: approvalAttemptToken,
        snapshotHash: approvals.execution.snapshot_hash,
        updates: { status: 'awaiting_approval', data: goal.data },
      });
      await logGoalEvent(admin, goal.id, 'execution_authorization_binding_failed', {
        error: String(error.message || error).slice(0, 500),
        snapshot_hash: approved.snapshot_hash,
      });
      return {
        type: 'orchestrate-goal',
        action: 'client-approval',
        goalId: goal.id,
        status: 'authorization_binding_failed',
      };
    }
    const activated = await finishGoalExecutionApprovalAttempt(admin, goal.id, {
      attemptToken: approvalAttemptToken,
      snapshotHash: approvals.execution.snapshot_hash,
      updates: {
        status: 'active',
        data: {
          ...withExecutionAuthorization(
            goal,
            authorization.manifest,
            'approved',
            approved.snapshot_hash,
            { approved_at: approved.approved_at, approved_by: approved.approved_by }
          ),
          goal_approvals: {
            ...(goal.data?.goal_approvals || {}),
            execution: approved,
          },
        },
      },
    });
    if (!activated) return stateChangedResult(goal);
    await logGoalEvent(admin, goal.id, 'goal_active', {
      approval: 'approved',
      approved_by: payload.approved_by || null,
      approved_at: approved.approved_at,
      snapshot_hash: approved.snapshot_hash,
      axwise_decision_id: goal.data?.axwise_orchestration?.decision_id || null,
    });
    // Start only the effects the user approved in the signed manifest. Goal
    // text is not an authorization source: in particular, no-tools landing
    // pages have an empty system-enrichment list and must execute directly.
    if (
      authorization.manifest.system_enrichments?.some(
        (enrichment) => enrichment.id === 'brand-seed'
      )
    ) {
      await enqueueGoalAction(admin, 'brand-seed', goal.id);
    } else {
      await enqueueGoalAction(admin, 'execute-phase', goal.id, {
        phaseIndex: nextExecutionPhaseIndex(goal),
      });
    }
    log.info(req, 'client-approval.approved', { goalId: goal.id });
    return {
      type: 'orchestrate-goal',
      action: 'client-approval',
      goalId: goal.id,
      status: 'approved',
    };
  }

  if (action === 'request-changes') {
    const feedback = String(payload.feedback || 'User requested changes.')
      .trim()
      .slice(0, 4000);
    const revisionCount = (goal.data?.revision_count || 0) + 1;

    if (revisionCount > 3) {
      const transitioned = await updateGoalIfStatus(admin, goal.id, 'awaiting_approval', {
        status: 'cancelled',
      });
      if (!transitioned) return stateChangedResult(goal);
      await logGoalEvent(admin, goal.id, 'goal_cancelled', {
        reason: 'Max revision cycles reached (3)',
      });
      return {
        type: 'orchestrate-goal',
        action: 'client-approval',
        goalId: goal.id,
        status: 'cancelled_max_revisions',
      };
    }

    const nativeAuthority = resolveAcceptedNativeGoalAuthority(goal);
    if (nativeAuthority.native) {
      const nativeBinding = acceptedNativePlanningActionBinding(goal, nativeAuthority);
      if (!nativeAuthority.ready || !nativeBinding) {
        return {
          type: 'orchestrate-goal',
          action: 'client-approval',
          goalId: goal.id,
          status: 'native_scope_not_ready',
          reasons: nativeAuthority.reasons,
        };
      }

      const requestedAt = new Date().toISOString();
      const nativeRevisionData = invalidateNativeExecutionForCanonicalReplan(
        {
          ...(goal.data || {}),
          revision_count: revisionCount,
          last_revision_feedback: feedback,
          native_execution_plan_revision: {
            version: 'orqaly_native_execution_plan_revision_v1',
            status: 'requested',
            scope_hash: nativeAuthority.packet.scope_hash,
            feedback,
            requested_by: payload.approved_by || null,
            requested_at: requestedAt,
          },
          team_reformation_required: true,
        },
        'execution_plan_revision_requested'
      );
      const transitioned = await updateGoalIfNativeScopeBinding(
        admin,
        goal.id,
        'awaiting_approval',
        nativeBinding,
        {
          status: 'planning',
          agent_team_id: null,
          team_id: null,
          data: nativeRevisionData,
        }
      );
      if (!transitioned) return stateChangedResult(goal);
      await logGoalEvent(admin, goal.id, 'revision_requested', {
        feedback,
        revision_count: revisionCount,
        requested_by: payload.approved_by || null,
        revision_kind: 'execution_plan',
        scope_hash: nativeAuthority.packet.scope_hash,
      });
      await enqueueGoalAction(admin, 'pm-planning', goal.id, {
        revision_feedback: feedback,
      });
      return {
        type: 'orchestrate-goal',
        action: 'client-approval',
        goalId: goal.id,
        status: 'revision_requested',
        revisionKind: 'execution_plan',
        revisionCount,
      };
    }

    const transitioned = await updateGoalIfStatus(admin, goal.id, 'awaiting_approval', {
      status: 'analyzing',
      // A material proposal revision must flow through team formation again.
      // The goal-owned team row remains reusable/auditable, but clearing both
      // legacy and current pointers prevents the next planning pass from
      // silently reusing an obsolete roster and assignments.
      agent_team_id: null,
      team_id: null,
      data: {
        ...withApprovals(goal, {
          context: invalidatedApproval(approvals.context, 'proposal_revision_requested'),
          execution: invalidatedApproval(approvals.execution, 'proposal_revision_requested'),
        }),
        revision_count: revisionCount,
        last_revision_feedback: feedback,
        team_reformation_required: true,
      },
    });
    if (!transitioned) return stateChangedResult(goal);
    await logGoalEvent(admin, goal.id, 'revision_requested', {
      feedback,
      revision_count: revisionCount,
      requested_by: payload.approved_by || null,
    });
    await enqueueGoalAction(admin, 'po-analysis', goal.id, { revision_feedback: feedback });
    return {
      type: 'orchestrate-goal',
      action: 'client-approval',
      goalId: goal.id,
      status: 'revision_requested',
      revisionCount,
    };
  }

  if (action === 'cancel') {
    const transitioned = await updateGoalIfStatus(admin, goal.id, 'awaiting_approval', {
      status: 'cancelled',
    });
    if (!transitioned) return stateChangedResult(goal);
    await logGoalEvent(admin, goal.id, 'goal_cancelled', {
      reason: 'User cancelled at approval gate',
      cancelled_by: payload.approved_by || null,
    });
    return {
      type: 'orchestrate-goal',
      action: 'client-approval',
      goalId: goal.id,
      status: 'cancelled',
    };
  }

  return {
    type: 'orchestrate-goal',
    action: 'client-approval',
    goalId: goal.id,
    status: 'unknown_action',
  };
}
