import { describe, expect, it, vi } from 'vitest';

import { handleLifecycle } from './goals.js';
import {
  acceptedNativeGoalFixture,
  initialNativeScopeAdmissionGoalFixture,
} from '../_shared/native-goal-authority.test-fixture.js';

const user = { id: 'user-1' };

function makeAdmin(
  goal,
  { transition = true, rollback = true, queueError = null, queueInspectionError = null } = {}
) {
  const updates = [];
  const jobs = [];
  const logs = [];
  const cas = [];

  const initialGoalQuery = {
    eq: vi.fn(function () {
      return this;
    }),
    single: vi.fn(async () => ({ data: goal, error: null })),
  };

  const tables = {
    goals: {
      select: vi.fn(() => initialGoalQuery),
      update: vi.fn((patch) => {
        const updateIndex = updates.length;
        updates.push(patch);
        const predicates = [];
        cas.push(predicates);
        return {
          eq: vi.fn(function (column, value) {
            predicates.push([column, value]);
            return this;
          }),
          select: vi.fn(function () {
            return this;
          }),
          maybeSingle: vi.fn(async () => {
            const succeeded = updateIndex === 0 ? transition : rollback;
            return {
              data: succeeded ? { id: goal.id, status: patch.status } : null,
              error: null,
            };
          }),
        };
      }),
    },
    agent_jobs: {
      insert: vi.fn(async (row) => {
        jobs.push(row);
        return { error: queueError };
      }),
      select: vi.fn(() => {
        const query = {
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({ data: null, error: queueInspectionError })),
        };
        return query;
      }),
    },
    goal_log: {
      insert: vi.fn(async (row) => {
        logs.push(row);
        return { error: null };
      }),
    },
  };

  return {
    from: vi.fn((table) => tables[table]),
    __debug: { cas, jobs, logs, updates },
  };
}

function pausedFeasibilityAdjustGoal(overrides = {}) {
  return {
    id: 'goal-1',
    status: 'paused',
    loop_enabled: false,
    loop_paused: false,
    plan: {},
    feasibility_report: { recommendation: 'adjust' },
    data: {},
    ...overrides,
  };
}

