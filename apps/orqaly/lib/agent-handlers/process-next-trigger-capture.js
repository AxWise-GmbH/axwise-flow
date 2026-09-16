import { AsyncLocalStorage } from 'node:async_hooks';

const triggerCapture = new AsyncLocalStorage();

/**
 * Create one execution-scoped capture. `active` is deliberately separate from
 * AsyncLocalStorage lifetime: a timed-out handler can keep running after its
 * Promise.race settles, but must no longer suppress exact wakes.
 */
export function createProcessNextTriggerCapture() {
  return { active: true, jobIds: new Set() };
}

export async function withProcessNextTriggerCapture(capture, callback) {
  try {
    return await triggerCapture.run(capture, callback);
  } finally {
    capture.active = false;
  }
}

/**
 * Capture an exact targeted wake when a handler is running inside a bounded
 * Preview drain. Untargeted wakes remain real network wakes.
 */
export function captureProcessNextTrigger(jobId) {
  const capture = triggerCapture.getStore();
  const exactJobId = typeof jobId === 'string' ? jobId.trim() : '';
  if (!capture?.active || !(capture.jobIds instanceof Set) || !exactJobId) return false;
  capture.jobIds.add(exactJobId);
  return true;
}
