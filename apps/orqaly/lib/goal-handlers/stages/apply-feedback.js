/**
 * Stage: Apply Feedback (user comment bundle → controlled revision)
 *
 * Triggered by the design-comments API when a user clicks "Apply feedback"
 * with one or more open pin comments on a deployed landing page. Instead of
 * burning a full iterate cycle, this stage:
 *
 *   1. Loads the open comments for the goal.
 *   2. Bundles them as a structured addendum to the Phase 1 design brief.
 *   3. Re-runs Designer (Phase 1) → Frontend Developer (Phase 2) using the
 *      same 3-phase landing-page structure iterate.js enforces — preserving
 *      Phase 3 (QA) so the vision-QA tool re-grades the new deployment.
 *
 * Legacy landing-page goals take the targeted re-run described above. Native
 * AxWise goals instead create a scope-bound execution-plan revision and pass
 * through PM planning, materialization, and Gate 2 again; their old tasks are
 * immutable history and are never edited in place.
 *
 * Conflict resolution: a user comment that contradicts the brand brief
 * (e.g. "make hero pink" when brief says "corporate blue") is surfaced to
 * the Designer prompt verbatim — the LLM is instructed to honour user
 * intent over the prior brief because the user is the source of truth.
 * Designers should flag the conflict in their output so the user sees what
 * changed and why.
 */
import { isDeepStrictEqual } from 'node:util';
import { createLogger } from '../../../api/_lib/logger.js';
import {
  deterministicAgentJobId,
  enqueueAgentJob,
  loadGoal,
  logGoalEvent,
  updateGoalIfNativeScopeBinding,
} from '../_helpers.js';
import {
  acceptedNativePlanningActionBinding,
  resolveAcceptedNativeGoalAuthority,
} from '../../_shared/native-goal-authority.js';
import { currentGoalTaskAttempt } from '../current-goal-task-attempt.js';
import { postMessage } from '../goal-messaging.js';
import { invalidateNativeExecutionForCanonicalReplan } from '../native-legacy-dispatch.js';

const log = createLogger('goal-stage:apply-feedback');

const MAX_COMMENTS_PER_RUN = 30;
const MAX_RECORDED_APPLICATIONS = 50;
const MAX_RECORDED_QUALITY_REVISIONS = 20;
const MAX_GOAL_UPDATE_ATTEMPTS = 3;
const MAX_TASK_UPDATE_ATTEMPTS = 3;
const TERMINAL_FEEDBACK_SOURCE_STATUSES = new Set(['completed', 'completed_with_warnings']);
const RESETTABLE_TASK_STATUSES = new Set(['planned', 'todo', 'done', 'failed']);
const PHASE_RUNTIME_FIELDS = [
  'started_at',
  'completed_at',
  'actual_cost',
  'actual_time',
  'duration_ms',
  'quality_score',
  'research_quality',
  'progress',
  'progress_percent',
  'feedback',
  'next_action',
  'evaluation',
  'result',
  'output',
];
const TASK_RUNTIME_FIELDS = new Set([
  'output',
  'error',
  'failure_reason',
  'failure_pattern',
  'validation_failed',
  'validation_reason',
  'llmCost',
  'llmModel',
  'llmProvider',
  'llmDurationMs',
  'llmPromptTokens',
  'llmCompletionTokens',
  'llmTotalTokens',
  'llmEstimatedCostUsd',
  'llmFinishReason',
  'llmContinuationAttempted',
  'llmInitialFinishReason',
  'executedAt',
  'toolLog',
  'citations',
  'researchStats',
  'quality_score',
  'recovered_from_timeout',
  'recovered_deployment_url',
]);

function normalizedCommentSnapshot(comment) {
  return {
    id: typeof comment?.id === 'string' ? comment.id : '',
    elementSelector: typeof comment?.element_selector === 'string' ? comment.element_selector : '',
    elementText: typeof comment?.element_text === 'string' ? comment.element_text : '',
    commentText: typeof comment?.comment_text === 'string' ? comment.comment_text : '',
    status: typeof comment?.status === 'string' ? comment.status : '',
    appliedAt: typeof comment?.applied_at === 'string' ? comment.applied_at : '',
    updatedAt: typeof comment?.updated_at === 'string' ? comment.updated_at : '',
  };
}

/**
 * Persisted, immutable identity for one user feedback application.
 *
 * The API computes this only after it has claimed the exact comment rows and
 * stores it in the durable agent-job payload. The worker recomputes it from
 * those same tenant-fenced rows before touching the goal. Including the
 * server-generated nonce means reopening an unchanged comment creates a new
 * generation even on two updates that share the same database timestamp.
 */
export function buildFeedbackApplicationVersion({ goalId, userId, nonce, comments }) {
  const snapshots = Array.isArray(comments)
    ? comments.map(normalizedCommentSnapshot).sort((a, b) => a.id.localeCompare(b.id))
    : [];
  return deterministicAgentJobId('design-comments-feedback-application', {
    goalId: typeof goalId === 'string' ? goalId : '',
    userId: typeof userId === 'string' ? userId : '',
    nonce: typeof nonce === 'string' ? nonce : '',
    comments: snapshots,
  });
}

