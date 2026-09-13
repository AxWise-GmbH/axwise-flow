/**
 * Orqaly -> AxWise Phase 4 execution receipts.
 *
 * Orqaly remains the execution source of truth. Receipt generation fails
 * closed against the approved execution boundary, while delivery failures can
 * never turn a locally completed goal into a failure.
 */
import { createHash } from 'node:crypto';
import { submitOrchestrationOutcome } from './orchestration-client.js';

const AXWISE_ID_MAX_LENGTH = 255;

export const AXWISE_OUTCOME_PROOF_LIMITS = Object.freeze({
  id: AXWISE_ID_MAX_LENGTH,
  modelVersion: 128,
  destinationUrl: 2048,
  safetyFlagItems: 32,
  safetyFlagLength: 128,
});

const POSTGRES_INTEGER_MAX = 2_147_483_647;

function scalarProofText(value) {
  if (value == null) return null;
  if (!['string', 'number', 'boolean', 'bigint'].includes(typeof value)) return null;
  const text = String(value).trim();
  return text || null;
}

/**
 * Persist only a deterministic, bounded representation of remote proof text.
 * Normal identifiers remain unchanged. Oversized values retain a useful prefix
 * plus a digest, so two values with the same prefix do not collapse together
 * and the omitted suffix (which may contain raw payload data) is never stored.
 */
function boundedProofText(value, maxLength) {
  const text = scalarProofText(value);
  if (text == null || text.length <= maxLength) return text;
  const digest = createHash('sha256').update(text).digest('hex').slice(0, 16);
  const suffix = `~sha256:${digest}`;
  return `${text.slice(0, Math.max(0, maxLength - suffix.length))}${suffix}`;
}

function boundedProofInteger(value) {
  return Math.min(POSTGRES_INTEGER_MAX, nonNegativeInteger(value));
}

function safetyFlagLabel(value) {
  const scalar = scalarProofText(value);
  if (scalar != null) return scalar;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  for (const key of ['code', 'type', 'category', 'name', 'id']) {
    const label = scalarProofText(value[key]);
    if (label != null) return label;
  }
  return null;
}

function boundedSafetyFlags(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, AXWISE_OUTCOME_PROOF_LIMITS.safetyFlagItems)
    .map(safetyFlagLabel)
    .filter(Boolean)
    .map((flag) => boundedProofText(flag, AXWISE_OUTCOME_PROOF_LIMITS.safetyFlagLength));
}

/**
 * AxWise outcome and receipt ids are tenant-wide unique. Hash the full identity
 * tuple so decision scope cannot be lost to delimiter ambiguity or truncation,
 * and so arbitrarily long upstream ids always stay inside the 255-char contract.
 */
function deterministicAxwiseId(kind, identityParts) {
  const digest = createHash('sha256')
    .update(JSON.stringify(identityParts.map((part) => String(part ?? ''))))
    .digest('hex');
  const id = `orqaly-${kind}:v2:${digest}`;
  if (id.length > AXWISE_ID_MAX_LENGTH) {
    throw new Error(`AxWise ${kind} id exceeds ${AXWISE_ID_MAX_LENGTH} characters`);
  }
  return id;
}

function quality(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number > 1 ? number / 100 : number));
}

function iso(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function nonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  return Math.floor(nonNegative(value, fallback));
}

function attemptNumber(task) {
  return Math.min(
    100,
    Math.max(1, Math.floor(nonNegative(task.data?.attempt || task.data?.retry_count)) + 1)
  );
}

function taskStatus(value) {
  if (['done', 'completed', 'passed'].includes(value)) return 'completed';
  if (value === 'failed') return 'failed';
  if (value === 'cancelled') return 'cancelled';
  return null;
}

export class AxWiseOutcomeReceiptError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AxWiseOutcomeReceiptError';
    this.code = 'AXWISE_OUTCOME_RECEIPTS_INCOMPLETE';
    this.details = details;
  }
}

