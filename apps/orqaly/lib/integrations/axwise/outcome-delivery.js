/**
 * Durable AxWise Phase 4 delivery.
 *
 * Goal completion is local and final. This module records the independent
 * AxWise delivery lifecycle and retries a failed report through agent_jobs.
 */
import { reportGoalOutcome } from './outcomes.js';
import {
  resolveWorkerDeploymentIdentity,
  resolveWorkerScope,
  WORKER_DEPLOYMENT_PAYLOAD_KEY,
} from '../../agent-handlers/worker-scope.js';
import { enqueueAgentJob, wakeAgentJobExact } from '../../goal-handlers/_helpers.js';

const ACTIVE_JOB_STATUSES = ['queued', 'running'];
const OUTCOME_JOB_TYPE = 'axwise-outcome';
const DELIVERY_STATE_CAS_ATTEMPTS = 3;
const DELIVERY_STATE_UNCHANGED = Symbol('axwise-delivery-state-unchanged');

function now() {
  return new Date().toISOString();
}

function textId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function retryAttempt(value, { required = false } = {}) {
  if (!required && (value === null || value === undefined || value === '')) return null;
  const attempt = Number(value);
  if (Number.isInteger(attempt) && attempt >= 0) return attempt;
  throw new Error('AxWise outcome delivery requires an exact queue retry attempt');
}

function currentDecisionId(currentData) {
  return textId(currentData?.axwise_orchestration?.decision_id);
}

function persistedOutcomeMatches(currentData, decisionId = currentDecisionId(currentData)) {
  const outcome = currentData?.axwise_outcome;
  return Boolean(
    decisionId &&
    outcome?.outcome_id &&
    outcome?.reported_at &&
    textId(outcome.decision_id) === decisionId
  );
}

function deliveryAttemptBinding(delivery) {
  const decisionId = textId(delivery?.decision_id);
  const attempt = Number(delivery?.attempts);
  if (!decisionId || !Number.isInteger(attempt) || attempt < 1) return null;
  return Object.freeze({
    decisionId,
    attempt,
    retryJobId: textId(delivery?.retry_job_id),
    retryAttempt: retryAttempt(delivery?.retry_attempt),
  });
}

function sameDeliveryAttempt(delivery, binding) {
  const current = deliveryAttemptBinding(delivery);
  return Boolean(
    current &&
    binding &&
    current.decisionId === binding.decisionId &&
    current.attempt === binding.attempt &&
    current.retryJobId === binding.retryJobId &&
    current.retryAttempt === binding.retryAttempt
  );
}

function queueBinding(jobId, queueRetryAttempt) {
  const retryJobId = textId(jobId);
  if (!retryJobId) {
    if (queueRetryAttempt !== null && queueRetryAttempt !== undefined) {
      throw new Error('AxWise outcome delivery queue attempt has no retry job');
    }
    return { retryJobId: null, retryAttempt: null };
  }
  return {
    retryJobId,
    retryAttempt: retryAttempt(queueRetryAttempt, { required: true }),
  };
}

function exactPayloadDecisionId(payload, operation) {
  const decisionId = textId(payload?.decisionId);
  const decisionAlias = textId(payload?.decision_id);
  if (!decisionId || (decisionAlias && decisionAlias !== decisionId)) {
    throw new Error(`AxWise outcome ${operation} requires exact decisionId`);
  }
  return decisionId;
}

function errorDetails(error) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error?.message || 'Unknown AxWise outcome delivery error';
  return {
    message: String(message).slice(0, 500),
    code: String(error?.code || 'AXWISE_OUTCOME_DELIVERY_FAILED').slice(0, 100),
  };
}

function ineligibilityReason(goal) {
  if (!goal?.id || !goal?.org_id || !goal?.user_id) return 'goal_context_incomplete';
  const orchestration = goal?.data?.axwise_orchestration;
  if (!orchestration?.decision_id) return 'decision_missing';
  if (orchestration.applied !== true) return 'decision_not_applied';
  if (orchestration.feasible !== true) return 'decision_not_feasible';
  return null;
}

function isEligible(goal) {
  return ineligibilityReason(goal) === null;
}

function reportedOutcomeMatches(goal) {
  return persistedOutcomeMatches(goal?.data);
}

