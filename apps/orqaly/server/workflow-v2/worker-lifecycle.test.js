import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkerLifecycle, workerErrorMetadata } from './worker-lifecycle.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(overrides = {}) {
  const options = {
    readiness: vi.fn().mockResolvedValue({ database: 'ok' }),
    queues: Array.from({ length: 5 }, (_, index) => ({
      name: `queue${index}`,
      run: vi.fn().mockResolvedValue(undefined),
    })),
    delayMs: () => 500,
    onQueueError: vi.fn(),
    onStartupRetry: vi.fn(),
    onFatal: vi.fn(),
    onReady: vi.fn(),
    closeServer: vi.fn().mockResolvedValue(undefined),
    closeRepository: vi.fn().mockResolvedValue(undefined),
    exit: vi.fn(),
    ...overrides,
  };
  return { ...options, worker: createWorkerLifecycle(options) };
}
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('worker process lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('requires real database readiness before the first claim and emits ready only once', async () => {
    const gate = deferred();
    const f = fixture({ readiness: vi.fn(() => gate.promise) });
    f.worker.start();
    await flush();
    expect(f.queues[0].run).not.toHaveBeenCalled();
    expect(f.onReady).not.toHaveBeenCalled();
    gate.resolve({ database: 'ok' });
    await flush();
    expect(f.queues.every((queue) => queue.run.mock.calls.length === 1)).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(f.onReady).toHaveBeenCalledTimes(1);
    await f.worker.shutdown();
  });

  it('does not overlap startup and HTTP readiness checks', async () => {
    const gate = deferred();
    const f = fixture({ readiness: vi.fn(() => gate.promise) });
    f.worker.start();
    const request = f.worker.checkReadiness();
    await flush();
    expect(f.readiness).toHaveBeenCalledTimes(1);
    gate.resolve({ database: 'ok' });
    await request;
    await f.worker.shutdown();
  });

  it('retries transient startup failures with bounded backoff and never claims early', async () => {
    const f = fixture({
      readiness: vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('sensitive'), { code: 'ECONNREFUSED' }))
        .mockResolvedValue({ database: 'ok' }),
    });
    f.worker.start();
    await flush();
    expect(f.onStartupRetry).toHaveBeenCalledWith({ attempt: 1, code: 'ECONNREFUSED' });
    expect(f.queues[0].run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(f.queues[0].run).toHaveBeenCalledOnce();
    await f.worker.shutdown();
  });

  it('fails closed on permanent readiness errors, without exposing the message', async () => {
    const f = fixture({ readiness: vi.fn().mockRejectedValue(new Error('secret SQL or payload')) });
    await f.worker.start();
    expect(f.onFatal).toHaveBeenCalledWith({ code: 'Error' });
    expect(f.onStartupRetry).not.toHaveBeenCalled();
    expect(f.queues[0].run).not.toHaveBeenCalled();
    await f.worker.shutdown(1);
    expect(f.exit).toHaveBeenCalledWith(1);
  });

  it('limits transient readiness retries to five attempts', async () => {
    const f = fixture({
      readiness: vi.fn().mockRejectedValue(Object.assign(new Error(), { code: '57P03' })),
    });
    const running = f.worker.start();
    await vi.advanceTimersByTimeAsync(3750);
    await running;
    expect(f.readiness).toHaveBeenCalledTimes(5);
    expect(f.onFatal).toHaveBeenCalledWith({ code: '57P03' });
    await f.worker.shutdown(1);
  });

  it.each([0, 1, 2, 3, 4])(
    'drains queue %s before pool closure and fences every later queue',
    async (index) => {
      const work = deferred();
      const f = fixture();
      f.queues[index].run.mockImplementation(() => work.promise);
      f.worker.start();
      await flush();
      const stopped = f.worker.shutdown();
      expect(f.worker.shutdown()).toBe(stopped);
      await flush();
      expect(f.closeRepository).not.toHaveBeenCalled();
      expect(f.worker.state().stopping).toBe(true);
      await expect(f.worker.checkReadiness()).rejects.toMatchObject({ code: 'WORKER_STOPPING' });
      work.resolve();
      await stopped;
      expect(f.queues.slice(index + 1).every((queue) => queue.run.mock.calls.length === 0)).toBe(
        true
      );
      expect(f.closeServer).toHaveBeenCalledOnce();
      expect(f.closeRepository).toHaveBeenCalledOnce();
      expect(f.onQueueError).not.toHaveBeenCalled();
      expect(f.exit).toHaveBeenCalledExactlyOnceWith(0);
    }
  );

  it('exits nonzero after 8s without ending a pool under active work or late completion', async () => {
    const work = deferred();
    const f = fixture();
    f.queues[0].run.mockImplementation(() => work.promise);
    f.worker.start();
    await flush();
    const stopped = f.worker.shutdown();
    await vi.advanceTimersByTimeAsync(8000);
    expect(await stopped).toEqual({ drained: false, exitCode: 1 });
    expect(f.closeRepository).not.toHaveBeenCalled();
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
    work.resolve();
    await flush();
    expect(f.closeRepository).not.toHaveBeenCalled();
    expect(f.queues[1].run).not.toHaveBeenCalled();
  });

  it('interrupts startup backoff on stop without another claim or readiness attempt', async () => {
    const f = fixture({
      readiness: vi.fn().mockRejectedValue(Object.assign(new Error(), { code: 'ECONNRESET' })),
    });
    f.worker.start();
    await flush();
    await f.worker.shutdown();
    expect(f.readiness).toHaveBeenCalledOnce();
    expect(f.queues[0].run).not.toHaveBeenCalled();
  });

  it('bounds a hung readiness call and does not close its in-flight pool', async () => {
    const ready = deferred();
    const f = fixture({ readiness: vi.fn(() => ready.promise) });
    f.worker.start();
    await vi.advanceTimersByTimeAsync(28750);
    expect(f.onFatal).toHaveBeenCalledWith({ code: 'WORKER_READINESS_TIMEOUT' });
    expect(f.readiness).toHaveBeenCalledOnce();
    expect(f.onStartupRetry).toHaveBeenCalledTimes(4);
    const stopped = f.worker.shutdown(1);
    await vi.advanceTimersByTimeAsync(8000);
    await stopped;
    expect(f.closeRepository).not.toHaveBeenCalled();
    ready.resolve();
    await flush();
    expect(f.closeRepository).not.toHaveBeenCalled();
  });

  it('drains pending HTTP readiness and server close before repository close', async () => {
    const server = deferred();
    const ready = deferred();
    const f = fixture({ closeServer: vi.fn(() => server.promise) });
    f.worker.start();
    await flush();
    f.readiness.mockImplementation(() => ready.promise);
    const request = f.worker.checkReadiness();
    const stopped = f.worker.shutdown();
    server.resolve();
    await flush();
    expect(f.closeRepository).not.toHaveBeenCalled();
    ready.resolve();
    await request;
    await stopped;
    expect(f.closeRepository).toHaveBeenCalledOnce();
  });

  it('continues independent queues on a genuine operation failure and logs bounded diagnostics', async () => {
    const f = fixture();
    f.queues[0].run.mockRejectedValue(
      Object.assign(new Error('customer data'), { code: 'secret-provider-value' })
    );
    f.worker.start();
    await flush();
    expect(f.onQueueError).toHaveBeenCalledWith('queue0', { code: 'Error' });
    expect(f.queues[4].run).toHaveBeenCalledOnce();
    await f.worker.shutdown();
  });

  it('only recognizes an exact safe pool-close diagnostic', () => {
    expect(
      workerErrorMetadata(new Error('Cannot use a pool after calling end on the pool'))
    ).toEqual({ code: 'Error', diagnostic: 'database_pool_closed' });
    expect(
      workerErrorMetadata({ name: 'customer-secret', code: 'token', message: 'sensitive' })
    ).toEqual({ code: 'Error' });
  });

  it.each([
    'timeout exceeded when trying to connect',
    'Connection terminated due to connection timeout',
    'timeout expired',
  ])('retries only the exact known database timeout: %s', async (message) => {
    const f = fixture({
      readiness: vi
        .fn()
        .mockRejectedValueOnce(new Error(message))
        .mockResolvedValue({ database: 'ok' }),
    });
    f.worker.start();
    await flush();
    expect(f.onStartupRetry).toHaveBeenCalledWith({
      attempt: 1,
      code: 'DATABASE_CONNECTION_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(f.queues[0].run).toHaveBeenCalledOnce();
    expect(workerErrorMetadata(new Error(`${message}: customer value`))).toEqual({ code: 'Error' });
    await f.worker.shutdown();
  });

  it('waits for in-flight work but reports failure if HTTP server closure rejects', async () => {
    const work = deferred();
    const f = fixture({ closeServer: vi.fn().mockRejectedValue(new Error('sensitive')) });
    f.queues[0].run.mockImplementation(() => work.promise);
    f.worker.start();
    await flush();
    const stopped = f.worker.shutdown();
    await flush();
    expect(f.exit).not.toHaveBeenCalled();
    work.resolve();
    expect(await stopped).toEqual({ drained: false, exitCode: 1 });
    expect(f.closeRepository).not.toHaveBeenCalled();
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});
