/**
 * retryWithBackoff — exponential backoff with jitter for external API calls.
 *
 * Retryable:     429, 500, 502, 503, 504  (transient server / infra errors)
 * Non-retryable: 400, 401, 403, 404        (client errors — never retry)
 * Network throw: always retried up to maxRetries (timeout, ECONNRESET, etc.)
 *
 * Uses logError() from errors.js so every retry appears in the same log stream
 * as other API errors, with the same prefix format.
 */
import { logError } from './errors.js';

/** HTTP status codes worth retrying. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/**
 * Retry an async function with exponential backoff and ±25% jitter.
 *
 * @template T
 * @param {() => Promise<T>} fn
 *   Async supplier called on every attempt.
 *   Should return a value with a `.status` number (e.g. a fetch Response),
 *   or throw on network-level failure.
 *   A result with no `.status` field is treated as an immediate success.
 *
 * @param {{
 *   maxRetries?:    number,   // total extra attempts after first (default 3)
 *   initialDelay?:  number,   // base backoff in ms            (default 1000)
 *   maxDelay?:      number,   // ceiling for any single sleep  (default 10000)
 * }} [options]
 *
 * @returns {Promise<T>} The first successful result.
 * @throws  The last error / HTTP status after all attempts are exhausted.
 *
 * @example
 *   const response = await retryWithBackoff(
 *     () => fetch('https://api.resend.com/emails', { method: 'POST', ... }),
 *     { maxRetries: 3, initialDelay: 1000, maxDelay: 10000 }
 *   );
 */
export async function retryWithBackoff(fn, options = {}) {
  const { maxRetries = 3, initialDelay = 1000, maxDelay = 10000 } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // ── Call the supplier ───────────────────────────────────────────────────
    let result;
    try {
      result = await fn();
    } catch (err) {
      // Network-level failure (DNS, timeout, ECONNRESET, AbortError …)
      lastError = err;
      if (attempt < maxRetries) {
        const delay = jitteredBackoff(attempt, initialDelay, maxDelay);
        logError(
          `[retry] attempt ${attempt + 1}/${maxRetries} (network error — retrying in ${delay}ms)`,
          err
        );
        await sleep(delay);
        continue;
      }
      throw err;
    }

    // ── Inspect HTTP status ─────────────────────────────────────────────────
    const status = result?.status;

    if (status == null) {
      // No status field — treat as opaque success
      return result;
    }

    if (!RETRYABLE.has(status)) {
      // 2xx success, 3xx redirect, or a definitive client error (400/401/403/404)
      // In all these cases return immediately and let the caller decide.
      return result;
    }

    // Retryable HTTP status (429 / 5xx)
    const statusErr = Object.assign(new Error(`HTTP ${status}`), { status });
    lastError = statusErr;

    if (attempt < maxRetries) {
      const delay = jitteredBackoff(attempt, initialDelay, maxDelay);
      logError(
        `[retry] attempt ${attempt + 1}/${maxRetries} (HTTP ${status} — retrying in ${delay}ms)`,
        statusErr
      );
      await sleep(delay);
      continue;
    }

    // All retries exhausted on a retryable status
    throw statusErr;
  }

  // Should be unreachable but keeps TypeScript / static analysis happy
  throw lastError ?? new Error('[retry] all attempts exhausted');
}

// ── Backoff helpers ───────────────────────────────────────────────────────────

/**
 * Compute delay with exponential base and ±25 % jitter.
 *
 * Attempt 0 → ~1 000 ms  (750 – 1 250)
 * Attempt 1 → ~2 000 ms  (1 500 – 2 500)
 * Attempt 2 → ~4 000 ms  (3 000 – 5 000)
 * Attempt 3 → ~8 000 ms  (6 000 – 10 000, capped at maxDelay)
 */
function jitteredBackoff(attempt, initialDelay, maxDelay) {
  const base = initialDelay * Math.pow(2, attempt);
  const jitter = base * 0.25 * (Math.random() * 2 - 1); // ±25 %
  return Math.min(Math.max(Math.floor(base + jitter), 1), maxDelay);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
