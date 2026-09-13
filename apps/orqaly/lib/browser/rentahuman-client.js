/**
 * rentahuman.ai client — Phase 7b
 *
 * Pay-per-task human worker API. Used by the Phase 6 timeout worker when
 * the Orqaly account owner ignores a human_task for longer than
 * escalate_after_seconds.
 *
 * API shape assumed from the public docs as of April 2026. If the real
 * endpoints differ, tweak this file only — the call sites pass through a
 * clean surface (submitTask, pollTask, cancelTask).
 */
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('rentahuman');
const BASE_URL = 'https://rentahuman.ai/api/v1';
const HTTP_TIMEOUT_MS = 12_000;

function auth(apiKey) {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' };
}

/**
 * Submit a task to the rentahuman.ai marketplace.
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.instructions — what the worker should do
 * @param {string} opts.url — the page the worker starts on
 * @param {string=} opts.screenshot_base64 — helpful context screenshot
 * @param {object=} opts.context_json — additional structured context (temp email, provider hints, etc.)
 * @param {string=} opts.callback_url — webhook for completion; optional since we poll
 * @param {number}  opts.max_price_cents — safety cap
 * @param {number}  opts.timeout_seconds — how long the task is willing to wait for a worker
 * @returns {Promise<{task_id: string}>}
 */
export async function submitTask({ apiKey, instructions, url, screenshot_base64 = null, context_json = {}, callback_url = null, max_price_cents = 500, timeout_seconds = 1800 }) {
  if (!apiKey || !instructions || !url) throw new Error('rentahuman submitTask: missing apiKey / instructions / url');
  const res = await fetchWithRetry(
    `${BASE_URL}/tasks`,
    {
      method: 'POST',
      headers: auth(apiKey),
      body: JSON.stringify({
        instructions, url,
        screenshot_base64,
        context: context_json,
        callback_url,
        max_price_cents,
        timeout_seconds,
      }),
    },
    { timeoutMs: HTTP_TIMEOUT_MS, retries: 0 },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`rentahuman submit failed: ${body?.error || res.status}`);
  log.info(null, 'rentahuman.submitted', { taskId: body.task_id, maxPriceCents: max_price_cents });
  return { task_id: body.task_id };
}

/**
 * Poll a task's status. Returns null while pending.
 * Terminal results set `status` to one of: 'completed', 'failed', 'cancelled', 'rejected', 'timed_out'.
 */
export async function pollTask({ apiKey, task_id }) {
  if (!apiKey || !task_id) throw new Error('rentahuman pollTask: missing apiKey / task_id');
  const res = await fetchWithRetry(
    `${BASE_URL}/tasks/${task_id}`,
    { headers: auth(apiKey) },
    { timeoutMs: HTTP_TIMEOUT_MS, retries: 0 },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`rentahuman poll failed: ${body?.error || res.status}`);
  return {
    status: body.status,
    result: body.result,
    worker_notes: body.worker_notes,
    screenshot_after: body.screenshot_after,
    cost_cents: body.cost_cents,
  };
}

export async function cancelTask({ apiKey, task_id, reason = 'user_cancelled' }) {
  if (!apiKey || !task_id) return { ok: false };
  try {
    await fetchWithRetry(
      `${BASE_URL}/tasks/${task_id}/cancel`,
      { method: 'POST', headers: auth(apiKey), body: JSON.stringify({ reason }) },
      { timeoutMs: HTTP_TIMEOUT_MS, retries: 0 },
    );
    return { ok: true };
  } catch (err) {
    log.warn(null, 'rentahuman.cancel-failed', { task_id, error: err.message });
    return { ok: false };
  }
}
