/** Fetch with timeout and retries for external APIs */
import {
  assertCurrentJobLeaseLive,
  getCurrentJobLeaseSignal,
} from '../../lib/agent-handlers/job-lease-runtime.js';

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRIES = 2;

function abortedError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error('This operation was aborted');
  error.name = 'AbortError';
  return error;
}

function composeSignals(signals) {
  const active = [...new Set(signals.filter(Boolean))];
  if (active.length === 0) return { signal: undefined, cleanup() {} };
  if (active.length === 1) return { signal: active[0], cleanup() {} };
  if (typeof AbortSignal.any === 'function') {
    return { signal: AbortSignal.any(active), cleanup() {} };
  }

  const controller = new AbortController();
  const listeners = [];
  const abortFrom = (source) => {
    if (!controller.signal.aborted) controller.abort(source.reason);
  };
  for (const source of active) {
    if (source.aborted) {
      abortFrom(source);
      break;
    }
    const listener = () => abortFrom(source);
    source.addEventListener('abort', listener, { once: true });
    listeners.push([source, listener]);
  }
  return {
    signal: controller.signal,
    cleanup() {
      for (const [source, listener] of listeners) source.removeEventListener('abort', listener);
    },
  };
}

function abortableDelay(ms, signal) {
  if (signal?.aborted) return Promise.reject(abortedError(signal));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }
    function aborted() {
      clearTimeout(timer);
      reject(abortedError(signal));
    }
    signal?.addEventListener('abort', aborted, { once: true });
  });
}

/** One-shot fetch that still participates in the durable job lease. */
export async function fetchWithJobLease(url, options = {}) {
  await assertCurrentJobLeaseLive('HTTP request');
  const combined = composeSignals([options.signal, getCurrentJobLeaseSignal()]);
  if (combined.signal?.aborted) throw abortedError(combined.signal);
  try {
    return await fetch(url, { ...options, signal: combined.signal });
  } finally {
    combined.cleanup();
  }
}

/**
 * Each attempt creates its own AbortController and timer. Previously a single
 * controller was reused across retries — once it aborted, every subsequent
 * retry failed instantly with "This operation was aborted" because the signal
 * was permanently flipped. That poisoned the Phase 2 ReAct loop in
 * tool-runner.js and made every landing-page deployment task fail.
 */
export async function fetchWithRetry(
  url,
  options = {},
  { timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES, beforeAttempt } = {}
) {
  let lastError;
  const jobSignal = getCurrentJobLeaseSignal();
  const callerSignal = options.signal;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (callerSignal?.aborted) throw abortedError(callerSignal);
    if (jobSignal?.aborted) throw abortedError(jobSignal);
    await assertCurrentJobLeaseLive(`HTTP request attempt ${attempt + 1}`);
    if (typeof beforeAttempt === 'function') {
      await beforeAttempt({ attempt, url });
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const combined = composeSignals([callerSignal, jobSignal, controller.signal]);
    try {
      const res = await fetch(url, {
        ...options,
        signal: combined.signal,
      });
      clearTimeout(timeoutId);
      combined.cleanup();
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      combined.cleanup();
      lastError = err;
      if (callerSignal?.aborted) throw abortedError(callerSignal);
      if (jobSignal?.aborted) throw abortedError(jobSignal);
      const retriable =
        err.name === 'AbortError' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';
      if (attempt < retries && retriable) {
        const outer = composeSignals([callerSignal, jobSignal]);
        try {
          await abortableDelay(500 * (attempt + 1), outer.signal);
        } finally {
          outer.cleanup();
        }
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
