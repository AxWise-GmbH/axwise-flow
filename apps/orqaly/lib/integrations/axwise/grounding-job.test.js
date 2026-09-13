import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./tracked.js', () => ({ withAxwiseTracked: vi.fn() }));

import { withAxwiseTracked } from './tracked.js';
import { enqueueAxwiseGroundJob, handleAxwiseGroundJob } from './grounding-job.js';

function adminWithInsert(result = { error: null }) {
  const insert = vi.fn(async () => result);
  return { from: vi.fn(() => ({ insert })), insert };
}

function adminWithOwnedOrganization({ owner = 'user-1', orgId = 'org-1' } = {}) {
  const filters = {};
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((key, value) => {
      filters[key] = value;
      return query;
    }),
    maybeSingle: vi.fn(async () => ({
      data: filters.id === orgId && filters.user_id === owner ? { id: orgId } : null,
      error: null,
    })),
  };
  return { from: vi.fn(() => query), query };
}

describe('durable AxWise Copilot grounding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enqueues an owned, bounded grounding job', async () => {
    const admin = adminWithInsert();
    const result = await enqueueAxwiseGroundJob(admin, {
      userId: 'user-1',
      tenant: { userId: 'user-1', orgId: 'org-1' },
      draftAnswer: 'x'.repeat(20_000),
    });

    expect(result.queued).toBe(true);
    const row = admin.insert.mock.calls[0][0];
    expect(row.status).toBe('queued');
    expect(row.user_id).toBe('user-1');
    expect(row.payload).toMatchObject({
      type: 'axwise-ground',
      userId: 'user-1',
      _userId: 'user-1',
      user_id: 'user-1',
      tenant: {
        userId: 'user-1',
        _userId: 'user-1',
        user_id: 'user-1',
        orgId: 'org-1',
      },
    });
    expect(row.payload.draftAnswer).toHaveLength(12_000);
    expect(result.jobId).toBe(row.id);
  });

  it('wakes the exact Preview grounding row before reporting it queued', async () => {
    const admin = adminWithInsert();
    const triggerProcessNextImpl = vi.fn(() => true);
    const env = {
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VERCEL_DEPLOYMENT_ID: 'dpl_grounding',
    };

    const result = await enqueueAxwiseGroundJob(
      admin,
      {
        userId: 'user-1',
        tenant: { userId: 'user-1', orgId: 'org-1' },
        draftAnswer: 'Ground this',
      },
      { env, triggerProcessNextImpl }
    );

    expect(triggerProcessNextImpl).toHaveBeenCalledWith({ jobId: result.jobId, env });
    expect(admin.insert.mock.calls[0][0]).toMatchObject({
      id: result.jobId,
      worker_scope: 'preview',
      payload: { _workerDeployment: 'vercel-deployment:dpl_grounding' },
    });
  });

  it('executes grounding through tracked AxWise telemetry', async () => {
    withAxwiseTracked.mockResolvedValue({ meta: { traceId: 'trace-1' } });
    const admin = adminWithOwnedOrganization();
    const result = await handleAxwiseGroundJob(
      admin,
      {
        requestId: 'request-1',
        userId: 'user-1',
        tenant: {
          userId: 'user-1',
          _userId: 'user-1',
          user_id: 'user-1',
          orgId: 'org-1',
        },
        draftAnswer: 'Answer',
      },
      { user_id: 'user-1' }
    );

    expect(result).toEqual({
      type: 'axwise-ground',
      status: 'grounded',
      requestId: 'request-1',
      traceId: 'trace-1',
    });
    expect(withAxwiseTracked).toHaveBeenCalledWith(
      expect.objectContaining({ integrationPoint: 'copilot.ground', requestId: 'request-1' }),
      expect.any(Function),
      expect.objectContaining({ admin, userId: 'user-1' })
    );
  });

  it('fails a degraded attempt so the queue retry policy can retry it', async () => {
    withAxwiseTracked.mockResolvedValue({ degraded: true });
    await expect(
      handleAxwiseGroundJob(
        adminWithOwnedOrganization(),
        {
          requestId: 'request-1',
          tenant: {
            userId: 'user-1',
            _userId: 'user-1',
            user_id: 'user-1',
            orgId: 'org-1',
          },
          draftAnswer: 'Answer',
        },
        { user_id: 'user-1' }
      )
    ).rejects.toThrow(/retrying durable job/);
  });

  it('rejects a foreign tenant organization before any AxWise call', async () => {
    const admin = adminWithOwnedOrganization({ owner: 'victim-user', orgId: 'victim-org' });

    await expect(
      handleAxwiseGroundJob(
        admin,
        {
          requestId: 'request-foreign-org',
          tenant: {
            userId: 'attacker-user',
            _userId: 'attacker-user',
            user_id: 'attacker-user',
            orgId: 'victim-org',
          },
          draftAnswer: 'Leak victim grounding',
        },
        { user_id: 'attacker-user' }
      )
    ).rejects.toThrow('organization is not owned');

    expect(withAxwiseTracked).not.toHaveBeenCalled();
    expect(admin.query.eq).toHaveBeenCalledWith('user_id', 'attacker-user');
  });

  it('rejects inconsistent organization aliases before any AxWise call', async () => {
    const admin = adminWithOwnedOrganization();

    await expect(
      handleAxwiseGroundJob(
        admin,
        {
          requestId: 'request-mixed-org',
          organizationId: 'org-2',
          tenant: {
            userId: 'user-1',
            _userId: 'user-1',
            user_id: 'user-1',
            orgId: 'org-1',
          },
          draftAnswer: 'Mixed scope',
        },
        { user_id: 'user-1' }
      )
    ).rejects.toThrow('organization context mismatch');

    expect(withAxwiseTracked).not.toHaveBeenCalled();
  });
});
