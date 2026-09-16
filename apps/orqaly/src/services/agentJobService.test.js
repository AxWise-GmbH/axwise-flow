import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
  hasSupabase: () => false,
}));

import {
  enqueueJob,
  ENQUEUE_TIMEOUT_MS,
  CONCILIUM_EVALUATION_NOT_ENABLED,
  triggerConciliumEvaluation,
} from './agentJobService';

beforeEach(() => {
  vi.useFakeTimers();
  global.fetch = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('enqueueJob', () => {
  it('returns the job the server created', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ job_id: 'j1', status: 'done' }),
    });
    await expect(enqueueJob({ type: 'run-llm' })).resolves.toMatchObject({ job_id: 'j1' });
  });

  it('surfaces the server error rather than a generic one', async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'no key' }) });
    await expect(enqueueJob({ type: 'run-llm' })).rejects.toThrow('no key');
  });

  // The endpoint runs jobs inline, so this request stays open for the whole
  // execution. Without a signal a wedged provider pinned the Simple thread on
  // "Reading your request" with no exit at all.
  it('aborts instead of hanging forever', async () => {
    global.fetch.mockImplementation(
      (_url, opts) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    );

    const pending = enqueueJob({ type: 'run-llm' });
    const assertion = expect(pending).rejects.toThrow(/took longer than/);
    await vi.advanceTimersByTimeAsync(ENQUEUE_TIMEOUT_MS + 10);
    await assertion;
  });

  it('says how long it waited, so the message is actionable', async () => {
    global.fetch.mockImplementation(
      (_url, opts) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    );
    const pending = enqueueJob({ type: 'run-llm' }, { timeoutMs: 5000 });
    const assertion = expect(pending).rejects.toThrow('5s');
    await vi.advanceTimersByTimeAsync(5010);
    await assertion;
  });

  it('does not abort a request that answers in time', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ job_id: 'j2' }) });
    await expect(enqueueJob({ type: 'run-llm' })).resolves.toMatchObject({ job_id: 'j2' });
    // Nothing left armed to fire later against a settled request.
    await vi.advanceTimersByTimeAsync(ENQUEUE_TIMEOUT_MS + 1000);
  });

  it('is bounded above the worker per-attempt budget, not below it', () => {
    expect(ENQUEUE_TIMEOUT_MS).toBeGreaterThan(160000);
  });
});

describe('triggerConciliumEvaluation', () => {
  it('fails locally with an explicit disabled state and sends no payload', async () => {
    const evaluation = triggerConciliumEvaluation({
      conciliumId: 'board-1',
      agentOutput: 'private output',
    });

    await expect(evaluation).rejects.toMatchObject({
      name: 'ConciliumEvaluationNotEnabledError',
      code: CONCILIUM_EVALUATION_NOT_ENABLED,
      state: 'not_enabled',
      message: expect.stringContaining('Gemini payload approval'),
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
