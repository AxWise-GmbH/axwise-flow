/**
 * Tests for _helpers.js::computeHistoricalAverages
 *
 * Motivation: the naive `(completed_at - created_at) / jobs` estimator was
 * poisoned by stalled goals — a single goal that sat in `failed` for 10h
 * before being healed and completing would blow up the per-task time average.
 * The helper defends with: per-sample cap, cost-sanity check, and median.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  asArray,
  computeHistoricalAverages,
  deterministicAgentJobId,
  enqueueAgentJob,
  enqueueGoalAction,
  loadOsjaLessonsForAgent,
  loadSketchPromptsForAgent,
  recordLlmUsage,
  finishGoalExecutionApprovalAttempt,
  reserveGoalDiscoveryEstimationAttempt,
  reserveGoalExecutionApproval,
  reserveGoalTeamFormationAttempt,
  reserveGoalToolProvisioningAttempt,
  restoreGoalIfScopeRevision,
  updateGoalIfExecutionAuthorized,
  updateGoalIfDiscoveryEstimationAttempt,
  updateGoalIfNativeScopeBinding,
  updateGoalIfSnapshot,
  updateGoalIfStatus,
  updateGoalIfTeamFormationAttempt,
  updateGoalIfToolProvisioningAttempt,
} from './_helpers.js';

describe('asArray', () => {
  it('normalizes structured acceptance criteria into readable text', () => {
    expect(
      asArray([
        { phase: 0, test: 'Define three Bremen SMB ICPs', type: 'binary' },
        { criterion: 'Price all packages in EUR' },
        'Include a risk matrix',
      ])
    ).toEqual([
      'Define three Bremen SMB ICPs',
      'Price all packages in EUR',
      'Include a risk matrix',
    ]);
  });

  it('uses readable primitive fields instead of object coercion', () => {
    expect(asArray({ owner_role: 'Commercial Risk Analyst', required: true })).toEqual([
      'owner role: Commercial Risk Analyst · required: true',
    ]);
  });
});

function mkGoal({ spent, jobs, createdMinAgo, completedMinAgo }) {
  const now = Date.now();
  return {
    spent_usd: spent,
    plan: { phases: [{ jobs: new Array(jobs).fill({}) }] },
    created_at: new Date(now - createdMinAgo * 60000).toISOString(),
    data:
      completedMinAgo != null
        ? { completed_at: new Date(now - completedMinAgo * 60000).toISOString() }
        : {},
  };
}

describe('computeHistoricalAverages', () => {
  it('returns defaults when no samples', () => {
    const stats = computeHistoricalAverages([]);
    expect(stats.sampleSize).toBe(0);
    expect(stats.avgCostPerTask).toBe(0.015);
    expect(stats.avgTimePerTaskMin).toBe(2.5);
  });

  it('computes median from healthy samples', () => {
    // 3 healthy goals: 3 tasks each, ~3 min total wall-clock
    const goals = [
      mkGoal({ spent: 0.03, jobs: 3, createdMinAgo: 10, completedMinAgo: 7 }), // 1 min/task
      mkGoal({ spent: 0.06, jobs: 3, createdMinAgo: 20, completedMinAgo: 15 }), // 1.67 min/task
      mkGoal({ spent: 0.09, jobs: 3, createdMinAgo: 30, completedMinAgo: 21 }), // 3 min/task
    ];
    const stats = computeHistoricalAverages(goals);
    expect(stats.sampleSize).toBe(3);
    // Median cost-per-task = 0.02 (middle of [0.01, 0.02, 0.03])
    expect(stats.avgCostPerTask).toBeCloseTo(0.02, 5);
    // Median time-per-task should be around 1.67 (middle of [1, 1.67, 3])
    expect(stats.avgTimePerTaskMin).toBeGreaterThan(1);
    expect(stats.avgTimePerTaskMin).toBeLessThan(3);
  });

  it('discards stall-polluted sample (per-task wall-clock > 5 min)', () => {
    // Stalled goal: created 10 hours ago, completed now, 3 tasks
    // Naive: (600 min / 3) = 200 min/task — would blow up average
    // Filtered: this sample contributes no time signal
    const goals = [
      mkGoal({ spent: 0.03, jobs: 3, createdMinAgo: 6, completedMinAgo: 1 }), // 1.67 min/task (healthy)
      mkGoal({ spent: 0.03, jobs: 3, createdMinAgo: 600, completedMinAgo: 0 }), // 200 min/task (stall)
    ];
    const stats = computeHistoricalAverages(goals);
    expect(stats.sampleSize).toBe(2);
    // Only the healthy sample contributes to time average
    expect(stats.avgTimePerTaskMin).toBeLessThan(5);
    expect(stats.avgTimePerTaskMin).toBeCloseTo(1.67, 1);
  });

  it('cost-sanity filter: cheap goals that took forever are rejected', () => {
    // Goal cost $0.003 implies ~0.75 min of real work, not hours
    const goals = [
      mkGoal({ spent: 0.05, jobs: 3, createdMinAgo: 5, completedMinAgo: 1 }), // healthy
      mkGoal({ spent: 0.003, jobs: 3, createdMinAgo: 200, completedMinAgo: 0 }), // cheap + slow = stall
    ];
    const stats = computeHistoricalAverages(goals);
    // Stall sample's time contribution should be filtered out
    expect(stats.avgTimePerTaskMin).toBeLessThan(5);
  });

  it('median resists a single outlier that slipped through', () => {
    const goals = [
      mkGoal({ spent: 0.03, jobs: 3, createdMinAgo: 5, completedMinAgo: 2 }), // 1 min/task
      mkGoal({ spent: 0.03, jobs: 3, createdMinAgo: 10, completedMinAgo: 7 }), // 1 min/task
      mkGoal({ spent: 0.03, jobs: 3, createdMinAgo: 15, completedMinAgo: 12 }), // 1 min/task
      // Outlier just under the cap (4.9 min/task) — slips through the filters
      mkGoal({ spent: 0.03, jobs: 3, createdMinAgo: 15, completedMinAgo: 0.3 }),
    ];
    const stats = computeHistoricalAverages(goals);
    // Median of [1, 1, 1, 4.9] = 1 (robust). Mean would be ~2.0
    expect(stats.avgTimePerTaskMin).toBeLessThanOrEqual(1.5);
  });

  it('skips samples with zero jobs or zero cost', () => {
    const goals = [
      mkGoal({ spent: 0, jobs: 3, createdMinAgo: 5, completedMinAgo: 2 }), // zero cost
      mkGoal({ spent: 0.03, jobs: 0, createdMinAgo: 5, completedMinAgo: 2 }), // zero jobs
      mkGoal({ spent: 0.03, jobs: 2, createdMinAgo: 5, completedMinAgo: 2 }), // ok
    ];
    const stats = computeHistoricalAverages(goals);
    expect(stats.sampleSize).toBe(1);
  });

  it('handles goals with no completed_at (cost only)', () => {
    const goals = [mkGoal({ spent: 0.02, jobs: 2, createdMinAgo: 10, completedMinAgo: null })];
    const stats = computeHistoricalAverages(goals);
    expect(stats.sampleSize).toBe(1);
    expect(stats.avgCostPerTask).toBeCloseTo(0.01, 5);
    expect(stats.avgTimePerTaskMin).toBe(2.5); // default, no time signal
  });
});

function idempotentAdmin(rows, upsert, { lookupError = null } = {}) {
  return {
    from: vi.fn(() => {
      let requestedId = null;
      const lookup = {
        eq: vi.fn((_field, value) => {
          requestedId = value;
          return lookup;
        }),
        maybeSingle: vi.fn(async () => ({
          data: requestedId ? rows.get(requestedId) || null : null,
          error: lookupError,
        })),
      };
      return { upsert, select: vi.fn(() => lookup) };
    }),
  };
}

function goalActionAdmin(insert) {
  return {
    from: vi.fn((table) => {
      if (table === 'goals') {
        const query = {
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: { id: 'goal-1', user_id: 'user-1' },
            error: null,
          })),
        };
        return { select: vi.fn(() => query) };
      }
      const lookup = {
        eq: vi.fn(() => lookup),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      };
      return { insert, select: vi.fn(() => lookup) };
    }),
  };
}

describe('enqueueGoalAction', () => {
  it('canonicalizes a single explicit payload owner onto the durable row and all aliases', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const admin = { from: vi.fn(() => ({ insert })) };

    const result = await enqueueAgentJob(
      admin,
      { payload: { type: 'agent', _userId: ' user-1 ' } },
      { wake: false }
    );

    expect(result).toMatchObject({
      user_id: 'user-1',
      payload: {
        type: 'agent',
        _userId: 'user-1',
        userId: 'user-1',
        user_id: 'user-1',
      },
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining(result));
  });

  it.each([
    ['missing', { payload: { type: 'agent' } }],
    [
      'disagreeing',
      {
        user_id: 'user-1',
        payload: { type: 'agent', _userId: 'user-2' },
      },
    ],
    ['blank', { payload: { type: 'agent', userId: '   ' } }],
  ])('rejects a %s queue owner before touching the database', async (_label, job) => {
    const admin = { from: vi.fn() };
    await expect(enqueueAgentJob(admin, job, { wake: false })).rejects.toMatchObject({
      code: 'AGENT_JOB_OWNER_VALIDATION_ERROR',
    });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('rejects a goal action whose caller-supplied alias disagrees with the live goal owner', async () => {
    const admin = goalActionAdmin(vi.fn());

    await expect(
      enqueueGoalAction(admin, 'execute-phase', 'goal-1', { userId: 'user-2' })
    ).rejects.toMatchObject({ code: 'AGENT_JOB_OWNER_VALIDATION_ERROR' });
    expect(admin.from).not.toHaveBeenCalledWith('agent_jobs');
  });

  it('namespaces idempotent Preview IDs so deployments cannot collapse onto one row', async () => {
    const rows = new Map();
    const upsert = vi.fn(async (row) => {
      if (!rows.has(row.id)) rows.set(row.id, row);
      return { error: null };
    });
    const admin = idempotentAdmin(rows, upsert);
    const triggerProcessNextImpl = vi.fn(() => true);
    const requestedId = deterministicAgentJobId('test-evaluation', { goalId: 'goal-1' });
    const previous = {
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
    };
    process.env.VERCEL_ENV = 'preview';

    try {
      process.env.VERCEL_DEPLOYMENT_ID = 'dpl_a';
      const firstA = await enqueueAgentJob(
        admin,
        {
          id: requestedId,
          user_id: 'user-1',
          payload: { type: 'orchestrate-goal', goalId: 'goal-1' },
        },
        { idempotent: true, triggerProcessNextImpl }
      );
      const secondA = await enqueueAgentJob(
        admin,
        {
          id: requestedId,
          user_id: 'user-1',
          payload: { type: 'orchestrate-goal', goalId: 'goal-1' },
        },
        { idempotent: true, triggerProcessNextImpl }
      );

      process.env.VERCEL_DEPLOYMENT_ID = 'dpl_b';
      const firstB = await enqueueAgentJob(
        admin,
        {
          id: requestedId,
          user_id: 'user-1',
          payload: { type: 'orchestrate-goal', goalId: 'goal-1' },
        },
        { idempotent: true, triggerProcessNextImpl }
      );

      expect(firstA.id).toBe(secondA.id);
      expect(firstB.id).not.toBe(firstA.id);
      expect(rows).toHaveLength(2);
      expect(rows.get(firstA.id)?.payload?._workerDeployment).toBe('vercel-deployment:dpl_a');
      expect(rows.get(firstB.id)?.payload?._workerDeployment).toBe('vercel-deployment:dpl_b');
      expect(triggerProcessNextImpl.mock.calls.map(([arg]) => arg.jobId)).toEqual([
        firstA.id,
        firstA.id,
        firstB.id,
      ]);
    } finally {
      if (previous.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previous.VERCEL_ENV;
      if (previous.VERCEL_DEPLOYMENT_ID === undefined) delete process.env.VERCEL_DEPLOYMENT_ID;
      else process.env.VERCEL_DEPLOYMENT_ID = previous.VERCEL_DEPLOYMENT_ID;
    }
  });

  it('namespaces local idempotent IDs without changing the Production key', async () => {
    const rows = new Map();
    const upsert = vi.fn(async (row) => {
      if (!rows.has(row.id)) rows.set(row.id, row);
      return { error: null };
    });
    const admin = idempotentAdmin(rows, upsert);
    const triggerProcessNextImpl = vi.fn(() => true);
    const requestedId = deterministicAgentJobId('test-evaluation', { goalId: 'goal-1' });
    const previous = {
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV,
    };

    try {
      process.env.VERCEL = '1';
      process.env.VERCEL_ENV = 'production';
      const production = await enqueueAgentJob(
        admin,
        {
          id: requestedId,
          user_id: 'user-1',
          payload: { type: 'orchestrate-goal', goalId: 'goal-1' },
        },
        { idempotent: true, triggerProcessNextImpl }
      );

      delete process.env.VERCEL;
      delete process.env.VERCEL_ENV;
      process.env.NODE_ENV = 'development';
      const firstLocal = await enqueueAgentJob(
        admin,
        {
          id: requestedId,
          user_id: 'user-1',
          payload: { type: 'orchestrate-goal', goalId: 'goal-1' },
        },
        { idempotent: true, triggerProcessNextImpl }
      );
      const secondLocal = await enqueueAgentJob(
        admin,
        {
          id: requestedId,
          user_id: 'user-1',
          payload: { type: 'orchestrate-goal', goalId: 'goal-1' },
        },
        { idempotent: true, triggerProcessNextImpl }
      );

      expect(production.id).toBe(requestedId);
      expect(firstLocal.id).toBe(secondLocal.id);
      expect(firstLocal.id).not.toBe(production.id);
      expect(rows.get(production.id)?.worker_scope).toBe('production');
      expect(rows.get(firstLocal.id)?.worker_scope).toBe('local');
      expect(rows).toHaveLength(2);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('persists the current worker scope and wakes only the inserted chained job', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const admin = goalActionAdmin(insert);
    const triggerProcessNextImpl = vi.fn(() => true);
    const previous = {
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
    };
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_preview_current';

    try {
      await enqueueGoalAction(admin, 'client-approval', 'goal-1', {}, { triggerProcessNextImpl });
    } finally {
      if (previous.VERCEL === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previous.VERCEL;
      if (previous.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previous.VERCEL_ENV;
      if (previous.VERCEL_DEPLOYMENT_ID === undefined) delete process.env.VERCEL_DEPLOYMENT_ID;
      else process.env.VERCEL_DEPLOYMENT_ID = previous.VERCEL_DEPLOYMENT_ID;
    }

    expect(admin.from).toHaveBeenCalledWith('agent_jobs');
    expect(insert).toHaveBeenCalledWith({
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      ),
      status: 'queued',
      user_id: 'user-1',
      worker_scope: 'preview',
      payload: {
        type: 'orchestrate-goal',
        action: 'client-approval',
        goalId: 'goal-1',
        _userId: 'user-1',
        userId: 'user-1',
        user_id: 'user-1',
        _workerDeployment: 'vercel-deployment:dpl_preview_current',
      },
    });
    const insertedJobId = insert.mock.calls[0][0].id;
    expect(triggerProcessNextImpl).toHaveBeenCalledTimes(1);
    expect(triggerProcessNextImpl).toHaveBeenCalledWith({ jobId: insertedJobId });
    expect(triggerProcessNextImpl).not.toHaveBeenCalledWith();
  });

  it('does not wake any worker when the chained insert fails', async () => {
    const insert = vi.fn(async () => ({ error: new Error('database unavailable') }));
    const admin = goalActionAdmin(insert);
    const triggerProcessNextImpl = vi.fn();

    await expect(
      enqueueGoalAction(
        admin,
        'execute-phase',
        'goal-1',
        { phaseIndex: 2 },
        {
          triggerProcessNextImpl,
        }
      )
    ).rejects.toThrow('Unable to enqueue agent job: database unavailable');

    expect(triggerProcessNextImpl).not.toHaveBeenCalled();
  });

  it('accepts a verified jsonb snapshot when PostgreSQL returns payload keys in another order', async () => {
    const rows = new Map();
    const upsert = vi.fn(async (row) => {
      rows.set(row.id, {
        id: row.id,
        user_id: row.user_id,
        status: row.status,
        worker_scope: row.worker_scope,
        payload: {
          nested: { y: 2, x: 1 },
          type: row.payload.type,
          _userId: row.payload._userId,
          userId: row.payload.userId,
          user_id: row.payload.user_id,
        },
      });
      return { error: null };
    });
    const admin = idempotentAdmin(rows, upsert);
    const triggerProcessNextImpl = vi.fn();
    const id = deterministicAgentJobId('ordered-jsonb', { goalId: 'goal-1' });

    const result = await enqueueAgentJob(
      admin,
      {
        id,
        user_id: 'user-1',
        payload: { type: 'orchestrate-goal', nested: { x: 1, y: 2 } },
      },
      { idempotent: true, triggerProcessNextImpl }
    );

    expect(result.id).toBe(id);
    expect(triggerProcessNextImpl).toHaveBeenCalledWith({ jobId: id });
  });

  it.each([
    ['absent', null, null],
    ['unknown', null, { message: 'lookup unavailable' }],
  ])('rejects an idempotent write whose exact row is %s', async (_state, row, lookupError) => {
    const rows = new Map();
    if (row) rows.set(row.id, row);
    const upsert = vi.fn(async () => ({ error: null }));
    const admin = idempotentAdmin(rows, upsert, { lookupError });
    const triggerProcessNextImpl = vi.fn();

    await expect(
      enqueueAgentJob(
        admin,
        {
          id: deterministicAgentJobId('unverified-job', { goalId: 'goal-1' }),
          user_id: 'user-1',
          payload: { type: 'orchestrate-goal', goalId: 'goal-1' },
        },
        { idempotent: true, triggerProcessNextImpl }
      )
    ).rejects.toMatchObject({ code: 'AGENT_JOB_INSERT_UNVERIFIED' });
    expect(triggerProcessNextImpl).not.toHaveBeenCalled();
  });

  it('recovers an ambiguous insert response only after verifying the exact pre-generated row', async () => {
    const rows = new Map();
    const insert = vi.fn(async (row) => {
      rows.set(row.id, {
        id: row.id,
        user_id: row.user_id,
        status: 'queued',
        worker_scope: row.worker_scope,
        payload: { ...row.payload },
      });
      throw new Error('response lost');
    });
    const admin = {
      from: vi.fn(() => {
        let requestedId = null;
        const lookup = {
          eq: vi.fn((_field, value) => {
            requestedId = value;
            return lookup;
          }),
          maybeSingle: vi.fn(async () => ({ data: rows.get(requestedId) || null, error: null })),
        };
        return { insert, select: vi.fn(() => lookup) };
      }),
    };
    const triggerProcessNextImpl = vi.fn();

    const result = await enqueueAgentJob(
      admin,
      { user_id: 'user-1', payload: { type: 'orchestrate-goal', goalId: 'goal-1' } },
      { triggerProcessNextImpl }
    );

    expect(result.id).toBe(insert.mock.calls[0][0].id);
    expect(triggerProcessNextImpl).toHaveBeenCalledWith({ jobId: result.id });
  });

  it('recovers a returned PostgREST error only when the exact row was committed', async () => {
    const rows = new Map();
    const insert = vi.fn(async (row) => {
      rows.set(row.id, {
        id: row.id,
        user_id: row.user_id,
        status: 'queued',
        worker_scope: row.worker_scope,
        payload: { ...row.payload },
      });
      return { error: { message: 'response stream reset', code: 'PGRST000' } };
    });
    const admin = {
      from: vi.fn(() => {
        let requestedId = null;
        const lookup = {
          eq: vi.fn((_field, value) => {
            requestedId = value;
            return lookup;
          }),
          maybeSingle: vi.fn(async () => ({ data: rows.get(requestedId) || null, error: null })),
        };
        return { insert, select: vi.fn(() => lookup) };
      }),
    };
    const triggerProcessNextImpl = vi.fn();

    const result = await enqueueAgentJob(
      admin,
      { user_id: 'user-1', payload: { type: 'orchestrate-goal', goalId: 'goal-1' } },
      { triggerProcessNextImpl }
    );

    expect(result.id).toBe(insert.mock.calls[0][0].id);
    expect(triggerProcessNextImpl).toHaveBeenCalledWith({ jobId: result.id });
  });

  it.each([
    ['rejected', false],
    ['missing an acknowledgement', undefined],
  ])(
    'terminalizes the exact queued Preview row when its exact wake is %s',
    async (_label, triggerResult) => {
      const insert = vi.fn(async () => ({ error: null }));
      let failedPatch = null;
      const terminalizeQuery = {
        eq: vi.fn(() => terminalizeQuery),
        select: vi.fn(() => terminalizeQuery),
        maybeSingle: vi.fn(async () => ({
          data: { id: insert.mock.calls[0][0].id, status: failedPatch.status },
          error: null,
        })),
      };
      const admin = {
        from: vi.fn(() => ({
          insert,
          update: vi.fn((patch) => {
            failedPatch = patch;
            return terminalizeQuery;
          }),
        })),
      };
      const triggerProcessNextImpl = vi.fn(() => triggerResult);
      const env = {
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_DEPLOYMENT_ID: 'dpl_preview_current',
      };

      await expect(
        enqueueAgentJob(
          admin,
          { user_id: 'user-1', payload: { type: 'orchestrate-goal', goalId: 'goal-1' } },
          { env, triggerProcessNextImpl }
        )
      ).rejects.toMatchObject({ code: 'PREVIEW_EXACT_WAKE_UNAVAILABLE' });

      const exactJobId = insert.mock.calls[0][0].id;
      expect(triggerProcessNextImpl).toHaveBeenCalledWith({ jobId: exactJobId, env });
      expect(terminalizeQuery.eq.mock.calls).toEqual(
        expect.arrayContaining([
          ['id', exactJobId],
          ['status', 'queued'],
          ['worker_scope', 'preview'],
          ['payload->>_workerDeployment', 'vercel-deployment:dpl_preview_current'],
        ])
      );
      expect(failedPatch).toMatchObject({ status: 'failed' });
    }
  );
});

// Shared helper: mocks a Supabase admin client whose chain
// `.from().select().eq().eq().order().limit()` resolves to the given rows.
// Used by both lesson and sketch-prompt loader tests — they share the shape.
function makeChainableAdmin(rows) {
  const limit = async () => ({ data: rows, error: null });
  const order = () => ({ limit });
  const query = { eq: () => query, order };
  const select = () => query;
  return { from: vi.fn(() => ({ select })) };
}

describe('loadOsjaLessonsForAgent', () => {
  it('returns an empty array when admin, agentId, or userId is missing', async () => {
    expect(await loadOsjaLessonsForAgent(null, 'agent-1', 'user-1')).toEqual([]);
    expect(await loadOsjaLessonsForAgent(makeChainableAdmin([]), null, 'user-1')).toEqual([]);
    expect(await loadOsjaLessonsForAgent(makeChainableAdmin([]), 'agent-1', null)).toEqual([]);
  });

  it('returns lesson content strings in order', async () => {
    const admin = makeChainableAdmin([
      { content: 'Lesson A', metadata: {} },
      { content: 'Lesson B', metadata: {} },
    ]);
    const lessons = await loadOsjaLessonsForAgent(admin, 'agent-1', 'user-1');
    expect(lessons).toEqual(['Lesson A', 'Lesson B']);
  });

  it('only loads lessons from the validated review schema', async () => {
    const { admin, calls } = makeRecordingAdmin([]);
    await loadOsjaLessonsForAgent(admin, 'agent-1', 'user-1');
    expect(calls.eqs).toContainEqual(['user_id', 'user-1']);
    expect(calls.eqs).toContainEqual(['metadata->>review_validated', 'true']);
  });

  it('returns [] and swallows errors when the query throws', async () => {
    const throwingAdmin = {
      from: () => ({
        select: () => {
          throw new Error('db down');
        },
      }),
    };
    expect(await loadOsjaLessonsForAgent(throwingAdmin, 'agent-1', 'user-1')).toEqual([]);
  });
});

// Flat recorder mock — captures each chain step without deep nesting.
function makeRecordingAdmin(rows = []) {
  const calls = { table: null, eqs: [], order: null };
  const limit = async () => ({ data: rows, error: null });
  const query = {};
  const order = (col, opts) => {
    calls.order = { col, opts };
    return { limit };
  };
  const eq = (k, v) => {
    calls.eqs.push([k, v]);
    return query;
  };
  Object.assign(query, { eq, order });
  const select = () => query;
  const admin = {
    from: (tbl) => {
      calls.table = tbl;
      return { select };
    },
  };
  return { admin, calls };
}

describe('loadSketchPromptsForAgent', () => {
  it('returns an empty array when admin, agentId, or userId is missing', async () => {
    expect(await loadSketchPromptsForAgent(null, 'agent-1', 'user-1')).toEqual([]);
    expect(await loadSketchPromptsForAgent(makeChainableAdmin([]), null, 'user-1')).toEqual([]);
    expect(await loadSketchPromptsForAgent(makeChainableAdmin([]), 'agent-1', null)).toEqual([]);
  });

  it('returns {name, content} records in applied order and drops blanks', async () => {
    const admin = makeChainableAdmin([
      { name: 'Tone guide', content: 'Write concisely.' },
      { name: 'Persona', content: 'You are Atlas.' },
      { name: 'Skip-me', content: '   ' },
      { name: 'Missing body', content: null },
    ]);
    const rows = await loadSketchPromptsForAgent(admin, 'agent-1', 'user-1');
    expect(rows).toEqual([
      { name: 'Tone guide', content: 'Write concisely.' },
      { name: 'Persona', content: 'You are Atlas.' },
    ]);
  });

  it('queries the sketch_prompts table with agent_id + applied status', async () => {
    const { admin, calls } = makeRecordingAdmin([]);
    await loadSketchPromptsForAgent(admin, 'agent-99', 'user-1', 7);
    expect(calls.table).toBe('sketch_prompts');
    expect(calls.eqs).toEqual([
      ['user_id', 'user-1'],
      ['agent_id', 'agent-99'],
      ['status', 'applied'],
    ]);
    expect(calls.order).toEqual({ col: 'applied_at', opts: { ascending: false } });
  });

  it('returns [] and swallows errors when the query throws', async () => {
    const throwingAdmin = {
      from: () => ({
        select: () => {
          throw new Error('db down');
        },
      }),
    };
    expect(await loadSketchPromptsForAgent(throwingAdmin, 'agent-1', 'user-1')).toEqual([]);
  });
});

describe('recordLlmUsage durable attribution', () => {
  function usageAdmin(
    goal,
    {
      task = null,
      agents = [],
      agentBlueprints = [],
      conciliumAgents = [],
      agentJobs = [],
      jobs = [],
      organizations = [],
      agentTeams = [],
      conciliumTeams = [],
      consiliums = [],
      conciliumMembers = [],
      goalUpdateResults = null,
      taskUpdateResults = null,
    } = {}
  ) {
    const calls = { reads: [], inserts: [], updates: [] };
    const queuedGoalUpdateResults = Array.isArray(goalUpdateResults)
      ? [...goalUpdateResults]
      : null;
    const queuedTaskUpdateResults = Array.isArray(taskUpdateResults)
      ? [...taskUpdateResults]
      : null;
    const admin = {
      from: vi.fn((table) => ({
        select: vi.fn(() => {
          const filters = [];
          calls.reads.push({ table, filters });
          const query = {
            eq: vi.fn((column, value) => {
              filters.push([column, value]);
              return query;
            }),
            maybeSingle: vi.fn(async () => {
              const id = filters.find(([column]) => column === 'id')?.[1];
              const userId = filters.find(([column]) => column === 'user_id')?.[1];
              const row =
                table === 'goals'
                  ? goal
                  : table === 'team_tasks'
                    ? task
                    : table === 'agents'
                      ? agents.find((candidate) => candidate.id === id)
                      : table === 'agent_blueprints'
                        ? agentBlueprints.find((candidate) => candidate.id === id)
                        : table === 'concilium_agents'
                          ? conciliumAgents.find((candidate) => candidate.id === id)
                          : table === 'agent_jobs'
                            ? agentJobs.find((candidate) => candidate.id === id)
                            : table === 'jobs'
                              ? jobs.find((candidate) => candidate.id === id)
                              : table === 'organizations'
                                ? organizations.find((candidate) => candidate.id === id)
                                : table === 'agent_teams'
                                  ? agentTeams.find((candidate) => candidate.id === id)
                                  : table === 'concilium_teams'
                                    ? conciliumTeams.find((candidate) => candidate.id === id)
                                    : table === 'consilium'
                                      ? consiliums.find((candidate) => candidate.id === id)
                                      : table === 'concilium_members'
                                        ? conciliumMembers.find((candidate) => candidate.id === id)
                                        : null;
              return {
                data: row?.id === id && row?.user_id === userId ? row : null,
                error: null,
              };
            }),
          };
          return query;
        }),
        insert: vi.fn(async (row) => {
          calls.inserts.push({ table, row });
          return { error: null };
        }),
        update: vi.fn((patch) => {
          const filters = [];
          calls.updates.push({ table, patch, filters });
          const query = {
            eq: vi.fn((column, value) => {
              filters.push([column, value]);
              return query;
            }),
            is: vi.fn((column, value) => {
              filters.push([column, value]);
              return query;
            }),
            select: vi.fn(() => query),
            maybeSingle: vi.fn(async () => ({
              data:
                table === 'goals'
                  ? queuedGoalUpdateResults?.length
                    ? queuedGoalUpdateResults.shift()
                    : { id: goal?.id }
                  : table === 'team_tasks'
                    ? queuedTaskUpdateResults?.length
                      ? queuedTaskUpdateResults.shift()
                      : { id: task?.id }
                    : null,
              error: null,
            })),
            then: (resolve) => Promise.resolve(resolve({ error: null })),
          };
          return query;
        }),
      })),
    };
    return { admin, calls };
  }

  it('requires a durable owner even for otherwise unattributed usage', async () => {
    const { admin, calls } = usageAdmin(null);

    const result = await recordLlmUsage(admin, {
      totalTokens: 5,
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      source: 'queue-finalizer',
    });

    expect(result).toEqual({ recorded: false, reason: 'usage_owner_required' });
    expect(calls.reads).toEqual([]);
    expect(calls.inserts).toEqual([]);
    expect(calls.updates).toEqual([]);
  });

  it('records and rolls up a benign successful call only under the exact goal owner', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const goalId = '22222222-2222-4222-8222-222222222222';
    const { admin, calls } = usageAdmin({
      id: goalId,
      user_id: userId,
      org_id: null,
      agent_team_id: null,
      team_id: null,
      concilium_id: null,
      status: 'active',
      updated_at: '2026-08-24T10:00:00.000Z',
      data: {},
    });

    const result = await recordLlmUsage(admin, {
      userId,
      goalId,
      totalTokens: 42,
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      source: 'benign-run',
    });

    expect(result).toMatchObject({ recorded: true, tokens: 42 });
    expect(calls.inserts.find(({ table }) => table === 'llm_usage')?.row).toMatchObject({
      user_id: userId,
      goal_id: goalId,
      total_tokens: 42,
    });
    expect(
      calls.reads
        .filter(({ table }) => table === 'goals')
        .every(({ filters }) =>
          filters.some(([column, value]) => column === 'user_id' && value === userId)
        )
    ).toBe(true);
    expect(calls.updates.find(({ table }) => table === 'goals')?.filters).toContainEqual([
      'user_id',
      userId,
    ]);
    expect(calls.updates.find(({ table }) => table === 'goals')?.filters).toEqual(
      expect.arrayContaining([
        ['status', 'active'],
        ['updated_at', '2026-08-24T10:00:00.000Z'],
        ['data', '{}'],
      ])
    );
  });

  it('retries an owner-scoped full-snapshot rollup conflict instead of overwriting it', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const goalId = '22222222-2222-4222-8222-222222222222';
    const { admin, calls } = usageAdmin(
      {
        id: goalId,
        user_id: userId,
        org_id: null,
        agent_team_id: null,
        team_id: null,
        concilium_id: null,
        status: 'active',
        updated_at: '2026-08-24T10:00:00.000Z',
        data: { lifecycle_marker: 'preserve-me' },
      },
      { goalUpdateResults: [null, { id: goalId }] }
    );

    await recordLlmUsage(admin, {
      userId,
      goalId,
      totalTokens: 7,
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      source: 'benign-run',
    });

    const goalUpdates = calls.updates.filter(({ table }) => table === 'goals');
    expect(goalUpdates).toHaveLength(2);
    expect(goalUpdates.every(({ filters }) => filters.some(([key]) => key === 'user_id'))).toBe(
      true
    );
    expect(goalUpdates.every(({ filters }) => filters.some(([key]) => key === 'updated_at'))).toBe(
      true
    );
    expect(goalUpdates.every(({ filters }) => filters.some(([key]) => key === 'data'))).toBe(true);
    expect(goalUpdates.at(-1).patch.data).toMatchObject({ lifecycle_marker: 'preserve-me' });
  });

  it('does not attribute a benign successful call to a victim goal', async () => {
    const attackerId = '11111111-1111-4111-8111-111111111111';
    const victimGoalId = '22222222-2222-4222-8222-222222222222';
    const { admin, calls } = usageAdmin({
      id: victimGoalId,
      user_id: '33333333-3333-4333-8333-333333333333',
      data: {},
    });

    const result = await recordLlmUsage(admin, {
      userId: attackerId,
      goalId: victimGoalId,
      totalTokens: 42,
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      source: 'benign-run',
    });

    expect(result).toEqual({ recorded: false, reason: 'usage_goal_owner_mismatch' });
    expect(calls.inserts).toEqual([]);
    expect(calls.updates).toEqual([]);
    expect(calls.reads[0].filters).toContainEqual(['user_id', attackerId]);
  });

  it('quarantines an owned goal whose organization relation resolves to another owner', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const goalId = '22222222-2222-4222-8222-222222222222';
    const organizationId = '66666666-6666-4666-8666-666666666666';
    const { admin, calls } = usageAdmin(
      {
        id: goalId,
        user_id: userId,
        org_id: organizationId,
        agent_team_id: null,
        team_id: null,
        concilium_id: null,
      },
      {
        organizations: [
          {
            id: organizationId,
            user_id: '33333333-3333-4333-8333-333333333333',
          },
        ],
      }
    );

    const result = await recordLlmUsage(admin, {
      userId,
      goalId,
      totalTokens: 8,
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      source: 'benign-run',
    });

    expect(result).toEqual({
      recorded: false,
      reason: 'usage_goal_organization_owner_mismatch',
    });
    expect(calls.reads.find(({ table }) => table === 'organizations')?.filters).toEqual(
      expect.arrayContaining([
        ['id', organizationId],
        ['user_id', userId],
      ])
    );
    expect(calls.inserts).toEqual([]);
    expect(calls.updates).toEqual([]);
  });

  it('rejects a named agent unless it resolves through the exact durable owner', async () => {
    const attackerId = '11111111-1111-4111-8111-111111111111';
    const agentId = '44444444-4444-4444-8444-444444444444';
    const { admin, calls } = usageAdmin(null, {
      agents: [{ id: agentId, user_id: '33333333-3333-4333-8333-333333333333' }],
    });

    const result = await recordLlmUsage(admin, {
      userId: attackerId,
      agentId,
      totalTokens: 5,
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      source: 'agent-history',
    });

    expect(result).toEqual({ recorded: false, reason: 'usage_agent_owner_mismatch' });
    expect(calls.reads.find(({ table }) => table === 'agents')?.filters).toContainEqual([
      'user_id',
      attackerId,
    ]);
    expect(calls.inserts).toEqual([]);
  });

  it('records agent history only after resolving the owned agents row', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const agentId = '44444444-4444-4444-8444-444444444444';
    const { admin, calls } = usageAdmin(null, {
      agents: [{ id: agentId, user_id: userId }],
    });

    const result = await recordLlmUsage(admin, {
      userId,
      agentId,
      totalTokens: 5,
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      source: 'agent-history',
    });

    expect(result).toMatchObject({ recorded: true, tokens: 5 });
    expect(calls.inserts.find(({ table }) => table === 'llm_usage')?.row).toMatchObject({
      user_id: userId,
      agent_id: agentId,
    });
    expect(calls.reads.find(({ table }) => table === 'agents')?.filters).toEqual(
      expect.arrayContaining([
        ['id', agentId],
        ['user_id', userId],
      ])
    );
  });

  it('accepts an explicitly typed owned agent blueprint and rejects unknown tables', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const agentId = '44444444-4444-4444-8444-444444444444';
    const { admin, calls } = usageAdmin(null, {
      agentBlueprints: [{ id: agentId, user_id: userId }],
    });

    const result = await recordLlmUsage(admin, {
      userId,
      agentId,
      agentTable: 'agent_blueprints',
      totalTokens: 5,
      source: 'agent-history',
    });

    expect(result).toMatchObject({ recorded: true, tokens: 5 });
    expect(calls.reads.find(({ table }) => table === 'agent_blueprints')?.filters).toEqual(
      expect.arrayContaining([
        ['id', agentId],
        ['user_id', userId],
      ])
    );
    expect(calls.inserts.find(({ table }) => table === 'llm_usage')?.row.metadata).toMatchObject({
      agent_table: 'agent_blueprints',
    });

    const invalid = await recordLlmUsage(admin, {
      userId,
      agentId,
      agentTable: 'arbitrary_agents',
      totalTokens: 5,
      source: 'agent-history',
    });
    expect(invalid).toEqual({ recorded: false, reason: 'usage_agent_table_invalid' });
  });

  it('validates an explicitly typed concilium agent against the supplied board', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const agentId = '44444444-4444-4444-8444-444444444444';
    const boardId = 'board-owned';
    const { admin, calls } = usageAdmin(null, {
      consiliums: [
        { id: boardId, user_id: userId },
        { id: 'different-board', user_id: userId },
      ],
      conciliumAgents: [{ id: agentId, user_id: userId, board_id: boardId }],
    });

    const result = await recordLlmUsage(admin, {
      userId,
      consiliumId: boardId,
      agentId,
      agentTable: 'concilium_agents',
      totalTokens: 5,
      source: 'pulse-cycle',
    });
    expect(result).toMatchObject({ recorded: true, tokens: 5 });
    expect(calls.reads.find(({ table }) => table === 'concilium_agents')?.filters).toEqual(
      expect.arrayContaining([
        ['id', agentId],
        ['user_id', userId],
      ])
    );

    const mismatched = await recordLlmUsage(admin, {
      userId,
      consiliumId: 'different-board',
      agentId,
      agentTable: 'concilium_agents',
      totalTokens: 5,
      source: 'pulse-cycle',
    });
    expect(mismatched).toEqual({ recorded: false, reason: 'usage_agent_consilium_mismatch' });
  });

  it('requires task agent attribution to match the durable task binding', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const taskId = '55555555-5555-4555-8555-555555555555';
    const attackerAgentId = '44444444-4444-4444-8444-444444444444';
    const { admin, calls } = usageAdmin(null, {
      task: {
        id: taskId,
        user_id: userId,
        goal_id: null,
        job_pool_id: null,
        agent_id: 'durable-agent',
        status: 'inProgress',
        data: {},
        updated_at: '2026-08-24T10:00:00.000Z',
      },
      agents: [{ id: attackerAgentId, user_id: userId }],
    });

    const result = await recordLlmUsage(admin, {
      userId,
      taskId,
      agentId: attackerAgentId,
      agentTable: 'agents',
      totalTokens: 5,
      source: 'execute-task',
    });

    expect(result).toEqual({ recorded: false, reason: 'usage_task_agent_mismatch' });
    expect(calls.inserts).toEqual([]);
  });

  it('validates both the queue job owner and task-to-runtime-job binding', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const queueJobId = '77777777-7777-4777-8777-777777777777';
    const runtimeJobId = 'job-runtime';
    const goalId = '22222222-2222-4222-8222-222222222222';
    const taskId = '55555555-5555-4555-8555-555555555555';
    const task = {
      id: taskId,
      user_id: userId,
      goal_id: goalId,
      job_pool_id: runtimeJobId,
      agent_id: null,
      status: 'inProgress',
      data: { goal_id: goalId },
      updated_at: '2026-08-24T10:00:00.000Z',
    };
    const goal = {
      id: goalId,
      user_id: userId,
      org_id: null,
      agent_team_id: null,
      team_id: null,
      concilium_id: null,
      status: 'active',
      data: {},
      updated_at: '2026-08-24T10:00:00.000Z',
    };
    const { admin, calls } = usageAdmin(goal, {
      task,
      agentJobs: [
        {
          id: queueJobId,
          user_id: userId,
          payload: {
            type: 'execute-task',
            taskId,
            jobId: runtimeJobId,
            goalId,
            _userId: userId,
            userId,
            user_id: userId,
          },
        },
      ],
      jobs: [{ id: runtimeJobId, user_id: userId, goal_id: goalId }],
    });

    const result = await recordLlmUsage(admin, {
      userId,
      goalId,
      taskId,
      jobId: queueJobId,
      runtimeJobId,
      totalTokens: 5,
      updateGoalRollup: false,
      updateTask: false,
    });

    expect(result).toMatchObject({ recorded: true, tokens: 5 });
    expect(calls.inserts.find(({ table }) => table === 'llm_usage')?.row).toMatchObject({
      job_id: queueJobId,
      metadata: expect.objectContaining({ runtime_job_id: runtimeJobId }),
    });
  });

  it('rejects same-tenant usage attribution that disagrees with the durable queue payload', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const queueJobId = '77777777-7777-4777-8777-777777777777';
    const runtimeJobId = 'job-runtime';
    const goalId = '22222222-2222-4222-8222-222222222222';
    const taskId = '55555555-5555-4555-8555-555555555555';
    const goal = {
      id: goalId,
      user_id: userId,
      org_id: null,
      agent_team_id: null,
      team_id: null,
      concilium_id: null,
    };
    const task = {
      id: taskId,
      user_id: userId,
      goal_id: goalId,
      job_pool_id: runtimeJobId,
      agent_id: null,
      status: 'inProgress',
      data: { goal_id: goalId },
      updated_at: '2026-08-24T10:00:00.000Z',
    };
    const { admin, calls } = usageAdmin(goal, {
      task,
      agentJobs: [
        {
          id: queueJobId,
          user_id: userId,
          payload: {
            type: 'execute-task',
            taskId: 'different-owned-task',
            jobId: runtimeJobId,
            goalId,
            user_id: userId,
          },
        },
      ],
      jobs: [{ id: runtimeJobId, user_id: userId, goal_id: goalId }],
    });

    const result = await recordLlmUsage(admin, {
      userId,
      goalId,
      taskId,
      jobId: queueJobId,
      runtimeJobId,
      totalTokens: 5,
    });

    expect(result).toEqual({ recorded: false, reason: 'usage_agent_job_task_mismatch' });
    expect(calls.inserts).toEqual([]);
    expect(calls.updates).toEqual([]);
  });

  it('updates task usage through an owner-scoped full-snapshot CAS with bounded retry', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const taskId = '55555555-5555-4555-8555-555555555555';
    const task = {
      id: taskId,
      user_id: userId,
      goal_id: null,
      status: 'inProgress',
      updated_at: '2026-08-24T10:00:00.000Z',
      data: { execution_claim: { token: 'keep-me' } },
    };
    const { admin, calls } = usageAdmin(null, {
      task,
      taskUpdateResults: [null, { id: taskId }],
    });

    const result = await recordLlmUsage(admin, {
      userId,
      taskId,
      totalTokens: 9,
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      source: 'execute-task',
    });

    expect(result).toMatchObject({ recorded: true, tokens: 9 });
    const taskUpdates = calls.updates.filter(({ table }) => table === 'team_tasks');
    expect(taskUpdates).toHaveLength(2);
    for (const update of taskUpdates) {
      expect(update.filters).toEqual(
        expect.arrayContaining([
          ['user_id', userId],
          ['goal_id', null],
          ['job_pool_id', null],
          ['agent_id', null],
          ['status', 'inProgress'],
          ['updated_at', task.updated_at],
          ['data', JSON.stringify(task.data)],
        ])
      );
      expect(update.patch.data.execution_claim).toEqual({ token: 'keep-me' });
    }
  });
});

describe('updateGoalIfStatus', () => {
  function adminFor(result) {
    const eqs = [];
    const builder = {
      update: vi.fn(() => builder),
      eq: vi.fn((key, value) => {
        eqs.push([key, value]);
        return builder;
      }),
      select: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => result),
    };
    return { admin: { from: vi.fn(() => builder) }, builder, eqs };
  }

  it('updates only the row in the expected lifecycle state', async () => {
    const { admin, eqs } = adminFor({ data: { id: 'goal-1' }, error: null });

    await expect(
      updateGoalIfStatus(admin, 'goal-1', 'awaiting_approval', { status: 'active' })
    ).resolves.toBe(true);
    expect(eqs).toEqual([
      ['id', 'goal-1'],
      ['status', 'awaiting_approval'],
    ]);
  });

  it('returns false when another transition won the race', async () => {
    const { admin } = adminFor({ data: null, error: null });

    await expect(
      updateGoalIfStatus(admin, 'goal-1', 'awaiting_approval', { status: 'active' })
    ).resolves.toBe(false);
  });
});

describe('exact goal and team-formation ownership', () => {
  function adminFor(result) {
    const eqs = [];
    const builder = {
      update: vi.fn(() => builder),
      eq: vi.fn((key, value) => {
        eqs.push([key, value]);
        return builder;
      }),
      select: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => result),
    };
    return { admin: { from: vi.fn(() => builder) }, eqs };
  }

  const goal = {
    id: 'goal-1',
    user_id: 'user-1',
    status: 'forming_team',
    updated_at: '2026-08-24T10:00:00.000Z',
  };

  it('binds a same-status update to the exact goal snapshot', async () => {
    const { admin, eqs } = adminFor({ data: { id: goal.id }, error: null });

    await expect(updateGoalIfSnapshot(admin, goal, { status: 'needs_human' })).resolves.toBe(true);
    expect(eqs).toEqual(
      expect.arrayContaining([
        ['id', goal.id],
        ['user_id', goal.user_id],
        ['status', goal.status],
        ['updated_at', goal.updated_at],
      ])
    );
  });

  it('reserves and persists only the exact team-formation attempt', async () => {
    const attempt = { attempt_id: 'formation-attempt-1' };
    const reservation = adminFor({ data: { id: goal.id }, error: null });
    await expect(
      reserveGoalTeamFormationAttempt(reservation.admin, goal, attempt, {
        status: 'forming_team',
        data: { team_formation_attempt: attempt },
      })
    ).resolves.toBe(true);
    expect(reservation.eqs).toEqual(
      expect.arrayContaining([
        ['id', goal.id],
        ['user_id', goal.user_id],
        ['status', goal.status],
        ['updated_at', goal.updated_at],
      ])
    );

    const outcome = adminFor({ data: { id: goal.id }, error: null });
    await expect(
      updateGoalIfTeamFormationAttempt(outcome.admin, goal.id, 'forming_team', attempt.attempt_id, {
        status: 'provisioning_tools',
      })
    ).resolves.toBe(true);
    expect(outcome.eqs).toEqual(
      expect.arrayContaining([
        ['id', goal.id],
        ['status', 'forming_team'],
        ['data->team_formation_attempt->>attempt_id', attempt.attempt_id],
      ])
    );
  });

  it('chains tool provisioning and estimation through exact completed attempts', async () => {
    const toolGoal = {
      ...goal,
      status: 'provisioning_tools',
      data: {
        team_formation_attempt: {
          version: 'orqaly_team_formation_attempt_v1',
          attempt_id: 'formation-attempt-1',
          status: 'completed',
        },
        tool_provisioning_attempt: {
          version: 'orqaly_tool_provisioning_attempt_v1',
          attempt_id: 'tool-attempt-1',
          team_formation_attempt_id: 'formation-attempt-1',
          status: 'running',
        },
      },
    };
    const toolReservation = adminFor({ data: { id: goal.id }, error: null });
    await expect(
      reserveGoalToolProvisioningAttempt(toolReservation.admin, toolGoal, 'formation-attempt-1', {
        status: 'provisioning_tools',
        data: { tool_provisioning_attempt: { attempt_id: 'tool-attempt-1' } },
      })
    ).resolves.toBe(true);
    expect(toolReservation.eqs).toEqual(
      expect.arrayContaining([
        ['status', 'provisioning_tools'],
        ['updated_at', goal.updated_at],
        ['data->team_formation_attempt->>attempt_id', 'formation-attempt-1'],
        ['data->team_formation_attempt->>status', 'completed'],
      ])
    );

    const toolOutcome = adminFor({ data: { id: goal.id }, error: null });
    await expect(
      updateGoalIfToolProvisioningAttempt(toolOutcome.admin, toolGoal, 'tool-attempt-1', {
        status: 'estimating',
      })
    ).resolves.toBe(true);
    expect(toolOutcome.eqs).toContainEqual([
      'data->tool_provisioning_attempt->>attempt_id',
      'tool-attempt-1',
    ]);

    const discoveryGoal = {
      ...goal,
      status: 'estimating',
      data: {
        team_formation_attempt: {
          version: 'orqaly_team_formation_attempt_v1',
          attempt_id: 'formation-attempt-1',
          status: 'completed',
        },
        tool_provisioning_attempt: {
          version: 'orqaly_tool_provisioning_attempt_v1',
          attempt_id: 'tool-attempt-1',
          team_formation_attempt_id: 'formation-attempt-1',
          status: 'completed',
        },
        discovery_estimation_attempt: {
          version: 'orqaly_discovery_estimation_attempt_v1',
          attempt_id: 'estimation-attempt-1',
          team_formation_attempt_id: 'formation-attempt-1',
          tool_provisioning_attempt_id: 'tool-attempt-1',
          status: 'running',
        },
      },
    };
    const discoveryReservation = adminFor({ data: { id: goal.id }, error: null });
    await expect(
      reserveGoalDiscoveryEstimationAttempt(
        discoveryReservation.admin,
        discoveryGoal,
        'tool-attempt-1',
        {
          status: 'estimating',
          data: { discovery_estimation_attempt: { attempt_id: 'estimation-attempt-1' } },
        }
      )
    ).resolves.toBe(true);
    expect(discoveryReservation.eqs).toEqual(
      expect.arrayContaining([
        ['status', 'estimating'],
        ['updated_at', goal.updated_at],
        ['data->tool_provisioning_attempt->>attempt_id', 'tool-attempt-1'],
        ['data->tool_provisioning_attempt->>status', 'completed'],
      ])
    );

    const discoveryOutcome = adminFor({ data: { id: goal.id }, error: null });
    await expect(
      updateGoalIfDiscoveryEstimationAttempt(
        discoveryOutcome.admin,
        discoveryGoal,
        'estimation-attempt-1',
        { proposal: {} }
      )
    ).resolves.toBe(true);
    expect(discoveryOutcome.eqs).toContainEqual([
      'data->discovery_estimation_attempt->>attempt_id',
      'estimation-attempt-1',
    ]);
  });
});

describe('updateGoalIfNativeScopeBinding', () => {
  function adminFor(result) {
    const eqs = [];
    const nulls = [];
    const builder = {
      update: vi.fn(() => builder),
      eq: vi.fn((key, value) => {
        eqs.push([key, value]);
        return builder;
      }),
      is: vi.fn((key, value) => {
        nulls.push([key, value]);
        return builder;
      }),
      select: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => result),
    };
    return { admin: { from: vi.fn(() => builder) }, eqs, nulls };
  }

  const binding = {
    version: 'orqaly_native_scope_action_binding_v1',
    org_id: 'org-1',
    user_id: 'user-1',
    scope_hash: 'a'.repeat(64),
    research_contract_hash: 'c'.repeat(64),
    research_execution_inputs_hash: 'd'.repeat(64),
    generation: '7',
    scope_updated_at: '2026-08-24T08:00:00.000Z',
    context_snapshot_hash: 'b'.repeat(64),
  };

  it('atomically binds the native scope identity to the lifecycle transition', async () => {
    const { admin, eqs, nulls } = adminFor({ data: { id: 'goal-1' }, error: null });

    await expect(
      updateGoalIfNativeScopeBinding(admin, 'goal-1', 'awaiting_context_approval', binding, {
        status: 'planning',
      })
    ).resolves.toBe(true);
    expect(eqs).toEqual([
      ['id', 'goal-1'],
      ['user_id', binding.user_id],
      ['org_id', binding.org_id],
      ['status', 'awaiting_context_approval'],
      ['data->axwise_customer_intelligence->scope_packet->>scope_hash', binding.scope_hash],
      [
        'data->axwise_customer_intelligence->scope_packet->research_contract->>contract_hash',
        binding.research_contract_hash,
      ],
      [
        'data->axwise_customer_intelligence->>research_execution_inputs_hash',
        binding.research_execution_inputs_hash,
      ],
      ['data->axwise_customer_intelligence->>updated_at', binding.scope_updated_at],
      ['data->goal_approvals->context->>snapshot_hash', binding.context_snapshot_hash],
      ['data->axwise_customer_intelligence->>generation', '7'],
    ]);
    expect(nulls).toEqual([]);
  });

  it('matches a nullable native generation exactly', async () => {
    const { admin, nulls } = adminFor({ data: { id: 'goal-1' }, error: null });

    await expect(
      updateGoalIfNativeScopeBinding(
        admin,
        'goal-1',
        'awaiting_context_approval',
        { ...binding, generation: null },
        { status: 'planning' }
      )
    ).resolves.toBe(true);
    expect(nulls).toEqual([['data->axwise_customer_intelligence->>generation', null]]);
  });

  it('atomically binds approved context, accepted admission, and persisted route for planning', async () => {
    const { admin, eqs } = adminFor({ data: { id: 'goal-1' }, error: null });
    const planningAuthority = {
      context_status: 'approved',
      scope_admission_status: 'accepted',
      scope_hash: binding.scope_hash,
      playbook_id: 'mixed_custom',
      route_version: 'orqaly_work_shape_route_v1',
    };

    await expect(
      updateGoalIfNativeScopeBinding(
        admin,
        'goal-1',
        'planning',
        { ...binding, planning_authority: planningAuthority },
        { status: 'planning' }
      )
    ).resolves.toBe(true);
    expect(eqs).toEqual(
      expect.arrayContaining([
        ['data->goal_approvals->context->>status', 'approved'],
        ['data->scope_admission->>status', 'accepted'],
        ['data->scope_admission->>scope_hash', binding.scope_hash],
        ['data->scope_admission->>playbook_id', 'mixed_custom'],
        ['data->scope_admission->>route_version', 'orqaly_work_shape_route_v1'],
        ['data->work_shape_route->>scope_hash', binding.scope_hash],
        ['data->work_shape_route->>playbook_id', 'mixed_custom'],
        ['data->work_shape_route->>version', 'orqaly_work_shape_route_v1'],
      ])
    );
  });

  it('binds long-running native stage writes to their exact attempt IDs', async () => {
    const { admin, eqs } = adminFor({ data: { id: 'goal-1' }, error: null });

    await expect(
      updateGoalIfNativeScopeBinding(
        admin,
        'goal-1',
        'forming_team',
        {
          ...binding,
          planning_attempt_id: 'planning-attempt-1',
          team_formation_attempt_id: 'formation-attempt-1',
          tool_provisioning_attempt_id: 'tool-attempt-1',
          discovery_estimation_attempt_id: 'estimation-attempt-1',
        },
        { status: 'provisioning_tools' }
      )
    ).resolves.toBe(true);
    expect(eqs).toEqual(
      expect.arrayContaining([
        ['data->native_planning_attempt->>attempt_id', 'planning-attempt-1'],
        ['data->team_formation_attempt->>attempt_id', 'formation-attempt-1'],
        ['data->tool_provisioning_attempt->>attempt_id', 'tool-attempt-1'],
        ['data->discovery_estimation_attempt->>attempt_id', 'estimation-attempt-1'],
      ])
    );
  });

  it('fails closed before querying when immutable native identity is incomplete', async () => {
    const { admin } = adminFor({ data: { id: 'goal-1' }, error: null });

    await expect(
      updateGoalIfNativeScopeBinding(
        admin,
        'goal-1',
        'awaiting_context_approval',
        { ...binding, context_snapshot_hash: null },
        { status: 'planning' }
      )
    ).resolves.toBe(false);
    expect(admin.from).not.toHaveBeenCalled();
  });
});

describe('execution approval attempt CAS', () => {
  function adminFor(result) {
    const eqs = [];
    const updates = [];
    const builder = {
      update: vi.fn((patch) => {
        updates.push(patch);
        return builder;
      }),
      eq: vi.fn((key, value) => {
        eqs.push([key, value]);
        return builder;
      }),
      is: vi.fn((key, value) => {
        eqs.push([key, value]);
        return builder;
      }),
      select: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => result),
    };
    return { admin: { from: vi.fn(() => builder) }, eqs, updates };
  }

  it('reserves Gate 2 against updated_at, the pending snapshot, and native authority', async () => {
    const { admin, eqs, updates } = adminFor({ data: { id: 'goal-1' }, error: null });
    const scopeHash = 'a'.repeat(64);
    const goal = {
      id: 'goal-1',
      user_id: 'user-1',
      org_id: 'org-1',
      updated_at: '2026-08-24T08:00:00.000Z',
      data: {
        goal_approvals: { execution: { status: 'pending', snapshot_hash: 'gate-2-hash' } },
      },
    };
    const nativeBinding = {
      version: 'orqaly_native_scope_action_binding_v1',
      org_id: goal.org_id,
      user_id: goal.user_id,
      scope_hash: scopeHash,
      research_contract_hash: 'c'.repeat(64),
      research_execution_inputs_hash: 'd'.repeat(64),
      generation: '3',
      scope_updated_at: '2026-08-24T07:59:00.000Z',
      context_snapshot_hash: 'gate-1-hash',
      goal_updated_at: goal.updated_at,
      planning_authority: {
        context_status: 'approved',
        scope_admission_status: 'accepted',
        scope_hash: scopeHash,
        playbook_id: 'mixed_custom',
        route_version: 'orqaly_work_shape_route_v1',
      },
    };

    await expect(
      reserveGoalExecutionApproval(admin, goal, {
        snapshotHash: 'gate-2-hash',
        attemptToken: 'attempt-1',
        startedAt: '2026-08-24T08:01:00.000Z',
        nativeBinding,
      })
    ).resolves.toBe(true);

    expect(updates[0]).toMatchObject({
      status: 'authorizing_execution',
      data: {
        execution_approval_attempt: {
          attempt_token: 'attempt-1',
          snapshot_hash: 'gate-2-hash',
          source_goal_updated_at: goal.updated_at,
        },
      },
    });
    expect(eqs).toEqual(
      expect.arrayContaining([
        ['status', 'awaiting_approval'],
        ['updated_at', goal.updated_at],
        ['user_id', goal.user_id],
        ['org_id', goal.org_id],
        ['data->goal_approvals->execution->>status', 'pending'],
        ['data->goal_approvals->execution->>snapshot_hash', 'gate-2-hash'],
        ['data->axwise_customer_intelligence->scope_packet->>scope_hash', scopeHash],
        [
          'data->axwise_customer_intelligence->scope_packet->research_contract->>contract_hash',
          nativeBinding.research_contract_hash,
        ],
        [
          'data->axwise_customer_intelligence->>research_execution_inputs_hash',
          nativeBinding.research_execution_inputs_hash,
        ],
        ['data->scope_admission->>status', 'accepted'],
        ['data->work_shape_route->>playbook_id', 'mixed_custom'],
      ])
    );
  });

  it('fails closed before mutation when the native planning authority tuple is missing', async () => {
    const { admin, updates } = adminFor({ data: { id: 'goal-1' }, error: null });
    const goal = {
      id: 'goal-1',
      updated_at: '2026-08-24T08:00:00.000Z',
      data: {},
    };

    await expect(
      reserveGoalExecutionApproval(admin, goal, {
        snapshotHash: 'gate-2-hash',
        attemptToken: 'attempt-1',
        startedAt: '2026-08-24T08:01:00.000Z',
        nativeBinding: {
          version: 'orqaly_native_scope_action_binding_v1',
          scope_hash: 'scope-hash',
          scope_updated_at: '2026-08-24T07:59:00.000Z',
          context_snapshot_hash: 'gate-1-hash',
          goal_updated_at: goal.updated_at,
        },
      })
    ).resolves.toBe(false);
    expect(updates).toEqual([]);
  });

  it('activates or rolls back only the reservation attempt that owns Gate 2', async () => {
    const { admin, eqs } = adminFor({ data: { id: 'goal-1' }, error: null });

    await expect(
      finishGoalExecutionApprovalAttempt(admin, 'goal-1', {
        attemptToken: 'attempt-1',
        snapshotHash: 'gate-2-hash',
        updates: { status: 'active', data: { approved: true } },
      })
    ).resolves.toBe(true);

    expect(eqs).toEqual([
      ['id', 'goal-1'],
      ['status', 'authorizing_execution'],
      ['data->execution_approval_attempt->>attempt_token', 'attempt-1'],
      ['data->execution_approval_attempt->>snapshot_hash', 'gate-2-hash'],
      ['data->goal_approvals->execution->>snapshot_hash', 'gate-2-hash'],
    ]);
  });
});

describe('restoreGoalIfScopeRevision', () => {
  function adminFor(result) {
    const eqs = [];
    const builder = {
      update: vi.fn(() => builder),
      eq: vi.fn((key, value) => {
        eqs.push([key, value]);
        return builder;
      }),
      select: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => result),
    };
    return { admin: { from: vi.fn(() => builder) }, eqs };
  }

  it('compensates only the exact native revision generation', async () => {
    const { admin, eqs } = adminFor({ data: { id: 'goal-1' }, error: null });

    await expect(
      restoreGoalIfScopeRevision(admin, 'goal-1', 'analyzing', 'revision-2', {
        status: 'awaiting_context_approval',
      })
    ).resolves.toBe(true);
    expect(eqs).toEqual([
      ['id', 'goal-1'],
      ['status', 'analyzing'],
      ['data->scope_revision->>revision_token', 'revision-2'],
      ['data->axwise_customer_intelligence->>status', 'revision_requested'],
    ]);
  });

  it('does not compensate when a newer revision won the race', async () => {
    const { admin } = adminFor({ data: null, error: null });
    await expect(
      restoreGoalIfScopeRevision(admin, 'goal-1', 'analyzing', 'revision-old', {
        status: 'awaiting_context_approval',
      })
    ).resolves.toBe(false);
  });

  it('can bind compensation to the native evidence-refresh lifecycle', async () => {
    const { admin, eqs } = adminFor({ data: { id: 'goal-1' }, error: null });

    await expect(
      restoreGoalIfScopeRevision(
        admin,
        'goal-1',
        'researching_customer',
        'evidence-revision-1',
        { status: 'awaiting_context_approval' },
        'evidence_requested'
      )
    ).resolves.toBe(true);
    expect(eqs).toEqual([
      ['id', 'goal-1'],
      ['status', 'researching_customer'],
      ['data->scope_revision->>revision_token', 'evidence-revision-1'],
      ['data->axwise_customer_intelligence->>status', 'evidence_requested'],
    ]);
  });
});

describe('updateGoalIfExecutionAuthorized', () => {
  function adminFor(result) {
    const eqs = [];
    const builder = {
      update: vi.fn(() => builder),
      eq: vi.fn((key, value) => {
        eqs.push([key, value]);
        return builder;
      }),
      select: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => result),
    };
    return { admin: { from: vi.fn(() => builder) }, eqs };
  }

  it('binds the write to the active goal and both signed approval hashes', async () => {
    const { admin, eqs } = adminFor({ data: { id: 'goal-1' }, error: null });

    await expect(
      updateGoalIfExecutionAuthorized(admin, 'goal-1', 'approved-hash', { data: { safe: true } })
    ).resolves.toBe(true);
    expect(eqs).toEqual([
      ['id', 'goal-1'],
      ['status', 'active'],
      ['data->execution_authorization->>snapshot_hash', 'approved-hash'],
      ['data->goal_approvals->execution->>snapshot_hash', 'approved-hash'],
    ]);
  });

  it('fails closed before querying when the approval hash is absent', async () => {
    const { admin } = adminFor({ data: { id: 'goal-1' }, error: null });

    await expect(
      updateGoalIfExecutionAuthorized(admin, 'goal-1', null, { data: { unsafe: true } })
    ).resolves.toBe(false);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('returns false when status or either signed hash changed', async () => {
    const { admin } = adminFor({ data: null, error: null });

    await expect(
      updateGoalIfExecutionAuthorized(admin, 'goal-1', 'old-hash', { data: { stale: true } })
    ).resolves.toBe(false);
  });
});
