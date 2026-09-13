/**
 * Durable execution-lease context for agent_jobs handlers.
 *
 * A lease token is the immutable generation of one running attempt. Heartbeats
 * extend that generation without changing agent_jobs.updated_at, so terminal
 * transitions can compare the stable claim snapshot while stale recovery
 * compares the observed expiry. AsyncLocalStorage carries the live guard into
 * nested model, tool, HTTP and database boundaries without trusting payload
 * data or requiring every handler to thread another argument.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const JOB_LEASE_HEARTBEAT_INTERVAL_MS = 15_000;
export const JOB_LEASE_TTL_MS = 75_000;
export const JOB_LEASE_LOST = 'JOB_LEASE_LOST';
export const JOB_LEASE_INCOMPLETE = 'JOB_LEASE_INCOMPLETE';

export function isJobLeaseLostError(error) {
  return error?.code === JOB_LEASE_LOST;
}

const LEASE_SELECT =
  'id, user_id, status, lease_token, heartbeat_at, lease_expires_at, worker_scope';
const runtimeStorage = new AsyncLocalStorage();

function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
}

function leaseError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

export function jobLeaseLostError(jobId, operation, cause = null) {
  return leaseError(
    JOB_LEASE_LOST,
    `Durable execution lease was lost for job ${jobId} before ${operation}`,
    cause
  );
}

export function incompleteJobLeaseError(jobId) {
  return leaseError(
    JOB_LEASE_INCOMPLETE,
    `Legacy running job ${jobId} has no complete durable execution lease and was quarantined`
  );
}

export function hasCompleteJobLease(job) {
  return Boolean(
    job?.status === 'running' &&
    typeof job?.lease_token === 'string' &&
    job.lease_token.trim() &&
    timestamp(job.heartbeat_at) !== null &&
    timestamp(job.lease_expires_at) !== null
  );
}

export function createJobLeaseClaim(nowMs = Date.now(), ttlMs = JOB_LEASE_TTL_MS) {
  const heartbeatAt = new Date(nowMs).toISOString();
  return {
    lease_token: randomUUID(),
    heartbeat_at: heartbeatAt,
    lease_expires_at: new Date(nowMs + ttlMs).toISOString(),
  };
}

export function clearJobLease() {
  return { lease_token: null, heartbeat_at: null, lease_expires_at: null };
}

export function getCurrentJobLeaseRuntime() {
  return runtimeStorage.getStore() || null;
}

export function getCurrentJobLeaseSignal() {
  return getCurrentJobLeaseRuntime()?.signal || null;
}

export async function assertCurrentJobLeaseLive(operation = 'external action') {
  const runtime = getCurrentJobLeaseRuntime();
  if (!runtime) return;
  await runtime.assertLive(operation);
}

export function withJobLeaseRuntime(runtime, callback) {
  return runtimeStorage.run(runtime, callback);
}

/**
 * Continue terminal fanout only after this invocation's exact token CAS has
 * been committed (or reconciled as committed). The receipt is a local,
 * immutable capability; it cannot be minted from a merely observed terminal
 * row or from a handler whose lease was revoked.
 */
export function withVerifiedJobFinalizationReceipt({ claimedJob, terminalJob }, callback) {
  const terminalStatus = terminalJob?.status;
  if (
    !hasCompleteJobLease({ ...claimedJob, status: 'running' }) ||
    terminalJob?.id !== claimedJob.id ||
    terminalJob?.user_id !== claimedJob.user_id ||
    !['done', 'failed'].includes(terminalStatus) ||
    terminalJob?.lease_token != null ||
    terminalJob?.heartbeat_at != null ||
    terminalJob?.lease_expires_at != null
  ) {
    throw jobLeaseLostError(claimedJob?.id || terminalJob?.id || 'unknown', 'terminal fanout');
  }
  const receipt = Object.freeze({
    kind: 'terminal-finalization-receipt',
    jobId: claimedJob.id,
    userId: claimedJob.user_id,
    leaseToken: claimedJob.lease_token,
    terminalStatus,
    signal: null,
    async assertLive() {
      return terminalJob;
    },
  });
  return runtimeStorage.run(receipt, callback);
}

