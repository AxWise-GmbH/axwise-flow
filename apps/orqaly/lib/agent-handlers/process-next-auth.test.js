import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }));

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock('./job-processor.js', () => ({
  createJobLeaseMarker: vi.fn(() => '__orqaly_worker_lease__:test-attempt'),
  processNextJob: vi.fn(async () => ({ processed: false })),
}));

vi.mock('./goal-reconciler.js', () => ({
  reconcileGoals: vi.fn(async () => ({ reconciled: 0, skipped: 0 })),
}));

vi.mock('../goal-handlers/self-healer.js', () => ({
  healAllStuckGoals: vi.fn(async () => ({ scanned: 0, applied: 0, results: [] })),
}));

vi.mock('./pulse-handler.js', () => ({
  detectDuePulseAgents: vi.fn(async () => []),
  checkPulseBudget: vi.fn(),
  notifyPulseBudgetExhausted: vi.fn(),
}));

vi.mock('./pulse-auto-assign.js', () => ({
  autoAssignGoalsToAgents: vi.fn(async () => ({})),
  reassignCompletedPulseAgents: vi.fn(async () => ({})),
}));

function response() {
  return {
    statusCode: 200,
    body: null,
    setHeader: vi.fn(),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
  };
}

function exactDispatchAdmin({ claimMode = 'success' } = {}) {
  const row = {
    id: 'job-preview-goal-1',
    user_id: 'preview-owner',
    status: 'queued',
    worker_scope: 'preview',
    payload: { _workerDeployment: 'vercel-deployment:dpl_exact_dispatch' },
    retry_count: 0,
    max_retries: 1,
    updated_at: '2026-08-22T20:00:00.000Z',
    error: null,
    result: null,
  };
  let updateCalls = 0;
  const projectRow = (columns) =>
    Object.fromEntries(
      String(columns || '')
        .split(',')
        .map((column) => column.trim())
        .filter(Boolean)
        .map((column) => [column, row[column]])
    );

  const from = vi.fn((table) => {
    if (table !== 'agent_jobs') throw new Error(`Unexpected table ${table}`);
    return {
      select: vi.fn((columns) => {
        const query = {
          eq: vi.fn(() => query),
          is: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({ data: projectRow(columns), error: null })),
        };
        return query;
      }),
      update: vi.fn((patch) => {
        let selectedColumns = null;
        const query = {
          eq: vi.fn(() => query),
          is: vi.fn(() => query),
          select: vi.fn((columns) => {
            selectedColumns = columns;
            return query;
          }),
          maybeSingle: vi.fn(async () => {
            updateCalls += 1;
            if (claimMode === 'success') {
              Object.assign(row, patch);
              return { data: projectRow(selectedColumns), error: null };
            }
            if (claimMode === 'error_committed') {
              Object.assign(row, patch);
              return { data: null, error: new Error('claim response lost') };
            }
            return { data: null, error: new Error('claim rejected') };
          }),
        };
        return query;
      }),
    };
  });

  return {
    admin: { from },
    row,
    get updateCalls() {
      return updateCalls;
    },
  };
}