function approvedAuthorizationManifest(goal) {
  const data = goal?.data || {};
  const approval = data.goal_approvals?.execution;
  const authorization = data.execution_authorization;
  const approvedSnapshotManifest = approval?.snapshot?.authorization_manifest;
  const manifest =
    approvedSnapshotManifest || authorization?.manifest || data.execution_authorization_manifest;

  if (!manifest) return null;

  // Once an authorization manifest exists it is the trust boundary. Do not
  // silently fall back to an older AxWise recommendation if that boundary is
  // incomplete, stale, or no longer approved.
  if (approval && approval.status !== 'approved') {
    throw new AxWiseOutcomeReceiptError(
      'AxWise outcome cannot be built from an unapproved execution snapshot',
      { reason: 'execution_approval_not_approved' }
    );
  }
  if (authorization && authorization.status !== 'approved') {
    throw new AxWiseOutcomeReceiptError(
      'AxWise outcome cannot be built from an unapproved execution authorization',
      { reason: 'execution_authorization_not_approved' }
    );
  }
  if (
    approval?.snapshot_hash &&
    authorization?.snapshot_hash &&
    approval.snapshot_hash !== authorization.snapshot_hash
  ) {
    throw new AxWiseOutcomeReceiptError(
      'AxWise outcome execution authorization hash does not match the approved snapshot',
      { reason: 'execution_authorization_hash_mismatch' }
    );
  }
  if (manifest.valid !== true || !Array.isArray(manifest.tasks) || manifest.tasks.length === 0) {
    throw new AxWiseOutcomeReceiptError(
      'AxWise outcome execution authorization manifest is invalid or empty',
      { reason: 'execution_authorization_manifest_invalid' }
    );
  }

  return {
    manifest,
    snapshotHash: approval?.snapshot_hash || authorization?.snapshot_hash || null,
  };
}

/**
 * Resolve the nodes that must have a terminal receipt before Phase 4 can be
 * reported. New goals use the exact human-approved execution manifest. Goals
 * created before that boundary existed use AxWise's immutable assignments.
 */
export function resolveExpectedExecutionNodes(goal) {
  const approved = approvedAuthorizationManifest(goal);
  if (approved) {
    const nodes = new Map();
    for (const task of approved.manifest.tasks) {
      const nodeId = task?.step_id ? String(task.step_id) : '';
      if (!nodeId) {
        throw new AxWiseOutcomeReceiptError(
          `Approved execution task ${String(task?.task_id || 'unknown')} has no AxWise node id`,
          { reason: 'approved_task_missing_node_id', task_id: task?.task_id || null }
        );
      }
      if (nodes.has(nodeId)) {
        throw new AxWiseOutcomeReceiptError(
          `Approved execution snapshot contains duplicate AxWise node ${nodeId}`,
          { reason: 'duplicate_approved_node_id', node_id: nodeId }
        );
      }
      nodes.set(nodeId, {
        nodeId,
        taskId: task?.task_id ? String(task.task_id) : null,
        agentId: task?.agent_id ? String(task.agent_id) : null,
        snapshotHash: approved.snapshotHash,
      });
    }
    return { source: 'execution_authorization', nodes };
  }

  const assignments = goal?.data?.axwise_orchestration?.assignments || {};
  const nodes = new Map(
    Object.entries(assignments)
      .filter(([nodeId]) => Boolean(nodeId))
      .map(([nodeId, agentId]) => [
        String(nodeId),
        {
          nodeId: String(nodeId),
          taskId: null,
          agentId: agentId ? String(agentId) : null,
          snapshotHash: null,
        },
      ])
  );
  return { source: 'orchestration_assignments', nodes };
}

