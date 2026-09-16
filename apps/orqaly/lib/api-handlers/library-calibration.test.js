import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySupabaseToken: vi.fn(),
  buildSupabaseAdminClient: vi.fn(),
  enqueueAgentJob: vi.fn(),
  checkQuotas: vi.fn(),
}));

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: () => 'token',
  verifySupabaseToken: mocks.verifySupabaseToken,
}));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: (res, status, error) => res.status(status).json({ error }),
  handleApiError: (res, error) => res.status(500).json({ error: error.message }),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: mocks.buildSupabaseAdminClient,
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: () => ({ allowed: true }),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: () => 'user-1',
}));
vi.mock('../goal-handlers/_helpers.js', () => ({
  enqueueAgentJob: mocks.enqueueAgentJob,
}));
vi.mock('../security/user-quotas.js', () => ({ checkQuotas: mocks.checkQuotas }));

import handler from './library-calibration.js';

function response() {
  return {
    statusCode: 200,
    body: null,
    setHeader: vi.fn(),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

function request(action, body) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    query: { action },
    body,
  };
}

function adminWithRows(seed) {
  const rows = structuredClone(seed);
  const reads = [];
  return {
    reads,
    from: vi.fn((table) => {
      const filters = {};
      const query = {
        select() {
          return query;
        },
        eq(field, value) {
          filters[field] = value;
          return query;
        },
        is(field, value) {
          filters[field] = value;
          return query;
        },
        limit() {
          return query;
        },
        async maybeSingle() {
          reads.push({ table, filters: { ...filters } });
          const row = (rows[table] || []).find((candidate) =>
            Object.entries(filters).every(([field, value]) => {
              if (field.startsWith('metadata->>')) {
                return candidate.metadata?.[field.slice('metadata->>'.length)] === value;
              }
              return (candidate[field] ?? null) === value;
            })
          );
          return { data: row || null, error: null };
        },
      };
      return query;
    }),
  };
}

describe('dedicated library calibration producer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'user-1' });
    mocks.enqueueAgentJob.mockResolvedValue({ id: 'job-1', status: 'queued' });
    mocks.checkQuotas.mockResolvedValue({ allowed: true });
  });

  it('queues an owned organization start with a canonical projected payload', async () => {
    const admin = adminWithRows({
      organizations: [{ id: 'org-1', user_id: 'user-1' }],
    });
    mocks.buildSupabaseAdminClient.mockReturnValue(admin);
    const res = response();

    await handler(
      request('start', {
        organizationId: 'org-1',
        costPreference: 'best_quality',
        userId: 'user-2',
        goalId: 'foreign-goal',
        provider: 'https://attacker.invalid',
      }),
      res
    );

    expect(res.statusCode).toBe(202);
    const queued = mocks.enqueueAgentJob.mock.calls[0][1];
    expect(queued.user_id).toBe('user-1');
    expect(queued.payload).toMatchObject({
      type: 'library-calibration',
      phase: 'start',
      organizationId: 'org-1',
      costPreference: 'best_quality',
      _userId: 'user-1',
      userId: 'user-1',
      user_id: 'user-1',
    });
    expect(queued.payload.goalId).toBeUndefined();
    expect(queued.payload.provider).toBeUndefined();
    expect(mocks.checkQuotas).toHaveBeenCalledWith(admin, 'user-1', {
      jobType: 'library-calibration',
    });
  });

  it('rejects an over-quota calibration before enqueue', async () => {
    const admin = adminWithRows({ organizations: [] });
    mocks.buildSupabaseAdminClient.mockReturnValue(admin);
    mocks.checkQuotas.mockResolvedValueOnce({
      allowed: false,
      code: 'QUOTA_JOBS_PER_HOUR',
      message: 'Hourly job limit reached',
      quotas: { max_jobs_per_hour: 200 },
      usage: { jobs_this_hour: 200 },
    });
    const res = response();

    await handler(request('start', {}), res);

    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({
      error: 'Hourly job limit reached',
      code: 'QUOTA_JOBS_PER_HOUR',
    });
    expect(mocks.enqueueAgentJob).not.toHaveBeenCalled();
    expect(mocks.checkQuotas).toHaveBeenCalledWith(admin, 'user-1', {
      jobType: 'library-calibration',
    });
  });

  it('rejects a cross-tenant organization before enqueue', async () => {
    const admin = adminWithRows({
      organizations: [{ id: 'org-1', user_id: 'user-2' }],
    });
    mocks.buildSupabaseAdminClient.mockReturnValue(admin);
    const res = response();

    await handler(request('start', { organizationId: 'org-1' }), res);

    expect(res.statusCode).toBe(404);
    expect(mocks.enqueueAgentJob).not.toHaveBeenCalled();
  });

  it('derives preview organization from the owned sample and strips smuggled fields', async () => {
    const admin = adminWithRows({
      knowledge_documents: [
        {
          id: 'sample-1',
          user_id: 'user-1',
          organization_id: 'org-1',
          category: 'calibration_sample',
        },
      ],
    });
    mocks.buildSupabaseAdminClient.mockReturnValue(admin);
    const res = response();

    await handler(
      request('preview', {
        sampleId: 'sample-1',
        comment: 'Use tighter copy',
        agentContext: { _userId: 'user-2' },
        calibrationRunId: 'foreign-run',
      }),
      res
    );

    expect(res.statusCode).toBe(202);
    const payload = mocks.enqueueAgentJob.mock.calls[0][1].payload;
    expect(payload).toMatchObject({
      phase: 'preview',
      sampleId: 'sample-1',
      organizationId: 'org-1',
      comment: 'Use tighter copy',
    });
    expect(payload.agentContext).toBeUndefined();
    expect(payload.calibrationRunId).toBeUndefined();
  });

  it('rejects a calibration run owned by another tenant', async () => {
    const admin = adminWithRows({
      knowledge_documents: [
        {
          id: 'sample-1',
          user_id: 'user-2',
          organization_id: null,
          category: 'calibration_sample',
          metadata: { calibration_run_id: 'run-1' },
        },
      ],
    });
    mocks.buildSupabaseAdminClient.mockReturnValue(admin);
    const res = response();

    await handler(request('synthesize', { calibrationRunId: 'run-1' }), res);

    expect(res.statusCode).toBe(404);
    expect(mocks.enqueueAgentJob).not.toHaveBeenCalled();
  });
});
