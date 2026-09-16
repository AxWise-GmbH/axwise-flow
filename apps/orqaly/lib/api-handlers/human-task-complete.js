/**
 * POST /api/human-task-complete
 *
 * Called by the HumanTaskInbox UI when the Orqaly account owner finishes a
 * manual signup and pastes the API key. Writes the key to encrypted BYOK/Vault,
 * marks the human_tasks row completed, resumes any goals blocked on that
 * task, and fires a credential_provisioned notification.
 *
 * Body: { human_task_id: UUID, api_key: string, claim_only?: boolean,
 *         mark_done?: boolean }
 *   - claim_only=true just sets claimed_at (stops the escalation timer)
 *     without submitting a key yet. The user can then paste the key in a
 *     follow-up request.
 *   - claim_only=false + api_key → full completion.
 *   - mark_done=true completes a task that carries a document instead of a
 *     credential (type 'integration_brief'): the developer wired it, there is
 *     nothing to paste. Refused for credential-type tasks.
 */
import { cors } from '../../api/_lib/cors.js';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  checkRateLimit,
  applyRateLimitHeaders,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { saveUserApiKey } from './_shared/save-user-api-key.js';
import {
  loadToolCredentialSnapshot,
  reserveToolCredentialWrite,
} from './_shared/tool-credential-write-reservation.js';
import {
  bindAgentJobToWorkerDeployment,
  WORKER_DEPLOYMENT_PAYLOAD_KEY,
} from '../agent-handlers/worker-scope.js';
import { wakeAgentJobExact } from '../goal-handlers/_helpers.js';
import { resolveAcceptedNativeGoalAuthority } from '../_shared/native-goal-authority.js';

const log = createLogger('human-task-complete');
const ACTIVE_TASK_STATUSES = ['pending', 'claimed'];
const CREDENTIAL_TASK_TYPES = ['provide_credential', 'provide_key', 'manual_signup'];

function sameTimestamp(left, right) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

/**
 * A credential may resume only the exact tool checkpoint produced by the
 * current completed team attempt. Native rows additionally require the live
 * accepted AxWise authority and exact common/native attempt mirrors.
 */
function credentialProvisioningResumeChain(goal) {
  const team = goal?.data?.team_formation_attempt;
  const tool = goal?.data?.tool_provisioning_attempt;
  const commonReady = Boolean(
    team?.version === 'orqaly_team_formation_attempt_v1' &&
    team.status === 'completed' &&
    team.completed_at &&
    team.attempt_id &&
    tool?.version === 'orqaly_tool_provisioning_attempt_v1' &&
    tool.status === 'awaiting_user' &&
    tool.completed_at &&
    tool.attempt_id &&
    tool.team_formation_attempt_id === team.attempt_id
  );
  if (!commonReady) return null;

  const authority = resolveAcceptedNativeGoalAuthority(goal);
  if (!authority.native) return { native: false, team, tool };
  if (!authority.ready) return null;

  const scopeHash = authority.packet.scope_hash;
  const nativeTeam = goal?.data?.native_team_formation_attempt;
  const nativeTool = goal?.data?.native_tool_provisioning_attempt;
  const nativeReady = Boolean(
    team.scope_hash === scopeHash &&
    tool.scope_hash === scopeHash &&
    nativeTeam?.version === team.version &&
    nativeTeam.attempt_id === team.attempt_id &&
    nativeTeam.status === team.status &&
    nativeTeam.completed_at === team.completed_at &&
    nativeTeam.scope_hash === scopeHash &&
    nativeTool?.version === tool.version &&
    nativeTool.attempt_id === tool.attempt_id &&
    nativeTool.status === tool.status &&
    nativeTool.completed_at === tool.completed_at &&
    nativeTool.scope_hash === scopeHash &&
    nativeTool.team_formation_attempt_id === team.attempt_id
  );
  return nativeReady ? { native: true, team, tool, scopeHash } : null;
}

function hasCompletionReservation(task) {
  const reservation = task?.partial_context?.credential_completion;
  return reservation?.status === 'storing';
}

const TASK_TIMESTAMP_FIELDS = [
  'claimed_at',
  'escalated_at',
  'completed_at',
  'created_at',
  'updated_at',
];

function canonicalTaskSnapshot(task, { ignoreUpdatedAt = false } = {}) {
  if (!task) return null;
  const snapshot = { ...task };
  if (ignoreUpdatedAt) delete snapshot.updated_at;
  for (const field of TASK_TIMESTAMP_FIELDS) {
    if (ignoreUpdatedAt && field === 'updated_at') continue;
    if (snapshot[field] == null) {
      snapshot[field] = null;
      continue;
    }
    const parsed = Date.parse(snapshot[field]);
    snapshot[field] = Number.isFinite(parsed) ? parsed : snapshot[field];
  }
  return snapshot;
}