function sameLeaseRow(row, runtime, nowMs) {
  return Boolean(
    row?.id === runtime.jobId &&
    row?.user_id === runtime.userId &&
    row?.status === 'running' &&
    row?.lease_token === runtime.leaseToken &&
    timestamp(row?.heartbeat_at) !== null &&
    timestamp(row?.lease_expires_at) !== null &&
    timestamp(row.lease_expires_at) > nowMs
  );
}

async function inspectLease(admin, runtime) {
  try {
    const { data, error } = await admin
      .from('agent_jobs')
      .select(LEASE_SELECT)
      .eq('id', runtime.jobId)
      .eq('user_id', runtime.userId)
      .eq('status', 'running')
      .eq('lease_token', runtime.leaseToken)
      .maybeSingle();
    if (error) return { row: null, error };
    return { row: data || null, error: null };
  } catch (error) {
    return { row: null, error };
  }
}

export function createJobLeaseRuntime({
  admin,
  job,
  heartbeatIntervalMs = JOB_LEASE_HEARTBEAT_INTERVAL_MS,
  ttlMs = JOB_LEASE_TTL_MS,
  now = Date.now,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  onLost = null,
} = {}) {
  if (!admin) throw new TypeError('A Supabase admin client is required for a job lease');
  if (!hasCompleteJobLease(job)) throw incompleteJobLeaseError(job?.id || 'unknown');
  const controller = new AbortController();
  let heartbeatTimer = null;
  let stopped = false;
  let heartbeatInFlight = null;
  let lostReported = false;

  const reportLost = (lost) => {
    runtime.abort(lost);
    if (lostReported) return;
    lostReported = true;
    if (typeof onLost === 'function') onLost(lost);
  };

  const runtime = {
    jobId: job.id,
    userId: job.user_id,
    leaseToken: job.lease_token,
    signal: controller.signal,
    abort(reason) {
      if (controller.signal.aborted) return;
      controller.abort(
        reason instanceof Error ? reason : jobLeaseLostError(job.id, String(reason))
      );
    },
    async assertLive(operation = 'external action') {
      if (controller.signal.aborted) {
        throw controller.signal.reason || jobLeaseLostError(job.id, operation);
      }
      const currentNow = now();
      const { row, error } = await inspectLease(admin, runtime);
      if (!error && sameLeaseRow(row, runtime, currentNow)) return row;
      const lost = jobLeaseLostError(job.id, operation, error);
      reportLost(lost);
      throw lost;
    },
    async heartbeat() {
      if (stopped || controller.signal.aborted) return false;
      if (heartbeatInFlight) return heartbeatInFlight;
      heartbeatInFlight = (async () => {
        const nowMs = now();
        const heartbeatAt = new Date(nowMs).toISOString();
        const leaseExpiresAt = new Date(nowMs + ttlMs).toISOString();
        let response;
        try {
          response = await admin
            .from('agent_jobs')
            .update({ heartbeat_at: heartbeatAt, lease_expires_at: leaseExpiresAt })
            .eq('id', job.id)
            .eq('user_id', job.user_id)
            .eq('status', 'running')
            .eq('lease_token', job.lease_token)
            .gt('lease_expires_at', heartbeatAt)
            .select(LEASE_SELECT)
            .maybeSingle();
        } catch (error) {
          response = { data: null, error };
        }

        if (
          !response?.error &&
          sameLeaseRow(response?.data, runtime, nowMs) &&
          timestamp(response.data.heartbeat_at) === timestamp(heartbeatAt) &&
          timestamp(response.data.lease_expires_at) === timestamp(leaseExpiresAt)
        ) {
          return true;
        }

        // A transport response can be lost after Postgres commits. Reconcile
        // the exact token before declaring the handler dead.
        const inspection = await inspectLease(admin, runtime);
        if (
          !inspection.error &&
          sameLeaseRow(inspection.row, runtime, nowMs) &&
          timestamp(inspection.row.heartbeat_at) >= timestamp(heartbeatAt) &&
          timestamp(inspection.row.lease_expires_at) >= timestamp(leaseExpiresAt)
        ) {
          return true;
        }

        const lost = jobLeaseLostError(
          job.id,
          'heartbeat renewal',
          response?.error || inspection.error
        );
        reportLost(lost);
        throw lost;
      })().finally(() => {
        heartbeatInFlight = null;
      });
      return heartbeatInFlight;
    },
    start() {
      if (heartbeatTimer || stopped) return runtime;
      heartbeatTimer = setIntervalImpl(() => {
        runtime.heartbeat().catch(() => {
          /* heartbeat() already aborted and reported the lease */
        });
      }, heartbeatIntervalMs);
      if (typeof heartbeatTimer?.unref === 'function') heartbeatTimer.unref();
      return runtime;
    },
    async stop() {
      stopped = true;
      if (heartbeatTimer) clearIntervalImpl(heartbeatTimer);
      heartbeatTimer = null;
      if (heartbeatInFlight) {
        try {
          await heartbeatInFlight;
        } catch {
          /* the aborted execution path already owns the lease error */
        }
      }
    },
  };
  return runtime;
}

