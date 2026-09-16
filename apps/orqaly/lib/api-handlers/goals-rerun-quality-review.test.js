import { describe, expect, it, vi } from 'vitest';

vi.mock('../agent-handlers/job-processor.js', () => ({ processNextJob: vi.fn() }));
vi.mock('../goal-handlers/_helpers.js', () => ({ triggerProcessNext: vi.fn() }));

import { handleRerunQualityReview } from './goals.js';
import { acceptedNativeGoalFixture } from '../_shared/native-goal-authority.test-fixture.js';

const user = { id: 'user-1' };

function makeAdmin({
  goal = {
    id: 'goal-1',
    status: 'completed',
    data: {
      deliverables: [{ id: 'deliverable-1' }],
      quality_review: {
        status: 'review_incomplete',
        schema_version: 2,
        validated_review_count: 0,
        invalid_review_count: 1,
      },
    },
  },
  goalError = null,
  activeJobResults = [[]],
  insertedJob = { id: 'job-new', status: 'queued', worker_scope: 'production' },
  insertError = null,
  logError = null,
} = {}) {
  let activeRead = 0;

  const goalQuery = {
    select: vi.fn(() => goalQuery),
    eq: vi.fn(() => goalQuery),
    maybeSingle: vi.fn(async () => ({ data: goal, error: goalError })),
  };

  const activeQuery = {
    eq: vi.fn(() => activeQuery),
    in: vi.fn(() => activeQuery),
    order: vi.fn(() => activeQuery),
    limit: vi.fn(async () => ({
      data: activeJobResults[Math.min(activeRead++, activeJobResults.length - 1)] || [],
      error: null,
    })),
  };
  const insertResult = {
    select: vi.fn(() => insertResult),
    single: vi.fn(async () => ({ data: insertedJob, error: insertError })),
  };
  const agentJobs = {
    select: vi.fn(() => activeQuery),
    insert: vi.fn(() => insertResult),
  };
  const goalLog = {
    insert: vi.fn(async () => ({ error: logError })),
  };
  const tables = { goals: { select: goalQuery.select }, agent_jobs: agentJobs, goal_log: goalLog };

  return {
    admin: { from: vi.fn((table) => tables[table]) },
    goalQuery,
    agentJobs,
    activeQuery,
    goalLog,
  };
}

