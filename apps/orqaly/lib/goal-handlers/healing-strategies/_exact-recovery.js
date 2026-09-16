import { deterministicAgentJobId, enqueueAgentJob, triggerProcessNext } from '../_helpers.js';
import { isDeepStrictEqual } from 'node:util';
import {
  resolveWorkerDeploymentIdentity,
  resolveWorkerScope,
  WORKER_DEPLOYMENT_PAYLOAD_KEY,
} from '../../agent-handlers/worker-scope.js';

function sameTimestamp(left, right) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function committedTransition(goal, patch, row, strategy) {
  return {
    ok: true,
    at: row?.updated_at || patch.updated_at,
    markerAt: patch.data?.last_heal_at || patch.updated_at,
    status: row?.status || patch.status || goal.status,
    strategy,
    changedFields: Object.keys(patch || {}),
  };
}

async function inspectHealingGoalTransition(admin, goal, patch, strategy) {
  try {
    const { data: current, error } = await admin
      .from('goals')
      .select('id, user_id, status, data, updated_at')
      .eq('id', goal.id)
      .eq('user_id', goal.user_id)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!current) return { state: 'conflict' };

    const markerAt = patch.data?.last_heal_at || patch.updated_at;
    const expectedStatus = patch.status || goal.status;
    if (
      current.status === expectedStatus &&
      sameTimestamp(current.updated_at, patch.updated_at) &&
      current.data?.last_heal_strategy === strategy &&
      current.data?.last_heal_at === markerAt
    ) {
      return { state: 'committed', goal: current };
    }
    if (current.status === goal.status && sameTimestamp(current.updated_at, goal.updated_at)) {
      return { state: 'original', goal: current };
    }
    return { state: 'conflict', goal: current };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

/**
 * Persist one healer transition only while the exact owner-visible goal
 * snapshot selected by the healer is still current.
 */
export async function transitionHealingGoal(admin, goal, patch, { strategy, log } = {}) {
  if (!goal?.id || !goal?.user_id || !goal?.status || !goal?.updated_at) {
    return { ok: false, reason: 'incomplete goal snapshot' };
  }

  let response;
  let thrownError = null;
  try {
    response = await admin
      .from('goals')
      .update(patch)
      .eq('id', goal.id)
      .eq('user_id', goal.user_id)
      .eq('status', goal.status)
      .eq('updated_at', goal.updated_at)
      .select('id, status, updated_at')
      .maybeSingle();
  } catch (error) {
    thrownError = error;
  }

  if (!thrownError && !response?.error && response?.data) {
    return committedTransition(goal, patch, response.data, strategy);
  }

  const inspection = await inspectHealingGoalTransition(admin, goal, patch, strategy);
  if (inspection.state === 'committed') {
    return committedTransition(goal, patch, inspection.goal, strategy);
  }

  const writeError = thrownError || response?.error || null;
  if (inspection.state === 'unknown') {
    log?.error?.(null, 'self-healer.transition-outcome-unknown', {
      goalId: goal.id,
      strategy,
      error: writeError?.message || null,
      inspectionError: inspection.error?.message || null,
    });
    throw new Error(
      `Healing goal transition outcome could not be verified: ${inspection.error?.message || writeError?.message || 'database state unavailable'}`
    );
  }

  const reason =
    inspection.state === 'original'
      ? writeError?.message || 'goal transition was not committed'
      : 'goal snapshot changed';
  log?.warn?.(null, 'self-healer.transition-skipped', {
    goalId: goal.id,
    strategy,
    state: inspection.state,
    reason,
  });
  return { ok: false, reason };
}

async function inspectHealingJob(
  admin,
  { jobId, goal, action, strategy, healAt, queuedAt, workerScope, deploymentIdentity }
) {
  try {
    const { data: job, error } = await admin
      .from('agent_jobs')
      .select('id, user_id, status, updated_at, worker_scope, payload')
      .eq('id', jobId)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!job) return { state: 'absent' };

    const payload = job.payload || {};
    const exact =
      job.id === jobId &&
      job.user_id === goal.user_id &&
      job.status === 'queued' &&
      Date.parse(job.updated_at) === Date.parse(queuedAt) &&
      job.worker_scope === workerScope &&
      payload.type === 'orchestrate-goal' &&
      payload.action === action &&
      payload.goalId === goal.id &&
      payload._userId === goal.user_id &&
      payload.userId === goal.user_id &&
      payload.user_id === goal.user_id &&
      payload._healedBy === strategy &&
      payload._healAt === healAt &&
      (workerScope !== 'preview' || payload[WORKER_DEPLOYMENT_PAYLOAD_KEY] === deploymentIdentity);
    return exact ? { state: 'present', job } : { state: 'conflict' };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function inspectAbandonedHealingJob(
  admin,
  {
    jobId,
    goal,
    action,
    strategy,
    healAt,
    queuedAt,
    workerScope,
    deploymentIdentity,
    failedAt,
    failure,
  }
) {
  try {
    const { data: job, error } = await admin
      .from('agent_jobs')
      .select('id, user_id, status, error, updated_at, worker_scope, payload')
      .eq('id', jobId)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!job) return { state: 'absent' };

    const payload = job.payload || {};
    const identityMatches =
      job.id === jobId &&
      job.user_id === goal.user_id &&
      job.worker_scope === workerScope &&
      payload.type === 'orchestrate-goal' &&
      payload.action === action &&
      payload.goalId === goal.id &&
      payload._userId === goal.user_id &&
      payload.userId === goal.user_id &&
      payload.user_id === goal.user_id &&
      payload._healedBy === strategy &&
      payload._healAt === healAt &&
      (workerScope !== 'preview' || payload[WORKER_DEPLOYMENT_PAYLOAD_KEY] === deploymentIdentity);
    if (!identityMatches) return { state: 'conflict', job };
    if (
      job.status === 'failed' &&
      job.error === failure &&
      sameTimestamp(job.updated_at, failedAt)
    ) {
      return { state: 'committed', job };
    }
    if (job.status === 'queued' && sameTimestamp(job.updated_at, queuedAt)) {
      return { state: 'original', job };
    }
    return { state: 'conflict', job };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function inspectHealingRollback(admin, goal, transition, rollbackAt) {
  try {
    const { data: current, error } = await admin
      .from('goals')
      .select('id, user_id, status, data, plan, iteration, updated_at')
      .eq('id', goal.id)
      .eq('user_id', goal.user_id)
      .maybeSingle();
    if (error || !current) return { state: 'unknown', error: error || null };
    if (
      current.status === goal.status &&
      sameTimestamp(current.updated_at, rollbackAt) &&
      isDeepStrictEqual(current.data || {}, goal.data || {}) &&
      isDeepStrictEqual(current.plan || null, goal.plan || null) &&
      (!transition.changedFields?.includes('iteration') || current.iteration === goal.iteration)
    ) {
      return { state: 'committed', goal: current };
    }
    if (
      current.status === transition.status &&
      sameTimestamp(current.updated_at, transition.at) &&
      current.data?.last_heal_strategy === transition.strategy &&
      current.data?.last_heal_at === transition.markerAt
    ) {
      return { state: 'transitioned', goal: current };
    }
    return { state: 'conflict', goal: current };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function rollbackHealingTransition(admin, goal, transition) {
  const rollbackAt = new Date().toISOString();
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response = null;
    let thrownError = null;
    try {
      response = await admin
        .from('goals')
        .update({
          status: goal.status,
          data: goal.data || {},
          plan: goal.plan || null,
          ...(transition.changedFields?.includes('iteration') ? { iteration: goal.iteration } : {}),
          updated_at: rollbackAt,
        })
        .eq('id', goal.id)
        .eq('user_id', goal.user_id)
        .eq('status', transition.status)
        .eq('updated_at', transition.at)
        .eq('data->>last_heal_strategy', transition.strategy)
        .eq('data->>last_heal_at', transition.markerAt)
        .select('id')
        .maybeSingle();
    } catch (error) {
      thrownError = error;
    }
    if (!thrownError && !response?.error && response?.data) return { ok: true };

    lastError = thrownError || response?.error || null;
    const inspection = await inspectHealingRollback(admin, goal, transition, rollbackAt);
    if (inspection.state === 'committed') return { ok: true };
    if (inspection.state !== 'transitioned' || attempt === 1) {
      return {
        ok: false,
        state: inspection.state,
        error:
          inspection.error ||
          lastError ||
          new Error(`healing rollback state is ${inspection.state}`),
      };
    }
  }
  return { ok: false, error: lastError || new Error('healing rollback could not be verified') };
}

async function abandonHealingContinuation(
  admin,
  goal,
  transition,
  { jobId, queuedAt, action, strategy, workerScope, deploymentIdentity, reason }
) {
  const failedAt = new Date().toISOString();
  const failure = `Self-healer continuation abandoned: ${reason}`;

  let response;
  let thrownError = null;
  try {
    let terminalize = admin
      .from('agent_jobs')
      .update({
        status: 'failed',
        error: failure,
        updated_at: failedAt,
      })
      .eq('id', jobId)
      .eq('user_id', goal.user_id)
      .eq('status', 'queued')
      .eq('updated_at', queuedAt)
      .eq('worker_scope', workerScope)
      .eq('payload->>type', 'orchestrate-goal')
      .eq('payload->>action', action)
      .eq('payload->>goalId', goal.id)
      .eq('payload->>_userId', goal.user_id)
      .eq('payload->>userId', goal.user_id)
      .eq('payload->>user_id', goal.user_id)
      .eq('payload->>_healedBy', strategy)
      .eq('payload->>_healAt', transition.at);
    if (workerScope === 'preview') {
      terminalize = terminalize.eq(
        `payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`,
        deploymentIdentity
      );
    }

    response = await terminalize.select('id, status, updated_at').maybeSingle();
  } catch (error) {
    thrownError = error;
  }

  let terminalized =
    !thrownError &&
    !response?.error &&
    response?.data?.id === jobId &&
    response.data.status === 'failed';
  if (!terminalized) {
    const inspection = await inspectAbandonedHealingJob(admin, {
      jobId,
      goal,
      action,
      strategy,
      healAt: transition.at,
      queuedAt,
      workerScope,
      deploymentIdentity,
      failedAt,
      failure,
    });
    terminalized = inspection.state === 'committed' || inspection.state === 'absent';
    if (!terminalized) {
      return {
        ok: false,
        state: inspection.state,
        error:
          inspection.error ||
          thrownError ||
          response?.error ||
          new Error('healing continuation was no longer exactly queued'),
      };
    }
  }

  const rollback = await rollbackHealingTransition(admin, goal, transition);
  if (!rollback.ok) {
    return {
      ok: false,
      error: rollback.error || new Error('healing transition was no longer current'),
    };
  }
  return { ok: true };
}

/**
 * Insert an exact deterministic continuation, verify transport-ambiguous
 * outcomes, and wake only that physical job. A proven clean insert failure is
 * rolled back through the exact transition snapshot; unknown outcomes throw
 * so the healer never reports a successful recovery that may be stranded.
 */
export async function enqueueHealingContinuation(
  admin,
  goal,
  transition,
  {
    action,
    extra = {},
    strategy,
    log,
    beforeEnqueue,
    beforeWake,
    triggerProcessNextImpl = triggerProcessNext,
  }
) {
  const workerScope = resolveWorkerScope();
  const deploymentIdentity = resolveWorkerDeploymentIdentity();
  if (workerScope === 'preview' && !deploymentIdentity) {
    const rollback = await rollbackHealingTransition(admin, goal, transition);
    if (!rollback.ok) throw new Error('Preview identity missing and healer rollback failed');
    return { ok: false, reason: 'Preview deployment identity unavailable' };
  }

  // Preparations that can invalidate or overlap the continuation (for example
  // deleting orphan team tasks) must finish before the insert. The configured
  // INSERT webhook is free to claim a row immediately after commit.
  if (beforeEnqueue) {
    try {
      await beforeEnqueue();
    } catch (error) {
      const rollback = await rollbackHealingTransition(admin, goal, transition);
      if (!rollback.ok) {
        throw new Error(
          `Healing preparation failed and transition rollback lost its snapshot: ${rollback.error?.message || error.message}`
        );
      }
      return { ok: false, reason: error.message, rolledBack: true };
    }
  }

  const jobId = deterministicAgentJobId('self-healer-continuation', {
    goalId: goal.id,
    userId: goal.user_id,
    strategy,
    action,
    snapshot: goal.updated_at,
    workerScope,
    deploymentIdentity,
  });
  const queuedAt = new Date().toISOString();
  const row = {
    id: jobId,
    user_id: goal.user_id,
    created_at: queuedAt,
    updated_at: queuedAt,
    payload: {
      type: 'orchestrate-goal',
      action,
      goalId: goal.id,
      ...extra,
      _userId: goal.user_id,
      userId: goal.user_id,
      user_id: goal.user_id,
      _healedBy: strategy,
      _healAt: transition.at,
    },
  };

  let present = false;
  try {
    await enqueueAgentJob(admin, row, { wake: false });
    present = true;
  } catch (error) {
    const inspection = await inspectHealingJob(admin, {
      jobId,
      goal,
      action,
      strategy,
      healAt: transition.at,
      queuedAt,
      workerScope,
      deploymentIdentity,
    });
    if (inspection.state === 'present') {
      present = true;
    } else if (inspection.state === 'absent') {
      const rollback = await rollbackHealingTransition(admin, goal, transition);
      if (!rollback.ok) {
        throw new Error(
          `Healing continuation enqueue failed and rollback lost its snapshot: ${rollback.error?.message || error.message}`
        );
      }
      return { ok: false, reason: error.message, rolledBack: true };
    } else {
      log?.error?.(null, 'self-healer.enqueue-outcome-unknown', {
        goalId: goal.id,
        strategy,
        jobId,
        inspection: inspection.state,
        error: error.message,
        inspectionError: inspection.error?.message,
      });
      throw new Error('Healing continuation enqueue outcome could not be verified');
    }
  }

  if (!present) throw new Error('Healing continuation was not persisted');

  if (beforeWake) {
    try {
      await beforeWake();
    } catch (error) {
      const abandoned = await abandonHealingContinuation(admin, goal, transition, {
        jobId,
        queuedAt,
        action,
        strategy,
        workerScope,
        deploymentIdentity,
        reason: `pre-wake preparation failed: ${error.message}`,
      });
      if (!abandoned.ok) {
        throw new Error(
          `Healing preparation failed and exact cleanup could not be completed: ${abandoned.error?.message || error.message}`
        );
      }
      return { ok: false, reason: error.message, rolledBack: true };
    }
  }

  let triggered;
  let wakeError = null;
  try {
    triggered = await triggerProcessNextImpl({ jobId });
  } catch (error) {
    wakeError = error;
    triggered = false;
  }
  if (workerScope === 'preview' && !triggered) {
    const reason = wakeError?.message || 'Preview healing continuation could not be awakened';
    const abandoned = await abandonHealingContinuation(admin, goal, transition, {
      jobId,
      queuedAt,
      action,
      strategy,
      workerScope,
      deploymentIdentity,
      reason,
    });
    if (!abandoned.ok) {
      throw new Error(
        `Preview healing continuation could not be awakened and exact cleanup failed: ${abandoned.error?.message || reason}`
      );
    }
    return { ok: false, reason, rolledBack: true };
  }
  if (wakeError) {
    log?.warn?.(null, 'self-healer.wake-failed-durable-fallback', {
      goalId: goal.id,
      strategy,
      jobId,
      error: wakeError.message,
    });
  }
  return { ok: true, jobId };
}