async function goalQuery(admin, goalId, userId, columns = 'data') {
  let query = admin.from('goals').select(columns).eq('id', goalId);
  if (userId) query = query.eq('user_id', userId);
  return query.single();
}

async function mutateDeliveryState(admin, goal, mutate, expectedUserId = null) {
  const goalId = goal?.id || goal;
  const embeddedUserId = goal?.user_id || null;
  const userId = expectedUserId || embeddedUserId;
  if (!goalId) throw new Error('AxWise outcome delivery requires goalId');
  if (!userId) throw new Error('AxWise outcome delivery requires an expected user owner');
  if (expectedUserId && embeddedUserId && expectedUserId !== embeddedUserId) {
    throw new Error('AxWise outcome delivery owner mismatch');
  }

  for (let attempt = 0; attempt < DELIVERY_STATE_CAS_ATTEMPTS; attempt += 1) {
    const { data: current, error: loadError } = await goalQuery(
      admin,
      goalId,
      userId,
      'id, user_id, data, status, updated_at'
    );
    if (loadError || !current) {
      throw new Error(
        `Unable to load AxWise outcome delivery state: ${loadError?.message || 'goal not found'}`
      );
    }

    const currentData = current.data || {};
    const previous =
      currentData.axwise_outcome_delivery &&
      typeof currentData.axwise_outcome_delivery === 'object' &&
      !Array.isArray(currentData.axwise_outcome_delivery)
        ? currentData.axwise_outcome_delivery
        : {};
    const next = mutate(previous, currentData);
    if (next === DELIVERY_STATE_UNCHANGED) return previous;
    let update = admin
      .from('goals')
      .update({
        data: { ...currentData, axwise_outcome_delivery: next },
        updated_at: now(),
      })
      .eq('id', goalId)
      .eq('user_id', userId);
    update =
      current.status === null || current.status === undefined
        ? update.is('status', null)
        : update.eq('status', current.status);
    update =
      current.updated_at === null || current.updated_at === undefined
        ? update.is('updated_at', null)
        : update.eq('updated_at', current.updated_at);
    update =
      current.data === null || current.data === undefined
        ? update.is('data', null)
        : update.eq('data', JSON.stringify(current.data));

    const { data: updated, error: updateError } = await update.select('id').maybeSingle();
    if (updateError) {
      throw new Error(`Unable to persist AxWise outcome delivery state: ${updateError.message}`);
    }
    if (updated) return next;
  }
  throw new Error('Unable to persist AxWise outcome delivery state: concurrent update conflict');
}

async function loadOutcomeGoal(admin, goalId, userId = null) {
  const { data, error } = await goalQuery(admin, goalId, userId, '*');
  if (error || !data) {
    throw new Error(`Unable to load AxWise outcome goal: ${error?.message || goalId}`);
  }
  return data;
}

function reportedDeliveryState(previous, currentData, binding, { recovered = false } = {}) {
  if (!binding || !persistedOutcomeMatches(currentData, binding.decisionId)) {
    throw new Error('AxWise outcome reported state requires matching immutable outcome proof');
  }
  return {
    ...previous,
    status: 'reported',
    decision_id: binding.decisionId,
    attempts: binding.attempt,
    retry_job_id: binding.retryJobId,
    retry_attempt: binding.retryAttempt,
    reported_at: currentData.axwise_outcome.reported_at || now(),
    last_error: null,
    last_error_code: null,
    final_failed_at: null,
    recovered_from_persisted_outcome:
      recovered || previous.recovered_from_persisted_outcome || false,
  };
}