function outcomeTasksForCurrentAttempt(goal, tasks, expectedExecution) {
  const rows = Array.isArray(tasks) ? tasks : [];
  if (expectedExecution.source === 'execution_authorization') {
    const authorizedTaskIds = new Set(
      [...expectedExecution.nodes.values()].map((node) => node.taskId).filter(Boolean)
    );
    return rows.filter((task) => authorizedTaskIds.has(String(task.id)));
  }

  // Pre-authorization goals did not freeze task IDs. Once a decision exists,
  // it remains an explicit attempt boundary and must never fall through to
  // unrelated active/done history while its rows are materializing.
  const decisionId = goal?.data?.axwise_orchestration?.decision_id;
  if (decisionId) {
    return rows.filter((task) => {
      const taggedDecision =
        task.data?.axwise_decision_id || task.data?.axwise_execution_context?.decision_id;
      return String(taggedDecision || '') === String(decisionId);
    });
  }
  return rows.filter(
    (task) =>
      !['cancelled', 'canceled', 'superseded'].includes(
        String(task?.status || '')
          .trim()
          .toLowerCase()
      )
  );
}

export function buildGoalOutcome(goal, tasks = []) {
  const orchestration = goal?.data?.axwise_orchestration;
  if (!goal?.id || !orchestration?.decision_id) return null;
  const shadowObservation = !orchestration.applied;
  const expectedAssignments = orchestration.assignments || {};
  const expectedExecution = resolveExpectedExecutionNodes(goal);
  const currentTasks = outcomeTasksForCurrentAttempt(goal, tasks, expectedExecution);
  const receipts = [];
  for (const task of currentTasks) {
    const context = task.data?.axwise_execution_context;
    const nodeId = context?.step_id;
    const status = taskStatus(task.status);
    if (!nodeId || !status) continue;
    const taskQuality = quality(task.data?.quality_score);
    const attempt = attemptNumber(task);
    const expectedAgentId = expectedAssignments[String(nodeId)] || null;
    const assignmentDiverged = Boolean(
      shadowObservation &&
      expectedAgentId &&
      task.agent_id &&
      String(task.agent_id) !== String(expectedAgentId)
    );
    const humanOverride = Boolean(task.data?.human_override || assignmentDiverged);
    receipts.push({
      receipt_id: deterministicAxwiseId('receipt', [
        goal.id,
        orchestration.decision_id,
        task.id,
        attempt,
      ]),
      node_id: String(nodeId),
      agent_id: task.agent_id ? String(task.agent_id) : null,
      attempt,
      status,
      started_at: iso(task.data?.started_at || task.created_at),
      completed_at: iso(task.data?.executedAt || task.updated_at),
      quality_score: taskQuality,
      stakeholder_acceptance: quality(task.data?.stakeholder_acceptance),
      cost: nonNegative(task.data?.llmCost),
      currency: 'USD',
      latency_ms: nonNegativeInteger(task.data?.duration_ms),
      token_count: nonNegativeInteger(task.data?.llmTotalTokens),
      rework_count: nonNegativeInteger(task.data?.retry_count),
      escalation_count: nonNegativeInteger(task.data?.escalation_count),
      human_override: humanOverride,
      override_reason: humanOverride
        ? String(
            task.data?.human_override_reason ||
              (assignmentDiverged
                ? `Orqaly shadow mode executed local agent ${task.agent_id} instead of AxWise recommendation ${expectedAgentId}`
                : 'Orqaly recorded a task-level human override')
          )
        : null,
      failure_type: status === 'failed' ? task.data?.failure_type || 'agent_failure' : null,
      notes: [],
    });
  }

  const receivedNodeIds = new Set(receipts.map((receipt) => receipt.node_id));
  const missingNodeIds = [...expectedExecution.nodes.keys()].filter(
    (nodeId) => !receivedNodeIds.has(nodeId)
  );
  if (missingNodeIds.length > 0) {
    const preview = missingNodeIds.slice(0, 10).join(', ');
    throw new AxWiseOutcomeReceiptError(
      `AxWise outcome is missing terminal task receipts for approved nodes: ${preview}`,
      {
        reason: 'missing_terminal_node_receipts',
        expected_source: expectedExecution.source,
        missing_node_ids: missingNodeIds,
      }
    );
  }

  const failedCount = currentTasks.filter((task) => task.status === 'failed').length;
  const phaseQualities = (goal.plan?.phases || [])
    .map((phase) => quality(phase.quality_score))
    .filter((value) => value != null);
  const receiptQualities = receipts
    .map((receipt) => receipt.quality_score)
    .filter((value) => value != null);
  const qualities = phaseQualities.length ? phaseQualities : receiptQualities;
  const qualityScore = qualities.length
    ? qualities.reduce((sum, value) => sum + value, 0) / qualities.length
    : null;
  const started = new Date(goal.data?.started_at || goal.created_at || 0).getTime();
  const completed = new Date(goal.data?.completed_at || goal.updated_at || Date.now()).getTime();
  const explicitOverride = Boolean(goal.data?.human_override);
  const outcomeOverride = explicitOverride || shadowObservation;
  const authorizationStatus = orchestration.applied
    ? 'approved'
    : orchestration.feasible
      ? 'partially_approved'
      : 'rejected';

  return {
    contract_version: '1.0',
    outcome_id: deterministicAxwiseId('outcome', [
      goal.id,
      orchestration.decision_id,
      nonNegativeInteger(goal.iteration),
    ]),
    decision_id: orchestration.decision_id,
    authorization_status: authorizationStatus,
    execution_status: 'completed',
    task_success: failedCount === 0,
    quality_score: qualityScore,
    stakeholder_acceptance: quality(goal.data?.stakeholder_acceptance),
    cost: nonNegative(goal.spent_usd || goal.data?.total_cost),
    currency: 'USD',
    latency_ms:
      Number.isFinite(started) && started > 0 && Number.isFinite(completed) && completed >= started
        ? completed - started
        : null,
    rework_count: nonNegativeInteger(goal.iteration),
    escalation_count: nonNegativeInteger(goal.data?.escalation_count),
    human_override: outcomeOverride,
    override_reason: outcomeOverride
      ? String(
          goal.data?.human_override_reason ||
            (shadowObservation
              ? 'AxWise decision was observed in shadow mode; Orqaly authorized and executed its local assignment.'
              : 'Orqaly recorded a human override')
        )
      : null,
    failure_type: failedCount ? 'invalid_output' : null,
    completed_at: iso(goal.data?.completed_at || goal.updated_at),
    node_receipts: receipts,
    notes: [
      orchestration.applied
        ? 'AxWise assignment was authorized and applied by Orqaly.'
        : 'AxWise decision was observed but Orqaly executed its local assignment.',
    ],
  };
}