function feedbackPayloadIdentity(payload) {
  const commentIds = Array.isArray(payload?.commentIds)
    ? payload.commentIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim())
    : [];
  const uniqueIds = [...new Set(commentIds)].sort();
  const userId = typeof payload?._userId === 'string' ? payload._userId.trim() : '';
  const nonce =
    typeof payload?.feedbackApplicationNonce === 'string'
      ? payload.feedbackApplicationNonce.trim()
      : '';
  const version =
    typeof payload?.feedbackApplicationVersion === 'string'
      ? payload.feedbackApplicationVersion.trim()
      : '';
  return { commentIds, uniqueIds, userId, nonce, version };
}

function summarizeCommentsForBrief(comments) {
  if (!comments.length) return '';
  const lines = comments.map((c, i) => {
    const sel = (c.element_selector || 'unknown element').slice(0, 120);
    const txt = (c.element_text || '').slice(0, 120);
    const body = (c.comment_text || '').slice(0, 400);
    return `${i + 1}. [${sel}] ${txt ? `("${txt}") ` : ''}— ${body}`;
  });
  return [
    '## User feedback to address in this revision',
    '',
    'The user reviewed the previous deployment and left these pin comments.',
    'Honour user intent: when a comment conflicts with the prior brand brief,',
    'follow the comment and explicitly note the deviation in your output.',
    '',
    ...lines,
    '',
    'Adjust the design brief AND the deployment to address every item above.',
    'Do not introduce unrelated changes. Keep everything else from the prior',
    'design that was not commented on.',
  ].join('\n');
}

function sameDatabaseTimestamp(left, right) {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}

function feedbackApplications(goal) {
  return Array.isArray(goal?.data?.feedback_applications)
    ? goal.data.feedback_applications.filter(
        (application) => application && typeof application.version === 'string'
      )
    : [];
}

function hasFeedbackApplication(goal, version) {
  return feedbackApplications(goal).some((application) => application.version === version);
}

function nativeFeedbackRevisionMatches(goal, identity, scopeHash) {
  const revision = goal?.data?.native_execution_plan_revision;
  return (
    goal?.status === 'planning' &&
    hasFeedbackApplication(goal, identity.version) &&
    goal?.data?.last_feedback_application_version === identity.version &&
    revision?.version === 'orqaly_native_execution_plan_revision_v1' &&
    revision.status === 'requested' &&
    revision.scope_hash === scopeHash &&
    revision.feedback_application_version === identity.version
  );
}

function buildNativeFeedbackRevisionData(goal, identity, exactComments, feedback, requestedAt) {
  const currentData = goal.data && typeof goal.data === 'object' ? goal.data : {};
  const priorAttestation = currentData.prd_quality_attestation;
  const priorQualityHistory = Array.isArray(currentData.prd_quality_history)
    ? currentData.prd_quality_history
    : [];
  const nextQualityHistory =
    priorAttestation?.status === 'passed'
      ? [
          ...priorQualityHistory,
          {
            revision_ref: identity.version,
            reopened_at: requestedAt,
            source_goal_status: goal.status,
            artifact_hash: priorAttestation.artifact_hash || null,
            scope_hash: priorAttestation.scope_hash || null,
            attestation: priorAttestation,
            validation: currentData.prd_quality_validation || null,
            repair: currentData.prd_quality_repair || null,
          },
        ].slice(-MAX_RECORDED_QUALITY_REVISIONS)
      : priorQualityHistory;
  const nextApplications = [
    ...feedbackApplications(goal),
    {
      version: identity.version,
      comment_ids: identity.uniqueIds,
      applied_at: exactComments[0]?.applied_at || requestedAt,
      source_goal_status: goal.status,
      prior_completed_at: currentData.completed_at || null,
      application_kind: 'native_execution_plan_revision',
    },
  ].slice(-MAX_RECORDED_APPLICATIONS);
  const {
    completed_at: _completedAt,
    prd_quality_attestation: _qualityAttestation,
    prd_quality_validation: _qualityValidation,
    prd_quality_repair: _qualityRepair,
    user_feedback_addendum: _legacyFeedbackAddendum,
    ...revisionData
  } = currentData;

  return invalidateNativeExecutionForCanonicalReplan(
    {
      ...revisionData,
      feedback_applications: nextApplications,
      last_feedback_application_version: identity.version,
      last_feedback_applied_at: exactComments[0]?.applied_at || requestedAt,
      last_feedback_comment_ids: identity.uniqueIds,
      ...(nextQualityHistory.length ? { prd_quality_history: nextQualityHistory } : {}),
      quality_revision: {
        version: 1,
        revision_ref: identity.version,
        reason: 'user_feedback',
        reopened_at: requestedAt,
        prior_artifact_hash: priorAttestation?.artifact_hash || null,
        prior_scope_hash: priorAttestation?.scope_hash || null,
      },
      native_execution_plan_revision: {
        version: 'orqaly_native_execution_plan_revision_v1',
        status: 'requested',
        scope_hash: goal.data.axwise_customer_intelligence.scope_packet.scope_hash,
        feedback: feedback.slice(0, 4000),
        requested_by: goal.user_id,
        requested_at: requestedAt,
        source: 'design_comments',
        feedback_application_version: identity.version,
        comment_ids: identity.uniqueIds,
      },
      team_reformation_required: true,
    },
    'native_feedback_requires_canonical_replan'
  );
}

