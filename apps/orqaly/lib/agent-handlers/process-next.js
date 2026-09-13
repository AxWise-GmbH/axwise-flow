/**
 * Process one queued job. Called by cron/Inngest/Trigger.dev.
 * Requires a configured worker/cron service Bearer secret.
 * Delegates to job-processor.js for claim → execute → finalize pipeline.
 */
import { waitUntil } from '@vercel/functions';
import { isDeepStrictEqual } from 'node:util';
import { cors } from '../../api/_lib/cors.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { serviceRequestAuthError } from '../../api/_lib/service-auth.js';
import { processNextJob } from './job-processor.js';
import { createJobLeaseClaim } from './job-lease-runtime.js';
import { reconcileGoals } from './goal-reconciler.js';
import { healAllStuckGoals } from '../goal-handlers/self-healer.js';
import {
  detectDuePulseAgents,
  checkPulseBudget,
  notifyPulseBudgetExhausted,
} from './pulse-handler.js';
import { autoAssignGoalsToAgents, reassignCompletedPulseAgents } from './pulse-auto-assign.js';
import {
  bindAgentJobToWorkerDeployment,
  resolveWorkerDeploymentIdentity,
  resolveWorkerScope,
  WORKER_DEPLOYMENT_PAYLOAD_KEY,
} from './worker-scope.js';

const log = createLogger('agent-worker');
const EXACT_DISPATCH_JOB_SELECT =
  'id, user_id, status, payload, retry_count, max_retries, worker_scope, updated_at, error, result, lease_token, heartbeat_at, lease_expires_at';

function sameTimestamp(left, right) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function sameDispatchIdentity(current, expected) {
  return Boolean(
    current?.id === expected?.id &&
    (current?.user_id ?? null) === (expected?.user_id ?? null) &&
    current?.worker_scope === expected?.worker_scope &&
    Number(current?.retry_count || 0) === Number(expected?.retry_count || 0) &&
    (current?.max_retries ?? null) === (expected?.max_retries ?? null) &&
    isDeepStrictEqual(current?.result ?? null, expected?.result ?? null) &&
    isDeepStrictEqual(current?.payload || {}, expected?.payload || {})
  );
}

