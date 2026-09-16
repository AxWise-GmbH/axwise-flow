import { describe, expect, it, vi } from 'vitest';
import { processWorkerWithBoundedIdle } from './workflow-v2-local-e2e-polling.mjs';

describe('local workflow v2 E2E worker polling', () => {
  it('waits through briefly idle claims and returns the first worker progress', async () => {
    let currentTime = 0;
    const outcomes = [{ status: 'idle' }, { status: 'idle' }, { status: 'processed' }];
    const processOne = vi.fn(async () => outcomes.shift());
    const readWorkflow = vi.fn();
    const sleep = vi.fn(async (milliseconds) => {
      currentTime += milliseconds;
    });

    await expect(
      processWorkerWithBoundedIdle({
        processOne,
        readWorkflow,
        label: 'workflow processing',
        timeoutMs: 50,
        pollIntervalMs: 20,
        now: () => currentTime,
        sleep,
      })
    ).resolves.toEqual({ status: 'processed' });

    expect(processOne).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([20, 20]);
    expect(readWorkflow).not.toHaveBeenCalled();
  });

  it('re-reads durable state before reporting a genuinely bounded idle stall', async () => {
    let currentTime = 0;
    const processOne = vi.fn(async () => ({ status: 'idle' }));
    const readWorkflow = vi.fn(async () => ({
      run: { status: 'running' },
      stages: [{ kind: 'planning', status: 'queued' }],
    }));
    const sleep = vi.fn(async (milliseconds) => {
      currentTime += milliseconds;
    });

    await expect(
      processWorkerWithBoundedIdle({
        processOne,
        readWorkflow,
        label: 'workflow processing',
        timeoutMs: 50,
        pollIntervalMs: 20,
        now: () => currentTime,
        sleep,
      })
    ).rejects.toThrow(
      'workflow processing stalled after 50ms at running (planning:queued)'
    );

    expect(processOne).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([20, 20, 10]);
    expect(readWorkflow).toHaveBeenCalledTimes(1);
  });
});
