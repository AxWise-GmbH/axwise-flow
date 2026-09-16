/**
 * Agent job service — enqueue jobs, poll status, trigger evaluations.
 * Talks to /api/agent/* endpoints.
 */
import { supabase, hasSupabase } from '../lib/supabase';

async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  }
  return headers;
}

function getBase() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/**
 * How long to let the enqueue request itself hang.
 *
 * Sized above the worker's own per-attempt job budget (JOB_TIMEOUT_MS, 160s by
 * default) so a normally slow model still lands inline, while a wedged one
 * eventually releases the caller instead of hanging it indefinitely.
 */
export const ENQUEUE_TIMEOUT_MS = 180000;
export const CONCILIUM_EVALUATION_NOT_ENABLED = 'CONCILIUM_EVALUATION_NOT_ENABLED';

/**
 * Enqueue a job for async processing.
 * @param {object} payload — must include a public job type (`run-llm` or `evaluate`).
 * Resource-backed jobs use their dedicated authenticated producer endpoint.
 * @returns {Promise<{ job_id: string, status: string, created_at: string }>}
 */
export async function enqueueJob(payload, { timeoutMs = ENQUEUE_TIMEOUT_MS } = {}) {
  // The endpoint runs jobs inline unless ENQUEUE_MODE says otherwise, so this
  // request stays open for the whole execution — up to the worker's own 160s
  // budget, three attempts. Without a signal a stuck provider pins the caller
  // forever: the Simple thread awaits this, so it sat on "Reading your
  // request" with no exit at all rather than failing and letting the user on.
  const controller = new AbortController();
  const bell = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getBase()}/api/agent/enqueue`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to enqueue job');
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(
        `The request took longer than ${Math.round(timeoutMs / 1000)}s to start. It may still be running.`
      );
    }
    throw err;
  } finally {
    clearTimeout(bell);
  }
}

/**
 * Poll job status by ID.
 * @param {string} jobId
 * @returns {Promise<{ job_id, status, result?, error?, created_at, updated_at }>}
 */
export async function getJobStatus(jobId) {
  const res = await fetch(`${getBase()}/api/agent/status?id=${jobId}`, {
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to get job status');
  return data;
}

/**
 * Enqueue and wait for result.
 *
 * The enqueue endpoint now processes jobs inline (immediate mode),
 * so the response often already contains the final result.
 * Falls back to polling if the job is still queued.
 *
 * @param {object} payload
 * @param {number} [timeoutMs=75000] — default matches the backend execution
 *   budget (50s) + cron grace (15s) + margin. Previously 30s, which caused
 *   Smart Request Analyze to show "Manual Setup Required — Job timed out"
 *   whenever Groq was slow, even though the backend job would have completed.
 * @param {number} [pollMs=1500]
 * @returns {Promise<{ job_id, status, result?, error? }>}
 */
export async function enqueueAndWait(payload, timeoutMs = 75000, pollMs = 1500) {
  const enqueueResult = await enqueueJob(payload);
  return waitForJobResult(enqueueResult, timeoutMs, pollMs);
}

/** Wait for a job returned by any narrow authenticated producer endpoint. */
export async function waitForJobResult(enqueueResult, timeoutMs = 75000, pollMs = 1500) {
  const jobId = enqueueResult.job_id;
  if (!jobId) throw new Error('Job producer returned no job_id');

  // If enqueue already processed the job inline, return immediately
  if (enqueueResult.status === 'done' || enqueueResult.status === 'failed') {
    return enqueueResult;
  }

  // Otherwise poll until done (fallback for queued mode)
  const deadline = Date.now() + timeoutMs;

  const fastPolls = [500, 1000, 1500];
  for (const delay of fastPolls) {
    await new Promise((r) => setTimeout(r, delay));
    const status = await getJobStatus(jobId);
    if (status.status === 'done' || status.status === 'failed') return status;
    if (Date.now() >= deadline) break;
  }

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    const status = await getJobStatus(jobId);
    if (status.status === 'done' || status.status === 'failed') return status;
  }

  // One final authoritative read closes the race where the worker commits a
  // terminal result between the last loop condition and the timeout return.
  try {
    const finalStatus = await getJobStatus(jobId);
    if (finalStatus.status === 'done' || finalStatus.status === 'failed') return finalStatus;
  } catch {
    // Preserve the existing timeout contract when the final read itself fails.
  }

  return { job_id: jobId, status: 'timeout', error: 'Job timed out waiting for result' };
}

/**
 * Trigger a Consilium evaluation for agent output.
 * @param {object} opts
 * @param {string} opts.conciliumId
 * @param {string} [opts.jobId] — Job Pool job ID
 * @param {string} [opts.jobDescription]
 * @param {string|object} opts.agentOutput
 * @param {string[]} [opts.criteria]
 * @returns {Promise<{ job_id, status, result? }>}
 */
export async function triggerConciliumEvaluation(_opts) {
  const error = new Error(
    'Consilium evaluation is not enabled until Gemini payload approval is granted.'
  );
  error.name = 'ConciliumEvaluationNotEnabledError';
  error.code = CONCILIUM_EVALUATION_NOT_ENABLED;
  error.state = 'not_enabled';
  throw error;
}

/**
 * Fetch evaluation history for a concilium from Supabase.
 * @param {string} conciliumId
 * @param {number} [limit=20]
 * @returns {Promise<Array>}
 */
export async function getConciliumEvaluations(conciliumId, limit = 20) {
  if (!hasSupabase()) return [];
  const { data, error } = await supabase
    .from('concilium_evaluations')
    .select('*')
    .eq('concilium_id', conciliumId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[agentJobService] Failed to load evaluations:', error.message);
    return [];
  }
  return data || [];
}
