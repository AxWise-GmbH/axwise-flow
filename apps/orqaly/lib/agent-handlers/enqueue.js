/**
 * Enqueue a job and process it immediately (inline).
 *
 * Default mode: "immediate" — insert job, process it inline, return result.
 * Optional mode: "queued" — insert only, let cron/webhook process later.
 *
 * Toggle via request body: { ..., mode: "queued" } or env ENQUEUE_MODE=queued.
 */
import { randomUUID } from 'node:crypto';
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import {
  checkRateLimit,
  applyRateLimitHeaders,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { checkQuotas } from '../security/user-quotas.js';
import { processNextJob } from './job-processor.js';
import { bindAgentJobToWorkerDeployment, WORKER_DEPLOYMENT_PAYLOAD_KEY } from './worker-scope.js';
import { clearJobLease, hasCompleteJobLease } from './job-lease-runtime.js';

const DEFAULT_MODE = process.env.ENQUEUE_MODE || 'immediate';
export const PUBLIC_JOB_TYPES = ['run-llm', 'evaluate'];
const PUBLIC_REMOTE_LLM_PROVIDERS = new Set([
  'glm',
  'gemini',
  'groq',
  'openai',
  'anthropic',
  'qwen',
  'openrouter',
]);
const PUBLIC_JOB_FIELDS = Object.freeze({
  'run-llm': [
    'prompt',
    'systemPrompt',
    'provider',
    'model',
    'temperature',
    'maxTokens',
    'jsonMode',
  ],
  evaluate: ['jobDescription', 'agentOutput', 'criteria', 'provider', 'model'],
});
const PUBLIC_JOB_SELECT =
  'id, user_id, status, result, error, retry_count, worker_scope, payload, created_at, updated_at, lease_token, heartbeat_at, lease_expires_at';

/**
 * Authorize public queue types before a service-role worker can dereference
 * caller-provided entity IDs. Internal producers bypass this HTTP boundary and
 * enqueue through trusted helpers instead.
 */
export async function authorizePublicJob(admin, userId, body) {
  const type = body?.type;
  if (!type || !PUBLIC_JOB_TYPES.includes(type)) {
    return {
      ok: false,
      status: 400,
      error: `Invalid or missing type. Must be one of: ${PUBLIC_JOB_TYPES.join(', ')}`,
    };
  }

  if (Object.hasOwn(body, 'provider') && !PUBLIC_REMOTE_LLM_PROVIDERS.has(body.provider)) {
    return { ok: false, status: 400, error: 'Provider is not available on public enqueue' };
  }

  // Build the payload from an explicit per-type projection. Spreading the
  // caller body here would let an otherwise-safe run-llm/evaluate request
  // smuggle goal, task, agent, workflow, memory, or Consilium identifiers into
  // service-role finalization side effects (usage rollups and memory writes).
  const payload = { type };
  for (const field of PUBLIC_JOB_FIELDS[type]) {
    if (Object.hasOwn(body, field)) payload[field] = body[field];
  }
  payload._userId = userId;
  payload.userId = userId;
  payload.user_id = userId;
  payload._ts = Date.now();
  return { ok: true, payload };
}

/**
 * Process a job inline and return the final status.
 */
async function loadPublicJob(admin, jobId) {
  const { data } = await admin
    .from('agent_jobs')
    .select(PUBLIC_JOB_SELECT)
    .eq('id', jobId)
    .maybeSingle();
  return data || null;
}

function canonicalJson(value) {
  const normalize = (entry) => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (!entry || typeof entry !== 'object') return entry;
    const ordered = {};
    for (const key of Object.keys(entry).sort()) {
      if (entry[key] !== undefined) ordered[key] = normalize(entry[key]);
    }
    return ordered;
  };
  return JSON.stringify(normalize(value));
}

function matchesExactPublicJob(row, expected, userId) {
  const payload = row?.payload || {};
  return Boolean(
    row?.id === expected.id &&
    row?.user_id === userId &&
    expected.user_id === userId &&
    row?.worker_scope === expected.worker_scope &&
    payload._userId === userId &&
    payload.userId === userId &&
    payload.user_id === userId &&
    canonicalJson(payload) === canonicalJson(expected.payload || {})
  );
}