async function persistNativeFeedbackRevision(
  admin,
  { initialGoal, authority, identity, exactComments, feedback }
) {
  if (!TERMINAL_FEEDBACK_SOURCE_STATUSES.has(initialGoal.status)) {
    if (nativeFeedbackRevisionMatches(initialGoal, identity, authority.packet.scope_hash)) {
      return { goal: initialGoal, applied: false };
    }
    const error = new Error(
      'apply-feedback: native goal lifecycle does not allow this feedback generation'
    );
    error.code = 'FEEDBACK_GOAL_CONFLICT';
    throw error;
  }

  const binding = acceptedNativePlanningActionBinding(initialGoal, authority);
  if (!binding) {
    const error = new Error('apply-feedback: accepted native scope binding is unavailable');
    error.code = 'FEEDBACK_NATIVE_SCOPE_NOT_READY';
    throw error;
  }
  const requestedAt = nextGoalMutationTimestamp(initialGoal.updated_at);
  if (!requestedAt) {
    const error = new Error('apply-feedback: native goal update snapshot has no valid timestamp');
    error.code = 'FEEDBACK_GOAL_SNAPSHOT_INCOMPLETE';
    throw error;
  }
  const nextData = buildNativeFeedbackRevisionData(
    initialGoal,
    identity,
    exactComments,
    feedback,
    requestedAt
  );
  const transitioned = await updateGoalIfNativeScopeBinding(
    admin,
    initialGoal.id,
    initialGoal.status,
    binding,
    {
      status: 'planning',
      agent_team_id: null,
      team_id: null,
      data: nextData,
      updated_at: requestedAt,
    }
  );
  const observed = await loadGoal(admin, initialGoal.id);
  if (
    !nativeFeedbackRevisionMatches(observed, identity, authority.packet.scope_hash) ||
    observed?.user_id !== initialGoal.user_id
  ) {
    const error = new Error(
      'apply-feedback: native feedback replan could not be reconciled; operator reconciliation is required'
    );
    error.code = 'FEEDBACK_GOAL_UPDATE_RECONCILIATION_REQUIRED';
    throw error;
  }
  return { goal: observed, applied: Boolean(transitioned) };
}

function nextGoalMutationTimestamp(previous) {
  const previousMs = Date.parse(previous);
  if (!Number.isFinite(previousMs)) return null;
  return new Date(Math.max(Date.now(), previousMs + 1)).toISOString();
}

function feedbackPhaseIndexes(plan) {
  const phases = Array.isArray(plan?.phases) ? plan.phases : [];
  return phases.slice(0, 3).map((_phase, index) => index);
}

function resetPhaseForFeedback(phase, application) {
  const reset = { ...(phase || {}), status: 'pending' };
  for (const field of PHASE_RUNTIME_FIELDS) delete reset[field];
  // `feedback` is a runtime-only plan field (approval-audit strips it). It
  // fences every execute-phase transition from the instant the goal reopens,
  // including the short interval before the task-row resets finish.
  reset.feedback = {
    kind: 'feedback_application',
    application_version: application.version,
    applied_at: application.appliedAt,
    retry_count: application.retryCount,
    iteration: application.iteration,
  };
  return reset;
}

function bindExactJson(query, column, value) {
  return value === null || value === undefined
    ? query.is(column, null)
    : query.eq(column, JSON.stringify(value));
}