function buildPersistedOutcomeProof({ goal, decisionId, outcome, record }) {
  const limits = AXWISE_OUTCOME_PROOF_LIMITS;
  const recordedOutcomeId = scalarProofText(record?.outcome?.outcome_id) || outcome.outcome_id;
  const scorerVersion = scalarProofText(record?.scorer_version);
  const evaluationVersion = scalarProofText(record?.evaluation?.evaluation_version);
  return {
    goalId: boundedProofText(goal.id, limits.id),
    decisionId: boundedProofText(decisionId, limits.id),
    localOutcomeId: boundedProofText(outcome.outcome_id, limits.id),
    recordedOutcomeId: boundedProofText(recordedOutcomeId, limits.id),
    model: boundedProofText(scorerVersion || evaluationVersion, limits.modelVersion),
    evaluationVersion: boundedProofText(evaluationVersion, limits.modelVersion),
    normalizedSuccess: quality(record?.evaluation?.normalized_success),
    safetyFlags: boundedSafetyFlags(record?.evaluation?.safety_flags),
    promotableObservation: record?.evaluation?.promotable_observation === true,
    reused: Boolean(record?.reused),
  };
}

export async function reportGoalOutcome(admin, goal) {
  const decisionId = goal?.data?.axwise_orchestration?.decision_id;
  if (!decisionId || !goal?.org_id || !goal?.user_id) return { status: 'skipped' };
  const { data: tasks, error } = await admin
    .from('team_tasks')
    .select('id, status, agent_id, data, created_at, updated_at')
    .eq('data->>goal_id', goal.id)
    .eq('user_id', goal.user_id);
  if (error) throw new Error(`Unable to load goal execution receipts: ${error.message}`);
  const outcome = buildGoalOutcome(goal, tasks || []);
  const requestStartedAt = Date.now();
  const record = await submitOrchestrationOutcome(
    decisionId,
    { orgId: String(goal.org_id), userId: String(goal.user_id) },
    outcome,
    {
      idempotencyKey: `orqaly-outcome:${goal.id}:iteration:${Number(goal.iteration || 0)}:${decisionId}`,
    }
  );
  const proof = buildPersistedOutcomeProof({ goal, decisionId, outcome, record });
  const destinationUrl = boundedProofText(
    `${(process.env.AXWISE_API_URL || '').replace(/\/+$/, '')}/orchestration/decisions/${encodeURIComponent(proof.decisionId || '')}/outcomes`,
    AXWISE_OUTCOME_PROOF_LIMITS.destinationUrl
  );
  const { error: auditError } = await admin.from('axwise_calls').insert({
    user_id: goal.user_id,
    org_id: String(goal.org_id),
    trace_id: proof.decisionId,
    request_id: proof.localOutcomeId,
    integration_point: 'goal.outcome',
    destination_url: destinationUrl,
    model: proof.model,
    status: 'ok',
    applied_outcome: 'outcome-reported',
    ax_decision: proof.promotableObservation ? 'promotable-observation' : 'observation-recorded',
    local_decision: 'completed',
    degraded: false,
    skipped: false,
    duration_ms: boundedProofInteger(Date.now() - requestStartedAt),
    cost_usd: 0,
    request_payload: {
      task_id: proof.goalId,
      decision_id: proof.decisionId,
      outcome_id: proof.localOutcomeId,
      node_receipt_count: boundedProofInteger(outcome.node_receipts.length),
      execution_status: outcome.execution_status,
    },
    processed_outputs: {
      decision_id: proof.decisionId,
      outcome_id: proof.recordedOutcomeId,
      evaluation_version: proof.evaluationVersion,
      normalized_success: proof.normalizedSuccess,
      safety_flags: proof.safetyFlags,
      promotable_observation: proof.promotableObservation,
      reused: proof.reused,
    },
    applicable_conditions: null,
  });
  if (auditError) {
    throw new Error(`Unable to persist AxWise outcome audit: ${auditError.message}`);
  }
  const currentResult = await admin
    .from('goals')
    .select('data')
    .eq('id', goal.id)
    .eq('user_id', goal.user_id)
    .single();
  if (currentResult?.error) {
    throw new Error(`Unable to load goal outcome state: ${currentResult.error.message}`);
  }
  const currentData = currentResult?.data?.data || goal.data || {};
  const { error: updateError } = await admin
    .from('goals')
    .update({
      data: {
        ...currentData,
        axwise_outcome: {
          outcome_id: proof.recordedOutcomeId,
          decision_id: proof.decisionId,
          evaluation_version: proof.evaluationVersion,
          normalized_success: proof.normalizedSuccess,
          safety_flags: proof.safetyFlags,
          reused: proof.reused,
          reported_at: new Date().toISOString(),
        },
      },
    })
    .eq('id', goal.id)
    .eq('user_id', goal.user_id);
  if (updateError) throw new Error(`Unable to persist AxWise outcome: ${updateError.message}`);
  return { status: 'reported', outcome, record };
}
