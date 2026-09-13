import { describe, expect, it } from 'vitest';
import {
  bindAgentJobsToWorkerDeployment,
  bindAgentJobToWorkerDeployment,
  bindJobPayloadToWorkerDeployment,
  isWorkerScope,
  resolveWorkerDeploymentIdentity,
  resolveWorkerScope,
  STALE_RUNNING_JOB_THRESHOLD_MS,
} from './worker-scope.js';

describe('worker queue scope', () => {
  it('shares one five-minute stale-running lease boundary', () => {
    expect(STALE_RUNNING_JOB_THRESHOLD_MS).toBe(5 * 60 * 1000);
  });

  it('isolates production, preview, and local runtimes', () => {
    expect(resolveWorkerScope({ VERCEL: '1', VERCEL_ENV: 'production' })).toBe('production');
    expect(resolveWorkerScope({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBe('preview');
    expect(resolveWorkerScope({})).toBe('local');
  });

  it('fails closed when Vercel does not expose its environment', () => {
    expect(resolveWorkerScope({ VERCEL: '1' })).toBe('preview');
  });

  it('recognizes only supported database partitions', () => {
    expect(isWorkerScope('production')).toBe(true);
    expect(isWorkerScope('preview')).toBe(true);
    expect(isWorkerScope('local')).toBe(true);
    expect(isWorkerScope('staging')).toBe(false);
  });

  it('prefers Vercel deployment id and safely falls back to the exact deployment URL', () => {
    expect(
      resolveWorkerDeploymentIdentity({
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_DEPLOYMENT_ID: 'dpl_exact_123',
        VERCEL_URL: 'fallback.vercel.app',
      })
    ).toBe('vercel-deployment:dpl_exact_123');
    expect(
      resolveWorkerDeploymentIdentity({
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'Orchestrator-AbC.vercel.app',
      })
    ).toBe('vercel-url:orchestrator-abc.vercel.app');
  });

  it('fails closed without a safe Preview deployment identity', () => {
    expect(resolveWorkerDeploymentIdentity({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBeNull();
    expect(
      resolveWorkerDeploymentIdentity({
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'https://user:pass@example.test/path',
      })
    ).toBeNull();
    expect(
      resolveWorkerDeploymentIdentity({
        VERCEL: '1',
        VERCEL_ENV: 'production',
        VERCEL_DEPLOYMENT_ID: 'dpl_prod',
      })
    ).toBeNull();
  });

  it('overwrites a caller-supplied deployment binding with the trusted runtime value', () => {
    expect(
      bindJobPayloadToWorkerDeployment(
        { goalId: 'goal-1', _workerDeployment: 'forged' },
        {
          VERCEL: '1',
          VERCEL_ENV: 'preview',
          VERCEL_DEPLOYMENT_ID: 'dpl_current',
        }
      )
    ).toEqual({
      goalId: 'goal-1',
      _workerDeployment: 'vercel-deployment:dpl_current',
    });
  });

  it('binds single and batched queue rows to the trusted Preview deployment', () => {
    const env = {
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VERCEL_DEPLOYMENT_ID: 'dpl_current',
    };
    const source = {
      status: 'queued',
      worker_scope: 'production',
      payload: { goalId: 'goal-1', _workerDeployment: 'forged' },
    };

    expect(bindAgentJobToWorkerDeployment(source, env)).toEqual({
      status: 'queued',
      worker_scope: 'preview',
      payload: {
        goalId: 'goal-1',
        _workerDeployment: 'vercel-deployment:dpl_current',
      },
    });
    expect(bindAgentJobsToWorkerDeployment([source, source], env)).toEqual([
      {
        status: 'queued',
        worker_scope: 'preview',
        payload: {
          goalId: 'goal-1',
          _workerDeployment: 'vercel-deployment:dpl_current',
        },
      },
      {
        status: 'queued',
        worker_scope: 'preview',
        payload: {
          goalId: 'goal-1',
          _workerDeployment: 'vercel-deployment:dpl_current',
        },
      },
    ]);
  });

  it('leaves an unsafe legacy Preview row unbound so exact claims fail closed', () => {
    expect(
      bindAgentJobToWorkerDeployment(
        {
          status: 'queued',
          payload: { goalId: 'goal-1', _workerDeployment: 'forged' },
        },
        { VERCEL: '1', VERCEL_ENV: 'preview' }
      )
    ).toEqual({
      status: 'queued',
      worker_scope: 'preview',
      payload: { goalId: 'goal-1' },
    });
  });
});