async function markPendingAttempt(admin, goal, { source, jobId, queueRetryAttempt } = {}) {
  const attemptedAt = now();
  const expectedDecisionId = currentDecisionId(goal?.data);
  const queued = queueBinding(jobId, queueRetryAttempt);
  if (!expectedDecisionId) throw new Error('AxWise outcome delivery requires decisionId');
  return mutateDeliveryState(admin, goal, (previous, currentData) => {
    const decisionId = currentDecisionId(currentData);
    if (decisionId !== expectedDecisionId) {
      throw new Error('AxWise outcome delivery decision changed before attempt claim');
    }

    const previousBinding = deliveryAttemptBinding(previous);
    if (
      previous.status === 'reported' &&
      previousBinding?.decisionId === decisionId &&
      persistedOutcomeMatches(currentData, decisionId)
    ) {
      return DELIVERY_STATE_UNCHANGED;
    }
    if (
      previous.status === 'pending' &&
      previousBinding?.decisionId === decisionId &&
      previousBinding.retryJobId === queued.retryJobId &&
      previousBinding.retryAttempt === queued.retryAttempt
    ) {
      return DELIVERY_STATE_UNCHANGED;
    }
    if (previous.status === 'final_failure' && previousBinding?.decisionId === decisionId) {
      return DELIVERY_STATE_UNCHANGED;
    }

    const binding = {
      decisionId,
      attempt: previousBinding?.decisionId === decisionId ? previousBinding.attempt + 1 : 1,
      ...queued,
    };
    if (persistedOutcomeMatches(currentData, decisionId)) {
      return reportedDeliveryState(previous, currentData, binding, { recovered: true });
    }
    return {
      ...previous,
      status: 'pending',
      decision_id: binding.decisionId,
      attempts: binding.attempt,
      retry_job_id: binding.retryJobId,
      retry_attempt: binding.retryAttempt,
      first_attempt_at: previous.first_attempt_at || attemptedAt,
      last_attempt_at: attemptedAt,
      last_error: null,
      last_error_code: null,
      final_failed_at: null,
      source: source || previous.source || 'goal-completion',
    };
  });
}

async function markPendingFailure(admin, goal, error, binding) {
  const details = errorDetails(error);
  return mutateDeliveryState(admin, goal, (previous, currentData) => {
    if (previous.status === 'reported') return DELIVERY_STATE_UNCHANGED;
    if (previous.status !== 'pending' || !sameDeliveryAttempt(previous, binding)) {
      return DELIVERY_STATE_UNCHANGED;
    }
    if (persistedOutcomeMatches(currentData, binding.decisionId)) {
      return reportedDeliveryState(previous, currentData, binding, { recovered: true });
    }
    return {
      ...previous,
      status: 'pending',
      last_error: details.message,
      last_error_code: details.code,
    };
  });
}

async function markReported(
  admin,
  goal,
  { binding: expectedBinding = null, jobId, queueRetryAttempt, recovered = false } = {}
) {
  const queued = queueBinding(jobId, queueRetryAttempt);
  return mutateDeliveryState(admin, goal, (previous, currentData) => {
    const decisionId = currentDecisionId(currentData);
    if (!persistedOutcomeMatches(currentData, decisionId)) {
      throw new Error('AxWise outcome reported state requires current immutable outcome proof');
    }

    const binding = expectedBinding || deliveryAttemptBinding(previous);
    if (
      !binding ||
      binding.decisionId !== decisionId ||
      binding.retryJobId !== queued.retryJobId ||
      binding.retryAttempt !== queued.retryAttempt
    ) {
      return DELIVERY_STATE_UNCHANGED;
    }
    if (previous.status === 'reported') return DELIVERY_STATE_UNCHANGED;
    if (
      !['pending', 'final_failure'].includes(previous.status) ||
      !sameDeliveryAttempt(previous, binding)
    ) {
      return DELIVERY_STATE_UNCHANGED;
    }
    return reportedDeliveryState(previous, currentData, binding, { recovered });
  });
}

async function markSkipped(admin, goal, reason, { jobId } = {}) {
  return mutateDeliveryState(admin, goal, (previous, currentData) => {
    if (previous.status === 'reported' || persistedOutcomeMatches(currentData)) {
      return DELIVERY_STATE_UNCHANGED;
    }
    return {
      ...previous,
      status: 'skipped',
      decision_id: currentDecisionId(currentData),
      skipped_at: previous.skipped_at || now(),
      skip_reason: reason,
      last_error: null,
      last_error_code: null,
      final_failed_at: null,
      retry_job_id: textId(jobId),
      retry_attempt: null,
    };
  });
}

function resolveOutcomeRetryRuntime(env = process.env) {
  const workerScope = resolveWorkerScope(env);
  const deploymentIdentity = resolveWorkerDeploymentIdentity(env);
  if (workerScope === 'preview' && !deploymentIdentity) {
    const error = new Error(
      'AxWise outcome retry requires an immutable Preview deployment identity'
    );
    error.code = 'AXWISE_OUTCOME_PREVIEW_IDENTITY_UNAVAILABLE';
    throw error;
  }
  return { workerScope, deploymentIdentity };
}