describe('process-next authentication', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.WORKER_SECRET = 'worker-test-secret';
    delete process.env.CRON_SECRET;
    delete process.env.BACKUP_SECRET;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_DEPLOYMENT_ID;
  });

  afterEach(() => {
    delete process.env.WORKER_SECRET;
    delete process.env.CRON_SECRET;
    delete process.env.BACKUP_SECRET;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_DEPLOYMENT_ID;
  });

  it('rejects an unauthenticated GET when CRON_SECRET is absent', async () => {
    const { default: handler } = await import('./process-next.js');
    const res = response();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorized' });
  });

  it('rejects a valid-looking user bearer instead of activating the global queue', async () => {
    const { default: handler } = await import('./process-next.js');
    const res = response();

    await handler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer signed-supabase-user-jwt' },
      },
      res
    );

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorized' });
  });

  it.each([
    ['WORKER_SECRET', 'worker-test-secret'],
    ['CRON_SECRET', 'cron-test-secret'],
  ])('accepts a configured %s service bearer', async (name, secret) => {
    process.env[name] = secret;
    const { default: handler } = await import('./process-next.js');
    const res = response();

    await handler({ method: 'POST', headers: { authorization: `Bearer ${secret}` } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ processed: false, reconciled: 0 });
  });

  it('rejects BACKUP_SECRET when it is the only configured process-next bearer', async () => {
    delete process.env.WORKER_SECRET;
    delete process.env.CRON_SECRET;
    process.env.BACKUP_SECRET = 'backup-test-secret';
    const { default: handler } = await import('./process-next.js');
    const res = response();

    await handler({ method: 'POST', headers: { authorization: 'Bearer backup-test-secret' } }, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorized' });
  });

  it('passes an authenticated targeted pickup to the specific-job claimant', async () => {
    const { default: handler } = await import('./process-next.js');
    const { processNextJob } = await import('./job-processor.js');
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer worker-test-secret' },
      query: { job_id: 'job-preview-goal-1' },
    };
    const res = response();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(processNextJob).toHaveBeenCalledWith(expect.anything(), req, 'job-preview-goal-1');
  });

  it('returns fast 202 only after registering and claiming an exact Preview dispatch', async () => {
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_exact_dispatch';
    const { buildSupabaseAdminClient } = await import('../../api/_lib/supabase-server.js');
    const state = exactDispatchAdmin();
    const { admin } = state;
    buildSupabaseAdminClient.mockReturnValue(admin);
    const { default: handler } = await import('./process-next.js');
    const { processNextJob } = await import('./job-processor.js');
    const { waitUntil } = await import('@vercel/functions');
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer worker-test-secret' },
      query: { job_id: 'job-preview-goal-1', dispatch: '1' },
    };
    const res = response();

    await handler(req, res);

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      workerScope: 'preview',
      dispatched: true,
      job_id: 'job-preview-goal-1',
    });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(state.row.status).toBe('running');
    expect(processNextJob).toHaveBeenCalledWith(admin, req, 'job-preview-goal-1', {
      preclaimedJob: expect.objectContaining({
        id: 'job-preview-goal-1',
        user_id: 'preview-owner',
        status: 'running',
        max_retries: 1,
        error: null,
        result: null,
        lease_token: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        heartbeat_at: expect.any(String),
        lease_expires_at: expect.any(String),
      }),
    });
    await waitUntil.mock.calls[0][0];
  });

  it('adopts an exact claim whose database response was lost', async () => {
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_exact_dispatch';
    const { buildSupabaseAdminClient } = await import('../../api/_lib/supabase-server.js');
    const state = exactDispatchAdmin({ claimMode: 'error_committed' });
    buildSupabaseAdminClient.mockReturnValue(state.admin);
    const { default: handler } = await import('./process-next.js');
    const { processNextJob } = await import('./job-processor.js');
    const res = response();

    await handler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer worker-test-secret' },
        query: { job_id: 'job-preview-goal-1', dispatch: '1' },
      },
      res
    );

    expect(res.statusCode).toBe(202);
    expect(state.row.status).toBe('running');
    expect(processNextJob).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the exact claim remains proven original', async () => {
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_exact_dispatch';
    const { buildSupabaseAdminClient } = await import('../../api/_lib/supabase-server.js');
    const state = exactDispatchAdmin({ claimMode: 'error_original' });
    buildSupabaseAdminClient.mockReturnValue(state.admin);
    const { default: handler } = await import('./process-next.js');
    const { processNextJob } = await import('./job-processor.js');
    const res = response();

    await handler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer worker-test-secret' },
        query: { job_id: 'job-preview-goal-1', dispatch: '1' },
      },
      res
    );

    expect(res.statusCode).toBe(503);
    expect(state.row.status).toBe('queued');
    expect(state.updateCalls).toBe(2);
    expect(processNextJob).not.toHaveBeenCalled();
  });

  it('fails exact Preview dispatch when waitUntil registration throws', async () => {
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_exact_dispatch';
    const { buildSupabaseAdminClient } = await import('../../api/_lib/supabase-server.js');
    const state = exactDispatchAdmin();
    buildSupabaseAdminClient.mockReturnValue(state.admin);
    const { waitUntil } = await import('@vercel/functions');
    waitUntil.mockImplementationOnce(() => {
      throw new Error('waitUntil unavailable');
    });
    const { default: handler } = await import('./process-next.js');
    const res = response();

    await handler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer worker-test-secret' },
        query: { job_id: 'job-preview-goal-1', dispatch: '1' },
      },
      res
    );

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe('Exact dispatch could not be registered');
    expect(state.row.status).toBe('queued');
    expect(state.updateCalls).toBe(0);
  });

  it('fails closed instead of acknowledging an already-running exact Preview row', async () => {
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_exact_dispatch';
    const { buildSupabaseAdminClient } = await import('../../api/_lib/supabase-server.js');
    const state = exactDispatchAdmin();
    state.row.status = 'running';
    state.row.error = '__orqaly_worker_lease__:unverified-owner';
    buildSupabaseAdminClient.mockReturnValue(state.admin);
    const { default: handler } = await import('./process-next.js');
    const { processNextJob } = await import('./job-processor.js');
    const { waitUntil } = await import('@vercel/functions');
    const res = response();

    await handler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer worker-test-secret' },
        query: { job_id: 'job-preview-goal-1', dispatch: '1' },
      },
      res
    );

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      code: 'EXACT_DISPATCH_RECONCILIATION_REQUIRED',
      job_id: 'job-preview-goal-1',
    });
    expect(waitUntil).not.toHaveBeenCalled();
    expect(processNextJob).not.toHaveBeenCalled();
  });
});
