import { describe, expect, it, vi } from 'vitest';

import {
  JOB_LEASE_LOST,
  createJobLeaseClaim,
  createJobLeaseRuntime,
  guardSupabaseClientForCurrentJobLease,
  withJobLeaseRuntime,
  withVerifiedJobFinalizationReceipt,
} from './job-lease-runtime.js';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const LEASE_TOKEN = '33333333-3333-4333-8333-333333333333';
const NOW_MS = Date.parse('2026-08-24T12:00:00.000Z');

function leasedJob(overrides = {}) {
  return {
    id: JOB_ID,
    user_id: USER_ID,
    status: 'running',
    worker_scope: 'preview',
    lease_token: LEASE_TOKEN,
    heartbeat_at: new Date(NOW_MS).toISOString(),
    lease_expires_at: new Date(NOW_MS + 75_000).toISOString(),
    ...overrides,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function chainTo(result) {
  const chain = {};
  for (const method of ['select', 'eq', 'gt', 'lt', 'is', 'in', 'order', 'limit']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

function runtimeAdmin({ inspect, heartbeat } = {}) {
  const effectInsert = vi.fn(() => chainTo({ data: { id: 'effect' }, error: null }));
  const effectUpdate = vi.fn(() => chainTo({ data: { id: 'effect' }, error: null }));
  const heartbeatUpdate = vi.fn(() =>
    chainTo(
      heartbeat || {
        data: leasedJob({
          heartbeat_at: new Date(NOW_MS + 15_000).toISOString(),
          lease_expires_at: new Date(NOW_MS + 90_000).toISOString(),
        }),
        error: null,
      }
    )
  );
  const inspectResult = inspect || { data: leasedJob(), error: null };
  const admin = {
    from: vi.fn((table) => {
      if (table === 'agent_jobs') {
        return {
          select: vi.fn(() => chainTo(inspectResult)),
          update: heartbeatUpdate,
        };
      }
      return {
        insert: effectInsert,
        update: effectUpdate,
      };
    }),
  };
  return { admin, effectInsert, effectUpdate, heartbeatUpdate };
}

describe('durable agent job lease runtime', () => {
  it('creates a unique UUID generation and bounded expiry', () => {
    const first = createJobLeaseClaim(NOW_MS, 75_000);
    const second = createJobLeaseClaim(NOW_MS, 75_000);

    expect(first.lease_token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(second.lease_token).not.toBe(first.lease_token);
    expect(first.heartbeat_at).toBe('2026-08-24T12:00:00.000Z');
    expect(first.lease_expires_at).toBe('2026-08-24T12:01:15.000Z');
  });

  it('asserts the exact live token before invoking a guarded mutation', async () => {
    const inspection = deferred();
    const { admin, effectInsert } = runtimeAdmin({ inspect: inspection.promise });
    const runtime = createJobLeaseRuntime({ admin, job: leasedJob(), now: () => NOW_MS });

    const write = withJobLeaseRuntime(runtime, async () => {
      const guarded = guardSupabaseClientForCurrentJobLease(admin);
      return guarded.from('effects').insert({ value: 'published' }).select('id').single();
    });

    await Promise.resolve();
    expect(effectInsert).not.toHaveBeenCalled();

    inspection.resolve({ data: leasedJob(), error: null });
    await expect(write).resolves.toEqual({ data: { id: 'effect' }, error: null });
    expect(effectInsert).toHaveBeenCalledTimes(1);
  });

  it('never invokes a guarded mutation after exact-token validation fails', async () => {
    const { admin, effectUpdate } = runtimeAdmin({
      inspect: {
        data: leasedJob({ lease_token: '44444444-4444-4444-8444-444444444444' }),
        error: null,
      },
    });
    const runtime = createJobLeaseRuntime({ admin, job: leasedJob(), now: () => NOW_MS });

    const write = withJobLeaseRuntime(runtime, async () => {
      const guarded = guardSupabaseClientForCurrentJobLease(admin);
      return guarded.from('effects').update({ value: 'stale' }).eq('id', 'effect');
    });

    await expect(write).rejects.toMatchObject({ code: JOB_LEASE_LOST });
    expect(effectUpdate).not.toHaveBeenCalled();
    expect(runtime.signal.aborted).toBe(true);
  });

  it('aborts once when heartbeat renewal and exact-token reconciliation both lose', async () => {
    const onLost = vi.fn();
    const { admin, heartbeatUpdate } = runtimeAdmin({
      inspect: {
        data: leasedJob({ lease_token: '44444444-4444-4444-8444-444444444444' }),
        error: null,
      },
      heartbeat: { data: null, error: { message: 'no row matched' } },
    });
    const runtime = createJobLeaseRuntime({
      admin,
      job: leasedJob(),
      now: () => NOW_MS + 15_000,
      onLost,
    });

    await expect(runtime.heartbeat()).rejects.toMatchObject({ code: JOB_LEASE_LOST });
    await expect(runtime.heartbeat()).resolves.toBe(false);

    expect(heartbeatUpdate).toHaveBeenCalledTimes(1);
    expect(runtime.signal.aborted).toBe(true);
    expect(runtime.signal.reason).toMatchObject({ code: JOB_LEASE_LOST });
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it('mints a terminal receipt only for the exact cleared terminal row', async () => {
    const { admin, effectInsert } = runtimeAdmin();
    const terminal = {
      ...leasedJob(),
      status: 'done',
      lease_token: null,
      heartbeat_at: null,
      lease_expires_at: null,
    };

    await expect(
      withVerifiedJobFinalizationReceipt(
        { claimedJob: leasedJob(), terminalJob: terminal },
        async () => {
          const guarded = guardSupabaseClientForCurrentJobLease(admin);
          return guarded.from('effects').insert({ value: 'terminal fanout' });
        }
      )
    ).resolves.toEqual({ data: { id: 'effect' }, error: null });
    expect(effectInsert).toHaveBeenCalledTimes(1);

    expect(() =>
      withVerifiedJobFinalizationReceipt(
        {
          claimedJob: leasedJob(),
          terminalJob: { ...terminal, id: '55555555-5555-4555-8555-555555555555' },
        },
        () => null
      )
    ).toThrow(expect.objectContaining({ code: JOB_LEASE_LOST }));
  });

  it('clears its timer and drains an in-flight heartbeat before stopping', async () => {
    const renewal = deferred();
    const heartbeatChain = chainTo(renewal.promise);
    const heartbeatUpdate = vi.fn(() => heartbeatChain);
    const inspectChain = chainTo({ data: leasedJob(), error: null });
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => inspectChain),
        update: heartbeatUpdate,
      })),
    };
    const clearIntervalImpl = vi.fn();
    const timer = { unref: vi.fn() };
    let scheduledHeartbeat;
    const runtime = createJobLeaseRuntime({
      admin,
      job: leasedJob(),
      now: () => NOW_MS + 15_000,
      setIntervalImpl: vi.fn((callback) => {
        scheduledHeartbeat = callback;
        return timer;
      }),
      clearIntervalImpl,
    });

    runtime.start();
    scheduledHeartbeat();
    await Promise.resolve();
    const stopping = runtime.stop();
    let stopped = false;
    stopping.then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    expect(clearIntervalImpl).toHaveBeenCalledWith(timer);

    renewal.resolve({
      data: leasedJob({
        heartbeat_at: new Date(NOW_MS + 15_000).toISOString(),
        lease_expires_at: new Date(NOW_MS + 90_000).toISOString(),
      }),
      error: null,
    });
    await stopping;
    expect(stopped).toBe(true);
    await expect(runtime.heartbeat()).resolves.toBe(false);
    expect(heartbeatUpdate).toHaveBeenCalledTimes(1);
  });
});