async function findActiveOutcomeJob(
  admin,
  goalId,
  userId,
  decisionId,
  { workerScope, deploymentIdentity }
) {
  let query = admin
    .from('agent_jobs')
    .select('id, status, retry_count, worker_scope, payload')
    .eq('user_id', userId)
    .eq('worker_scope', workerScope)
    .eq('payload->>type', OUTCOME_JOB_TYPE)
    .eq('payload->>goalId', String(goalId))
    .eq('payload->>decisionId', String(decisionId))
    .in('status', ACTIVE_JOB_STATUSES);
  if (workerScope === 'preview') {
    query = query.eq(`payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`, deploymentIdentity);
  }
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new Error(`Unable to inspect AxWise outcome retry jobs: ${error.message}`);
  return data || null;
}

/** Report once, recording a durable attempt independently of goal.status. */
export async function deliverGoalOutcome(admin, goal, { source, jobId, queueRetryAttempt } = {}) {
  const skipReason = ineligibilityReason(goal);
  if (skipReason) {
    if (goal?.id && goal?.data?.axwise_orchestration?.decision_id) {
      await markSkipped(admin, goal, skipReason, { jobId });
    }
    return { status: 'skipped', reason: skipReason };
  }

  // The AxWise call already succeeded if the immutable outcome record was
  // stored but the separate delivery marker failed. Recover without another
  // network request (the remote endpoint is idempotent too).
  if (reportedOutcomeMatches(goal)) {
    await markReported(admin, goal, { jobId, queueRetryAttempt, recovered: true });
    return { status: 'reported', reused: true };
  }

  const pendingState = await markPendingAttempt(admin, goal, {
    source,
    jobId,
    queueRetryAttempt,
  });
  if (pendingState.status === 'reported') return { status: 'reported', reused: true };
  const binding = deliveryAttemptBinding(pendingState);
  if (!binding) throw new Error('AxWise outcome pending attempt binding is incomplete');
  try {
    const result = await reportGoalOutcome(admin, goal);
    await markReported(admin, goal, { binding, jobId, queueRetryAttempt });
    return result;
  } catch (error) {
    try {
      await markPendingFailure(admin, goal, error, binding);
    } catch (metadataError) {
      metadataError.cause = error;
      throw metadataError;
    }
    throw error;
  }
}

/**
 * Queue one retry chain. The partial unique DB index is the concurrency guard;
 * the read-before-insert path avoids expected conflicts in normal operation.
 */
export async function enqueueGoalOutcomeRetry(
  admin,
  goal,
  error,
  { env = process.env, triggerProcessNextImpl } = {}
) {
  if (!isEligible(goal)) return { status: 'skipped' };

  const runtime = resolveOutcomeRetryRuntime(env);
  const decisionId = currentDecisionId(goal.data);

  let job = await findActiveOutcomeJob(admin, goal.id, goal.user_id, decisionId, runtime);
  let reused = Boolean(job);
  if (!job) {
    try {
      job = await enqueueAgentJob(
        admin,
        {
          user_id: goal.user_id,
          payload: {
            type: OUTCOME_JOB_TYPE,
            goalId: String(goal.id),
            decisionId,
            _userId: goal.user_id,
            userId: goal.user_id,
            user_id: goal.user_id,
          },
        },
        { env, ...(triggerProcessNextImpl ? { triggerProcessNextImpl } : {}) }
      );
    } catch (enqueueError) {
      if (enqueueError.code !== '23505') throw enqueueError;
      job = await findActiveOutcomeJob(admin, goal.id, goal.user_id, decisionId, runtime);
      reused = true;
      if (!job) {
        throw new Error('AxWise outcome retry conflicted but no active job could be loaded');
      }
    }
  }

  // A concurrent producer may have won the unique active-row constraint. Its
  // queued row still needs the same exact Preview wake before this call can
  // report success. Running rows already have an owner and need no re-claim.
  if (reused && job?.status === 'queued') {
    await wakeAgentJobExact(admin, job, {
      env,
      ...(triggerProcessNextImpl ? { triggerProcessNextImpl } : {}),
    });
  }

  const details = errorDetails(error);
  await mutateDeliveryState(admin, goal, (previous, currentData) => {
    if (currentDecisionId(currentData) !== decisionId) return DELIVERY_STATE_UNCHANGED;
    if (previous.status === 'reported' || persistedOutcomeMatches(currentData, decisionId)) {
      return DELIVERY_STATE_UNCHANGED;
    }
    return {
      ...previous,
      status: 'pending',
      decision_id: decisionId,
      queued_at: previous.queued_at || now(),
      retry_job_id: job?.id || previous.retry_job_id || null,
      // This row has only been queued. The exact retry attempt is claimed by
      // markPendingAttempt after the worker loads agent_jobs.retry_count.
      retry_attempt: null,
      last_error: details.message,
      last_error_code: details.code,
    };
  });

  return { status: 'queued', jobId: job?.id || null, reused };
}