function buildFeedbackGoalMutation(goal, identity, exactComments, briefAddendum, updatedAt) {
  const currentData = goal.data && typeof goal.data === 'object' ? goal.data : {};
  const currentPlan = goal.plan && typeof goal.plan === 'object' ? goal.plan : {};
  const recordedApplications = feedbackApplications(goal);
  const priorAddendum =
    typeof currentData.user_feedback_addendum === 'string'
      ? currentData.user_feedback_addendum
      : '';
  const nextAddendum = priorAddendum
    ? `${priorAddendum}\n\n---\n\n${briefAddendum}`
    : briefAddendum;

  const appliedAt = exactComments[0]?.applied_at || updatedAt;
  const application = {
    version: identity.version,
    appliedAt,
    retryCount: Number(currentData.retry_count || 0),
    iteration: Number(goal.iteration || 0),
  };
  const phases = Array.isArray(currentPlan.phases) ? [...currentPlan.phases] : [];
  for (const phaseIndex of feedbackPhaseIndexes(currentPlan)) {
    phases[phaseIndex] = resetPhaseForFeedback(phases[phaseIndex], application);
  }

  const nextApplications = [
    ...recordedApplications,
    {
      version: identity.version,
      comment_ids: identity.uniqueIds,
      applied_at: appliedAt,
      source_goal_status: goal.status,
      prior_completed_at: currentData.completed_at || null,
    },
  ].slice(-MAX_RECORDED_APPLICATIONS);

  const priorAttestation = currentData.prd_quality_attestation;
  const priorQualityHistory = Array.isArray(currentData.prd_quality_history)
    ? currentData.prd_quality_history
    : [];
  const nextQualityHistory =
    priorAttestation?.status === 'passed'
      ? [
          ...priorQualityHistory,
          {
            revision_ref: identity.version,
            reopened_at: updatedAt,
            source_goal_status: goal.status,
            artifact_hash: priorAttestation.artifact_hash || null,
            scope_hash: priorAttestation.scope_hash || null,
            attestation: priorAttestation,
            validation: currentData.prd_quality_validation || null,
            repair: currentData.prd_quality_repair || null,
          },
        ].slice(-MAX_RECORDED_QUALITY_REVISIONS)
      : priorQualityHistory;
  const {
    completed_at: _completedAt,
    prd_quality_attestation: _qualityAttestation,
    prd_quality_validation: _qualityValidation,
    prd_quality_repair: _qualityRepair,
    ...reopenedData
  } = currentData;

  return {
    status: 'active',
    plan: { ...currentPlan, phases },
    data: {
      ...reopenedData,
      user_feedback_addendum: nextAddendum,
      feedback_applications: nextApplications,
      last_feedback_application_version: identity.version,
      last_feedback_applied_at: appliedAt,
      last_feedback_comment_ids: identity.uniqueIds,
      ...(nextQualityHistory.length ? { prd_quality_history: nextQualityHistory } : {}),
      quality_revision: {
        version: 1,
        revision_ref: identity.version,
        reason: 'user_feedback',
        reopened_at: updatedAt,
        prior_artifact_hash: priorAttestation?.artifact_hash || null,
        prior_scope_hash: priorAttestation?.scope_hash || null,
      },
    },
    updated_at: updatedAt,
  };
}

function exactGoalMutationReturned(row, goal, mutation) {
  return (
    row?.id === goal.id &&
    row.user_id === goal.user_id &&
    row.status === mutation.status &&
    sameDatabaseTimestamp(row.updated_at, mutation.updated_at) &&
    isDeepStrictEqual(row.data, mutation.data) &&
    isDeepStrictEqual(row.plan, mutation.plan)
  );
}

function reopenedQualityGoalMatches(row, goal, mutation, { allowAdvancedRevision = false } = {}) {
  const rowVersionMatches =
    Number.isInteger(row?.row_version) &&
    (allowAdvancedRevision
      ? row.row_version >= goal.row_version + 1
      : row.row_version === goal.row_version + 1);
  const timestampMatches = allowAdvancedRevision
    ? Date.parse(row?.updated_at) >= Date.parse(mutation.updated_at)
    : sameDatabaseTimestamp(row?.updated_at, mutation.updated_at);
  return (
    row?.id === goal.id &&
    row.user_id === goal.user_id &&
    row.status === mutation.status &&
    rowVersionMatches &&
    timestampMatches &&
    isDeepStrictEqual(row.data, mutation.data) &&
    isDeepStrictEqual(row.plan, mutation.plan) &&
    row.data?.last_feedback_application_version === mutation.data?.last_feedback_application_version
  );
}

async function reopenQualityGoalRevision(admin, goal, mutation, revisionRef) {
  if (!Number.isInteger(goal?.row_version)) {
    const error = new Error('apply-feedback: frozen quality goal has no database row version');
    error.code = 'FEEDBACK_GOAL_SNAPSHOT_INCOMPLETE';
    throw error;
  }
  const args = {
    p_goal_id: goal.id,
    p_user_id: goal.user_id,
    p_expected_status: goal.status,
    p_expected_updated_at: goal.updated_at,
    p_expected_row_version: goal.row_version,
    p_expected_data: goal.data,
    p_expected_plan: goal.plan,
    p_next_data: mutation.data,
    p_next_plan: mutation.plan,
    p_next_updated_at: mutation.updated_at,
    p_revision_ref: revisionRef,
  };
  const response = await admin.rpc('reopen_quality_goal_revision', args);
  if (response?.error) throw response.error;
  const envelope = response?.data;
  if (['reopened', 'already_reopened'].includes(envelope?.status)) {
    if (
      !reopenedQualityGoalMatches(envelope.goal, goal, mutation, {
        allowAdvancedRevision: envelope.status === 'already_reopened',
      })
    ) {
      throw new Error('apply-feedback: quality reopen RPC returned a mismatched goal revision');
    }
    return {
      status: envelope.status,
      goal: envelope.goal,
    };
  }
  if (envelope?.status === 'conflict' || envelope?.status === 'not_frozen') {
    return { status: envelope.status, reason: envelope.reason || null };
  }
  throw new Error('apply-feedback: quality reopen RPC returned an invalid response');
}