async function inspectExactPublicJob(admin, expected, userId) {
  try {
    const { data: row, error } = await admin
      .from('agent_jobs')
      .select(PUBLIC_JOB_SELECT)
      .eq('id', expected.id)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!row) return { state: 'absent' };
    return matchesExactPublicJob(row, expected, userId)
      ? { state: 'present', row }
      : { state: 'conflict', row };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

function enqueueReconciliationRequired(res, jobId, state) {
  return res.status(503).json({
    error:
      'The enqueue outcome could not be reconciled safely. Check this job before submitting the work again.',
    code: 'AGENT_JOB_ENQUEUE_RECONCILIATION_REQUIRED',
    job_id: jobId,
    status: 'unknown',
    reconciliation_state: state,
  });
}

async function terminalizeNonterminalPreviewJob(admin, row, processingError) {
  const deploymentIdentity = row?.payload?.[WORKER_DEPLOYMENT_PAYLOAD_KEY];
  if (
    row?.worker_scope !== 'preview' ||
    !['queued', 'running'].includes(row?.status) ||
    !deploymentIdentity ||
    (row.status === 'running' && !hasCompleteJobLease(row))
  ) {
    return null;
  }

  const failedAt = new Date().toISOString();
  const failureMessage = `Preview inline processing stopped: ${String(
    processingError || row.error || 'job remained queued'
  ).slice(0, 1800)}`;
  let transition = admin
    .from('agent_jobs')
    .update({
      status: 'failed',
      error: failureMessage,
      updated_at: failedAt,
      ...clearJobLease(),
    })
    .eq('id', row.id)
    .eq('status', row.status)
    .eq('worker_scope', 'preview')
    .eq(`payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`, deploymentIdentity);
  if (row.retry_count !== null && row.retry_count !== undefined) {
    transition = transition.eq('retry_count', row.retry_count);
  }
  if (row.updated_at) transition = transition.eq('updated_at', row.updated_at);
  if (row.status === 'running') {
    transition = transition
      .eq('lease_token', row.lease_token)
      .eq('lease_expires_at', row.lease_expires_at);
  }
  const { data, error } = await transition
    .select('id, status, error, created_at, updated_at')
    .maybeSingle();
  return { data, error, failureMessage };
}

async function processInline(admin, req, row) {
  let result = null;
  let processingError = null;
  try {
    result = await processNextJob(admin, req, row.id);
  } catch (processErr) {
    processingError = processErr;
  }

  let finalRow = null;
  try {
    finalRow = await loadPublicJob(admin, row.id);
  } catch {
    // The response below fails closed for Preview when the durable state cannot
    // be verified. Production retains its cron-backed retry behavior.
  }

  if (
    row.worker_scope === 'preview' &&
    (!finalRow ||
      (finalRow.worker_scope === 'preview' && ['queued', 'running'].includes(finalRow.status)))
  ) {
    const recoveryRow = finalRow || row;
    let terminalized = null;
    try {
      terminalized = await terminalizeNonterminalPreviewJob(
        admin,
        recoveryRow,
        processingError?.message || result?.status || 'durable final state unavailable'
      );
    } catch {
      // A failed cleanup must not be presented as a recoverable queued Preview
      // job: there is no durable Preview Cron consumer.
    }
    return {
      code: 503,
      body: {
        job_id: row.id,
        status: terminalized?.data?.status || 'unknown',
        error:
          terminalized?.data?.error ||
          'Preview inline processing did not complete and its queue state could not be recovered.',
        created_at: recoveryRow.created_at || row.created_at,
        processingError: processingError?.message || null,
      },
    };
  }

  if (finalRow) {
    return {
      code: 200,
      body: {
        job_id: finalRow.id,
        status: finalRow.status,
        result: finalRow.result || null,
        error: finalRow.error || null,
        created_at: finalRow.created_at,
        updated_at: finalRow.updated_at,
      },
    };
  }
  if (processingError) {
    const preview = row.worker_scope === 'preview';
    return {
      code: preview ? 503 : 202,
      body: {
        job_id: row.id,
        status: preview ? 'unknown' : 'queued',
        created_at: row.created_at,
        processingError: processingError.message,
      },
    };
  }
  return { code: 200, body: { job_id: row.id, ...result } };
}

export default async function handler(req, res) {
  const safeReq = req && typeof req === 'object' ? req : {};
  if (!safeReq.headers) safeReq.headers = {};
  cors(res, safeReq);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const token = getBearerToken(safeReq);
    const user = await verifySupabaseToken(token);
    if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

    const rlKey = getRateLimitIdentifier(req, user.id);
    const rl = checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Agent jobs not configured');

    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const authorization = await authorizePublicJob(admin, user.id, body);
    if (!authorization.ok) return jsonError(res, authorization.status, authorization.error);

    // Per-user quota check — blocks runaway loops and bot abuse before
    // the job is queued. See lib/security/user-quotas.js for limits.
    const quota = await checkQuotas(admin, user.id, { jobType: body.type });
    if (!quota.allowed) {
      return res.status(429).json({
        error: quota.message,
        code: quota.code,
        quotas: quota.quotas,
        usage: quota.usage,
      });
    }

    const mode = body.mode || DEFAULT_MODE;
    const payload = authorization.payload;
    const boundJob = bindAgentJobToWorkerDeployment({
      id: randomUUID(),
      user_id: user.id,
      status: 'queued',
      payload,
    });

    // Preview has no durable Cron consumer, and Vercel rejects recursive
    // self-wakes. Refuse insert-only semantics instead of acknowledging a row
    // that has no reliable way to run after the browser request returns.
    if (boundJob.worker_scope === 'preview' && mode === 'queued') {
      return jsonError(res, 409, 'Queued mode is unavailable in Preview; use immediate mode');
    }
    if (boundJob.worker_scope === 'preview' && !boundJob.payload?.[WORKER_DEPLOYMENT_PAYLOAD_KEY]) {
      return jsonError(res, 503, 'Preview deployment identity is unavailable');
    }

    let row = null;
    let returnedInsertError = null;
    let thrownInsertError = null;
    try {
      const insertResult = await admin
        .from('agent_jobs')
        .insert(boundJob)
        .select(PUBLIC_JOB_SELECT)
        .single();
      row = insertResult.data || null;
      returnedInsertError = insertResult.error || null;
    } catch (error) {
      thrownInsertError = error;
    }

    if (thrownInsertError || returnedInsertError) {
      const inspection = await inspectExactPublicJob(admin, boundJob, user.id);
      if (inspection.state === 'present') {
        row = inspection.row;
      } else if (inspection.state === 'absent') {
        return handleInsertError(res, thrownInsertError || returnedInsertError);
      } else {
        return enqueueReconciliationRequired(res, boundJob.id, inspection.state);
      }
    }

    if (!row || !matchesExactPublicJob(row, boundJob, user.id)) {
      return enqueueReconciliationRequired(res, boundJob.id, row ? 'conflict' : 'unknown');
    }

    // Queued mode: return 202 immediately, let cron/webhook process later
    if (mode === 'queued') {
      return res.status(202).json({
        job_id: row.id,
        status: row.status,
        created_at: row.created_at,
      });
    }

    // Immediate mode (default): process the job inline before responding
    const { code, body: responseBody } = await processInline(admin, req, row);
    return res.status(code).json(responseBody);
  } catch (err) {
    return handleApiError(res, err, 'agent/enqueue');
  }
}

function handleInsertError(res, error) {
  const msg = error.message || 'Insert failed';
  if (
    msg.includes('does not exist') ||
    (msg.includes('agent_jobs') && msg.includes('schema cache')) ||
    error.code === '42P01'
  ) {
    return jsonError(res, 503, 'agent_jobs table missing; run migration 017_agent_jobs.sql');
  }
  return jsonError(res, 500, msg);
}