const WRITE_METHODS = new Set(['insert', 'update', 'upsert', 'delete']);
const STORAGE_WRITE_METHODS = new Set([
  'createBucket',
  'updateBucket',
  'emptyBucket',
  'deleteBucket',
  'upload',
  'update',
  'move',
  'copy',
  'remove',
  'createSignedUploadUrl',
]);
const GUARDED_CLIENTS = new WeakMap();

function deferGuardedInvocation(invoke, action) {
  const chainedCalls = [];
  let proxy;
  proxy = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then') {
          return (resolve, reject) =>
            assertCurrentJobLeaseLive(action)
              .then(() => {
                let value = invoke();
                for (const [method, args] of chainedCalls) value = value[method](...args);
                return value;
              })
              .then(resolve, reject);
        }
        return (...args) => {
          chainedCalls.push([property, args]);
          return proxy;
        };
      },
    }
  );
  return proxy;
}

/** Guard writes made through a client constructed inside a running handler. */
export function guardSupabaseClientForCurrentJobLease(client) {
  if (!client || typeof client !== 'object' || !getCurrentJobLeaseRuntime()) return client;
  const cached = GUARDED_CLIENTS.get(client);
  if (cached) return cached;
  const guarded = new Proxy(client, {
    get(target, property, receiver) {
      if (property === 'from') {
        return (table) => {
          const builder = target.from(table);
          return new Proxy(builder, {
            get(queryTarget, queryProperty, queryReceiver) {
              const member = Reflect.get(queryTarget, queryProperty, queryReceiver);
              if (!WRITE_METHODS.has(queryProperty) || typeof member !== 'function') return member;
              return (...args) =>
                deferGuardedInvocation(
                  () => member.apply(queryTarget, args),
                  `database ${String(queryProperty)} on ${table}`
                );
            },
          });
        };
      }
      if (property === 'rpc') {
        return (name, ...args) =>
          deferGuardedInvocation(() => target.rpc(name, ...args), `database RPC ${String(name)}`);
      }
      if (property === 'storage') {
        const storage = target.storage;
        return new Proxy(storage, {
          get(storageTarget, storageProperty, storageReceiver) {
            const member = Reflect.get(storageTarget, storageProperty, storageReceiver);
            if (storageProperty === 'from' && typeof member === 'function') {
              return (bucket) => {
                const bucketClient = member.call(storageTarget, bucket);
                return new Proxy(bucketClient, {
                  get(bucketTarget, bucketProperty, bucketReceiver) {
                    const bucketMember = Reflect.get(bucketTarget, bucketProperty, bucketReceiver);
                    if (
                      !STORAGE_WRITE_METHODS.has(bucketProperty) ||
                      typeof bucketMember !== 'function'
                    ) {
                      return bucketMember;
                    }
                    return (...args) =>
                      deferGuardedInvocation(
                        () => bucketMember.apply(bucketTarget, args),
                        `storage ${String(bucketProperty)} in ${bucket}`
                      );
                  },
                });
              };
            }
            if (!STORAGE_WRITE_METHODS.has(storageProperty) || typeof member !== 'function') {
              return member;
            }
            return (...args) =>
              deferGuardedInvocation(
                () => member.apply(storageTarget, args),
                `storage ${String(storageProperty)}`
              );
          },
        });
      }
      return Reflect.get(target, property, receiver);
    },
  });
  GUARDED_CLIENTS.set(client, guarded);
  return guarded;
}