function sameTaskSnapshot(current, expected, options) {
  return isDeepStrictEqual(
    canonicalTaskSnapshot(current, options),
    canonicalTaskSnapshot(expected, options)
  );
}

async function inspectCompletionReservation(admin, { task, attemptId, claimedAt, partialContext }) {
  try {
    const { data: current, error } = await admin
      .from('human_tasks')
      .select('*')
      .eq('id', task.id)
      .eq('user_id', task.user_id)
      .maybeSingle();
    if (error || !current) return { state: 'unknown', error: error || null };

    const expectedReserved = {
      ...task,
      status: 'claimed',
      claimed_at: claimedAt,
      escalation_allowed: false,
      escalate_after_seconds: null,
      partial_context: partialContext,
    };
    if (
      current.partial_context?.credential_completion?.attempt_id === attemptId &&
      current.partial_context?.credential_completion?.status === 'storing' &&
      sameTaskSnapshot(current, expectedReserved, { ignoreUpdatedAt: true })
    ) {
      return { state: 'committed', task: current };
    }
    if (sameTaskSnapshot(current, task)) return { state: 'original', task: current };
    return { state: 'conflict', task: current };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function reserveCompletionAttempt(admin, { task, attemptId, claimedAt, partialContext }) {
  const patch = {
    status: 'claimed',
    claimed_at: claimedAt,
    escalation_allowed: false,
    escalate_after_seconds: null,
    partial_context: partialContext,
  };

  const updateExact = async () => {
    try {
      return await admin
        .from('human_tasks')
        .update(patch)
        .eq('id', task.id)
        .eq('user_id', task.user_id)
        .eq('status', task.status)
        .is('escalated_at', null)
        .eq('updated_at', task.updated_at)
        .select('*')
        .maybeSingle();
    } catch (error) {
      return { data: null, error };
    }
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await updateExact();
    if (!response.error) {
      if (!response.data) return { state: 'stale' };
      const expected = { ...task, ...patch };
      return sameTaskSnapshot(response.data, expected, { ignoreUpdatedAt: true })
        ? { state: 'committed', task: response.data }
        : { state: 'conflict', task: response.data };
    }

    const inspection = await inspectCompletionReservation(admin, {
      task,
      attemptId,
      claimedAt,
      partialContext,
    });
    if (inspection.state !== 'original' || attempt === 1) return inspection;
  }

  return { state: 'unknown' };
}

async function inspectCompletionFinalization(admin, { reservedTask, completedAt, partialContext }) {
  try {
    const { data: current, error } = await admin
      .from('human_tasks')
      .select('*')
      .eq('id', reservedTask.id)
      .eq('user_id', reservedTask.user_id)
      .maybeSingle();
    if (error || !current) return { state: 'unknown', error: error || null };

    const expectedCompleted = {
      ...reservedTask,
      status: 'completed',
      completed_at: completedAt,
      completed_by: 'user',
      claimed_at: reservedTask.claimed_at,
      partial_context: partialContext,
      submitted_value: { credential_stored: true },
    };
    if (sameTaskSnapshot(current, expectedCompleted, { ignoreUpdatedAt: true })) {
      return { state: 'committed', task: current };
    }
    if (sameTaskSnapshot(current, reservedTask)) return { state: 'original', task: current };
    return { state: 'conflict', task: current };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function finalizeCompletionAttempt(
  admin,
  { reservedTask, attemptId, completedAt, partialContext }
) {
  const patch = {
    status: 'completed',
    completed_at: completedAt,
    completed_by: 'user',
    claimed_at: reservedTask.claimed_at,
    partial_context: partialContext,
    submitted_value: { credential_stored: true },
  };

  const updateExact = async () => {
    try {
      return await admin
        .from('human_tasks')
        .update(patch)
        .eq('id', reservedTask.id)
        .eq('user_id', reservedTask.user_id)
        .eq('status', 'claimed')
        .is('escalated_at', null)
        .eq('updated_at', reservedTask.updated_at)
        .contains('partial_context', {
          credential_completion: { attempt_id: attemptId, status: 'storing' },
        })
        .select('*')
        .maybeSingle();
    } catch (error) {
      return { data: null, error };
    }
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await updateExact();
    if (!response.error && response.data) {
      const expected = { ...reservedTask, ...patch };
      return sameTaskSnapshot(response.data, expected, { ignoreUpdatedAt: true })
        ? { state: 'committed', task: response.data }
        : { state: 'conflict', task: response.data };
    }

    const inspection = await inspectCompletionFinalization(admin, {
      reservedTask,
      completedAt,
      partialContext,
    });
    if (inspection.state !== 'original' || attempt === 1) return inspection;
  }

  return { state: 'unknown' };
}

async function releaseCompletionReservation({
  admin,
  task,
  reservedTask,
  attemptId,
  partialContext,
}) {
  const { data, error } = await admin
    .from('human_tasks')
    .update({
      status: 'claimed',
      partial_context: partialContext,
      escalation_allowed: false,
      escalate_after_seconds: null,
    })
    .eq('id', task.id)
    .eq('user_id', task.user_id)
    .eq('status', 'claimed')
    .is('escalated_at', null)
    .eq('updated_at', reservedTask.updated_at)
    .contains('partial_context', {
      credential_completion: { attempt_id: attemptId, status: 'storing' },
    })
    .select('id')
    .maybeSingle();
  if (error) return error;
  return data ? null : new Error('Completion reservation release lost its exact snapshot');
}

function databaseEffectiveContinuationScope(expectedJob, goalSnapshot) {
  // Migration 196 is authoritative at insert time: a trusted local-only goal
  // always moves its work to the local partition, even when the producing
  // runtime supplied Preview/Production scope. The payload remains bound to
  // the producing deployment exactly as constructed.
  return goalSnapshot?.data?.local_only === true ? 'local' : expectedJob.worker_scope;
}

async function inspectCredentialContinuationJob(admin, expectedJob, goalSnapshot) {
  try {
    const { data: job, error } = await admin
      .from('agent_jobs')
      .select('id, user_id, worker_scope, payload')
      .eq('id', expectedJob.id)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!job) return { state: 'absent' };

    const expectedPayload = expectedJob.payload || {};
    const payload = job.payload || {};
    const payloadMatches =
      Object.keys(payload).length === Object.keys(expectedPayload).length &&
      Object.entries(expectedPayload).every(([key, value]) => payload[key] === value);
    return job.id === expectedJob.id &&
      job.user_id === expectedJob.user_id &&
      job.worker_scope === databaseEffectiveContinuationScope(expectedJob, goalSnapshot) &&
      payloadMatches
      ? { state: 'present' }
      : { state: 'conflict' };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function inspectGoalResumeTransition(
  admin,
  { goalSnapshot, attemptId, continuationJob, humanTaskId, toolId, resumeAt, expectedData }
) {
  try {
    const { data: current, error } = await admin
      .from('goals')
      .select('id, user_id, status, data, updated_at')
      .eq('id', goalSnapshot.id)
      .eq('user_id', goalSnapshot.user_id)
      .maybeSingle();
    if (error || !current) return { state: 'unknown', error: error || null };

    const marker = current.data?.credential_resume;
    if (
      current.status === 'provisioning_tools' &&
      sameTimestamp(current.updated_at, resumeAt) &&
      marker?.attempt_id === attemptId &&
      marker.job_id === continuationJob.id &&
      marker.human_task_id === humanTaskId &&
      marker.tool_id === toolId &&
      marker.status === 'queued' &&
      marker.at === resumeAt &&
      isDeepStrictEqual(current.data || {}, expectedData || {})
    ) {
      return { state: 'committed', goal: current };
    }

    if (
      current.status === goalSnapshot.status &&
      current.updated_at === goalSnapshot.updated_at &&
      isDeepStrictEqual(current.data || {}, goalSnapshot.data || {})
    ) {
      return { state: 'original', goal: current };
    }

    return { state: 'conflict', goal: current };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function inspectCredentialWakePark(admin, transitionedGoal, attemptId, expectedData) {
  try {
    const { data: current, error } = await admin
      .from('goals')
      .select('id, user_id, status, data, updated_at')
      .eq('id', transitionedGoal.id)
      .eq('user_id', transitionedGoal.user_id)
      .maybeSingle();
    if (error || !current) return { state: 'unknown', error: error || null };
    if (
      current.status === 'needs_human' &&
      current.data?.credential_resume?.attempt_id === attemptId &&
      current.data?.credential_resume?.status === 'wake_failed' &&
      isDeepStrictEqual(current.data || {}, expectedData || {})
    ) {
      return { state: 'committed', goal: current };
    }
    if (
      current.status === transitionedGoal.status &&
      sameTimestamp(current.updated_at, transitionedGoal.updated_at) &&
      isDeepStrictEqual(current.data || {}, transitionedGoal.data || {})
    ) {
      return { state: 'original', goal: current };
    }
    return { state: 'conflict', goal: current };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function parkCredentialResumeAfterWakeFailure({ admin, transitionedGoal, attemptId, error }) {
  if (!transitionedGoal) return { state: 'absent' };
  const failedAt = new Date().toISOString();
  const safeError = String(error?.message || error || 'Exact Preview wake failed').slice(0, 500);
  const parkedData = {
    ...(transitionedGoal.data || {}),
    credential_resume: {
      ...(transitionedGoal.data?.credential_resume || {}),
      status: 'wake_failed',
      failed_at: failedAt,
      error: safeError,
      reconciliation_required: true,
    },
    healing_log: [
      ...(transitionedGoal.data?.healing_log || []),
      {
        at: failedAt,
        strategy: 'h45-human-credential',
        action: 'worker-wake-failed',
        job_id: transitionedGoal.data?.credential_resume?.job_id || null,
      },
    ],
  };

  const updateExact = async () => {
    try {
      return await admin
        .from('goals')
        .update({ status: 'needs_human', data: parkedData, updated_at: failedAt })
        .eq('id', transitionedGoal.id)
        .eq('user_id', transitionedGoal.user_id)
        .eq('status', 'provisioning_tools')
        .eq('updated_at', transitionedGoal.updated_at)
        .eq('data->credential_resume->>attempt_id', attemptId)
        .select('id, user_id, status, data, updated_at')
        .maybeSingle();
    } catch (writeError) {
      return { data: null, error: writeError };
    }
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await updateExact();
    if (!response.error && response.data) {
      return response.data.status === 'needs_human' &&
        response.data.data?.credential_resume?.attempt_id === attemptId
        ? { state: 'committed', goal: response.data }
        : { state: 'conflict', goal: response.data };
    }
    const inspection = await inspectCredentialWakePark(
      admin,
      transitionedGoal,
      attemptId,
      parkedData
    );
    if (inspection.state !== 'original' || attempt === 1) return inspection;
  }

  return { state: 'unknown' };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const done = log.startTimer(req, 'request', { method: req.method });
  if (req.method !== 'POST') {
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  }

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized. Sign in and retry.');
  }

  const rlKey = `human-task-complete:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  const { human_task_id, api_key, claim_only, mark_done } = req.body || {};
  if (!human_task_id || typeof human_task_id !== 'string') {
    done({ status: 400 });
    return jsonError(res, 400, 'Missing human_task_id');
  }
  if (!claim_only && !mark_done && (typeof api_key !== 'string' || api_key.trim().length < 8)) {
    done({ status: 400 });
    return jsonError(res, 400, 'api_key is required when claim_only is false (min 8 chars)');
  }

  const admin = buildSupabaseAdminClient();
  if (!admin) {
    done({ status: 503 });
    return jsonError(res, 503, 'Database not configured');
  }

  try {
    // Load + authorize the task
    const { data: task, error: loadErr } = await admin
      .from('human_tasks')
      .select('*')
      .eq('id', human_task_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!task) {
      done({ status: 404 });
      return jsonError(res, 404, 'Task not found');
    }
    if (!ACTIVE_TASK_STATUSES.includes(task.status)) {
      done({ status: 409 });
      return jsonError(res, 409, `Task is ${task.status} and can no longer be changed`);
    }
    if (task.escalated_at) {
      done({ status: 409 });
      return jsonError(res, 409, 'Task is currently being escalated. Retry shortly.');
    }

    const nowIso = new Date().toISOString();

    // Claim-only path: just stop the escalation timer.
    if (claim_only) {
      if (task.status === 'claimed' && task.claimed_at) {
        done({ status: 200, claimed: true, idempotent: true });
        return res.status(200).json({ ok: true, claimed: true, task_id: human_task_id });
      }

      const { data: claimedTask, error: claimError } = await admin
        .from('human_tasks')
        .update({
          status: 'claimed',
          claimed_at: nowIso,
        })
        .eq('id', human_task_id)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .is('claimed_at', null)
        .is('escalated_at', null)
        .eq('updated_at', task.updated_at)
        .select('id')
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimedTask) {
        done({ status: 409 });
        return jsonError(res, 409, 'Task changed before it could be claimed. Refresh and retry.');
      }
      done({ status: 200, claimed: true });
      return res.status(200).json({ ok: true, claimed: true, task_id: human_task_id });
    }

    // Document-style completion: no credential involved, nothing to store.
    if (mark_done) {
      if (task.type !== 'integration_brief') {
        done({ status: 400 });
        return jsonError(res, 400, 'This task needs an API key, not a mark-done');
      }
      const { data: completedTask, error: completeError } = await admin
        .from('human_tasks')
        .update({
          status: 'completed',
          completed_at: nowIso,
          completed_by: 'user',
          claimed_at: task.claimed_at || nowIso,
          submitted_value: { marked_done: true },
        })
        .eq('id', human_task_id)
        .eq('user_id', user.id)
        .in('status', ACTIVE_TASK_STATUSES)
        .is('escalated_at', null)
        .eq('updated_at', task.updated_at)
        .select('id')
        .maybeSingle();
      if (completeError) throw completeError;
      if (!completedTask) {
        done({ status: 409 });
        return jsonError(res, 409, 'Task changed before completion. Refresh and retry.');
      }
      done({ status: 200, completed: true, markDone: true });
      return res.status(200).json({ ok: true, task_id: human_task_id, marked_done: true });
    }

    // Full completion: write the key, resume blocked goal, notify.
    if (!CREDENTIAL_TASK_TYPES.includes(task.type)) {
      done({ status: 400 });
      return jsonError(res, 400, 'This task does not accept an API key');
    }
    const trimmedKey = api_key.trim();

    // Read-only validation can happen before the reservation. No credential or
    // tool state is changed until this request owns the exact task snapshot.
    const loadedTool = await loadToolCredentialSnapshot({
      admin,
      userId: user.id,
      toolId: task.tool_id,
    });
    if (!loadedTool.ok) {
      done({ status: loadedTool.status || 503, code: loadedTool.code });
      return jsonError(res, loadedTool.status || 503, loadedTool.message);
    }
    const existingTool = loadedTool.snapshot;

    if (hasCompletionReservation(task)) {
      done({ status: 409 });
      return jsonError(res, 409, 'Another credential submission is already in progress.');
    }

    // 1. Exclusively reserve this completion attempt before Vault/tool writes.
    // The opaque attempt id contains no credential material. A conservative
    // marker blocks until this attempt explicitly releases or completes; a
    // time-only takeover could race a slow Vault write from the prior process.
    const attemptId = randomUUID();
    const basePartialContext = { ...(task.partial_context || {}) };
    delete basePartialContext.credential_completion;
    const reservationStartedAt = new Date().toISOString();
    const reservedPartialContext = {
      ...basePartialContext,
      credential_completion: {
        attempt_id: attemptId,
        status: 'storing',
        started_at: reservationStartedAt,
      },
    };
    const reservation = await reserveCompletionAttempt(admin, {
      task,
      attemptId,
      claimedAt: task.claimed_at || reservationStartedAt,
      partialContext: reservedPartialContext,
    });
    if (reservation.state === 'stale') {
      done({ status: 409 });
      return jsonError(res, 409, 'Task changed before credential storage. Refresh and retry.');
    }
    if (reservation.state === 'original') {
      done({ status: 503 });
      return jsonError(res, 503, 'Credential submission could not be reserved. Retry safely.');
    }
    if (reservation.state !== 'committed') {
      log.error(req, 'human-task-complete.reservation-needs-reconciliation', {
        humanTaskId: human_task_id,
        attemptId,
        inspectionState: reservation.state,
        error: reservation.error?.message || null,
      });
      done({ status: 503 });
      return jsonError(
        res,
        503,
        'Credential submission reservation needs reconciliation. Refresh before retrying.'
      );
    }
    const reservedTask = reservation.task;
    if (!reservedTask) {
      done({ status: 409 });
      return jsonError(res, 409, 'Task changed before credential storage. Refresh and retry.');
    }

    // Snapshot the exact blocked goal before credential writes. A later CAS
    // decides whether this completion still owns the resume transition; a
    // concurrent cancel/edit wins and the credential can complete without
    // reviving the goal.
    let goalSnapshot = null;
    let goalResumeChain = null;
    let continuationJob = null;
    if (task.goal_id) {
      try {
        const { data: goal, error: goalError } = await admin
          .from('goals')
          .select('id, user_id, data, status, updated_at')
          .eq('id', task.goal_id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (goalError) throw goalError;
        const resumeChain = credentialProvisioningResumeChain(goal);
        if (
          goal?.status === 'awaiting_tools' &&
          goal.data?.blocked_by_human_task_id === human_task_id &&
          resumeChain
        ) {
          goalSnapshot = goal;
          goalResumeChain = resumeChain;
          continuationJob = bindAgentJobToWorkerDeployment({
            id: randomUUID(),
            user_id: goal.user_id,
            status: 'queued',
            payload: {
              type: 'orchestrate-goal',
              action: 'tool-provisioning',
              goalId: task.goal_id,
              _userId: goal.user_id,
              userId: goal.user_id,
              user_id: goal.user_id,
              _healedBy: 'h45-human-credential',
              _healAt: nowIso,
              _credentialResumeAttemptId: attemptId,
              _teamFormationAttemptId: resumeChain.team.attempt_id,
              _toolProvisioningAttemptId: resumeChain.tool.attempt_id,
            },
          });
          if (
            continuationJob.worker_scope === 'preview' &&
            !continuationJob.payload?.[WORKER_DEPLOYMENT_PAYLOAD_KEY]
          ) {
            const releaseError = await releaseCompletionReservation({
              admin,
              task,
              reservedTask,
              attemptId,
              partialContext: basePartialContext,
            });
            if (releaseError) throw releaseError;
            done({ status: 503 });
            return jsonError(res, 503, 'Credential continuation worker is unavailable');
          }
        }
      } catch (err) {
        await releaseCompletionReservation({
          admin,
          task,
          reservedTask,
          attemptId,
          partialContext: basePartialContext,
        });
        throw err;
      }
    }

    // 2. Reserve the exact tool snapshot immediately before Vault. The task
    // reservation and tool reservation are independent, permanent fences: a
    // competing manual/tool writer wins safely before either key can persist.
    const reservedTool = await reserveToolCredentialWrite({
      admin,
      userId: user.id,
      toolSnapshot: existingTool,
      source: 'human-task-complete',
    });
    if (!reservedTool.ok) {
      if (reservedTool.reconciliationRequired) {
        done({ status: 503, code: reservedTool.code });
        return jsonError(
          res,
          503,
          'Tool credential reservation needs reconciliation. Refresh before retrying.'
        );
      }
      const releaseError = await releaseCompletionReservation({
        admin,
        task,
        reservedTask,
        attemptId,
        partialContext: basePartialContext,
      });
      if (releaseError) throw releaseError;
      done({ status: reservedTool.status || 409, code: reservedTool.code });
      return jsonError(res, reservedTool.status || 409, reservedTool.message);
    }

    // 3. Persist in the encrypted per-user BYOK store. This is authoritative:
    // never complete/resume the task if encryption or Vault storage fails.
    // An unexpected throw reaches the outer handler with both server-owned
    // markers intact, so a retry cannot overlap a still-running/committed write.
    const saved = await saveUserApiKey({
      userId: user.id,
      provider: `tool:${task.tool_id}`,
      label: existingTool.name,
      apiKey: trimmedKey,
      skipProbe: true,
      adminClient: admin,
      toolCredentialReservation: reservedTool.reservation,
    });
    if (!saved.success) {
      if (saved.reconciliationRequired) {
        done({ status: 503, code: saved.code });
        return jsonError(
          res,
          503,
          'Credential storage needs reconciliation. Refresh before retrying.'
        );
      }
      const releaseError = await releaseCompletionReservation({
        admin,
        task,
        reservedTask,
        attemptId,
        partialContext: basePartialContext,
      });
      if (releaseError) throw releaseError;
      done({ status: 503, code: saved.code });
      return jsonError(res, 503, 'Encrypted credential storage unavailable');
    }

    // 4. When the exact blocked goal snapshot is still current, transition it
    // with a continuation marker and make the exact bound queue row durable
    // before completing the human task.
    let resumedGoalId = null;
    let continuationJobId = null;
    let continuationJobToWake = null;
    let transitionedGoalSnapshot = null;
    if (goalSnapshot && continuationJob) {
      const resumeAt = new Date().toISOString();
      const resumedData = { ...(goalSnapshot.data || {}) };
      delete resumedData.blocked_by_human_task_id;
      delete resumedData.blocked_by_job_id;
      delete resumedData.sandris_needs_human;
      delete resumedData.manual_credential_checkpoint;
      delete resumedData.failure_reason;
      delete resumedData.failure_stage;
      delete resumedData.failure_at;
      delete resumedData.h40_skipped_reason;
      resumedData.credential_resume = {
        attempt_id: attemptId,
        job_id: continuationJob.id,
        human_task_id,
        tool_id: task.tool_id,
        status: 'queued',
        next_action: 'tool-provisioning',
        source_team_formation_attempt_id: goalResumeChain.team.attempt_id,
        source_tool_provisioning_attempt_id: goalResumeChain.tool.attempt_id,
        at: resumeAt,
      };
      resumedData.healing_log = [
        ...(goalSnapshot.data?.healing_log || []),
        {
          at: resumeAt,
          strategy: 'h45-human-credential',
          action: 'user-completed',
          human_task_id,
          tool_id: task.tool_id,
          job_id: continuationJob.id,
        },
      ];

      let transition;
      try {
        let transitionQuery = admin
          .from('goals')
          .update({ status: 'provisioning_tools', data: resumedData, updated_at: resumeAt })
          .eq('id', goalSnapshot.id)
          .eq('user_id', user.id)
          .eq('status', 'awaiting_tools')
          .eq('updated_at', goalSnapshot.updated_at)
          .eq('data->>blocked_by_human_task_id', human_task_id)
          .eq('data->team_formation_attempt->>version', goalResumeChain.team.version)
          .eq('data->team_formation_attempt->>attempt_id', goalResumeChain.team.attempt_id)
          .eq('data->team_formation_attempt->>status', 'completed')
          .eq('data->team_formation_attempt->>completed_at', goalResumeChain.team.completed_at)
          .eq('data->tool_provisioning_attempt->>version', goalResumeChain.tool.version)
          .eq('data->tool_provisioning_attempt->>attempt_id', goalResumeChain.tool.attempt_id)
          .eq('data->tool_provisioning_attempt->>status', 'awaiting_user')
          .eq('data->tool_provisioning_attempt->>completed_at', goalResumeChain.tool.completed_at)
          .eq(
            'data->tool_provisioning_attempt->>team_formation_attempt_id',
            goalResumeChain.team.attempt_id
          );
        if (goalResumeChain.native) {
          transitionQuery = transitionQuery
            .eq('data->native_team_formation_attempt->>attempt_id', goalResumeChain.team.attempt_id)
            .eq('data->native_team_formation_attempt->>status', 'completed')
            .eq('data->native_team_formation_attempt->>scope_hash', goalResumeChain.scopeHash)
            .eq(
              'data->native_tool_provisioning_attempt->>attempt_id',
              goalResumeChain.tool.attempt_id
            )
            .eq('data->native_tool_provisioning_attempt->>status', 'awaiting_user')
            .eq('data->native_tool_provisioning_attempt->>scope_hash', goalResumeChain.scopeHash);
        }
        transition = await transitionQuery
          .select('id, user_id, status, data, updated_at')
          .maybeSingle();
      } catch (error) {
        transition = { data: null, error };
      }

      if (transition.error) {
        const inspection = await inspectGoalResumeTransition(admin, {
          goalSnapshot,
          attemptId,
          continuationJob,
          humanTaskId: human_task_id,
          toolId: task.tool_id,
          resumeAt,
          expectedData: resumedData,
        });
        if (inspection.state === 'committed') {
          transition = { data: inspection.goal, error: null };
        } else if (inspection.state === 'original') {
          const releaseError = await releaseCompletionReservation({
            admin,
            task,
            reservedTask,
            attemptId,
            partialContext: basePartialContext,
          });
          if (releaseError) throw releaseError;
          done({ status: 503 });
          return jsonError(res, 503, 'Blocked goal could not be prepared for continuation');
        } else {
          log.error(req, 'human-task-complete.goal-transition-needs-reconciliation', {
            goalId: goalSnapshot.id,
            jobId: continuationJob.id,
            inspectionState: inspection.state,
            error: transition.error?.message || null,
            inspectionError: inspection.error?.message || null,
          });
          done({ status: 503 });
          return jsonError(
            res,
            503,
            'Credential continuation needs reconciliation. Refresh before retrying.'
          );
        }
      }

      const transitionedGoal = transition.data;
      if (transitionedGoal) {
        let enqueueError = null;
        try {
          // Bind at the durable write boundary as well as at construction time.
          // This keeps every direct producer inside the same trusted runtime
          // policy and prevents a future refactor from inserting an unbound row.
          const result = await admin
            .from('agent_jobs')
            .insert(bindAgentJobToWorkerDeployment(continuationJob));
          enqueueError = result?.error || null;
        } catch (err) {
          enqueueError = err;
        }

        if (enqueueError) {
          const inspection = await inspectCredentialContinuationJob(
            admin,
            continuationJob,
            goalSnapshot
          );
          if (inspection.state === 'unknown') {
            log.error(req, 'human-task-complete.enqueue-outcome-unknown', {
              goalId: goalSnapshot.id,
              jobId: continuationJob.id,
              error: enqueueError.message,
              inspectionError: inspection.error?.message || null,
            });
            done({ status: 503 });
            return jsonError(
              res,
              503,
              'Credential continuation outcome is unknown. Refresh before retrying.'
            );
          }

          if (inspection.state !== 'present') {
            const rollbackAt = new Date().toISOString();
            const { data: rolledBack, error: rollbackError } = await admin
              .from('goals')
              .update({
                status: goalSnapshot.status,
                data: goalSnapshot.data,
                updated_at: rollbackAt,
              })
              .eq('id', goalSnapshot.id)
              .eq('user_id', user.id)
              .eq('status', 'provisioning_tools')
              .eq('updated_at', transitionedGoal.updated_at)
              .eq('data->credential_resume->>attempt_id', attemptId)
              .select('id')
              .maybeSingle();
            const rollbackSucceeded = !rollbackError && Boolean(rolledBack);
            const releaseError = rollbackSucceeded
              ? await releaseCompletionReservation({
                  admin,
                  task,
                  reservedTask,
                  attemptId,
                  partialContext: basePartialContext,
                })
              : null;
            log.error(req, 'human-task-complete.enqueue-failed', {
              goalId: goalSnapshot.id,
              jobId: continuationJob.id,
              inspectionState: inspection.state,
              rollbackSucceeded,
              rollbackError: rollbackError?.message || null,
              releaseError: releaseError?.message || null,
            });
            done({ status: 503 });
            return jsonError(
              res,
              503,
              rollbackSucceeded && !releaseError
                ? 'Credential was saved, but the goal continuation could not be queued. Retry safely.'
                : 'Credential continuation needs reconciliation. Refresh before retrying.'
            );
          }
        }

        resumedGoalId = goalSnapshot.id;
        continuationJobId = continuationJob.id;
        // Migration 196 deliberately moves local_only work into the local
        // partition at insert time. A cloud Preview/Production exact wake can
        // never claim that row; the durable local worker poller owns it.
        // Avoid treating that valid cross-scope handoff as a failed cloud wake.
        continuationJobToWake =
          databaseEffectiveContinuationScope(continuationJob, goalSnapshot) === 'local'
            ? null
            : continuationJob;
        transitionedGoalSnapshot = transitionedGoal;
      }
    }

    // 5. Finalize only the reservation owned by this request and remove its
    // marker without retaining credential material. Any required continuation
    // is already durable at this point.
    const completion = await finalizeCompletionAttempt(admin, {
      reservedTask,
      attemptId,
      completedAt: nowIso,
      partialContext: basePartialContext,
    });
    if (completion.state === 'original') {
      log.error(req, 'human-task-complete.finalization-proven-original', {
        humanTaskId: human_task_id,
        attemptId,
      });
      done({ status: 503 });
      return res.status(503).json({
        error:
          'Credential was stored, but task completion is locked pending operator reconciliation.',
        code: 'CREDENTIAL_COMPLETION_RECONCILIATION_REQUIRED',
      });
    }
    if (completion.state !== 'committed') {
      log.error(req, 'human-task-complete.finalization-needs-reconciliation', {
        humanTaskId: human_task_id,
        attemptId,
        inspectionState: completion.state,
        error: completion.error?.message || null,
      });
      done({ status: 503 });
      return jsonError(
        res,
        503,
        'Credential task completion needs reconciliation. Refresh before retrying.'
      );
    }

    // The exact wake is awaited after finalization. Preview has no polling
    // fallback, so wakeAgentJobExact rejects (and terminalizes the exact queued
    // row) unless its targeted request receives a 2xx response.
    if (resumedGoalId && continuationJobId && continuationJobToWake) {
      try {
        await wakeAgentJobExact(admin, continuationJobToWake);
      } catch (err) {
        const parked = await parkCredentialResumeAfterWakeFailure({
          admin,
          transitionedGoal: transitionedGoalSnapshot,
          attemptId,
          error: err,
        });
        log.error(req, 'human-task-complete.exact-wake-failed', {
          error: err.message,
          goalId: resumedGoalId,
          jobId: continuationJobId,
          parkState: parked.state,
          parkError: parked.error?.message || null,
        });
        done({ status: 503 });
        return res.status(503).json({
          error:
            parked.state === 'committed'
              ? 'Credential was saved, but its continuation worker could not be awakened. The goal was parked for recovery.'
              : 'Credential was saved, but its continuation needs operator reconciliation.',
          code:
            parked.state === 'committed'
              ? 'CREDENTIAL_CONTINUATION_PARKED'
              : 'CREDENTIAL_CONTINUATION_RECONCILIATION_REQUIRED',
          credential_stored: true,
          task_completed: true,
          goal_id: resumedGoalId,
          job_id: continuationJobId,
          goal_parked: parked.state === 'committed',
          reconciliation_state: parked.state,
        });
      }

      // Audit is best effort only after the durable task and exact wake agree.
      try {
        await admin.from('goal_log').insert({
          goal_id: resumedGoalId,
          event_type: 'goal_credential_arrived',
          details: {
            strategy: 'h45-human-credential',
            human_task_id,
            tool_id: task.tool_id,
            completed_by: 'user',
            job_id: continuationJobId,
          },
        });
      } catch (err) {
        log.warn(req, 'human-task-complete.resume-log-failed', {
          error: err.message,
          goalId: resumedGoalId,
        });
      }
    }

    // 6. Notify credential ready (same shape as Phase 1's stepNotifyReady)
    const host = (() => {
      try {
        return new URL(task.provider_url || '').host;
      } catch {
        return task.provider_url || 'provider';
      }
    })();
    try {
      await admin.from('notification_log').insert({
        user_id: user.id,
        channel: 'in_app',
        event_type: 'credential_provisioned',
        subject: `Credential ready: ${host}`,
        body: `You provided an encrypted API credential for ${host}. It's saved and ready for other agents to use.${resumedGoalId ? ' The blocked goal has been resumed.' : ''}`,
        status: 'sent',
        sent_at: nowIso,
        metadata: {
          priority: 'normal',
          tool_id: task.tool_id,
          provider_url: task.provider_url,
          agent_name: 'Human',
          agent_role: 'Orqaly Account Owner',
          credential_stored: true,
          human_task_id,
          resumed_goal_ids: resumedGoalId ? [resumedGoalId] : [],
          action: resumedGoalId
            ? { type: 'view_goal', label: 'Open goal', target_url: `/goals?id=${resumedGoalId}` }
            : { type: 'view_tool', label: 'Open tool', target_url: '/agent-hub?tab=tools' },
        },
      });
    } catch {
      /* best effort */
    }

    done({ status: 200, completed: true, resumedGoalId });
    return res.status(200).json({
      ok: true,
      task_id: human_task_id,
      tool_id: task.tool_id,
      credential_stored: true,
      resumed_goal_id: resumedGoalId,
    });
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'human-task-complete');
  }
}