/** Immediate delivery with a durable retry fallback for the completion stage. */
export async function reportOrEnqueueGoalOutcome(admin, goal, { env = process.env } = {}) {
  try {
    return await deliverGoalOutcome(admin, goal, { source: 'goal-completion' });
  } catch (error) {
    return enqueueGoalOutcomeRetry(admin, goal, error, { env });
  }
}

/** Internal agent_jobs handler. Throwing delegates backoff to the shared worker. */
export async function handleAxwiseOutcomeJob(admin, payload, job = null) {
  if (!payload?.goalId) throw new Error('axwise-outcome job requires goalId');
  const decisionId = exactPayloadDecisionId(payload, 'job');
  const expectedUserId = job?.user_id || payload._userId || null;
  if (!expectedUserId) throw new Error('axwise-outcome job requires durable user owner');
  const goal = await loadOutcomeGoal(admin, payload.goalId, expectedUserId);
  if (currentDecisionId(goal.data) !== decisionId) {
    throw new Error('AxWise outcome job decision no longer matches the goal');
  }
  if (goal.status !== 'completed') {
    const error = new Error('AxWise outcome retry requires a locally completed goal');
    error.code = 'AXWISE_OUTCOME_GOAL_NOT_COMPLETED';
    throw error;
  }
  if (goal.data?.axwise_outcome_delivery?.status === 'reported' && reportedOutcomeMatches(goal)) {
    return { status: 'reported', reused: true };
  }
  return deliverGoalOutcome(admin, goal, {
    source: 'axwise-outcome-job',
    jobId: job?.id || null,
    queueRetryAttempt: job?.retry_count,
  });
}

/** Called only after the shared worker has exhausted its retry budget. */
export async function markAxwiseOutcomeFinalFailure(
  admin,
  payload,
  error,
  job = null,
  expectedUserId = null
) {
  if (!payload?.goalId) return null;
  const durableUserId = expectedUserId || job?.user_id || null;
  if (!durableUserId) {
    throw new Error('AxWise outcome final failure requires durable user owner');
  }
  const payloadDecisionId = exactPayloadDecisionId(payload, 'final failure');
  const queued = queueBinding(job?.id, job?.retry_count);
  const details = errorDetails(error);
  return mutateDeliveryState(
    admin,
    { id: payload.goalId, user_id: durableUserId },
    (previous, currentData) => {
      if (currentDecisionId(currentData) !== payloadDecisionId) {
        return DELIVERY_STATE_UNCHANGED;
      }
      if (previous.status === 'reported') return DELIVERY_STATE_UNCHANGED;

      const binding = deliveryAttemptBinding(previous);
      if (
        previous.status !== 'pending' ||
        !binding ||
        binding.decisionId !== payloadDecisionId ||
        binding.retryJobId !== queued.retryJobId ||
        binding.retryAttempt !== queued.retryAttempt
      ) {
        return DELIVERY_STATE_UNCHANGED;
      }
      if (persistedOutcomeMatches(currentData, payloadDecisionId)) {
        return reportedDeliveryState(previous, currentData, binding, { recovered: true });
      }
      return {
        ...previous,
        status: 'final_failure',
        decision_id: binding.decisionId,
        attempts: binding.attempt,
        retry_job_id: binding.retryJobId,
        retry_attempt: binding.retryAttempt,
        final_failed_at: now(),
        last_error: details.message,
        last_error_code: details.code,
      };
    },
    durableUserId
  );
}

export { OUTCOME_JOB_TYPE };
