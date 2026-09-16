/**
 * Browser task handler — core orchestrator for Account Creation Specialist.
 *
 * Runs within api/ops.js (60s timeout). Handles the full registration workflow:
 * 1. Create temp email (mail.tm)
 * 2. Navigate to provider signup page (Browserless.io)
 * 3. Detect and solve CAPTCHA (2Captcha)
 * 4. Fill form and submit
 * 5. Read verification email
 * 6. Click verification link
 * 7. Navigate to API key page and extract credential
 * 8. Save credential to encrypted BYOK/Vault storage
 */
import { cors } from '../../api/_lib/cors.js';
import { isDeepStrictEqual } from 'node:util';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { checkRateLimit } from '../../api/_lib/rate-limit.js';
import { navigate, fillAndSubmit } from '../browser/browserless-client.js';
import { detectCaptcha, solveCaptcha } from '../browser/captcha-solver.js';
import {
  createEmail,
  checkInbox,
  readMessage,
  extractVerificationLink,
} from '../browser/temp-email.js';
import { parseLlmJson } from '../agent-handlers/llm-executor.js';
import { executeLlmTracked } from '../usage-handlers/tracked-llm.js';
import {
  rentNumber,
  waitForSms,
  releaseNumber,
  detectsPhoneVerification,
} from '../browser/sms-verify-client.js';
import { defaultProvider, defaultCheapModel } from '../_shared/llm-defaults.js';
import { resolveToolCredential } from '../agent-handlers/tool-credentials.js';
import { saveUserApiKey } from '../api-handlers/_shared/save-user-api-key.js';
import {
  loadToolCredentialSnapshot,
  reserveToolCredentialWrite,
} from '../api-handlers/_shared/tool-credential-write-reservation.js';
import { stripPersistedCredentials } from '../security/persisted-credential-sanitizer.js';
import {
  resolveWorkerDeploymentIdentity,
  resolveWorkerScope,
  WORKER_DEPLOYMENT_PAYLOAD_KEY,
} from '../agent-handlers/worker-scope.js';
import {
  deterministicAgentJobId,
  enqueueAgentJob,
  triggerProcessNext,
} from '../goal-handlers/_helpers.js';
import {
  JOB_LEASE_LOST,
  clearJobLease,
  createJobLeaseClaim,
  createJobLeaseRuntime,
  guardSupabaseClientForCurrentJobLease,
  hasCompleteJobLease,
  jobLeaseLostError,
  withJobLeaseRuntime,
} from '../agent-handlers/job-lease-runtime.js';

const log = createLogger('browser-task');
const LOST_JOB_LEASE_REASON = 'Job lease lost';
const BROWSER_TASK_RUN_COLUMNS =
  'id, job_id, user_id, target_tool_id, provider_url, status, steps, temp_email, credential_saved, error, duration_ms, created_at, updated_at';

// Error substrings that mean Sandris cannot recover no matter how many retries.
// The job remains in the schema-valid terminal `failed` state and carries a
// server-owned result.needs_human marker that h45 corroborates against the
// browser run before offering any paid-human fallback.
const UNRECOVERABLE_MARKERS = [
  /phone.*verif/i,
  /sms.*verif/i,
  /invite.?only/i,
  /oauth.?only/i,
  /tos.*automation/i,
  /captcha.*unsolvable/i,
  /kyc/i,
  /identity.*required/i,
  /upload.*id/i,
  /selfie/i,
];

function isUnrecoverableError(message) {
  if (!message) return false;
  const s = String(message);
  return UNRECOVERABLE_MARKERS.some((re) => re.test(s));
}

const FIRST_NAMES = [
  'Alex',
  'Jordan',
  'Taylor',
  'Casey',
  'Morgan',
  'Riley',
  'Quinn',
  'Avery',
  'Drew',
  'Sam',
];
const LAST_NAMES = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Davis',
  'Miller',
  'Wilson',
  'Moore',
  'Clark',
];
const MAX_EMAIL_POLLS = 3;
const EMAIL_POLL_INTERVAL_MS = 5000;

// ── Helpers ────────────────────────────────────────────────────────

/** Track a step in the workflow; returns the step object for mutation. */
function pushStep(steps, name, extra) {
  const entry = { step: name, status: 'running', ts: Date.now(), ...extra };
  steps.push(entry);
  return entry;
}

function verifyAuth(req) {
  const secret = process.env.WORKER_SECRET || process.env.BACKUP_SECRET;
  const token = (req.headers?.authorization || '').replace('Bearer ', '');
  return secret && token === secret;
}

function isBrowserLeaseLost(error, runtime) {
  return error?.code === JOB_LEASE_LOST || runtime?.signal?.aborted === true;
}

