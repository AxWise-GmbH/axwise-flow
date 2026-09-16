import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchWithRetry } from './fetch.js';
import {
  JOB_LEASE_LOST,
  createJobLeaseRuntime,
  jobLeaseLostError,
  withJobLeaseRuntime,
} from '../../lib/agent-handlers/job-lease-runtime.js';

const NOW_MS = Date.parse('2026-08-24T12:00:00.000Z');
const job = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  status: 'running',
  worker_scope: 'preview',
  lease_token: '33333333-3333-4333-8333-333333333333',
  heartbeat_at: new Date(NOW_MS).toISOString(),
  lease_expires_at: new Date(NOW_MS + 75_000).toISOString(),
};

function leaseAdmin() {
  const result = { data: job, error: null };
  const chain = {
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  };
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => chain),
    })),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchWithRetry cancellation', () => {
  it('passes the live lease signal to fetch and stops immediately when the lease is revoked', async () => {
    const fetchMock = vi.fn((_url, options) => {
      return new Promise((_resolve, reject) => {
        const signal = options.signal;
        const abort = () =>
          reject(signal.reason || Object.assign(new Error('aborted'), { name: 'AbortError' }));
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const runtime = createJobLeaseRuntime({ admin: leaseAdmin(), job, now: () => NOW_MS });

    const request = withJobLeaseRuntime(runtime, () =>
      fetchWithRetry('https://example.test/model', {}, { retries: 3, timeoutMs: 60_000 })
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    runtime.abort(jobLeaseLostError(job.id, 'test revocation'));

    await expect(request).rejects.toMatchObject({ code: JOB_LEASE_LOST });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not start another attempt when the caller aborts during retry backoff', async () => {
    const reset = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    const fetchMock = vi.fn(async () => {
      throw reset;
    });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const request = fetchWithRetry(
      'https://example.test/tool',
      { signal: controller.signal },
      { retries: 3, timeoutMs: 60_000 }
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort(new Error('caller cancelled'));

    await expect(request).rejects.toThrow('caller cancelled');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
