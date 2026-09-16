import { describe, expect, it, vi } from 'vitest';

vi.mock('../agent-handlers/job-processor.js', () => ({ processNextJob: vi.fn() }));
vi.mock('../goal-handlers/_helpers.js', () => ({ triggerProcessNext: vi.fn() }));

import { enqueueGoalWorkerJob, handleRetryPickup, summarizeGoalWorkerPickup } from './goals.js';

const user = { id: 'user-1' };
const nowMs = Date.parse('2026-08-22T13:10:00.000Z');
const deploymentIdentity = 'vercel-deployment:dpl_current';
const capabilitySecret = 'pickup-signing-secret';

function makeAdmin({
  goal = {
    id: 'goal-1',
    status: 'feasibility',
    data: { revision: 'goal-snapshot-1' },
    updated_at: '2026-08-22T12:55:00.000Z',
  },
  goalError = null,
  pickupJobs = [
    {
      id: 'job-goal-1',
      status: 'queued',
      worker_scope: 'preview',
      retry_count: 0,
      max_retries: 3,
      created_at: '2026-08-22T13:00:00.000Z',
      updated_at: '2026-08-22T13:00:00.000Z',
    },
  ],
  pickupError = null,
  transitionError = null,
  transitionThrows = null,
  transitionCommitsBeforeThrow = false,
  transitionAllowed = true,
  transitionRereadJob = null,
  goalFailureError = null,
  goalFailureAllowed = true,
} = {}) {
  const normalizedPickupJobs = pickupJobs.map((job, index) => {
    const normalized = {
      ...job,
      payload: {
        goalId: 'goal-1',
        _workerDeployment: deploymentIdentity,
        ...(job.payload || {}),
      },
    };
    if (normalized.status === 'running') {
      normalized.lease_token ||= `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      normalized.heartbeat_at ||= normalized.updated_at;
      normalized.lease_expires_at ||= new Date(
        Date.parse(normalized.updated_at) + 75_000
      ).toISOString();
    }
    return normalized;
  });
  const goalQuery = {
    select: vi.fn(() => goalQuery),
    eq: vi.fn(() => goalQuery),
    maybeSingle: vi.fn(async () => ({ data: goal, error: goalError })),
  };
  let goalFailurePatch = null;
  const goalFailureQuery = {
    eq: vi.fn(() => goalFailureQuery),
    is: vi.fn(() => goalFailureQuery),
    select: vi.fn(() => goalFailureQuery),
    maybeSingle: vi.fn(async () => ({
      data: goalFailureAllowed
        ? { id: goal?.id, status: goalFailurePatch?.status || goal?.status }
        : null,
      error: goalFailureError,
    })),
  };
  let transitionPatch = null;
  let transitionCommitted = false;
  const pickupQuery = {
    eq: vi.fn(() => pickupQuery),
    in: vi.fn(() => pickupQuery),
    contains: vi.fn(() => pickupQuery),
    order: vi.fn(() => pickupQuery),
    limit: vi.fn(async () => ({ data: normalizedPickupJobs, error: pickupError })),
    maybeSingle: vi.fn(async () => {
      const original = normalizedPickupJobs[0] || null;
      return {
        data: transitionRereadJob
          ? { ...structuredClone(original), ...structuredClone(transitionRereadJob) }
          : original && transitionCommitted
            ? { ...original, ...structuredClone(transitionPatch) }
            : structuredClone(original),
        error: pickupError,
      };
    }),
  };
  const transitionQuery = {
    eq: vi.fn(() => transitionQuery),
    select: vi.fn(() => transitionQuery),
    maybeSingle: vi.fn(async () => {
      if (transitionThrows) {
        transitionCommitted = transitionCommitsBeforeThrow;
        throw transitionThrows;
      }
      transitionCommitted = transitionAllowed && !transitionError;
      return {
        data: transitionAllowed
          ? {
              id: normalizedPickupJobs[0]?.id,
              status: transitionPatch?.status,
            }
          : null,
        error: transitionError,
      };
    }),
  };
  const agentJobs = {
    select: vi.fn(() => pickupQuery),
    insert: vi.fn(),
    update: vi.fn((patch) => {
      transitionPatch = patch;
      return transitionQuery;
    }),
  };
  const tables = {
    goals: {
      select: goalQuery.select,
      update: vi.fn((patch) => {
        goalFailurePatch = patch;
        return goalFailureQuery;
      }),
    },
    agent_jobs: agentJobs,
    goal_log: { insert: vi.fn(async () => ({ error: null })) },
  };

  return {
    admin: {
      _goal: goal,
      _pickupJobs: normalizedPickupJobs,
      _transitionQuery: transitionQuery,
      _goalFailureQuery: goalFailureQuery,
      _tables: tables,
      from: vi.fn((table) => tables[table]),
    },
    goalQuery,
    pickupQuery,
    agentJobs,
  };
}

function retry(admin, kickProcessing = vi.fn(async () => ({ triggered: true })), options = {}) {
  const {
    providedCapability,
    deploymentIdentity: requestedDeploymentIdentity = deploymentIdentity,
    capabilitySecret: requestedCapabilitySecret = capabilitySecret,
    ...handlerOptions
  } = options;
  const currentJob = admin._pickupJobs?.[0];
  const issuedCapability = summarizeGoalWorkerPickup(admin._goal?.status, currentJob, {
    goalId: 'goal-1',
    userId: user.id,
    deploymentIdentity: requestedDeploymentIdentity,
    capabilitySecret: requestedCapabilitySecret,
  })?.capability;
  return handleRetryPickup(
    admin,
    user,
    {
      id: 'goal-1',
      pickup_capability: providedCapability ?? issuedCapability ?? 'v1.unmatched-snapshot',
    },
    {
      workerScope: 'preview',
      deploymentIdentity: requestedDeploymentIdentity,
      capabilitySecret: requestedCapabilitySecret,
      now: () => nowMs,
      kickProcessing,
      ...handlerOptions,
    }
  );
}

describe('Preview goal worker pickup retry', () => {
  it('uses the fast 15-second window only for Preview queue rows', () => {
    const queuedAt = '2026-08-22T13:00:00.000Z';
    const job = {
      status: 'queued',
      retry_count: 0,
      max_retries: 3,
      created_at: queuedAt,
      updated_at: queuedAt,
    };

    expect(
      summarizeGoalWorkerPickup('feasibility', { ...job, worker_scope: 'preview' })
        ?.retry_available_at
    ).toBe('2026-08-22T13:00:15.000Z');
    expect(
      summarizeGoalWorkerPickup('feasibility', { ...job, worker_scope: 'production' })
        ?.retry_available_at
    ).toBe('2026-08-22T13:01:30.000Z');
  });

  it('issues an opaque capability bound to deployment, goal, owner, and queue snapshot', () => {
    const job = {
      id: 'job-goal-1',
      status: 'queued',
      worker_scope: 'preview',
      retry_count: 0,
      max_retries: 3,
      created_at: '2026-08-22T13:00:00.000Z',
      updated_at: '2026-08-22T13:00:00.000Z',
      payload: { goalId: 'goal-1', _workerDeployment: deploymentIdentity },
    };
    const context = {
      goalId: 'goal-1',
      userId: user.id,
      deploymentIdentity,
      capabilitySecret,
    };
    const capability = summarizeGoalWorkerPickup('feasibility', job, context)?.capability;

    expect(capability).toMatch(/^v1\.[A-Za-z0-9_-]{43}$/);
    expect(capability).not.toContain(job.id);
    expect(
      summarizeGoalWorkerPickup(
        'feasibility',
        { ...job, updated_at: '2026-08-22T13:00:01Z' },
        context
      )?.capability
    ).not.toBe(capability);
    expect(
      summarizeGoalWorkerPickup('feasibility', job, { ...context, userId: 'user-2' })?.capability
    ).not.toBe(capability);
    expect(
      summarizeGoalWorkerPickup('feasibility', job, { ...context, goalId: 'goal-2' })?.capability
    ).not.toBe(capability);
    expect(
      summarizeGoalWorkerPickup('feasibility', { ...job, id: 'job-goal-2' }, context)?.capability
    ).not.toBe(capability);
    expect(
      summarizeGoalWorkerPickup('feasibility', { ...job, retry_count: 1 }, context)?.capability
    ).not.toBe(capability);
    expect(
      summarizeGoalWorkerPickup('feasibility', { ...job, max_retries: 4 }, context)?.capability
    ).not.toBe(capability);
    expect(
      summarizeGoalWorkerPickup('feasibility', { ...job, status: 'running' }, context)?.capability
    ).not.toBe(capability);
    expect(summarizeGoalWorkerPickup('planning', job, context)?.capability).not.toBe(capability);
    expect(
      summarizeGoalWorkerPickup('feasibility', job, {
        ...context,
        deploymentIdentity: 'vercel-deployment:dpl_other',
      })?.capability
    ).toBeUndefined();
  });

  it('stamps initial goal jobs with the trusted Preview deployment identity', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const admin = { from: vi.fn(() => ({ insert })) };

    await enqueueGoalWorkerJob(
      admin,
      {
        user_id: '00000000-0000-4000-8000-000000000099',
        status: 'queued',
        worker_scope: 'preview',
        payload: {
          type: 'orchestrate-goal',
          goalId: 'goal-1',
          _workerDeployment: 'forged',
        },
      },
      {
        env: {
          VERCEL: '1',
          VERCEL_ENV: 'preview',
          VERCEL_DEPLOYMENT_ID: 'dpl_current',
        },
      }
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        payload: expect.objectContaining({
          goalId: 'goal-1',
          _userId: '00000000-0000-4000-8000-000000000099',
          userId: '00000000-0000-4000-8000-000000000099',
          user_id: '00000000-0000-4000-8000-000000000099',
          _workerDeployment: deploymentIdentity,
        }),
      })
    );
  });

  it('establishes goal ownership before inspecting the service-role queue', async () => {
    const { admin, goalQuery, agentJobs } = makeAdmin({ goal: null });

    const result = await retry(admin);

    expect(result).toEqual({ status: 404, error: 'Goal not found' });
    expect(goalQuery.eq).toHaveBeenCalledWith('id', 'goal-1');
    expect(goalQuery.eq).toHaveBeenCalledWith('user_id', user.id);
    expect(agentJobs.select).not.toHaveBeenCalled();
  });

  it.each(['completed', 'paused', 'needs_human', 'awaiting_approval'])(
    'refuses the non-reconcilable %s state',
    async (status) => {
      const { admin, agentJobs } = makeAdmin({ goal: { id: 'goal-1', status } });
      const kickProcessing = vi.fn();

      const result = await retry(admin, kickProcessing);

      expect(result).toMatchObject({ status: 409 });
      expect(agentJobs.select).not.toHaveBeenCalled();
      expect(kickProcessing).not.toHaveBeenCalled();
    }
  );

  it('is unavailable outside Preview even for an owned goal', async () => {
    const { admin, agentJobs } = makeAdmin();

    const result = await retry(admin, vi.fn(), { workerScope: 'production' });

    expect(result).toEqual({
      status: 409,
      error: 'Manual worker pickup is only available for Preview deployments',
    });
    expect(agentJobs.select).not.toHaveBeenCalled();
  });

  it('requires an existing active job in the current worker partition', async () => {
    const { admin, pickupQuery, agentJobs } = makeAdmin({ pickupJobs: [] });
    const kickProcessing = vi.fn();

    const result = await retry(admin, kickProcessing);

    expect(agentJobs.select).toHaveBeenCalledWith(
      'id, status, worker_scope, retry_count, max_retries, created_at, updated_at, payload, lease_token, heartbeat_at, lease_expires_at'
    );
    expect(pickupQuery.eq).toHaveBeenCalledWith('worker_scope', 'preview');
    expect(pickupQuery.in).toHaveBeenCalledWith('status', ['queued', 'running']);
    expect(pickupQuery.eq).toHaveBeenCalledWith('payload->>_workerDeployment', deploymentIdentity);
    expect(pickupQuery.contains).toHaveBeenCalledWith('payload', { goalId: 'goal-1' });
    expect(result).toMatchObject({ status: 409, error: expect.stringContaining('no recoverable') });
    expect(agentJobs.insert).not.toHaveBeenCalled();
    expect(kickProcessing).not.toHaveBeenCalled();
  });

  it('fails closed when deployment identity or signing secret is unavailable', async () => {
    const missingIdentity = makeAdmin();
    const missingSecret = makeAdmin();

    await expect(
      retry(missingIdentity.admin, vi.fn(), {
        deploymentIdentity: null,
        providedCapability: 'v1.any',
      })
    ).resolves.toEqual({ status: 503, error: 'Preview deployment identity is unavailable' });
    await expect(
      retry(missingSecret.admin, vi.fn(), {
        capabilitySecret: '',
        providedCapability: 'v1.any',
      })
    ).resolves.toEqual({ status: 503, error: 'Preview pickup signing is unavailable' });
  });

  it('requires the server-issued capability and rejects a changed snapshot', async () => {
    const { admin } = makeAdmin();
    const currentJob = admin._pickupJobs[0];
    const oldCapability = summarizeGoalWorkerPickup(
      'feasibility',
      { ...currentJob, updated_at: '2026-08-22T12:59:59.000Z' },
      {
        goalId: 'goal-1',
        userId: user.id,
        deploymentIdentity,
        capabilitySecret,
      }
    ).capability;
    const kickProcessing = vi.fn();

    await expect(retry(admin, kickProcessing, { providedCapability: '' })).resolves.toEqual({
      status: 409,
      error: 'A current Preview pickup capability is required',
    });
    await expect(
      retry(admin, kickProcessing, { providedCapability: oldCapability })
    ).resolves.toEqual({
      status: 409,
      error: 'This Preview pickup snapshot is no longer current',
    });
    await expect(
      retry(admin, kickProcessing, { providedCapability: `v1.${'é'.repeat(43)}` })
    ).resolves.toEqual({
      status: 409,
      error: 'This Preview pickup snapshot is no longer current',
    });
    expect(kickProcessing).not.toHaveBeenCalled();
  });

  it('does not inspect or wake another Preview deployment queue', async () => {
    const { admin, pickupQuery } = makeAdmin({ pickupJobs: [] });
    const kickProcessing = vi.fn();
    const otherDeployment = 'vercel-deployment:dpl_other';

    const result = await retry(admin, kickProcessing, {
      deploymentIdentity: otherDeployment,
      providedCapability: 'v1.unmatched',
    });

    expect(pickupQuery.eq).toHaveBeenCalledWith('payload->>_workerDeployment', otherDeployment);
    expect(result).toMatchObject({ status: 409, error: expect.stringContaining('no recoverable') });
    expect(kickProcessing).not.toHaveBeenCalled();
  });

  it('rejects a current-deployment row even if a cross-deployment query leaked it', async () => {
    const { admin, agentJobs } = makeAdmin();
    const kickProcessing = vi.fn();
    const currentCapability = summarizeGoalWorkerPickup('feasibility', admin._pickupJobs[0], {
      goalId: 'goal-1',
      userId: user.id,
      deploymentIdentity,
      capabilitySecret,
    }).capability;

    const result = await retry(admin, kickProcessing, {
      deploymentIdentity: 'vercel-deployment:dpl_other',
      providedCapability: currentCapability,
    });

    expect(result).toMatchObject({ status: 409 });
    expect(agentJobs.update).not.toHaveBeenCalled();
    expect(kickProcessing).not.toHaveBeenCalled();
  });

  it('does not re-wake a fresh queued job', async () => {
    const status = 'queued';
    const updatedAt = '2026-08-22T13:09:50.000Z';
    const { admin } = makeAdmin({
      pickupJobs: [
        {
          id: 'job-goal-1',
          status,
          worker_scope: 'preview',
          created_at: updatedAt,
          updated_at: updatedAt,
        },
      ],
    });
    const kickProcessing = vi.fn();

    const result = await retry(admin, kickProcessing);

    expect(result).toEqual({
      status: 409,
      error: 'This worker job is still within its normal pickup window',
    });
    expect(kickProcessing).not.toHaveBeenCalled();
  });

  it('wakes a stale queued job without inserting another job or goal', async () => {
    const status = 'queued';
    const updatedAt = '2026-08-22T13:08:29.999Z';
    const { admin, agentJobs } = makeAdmin({
      pickupJobs: [
        {
          id: 'job-goal-1',
          status,
          worker_scope: 'preview',
          retry_count: 2,
          max_retries: 3,
          created_at: updatedAt,
          updated_at: updatedAt,
        },
      ],
    });
    const kickProcessing = vi.fn(async () => ({ mode: 'preview-worker', triggered: true }));

    const result = await retry(admin, kickProcessing);

    expect(result).toEqual({
      status: 202,
      data: {
        id: 'goal-1',
        status: 'feasibility',
        worker_scope: 'preview',
        job_status: status,
        pickup_requested: true,
      },
    });
    expect(kickProcessing).toHaveBeenCalledWith(admin, 'goal-1', {
      jobId: 'job-goal-1',
    });
    expect(agentJobs.insert).not.toHaveBeenCalled();
  });

  it('preserves queued pickup priority during a running/queued overlap', async () => {
    const runningJobs = Array.from({ length: 11 }, (_, index) => ({
      id: `running-job-${index}`,
      status: 'running',
      worker_scope: 'preview',
      retry_count: 0,
      max_retries: 3,
      created_at: '2026-08-22T13:00:00.000Z',
      updated_at: `2026-08-22T13:09:${String(index).padStart(2, '0')}.000Z`,
    }));
    const { admin, pickupQuery } = makeAdmin({
      pickupJobs: [
        ...runningJobs,
        {
          id: 'queued-job',
          status: 'queued',
          worker_scope: 'preview',
          retry_count: 0,
          max_retries: 3,
          created_at: '2026-08-22T13:00:00.000Z',
          updated_at: '2026-08-22T13:00:00.000Z',
        },
      ],
    });
    const queuedCapability = summarizeGoalWorkerPickup('feasibility', admin._pickupJobs.at(-1), {
      goalId: 'goal-1',
      userId: user.id,
      deploymentIdentity,
      capabilitySecret,
    }).capability;
    const kickProcessing = vi.fn(async () => ({ mode: 'preview-worker', triggered: true }));

    const result = await retry(admin, kickProcessing, { providedCapability: queuedCapability });

    expect(result).toMatchObject({ status: 202, data: { job_status: 'queued' } });
    expect(kickProcessing).toHaveBeenCalledWith(admin, 'goal-1', { jobId: 'queued-job' });
    expect(pickupQuery.order).toHaveBeenCalledWith('status', { ascending: true });
    expect(admin._transitionQuery.eq).not.toHaveBeenCalled();
  });

  it('refuses a stale queued job whose retry budget is already exhausted', async () => {
    const updatedAt = '2026-08-22T13:00:00.000Z';
    const { admin, agentJobs } = makeAdmin({
      pickupJobs: [
        {
          id: 'job-goal-1',
          status: 'queued',
          worker_scope: 'preview',
          retry_count: 3,
          max_retries: 3,
          created_at: updatedAt,
          updated_at: updatedAt,
        },
      ],
    });
    const kickProcessing = vi.fn();

    const result = await retry(admin, kickProcessing);

    expect(result).toEqual({
      status: 409,
      error: 'This goal has no recoverable job in the current Preview deployment',
    });
    expect(kickProcessing).not.toHaveBeenCalled();
    expect(agentJobs.insert).not.toHaveBeenCalled();
  });

  it('projects a signed running lease without exposing its id or payload', () => {
    const running = {
      id: 'private-running-job-id',
      status: 'running',
      worker_scope: 'preview',
      retry_count: 1,
      max_retries: 3,
      created_at: '2026-08-22T12:59:00.000Z',
      updated_at: '2026-08-22T13:00:00.000Z',
      lease_token: '00000000-0000-4000-8000-000000000001',
      heartbeat_at: '2026-08-22T13:00:00.000Z',
      lease_expires_at: '2026-08-22T13:01:15.000Z',
      payload: { goalId: 'goal-1', _workerDeployment: deploymentIdentity, private: 'secret' },
    };

    const projection = summarizeGoalWorkerPickup('feasibility', running, {
      goalId: 'goal-1',
      userId: user.id,
      deploymentIdentity,
      capabilitySecret,
    });

    expect(projection).toEqual({
      status: 'running',
      worker_scope: 'preview',
      updated_at: running.updated_at,
      retry_available_at: '2026-08-22T13:01:15.000Z',
      capability: expect.stringMatching(/^v1\.[A-Za-z0-9_-]{43}$/),
    });
    expect(projection).not.toHaveProperty('id');
    expect(projection).not.toHaveProperty('payload');
    expect(projection).not.toHaveProperty('queued_at');
  });

  it('refuses a running lease at its durable expiry threshold', async () => {
    const updatedAt = '2026-08-22T13:08:45.001Z';
    const { admin, agentJobs } = makeAdmin({
      pickupJobs: [
        {
          id: 'job-goal-1',
          status: 'running',
          retry_count: 1,
          max_retries: 3,
          worker_scope: 'preview',
          created_at: updatedAt,
          updated_at: updatedAt,
        },
      ],
    });
    const kickProcessing = vi.fn();

    const result = await retry(admin, kickProcessing);

    expect(result).toEqual({ status: 409, error: 'This running worker lease is not stale yet' });
    expect(agentJobs.update).not.toHaveBeenCalled();
    expect(kickProcessing).not.toHaveBeenCalled();
  });

  it('requeues one exact stale running lease and wakes only that row', async () => {
    const updatedAt = '2026-08-22T13:08:44.999Z';
    const { admin, agentJobs } = makeAdmin({
      pickupJobs: [
        {
          id: 'job-goal-1',
          status: 'running',
          retry_count: 1,
          max_retries: 3,
          worker_scope: 'preview',
          created_at: updatedAt,
          updated_at: updatedAt,
        },
      ],
    });
    const kickProcessing = vi.fn(async () => ({ mode: 'preview-worker', triggered: true }));

    const result = await retry(admin, kickProcessing);

    expect(agentJobs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'queued',
        retry_count: 2,
        error: 'Re-queued after stale timeout',
        updated_at: '2026-08-22T13:10:00.000Z',
        lease_token: null,
        heartbeat_at: null,
        lease_expires_at: null,
      })
    );
    expect(admin._transitionQuery.eq.mock.calls).toEqual(
      expect.arrayContaining([
        ['id', 'job-goal-1'],
        ['status', 'running'],
        ['worker_scope', 'preview'],
        ['payload->>_workerDeployment', deploymentIdentity],
        ['retry_count', 1],
        ['updated_at', updatedAt],
        ['lease_token', admin._pickupJobs[0].lease_token],
        ['lease_expires_at', admin._pickupJobs[0].lease_expires_at],
      ])
    );
    expect(kickProcessing).toHaveBeenCalledWith(admin, 'goal-1', { jobId: 'job-goal-1' });
    expect(result).toMatchObject({
      status: 202,
      data: { job_status: 'queued', pickup_requested: true },
    });
  });

  it('parks an exhausted stale running lease at needs_human without waking it', async () => {
    const { admin, agentJobs } = makeAdmin({
      pickupJobs: [
        {
          id: 'job-goal-1',
          status: 'running',
          retry_count: 2,
          max_retries: 3,
          worker_scope: 'preview',
          created_at: '2026-08-22T13:00:00.000Z',
          updated_at: '2026-08-22T13:00:00.000Z',
          payload: { type: 'orchestrate-goal', action: 'pm-planning' },
        },
      ],
    });
    const kickProcessing = vi.fn();

    const result = await retry(admin, kickProcessing);

    expect(agentJobs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: 'Job timed out (stale — exceeded max retries)',
      })
    );
    expect(result).toEqual({
      status: 200,
      data: {
        id: 'goal-1',
        status: 'needs_human',
        worker_scope: 'preview',
        job_status: 'failed',
        pickup_requested: false,
        retry_exhausted: true,
        goal_terminal: true,
      },
    });
    expect(admin._tables.goals.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'needs_human',
        data: expect.objectContaining({
          failure_code: 'preview_worker_retry_exhausted',
          failure_stage: 'pm-planning',
          failure_reason: expect.stringContaining('Preview worker stopped'),
        }),
        updated_at: '2026-08-22T13:10:00.000Z',
      })
    );
    expect(admin._goalFailureQuery.eq.mock.calls).toEqual(
      expect.arrayContaining([
        ['id', 'goal-1'],
        ['user_id', user.id],
        ['status', 'feasibility'],
        ['updated_at', '2026-08-22T12:55:00.000Z'],
        ['data', JSON.stringify({ revision: 'goal-snapshot-1' })],
      ])
    );
    expect(admin._tables.goal_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        goal_id: 'goal-1',
        event_type: 'goal_needs_human',
        details: expect.objectContaining({ source: 'preview_stale_worker_recovery' }),
      })
    );
    expect(kickProcessing).not.toHaveBeenCalled();
  });

  it('does not overwrite a concurrent same-status goal edit or terminalize its recoverable lease', async () => {
    const { admin, agentJobs } = makeAdmin({
      goalFailureAllowed: false,
      pickupJobs: [
        {
          id: 'job-goal-1',
          status: 'running',
          retry_count: 2,
          max_retries: 3,
          worker_scope: 'preview',
          created_at: '2026-08-22T13:00:00.000Z',
          updated_at: '2026-08-22T13:00:00.000Z',
          payload: { type: 'orchestrate-goal', action: 'pm-planning' },
        },
      ],
    });
    const kickProcessing = vi.fn();

    const result = await retry(admin, kickProcessing);

    expect(result).toEqual({
      status: 409,
      error: 'The goal changed while its exhausted Preview lease was being recovered',
    });
    expect(admin._goalFailureQuery.eq.mock.calls).toEqual(
      expect.arrayContaining([
        ['updated_at', '2026-08-22T12:55:00.000Z'],
        ['data', JSON.stringify({ revision: 'goal-snapshot-1' })],
      ])
    );
    expect(admin._tables.goal_log.insert).not.toHaveBeenCalled();
    expect(agentJobs.update).not.toHaveBeenCalled();
    expect(kickProcessing).not.toHaveBeenCalled();
  });

  it('leaves the exhausted running lease recoverable when parking the goal errors', async () => {
    const { admin, agentJobs } = makeAdmin({
      goalFailureError: new Error('goal update unavailable'),
      pickupJobs: [
        {
          id: 'job-goal-1',
          status: 'running',
          retry_count: 2,
          max_retries: 3,
          worker_scope: 'preview',
          created_at: '2026-08-22T13:00:00.000Z',
          updated_at: '2026-08-22T13:00:00.000Z',
        },
      ],
    });

    const result = await retry(admin, vi.fn());

    expect(result).toEqual({
      status: 503,
      error: 'The exhausted Preview goal could not be parked safely',
    });
    expect(agentJobs.update).not.toHaveBeenCalled();
  });

  it('restores the exact goal snapshot when exhausted-job terminalization loses its CAS', async () => {
    const originalGoal = {
      id: 'goal-1',
      status: 'feasibility',
      data: { revision: 'goal-snapshot-1' },
      updated_at: '2026-08-22T12:55:00.000Z',
    };
    const { admin, agentJobs } = makeAdmin({
      goal: originalGoal,
      transitionAllowed: false,
      pickupJobs: [
        {
          id: 'job-goal-1',
          status: 'running',
          retry_count: 2,
          max_retries: 3,
          worker_scope: 'preview',
          created_at: '2026-08-22T13:00:00.000Z',
          updated_at: '2026-08-22T13:00:00.000Z',
          payload: { type: 'orchestrate-goal', action: 'pm-planning' },
        },
      ],
    });

    const result = await retry(admin, vi.fn());

    expect(result).toEqual({
      status: 409,
      error: 'This Preview pickup snapshot is no longer current',
    });
    expect(admin._tables.goals.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: 'needs_human' })
    );
    expect(admin._tables.goals.update).toHaveBeenNthCalledWith(2, {
      status: originalGoal.status,
      data: originalGoal.data,
      updated_at: originalGoal.updated_at,
    });
    expect(admin._tables.goals.update.mock.invocationCallOrder[0]).toBeLessThan(
      agentJobs.update.mock.invocationCallOrder[0]
    );
    expect(agentJobs.update.mock.invocationCallOrder[0]).toBeLessThan(
      admin._tables.goals.update.mock.invocationCallOrder[1]
    );
    expect(admin._tables.goal_log.insert).not.toHaveBeenCalled();
  });

  it('keeps the goal parked when a concurrent worker terminalizes the exhausted row', async () => {
    const { admin } = makeAdmin({
      transitionAllowed: false,
      transitionRereadJob: {
        status: 'done',
        updated_at: '2026-08-22T13:10:01.000Z',
      },
      pickupJobs: [
        {
          id: 'job-goal-1',
          status: 'running',
          retry_count: 2,
          max_retries: 3,
          worker_scope: 'preview',
          created_at: '2026-08-22T13:00:00.000Z',
          updated_at: '2026-08-22T13:00:00.000Z',
          payload: { type: 'orchestrate-goal', action: 'pm-planning' },
        },
      ],
    });

    const result = await retry(admin, vi.fn());

    expect(result).toEqual({
      status: 503,
      error:
        'The exhausted Preview goal was parked, but its worker state could not be reconciled. Refresh before retrying.',
    });
    expect(admin._tables.goals.update).toHaveBeenCalledTimes(1);
    expect(admin._tables.goal_log.insert).not.toHaveBeenCalled();
  });

  it('keeps the goal parked when an errored terminalization is proven committed by exact reread', async () => {
    const { admin } = makeAdmin({
      transitionThrows: new Error('response lost after commit'),
      transitionCommitsBeforeThrow: true,
      pickupJobs: [
        {
          id: 'job-goal-1',
          status: 'running',
          retry_count: 2,
          max_retries: 3,
          worker_scope: 'preview',
          created_at: '2026-08-22T13:00:00.000Z',
          updated_at: '2026-08-22T13:00:00.000Z',
          payload: { type: 'orchestrate-goal', action: 'pm-planning' },
        },
      ],
    });

    const result = await retry(admin, vi.fn());

    expect(result).toMatchObject({
      status: 200,
      data: { status: 'needs_human', job_status: 'failed', goal_terminal: true },
    });
    expect(admin._tables.goals.update).toHaveBeenCalledTimes(1);
    expect(admin._tables.goal_log.insert).toHaveBeenCalledTimes(1);
  });

  it('rolls the parked goal back only when exact reread proves terminalization did not commit', async () => {
    const { admin } = makeAdmin({
      transitionThrows: new Error('request rejected before commit'),
      transitionCommitsBeforeThrow: false,
      pickupJobs: [
        {
          id: 'job-goal-1',
          status: 'running',
          retry_count: 2,
          max_retries: 3,
          worker_scope: 'preview',
          created_at: '2026-08-22T13:00:00.000Z',
          updated_at: '2026-08-22T13:00:00.000Z',
        },
      ],
    });

    const result = await retry(admin, vi.fn());

    expect(result).toEqual({
      status: 503,
      error: 'The stale Preview worker lease could not be recovered',
    });
    expect(admin._tables.goals.update).toHaveBeenCalledTimes(2);
    expect(admin._tables.goal_log.insert).not.toHaveBeenCalled();
  });

  it('fails closed when another recovery wins the stale running CAS', async () => {
    const { admin } = makeAdmin({
      transitionAllowed: false,
      pickupJobs: [
        {
          id: 'job-goal-1',
          status: 'running',
          retry_count: 1,
          max_retries: 3,
          worker_scope: 'preview',
          created_at: '2026-08-22T13:00:00.000Z',
          updated_at: '2026-08-22T13:00:00.000Z',
        },
      ],
    });
    const kickProcessing = vi.fn();

    const result = await retry(admin, kickProcessing);

    expect(result).toEqual({
      status: 409,
      error: 'This Preview pickup snapshot is no longer current',
    });
    expect(kickProcessing).not.toHaveBeenCalled();
  });

  it('fails closed when the self-wake cannot be registered', async () => {
    const { admin } = makeAdmin();
    const kickProcessing = vi.fn(async () => ({ mode: 'preview-worker', triggered: false }));

    const result = await retry(admin, kickProcessing);

    expect(result).toEqual({ status: 503, error: 'The Preview worker could not be woken' });
  });

  it('fails closed when the scoped queue cannot be inspected', async () => {
    const { admin } = makeAdmin({ pickupError: new Error('database unavailable') });
    const kickProcessing = vi.fn();

    const result = await retry(admin, kickProcessing);

    expect(result).toEqual({ status: 503, error: 'Unable to inspect the Preview worker queue' });
    expect(kickProcessing).not.toHaveBeenCalled();
  });
});