function raceWithBrowserLease(promise, runtime) {
  const { signal } = runtime;
  if (signal.aborted) {
    return Promise.reject(signal.reason || jobLeaseLostError(runtime.jobId, 'browser work'));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason || jobLeaseLostError(runtime.jobId, 'browser work'));
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

function createJobLeaseSnapshot(job, workerScope, deploymentIdentity) {
  if (
    !job?.id ||
    typeof job.user_id !== 'string' ||
    !job.user_id.trim() ||
    job.status !== 'running' ||
    job.worker_scope !== workerScope ||
    !Number.isInteger(job.retry_count) ||
    typeof job.updated_at !== 'string' ||
    !job.updated_at ||
    !hasCompleteJobLease(job)
  ) {
    return null;
  }

  return {
    id: job.id,
    userId: job.user_id,
    retryCount: job.retry_count,
    updatedAt: job.updated_at,
    workerScope,
    deploymentIdentity: workerScope === 'preview' ? deploymentIdentity : null,
    leaseToken: job.lease_token,
    heartbeatAt: job.heartbeat_at,
    leaseExpiresAt: job.lease_expires_at,
  };
}

function applyBrowserJobScope(query, { jobId, userId = null, workerScope, deploymentIdentity }) {
  let scoped = query.eq('id', jobId).eq('worker_scope', workerScope);
  if (userId) scoped = scoped.eq('user_id', userId);
  if (workerScope === 'preview') {
    scoped = scoped.eq(`payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`, deploymentIdentity);
  }
  return scoped;
}

async function inspectBrowserJob(admin, { jobId, workerScope, deploymentIdentity }) {
  try {
    const query = applyBrowserJobScope(
      admin
        .from('agent_jobs')
        .select(
          'id, user_id, payload, status, retry_count, worker_scope, updated_at, error, result, lease_token, heartbeat_at, lease_expires_at'
        ),
      { jobId, workerScope, deploymentIdentity }
    ).eq('payload->>type', 'browser-task');
    const { data, error } = await query.maybeSingle();
    if (error) return { state: 'unknown', error };
    return { state: 'known', job: data || null };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

function browserJobOwnsLease(job, lease) {
  return !!(
    job?.id === lease?.id &&
    job.user_id === lease.userId &&
    job.status === 'running' &&
    job.retry_count === lease.retryCount &&
    job.worker_scope === lease.workerScope &&
    sameDatabaseTimestamp(job.updated_at, lease.updatedAt) &&
    job.lease_token === lease.leaseToken
  );
}

function nextBrowserLeaseTimestamp(previous, candidate = new Date().toISOString()) {
  const previousMs = Date.parse(previous);
  const candidateMs = Date.parse(candidate);
  if (!Number.isFinite(previousMs)) return candidate;
  return new Date(
    Math.max(Number.isFinite(candidateMs) ? candidateMs : Date.now(), previousMs + 1)
  ).toISOString();
}

async function claimBrowserJob(admin, { jobId, workerScope, deploymentIdentity }) {
  const claimedAtMs = Date.now();
  const leaseClaim = createJobLeaseClaim(claimedAtMs);
  const scope = { jobId, workerScope, deploymentIdentity };

  async function attemptClaim(claimedAt, expected = null) {
    try {
      let query = applyBrowserJobScope(
        admin.from('agent_jobs').update({
          status: 'running',
          error: null,
          updated_at: claimedAt,
          ...leaseClaim,
        }),
        scope
      )
        .eq('payload->>type', 'browser-task')
        .eq('status', 'queued');
      if (expected) {
        query = query.eq('retry_count', expected.retry_count).eq('updated_at', expected.updated_at);
      }
      const response = await query
        .select(
          'id, user_id, payload, status, retry_count, worker_scope, updated_at, error, lease_token, heartbeat_at, lease_expires_at'
        )
        .single();
      return { response, error: response?.error || null };
    } catch (error) {
      return { response: null, error };
    }
  }

  function committedJob(data, claimedAt) {
    return {
      ...data,
      status: 'running',
      updated_at: claimedAt,
      error: null,
      ...leaseClaim,
    };
  }

  const claimedAt = new Date(claimedAtMs).toISOString();
  const first = await attemptClaim(claimedAt);
  if (!first.error && first.response?.data) {
    if (first.response.data.payload?.type !== 'browser-task') {
      return {
        state: 'unknown',
        job: first.response.data,
        error: new Error('Browser worker received a non-browser job from its typed claim'),
      };
    }
    return { state: 'committed', job: committedJob(first.response.data, claimedAt) };
  }
  if (!first.error && !first.response?.data) return { state: 'unavailable' };

  const inspected = await inspectBrowserJob(admin, scope);
  if (inspected.state !== 'known')
    return { state: 'unknown', error: inspected.error || first.error };
  const current = inspected.job;
  if (!current) return { state: 'unavailable' };
  if (current.payload?.type !== 'browser-task') {
    return {
      state: 'unknown',
      job: current,
      error: new Error('Browser worker inspection returned a non-browser job'),
    };
  }
  if (!['queued', 'running', 'done', 'failed', 'cancelled'].includes(current.status)) {
    return { state: 'unknown', job: current, error: first.error };
  }
  if (
    current.status === 'running' &&
    current.lease_token === leaseClaim.lease_token &&
    sameDatabaseTimestamp(current.updated_at, claimedAt)
  ) {
    return { state: 'committed', job: current };
  }
  if (current.status !== 'queued') return { state: 'unavailable', job: current };
  if (!Number.isInteger(current.retry_count) || !current.updated_at) {
    return { state: 'unknown', job: current, error: first.error };
  }

  // The first response proved neither a commit nor a conflict, while the
  // read-back proves the exact queued pre-state still exists. Retry that exact
  // snapshot once so a Preview request cannot report success and strand it.
  const retriedAt = nextBrowserLeaseTimestamp(current.updated_at, claimedAt);
  const retried = await attemptClaim(retriedAt, current);
  if (!retried.error && retried.response?.data) {
    if (retried.response.data.payload?.type !== 'browser-task') {
      return {
        state: 'unknown',
        job: retried.response.data,
        error: new Error('Browser worker received a non-browser job from its typed retry'),
      };
    }
    return { state: 'committed', job: committedJob(retried.response.data, retriedAt) };
  }

  const afterRetry = await inspectBrowserJob(admin, scope);
  if (afterRetry.state !== 'known') {
    return { state: 'unknown', error: afterRetry.error || retried.error || first.error };
  }
  if (afterRetry.job && afterRetry.job.payload?.type !== 'browser-task') {
    return {
      state: 'unknown',
      job: afterRetry.job,
      error: new Error('Browser worker retry inspection returned a non-browser job'),
    };
  }
  if (
    afterRetry.job?.status === 'running' &&
    afterRetry.job.lease_token === leaseClaim.lease_token &&
    sameDatabaseTimestamp(afterRetry.job.updated_at, retriedAt)
  ) {
    return { state: 'committed', job: afterRetry.job };
  }
  if (
    afterRetry.job?.status === 'queued' &&
    afterRetry.job.retry_count === current.retry_count &&
    sameDatabaseTimestamp(afterRetry.job.updated_at, current.updated_at)
  ) {
    return { state: 'unknown', job: afterRetry.job, error: retried.error || first.error };
  }
  return { state: 'unavailable', job: afterRetry.job };
}

/**
 * Mutate a claimed job only while the exact lease returned by the claim is
 * still current. A stale invocation must not finalize or fail a newer retry
 * that happens to be running under the same job id.
 */
async function transitionClaimedJob(admin, lease, patch) {
  if (!lease) return false;

  const isTerminal = ['done', 'failed', 'cancelled', 'queued'].includes(patch?.status);
  const desiredPatch = {
    ...patch,
    updated_at: nextBrowserLeaseTimestamp(lease.updatedAt, patch?.updated_at),
    ...(isTerminal ? clearJobLease() : {}),
  };
  const scope = {
    jobId: lease.id,
    userId: lease.userId,
    workerScope: lease.workerScope,
    deploymentIdentity: lease.deploymentIdentity,
  };

  function matchesDesired(job) {
    if (
      !job ||
      job.id !== lease.id ||
      job.user_id !== lease.userId ||
      job.worker_scope !== lease.workerScope ||
      job.retry_count !== lease.retryCount
    ) {
      return false;
    }
    return Object.entries(desiredPatch).every(([key, value]) => {
      if (key === 'updated_at') return sameDatabaseTimestamp(job.updated_at, value);
      return isDeepStrictEqual(job[key], value);
    });
  }

  async function attemptTransition() {
    try {
      let query = applyBrowserJobScope(admin.from('agent_jobs').update(desiredPatch), scope)
        .eq('status', 'running')
        .eq('retry_count', lease.retryCount)
        .eq('updated_at', lease.updatedAt)
        .eq('lease_token', lease.leaseToken);
      const response = await query
        .select(
          'id, user_id, payload, status, retry_count, worker_scope, updated_at, error, result, lease_token, heartbeat_at, lease_expires_at'
        )
        .maybeSingle();
      return { response, error: response?.error || null };
    } catch (error) {
      return { response: null, error };
    }
  }

  const first = await attemptTransition();
  if (!first.error && first.response?.data?.id === lease.id) return true;

  let inspected = await inspectBrowserJob(admin, scope);
  if (inspected.state === 'known' && matchesDesired(inspected.job)) return true;
  if (inspected.state !== 'known' || !browserJobOwnsLease(inspected.job, lease)) {
    log.warn(null, 'browser-task.lease-transition-unresolved', {
      jobId: lease.id,
      scope: lease.workerScope,
      state: inspected.state,
      error: inspected.error?.message || first.error?.message,
    });
    return false;
  }

  // The read-back proves the exact running pre-state still exists. One exact
  // retry is safe; any other state is a real conflict or needs reconciliation.
  const retried = await attemptTransition();
  if (!retried.error && retried.response?.data?.id === lease.id) return true;
  inspected = await inspectBrowserJob(admin, scope);
  if (inspected.state === 'known' && matchesDesired(inspected.job)) return true;

  log.warn(null, 'browser-task.lease-transition-unresolved', {
    jobId: lease.id,
    scope: lease.workerScope,
    state: inspected.state,
    error: inspected.error?.message || retried.error?.message || first.error?.message,
  });
  return false;
}

async function inspectPriorBrowserTaskRun(admin, jobId) {
  try {
    const { data, error } = await admin
      .from('browser_task_runs')
      .select(BROWSER_TASK_RUN_COLUMNS)
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    return { state: data ? 'present' : 'absent', row: data || null };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function createBrowserTaskRun(admin, row) {
  const createdAt = new Date().toISOString();
  // agent_jobs.id is already a UUID primary key. Reusing it makes the browser
  // execution a durable one-to-one identity: a stale retry cannot allocate a
  // fresh audit id and silently repeat account creation or paid side effects.
  const runId = row?.job_id;
  if (!runId) {
    return {
      ok: false,
      runId: null,
      state: 'unknown',
      error: new Error('Browser audit run requires an exact job id'),
    };
  }

  const prior = await inspectPriorBrowserTaskRun(admin, runId);
  if (prior.state === 'unknown') {
    return { ok: false, runId, state: 'unknown', error: prior.error };
  }
  if (prior.row) {
    const identityMatches =
      prior.row.job_id === runId &&
      prior.row.user_id === row.user_id &&
      prior.row.target_tool_id === row.target_tool_id &&
      prior.row.provider_url === row.provider_url;
    return {
      ok: false,
      runId: prior.row.id || runId,
      row: prior.row,
      state: identityMatches ? 'prior-run' : 'conflict',
    };
  }

  const expected = { id: runId, ...row, created_at: createdAt, updated_at: createdAt };
  let writeError = null;
  try {
    const response = await admin
      .from('browser_task_runs')
      .insert(expected)
      .select(BROWSER_TASK_RUN_COLUMNS)
      .single();
    writeError = response?.error || null;
    if (!writeError && response?.data?.id === runId) {
      // The caller generated the durable id. Keep that exact identity even
      // when a narrow/mocked RETURNING projection omits other fields.
      const returned = { ...expected, ...response.data };
      if (browserTaskRunMatches(returned, expected)) return { ok: true, row: returned };
      return { ok: false, runId, row: response.data, state: 'conflict' };
    }
  } catch (error) {
    writeError = error;
  }

  try {
    const { data: current, error } = await admin
      .from('browser_task_runs')
      .select(BROWSER_TASK_RUN_COLUMNS)
      .eq('id', expected.id)
      .maybeSingle();
    if (!error && browserTaskRunMatches(current, expected)) {
      return { ok: true, row: { ...expected, ...current }, reconciled: true };
    }
    if (!error && current) {
      const identityMatches =
        current.job_id === expected.job_id &&
        current.user_id === expected.user_id &&
        current.target_tool_id === expected.target_tool_id &&
        current.provider_url === expected.provider_url;
      return {
        ok: false,
        runId: current.id || runId,
        row: current,
        error: writeError,
        state: identityMatches ? 'prior-run' : 'conflict',
      };
    }
    return {
      ok: false,
      runId,
      error: error || writeError,
      state: error ? 'unknown' : 'absent',
    };
  } catch (error) {
    return { ok: false, runId, error: error || writeError, state: 'unknown' };
  }
}

function browserTaskRunMatches(run, expected) {
  if (!run || run.id !== expected.id || run.job_id !== expected.job_id) return false;
  return Object.entries(expected).every(([key, value]) => {
    if (key === 'updated_at' || key === 'created_at') {
      return sameDatabaseTimestamp(run[key], value);
    }
    return isDeepStrictEqual(run[key], value);
  });
}

async function inspectBrowserTaskRun(admin, run) {
  try {
    const { data, error } = await admin
      .from('browser_task_runs')
      .select(BROWSER_TASK_RUN_COLUMNS)
      .eq('id', run.id)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    return { state: 'known', row: data || null };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

/**
 * Finish the mandatory browser audit row using the exact running snapshot.
 * A transport failure is reconciled by exact read-back and one safe CAS retry;
 * callers must park/terminalize the agent job when this remains unknown.
 */
async function transitionBrowserTaskRun(admin, run, patch) {
  if (!run?.id || !run?.job_id || !run?.user_id || run.status !== 'running') {
    return { state: 'unknown', error: new Error('Browser audit run snapshot is incomplete') };
  }
  const desired = {
    ...run,
    ...patch,
    updated_at: nextBrowserLeaseTimestamp(run.updated_at, patch?.updated_at),
  };

  async function attempt() {
    try {
      let query = admin
        .from('browser_task_runs')
        .update(
          patch ? { ...patch, updated_at: desired.updated_at } : { updated_at: desired.updated_at }
        )
        .eq('id', run.id)
        .eq('job_id', run.job_id)
        .eq('user_id', run.user_id)
        .eq('status', 'running');
      if (run.updated_at) query = query.eq('updated_at', run.updated_at);
      const response = await query.select(BROWSER_TASK_RUN_COLUMNS).maybeSingle();
      return { response, error: response?.error || null };
    } catch (error) {
      return { response: null, error };
    }
  }

  const first = await attempt();
  if (!first.error && browserTaskRunMatches(first.response?.data, desired)) {
    return { state: 'committed', row: first.response.data };
  }

  let inspected = await inspectBrowserTaskRun(admin, run);
  if (inspected.state === 'known' && browserTaskRunMatches(inspected.row, desired)) {
    return { state: 'committed', row: inspected.row, reconciled: true };
  }
  if (inspected.state !== 'known' || !browserTaskRunMatches(inspected.row, run)) {
    return {
      state: inspected.state === 'known' ? 'conflict' : 'unknown',
      row: inspected.row,
      error: inspected.error || first.error,
    };
  }

  const retried = await attempt();
  if (!retried.error && browserTaskRunMatches(retried.response?.data, desired)) {
    return { state: 'committed', row: retried.response.data, retried: true };
  }
  inspected = await inspectBrowserTaskRun(admin, run);
  if (inspected.state === 'known' && browserTaskRunMatches(inspected.row, desired)) {
    return { state: 'committed', row: inspected.row, reconciled: true };
  }
  return {
    state: inspected.state === 'known' ? 'conflict' : 'unknown',
    row: inspected.row,
    error: inspected.error || retried.error || first.error,
  };
}

function respondLostJobLease(res, done, jobId) {
  done({ status: 409, jobId, reason: LOST_JOB_LEASE_REASON });
  return res.status(409).json({ processed: 0, job_id: jobId, reason: LOST_JOB_LEASE_REASON });
}

async function loadBrowserCredentials(admin, userId) {
  const { data } = await admin
    .from('tools')
    .select('id, data')
    .in('id', [
      'tool-browser',
      'tool-captcha-solver',
      'tool-capsolver-solver',
      'tool-sms-verify',
      'tool-rentahuman',
    ])
    .eq('user_id', userId);
  const creds = {};
  const meta = {};
  for (const row of data || []) {
    const resolved = await resolveToolCredential({
      def: { id: row.id, connectionType: 'api', credentials: [] },
      userId,
    });
    creds[row.id] = resolved.apiKey || '';
    meta[row.id] = stripPersistedCredentials(row.data || {});
  }
  creds._meta = meta; // provider selection, budget caps, allowlist, etc.
  return creds;
}

function generateRegistrationData(email) {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const password = `Orch${Date.now().toString(36)}!${Math.random().toString(36).slice(2, 8)}`;
  return { firstName: first, lastName: last, email, password, fullName: `${first} ${last}` };
}

function mapFormFields(html, regData) {
  const fieldMap = [
    {
      patterns: [
        '[name="email"]',
        '[type="email"]',
        '#email',
        '[name="user[email]"]',
        '[name="username"]',
      ],
      value: regData.email,
    },
    {
      patterns: ['[name="password"]', '[type="password"]', '#password', '[name="user[password]"]'],
      value: regData.password,
    },
    {
      patterns: ['[name="password_confirmation"]', '[name="confirmPassword"]', '#password-confirm'],
      value: regData.password,
    },
    {
      patterns: ['[name="first_name"]', '[name="firstName"]', '#first-name', '#firstName'],
      value: regData.firstName,
    },
    {
      patterns: ['[name="last_name"]', '[name="lastName"]', '#last-name', '#lastName'],
      value: regData.lastName,
    },
    {
      patterns: ['[name="name"]', '[name="full_name"]', '#name', '#fullName'],
      value: regData.fullName,
    },
  ];
  const fields = [];
  for (const { patterns, value } of fieldMap) {
    for (const selector of patterns) {
      const attrName = selector.replaceAll(/^\[|\]$/g, '').replace('#', 'id="');
      if (html.includes(attrName)) {
        fields.push({ selector, value });
        break;
      }
    }
  }
  return fields;
}

function findSubmitSelector(html) {
  if (html.includes('type="submit"')) return 'button[type="submit"], input[type="submit"]';
  if (html.includes('type="button"')) return 'form button';
  return 'button[type="submit"]';
}

function guessApiKeyPageUrls(providerUrl) {
  const base = new URL(providerUrl).origin;
  return [
    `${base}/dashboard`,
    `${base}/api-keys`,
    `${base}/settings/api`,
    `${base}/account/api-keys`,
    `${base}/settings/tokens`,
    `${base}/account`,
  ];
}

function extractApiKeyFromHtml(html) {
  if (!html) return null;
  const keyPatterns = [
    /(?:api.?key|token|secret)[^<]*?["']([\w-]{20,})['"]/i,
    /data-key=["']([\w-]{20,})["']/i,
    /value=["'](sk[-_][\w-]{20,})["']/i,
    /value=["'](pk[-_][\w-]{20,})["']/i,
    />(sk[-_][\w-]{20,})</,
    />(pk[-_][\w-]{20,})</,
  ];
  for (const pattern of keyPatterns) {
    const match = pattern.exec(html);
    if (match) return match[1];
  }
  return null;
}

// ── Registration sub-steps ─────────────────────────────────────────

async function stepCreateEmail(steps) {
  const s = pushStep(steps, 'create-email');
  const emailAccount = await createEmail();
  s.status = 'done';
  s.email = emailAccount.address;
  return emailAccount;
}

async function stepNavigateSignup(steps, providerUrl, browserKey) {
  const s = pushStep(steps, 'navigate-signup', { url: providerUrl });
  const pageResult = await navigate(providerUrl, browserKey, { waitForSelector: 'form' });
  s.status = pageResult.html ? 'done' : 'failed';
  return pageResult;
}

function stepAnalyzeForm(steps, html, emailAddress) {
  const s = pushStep(steps, 'analyze-form');
  const regData = generateRegistrationData(emailAddress);
  const fields = mapFormFields(html, regData);
  const submitSelector = findSubmitSelector(html);
  s.status = 'done';
  s.fieldsFound = fields.length;
  return { regData, fields, submitSelector };
}

async function stepSolveCaptcha(steps, html, providerUrl, creds) {
  const captchaInfo = detectCaptcha(html);
  if (!captchaInfo.type) return null;

  const s = pushStep(steps, 'solve-captcha', { type: captchaInfo.type });
  try {
    const result = await solveCaptcha(captchaInfo, providerUrl, creds || {});
    if (result?.token) {
      s.status = 'done';
      s.solver = result.solver;
      if (result.cost) s.cost = result.cost;
      return result.token;
    }
    s.status = 'skipped';
    s.error = result?.reason || 'no_solver_available';
    return null;
  } catch (err) {
    s.status = 'failed';
    s.error = err.message;
    return null;
  }
}

/**
 * Phase 8d — rent a disposable number if the signup form has a tel input
 * and tool-sms-verify is configured. The rented number is appended to
 * fields so the first submit already includes it. Returns rental info so
 * the post-submit phase can wait for SMS + fill the code.
 */
async function stepRentPhoneIfNeeded(steps, { formHtml, fields, creds }) {
  if (!detectsPhoneVerification(formHtml)) return null;
  const smsKey = creds?.['tool-sms-verify'];
  if (!smsKey) {
    pushStep(steps, 'rent-phone', { status: 'skipped', reason: 'sms_not_configured' });
    return null;
  }
  const provider = creds._meta?.['tool-sms-verify']?.provider || '5sim';
  const country = creds._meta?.['tool-sms-verify']?.country || 'any';
  const s = pushStep(steps, 'rent-phone', { provider });
  try {
    const rental = await rentNumber({ apiKey: smsKey, provider, country, service: 'other' });
    // The form analyzer didn't map tel/phone inputs — append one now.
    fields.push({
      selector: 'input[type="tel"], input[name*="phone" i], input[name*="mobile" i]',
      value: rental.phone_number,
    });
    s.status = 'done';
    s.phone = rental.phone_number;
    return { ...rental, provider };
  } catch (err) {
    s.status = 'failed';
    s.error = err.message;
    return null;
  }
}

/**
 * Phase 8d — after the initial submit, if the provider shows a code-entry
 * screen, wait for the SMS we triggered by rental and complete the flow.
 * Always releases the rental (success or cancel) to stop billing.
 */
async function stepVerifyPhoneCode(
  steps,
  { postSubmitHtml, rental, creds, providerUrl, browserKey }
) {
  if (!rental) return { success: true };
  const smsKey = creds?.['tool-sms-verify'];
  if (!detectsPhoneVerification(postSubmitHtml || '')) {
    // No code-entry UI visible — assume the provider didn't require verification.
    await releaseNumber(smsKey, rental.activation_id, { provider: rental.provider, success: true });
    return { success: true };
  }
  const s = pushStep(steps, 'verify-phone-code');
  try {
    const sms = await waitForSms(smsKey, rental.activation_id, {
      provider: rental.provider,
      timeoutMs: 180_000,
    });
    const codeFields = [
      {
        selector: 'input[name*="code" i], input[name*="otp" i], input[name*="verif" i]',
        value: sms.code,
      },
    ];
    const submitResult = await fillAndSubmit(
      providerUrl,
      codeFields,
      'button[type="submit"], button[name="verify"]',
      browserKey
    );
    s.status = submitResult.success ? 'done' : 'failed';
    if (!submitResult.success) s.error = submitResult.error;
    await releaseNumber(smsKey, rental.activation_id, {
      provider: rental.provider,
      success: submitResult.success,
    });
    return submitResult;
  } catch (err) {
    s.status = 'failed';
    s.error = err.message;
    await releaseNumber(smsKey, rental.activation_id, {
      provider: rental.provider,
      success: false,
    });
    return { success: false, error: err.message };
  }
}

async function stepFillAndSubmit(
  steps,
  providerUrl,
  fields,
  submitSelector,
  browserKey,
  captchaToken
) {
  const s = pushStep(steps, 'fill-submit');
  const result = await fillAndSubmit(providerUrl, fields, submitSelector, browserKey, captchaToken);
  s.status = result.success ? 'done' : 'failed';
  if (!result.success) s.error = result.error;
  return result;
}

async function stepCheckVerification(steps, emailToken) {
  const s = pushStep(steps, 'check-verification');
  let verificationLink = null;
  for (let attempt = 0; attempt < MAX_EMAIL_POLLS; attempt++) {
    await new Promise((r) => setTimeout(r, EMAIL_POLL_INTERVAL_MS));
    try {
      const messages = await checkInbox(emailToken);
      if (messages.length > 0) {
        const msg = await readMessage(emailToken, messages[0].id);
        verificationLink = extractVerificationLink(msg.html || msg.text);
        if (verificationLink) break;
      }
    } catch {
      /* continue polling */
    }
  }
  s.status = verificationLink ? 'done' : 'skipped';
  return verificationLink;
}

async function stepVerifyEmail(steps, verificationLink, browserKey) {
  if (!verificationLink) return;
  const s = pushStep(steps, 'verify-email');
  try {
    await navigate(verificationLink, browserKey);
    s.status = 'done';
  } catch {
    s.status = 'failed';
  }
}

async function stepExtractCredential(steps, providerUrl, browserKey, usageCtx) {
  const s = pushStep(steps, 'extract-credential');
  const dashboardUrls = guessApiKeyPageUrls(providerUrl);
  const visited = []; // remember HTML bodies for the LLM fallback
  for (const dashUrl of dashboardUrls) {
    try {
      const dashResult = await navigate(dashUrl, browserKey);
      if (dashResult?.html) {
        visited.push({ url: dashUrl, html: dashResult.html });
        const apiKey = extractApiKeyFromHtml(dashResult.html);
        if (apiKey) {
          s.status = 'done';
          s.dashboardUrl = dashUrl;
          s.extractedBy = 'regex';
          return apiKey;
        }
      }
    } catch {
      /* try next URL */
    }
  }

  // Phase 5 fallback — hardcoded selectors missed. Ask the LLM to locate the
  // key in one of the dashboard HTMLs we already visited. Costs ~1 LLM call.
  const llmKey = await extractWithLlm(visited, usageCtx);
  if (llmKey) {
    s.status = 'done';
    s.extractedBy = 'llm-fallback';
    return llmKey;
  }
  s.status = 'failed';
  return null;
}

/**
 * LLM fallback extractor — prompt Groq/GLM with a trimmed HTML body and ask
 * for the API key. Strict JSON response. Rejects keys that look like junk
 * (too short, too long, non-word chars).
 */
async function extractWithLlm(visited, usageCtx) {
  if (!visited?.length) return null;
  // Pick the page whose HTML most strongly hints at API keys.
  const scored = visited
    .map((v) => ({ ...v, score: keyPageScore(v.html) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score === 0) return null;
  const trimmed = trimHtmlForLlm(best.html);

  try {
    const resp = await executeLlmTracked({
      provider: defaultProvider(),
      model: defaultCheapModel(),
      temperature: 0,
      maxTokens: 300,
      jsonMode: true,
      systemPrompt:
        'You extract a single API key from a provider dashboard HTML. Return JSON only.',
      prompt: `URL: ${best.url}\n\nHTML (trimmed):\n${trimmed}\n\nReturn ONLY: {"api_key": "<the key>"} or {"error":"no key visible"}. Keys are typically alphanumeric with dashes/underscores, 20-120 chars, often prefixed with sk-, pk-, tok-, or similar. Do not hallucinate.`,
      usage: usageCtx?.admin
        ? {
            admin: usageCtx.admin,
            userId: usageCtx.userId,
            jobId: usageCtx.jobId,
            source: 'account-creation',
            operation: 'extract-credential',
            agentName: 'Sandris Kalns',
          }
        : undefined,
    });
    const parsed = parseLlmJson(resp?.content || resp?.text || '');
    const candidate = parsed?.api_key;
    if (!candidate || typeof candidate !== 'string') return null;
    if (!/^[\w-]{20,120}$/.test(candidate.trim())) return null;
    return candidate.trim();
  } catch {
    return null;
  }
}

function keyPageScore(html) {
  if (!html) return 0;
  let score = 0;
  if (/api.?key/i.test(html)) score += 2;
  if (/developer|secret|token/i.test(html)) score += 1;
  if (/<input[^>]+(?:value|data-(?:key|secret))=/i.test(html)) score += 2;
  if (/sk_|pk_|sk-|pk-/i.test(html)) score += 2;
  return score;
}

function trimHtmlForLlm(html, maxChars = 4000) {
  if (!html) return '';
  // Remove scripts/styles/comments, collapse whitespace, cap length.
  const stripped = html
    .replaceAll(/<script[\s\S]*?<\/script>/gi, '')
    .replaceAll(/<style[\s\S]*?<\/style>/gi, '')
    .replaceAll(/<!--[\s\S]*?-->/g, '')
    .replaceAll(/\s+/g, ' ');
  return stripped.length > maxChars ? stripped.slice(0, maxChars) + '…' : stripped;
}

async function stepSaveCredential(steps, apiKey, targetToolId, targetToolSnapshot, userId, admin) {
  if (!apiKey || !targetToolId) return { saved: false, error: null };
  const s = pushStep(steps, 'save-credential');
  try {
    if (!targetToolSnapshot) throw new Error('Exact tool snapshot unavailable');
    const reserved = await reserveToolCredentialWrite({
      admin,
      userId,
      toolSnapshot: targetToolSnapshot,
      source: 'browser-task',
    });
    if (!reserved.ok) {
      s.status = 'failed';
      s.error = reserved.message || 'Tool changed before credential storage';
      return { saved: false, error: s.error, code: reserved.code };
    }

    const saved = await saveUserApiKey({
      userId,
      provider: `tool:${targetToolId}`,
      label: targetToolSnapshot.name,
      apiKey,
      skipProbe: true,
      adminClient: admin,
      toolCredentialReservation: reserved.reservation,
    });
    if (!saved.success) {
      s.status = 'failed';
      s.error = saved.reconciliationRequired
        ? 'Credential storage needs reconciliation'
        : 'Encrypted credential storage unavailable';
      return { saved: false, error: s.error, code: saved.code };
    }

    s.status = 'done';
    return { saved: true, error: null };
  } catch {
    s.status = 'failed';
    s.error = 'Credential storage needs reconciliation';
    return { saved: false, error: s.error };
  }
}

const BROWSER_RESUME_STRATEGY = 'h40-missing-credential';
const BROWSER_RESUME_ACTION = 'tool-provisioning';
const BROWSER_RESUME_STATUS = 'provisioning_tools';

function sameDatabaseTimestamp(left, right) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function matchesUnrecoverableGoalMarker(goal, { jobId, targetToolId, reason, markerAt }) {
  const marker = goal?.data?.sandris_needs_human;
  return !!(
    marker &&
    marker.job_id === jobId &&
    marker.tool_id === targetToolId &&
    marker.reason === reason &&
    (markerAt ? sameDatabaseTimestamp(marker.at, markerAt) : true) &&
    sameDatabaseTimestamp(goal.updated_at, markerAt || marker.at)
  );
}

async function inspectUnrecoverableGoalMarker(admin, context) {
  const { goalId, userId, jobId } = context;
  try {
    const { data: goal, error } = await admin
      .from('goals')
      .select('id, user_id, data, status, updated_at')
      .eq('id', goalId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!goal || goal.status !== 'awaiting_tools' || goal.data?.blocked_by_job_id !== jobId) {
      return { state: 'not-applicable', goal: goal || null };
    }
    if (matchesUnrecoverableGoalMarker(goal, context)) {
      return { state: 'committed', goal };
    }
    return { state: 'current', goal };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function markUnrecoverableBlockingGoal(
  admin,
  { goalId, userId, jobId, targetToolId, reason, fenceLease = null }
) {
  const loaded = await inspectUnrecoverableGoalMarker(admin, {
    goalId,
    userId,
    jobId,
    targetToolId,
    reason,
    markerAt: null,
  });
  if (loaded.state !== 'current') return loaded;

  let snapshot = loaded.goal;
  const markerAt = nextBrowserLeaseTimestamp(snapshot.updated_at);
  const context = { goalId, userId, jobId, targetToolId, reason, markerAt };
  const marker = { tool_id: targetToolId, reason, at: markerAt, job_id: jobId };
  const desiredData = { ...(snapshot.data || {}), sandris_needs_human: marker };

  async function attempt(current) {
    try {
      const response = await admin
        .from('goals')
        .update({ data: desiredData, updated_at: markerAt })
        .eq('id', goalId)
        .eq('user_id', userId)
        .eq('status', current.status)
        .eq('updated_at', current.updated_at)
        .contains('data', { blocked_by_job_id: jobId })
        .select('id, user_id, data, status, updated_at')
        .maybeSingle();
      return { response, error: response?.error || null };
    } catch (error) {
      return { response: null, error };
    }
  }

  if (fenceLease && !(await fenceLease('before-unrecoverable-goal-marker'))) {
    return { state: 'lease-lost', goal: snapshot };
  }
  const first = await attempt(snapshot);
  if (!first.error && first.response?.data?.id === goalId) {
    return { state: 'committed', goal: { ...snapshot, data: desiredData, updated_at: markerAt } };
  }
  let inspected = await inspectUnrecoverableGoalMarker(admin, context);
  if (inspected.state !== 'current') {
    return { ...inspected, error: inspected.error || first.error };
  }
  if (
    inspected.goal.status !== snapshot.status ||
    !sameDatabaseTimestamp(inspected.goal.updated_at, snapshot.updated_at) ||
    !isDeepStrictEqual(inspected.goal.data || {}, snapshot.data || {})
  ) {
    return { state: 'needs-park', goal: inspected.goal, error: first.error };
  }

  snapshot = inspected.goal;
  if (fenceLease && !(await fenceLease('before-unrecoverable-goal-marker-retry'))) {
    return { state: 'lease-lost', goal: snapshot };
  }
  const retried = await attempt(snapshot);
  if (!retried.error && retried.response?.data?.id === goalId) {
    return { state: 'committed', goal: { ...snapshot, data: desiredData, updated_at: markerAt } };
  }
  inspected = await inspectUnrecoverableGoalMarker(admin, context);
  if (inspected.state !== 'current') {
    return { ...inspected, error: inspected.error || retried.error || first.error };
  }
  return {
    state: 'needs-park',
    goal: inspected.goal,
    error: retried.error || first.error,
    context,
  };
}

async function parkUnrecoverableGoalReconciliation(
  admin,
  { goal, goalId, userId, jobId, targetToolId, reason, auditRunId, fenceLease = null }
) {
  if (!goal?.id || goal.data?.blocked_by_job_id !== jobId) return { state: 'unverified' };
  const parkedAt = nextBrowserLeaseTimestamp(goal.updated_at);
  const parkedData = {
    ...(goal.data || {}),
    browser_task_reconciliation: {
      job_id: jobId,
      audit_run_id: auditRunId,
      tool_id: targetToolId,
      reason,
      at: parkedAt,
    },
    failure_reason: 'Browser task handoff needs reconciliation',
    failure_stage: 'browser-task-handoff',
    failure_at: parkedAt,
  };
  if (fenceLease && !(await fenceLease('before-unrecoverable-goal-park'))) {
    return { state: 'lease-lost', goal };
  }
  try {
    const { data, error } = await admin
      .from('goals')
      .update({ status: 'needs_human', data: parkedData, updated_at: parkedAt })
      .eq('id', goalId)
      .eq('user_id', userId)
      .eq('status', goal.status)
      .eq('updated_at', goal.updated_at)
      .contains('data', { blocked_by_job_id: jobId })
      .select('id, user_id, data, status, updated_at')
      .maybeSingle();
    if (!error && data?.id === goalId) return { state: 'parked', goal: data };
  } catch {
    // Exact read-back below distinguishes a committed park from uncertainty.
  }

  const inspected = await inspectUnrecoverableGoalMarker(admin, {
    goalId,
    userId,
    jobId,
    targetToolId,
    reason,
    markerAt: goal.data?.sandris_needs_human?.at || null,
  });
  if (inspected.state === 'committed') return { state: 'marker-committed', goal: inspected.goal };
  if (
    ['current', 'not-applicable'].includes(inspected.state) &&
    inspected.goal.status === 'needs_human' &&
    inspected.goal.data?.browser_task_reconciliation?.job_id === jobId &&
    inspected.goal.data?.browser_task_reconciliation?.audit_run_id === auditRunId &&
    sameDatabaseTimestamp(inspected.goal.updated_at, parkedAt)
  ) {
    return { state: 'parked', goal: inspected.goal, reconciled: true };
  }
  return { state: 'unverified', goal: inspected.goal, error: inspected.error };
}

function buildBlockedGoalContinuation({ goal, browserJobId, targetToolId, userId, resumeAt }) {
  const workerScope = resolveWorkerScope();
  const deploymentIdentity = resolveWorkerDeploymentIdentity();
  const id = deterministicAgentJobId('browser-credential-goal-resume', {
    browserJobId,
    goalId: goal.id,
    goalUpdatedAt: goal.updated_at,
    targetToolId,
    userId,
    workerScope,
    deploymentIdentity,
  });
  const payload = {
    type: 'orchestrate-goal',
    action: BROWSER_RESUME_ACTION,
    goalId: goal.id,
    _userId: userId,
    userId,
    user_id: userId,
    _healedBy: BROWSER_RESUME_STRATEGY,
    _healAt: resumeAt,
    _credentialResumeBrowserJobId: browserJobId,
    _credentialResumeGoalUpdatedAt: goal.updated_at,
  };
  if (workerScope === 'preview' && deploymentIdentity) {
    payload[WORKER_DEPLOYMENT_PAYLOAD_KEY] = deploymentIdentity;
  }
  return {
    id,
    user_id: userId,
    status: 'queued',
    worker_scope: workerScope,
    created_at: resumeAt,
    updated_at: resumeAt,
    payload,
  };
}

async function inspectBlockedGoalTransition(
  admin,
  { goal, userId, resumeAt, expectedData, marker }
) {
  try {
    const { data: current, error } = await admin
      .from('goals')
      .select('id, user_id, status, data, updated_at')
      .eq('id', goal.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!current) return { state: 'conflict' };
    if (
      current.status === BROWSER_RESUME_STATUS &&
      sameDatabaseTimestamp(current.updated_at, resumeAt) &&
      current.data?.credential_resume?.job_id === marker.job_id &&
      current.data?.credential_resume?.browser_job_id === marker.browser_job_id &&
      isDeepStrictEqual(current.data || {}, expectedData || {})
    ) {
      return { state: 'committed', goal: current };
    }
    if (
      current.status === goal.status &&
      sameDatabaseTimestamp(current.updated_at, goal.updated_at) &&
      isDeepStrictEqual(current.data || {}, goal.data || {})
    ) {
      return { state: 'original', goal: current };
    }
    return { state: 'conflict', goal: current };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function transitionBlockedGoal(admin, context) {
  const { goal, userId, browserJobId, resumeAt, expectedData, marker } = context;
  let response;
  let thrownError = null;
  try {
    response = await admin
      .from('goals')
      .update({
        status: BROWSER_RESUME_STATUS,
        data: expectedData,
        updated_at: resumeAt,
      })
      .eq('id', goal.id)
      .eq('user_id', userId)
      .eq('status', 'awaiting_tools')
      .eq('updated_at', goal.updated_at)
      .contains('data', { blocked_by_job_id: browserJobId })
      .select('id, user_id, status, data, updated_at')
      .maybeSingle();
  } catch (error) {
    thrownError = error;
  }
  if (!thrownError && !response?.error && response?.data) {
    return {
      state: 'committed',
      goal: {
        ...goal,
        status: BROWSER_RESUME_STATUS,
        data: expectedData,
        updated_at: response.data.updated_at || resumeAt,
        ...response.data,
      },
    };
  }
  const inspection = await inspectBlockedGoalTransition(admin, context);
  return {
    ...inspection,
    writeError: thrownError || response?.error || null,
    marker,
  };
}

function continuationIdentityMatches(job, expected) {
  return (
    job?.id === expected.id &&
    job?.user_id === expected.user_id &&
    job?.worker_scope === expected.worker_scope &&
    isDeepStrictEqual(job?.payload || {}, expected.payload || {})
  );
}

async function inspectBlockedGoalContinuation(admin, expected) {
  try {
    const { data: job, error } = await admin
      .from('agent_jobs')
      .select('id, user_id, status, error, worker_scope, payload, updated_at')
      .eq('id', expected.id)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!job) return { state: 'absent' };
    if (!continuationIdentityMatches(job, expected)) return { state: 'conflict', job };
    if (job.status === 'queued') return { state: 'queued', job };
    if (job.status === 'running' || job.status === 'done') return { state: 'active', job };
    if (job.status === 'failed') return { state: 'failed', job };
    return { state: 'conflict', job };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function enqueueBlockedGoalContinuation(admin, expected) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const job = await enqueueAgentJob(admin, expected, {
        triggerProcessNextImpl: triggerProcessNext,
      });
      const inspection = await inspectBlockedGoalContinuation(admin, expected);
      if (inspection.state === 'queued' || inspection.state === 'active') {
        return { state: 'committed', job: inspection.job || job };
      }
      return {
        ...inspection,
        error: inspection.error || new Error('Continuation write could not be verified'),
      };
    } catch (error) {
      lastError = error;
      const inspection = await inspectBlockedGoalContinuation(admin, expected);
      if (inspection.state === 'active') return { state: 'committed', job: inspection.job };
      if (inspection.state === 'queued' && expected.worker_scope !== 'preview') {
        return { state: 'committed', job: inspection.job };
      }
      if (inspection.state !== 'queued' || attempt > 0) {
        return { ...inspection, error };
      }
      // A Preview insert may have committed before its response was lost.
      // Retry the same deterministic row once so enqueueAgentJob can verify it
      // and issue the exact deployment-bound wake.
    }
  }
  return { state: 'unknown', error: lastError };
}

async function terminalizeBlockedGoalContinuation(admin, expected, reason) {
  const failedAt = nextBrowserLeaseTimestamp(expected.updated_at);
  const failure = `Browser credential continuation abandoned: ${reason}`;
  let response;
  let thrownError = null;
  try {
    let terminalize = admin
      .from('agent_jobs')
      .update({ status: 'failed', error: failure, updated_at: failedAt })
      .eq('id', expected.id)
      .eq('user_id', expected.user_id)
      .eq('status', 'queued')
      .eq('updated_at', expected.updated_at)
      .eq('worker_scope', expected.worker_scope)
      .eq('payload->>type', expected.payload.type)
      .eq('payload->>action', expected.payload.action)
      .eq('payload->>goalId', expected.payload.goalId)
      .eq('payload->>_userId', expected.payload._userId)
      .eq('payload->>_healedBy', expected.payload._healedBy)
      .eq('payload->>_healAt', expected.payload._healAt)
      .eq('payload->>_credentialResumeBrowserJobId', expected.payload._credentialResumeBrowserJobId)
      .eq(
        'payload->>_credentialResumeGoalUpdatedAt',
        expected.payload._credentialResumeGoalUpdatedAt
      );
    if (expected.worker_scope === 'preview') {
      terminalize = terminalize.eq(
        `payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`,
        expected.payload[WORKER_DEPLOYMENT_PAYLOAD_KEY]
      );
    }
    response = await terminalize.select('id, status').maybeSingle();
  } catch (error) {
    thrownError = error;
  }
  if (
    !thrownError &&
    !response?.error &&
    response?.data?.id === expected.id &&
    response.data.status === 'failed'
  ) {
    return { state: 'terminal' };
  }
  const inspection = await inspectBlockedGoalContinuation(admin, expected);
  if (inspection.state === 'failed' || inspection.state === 'absent') {
    return { state: 'terminal' };
  }
  return {
    state: inspection.state,
    error: inspection.error || thrownError || response?.error || null,
  };
}

async function rollbackBlockedGoal(admin, { goal, transitionedGoal, marker, userId }) {
  const rollbackAt = nextBrowserLeaseTimestamp(transitionedGoal.updated_at);
  const desired = {
    id: goal.id,
    user_id: userId,
    status: goal.status,
    data: goal.data || {},
    updated_at: rollbackAt,
  };

  async function inspect() {
    try {
      const { data: current, error } = await admin
        .from('goals')
        .select('id, user_id, status, data, updated_at')
        .eq('id', goal.id)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) return { state: 'unknown', error };
      if (!current) return { state: 'conflict' };
      if (
        current.status === desired.status &&
        sameDatabaseTimestamp(current.updated_at, desired.updated_at) &&
        isDeepStrictEqual(current.data || {}, desired.data || {})
      ) {
        return { state: 'rolled-back', goal: current };
      }
      if (
        current.status === transitionedGoal.status &&
        sameDatabaseTimestamp(current.updated_at, transitionedGoal.updated_at) &&
        isDeepStrictEqual(current.data || {}, transitionedGoal.data || {})
      ) {
        return { state: 'transitioned', goal: current };
      }
      return { state: 'conflict', goal: current };
    } catch (error) {
      return { state: 'unknown', error };
    }
  }

  async function attempt() {
    try {
      const response = await admin
        .from('goals')
        .update({ status: desired.status, data: desired.data, updated_at: rollbackAt })
        .eq('id', goal.id)
        .eq('user_id', userId)
        .eq('status', BROWSER_RESUME_STATUS)
        .eq('updated_at', transitionedGoal.updated_at)
        .eq('data->credential_resume->>job_id', marker.job_id)
        .eq('data->credential_resume->>browser_job_id', marker.browser_job_id)
        .select('id, user_id, status, data, updated_at')
        .maybeSingle();
      return { response, error: response?.error || null };
    } catch (error) {
      return { response: null, error };
    }
  }

  const first = await attempt();
  if (!first.error && first.response?.data?.id === goal.id) return { state: 'rolled-back' };
  let inspection = await inspect();
  if (inspection.state === 'rolled-back') return { ...inspection, reconciled: true };
  if (inspection.state !== 'transitioned') {
    return { ...inspection, error: inspection.error || first.error || null };
  }

  const retried = await attempt();
  if (!retried.error && retried.response?.data?.id === goal.id) {
    return { state: 'rolled-back', retried: true };
  }
  inspection = await inspect();
  if (inspection.state === 'rolled-back') return { ...inspection, reconciled: true };
  return { ...inspection, error: inspection.error || retried.error || first.error || null };
}

async function parkBlockedGoal(admin, { goal, transitionedGoal, marker, userId, reason }) {
  const parkedAt = nextBrowserLeaseTimestamp(transitionedGoal.updated_at);
  const parkedMarker = {
    ...marker,
    status: 'reconciliation_required',
    error: String(reason || 'Continuation state is unknown').slice(0, 300),
    reconciled_at: parkedAt,
  };
  const parkedData = {
    ...(transitionedGoal.data || {}),
    credential_resume: parkedMarker,
    failure_reason: 'Credential stored, but goal continuation needs reconciliation',
    failure_stage: 'credential-resume',
    failure_at: parkedAt,
  };
  const desired = {
    id: goal.id,
    user_id: userId,
    status: 'needs_human',
    data: parkedData,
    updated_at: parkedAt,
  };

  async function inspect() {
    try {
      const { data: current, error } = await admin
        .from('goals')
        .select('id, user_id, status, data, updated_at')
        .eq('id', goal.id)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) return { state: 'unknown', error };
      if (!current) return { state: 'conflict' };
      if (
        current.status === desired.status &&
        sameDatabaseTimestamp(current.updated_at, desired.updated_at) &&
        isDeepStrictEqual(current.data || {}, desired.data || {})
      ) {
        return { state: 'parked', goal: current };
      }
      if (
        current.status === transitionedGoal.status &&
        sameDatabaseTimestamp(current.updated_at, transitionedGoal.updated_at) &&
        isDeepStrictEqual(current.data || {}, transitionedGoal.data || {})
      ) {
        return { state: 'transitioned', goal: current };
      }
      return { state: 'conflict', goal: current };
    } catch (error) {
      return { state: 'unknown', error };
    }
  }

  async function attempt() {
    try {
      const response = await admin
        .from('goals')
        .update({ status: desired.status, data: desired.data, updated_at: parkedAt })
        .eq('id', goal.id)
        .eq('user_id', userId)
        .eq('status', BROWSER_RESUME_STATUS)
        .eq('updated_at', transitionedGoal.updated_at)
        .eq('data->credential_resume->>job_id', marker.job_id)
        .eq('data->credential_resume->>browser_job_id', marker.browser_job_id)
        .select('id, user_id, status, data, updated_at')
        .maybeSingle();
      return { response, error: response?.error || null };
    } catch (error) {
      return { response: null, error };
    }
  }

  const first = await attempt();
  if (!first.error && first.response?.data?.id === goal.id) return { state: 'parked' };
  let inspection = await inspect();
  if (inspection.state === 'parked') return { ...inspection, reconciled: true };
  if (inspection.state !== 'transitioned') {
    return { ...inspection, error: inspection.error || first.error || null };
  }

  const retried = await attempt();
  if (!retried.error && retried.response?.data?.id === goal.id) {
    return { state: 'parked', retried: true };
  }
  inspection = await inspect();
  if (inspection.state === 'parked') return { ...inspection, reconciled: true };
  return { ...inspection, error: inspection.error || retried.error || first.error || null };
}

/** Resume only goals whose exact browser-job block snapshot is still current. */
async function stepResumeBlockedGoals(
  steps,
  { admin, jobId, targetToolId, userId, fenceLease = null }
) {
  const s = pushStep(steps, 'resume-blocked-goals');
  const outcome = {
    resumedGoalIds: [],
    skippedGoalIds: [],
    failures: [],
    reconciliationRequired: false,
  };
  const fenceMutation = async (stage) => {
    if (!fenceLease || (await fenceLease(stage))) return true;
    outcome.leaseLost = true;
    outcome.leaseLostStage = stage;
    return false;
  };
  let blocked;
  try {
    const result = await admin
      .from('goals')
      .select('id, user_id, data, status, updated_at')
      .eq('user_id', userId)
      .eq('status', 'awaiting_tools')
      .contains('data', { blocked_by_job_id: jobId });
    if (result.error) throw result.error;
    blocked = result.data || [];
  } catch (error) {
    outcome.failures.push({ goalId: null, reason: error.message, state: 'query-unknown' });
    outcome.reconciliationRequired = true;
    s.status = 'failed';
    s.error = error.message;
    return outcome;
  }

  if (!(await fenceMutation('before-blocked-goal-resume'))) {
    s.status = 'failed';
    s.error = 'Browser job lease lost before blocked goal resume';
    return outcome;
  }

  for (const goal of blocked) {
    if (
      goal.user_id !== userId ||
      goal.status !== 'awaiting_tools' ||
      goal.data?.blocked_by_job_id !== jobId
    ) {
      continue;
    }
    if (!(await fenceMutation(`before-blocked-goal-resume:${goal.id}`))) {
      s.status = 'failed';
      s.error = 'Browser job lease lost during blocked goal resume';
      return outcome;
    }
    const resumeAt = nextBrowserLeaseTimestamp(goal.updated_at);
    const continuation = buildBlockedGoalContinuation({
      goal,
      browserJobId: jobId,
      targetToolId,
      userId,
      resumeAt,
    });
    const marker = {
      source: 'browser-task',
      browser_job_id: jobId,
      job_id: continuation.id,
      tool_id: targetToolId,
      status: 'queued',
      at: resumeAt,
      goal_updated_at: goal.updated_at,
    };
    const resumedData = { ...(goal.data || {}) };
    delete resumedData.blocked_by_job_id;
    delete resumedData.sandris_needs_human;
    delete resumedData.failure_reason;
    delete resumedData.failure_stage;
    delete resumedData.failure_at;
    delete resumedData.h40_skipped_reason;
    resumedData.credential_resume = marker;
    resumedData.healing_log = [
      ...(goal.data?.healing_log || []),
      {
        at: resumeAt,
        strategy: BROWSER_RESUME_STRATEGY,
        action: 'credential-arrived',
        job_id: jobId,
        continuation_job_id: continuation.id,
        tool_id: targetToolId,
      },
    ];

    const transition = await transitionBlockedGoal(admin, {
      goal,
      userId,
      browserJobId: jobId,
      resumeAt,
      expectedData: resumedData,
      marker,
    });
    if (transition.state === 'conflict') {
      outcome.skippedGoalIds.push(goal.id);
      continue;
    }
    if (transition.state === 'unknown') {
      if (!(await fenceMutation(`before-blocked-goal-transition-park:${goal.id}`))) {
        s.status = 'failed';
        s.error = 'Browser job lease lost before blocked goal transition park';
        return outcome;
      }
      const park = await parkBlockedGoal(admin, {
        goal,
        transitionedGoal: {
          ...goal,
          status: BROWSER_RESUME_STATUS,
          data: resumedData,
          updated_at: resumeAt,
        },
        marker,
        userId,
        reason:
          transition.writeError?.message ||
          transition.error?.message ||
          'Blocked goal transition outcome is unknown',
      });
      outcome.failures.push({
        goalId: goal.id,
        reason:
          transition.writeError?.message ||
          transition.error?.message ||
          'Blocked goal transition needs reconciliation',
        state: park.state === 'parked' ? 'parked' : 'reconciliation-unverified',
      });
      outcome.reconciliationRequired = true;
      continue;
    }
    if (transition.state !== 'committed') {
      outcome.failures.push({
        goalId: goal.id,
        reason:
          transition.writeError?.message ||
          transition.error?.message ||
          'Blocked goal transition was not committed',
        state: `transition-${transition.state}`,
      });
      continue;
    }

    if (!(await fenceMutation(`before-blocked-goal-enqueue:${goal.id}`))) {
      s.status = 'failed';
      s.error = 'Browser job lease lost before blocked goal enqueue';
      return outcome;
    }
    const enqueue = await enqueueBlockedGoalContinuation(admin, continuation);
    if (enqueue.state !== 'committed') {
      let stopped = enqueue.state === 'failed' || enqueue.state === 'absent';
      if (enqueue.state === 'queued' && continuation.worker_scope === 'preview') {
        if (!(await fenceMutation(`before-blocked-goal-terminalize:${goal.id}`))) {
          s.status = 'failed';
          s.error = 'Browser job lease lost before continuation terminalization';
          return outcome;
        }
        const terminal = await terminalizeBlockedGoalContinuation(
          admin,
          continuation,
          enqueue.error?.message || 'Preview exact wake failed'
        );
        stopped = terminal.state === 'terminal';
      }

      if (stopped) {
        if (!(await fenceMutation(`before-blocked-goal-rollback:${goal.id}`))) {
          s.status = 'failed';
          s.error = 'Browser job lease lost before blocked goal rollback';
          return outcome;
        }
        const rollback = await rollbackBlockedGoal(admin, {
          goal,
          transitionedGoal: transition.goal,
          marker,
          userId,
        });
        if (rollback.state === 'conflict') {
          outcome.skippedGoalIds.push(goal.id);
          continue;
        }
        if (rollback.state === 'rolled-back') {
          outcome.failures.push({
            goalId: goal.id,
            reason: enqueue.error?.message || 'Goal continuation could not be queued',
            state: 'enqueue-rolled-back',
          });
          continue;
        }
      }

      if (!(await fenceMutation(`before-blocked-goal-park:${goal.id}`))) {
        s.status = 'failed';
        s.error = 'Browser job lease lost before blocked goal reconciliation park';
        return outcome;
      }
      const park = await parkBlockedGoal(admin, {
        goal,
        transitionedGoal: transition.goal,
        marker,
        userId,
        reason: enqueue.error?.message || `Continuation outcome: ${enqueue.state}`,
      });
      outcome.failures.push({
        goalId: goal.id,
        reason: enqueue.error?.message || 'Goal continuation needs reconciliation',
        state: park.state === 'parked' ? 'parked' : 'reconciliation-unverified',
      });
      outcome.reconciliationRequired = true;
      continue;
    }

    outcome.resumedGoalIds.push(goal.id);
    if (!(await fenceMutation(`before-blocked-goal-audit:${goal.id}`))) {
      s.status = 'failed';
      s.error = 'Browser job lease lost before blocked goal audit';
      return outcome;
    }
    try {
      const audit = await admin.from('goal_log').insert({
        goal_id: goal.id,
        event_type: 'goal_credential_arrived',
        details: {
          strategy: BROWSER_RESUME_STRATEGY,
          job_id: jobId,
          continuation_job_id: continuation.id,
          tool_id: targetToolId,
        },
      });
      if (audit?.error) throw audit.error;
    } catch (error) {
      log.warn(null, 'browser-task.goal-resume-audit-failed', {
        goalId: goal.id,
        continuationJobId: continuation.id,
        error: error.message,
      });
    }
  }

  s.status = outcome.failures.length ? 'failed' : 'done';
  s.resumedCount = outcome.resumedGoalIds.length;
  s.skippedCount = outcome.skippedGoalIds.length;
  s.failureCount = outcome.failures.length;
  if (outcome.failures.length) {
    s.error = outcome.failures
      .map((failure) => failure.reason)
      .join('; ')
      .slice(0, 500);
  }
  return outcome;
}

async function stepNotifyReady(
  steps,
  {
    admin,
    userId,
    jobId,
    targetToolId,
    providerUrl,
    tempEmail,
    durationMs,
    resumedGoalIds = [],
    resumeOutcome = null,
  }
) {
  if (!targetToolId || !userId) return;
  const s = pushStep(steps, 'notify-ready');
  try {
    const host = (() => {
      try {
        return new URL(providerUrl).host;
      } catch {
        return providerUrl;
      }
    })();
    const plural = resumedGoalIds.length === 1 ? '' : 's';
    const resumedSuffix = resumedGoalIds.length
      ? ` Resumed ${resumedGoalIds.length} blocked goal${plural}.`
      : '';
    const failureCount = resumeOutcome?.failures?.length || 0;
    const resumeFailureSuffix = failureCount
      ? ` The credential was stored, but ${failureCount} blocked goal continuation${failureCount === 1 ? '' : 's'} need${failureCount === 1 ? 's' : ''} attention.`
      : '';
    const actionGoalId = resumedGoalIds[0] || resumeOutcome?.failures?.[0]?.goalId || null;
    await admin.from('notification_log').insert({
      user_id: userId,
      channel: 'in_app',
      event_type: 'credential_provisioned',
      subject: `Credential ready: ${host}`,
      body: `Sandris Kalns provisioned a new encrypted API credential for ${host}. It is saved and ready for other agents to use.${resumedSuffix}${resumeFailureSuffix}`,
      status: 'sent',
      sent_at: new Date().toISOString(),
      metadata: {
        priority: 'normal',
        tool_id: targetToolId,
        provider_url: providerUrl,
        agent_name: 'Sandris Kalns',
        agent_role: 'Account Creation Specialist',
        temp_email: tempEmail,
        signup_duration_ms: durationMs,
        job_id: jobId,
        resumed_goal_ids: resumedGoalIds,
        goal_resume_succeeded: failureCount === 0,
        goal_resume_reconciliation_required: resumeOutcome?.reconciliationRequired === true,
        goal_resume_failures: (resumeOutcome?.failures || []).map((failure) => ({
          goal_id: failure.goalId,
          state: failure.state,
        })),
        action: actionGoalId
          ? { type: 'view_goal', label: 'Open goal', target_url: `/goals?id=${actionGoalId}` }
          : { type: 'view_tool', label: 'Open tool', target_url: '/agent-hub?tab=tools' },
      },
    });
    s.status = 'done';
  } catch (err) {
    s.status = 'failed';
    s.error = err.message;
  }
}

// ── Core registration orchestrator ──────────────────────────────────

async function executeRegistration({
  providerUrl,
  targetToolId,
  userId,
  creds,
  admin,
  jobId,
  fenceLease,
  targetToolSnapshot,
}) {
  const steps = [];
  const startMs = Date.now();
  const browserKey = creds['tool-browser'];
  if (!browserKey) throw new Error('Browserless API key not configured. Add it in Tool Settings.');

  const fence = async (stage, activeRental = null) => {
    if (await fenceLease?.(stage)) return null;
    // Releasing a rental owned by this invocation is compensating cleanup, not
    // new workflow progress. Do it even after lease loss to stop further spend.
    if (activeRental) {
      try {
        await releaseNumber(creds?.['tool-sms-verify'], activeRental.activation_id, {
          provider: activeRental.provider,
          success: false,
        });
      } catch {
        /* best-effort cleanup */
      }
    }
    return { success: false, leaseLost: true, leaseLostStage: stage, steps };
  };

  let leaseLost = await fence('before-temp-email');
  if (leaseLost) return leaseLost;
  const emailAccount = await stepCreateEmail(steps);

  leaseLost = await fence('before-signup-navigation');
  if (leaseLost) return leaseLost;
  const pageResult = await stepNavigateSignup(steps, providerUrl, browserKey);
  if (!pageResult.html) return { success: false, steps, error: 'Failed to load signup page' };

  const { regData, fields, submitSelector } = stepAnalyzeForm(
    steps,
    pageResult.html,
    emailAccount.address
  );
  if (fields.length === 0)
    return { success: false, steps, error: 'Could not identify form fields on signup page' };

  leaseLost = await fence('before-phone-rental');
  if (leaseLost) return leaseLost;
  const phoneRental = await stepRentPhoneIfNeeded(steps, {
    formHtml: pageResult.html,
    fields,
    creds,
  });

  leaseLost = await fence('before-captcha-solve', phoneRental);
  if (leaseLost) return leaseLost;
  const captchaToken = await stepSolveCaptcha(steps, pageResult.html, providerUrl, creds);

  leaseLost = await fence('before-form-submit', phoneRental);
  if (leaseLost) return leaseLost;
  const submitResult = await stepFillAndSubmit(
    steps,
    providerUrl,
    fields,
    submitSelector,
    browserKey,
    captchaToken
  );

  leaseLost = await fence('before-phone-verification', phoneRental);
  if (leaseLost) return leaseLost;
  const phoneResult = await stepVerifyPhoneCode(steps, {
    postSubmitHtml: submitResult?.html || '',
    rental: phoneRental,
    creds,
    providerUrl,
    browserKey,
  });
  if (phoneRental && !phoneResult.success) {
    return {
      success: false,
      steps,
      error: `phone verification failed: ${phoneResult.error || 'unknown'}`,
    };
  }

  leaseLost = await fence('before-email-poll');
  if (leaseLost) return leaseLost;
  const verificationLink = await stepCheckVerification(steps, emailAccount.token);
  if (verificationLink) {
    leaseLost = await fence('before-email-verification');
    if (leaseLost) return leaseLost;
    await stepVerifyEmail(steps, verificationLink, browserKey);
  }

  leaseLost = await fence('before-credential-extraction');
  if (leaseLost) return leaseLost;
  const apiKey = await stepExtractCredential(steps, providerUrl, browserKey, {
    admin,
    userId,
    jobId,
  });
  if (apiKey && targetToolId) {
    leaseLost = await fence('before-credential-persistence');
    if (leaseLost) return leaseLost;
  }
  const credentialSave = await stepSaveCredential(
    steps,
    apiKey,
    targetToolId,
    targetToolSnapshot,
    userId,
    admin
  );
  const credentialSaved = credentialSave.saved;

  if (apiKey && credentialSaved) {
    leaseLost = await fence('after-credential-persistence');
    if (leaseLost) {
      return {
        ...leaseLost,
        credentialStored: true,
        resumeSucceeded: false,
        resumeReconciliationRequired: false,
        resumedGoalIds: [],
        skippedGoalIds: [],
        resumeFailures: [],
        email: emailAccount.address,
        registrationData: { name: regData.fullName, email: regData.email },
        error: 'Credential stored, but the browser job lease was lost before goal resume',
      };
    }
  }

  let resumeOutcome = {
    resumedGoalIds: [],
    skippedGoalIds: [],
    failures: [],
    reconciliationRequired: false,
  };
  if (apiKey && credentialSaved) {
    resumeOutcome = await stepResumeBlockedGoals(steps, {
      admin,
      jobId,
      targetToolId,
      userId,
      fenceLease,
    });
    if (resumeOutcome.leaseLost) {
      return {
        success: false,
        leaseLost: true,
        leaseLostStage: resumeOutcome.leaseLostStage,
        steps,
        credentialStored: true,
        resumeSucceeded: false,
        resumeReconciliationRequired: resumeOutcome.reconciliationRequired,
        resumedGoalIds: resumeOutcome.resumedGoalIds,
        skippedGoalIds: resumeOutcome.skippedGoalIds,
        resumeFailures: resumeOutcome.failures,
        email: emailAccount.address,
        registrationData: { name: regData.fullName, email: regData.email },
        error: 'Credential stored, but the browser job lease was lost during goal resume',
      };
    }
    leaseLost = await fence('before-ready-notification');
    if (leaseLost) {
      return {
        ...leaseLost,
        credentialStored: true,
        resumeSucceeded: resumeOutcome.failures.length === 0,
        resumeReconciliationRequired: resumeOutcome.reconciliationRequired,
        resumedGoalIds: resumeOutcome.resumedGoalIds,
        skippedGoalIds: resumeOutcome.skippedGoalIds,
        resumeFailures: resumeOutcome.failures,
        email: emailAccount.address,
        registrationData: { name: regData.fullName, email: regData.email },
        error: 'Credential stored, but the browser job lease was lost before notification',
      };
    }
    await stepNotifyReady(steps, {
      admin,
      userId,
      jobId,
      targetToolId,
      providerUrl,
      tempEmail: emailAccount.address,
      durationMs: Date.now() - startMs,
      resumedGoalIds: resumeOutcome.resumedGoalIds,
      resumeOutcome,
    });
  }

  const credentialStored = !!apiKey && credentialSaved;
  const resumeSucceeded = resumeOutcome.failures.length === 0;
  const resumeError = resumeSucceeded
    ? null
    : resumeOutcome.reconciliationRequired
      ? 'Credential stored, but blocked goal resume needs reconciliation'
      : 'Credential stored, but blocked goal continuation could not be queued';

  return {
    success: credentialStored && resumeSucceeded,
    credentialStored,
    resumeSucceeded,
    resumeReconciliationRequired: resumeOutcome.reconciliationRequired,
    resumedGoalIds: resumeOutcome.resumedGoalIds,
    skippedGoalIds: resumeOutcome.skippedGoalIds,
    resumeFailures: resumeOutcome.failures,
    email: emailAccount.address,
    registrationData: { name: regData.fullName, email: regData.email },
    steps,
    error: apiKey
      ? credentialSave.error || resumeError
      : 'Could not extract API key from provider dashboard',
  };
}

// ── HTTP handler ────────────────────────────────────────────────────

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
  if (!verifyAuth(req)) return jsonError(res, 401, 'Unauthorized');

  const { jobId } = req.body || {};
  if (!jobId) return jsonError(res, 400, 'Missing jobId');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');

  const workerScope = resolveWorkerScope();
  const deploymentIdentity = resolveWorkerDeploymentIdentity();
  if (workerScope === 'preview' && !deploymentIdentity) {
    return jsonError(res, 503, 'Preview deployment identity is unavailable');
  }

  const done = log.startTimer(req, 'browser-task');
  let jobLease = null;
  let leaseRuntime = null;
  let fenceLiveLease = null;
  let trackRow = null;

  try {
    // Claim only a row owned by this exact runtime. Preview deployments share
    // worker_scope, so the immutable payload deployment binding is mandatory.
    const claim = await claimBrowserJob(admin, { jobId, workerScope, deploymentIdentity });
    if (claim.state === 'unknown') {
      done({ status: 503, jobId, reconciliation: true });
      return res.status(503).json({
        processed: 0,
        job_id: jobId,
        reason: 'Browser job claim needs reconciliation',
        code: 'BROWSER_JOB_CLAIM_RECONCILIATION_REQUIRED',
      });
    }
    if (claim.state !== 'committed' || !claim.job) {
      done({ status: 200 });
      return res.status(200).json({ processed: 0, reason: 'Job not found or already claimed' });
    }
    const job = claim.job;
    jobLease = createJobLeaseSnapshot(job, workerScope, deploymentIdentity);
    if (!jobLease) {
      return respondLostJobLease(res, done, jobId);
    }
    leaseRuntime = createJobLeaseRuntime({
      admin,
      job,
      onLost: (error) =>
        log.warn(req, 'browser-task.live-lease-lost', { jobId, error: error.message }),
    }).start();
    await leaseRuntime.assertLive('browser handler start');
    fenceLiveLease = async (stage) => {
      try {
        const renewed = await leaseRuntime.heartbeat();
        if (!renewed) {
          log.warn(req, 'browser-task.live-lease-renewal-rejected', { jobId, stage });
        }
        return renewed;
      } catch (error) {
        log.warn(req, 'browser-task.live-lease-renewal-failed', {
          jobId,
          stage,
          error: error.message,
        });
        return false;
      }
    };

    const payload = job.payload || {};
    const { providerUrl, targetToolId, _userId } = payload;

    if (!providerUrl) {
      await leaseRuntime.stop();
      const transitioned = await transitionClaimedJob(admin, jobLease, {
        status: 'failed',
        error: 'Missing providerUrl',
        updated_at: new Date().toISOString(),
      });
      if (!transitioned) return respondLostJobLease(res, done, jobId);
      jobLease = null;
      done({ status: 400 });
      return jsonError(res, 400, 'Missing providerUrl in job payload');
    }

    if (typeof _userId !== 'string' || !_userId.trim()) {
      await leaseRuntime.stop();
      const transitioned = await transitionClaimedJob(admin, jobLease, {
        status: 'failed',
        error: 'Missing _userId',
        updated_at: new Date().toISOString(),
      });
      if (!transitioned) return respondLostJobLease(res, done, jobId);
      jobLease = null;
      done({ status: 400 });
      return jsonError(res, 400, 'Missing _userId in job payload');
    }

    if (_userId.trim() !== jobLease.userId) {
      await leaseRuntime.stop();
      const transitioned = await transitionClaimedJob(admin, jobLease, {
        status: 'failed',
        error: 'Browser job owner does not match the durable queue owner',
        updated_at: new Date().toISOString(),
      });
      if (!transitioned) return respondLostJobLease(res, done, jobId);
      jobLease = null;
      done({ status: 400 });
      return jsonError(res, 400, 'Browser job owner mismatch');
    }

    const rl = checkRateLimit({ key: `browser-task:${_userId}`, limit: 5, windowMs: 3_600_000 });
    if (!rl.allowed) {
      await leaseRuntime.stop();
      const transitioned = await transitionClaimedJob(admin, jobLease, {
        status: 'failed',
        error: 'Rate limit exceeded',
        updated_at: new Date().toISOString(),
      });
      if (!transitioned) return respondLostJobLease(res, done, jobId);
      jobLease = null;
      done({ status: 429 });
      return jsonError(res, 429, 'Browser task rate limit: max 5 per hour');
    }

    let targetToolSnapshot = null;
    if (targetToolId) {
      const loadedTargetTool = await loadToolCredentialSnapshot({
        admin,
        userId: _userId,
        toolId: targetToolId,
      });
      if (!loadedTargetTool.ok) {
        await leaseRuntime.stop();
        const transitioned = await transitionClaimedJob(admin, jobLease, {
          status: 'failed',
          error: loadedTargetTool.message,
          updated_at: new Date().toISOString(),
        });
        if (!transitioned) return respondLostJobLease(res, done, jobId);
        jobLease = null;
        const status = loadedTargetTool.status || 503;
        done({ status, code: loadedTargetTool.code });
        return jsonError(res, status, loadedTargetTool.message);
      }
      targetToolSnapshot = loadedTargetTool.snapshot;
    }

    const tracked = await createBrowserTaskRun(admin, {
      job_id: jobId,
      user_id: _userId,
      target_tool_id: targetToolId || null,
      provider_url: providerUrl,
      status: 'running',
    });
    if (!tracked.ok) {
      const auditRunId = tracked.runId || tracked.row?.id || jobId;
      const priorAttempt = tracked.state === 'prior-run';
      let auditState = tracked.state || 'unknown';

      // A running row for this exact job proves a previous invocation crossed
      // the durable audit boundary. Never replay the workflow. Close that row
      // exactly when possible, then terminalize this requeued job for explicit
      // reconciliation instead of repeating signup, SMS, or credential work.
      if (priorAttempt && tracked.row?.status === 'running') {
        const priorAudit = await transitionBrowserTaskRun(admin, tracked.row, {
          status: 'failed',
          error: 'Prior browser attempt requires reconciliation',
        });
        auditState = `prior-running-${priorAudit.state}`;
      } else if (priorAttempt && tracked.row?.status) {
        auditState = `prior-${tracked.row.status}`;
      }

      const failureMessage = priorAttempt
        ? 'Prior browser attempt requires reconciliation'
        : 'Browser task audit run could not be verified';
      await leaseRuntime.stop();
      const transitioned = await transitionClaimedJob(admin, jobLease, {
        status: 'failed',
        result: {
          type: 'browser-task',
          audit_run_required: true,
          reconciliation_required: true,
          audit_run_id: auditRunId,
          audit_run_state: auditState,
        },
        error: failureMessage,
        updated_at: new Date().toISOString(),
      });
      jobLease = null;
      const jobState = transitioned ? 'failed' : 'unknown';
      done({ status: 503, jobId, auditRunId, auditState, jobState });
      return res.status(503).json({
        error: failureMessage,
        code: priorAttempt
          ? 'BROWSER_PRIOR_RUN_RECONCILIATION_REQUIRED'
          : 'BROWSER_AUDIT_RECONCILIATION_REQUIRED',
        job_id: jobId,
        job_state: jobState,
        audit_run_id: auditRunId,
        audit_state: auditState,
      });
    }
    trackRow = tracked.row;
    const creds = await loadBrowserCredentials(admin, _userId);

    const startMs = Date.now();
    const result = await withJobLeaseRuntime(leaseRuntime, async () => {
      const guardedAdmin = guardSupabaseClientForCurrentJobLease(admin);
      const registration = executeRegistration({
        providerUrl,
        targetToolId,
        userId: _userId,
        creds,
        admin: guardedAdmin,
        jobId,
        targetToolSnapshot,
        fenceLease: fenceLiveLease,
      });
      return raceWithBrowserLease(registration, leaseRuntime);
    });
    const durationMs = Date.now() - startMs;
    const auditPatch = {
      status: result.success ? 'success' : 'failed',
      steps: result.steps || [],
      temp_email: result.email || null,
      credential_saved: result.credentialStored === true,
      error: result.error || null,
      duration_ms: durationMs,
    };

    if (result.leaseLost) {
      jobLease = null;
      return respondLostJobLease(res, done, jobId);
    }

    await leaseRuntime.heartbeat();
    const audit = await transitionBrowserTaskRun(admin, trackRow, auditPatch);
    if (audit.state !== 'committed') {
      await leaseRuntime.stop();
      const transitioned = await transitionClaimedJob(admin, jobLease, {
        status: 'failed',
        result: {
          type: 'browser-task',
          reconciliation_required: true,
          audit_run_id: trackRow.id,
          audit_run_state: audit.state,
          external_result: result,
        },
        error: 'Browser task audit completion needs reconciliation',
        updated_at: new Date().toISOString(),
      });
      jobLease = null;
      done({ status: 503, jobId, auditRunId: trackRow.id, auditState: audit.state });
      return res.status(503).json({
        error: 'Browser task audit completion needs reconciliation',
        code: 'BROWSER_AUDIT_RECONCILIATION_REQUIRED',
        job_id: jobId,
        job_state: transitioned ? 'failed' : 'unknown',
        audit_run_id: trackRow.id,
        audit_state: audit.state,
      });
    }

    // All failed jobs use the schema-valid terminal state. Unrecoverable
    // browser failures carry an explicit result marker for h45 to corroborate.
    const unrecoverable = !result.success && isUnrecoverableError(result.error);
    const finalStatus = result.success ? 'done' : 'failed';

    if (unrecoverable && payload.blocking_goal_id) {
      await leaseRuntime.heartbeat();
      const markerOutcome = await withJobLeaseRuntime(leaseRuntime, () =>
        markUnrecoverableBlockingGoal(guardSupabaseClientForCurrentJobLease(admin), {
          goalId: payload.blocking_goal_id,
          userId: _userId,
          jobId,
          targetToolId,
          reason: result.error,
          fenceLease: fenceLiveLease,
        })
      );
      if (markerOutcome.state === 'lease-lost') {
        jobLease = null;
        return respondLostJobLease(res, done, jobId);
      }
      if (!['committed', 'not-applicable'].includes(markerOutcome.state)) {
        const park = markerOutcome.goal
          ? await withJobLeaseRuntime(leaseRuntime, () =>
              parkUnrecoverableGoalReconciliation(guardSupabaseClientForCurrentJobLease(admin), {
                goal: markerOutcome.goal,
                goalId: payload.blocking_goal_id,
                userId: _userId,
                jobId,
                targetToolId,
                reason: result.error,
                auditRunId: trackRow.id,
                fenceLease: fenceLiveLease,
              })
            )
          : { state: 'unverified' };
        if (park.state === 'lease-lost') {
          jobLease = null;
          return respondLostJobLease(res, done, jobId);
        }
        if (park.state !== 'marker-committed') {
          await leaseRuntime.stop();
          const transitioned = await transitionClaimedJob(admin, jobLease, {
            status: 'failed',
            result: {
              ...result,
              type: 'browser-task',
              needs_human: true,
              reconciliation_required: true,
              audit_run_id: trackRow.id,
              blocking_goal_id: payload.blocking_goal_id,
              goal_marker_state: markerOutcome.state,
              goal_park_state: park.state,
            },
            error: result.error || 'Browser task handoff needs reconciliation',
            updated_at: new Date().toISOString(),
          });
          if (!transitioned) return respondLostJobLease(res, done, jobId);
          jobLease = null;
          done({
            status: 503,
            jobId,
            auditRunId: trackRow.id,
            goalId: payload.blocking_goal_id,
            goalMarkerState: markerOutcome.state,
            goalParkState: park.state,
          });
          return res.status(503).json({
            error: 'Browser task handoff needs reconciliation',
            code: 'BROWSER_GOAL_HANDOFF_RECONCILIATION_REQUIRED',
            job_id: jobId,
            audit_run_id: trackRow.id,
            goal_id: payload.blocking_goal_id,
            goal_marker_state: markerOutcome.state,
            goal_park_state: park.state,
          });
        }
      }
    }

    await leaseRuntime.heartbeat();
    await leaseRuntime.stop();
    const transitioned = await transitionClaimedJob(admin, jobLease, {
      status: finalStatus,
      result: { ...result, type: 'browser-task', needs_human: unrecoverable },
      error: result.error || null,
      updated_at: new Date().toISOString(),
    });
    if (!transitioned) {
      jobLease = null;
      done({ status: 503, jobId, auditRunId: trackRow.id, jobState: 'unknown' });
      return res.status(503).json({
        error: 'Browser job completion needs reconciliation',
        code: 'BROWSER_JOB_TERMINAL_RECONCILIATION_REQUIRED',
        job_id: jobId,
        job_state: 'unknown',
        audit_run_id: trackRow.id,
        audit_state: 'committed',
      });
    }
    jobLease = null;

    done({ status: 200, success: result.success, durationMs, needsHuman: unrecoverable });
    return res
      .status(200)
      .json({ processed: 1, job_id: jobId, needs_human: unrecoverable, ...result });
  } catch (err) {
    if (isBrowserLeaseLost(err, leaseRuntime)) {
      jobLease = null;
      return respondLostJobLease(res, done, jobId);
    }

    if (leaseRuntime && jobLease) {
      try {
        await leaseRuntime.heartbeat();
      } catch (leaseError) {
        jobLease = null;
        return respondLostJobLease(res, done, jobId);
      }
    }

    let auditState = trackRow ? 'unknown' : 'not-created';
    if (trackRow) {
      const audit = await transitionBrowserTaskRun(admin, trackRow, {
        status: 'failed',
        error: `Unexpected browser task failure: ${err.message}`,
      });
      auditState = audit.state;
    }

    // Terminalize the exact owned job only after the mandatory audit outcome
    // has been committed or classified. This prevents stale recovery from
    // rerunning external work after an exception.
    let jobState = jobLease ? 'unknown' : 'not-owned';
    if (jobLease) {
      await leaseRuntime?.stop();
      const failurePatch = {
        status: 'failed',
        error: err.message,
        updated_at: new Date().toISOString(),
      };
      if (trackRow) {
        failurePatch.result = {
          type: 'browser-task',
          reconciliation_required: auditState !== 'committed',
          audit_run_id: trackRow.id,
          audit_run_state: auditState,
        };
      }
      const transitioned = await transitionClaimedJob(admin, jobLease, failurePatch);
      jobState = transitioned ? 'failed' : 'unknown';
      jobLease = null;
    }

    if (trackRow && (auditState !== 'committed' || jobState !== 'failed')) {
      done({ status: 503, jobId, auditRunId: trackRow.id, auditState, jobState });
      return res.status(503).json({
        error: 'Browser task exception needs reconciliation',
        code: 'BROWSER_EXCEPTION_RECONCILIATION_REQUIRED',
        job_id: jobId,
        job_state: jobState,
        audit_run_id: trackRow.id,
        audit_state: auditState,
      });
    }
    if (!trackRow && jobState === 'unknown') return respondLostJobLease(res, done, jobId);
    done({ status: 500 });
    return handleApiError(res, err, 'browser-task');
  } finally {
    await leaseRuntime?.stop();
  }
}