async function persistFeedbackApplication(
  admin,
  { initialGoal, identity, exactComments, briefAddendum }
) {
  let current = initialGoal;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_GOAL_UPDATE_ATTEMPTS; attempt += 1) {
    const isRetryOfPersistedApplication = hasFeedbackApplication(current, identity.version);
    const canStartApplication = TERMINAL_FEEDBACK_SOURCE_STATUSES.has(current?.status);
    const canRepairApplication = current?.status === 'active' && isRetryOfPersistedApplication;
    if (
      current?.user_id !== initialGoal.user_id ||
      (!canStartApplication && !canRepairApplication)
    ) {
      const error = new Error(
        'apply-feedback: goal owner or lifecycle state does not allow this feedback generation'
      );
      error.code = 'FEEDBACK_GOAL_CONFLICT';
      throw error;
    }
    if (isRetryOfPersistedApplication) {
      return { goal: current, applied: false };
    }

    const mutationAt = nextGoalMutationTimestamp(current.updated_at);
    if (!mutationAt) {
      const error = new Error('apply-feedback: goal update snapshot has no valid timestamp');
      error.code = 'FEEDBACK_GOAL_SNAPSHOT_INCOMPLETE';
      throw error;
    }
    const mutation = buildFeedbackGoalMutation(
      current,
      identity,
      exactComments,
      briefAddendum,
      mutationAt
    );

    if (canStartApplication) {
      let reopenResult = null;
      try {
        reopenResult = await reopenQualityGoalRevision(admin, current, mutation, identity.version);
      } catch (error) {
        lastError = error;
      }
      if (reopenResult?.status === 'reopened') {
        return { goal: reopenResult.goal, applied: true };
      }
      if (reopenResult?.status === 'already_reopened') {
        return { goal: reopenResult.goal, applied: false };
      }
      if (reopenResult?.status !== 'not_frozen') {
        // RPC errors and conflicts are ambiguous until the exact row is read.
        // Adopt only the exact committed revision; never fall back to a direct
        // write that could bypass an active freeze.
        try {
          const observed = await loadGoal(admin, initialGoal.id);
          if (
            reopenedQualityGoalMatches(observed, current, mutation, {
              allowAdvancedRevision: true,
            })
          ) {
            return { goal: observed, applied: false };
          }
          current = observed;
        } catch (error) {
          lastError = error;
          break;
        }
        if (hasFeedbackApplication(current, identity.version)) {
          const error = new Error(
            'apply-feedback: feedback revision marker exists on a mismatched quality snapshot'
          );
          error.code = 'FEEDBACK_GOAL_UPDATE_RECONCILIATION_REQUIRED';
          throw error;
        }
        continue;
      }
    }

    let response = null;
    let writeError = null;
    try {
      let update = admin
        .from('goals')
        .update(mutation)
        .eq('id', current.id)
        .eq('user_id', current.user_id)
        .eq('status', current.status)
        .eq('updated_at', current.updated_at);
      if (Number.isInteger(current.row_version)) {
        update = update.eq('row_version', current.row_version);
      }
      update = bindExactJson(update, 'data', current.data);
      update = bindExactJson(update, 'plan', current.plan);
      response = await update
        .select('id, user_id, status, data, plan, updated_at, row_version')
        .maybeSingle();
      writeError = response?.error || null;
    } catch (error) {
      writeError = error;
    }

    if (!writeError && exactGoalMutationReturned(response?.data, current, mutation)) {
      return { goal: response.data, applied: true };
    }
    lastError = writeError;

    // A zero-row CAS or a lost response is ambiguous until the exact goal is
    // re-read. A committed application is adopted; a same-state concurrent
    // edit is merged on the next attempt; lifecycle changes fail closed.
    try {
      current = await loadGoal(admin, initialGoal.id);
    } catch (error) {
      lastError = error;
      break;
    }
    if (hasFeedbackApplication(current, identity.version)) {
      return { goal: current, applied: false };
    }
  }

  const error = new Error(
    'apply-feedback: goal update could not be reconciled; operator reconciliation is required'
  );
  error.code = 'FEEDBACK_GOAL_UPDATE_RECONCILIATION_REQUIRED';
  error.cause = lastError;
  throw error;
}

function taskResetAlreadyApplied(task, version) {
  // Once a task carries the immutable application marker, later statuses are
  // legitimate progress by the exact continuation. A delayed retry of the
  // apply-feedback job must never turn an in-progress or completed task back
  // into planned work.
  return task?.data?.feedback_application_version === version;
}

function feedbackTaskEligible(goal, task, phaseIndexes) {
  const phaseIndex = Number(task?.data?.phase_index);
  const jsonGoalId = String(task?.data?.goal_id || '').trim();
  return (
    task?.user_id === goal.user_id &&
    task?.goal_id === goal.id &&
    (!jsonGoalId || jsonGoalId === goal.id) &&
    phaseIndexes.has(phaseIndex) &&
    currentGoalTaskAttempt(goal, [task]).length === 1
  );
}