describe('goal lifecycle resume', () => {
  it('resumes a paused pre-plan goal at po-analysis eligibility without empty completion drift', async () => {
    const admin = makeAdmin(pausedFeasibilityAdjustGoal());
    const kickProcessing = vi.fn(async () => ({ mode: 'test', triggered: true }));

    const result = await handleLifecycle(admin, user, { id: 'goal-1' }, 'active', {
      kickProcessing,
    });

    expect(result).toEqual({
      status: 200,
      data: { id: 'goal-1', status: 'feasibility', resume_action: 'po-analysis' },
    });
    expect(admin.__debug.updates[0]).toMatchObject({ status: 'feasibility' });
    expect(admin.__debug.cas).toEqual([
      [
        ['id', 'goal-1'],
        ['user_id', 'user-1'],
        ['status', 'paused'],
      ],
    ]);
    expect(admin.__debug.jobs).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        status: 'queued',
        user_id: user.id,
        worker_scope: 'production',
        payload: {
          type: 'orchestrate-goal',
          goalId: 'goal-1',
          action: 'po-analysis',
          _userId: user.id,
          userId: user.id,
          user_id: user.id,
        },
      }),
    ]);
    expect(admin.__debug.jobs).not.toContainEqual(
      expect.objectContaining({ payload: expect.objectContaining({ action: 'complete' }) })
    );
    expect(admin.__debug.logs).toEqual([
      {
        goal_id: 'goal-1',
        event_type: 'goal_active',
        details: {
          previousStatus: 'paused',
          persistedStatus: 'feasibility',
          resumeAction: 'po-analysis',
        },
      },
    ]);
    expect(kickProcessing).toHaveBeenCalledWith(admin, 'goal-1', {
      jobId: admin.__debug.jobs[0].id,
    });
    expect(kickProcessing).not.toHaveBeenCalledWith(admin, 'goal-1');
  });

  it.each([
    ['missing feasibility report', { feasibility_report: null }],
    [
      'non-adjust feasibility recommendation',
      { feasibility_report: { recommendation: 'proceed' } },
    ],
    [
      'unstarted Smart Request admission',
      { data: { smart_request_admission: { status: 'draft' } } },
    ],
  ])('rejects a zero-plan resume with %s before mutation', async (_label, overrides) => {
    const admin = makeAdmin(pausedFeasibilityAdjustGoal(overrides));
    const kickProcessing = vi.fn();

    const result = await handleLifecycle(admin, user, { id: 'goal-1' }, 'active', {
      kickProcessing,
    });

    expect(result).toMatchObject({
      status: 409,
      error: expect.stringContaining('originating gate'),
    });
    expect(admin.__debug.updates).toEqual([]);
    expect(admin.__debug.jobs).toEqual([]);
    expect(admin.__debug.logs).toEqual([]);
    expect(kickProcessing).not.toHaveBeenCalled();
  });

  it('rolls a pre-plan resume back to paused when its worker job cannot be queued', async () => {
    const admin = makeAdmin(pausedFeasibilityAdjustGoal(), {
      queueError: new Error('queue unavailable'),
    });
    const kickProcessing = vi.fn();

    const result = await handleLifecycle(admin, user, { id: 'goal-1' }, 'active', {
      kickProcessing,
    });

    expect(result).toMatchObject({
      status: 503,
      error: expect.stringContaining('remains paused'),
    });
    expect(admin.__debug.updates.map(({ status }) => status)).toEqual(['feasibility', 'paused']);
    expect(admin.__debug.cas).toEqual([
      [
        ['id', 'goal-1'],
        ['user_id', 'user-1'],
        ['status', 'paused'],
      ],
      [
        ['id', 'goal-1'],
        ['user_id', 'user-1'],
        ['status', 'feasibility'],
        ['updated_at', expect.any(String)],
      ],
    ]);
    expect(admin.__debug.jobs).toHaveLength(1);
    expect(admin.__debug.logs).toEqual([]);
    expect(kickProcessing).not.toHaveBeenCalled();
  });

  it('fails closed when enqueue recovery loses its rollback CAS', async () => {
    const admin = makeAdmin(pausedFeasibilityAdjustGoal(), {
      queueError: new Error('queue unavailable'),
      rollback: false,
    });
    const kickProcessing = vi.fn();

    const result = await handleLifecycle(admin, user, { id: 'goal-1' }, 'active', {
      kickProcessing,
    });

    expect(result).toMatchObject({
      status: 503,
      error: expect.stringContaining('status changed during recovery'),
    });
    expect(admin.__debug.updates.map(({ status }) => status)).toEqual(['feasibility', 'paused']);
    expect(admin.__debug.logs).toEqual([]);
    expect(kickProcessing).not.toHaveBeenCalled();
  });

  it('does not roll lifecycle state back when the exact enqueue outcome is unknown', async () => {
    const admin = makeAdmin(pausedFeasibilityAdjustGoal(), {
      queueError: new Error('insert response lost'),
      queueInspectionError: new Error('exact readback unavailable'),
    });
    const kickProcessing = vi.fn();

    const result = await handleLifecycle(admin, user, { id: 'goal-1' }, 'active', {
      kickProcessing,
    });

    expect(result).toMatchObject({
      status: 503,
      error: expect.stringContaining('enqueue outcome is unknown'),
    });
    expect(admin.__debug.updates).toHaveLength(1);
    expect(admin.__debug.updates[0]).toMatchObject({ status: 'feasibility' });
    expect(kickProcessing).not.toHaveBeenCalled();
  });

  it('does not enqueue or audit a stale pre-plan resume when the status CAS loses', async () => {
    const admin = makeAdmin(pausedFeasibilityAdjustGoal(), { transition: false });
    const kickProcessing = vi.fn();

    const result = await handleLifecycle(admin, user, { id: 'goal-1' }, 'active', {
      kickProcessing,
    });

    expect(result).toMatchObject({ status: 409 });
    expect(admin.__debug.jobs).toEqual([]);
    expect(admin.__debug.logs).toEqual([]);
    expect(kickProcessing).not.toHaveBeenCalled();
  });

  it('rejects the draft pause-then-resume bypass before either mutation', async () => {
    const admin = makeAdmin({
      id: 'goal-draft',
      status: 'draft',
      loop_enabled: false,
      loop_paused: false,
      plan: {},
      feasibility_report: null,
      data: { smart_request_admission: { status: 'draft' } },
    });
    const kickProcessing = vi.fn();

    const pauseResult = await handleLifecycle(admin, user, { id: 'goal-draft' }, 'paused', {
      kickProcessing,
    });
    const resumeResult = await handleLifecycle(admin, user, { id: 'goal-draft' }, 'active', {
      kickProcessing,
    });

    expect(pauseResult).toMatchObject({ status: 409 });
    expect(resumeResult).toMatchObject({ status: 409 });
    expect(admin.__debug.updates).toEqual([]);
    expect(admin.__debug.jobs).toEqual([]);
    expect(admin.__debug.logs).toEqual([]);
    expect(kickProcessing).not.toHaveBeenCalled();
  });

  it('preserves the supported active-to-paused lifecycle transition', async () => {
    const admin = makeAdmin({
      id: 'goal-active',
      status: 'active',
      loop_enabled: false,
      loop_paused: false,
      plan: { phases: [{ status: 'pending' }] },
    });
    const kickProcessing = vi.fn();

    const result = await handleLifecycle(admin, user, { id: 'goal-active' }, 'paused', {
      kickProcessing,
    });

    expect(result).toEqual({ status: 200, data: { id: 'goal-active', status: 'paused' } });
    expect(admin.__debug.updates[0]).toMatchObject({ status: 'paused' });
    expect(admin.__debug.jobs).toEqual([]);
    expect(admin.__debug.logs).toEqual([
      {
        goal_id: 'goal-active',
        event_type: 'goal_paused',
        details: { previousStatus: 'active', persistedStatus: 'paused' },
      },
    ]);
    expect(kickProcessing).not.toHaveBeenCalled();
  });

  it('preserves the supported paused planned-goal resume transition', async () => {
    const admin = makeAdmin({
      id: 'goal-planned',
      status: 'paused',
      loop_enabled: false,
      loop_paused: false,
      plan: { phases: [{ status: 'pending' }] },
    });
    const kickProcessing = vi.fn(async () => ({ mode: 'test', triggered: true }));

    const result = await handleLifecycle(admin, user, { id: 'goal-planned' }, 'active', {
      kickProcessing,
    });

    expect(result).toEqual({
      status: 200,
      data: { id: 'goal-planned', status: 'active', resume_action: 'execute-phase' },
    });
    expect(admin.__debug.updates[0]).toMatchObject({ status: 'active' });
    expect(admin.__debug.jobs).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        status: 'queued',
        user_id: user.id,
        worker_scope: 'production',
        payload: {
          type: 'orchestrate-goal',
          goalId: 'goal-planned',
          action: 'execute-phase',
          phaseIndex: 0,
          _userId: user.id,
          userId: user.id,
          user_id: user.id,
        },
      }),
    ]);
    expect(kickProcessing).toHaveBeenCalledWith(admin, 'goal-planned', {
      jobId: admin.__debug.jobs[0].id,
    });
    expect(kickProcessing).not.toHaveBeenCalledWith(admin, 'goal-planned');
  });

  it('resumes a zero-plan native goal only through canonical PM planning', async () => {
    const nativeGoal = acceptedNativeGoalFixture({
      id: 'goal-native-paused',
      status: 'paused',
      plan: { phases: [] },
    });
    const admin = makeAdmin(nativeGoal);
    const kickProcessing = vi.fn(async () => ({ mode: 'test', triggered: true }));

    const result = await handleLifecycle(admin, user, { id: nativeGoal.id }, 'active', {
      kickProcessing,
    });

    expect(result).toEqual({
      status: 200,
      data: { id: nativeGoal.id, status: 'planning', resume_action: 'pm-planning' },
    });
    expect(admin.__debug.updates[0]).toMatchObject({
      status: 'planning',
      data: expect.objectContaining({
        goal_approvals: expect.objectContaining({
          context: expect.objectContaining({ status: 'approved' }),
        }),
      }),
    });
    expect(admin.__debug.jobs[0].payload).toMatchObject({
      action: 'pm-planning',
      goalId: nativeGoal.id,
    });
    expect(admin.__debug.jobs[0].payload.action).not.toBe('po-analysis');
  });

  it('resumes an actual pending native correction through its exact scope generation', async () => {
    const nativeGoal = acceptedNativeGoalFixture({
      id: 'goal-native-revision-paused',
      status: 'paused',
      plan: { phases: [] },
    });
    nativeGoal.data.scope_revision = {
      version: 'orqaly_scope_revision_v1',
      status: 'pending_rebuild',
      revision_token: 'revision-resume-current',
    };
    const admin = makeAdmin(nativeGoal);
    const kickProcessing = vi.fn(async () => ({ mode: 'test', triggered: true }));

    const result = await handleLifecycle(admin, user, { id: nativeGoal.id }, 'active', {
      kickProcessing,
    });

    expect(result).toEqual({
      status: 200,
      data: { id: nativeGoal.id, status: 'analyzing', resume_action: 'scope-admission' },
    });
    expect(admin.__debug.jobs[0].payload).toMatchObject({
      action: 'scope-admission',
      goalId: nativeGoal.id,
      scope_revision_token: 'revision-resume-current',
    });
  });

  it('resumes a pre-packet native Smart Request at its exact initial scope admission', async () => {
    const nativeGoal = initialNativeScopeAdmissionGoalFixture({
      id: 'goal-initial-native-paused',
      status: 'paused',
      data: {
        smart_request_admission: {
          version: 1,
          status: 'started',
          started_at: '2026-08-24T07:59:00.000Z',
        },
      },
    });
    const admin = makeAdmin(nativeGoal);
    const kickProcessing = vi.fn(async () => ({ mode: 'test', triggered: true }));

    const result = await handleLifecycle(admin, user, { id: nativeGoal.id }, 'active', {
      kickProcessing,
    });

    expect(result).toEqual({
      status: 200,
      data: { id: nativeGoal.id, status: 'analyzing', resume_action: 'scope-admission' },
    });
    expect(admin.__debug.jobs[0].payload).toMatchObject({
      action: 'scope-admission',
      goalId: nativeGoal.id,
    });
    expect(admin.__debug.jobs[0].payload).not.toHaveProperty('scope_revision_token');
    expect(admin.__debug.cas[0]).toEqual(
      expect.arrayContaining([
        ['updated_at', nativeGoal.updated_at],
        ['data->smart_request_admission->>status', 'started'],
        ['data->smart_request_admission->>started_at', '2026-08-24T07:59:00.000Z'],
        ['data->scope_admission->>status', 'queued'],
      ])
    );
  });

  it('does not resume damaged native state through a legacy pre-plan path', async () => {
    const nativeGoal = acceptedNativeGoalFixture({
      id: 'goal-native-damaged-paused',
      status: 'paused',
      plan: { phases: [] },
    });
    nativeGoal.data.axwise_customer_intelligence.scope_packet = null;
    const admin = makeAdmin(nativeGoal);

    const result = await handleLifecycle(admin, user, { id: nativeGoal.id }, 'active');

    expect(result).toMatchObject({ status: 409 });
    expect(admin.__debug.updates).toEqual([]);
    expect(admin.__debug.jobs).toEqual([]);
  });
});
