import { describe, expect, it, vi } from 'vitest';
import { triggerProcessNext } from './_helpers.js';

describe('server-side process-next trigger', () => {
  it('sends the worker bearer only to the current Vercel deployment', () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true }));
    const setTimeoutImpl = vi.fn();

    const triggered = triggerProcessNext({
      env: {
        VERCEL_URL: 'orchestratori-git-test-team.vercel.app',
        WORKER_SECRET: 'worker-test-secret',
        QSTASH_TOKEN: 'qstash-test-token',
      },
      fetchImpl,
      setTimeoutImpl,
    });

    expect(triggered).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://orchestratori-git-test-team.vercel.app/api/agent?path=process-next',
      {
        method: 'POST',
        redirect: 'manual',
        headers: { Authorization: 'Bearer worker-test-secret' },
      }
    );
    expect(fetchImpl.mock.calls[0][0]).not.toContain('qstash');

    expect(setTimeoutImpl).toHaveBeenCalledTimes(1);
    expect(setTimeoutImpl.mock.calls[0][1]).toBe(3000);
    setTimeoutImpl.mock.calls[0][0]();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('keeps Preview worker wake-ups alive with Vercel waitUntil', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true }));
    const setTimeoutImpl = vi.fn((callback) => {
      callback();
      return 1;
    });
    const waitUntilImpl = vi.fn();

    const triggered = triggerProcessNext({
      env: {
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'orchestratori-git-test-team.vercel.app',
        WORKER_SECRET: 'worker-test-secret',
        VERCEL_AUTOMATION_BYPASS_SECRET: 'unused-bypass-secret',
      },
      fetchImpl,
      setTimeoutImpl,
      waitUntilImpl,
      getOidcToken: () => 'preview-oidc-token',
    });

    expect(triggered).toBe(true);
    expect(waitUntilImpl).toHaveBeenCalledTimes(1);
    await waitUntilImpl.mock.calls[0][0];
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://orchestratori-git-test-team.vercel.app/api/agent?path=process-next',
      expect.objectContaining({
        redirect: 'manual',
        headers: {
          Authorization: 'Bearer worker-test-secret',
          'x-vercel-trusted-oidc-idp-token': 'preview-oidc-token',
        },
      })
    );
    expect(setTimeoutImpl).toHaveBeenCalledWith(expect.any(Function), 3000);
  });

  it('targets a specific queue row without exposing it outside the self origin', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true }));

    const triggered = triggerProcessNext({
      env: {
        VERCEL_URL: 'orchestratori-git-test-team.vercel.app',
        WORKER_SECRET: 'worker-test-secret',
      },
      fetchImpl,
      setTimeoutImpl: vi.fn(),
      jobId: 'job-preview-goal-1',
    });

    expect(triggered).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://orchestratori-git-test-team.vercel.app/api/agent?path=process-next&job_id=job-preview-goal-1',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        headers: { Authorization: 'Bearer worker-test-secret' },
      })
    );
  });

  it('awaits an exact Preview wake until at least one attempt returns 2xx', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const waitUntilImpl = vi.fn();
    const setTimeoutImpl = vi.fn((callback) => callback());

    const confirmation = triggerProcessNext({
      env: {
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_DEPLOYMENT_ID: 'dpl_exact_preview',
        VERCEL_URL: 'orchestratori-git-test-team.vercel.app',
        WORKER_SECRET: 'worker-test-secret',
      },
      fetchImpl,
      setTimeoutImpl,
      waitUntilImpl,
      getOidcToken: () => 'preview-oidc-token',
      jobId: 'exact-preview-job',
    });

    expect(confirmation).toBeInstanceOf(Promise);
    await expect(confirmation).resolves.toBe(true);
    expect(waitUntilImpl).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://orchestratori-git-test-team.vercel.app/api/agent?path=process-next&job_id=exact-preview-job&dispatch=1'
    );
    expect(setTimeoutImpl).toHaveBeenCalledWith(expect.any(Function), 3000);
  });

  it('returns false when every exact Preview attempt is non-2xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });

    const confirmation = triggerProcessNext({
      env: {
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_DEPLOYMENT_ID: 'dpl_exact_preview',
        VERCEL_URL: 'orchestratori-git-test-team.vercel.app',
        WORKER_SECRET: 'worker-test-secret',
      },
      fetchImpl,
      setTimeoutImpl: vi.fn((callback) => callback()),
      waitUntilImpl: vi.fn(),
      getOidcToken: () => 'preview-oidc-token',
      jobId: 'exact-preview-job',
    });

    await expect(confirmation).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns false when every exact Preview request throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network unavailable'));

    const confirmation = triggerProcessNext({
      env: {
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_DEPLOYMENT_ID: 'dpl_exact_preview',
        VERCEL_URL: 'orchestratori-git-test-team.vercel.app',
        WORKER_SECRET: 'worker-test-secret',
      },
      fetchImpl,
      setTimeoutImpl: vi.fn((callback) => callback()),
      waitUntilImpl: vi.fn(),
      getOidcToken: () => 'preview-oidc-token',
      jobId: 'exact-preview-job',
    });

    await expect(confirmation).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('keeps an exact Preview wake in the awaited caller lifecycle without waitUntil', async () => {
    const waitUntilImpl = vi.fn(() => {
      throw new Error('waitUntil context missing');
    });
    const confirmation = triggerProcessNext({
      env: {
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_DEPLOYMENT_ID: 'dpl_exact_preview',
        VERCEL_URL: 'orchestratori-git-test-team.vercel.app',
        WORKER_SECRET: 'worker-test-secret',
      },
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
      setTimeoutImpl: vi.fn((callback) => callback()),
      waitUntilImpl,
      getOidcToken: () => 'preview-oidc-token',
      jobId: 'exact-preview-job',
    });

    await expect(confirmation).resolves.toBe(true);
    expect(waitUntilImpl).not.toHaveBeenCalled();
  });

  it('uses the configured automation bypass when OIDC is unavailable', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true, status: 200 }));
    const waitUntilImpl = vi.fn();

    expect(
      triggerProcessNext({
        env: {
          VERCEL: '1',
          VERCEL_ENV: 'preview',
          VERCEL_URL: 'orchestratori-git-test-team.vercel.app',
          WORKER_SECRET: 'worker-test-secret',
          VERCEL_AUTOMATION_BYPASS_SECRET: 'automation-bypass-secret',
        },
        fetchImpl,
        setTimeoutImpl: vi.fn((callback) => callback()),
        waitUntilImpl,
        getOidcToken: () => {
          throw new Error('OIDC context unavailable');
        },
      })
    ).toBe(true);

    await waitUntilImpl.mock.calls[0][0];
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://orchestratori-git-test-team.vercel.app/api/agent?path=process-next',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer worker-test-secret',
          'x-vercel-protection-bypass': 'automation-bypass-secret',
        },
      })
    );
  });

  it('fails closed when WORKER_SECRET is not configured', () => {
    const fetchImpl = vi.fn();
    const setTimeoutImpl = vi.fn();

    const triggered = triggerProcessNext({
      env: {
        VERCEL_URL: 'orchestratori-git-test-team.vercel.app',
        CRON_SECRET: 'cron-test-secret',
        QSTASH_TOKEN: 'qstash-test-token',
      },
      fetchImpl,
      setTimeoutImpl,
    });

    expect(triggered).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(setTimeoutImpl).not.toHaveBeenCalled();
  });

  it('does not send the worker bearer to a public fallback URL', () => {
    const fetchImpl = vi.fn();

    const triggered = triggerProcessNext({
      env: {
        NEXT_PUBLIC_SITE_URL: 'https://third-party.example',
        WORKER_SECRET: 'worker-test-secret',
      },
      fetchImpl,
      setTimeoutImpl: vi.fn(),
    });

    expect(triggered).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a non-HTTPS self origin', () => {
    const fetchImpl = vi.fn();

    const triggered = triggerProcessNext({
      env: {
        VERCEL_URL: 'http://orchestratori.vercel.app',
        WORKER_SECRET: 'worker-test-secret',
      },
      fetchImpl,
      setTimeoutImpl: vi.fn(),
    });

    expect(triggered).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