function resetTaskDataForFeedback(task, version, mutationAt) {
  const preserved = Object.fromEntries(
    Object.entries(task?.data || {}).filter(([field]) => !TASK_RUNTIME_FIELDS.has(field))
  );
  return {
    ...preserved,
    feedback_application_version: version,
    feedback_reset_from_status: task.status,
    feedback_reset_at: mutationAt,
  };
}

function exactTaskMutationReturned(row, task, mutation) {
  return (
    row?.id === task.id &&
    row.goal_id === task.goal_id &&
    row.user_id === task.user_id &&
    row.status === mutation.status &&
    sameDatabaseTimestamp(row.updated_at, mutation.updated_at) &&
    isDeepStrictEqual(row.data, mutation.data)
  );
}

async function loadFeedbackTask(admin, goal, taskId) {
  const { data, error } = await admin
    .from('team_tasks')
    .select('id, goal_id, user_id, status, materialization_attempt, data, updated_at')
    .eq('id', taskId)
    .eq('goal_id', goal.id)
    .eq('user_id', goal.user_id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function currentFeedbackGoal(admin, goal, version) {
  const current = await loadGoal(admin, goal.id);
  const markerIsCurrent = feedbackPhaseIndexes(current?.plan).every((phaseIndex) => {
    const marker = current?.plan?.phases?.[phaseIndex]?.feedback;
    return (
      marker?.kind === 'feedback_application' &&
      marker.application_version === version &&
      Number(marker.retry_count || 0) === Number(current?.data?.retry_count || 0) &&
      Number(marker.iteration || 0) === Number(current?.iteration || 0)
    );
  });
  if (
    current?.user_id !== goal.user_id ||
    current?.status !== 'active' ||
    current?.data?.last_feedback_application_version !== version ||
    !markerIsCurrent
  ) {
    return null;
  }
  return current;
}

async function resetFeedbackTask(admin, goal, initialTask, version, phaseIndexes) {
  let current = initialTask;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_TASK_UPDATE_ATTEMPTS; attempt += 1) {
    if (!(await currentFeedbackGoal(admin, goal, version))) return { superseded: true };
    if (!feedbackTaskEligible(goal, current, phaseIndexes)) {
      const error = new Error(
        `apply-feedback: task ${initialTask.id} changed to a non-resettable lifecycle state`
      );
      error.code = 'FEEDBACK_TASK_CONFLICT';
      throw error;
    }
    if (taskResetAlreadyApplied(current, version)) return { task: current, reset: false };
    if (!RESETTABLE_TASK_STATUSES.has(current?.status)) {
      const error = new Error(
        `apply-feedback: task ${initialTask.id} changed to a non-resettable lifecycle state`
      );
      error.code = 'FEEDBACK_TASK_CONFLICT';
      throw error;
    }

    const mutationAt = nextGoalMutationTimestamp(current.updated_at);
    if (!mutationAt) {
      const error = new Error(`apply-feedback: task ${initialTask.id} has no valid timestamp`);
      error.code = 'FEEDBACK_TASK_SNAPSHOT_INCOMPLETE';
      throw error;
    }
    const mutation = {
      status: 'planned',
      data: resetTaskDataForFeedback(current, version, mutationAt),
      updated_at: mutationAt,
    };

    let response = null;
    let writeError = null;
    try {
      let update = admin
        .from('team_tasks')
        .update(mutation)
        .eq('id', current.id)
        .eq('goal_id', goal.id)
        .eq('user_id', goal.user_id)
        .eq('status', current.status)
        .eq('updated_at', current.updated_at);
      update = bindExactJson(update, 'data', current.data);
      response = await update.select('id, user_id, status, data, updated_at').maybeSingle();
      writeError = response?.error || null;
    } catch (error) {
      writeError = error;
    }

    if (!writeError && exactTaskMutationReturned(response?.data, current, mutation)) {
      return { task: response.data, reset: true };
    }
    lastError = writeError;
    try {
      current = await loadFeedbackTask(admin, goal, initialTask.id);
    } catch (error) {
      lastError = error;
      break;
    }
    if (taskResetAlreadyApplied(current, version)) return { task: current, reset: false };
  }

  const error = new Error(
    `apply-feedback: task ${initialTask.id} reset could not be reconciled; operator reconciliation is required`
  );
  error.code = 'FEEDBACK_TASK_UPDATE_RECONCILIATION_REQUIRED';
  error.cause = lastError;
  throw error;
}

async function resetFeedbackTasks(admin, goal, version) {
  if (!(await currentFeedbackGoal(admin, goal, version))) return { superseded: true };
  const phaseIndexes = new Set(feedbackPhaseIndexes(goal.plan));
  if (phaseIndexes.size === 0) {
    const error = new Error('apply-feedback: goal has no feedback execution phases');
    error.code = 'FEEDBACK_TASKS_MISSING';
    throw error;
  }

  const { data: taskRows, error } = await admin
    .from('team_tasks')
    .select('id, goal_id, user_id, status, materialization_attempt, data, updated_at')
    .eq('user_id', goal.user_id)
    .eq('goal_id', goal.id);
  if (error) throw error;

  const tasks = currentGoalTaskAttempt(goal, taskRows || []).filter((task) =>
    phaseIndexes.has(Number(task?.data?.phase_index))
  );
  const taskPhases = new Set(tasks.map((task) => Number(task.data.phase_index)));
  const missingPhase = [...phaseIndexes].find((phaseIndex) => !taskPhases.has(phaseIndex));
  if (tasks.length === 0 || missingPhase !== undefined) {
    const error = new Error(
      `apply-feedback: current execution attempt has no resettable task for phase ${missingPhase ?? 0}`
    );
    error.code = 'FEEDBACK_TASKS_MISSING';
    throw error;
  }

  const expectedTaskIds = tasks.map((task) => String(task.id)).sort();
  for (const task of tasks) {
    const result = await resetFeedbackTask(admin, goal, task, version, phaseIndexes);
    if (result.superseded) return result;
  }
  if (!(await currentFeedbackGoal(admin, goal, version))) return { superseded: true };

  // Re-read the whole current attempt after the per-row CAS writes. This is
  // what turns a sequence of individually exact resets into an exact set: a
  // task inserted, moved, retired, or overwritten during the reset cannot be
  // silently omitted before the continuation is queued.
  const { data: verifiedRows, error: verificationError } = await admin
    .from('team_tasks')
    .select('id, goal_id, user_id, status, data, updated_at')
    .eq('user_id', goal.user_id)
    .eq('goal_id', goal.id);
  if (verificationError) throw verificationError;
  const verifiedTasks = currentGoalTaskAttempt(goal, verifiedRows || []).filter((task) =>
    phaseIndexes.has(Number(task?.data?.phase_index))
  );
  const verifiedTaskIds = verifiedTasks.map((task) => String(task.id)).sort();
  const exactSetReset =
    isDeepStrictEqual(verifiedTaskIds, expectedTaskIds) &&
    verifiedTasks.every(
      (task) =>
        feedbackTaskEligible(goal, task, phaseIndexes) && taskResetAlreadyApplied(task, version)
    );
  if (!exactSetReset) {
    const error = new Error(
      'apply-feedback: exact task reset set could not be verified; operator reconciliation is required'
    );
    error.code = 'FEEDBACK_TASK_SET_RECONCILIATION_REQUIRED';
    throw error;
  }
  return { superseded: false, taskCount: tasks.length };
}

export async function handle(admin, payload, req) {
  const goal = await loadGoal(admin, payload.goalId);
  if (!goal) {
    throw new Error(`apply-feedback: goal ${payload.goalId} not found`);
  }

  const identity = feedbackPayloadIdentity(payload);
  if (!identity.userId || identity.userId !== goal.user_id) {
    throw new Error('apply-feedback: payload owner does not match goal owner');
  }
  if (
    !identity.nonce ||
    !identity.version ||
    identity.commentIds.length === 0 ||
    identity.commentIds.length > MAX_COMMENTS_PER_RUN ||
    identity.uniqueIds.length !== identity.commentIds.length
  ) {
    throw new Error('apply-feedback: invalid feedback application identity');
  }

  // Load only the exact, tenant-owned rows captured by this application. The
  // immutable version below makes edits/reopens supersede an older queued job
  // instead of silently applying a different generation of the same IDs.
  const { data: comments, error } = await admin
    .from('design_comments')
    .select(
      'id, goal_id, user_id, element_selector, element_text, comment_text, status, applied_at, updated_at, created_at'
    )
    .eq('goal_id', goal.id)
    .eq('user_id', goal.user_id)
    .in('id', identity.uniqueIds)
    .order('created_at', { ascending: true });
  if (error) {
    log.warn(req, 'apply-feedback.load.failed', { goalId: goal.id, error: error.message });
    throw error;
  }

  const exactComments = Array.isArray(comments) ? comments : [];
  const currentVersion = buildFeedbackApplicationVersion({
    goalId: goal.id,
    userId: goal.user_id,
    nonce: identity.nonce,
    comments: exactComments,
  });
  const hasExactRows =
    exactComments.length === identity.uniqueIds.length &&
    exactComments.every(
      (comment) =>
        identity.uniqueIds.includes(comment.id) &&
        comment.goal_id === goal.id &&
        comment.user_id === goal.user_id &&
        comment.status === 'applied'
    );
  if (!hasExactRows || currentVersion !== identity.version) {
    log.info(req, 'apply-feedback.application-superseded', {
      goalId: goal.id,
      feedbackApplicationVersion: identity.version,
    });
    return {
      type: 'orchestrate-goal',
      action: 'apply-feedback',
      goalId: goal.id,
      status: 'superseded',
      commentCount: 0,
    };
  }

  const briefAddendum = summarizeCommentsForBrief(exactComments);
  const nativeAuthority = resolveAcceptedNativeGoalAuthority(goal);
  if (nativeAuthority.native) {
    if (!nativeAuthority.ready) {
      const nativeError = new Error(
        `apply-feedback: native scope is not ready (${nativeAuthority.reasons.join(', ')})`
      );
      nativeError.code = 'FEEDBACK_NATIVE_SCOPE_NOT_READY';
      throw nativeError;
    }

    const persisted = await persistNativeFeedbackRevision(admin, {
      initialGoal: goal,
      authority: nativeAuthority,
      identity,
      exactComments,
      feedback: briefAddendum,
    });
    if (persisted.applied) {
      await logGoalEvent(admin, goal.id, 'user_feedback_replan_requested', {
        commentCount: exactComments.length,
        commentIds: identity.uniqueIds,
        feedbackApplicationVersion: identity.version,
        scopeHash: nativeAuthority.packet.scope_hash,
      });
    }

    // Native feedback is a new execution-plan generation inside the same
    // accepted AxWise scope. It must pass through PM planning, team
    // materialization, tools/discovery and Gate 2 again; it can never mutate
    // old tasks or inject an addendum directly into an executor prompt.
    const continuation = await enqueueAgentJob(
      admin,
      {
        id: deterministicAgentJobId('native-design-feedback-pm-planning', {
          goalId: goal.id,
          scopeHash: nativeAuthority.packet.scope_hash,
          feedbackApplicationVersion: identity.version,
        }),
        user_id: goal.user_id,
        payload: {
          type: 'orchestrate-goal',
          action: 'pm-planning',
          goalId: goal.id,
          _userId: goal.user_id,
          userId: goal.user_id,
          user_id: goal.user_id,
          feedbackApplicationVersion: identity.version,
        },
      },
      { idempotent: true }
    );
    if (!['queued', 'running', 'done'].includes(continuation?.status)) {
      throw new Error('apply-feedback: exact native PM continuation was not accepted');
    }

    return {
      type: 'orchestrate-goal',
      action: 'apply-feedback',
      goalId: goal.id,
      status: persisted.applied ? 'applied' : 'already_applied',
      revisionKind: 'native_execution_plan',
      commentCount: exactComments.length,
      resetTaskCount: 0,
      feedbackApplicationVersion: identity.version,
      continuationJobId: continuation.id,
    };
  }

  const persisted = await persistFeedbackApplication(admin, {
    initialGoal: goal,
    identity,
    exactComments,
    briefAddendum,
  });
  const alreadyApplied = !persisted.applied;

  const taskReset = await resetFeedbackTasks(admin, persisted.goal, identity.version);
  if (taskReset.superseded) {
    return {
      type: 'orchestrate-goal',
      action: 'apply-feedback',
      goalId: goal.id,
      status: 'superseded',
      commentCount: 0,
      feedbackApplicationVersion: identity.version,
    };
  }

  if (persisted.applied) {
    // Don't bump iteration — this is a same-iteration touch-up, not a full
    // iterate cycle. The vision-QA persistence layer keys on iteration, so
    // bumping would split the audit trail across rows that aren't really
    // separate iteration attempts.

    await logGoalEvent(admin, goal.id, 'user_feedback_applied', {
      commentCount: exactComments.length,
      commentIds: identity.uniqueIds,
      feedbackApplicationVersion: identity.version,
    });

    await postMessage(admin, {
      goalId: goal.id,
      senderName: 'User Feedback',
      channel: 'team-room',
      message: `User left ${exactComments.length} pin comments on the deployed page. Designer + Developer should address each one and re-deploy.`,
      messageType: 'instruction',
    });
  }

  // Re-enter execution through a deterministic, application-scoped job. This
  // is retried even when the goal mutation was already observed, closing the
  // crash window between persisting the addendum and enqueuing its continuation.
  const continuation = await enqueueAgentJob(
    admin,
    {
      id: deterministicAgentJobId('design-feedback-execute-phase', {
        goalId: goal.id,
        feedbackApplicationVersion: identity.version,
      }),
      user_id: goal.user_id,
      payload: {
        type: 'orchestrate-goal',
        action: 'execute-phase',
        goalId: goal.id,
        phaseIndex: 0,
        _userId: goal.user_id,
        userId: goal.user_id,
        user_id: goal.user_id,
        feedbackApplicationVersion: identity.version,
      },
    },
    { idempotent: true }
  );
  if (!['queued', 'running', 'done'].includes(continuation?.status)) {
    throw new Error('apply-feedback: exact execute-phase continuation was not accepted');
  }

  return {
    type: 'orchestrate-goal',
    action: 'apply-feedback',
    goalId: goal.id,
    status: alreadyApplied ? 'already_applied' : 'applied',
    commentCount: exactComments.length,
    resetTaskCount: taskReset.taskCount,
    feedbackApplicationVersion: identity.version,
    continuationJobId: continuation.id,
  };
}