async function inspectExactDispatchClaim(admin, expected, leaseClaim, claimedAt) {
  try {
    let query = admin
      .from('agent_jobs')
      .select(EXACT_DISPATCH_JOB_SELECT)
      .eq('id', expected.id)
      .eq('worker_scope', expected.worker_scope);
    query =
      expected.user_id == null ? query.is('user_id', null) : query.eq('user_id', expected.user_id);
    const deploymentIdentity = expected.payload?.[WORKER_DEPLOYMENT_PAYLOAD_KEY];
    if (deploymentIdentity) {
      query = query.eq(`payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`, deploymentIdentity);
    }
    const { data: current, error } = await query.maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!current) return { state: 'absent' };
    if (!sameDispatchIdentity(current, expected)) return { state: 'conflict', job: current };
    if (
      current.status === 'running' &&
      current.error == null &&
      current.lease_token === leaseClaim.lease_token &&
      sameTimestamp(current.heartbeat_at, leaseClaim.heartbeat_at) &&
      sameTimestamp(current.lease_expires_at, leaseClaim.lease_expires_at) &&
      sameTimestamp(current.updated_at, claimedAt)
    ) {
      return { state: 'committed', job: current };
    }
    if (
      current.status === expected.status &&
      current.error === (expected.error ?? null) &&
      sameTimestamp(current.updated_at, expected.updated_at)
    ) {
      return { state: 'original', job: current };
    }
    return { state: 'conflict', job: current };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

/**
 * Claim the exact row only after its background processor has been registered.
 * A unique marker in the transient running error field makes a lost PostgREST
 * response distinguishable from another invocation's lease without requiring
 * a schema rollout. Finalization replaces the marker with the real outcome.
 */
export async function claimExactDispatchJob(admin, expected) {
  const claimedAtMs = Date.now();
  const claimedAt = new Date(claimedAtMs).toISOString();
  const leaseClaim = createJobLeaseClaim(claimedAtMs);

  const updateExact = async () => {
    try {
      let query = admin
        .from('agent_jobs')
        .update({ status: 'running', error: null, updated_at: claimedAt, ...leaseClaim })
        .eq('id', expected.id)
        .eq('status', 'queued')
        .eq('worker_scope', expected.worker_scope);
      query =
        expected.user_id == null
          ? query.is('user_id', null)
          : query.eq('user_id', expected.user_id);
      const deploymentIdentity = expected.payload?.[WORKER_DEPLOYMENT_PAYLOAD_KEY];
      if (deploymentIdentity) {
        query = query.eq(`payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`, deploymentIdentity);
      }
      if (expected.retry_count !== null && expected.retry_count !== undefined) {
        query = query.eq('retry_count', expected.retry_count);
      }
      query =
        expected.max_retries == null
          ? query.is('max_retries', null)
          : query.eq('max_retries', expected.max_retries);
      if (expected.updated_at) query = query.eq('updated_at', expected.updated_at);
      query = expected.error == null ? query.is('error', null) : query.eq('error', expected.error);
      query =
        expected.result == null
          ? query.is('result', null)
          : query.eq('result', JSON.stringify(expected.result));
      return await query.select(EXACT_DISPATCH_JOB_SELECT).maybeSingle();
    } catch (error) {
      return { data: null, error };
    }
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await updateExact();
    if (!response.error && response.data) {
      return sameDispatchIdentity(response.data, expected) &&
        response.data.status === 'running' &&
        response.data.error == null &&
        response.data.lease_token === leaseClaim.lease_token &&
        sameTimestamp(response.data.heartbeat_at, leaseClaim.heartbeat_at) &&
        sameTimestamp(response.data.lease_expires_at, leaseClaim.lease_expires_at) &&
        sameTimestamp(response.data.updated_at, claimedAt)
        ? { state: 'committed', job: response.data }
        : { state: 'conflict', job: response.data };
    }

    const inspection = await inspectExactDispatchClaim(admin, expected, leaseClaim, claimedAt);
    if (inspection.state !== 'original' || attempt === 1) return inspection;
  }

  return { state: 'unknown' };
}

function createDeferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

export default async function handler(req, res) {
  const safeReq = req && typeof req === 'object' ? req : {};
  if (!safeReq.headers) safeReq.headers = {};
  cors(res, safeReq);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const authError = serviceRequestAuthError(safeReq, {
    secretNames: ['CRON_SECRET', 'WORKER_SECRET'],
  });
  if (authError) return jsonError(res, authError.status, authError.message);

  const done = log.startTimer(req, 'process-next');

  try {
    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Agent jobs not configured');

    const workerScope = resolveWorkerScope();
    const requestedJobId = String(req.query?.job_id || '').trim() || null;

    // Exact Preview producers need a fast acknowledgement that their specific
    // durable row was admitted to this deployment, not the eventual LLM/tool
    // result. Validate the row/deployment, register the full processor with
    // waitUntil, and return 202 before the long-running job completes.
    if (String(req.query?.dispatch || '') === '1') {
      if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
      if (!requestedJobId) return jsonError(res, 400, 'job_id is required for exact dispatch');
      if (workerScope !== 'preview') {
        return jsonError(res, 409, 'Exact background dispatch is available only in Preview');
      }

      let dispatchQuery = admin
        .from('agent_jobs')
        .select(EXACT_DISPATCH_JOB_SELECT)
        .eq('id', requestedJobId)
        .eq('worker_scope', workerScope);
      if (workerScope === 'preview') {
        const deploymentIdentity = resolveWorkerDeploymentIdentity();
        if (!deploymentIdentity) {
          return jsonError(res, 503, 'Preview deployment identity is unavailable');
        }
        dispatchQuery = dispatchQuery.eq(
          `payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`,
          deploymentIdentity
        );
      }
      const { data: dispatchJob, error: dispatchError } = await dispatchQuery.maybeSingle();
      if (dispatchError) return jsonError(res, 503, 'Unable to verify exact dispatch job');
      if (!dispatchJob) return jsonError(res, 409, 'Exact dispatch job is not available here');
      if (dispatchJob.status === 'running') {
        // A running row does not prove that any live invocation owns its
        // processor. In particular, an earlier exact-claim write may have
        // committed while both its response and verification reads failed.
        // Preview has no independent poller, so acknowledging that state would
        // strand the row until stale-job recovery. Fail closed and leave the
        // durable lease for explicit reconciliation/recovery.
        done({ status: 503, workerScope, jobId: requestedJobId, reconciliation: true });
        return res.status(503).json({
          error: 'Exact dispatch is already leased and needs reconciliation',
          code: 'EXACT_DISPATCH_RECONCILIATION_REQUIRED',
          workerScope,
          job_id: requestedJobId,
        });
      }
      if (dispatchJob.status === 'done') {
        done({ status: 202, workerScope, jobId: requestedJobId, alreadyDone: true });
        return res.status(202).json({
          workerScope,
          dispatched: true,
          already_done: true,
          job_id: requestedJobId,
        });
      }
      if (dispatchJob.status !== 'queued') {
        return jsonError(res, 409, `Exact dispatch job is already ${dispatchJob.status}`);
      }

      const start = createDeferred();
      const claimConfirmed = createDeferred();
      let claimSettled = false;
      const settleClaim = (outcome) => {
        if (claimSettled) return;
        claimSettled = true;
        claimConfirmed.resolve(outcome);
      };
      const dispatchPromise = start.promise
        .then(async () => {
          let claim;
          try {
            claim = await claimExactDispatchJob(admin, dispatchJob);
          } catch (error) {
            claim = { state: 'unknown', error };
          }
          settleClaim(claim);
          if (claim.state !== 'committed') {
            return { processed: false, claim_state: claim.state };
          }
          return processNextJob(admin, req, requestedJobId, { preclaimedJob: claim.job });
        })
        .catch((error) => {
          settleClaim({ state: 'unknown', error });
          log.warn(req, 'process-next.exact-dispatch-failed', {
            jobId: requestedJobId,
            error: error.message,
          });
          return { processed: false, error: error.message };
        });
      try {
        waitUntil(dispatchPromise);
      } catch (error) {
        log.warn(req, 'process-next.exact-dispatch-registration-failed', {
          jobId: requestedJobId,
          error: error.message,
        });
        return jsonError(res, 503, 'Exact dispatch could not be registered');
      }

      // The registered task is intentionally gated until waitUntil accepts it.
      // Await only the exact lease, then let the registered task continue with
      // the already-claimed snapshot while this request returns quickly.
      start.resolve();
      const claim = await claimConfirmed.promise;
      if (claim.state !== 'committed') {
        log.warn(req, 'process-next.exact-dispatch-claim-unverified', {
          jobId: requestedJobId,
          state: claim.state,
          error: claim.error?.message || null,
        });
        return jsonError(
          res,
          ['absent', 'conflict'].includes(claim.state) ? 409 : 503,
          'Exact dispatch lease could not be verified'
        );
      }

      done({ status: 202, workerScope, jobId: requestedJobId });
      return res.status(202).json({
        workerScope,
        dispatched: true,
        job_id: requestedJobId,
      });
    }

    let reconciled = { reconciled: 0, skipped: 0 };
    let pulseEnqueued = 0;

    // Reconciliation, healing, and Pulse are global controllers over the
    // shared database. Only Production may run them. Preview and local workers
    // process their own explicitly partitioned jobs without mutating the
    // production control plane.
    if (workerScope === 'production') {
      // Reconciler: scan active goals and enqueue missing jobs (Kubernetes-style control loop)
      reconciled = await reconcileGoals(admin).catch((err) => {
        log.warn(req, 'reconciler.error', { error: err.message });
        return { reconciled: 0, skipped: 0 };
      });

      // Self-healer: recover failed/stuck goals via strategies (h01-h04, h99 escalate)
      // Runs AFTER reconciler so reconciler handles simple "missing job" cases
      // and healer handles the harder ones (failed, stalled, escalation).
      const healed = await healAllStuckGoals(admin, { req }).catch((err) => {
        log.warn(req, 'self-healer.error', { error: err.message });
        return { scanned: 0, applied: 0, results: [] };
      });
      if (healed.applied > 0) {
        log.info(req, 'self-healer.applied', { applied: healed.applied, scanned: healed.scanned });
      }

      // Pulse: release agents from completed goals, then auto-assign free agents to goals
      try {
        await reassignCompletedPulseAgents(admin);
        await autoAssignGoalsToAgents(admin);
      } catch (err) {
        log.warn(req, 'pulse.auto-assign.error', { error: err.message });
      }

      // Pulse: detect agents due for a pulse cycle and enqueue jobs
      try {
        const dueAgents = await detectDuePulseAgents(admin);
        for (const agent of dueAgents) {
          const durableUserId = typeof agent.user_id === 'string' ? agent.user_id.trim() : '';
          if (!durableUserId) {
            log.warn(req, 'pulse.owner-missing', { agent_id: agent.id });
            continue;
          }
          const budget = await checkPulseBudget(admin, agent.id, durableUserId);
          if (!budget.allowed) {
            log.info(req, 'pulse.budget-pause', {
              agent_id: agent.id,
              todayCost: budget.todayCost,
            });
            // M7: surface the pause to the user via notification_log so the
            // Communicator Activity feed can render a "Raise cap" action.
            // notifyPulseBudgetExhausted dedupes within a 6-hour window so the
            // cron loop doesn't spam the user every minute.
            try {
              await notifyPulseBudgetExhausted(admin, agent, budget);
            } catch (err) {
              log.warn(req, 'pulse.budget-notify.error', {
                agent_id: agent.id,
                error: err.message,
              });
            }
            continue;
          }
          const mode = budget.switchToLite ? 'lite' : agent.pulse_mode || 'lite';
          const cycleNumber = (agent.pulse_cycle_count || 0) + 1;
          await admin.from('agent_jobs').insert(
            bindAgentJobToWorkerDeployment({
              user_id: durableUserId,
              status: 'queued',
              payload: {
                type: 'pulse-cycle',
                agentId: agent.id,
                goalId: agent.pulse_goal_id,
                taskFocus: agent.pulse_task_focus || '',
                mode,
                autonomousEnabled: agent.autonomous_enabled || false,
                _userId: durableUserId,
                userId: durableUserId,
                user_id: durableUserId,
                cycleNumber,
              },
            })
          );
          pulseEnqueued++;
          // Also enqueue prompt-refinement every 10 cycles
          if (cycleNumber % 10 === 0 && agent.autonomous_enabled) {
            await admin.from('agent_jobs').insert(
              bindAgentJobToWorkerDeployment({
                user_id: durableUserId,
                status: 'queued',
                payload: {
                  type: 'prompt-refinement',
                  agentId: agent.id,
                  _userId: durableUserId,
                  userId: durableUserId,
                  user_id: durableUserId,
                },
              })
            );
          }
        }
      } catch (err) {
        log.warn(req, 'pulse.detect.error', { error: err.message });
      }
    }

    // A user-initiated Preview recovery supplies the already-authorized queue
    // row it inspected. claimSpecificJob still enforces queued + worker_scope;
    // after that row succeeds, the processor may continue only exact child IDs
    // emitted by its handler and carrying the same nonempty goalId.
    const result = await processNextJob(admin, req, requestedJobId);

    done({ status: 200, workerScope, ...result, ...reconciled, pulseEnqueued });
    return res.status(200).json({ workerScope, ...result, ...reconciled, pulseEnqueued });
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'agent/process-next');
  }
}