describe('handleRerunQualityReview', () => {
  it('requires an owned goal and does not reveal a missing or foreign goal', async () => {
    const { admin, goalQuery, agentJobs } = makeAdmin({ goal: null });

    const result = await handleRerunQualityReview(
      admin,
      user,
      { id: 'goal-foreign' },
      {
        workerScope: 'production',
        kick: vi.fn(),
      }
    );

    expect(result).toEqual({ status: 404, error: 'Goal not found' });
    expect(goalQuery.eq).toHaveBeenCalledWith('id', 'goal-foreign');
    expect(goalQuery.eq).toHaveBeenCalledWith('user_id', user.id);
    expect(agentJobs.select).not.toHaveBeenCalled();
  });

  it('rejects goals that are not completed', async () => {
    const { admin, agentJobs } = makeAdmin({
      goal: { id: 'goal-1', status: 'active', data: { deliverables: [{ id: 'd1' }] } },
    });

    const result = await handleRerunQualityReview(
      admin,
      user,
      { id: 'goal-1' },
      {
        workerScope: 'production',
        kick: vi.fn(),
      }
    );

    expect(result.status).toBe(409);
    expect(result.error).toMatch(/only be re-run for completed goals/i);
    expect(agentJobs.select).not.toHaveBeenCalled();
  });

  it('rejects a completed goal without deliverables', async () => {
    const { admin, agentJobs } = makeAdmin({
      goal: { id: 'goal-1', status: 'completed', data: { deliverables: [] } },
    });

    const result = await handleRerunQualityReview(
      admin,
      user,
      { id: 'goal-1' },
      {
        workerScope: 'production',
        kick: vi.fn(),
      }
    );

    expect(result).toEqual({
      status: 409,
      error: 'This completed goal has no deliverables to review',
    });
    expect(agentJobs.select).not.toHaveBeenCalled();
  });

  it('allows the legacy schema-v2 Bremen failure that lacks validation accounting', async () => {
    const { admin, agentJobs } = makeAdmin({
      goal: {
        id: 'goal-1',
        status: 'completed',
        data: {
          deliverables: [{ id: 'd1' }],
          quality_review: {
            status: 'needs_revision',
            schema_version: 2,
            overall_grade: 97,
            review_count: 5,
          },
        },
      },
    });

    const result = await handleRerunQualityReview(
      admin,
      user,
      { id: 'goal-1' },
      { workerScope: 'production', kick: vi.fn(async () => ({ triggered: true })) }
    );

    expect(result.status).toBe(202);
    expect(result.data.already_queued).toBe(false);
    expect(agentJobs.insert).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'accepted review',
      {
        status: 'accepted',
        schema_version: 2,
        validated_review_count: 5,
        invalid_review_count: 0,
      },
    ],
    [
      'fully accounted needs_revision review',
      {
        status: 'needs_revision',
        schema_version: 2,
        validated_review_count: 5,
        invalid_review_count: 0,
      },
    ],
    [
      'partially accounted needs_revision review',
      {
        status: 'needs_revision',
        schema_version: 2,
        validated_review_count: 5,
      },
    ],
  ])('rejects repeated spend for an %s', async (_label, qualityReview) => {
    const { admin, agentJobs } = makeAdmin({
      goal: {
        id: 'goal-1',
        status: 'completed',
        data: {
          deliverables: [{ id: 'd1' }],
          quality_review: qualityReview,
        },
      },
    });

    const result = await handleRerunQualityReview(
      admin,
      user,
      { id: 'goal-1' },
      { workerScope: 'production', kick: vi.fn() }
    );

    expect(result).toEqual({
      status: 409,
      error:
        'Quality review retry is only available when the latest review is incomplete or failed',
    });
    expect(agentJobs.select).not.toHaveBeenCalled();
    expect(agentJobs.insert).not.toHaveBeenCalled();
  });

  it('returns an existing active full review and ignores a single-deliverable review', async () => {
    const single = {
      id: 'job-single',
      status: 'running',
      worker_scope: 'production',
      payload: {
        type: 'orchestrate-goal',
        action: 'osja-review',
        goalId: 'goal-1',
        singleDeliverableId: 'd1',
      },
    };
    const full = {
      id: 'job-full',
      status: 'queued',
      worker_scope: 'production',
      payload: { type: 'orchestrate-goal', action: 'osja-review', goalId: 'goal-1' },
    };
    const { admin, agentJobs, goalLog } = makeAdmin({ activeJobResults: [[single, full]] });
    const kick = vi.fn();

    const result = await handleRerunQualityReview(
      admin,
      user,
      { id: 'goal-1' },
      {
        workerScope: 'production',
        kick,
      }
    );

    expect(result).toEqual({
      status: 202,
      data: {
        id: 'goal-1',
        job_id: 'job-full',
        status: 'queued',
        worker_scope: 'production',
        already_queued: true,
      },
    });
    expect(agentJobs.insert).not.toHaveBeenCalled();
    expect(goalLog.insert).not.toHaveBeenCalled();
    expect(kick).not.toHaveBeenCalled();
  });

  it('queues exactly one full production review, logs it, and safely kicks the worker', async () => {
    const { admin, agentJobs, goalLog } = makeAdmin({
      activeJobResults: [
        [
          {
            id: 'job-single',
            status: 'running',
            worker_scope: 'production',
            payload: { singleDeliverableId: 'd1' },
          },
        ],
      ],
    });
    const kick = vi.fn(async () => ({ mode: 'production-inline', triggered: true }));

    const result = await handleRerunQualityReview(
      admin,
      user,
      { id: 'goal-1' },
      {
        workerScope: 'production',
        kick,
      }
    );

    expect(agentJobs.insert).toHaveBeenCalledOnce();
    expect(agentJobs.insert).toHaveBeenCalledWith({
      status: 'queued',
      user_id: user.id,
      worker_scope: 'production',
      payload: {
        type: 'orchestrate-goal',
        action: 'osja-review',
        goalId: 'goal-1',
        _userId: user.id,
        userId: user.id,
        user_id: user.id,
        manualRetry: true,
      },
    });
    expect(goalLog.insert).toHaveBeenCalledWith({
      goal_id: 'goal-1',
      event_type: 'osja_review_retry_requested',
      details: {
        actor: user.id,
        job_id: 'job-new',
        worker_scope: 'production',
        deliverable_count: 1,
      },
    });
    expect(kick).toHaveBeenCalledWith(admin, 'goal-1', { jobId: 'job-new' });
    expect(kick).not.toHaveBeenCalledWith(admin, 'goal-1');
    expect(result.data).toEqual({
      id: 'goal-1',
      job_id: 'job-new',
      status: 'queued',
      worker_scope: 'production',
      already_queued: false,
    });
  });

  it('binds a native manual review to the exact accepted scope', async () => {
    const goal = acceptedNativeGoalFixture({ id: 'goal-1', status: 'completed' });
    goal.data.deliverables = [{ id: 'deliverable-1' }];
    goal.data.quality_review = {
      status: 'review_incomplete',
      schema_version: 2,
      validated_review_count: 0,
      invalid_review_count: 1,
    };
    const scopeHash = goal.data.axwise_customer_intelligence.scope_packet.scope_hash;
    const { admin, agentJobs } = makeAdmin({ goal });

    const result = await handleRerunQualityReview(
      admin,
      user,
      { id: 'goal-1' },
      { workerScope: 'production', kick: vi.fn(async () => ({ triggered: true })) }
    );

    expect(result.status).toBe(202);
    expect(agentJobs.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ scopeHash }),
      })
    );
  });

  it('fails closed when an active manual review belongs to an older native scope', async () => {
    const goal = acceptedNativeGoalFixture({ id: 'goal-1', status: 'completed' });
    goal.data.deliverables = [{ id: 'deliverable-1' }];
    goal.data.quality_review = {
      status: 'review_incomplete',
      schema_version: 2,
      validated_review_count: 0,
      invalid_review_count: 1,
    };
    const stale = {
      id: 'job-stale',
      status: 'queued',
      worker_scope: 'production',
      payload: {
        type: 'orchestrate-goal',
        action: 'osja-review',
        goalId: 'goal-1',
        manualRetry: true,
        scopeHash: 'stale-scope',
      },
    };
    const { admin, agentJobs } = makeAdmin({ goal, activeJobResults: [[stale]] });

    const result = await handleRerunQualityReview(
      admin,
      user,
      { id: 'goal-1' },
      { workerScope: 'production', kick: vi.fn() }
    );

    expect(result.status).toBe(409);
    expect(result.error).toMatch(/older native scope/i);
    expect(agentJobs.insert).not.toHaveBeenCalled();
  });

  it('binds Preview review reads and inserts to the exact deployment', async () => {
    const deploymentIdentity = 'vercel-deployment:dpl_current';
    const { admin, agentJobs, activeQuery } = makeAdmin({
      insertedJob: { id: 'job-preview', status: 'queued', worker_scope: 'preview' },
    });
    const kick = vi.fn(async () => ({ mode: 'production-inline', triggered: true }));

    const result = await handleRerunQualityReview(
      admin,
      user,
      { id: 'goal-1' },
      {
        env: {
          VERCEL: '1',
          VERCEL_ENV: 'preview',
          VERCEL_DEPLOYMENT_ID: 'dpl_current',
        },
        kick,
      }
    );

    expect(activeQuery.eq).toHaveBeenCalledWith('payload->>_workerDeployment', deploymentIdentity);
    expect(agentJobs.insert).toHaveBeenCalledWith({
      status: 'queued',
      user_id: user.id,
      worker_scope: 'preview',
      payload: {
        type: 'orchestrate-goal',
        action: 'osja-review',
        goalId: 'goal-1',
        _userId: user.id,
        userId: user.id,
        user_id: user.id,
        manualRetry: true,
        _workerDeployment: deploymentIdentity,
      },
    });
    expect(kick).toHaveBeenCalledWith(admin, 'goal-1', { jobId: 'job-preview' });
    expect(result.data).toMatchObject({
      job_id: 'job-preview',
      worker_scope: 'preview',
      already_queued: false,
    });
  });

  it('re-wakes an existing queued Preview review and fails closed until handoff succeeds', async () => {
    const deploymentIdentity = 'vercel-deployment:dpl_current';
    const existing = {
      id: 'job-preview-existing',
      status: 'queued',
      worker_scope: 'preview',
      payload: {
        type: 'orchestrate-goal',
        action: 'osja-review',
        goalId: 'goal-1',
        _workerDeployment: deploymentIdentity,
      },
    };
    const first = makeAdmin({ activeJobResults: [[existing]] });
    const firstKick = vi.fn(async () => ({ mode: 'preview-worker', triggered: false }));

    const failed = await handleRerunQualityReview(
      first.admin,
      user,
      { id: 'goal-1' },
      {
        env: {
          VERCEL: '1',
          VERCEL_ENV: 'preview',
          VERCEL_DEPLOYMENT_ID: 'dpl_current',
        },
        kick: firstKick,
      }
    );

    expect(failed).toMatchObject({
      status: 503,
      error:
        'Goal processing could not be handed to the Preview worker. Reconciliation is required; refresh and do not create replacement work.',
      data: {
        goal_id: 'goal-1',
        job_id: existing.id,
        retry_safe: false,
      },
    });
    expect(first.agentJobs.insert).not.toHaveBeenCalled();
    expect(firstKick).toHaveBeenCalledWith(first.admin, 'goal-1', {
      jobId: existing.id,
    });

    const retry = makeAdmin({ activeJobResults: [[existing]] });
    const retryKick = vi.fn(async () => ({ mode: 'preview-worker', triggered: true }));
    const accepted = await handleRerunQualityReview(
      retry.admin,
      user,
      { id: 'goal-1' },
      {
        env: {
          VERCEL: '1',
          VERCEL_ENV: 'preview',
          VERCEL_DEPLOYMENT_ID: 'dpl_current',
        },
        kick: retryKick,
      }
    );

    expect(accepted).toMatchObject({
      status: 202,
      data: { job_id: existing.id, already_queued: true },
    });
    expect(retryKick).toHaveBeenCalledWith(retry.admin, 'goal-1', {
      jobId: existing.id,
    });
  });

  it('fails closed before queue access when Preview identity is unavailable', async () => {
    const { admin, agentJobs } = makeAdmin();

    const result = await handleRerunQualityReview(
      admin,
      user,
      { id: 'goal-1' },
      { env: { VERCEL: '1', VERCEL_ENV: 'preview' }, kick: vi.fn() }
    );

    expect(result).toEqual({
      status: 503,
      error: 'Preview deployment identity is unavailable',
    });
    expect(agentJobs.select).not.toHaveBeenCalled();
    expect(agentJobs.insert).not.toHaveBeenCalled();
  });

  it('recovers a concurrent duplicate insert by returning the winning active job', async () => {
    const winningJob = {
      id: 'job-winner',
      status: 'running',
      worker_scope: 'production',
      payload: {
        type: 'orchestrate-goal',
        action: 'osja-review',
        goalId: 'goal-1',
        manualRetry: true,
      },
    };
    const { admin, agentJobs, goalLog } = makeAdmin({
      activeJobResults: [[], [winningJob]],
      insertedJob: null,
      insertError: { code: '23505', message: 'duplicate key' },
    });
    const kick = vi.fn();

    const result = await handleRerunQualityReview(
      admin,
      user,
      { id: 'goal-1' },
      {
        workerScope: 'production',
        kick,
      }
    );

    expect(agentJobs.insert).toHaveBeenCalledOnce();
    expect(result.data).toMatchObject({
      job_id: 'job-winner',
      status: 'running',
      already_queued: true,
    });
    expect(goalLog.insert).not.toHaveBeenCalled();
    expect(kick).not.toHaveBeenCalled();
  });
});
