import { afterEach, describe, expect, it, vi } from 'vitest';

import * as h00 from './h00-terminal-llm-error.js';
import * as h01 from './h01-transient-error.js';
import * as h02 from './h02-llm-json-fallback.js';
import * as h03 from './h03-no-jobs-reform.js';
import * as h04 from './h04-stuck-no-queue.js';
import * as h99 from './h99-escalate.js';

function goal(overrides = {}) {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    title: 'Exact recovery goal',
    status: 'failed',
    updated_at: '2026-08-22T12:00:00.000Z',
    plan: { phases: [{ name: 'P1', status: 'pending' }] },
    data: {},
    ...overrides,
  };
}

function valueAt(row, column) {
  if (column === 'data->>last_heal_strategy') return row.data?.last_heal_strategy;
  if (column === 'data->>last_heal_at') return row.data?.last_heal_at;
  if (column.startsWith('payload->>')) return row.payload?.[column.slice('payload->>'.length)];
  return row[column];
}

function exactAdmin(
  initialGoal,
  {
    transitionRace = null,
    transitionError = null,
    transitionWriteMode = 'success',
    rollbackWriteMode = 'success',
    goalReadError = null,
    insertMode = 'success',
    teamTaskDeleteError = null,
    jobTerminalRace = null,
    jobTerminalMode = 'success',
  } = {}
) {
  const state = {
    goal: structuredClone(initialGoal),
    jobs: new Map(),
    updates: [],
    inserts: [],
    deletes: [],
    jobUpdates: [],
    firstGoalUpdate: true,
    rollbackWriteAttempts: 0,
  };

  const goals = {
    update(patch) {
      const filters = new Map();
      let evaluated = false;
      let result;
      const evaluate = async () => {
        if (evaluated) return result;
        evaluated = true;
        state.updates.push({ patch, filters: Object.fromEntries(filters) });

        const initialTransition = state.firstGoalUpdate;
        if (initialTransition) {
          state.firstGoalUpdate = false;
          if (transitionError) {
            result = { data: null, error: new Error(transitionError) };
            return result;
          }
          if (transitionRace === 'cancel') {
            state.goal = {
              ...state.goal,
              status: 'cancelled',
              updated_at: '2026-08-22T12:01:00.000Z',
              data: { ...state.goal.data, cancelled_by: 'user-1' },
            };
            result = { data: null, error: null };
            return result;
          }
          if (transitionRace === 'same-status-edit') {
            state.goal = {
              ...state.goal,
              updated_at: '2026-08-22T12:01:00.000Z',
              data: { ...state.goal.data, owner_note: 'edited concurrently' },
            };
            result = { data: null, error: null };
            return result;
          }
        }

        const matches = [...filters].every(
          ([column, expected]) => valueAt(state.goal, column) === expected
        );
        if (!matches) {
          result = { data: null, error: null };
          return result;
        }
        if (!initialTransition) {
          state.rollbackWriteAttempts += 1;
          if (rollbackWriteMode === 'error-original-once' && state.rollbackWriteAttempts === 1) {
            result = { data: null, error: new Error('rollback rejected before commit') };
            return result;
          }
        }
        state.goal = { ...state.goal, ...structuredClone(patch) };
        const writeMode = initialTransition ? transitionWriteMode : rollbackWriteMode;
        if (writeMode === 'commit-then-throw') {
          throw new Error('goal transition response lost');
        }
        if (writeMode === 'commit-then-error') {
          result = { data: null, error: new Error('goal transition response lost') };
          return result;
        }
        result = {
          data: {
            id: state.goal.id,
            status: state.goal.status,
            updated_at: state.goal.updated_at,
          },
          error: null,
        };
        return result;
      };
      const chain = {
        eq(column, expected) {
          filters.set(column, expected);
          return chain;
        },
        select() {
          return chain;
        },
        maybeSingle: evaluate,
      };
      return chain;
    },
    select() {
      const filters = new Map();
      const chain = {
        eq(column, expected) {
          filters.set(column, expected);
          return chain;
        },
        async maybeSingle() {
          if (goalReadError) return { data: null, error: new Error(goalReadError) };
          const matches = [...filters].every(
            ([column, expected]) => valueAt(state.goal, column) === expected
          );
          return {
            data: matches ? structuredClone(state.goal) : null,
            error: null,
          };
        },
      };
      return chain;
    },
  };

  const agentJobs = {
    async insert(row) {
      state.inserts.push({ table: 'agent_jobs', row });
      if (insertMode === 'failure') return { data: null, error: new Error('queue unavailable') };
      state.jobs.set(
        row.id,
        structuredClone({
          ...row,
          user_id: row.user_id || row.payload?._userId || null,
        })
      );
      if (insertMode === 'commit-then-throw') throw new Error('response lost after commit');
      return { data: null, error: null };
    },
    update(patch) {
      const filters = new Map();
      let evaluated = false;
      let result;
      const evaluate = async () => {
        if (evaluated) return result;
        evaluated = true;
        const target = state.jobs.get(filters.get('id'));
        state.jobUpdates.push({ patch, filters: Object.fromEntries(filters) });
        if (target && jobTerminalRace === 'claimed') {
          state.jobs.set(target.id, {
            ...target,
            status: 'running',
            updated_at: '2026-08-22T12:02:00.000Z',
          });
          result = { data: null, error: null };
          return result;
        }
        if (target && jobTerminalMode === 'error-original') {
          result = { data: null, error: new Error('terminal response failed before commit') };
          return result;
        }
        const matches = target
          ? [...filters].every(([column, expected]) => valueAt(target, column) === expected)
          : false;
        if (!matches) {
          result = { data: null, error: null };
          return result;
        }
        const updated = { ...target, ...structuredClone(patch) };
        state.jobs.set(updated.id, updated);
        if (jobTerminalMode === 'commit-then-throw') {
          throw new Error('terminal response lost');
        }
        if (jobTerminalMode === 'commit-then-error') {
          result = { data: null, error: new Error('terminal response lost') };
          return result;
        }
        result = {
          data: { id: updated.id, status: updated.status, updated_at: updated.updated_at },
          error: null,
        };
        return result;
      };
      const chain = {
        eq(column, expected) {
          filters.set(column, expected);
          return chain;
        },
        select() {
          return chain;
        },
        maybeSingle: evaluate,
      };
      return chain;
    },
    select() {
      let id = null;
      const chain = {
        eq(column, expected) {
          if (column === 'id') id = expected;
          return chain;
        },
        async maybeSingle() {
          return { data: state.jobs.get(id) || null, error: null };
        },
      };
      return chain;
    },
  };

  const admin = {
    _state: state,
    from(table) {
      if (table === 'goals') return goals;
      if (table === 'agent_jobs') return agentJobs;
      if (table === 'goal_log' || table === 'notification_log') {
        return {
          async insert(row) {
            state.inserts.push({ table, row });
            return { data: { id: `${table}-1` }, error: null };
          },
        };
      }
      if (table === 'team_tasks') {
        return {
          delete() {
            return {
              async eq() {
                state.deletes.push({ table: 'team_tasks' });
                return {
                  error: teamTaskDeleteError ? new Error(teamTaskDeleteError) : null,
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
  return admin;
}

const cases = [
  {
    name: 'h00',
    strategy: h00,
    goal: () => goal({ data: { failure_reason: 'invalid_api_key', failure_stage: 'pm-planning' } }),
  },
  {
    name: 'h01',
    strategy: h01,
    goal: () => goal({ data: { failure_reason: 'timeout', failure_stage: 'po-analysis' } }),
  },
  {
    name: 'h02',
    strategy: h02,
    goal: () => goal({ data: { failure_reason: 'parse error', failure_stage: 'pm-planning' } }),
  },
  {
    name: 'h03',
    strategy: h03,
    goal: () =>
      goal({
        plan: { phases: [{ name: 'P1', status: 'executing' }] },
        data: { failure_reason: 'no jobs found', failure_stage: 'evaluate-phase' },
      }),
  },
  {
    name: 'h04',
    strategy: h04,
    goal: () => goal({ status: 'planning' }),
  },
  {
    name: 'h99',
    strategy: h99,
    goal: () => goal({ data: { failure_reason: 'unknown', heal_attempts: 6 } }),
  },
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('exact self-healer transitions', () => {
  it.each(cases)(
    '$name skips a concurrently cancelled snapshot without side effects',
    async (c) => {
      const selected = c.goal();
      const admin = exactAdmin(selected, { transitionRace: 'cancel' });
      const triggerProcessNextImpl = vi.fn(() => true);

      const result = await c.strategy.apply(admin, selected, {
        log: null,
        otherStrategiesTried: [],
        triggerProcessNextImpl,
      });

      expect(result.action).toBe('skipped');
      expect(admin._state.goal).toMatchObject({
        status: 'cancelled',
        updated_at: '2026-08-22T12:01:00.000Z',
        data: expect.objectContaining({ cancelled_by: 'user-1' }),
      });
      expect(admin._state.updates[0].filters).toMatchObject({
        id: 'goal-1',
        user_id: 'user-1',
        status: selected.status,
        updated_at: selected.updated_at,
      });
      expect(admin._state.jobs.size).toBe(0);
      expect(admin._state.inserts).toEqual([]);
      expect(admin._state.deletes).toEqual([]);
      expect(triggerProcessNextImpl).not.toHaveBeenCalled();
    }
  );

  it.each(cases)('$name skips a concurrent same-status edit without side effects', async (c) => {
    const selected = c.goal();
    const admin = exactAdmin(selected, { transitionRace: 'same-status-edit' });
    const triggerProcessNextImpl = vi.fn(() => true);

    const result = await c.strategy.apply(admin, selected, {
      log: null,
      otherStrategiesTried: [],
      triggerProcessNextImpl,
    });

    expect(result.action).toBe('skipped');
    expect(admin._state.goal).toMatchObject({
      status: selected.status,
      updated_at: '2026-08-22T12:01:00.000Z',
      data: expect.objectContaining({ owner_note: 'edited concurrently' }),
    });
    expect(admin._state.jobs.size).toBe(0);
    expect(admin._state.inserts).toEqual([]);
    expect(triggerProcessNextImpl).not.toHaveBeenCalled();
  });

  it('treats a transition database error as skipped and never enqueues', async () => {
    const selected = cases[1].goal();
    const admin = exactAdmin(selected, { transitionError: 'database unavailable' });
    const triggerProcessNextImpl = vi.fn(() => true);

    const result = await h01.apply(admin, selected, { log: null, triggerProcessNextImpl });

    expect(result).toMatchObject({ action: 'skipped', reason: 'database unavailable' });
    expect(admin._state.jobs.size).toBe(0);
    expect(admin._state.inserts).toEqual([]);
    expect(triggerProcessNextImpl).not.toHaveBeenCalled();
  });

  it.each(['commit-then-throw', 'commit-then-error'])(
    'continues after a %s goal transition response loss is verified as committed',
    async (transitionWriteMode) => {
      const selected = cases[1].goal();
      const admin = exactAdmin(selected, { transitionWriteMode });
      const triggerProcessNextImpl = vi.fn(() => true);

      const result = await h01.apply(admin, selected, { log: null, triggerProcessNextImpl });

      expect(result.action).toBe('resumed');
      expect(admin._state.goal).toMatchObject({
        status: 'analyzing',
        data: expect.objectContaining({ last_heal_strategy: 'h01-transient-error' }),
      });
      expect(admin._state.jobs.size).toBe(1);
      expect(triggerProcessNextImpl).toHaveBeenCalledTimes(1);
    }
  );

  it('fails closed when a transition error cannot be reconciled by reread', async () => {
    const selected = cases[1].goal();
    const admin = exactAdmin(selected, {
      transitionError: 'database unavailable',
      goalReadError: 'reread unavailable',
    });

    await expect(h01.apply(admin, selected, { log: null })).rejects.toThrow(
      'transition outcome could not be verified'
    );
    expect(admin._state.jobs.size).toBe(0);
    expect(admin._state.inserts).toEqual([]);
  });
});

describe('durable self-healer continuation', () => {
  it('recovers a stuck scope-first Smart Request through scope admission', async () => {
    const selected = goal({
      status: 'analyzing',
      data: {
        scope_admission: {
          version: 1,
          native_scope: true,
          status: 'queued',
          state_key: 'axwise_customer_intelligence',
        },
        scope_revision: {
          version: 'orqaly_scope_revision_v1',
          status: 'pending_rebuild',
          revision_token: 'revision-current',
        },
      },
    });
    const admin = exactAdmin(selected);

    const result = await h04.apply(admin, selected, { log: null });

    expect(result).toMatchObject({ action: 'resumed', enqueued: 'scope-admission' });
    expect([...admin._state.jobs.values()][0]?.payload).toMatchObject({
      goalId: selected.id,
      action: 'scope-admission',
      scope_revision_token: 'revision-current',
    });
  });

  it('keeps a historical legacy admission stamp on PO analysis during healing', async () => {
    const selected = goal({
      status: 'analyzing',
      data: {
        scope_admission: {
          version: 1,
          status: 'queued',
          state_key: 'axwise_customer_intelligence',
        },
      },
    });
    const admin = exactAdmin(selected);

    const result = await h04.apply(admin, selected, { log: null });

    expect(result).toMatchObject({ action: 'resumed', enqueued: 'po-analysis' });
    expect([...admin._state.jobs.values()][0]?.payload).toMatchObject({
      goalId: selected.id,
      action: 'po-analysis',
    });
  });

  it('keeps a stuck pending evidence-research continuation on its exact revision token', async () => {
    const selected = goal({
      status: 'researching_customer',
      data: {
        scope_revision: {
          version: 'orqaly_scope_revision_v1',
          status: 'pending_rebuild',
          revision_token: 'revision-evidence-current',
        },
      },
    });
    const admin = exactAdmin(selected);
    const triggerProcessNextImpl = vi.fn(() => true);

    const result = await h04.apply(admin, selected, { log: null, triggerProcessNextImpl });

    expect(result).toMatchObject({ action: 'resumed', enqueued: 'customer-intelligence' });
    expect([...admin._state.jobs.values()][0]?.payload).toMatchObject({
      goalId: selected.id,
      action: 'customer-intelligence',
      scope_revision_token: 'revision-evidence-current',
    });
  });

  it.each(['analyzing', 'researching_customer'])(
    'fails h04 closed for a malformed pending revision in %s',
    async (status) => {
      const selected = goal({
        status,
        data: {
          ...(status === 'analyzing'
            ? {
                scope_admission: {
                  version: 1,
                  native_scope: true,
                  status: 'revision_requested',
                  state_key: 'axwise_customer_intelligence',
                },
              }
            : {}),
          scope_revision: {
            version: 'orqaly_scope_revision_v1',
            status: 'pending_rebuild',
            revision_token: ' ',
          },
        },
      });
      const admin = exactAdmin(selected);

      const result = await h04.apply(admin, selected, { log: null });

      expect(result).toMatchObject({
        action: 'skipped',
        reason: 'pending scope rebuild token is missing',
      });
      expect(admin._state.updates).toEqual([]);
      expect(admin._state.jobs.size).toBe(0);
    }
  );

  it.each([
    ['h01', h01, 'fetch timed out'],
    ['h02', h02, 'malformed JSON response'],
  ])('propagates the pending revision through %s recovery', async (_, strategy, reason) => {
    const selected = goal({
      data: {
        failure_reason: reason,
        failure_stage: 'customer-intelligence',
        scope_revision: {
          version: 'orqaly_scope_revision_v1',
          status: 'pending_rebuild',
          revision_token: 'revision-retry-current',
        },
      },
    });
    const admin = exactAdmin(selected);
    const triggerProcessNextImpl = vi.fn(() => true);

    const result = await strategy.apply(admin, selected, { log: null, triggerProcessNextImpl });

    expect(result.action).toBe('resumed');
    expect([...admin._state.jobs.values()][0]?.payload).toMatchObject({
      goalId: selected.id,
      action: 'customer-intelligence',
      scope_revision_token: 'revision-retry-current',
    });
  });

  it('rolls the exact transition back when insertion is proven absent', async () => {
    const selected = cases[1].goal();
    const admin = exactAdmin(selected, { insertMode: 'failure' });
    const triggerProcessNextImpl = vi.fn(() => true);

    const result = await h01.apply(admin, selected, { log: null, triggerProcessNextImpl });

    expect(result.action).toBe('skipped');
    expect(admin._state.goal).toMatchObject({
      status: selected.status,
      data: selected.data,
    });
    expect(admin._state.updates).toHaveLength(2);
    expect(admin._state.jobs.size).toBe(0);
    expect(admin._state.inserts.find((entry) => entry.table === 'goal_log')).toBeUndefined();
    expect(triggerProcessNextImpl).not.toHaveBeenCalled();
  });

  it.each(['commit-then-throw', 'commit-then-error'])(
    'accepts a committed healing rollback after %s response loss',
    async (rollbackWriteMode) => {
      const selected = cases[1].goal();
      const admin = exactAdmin(selected, { insertMode: 'failure', rollbackWriteMode });

      const result = await h01.apply(admin, selected, {
        log: null,
        triggerProcessNextImpl: vi.fn(() => true),
      });

      expect(result.action).toBe('skipped');
      expect(admin._state.goal).toMatchObject({
        status: selected.status,
        data: selected.data,
        plan: selected.plan,
      });
      expect(admin._state.rollbackWriteAttempts).toBe(1);
    }
  );

  it('retries a healing rollback only after reread proves the transition is still current', async () => {
    const selected = cases[1].goal();
    const admin = exactAdmin(selected, {
      insertMode: 'failure',
      rollbackWriteMode: 'error-original-once',
    });

    const result = await h01.apply(admin, selected, {
      log: null,
      triggerProcessNextImpl: vi.fn(() => true),
    });

    expect(result.action).toBe('skipped');
    expect(admin._state.goal).toMatchObject({ status: selected.status, data: selected.data });
    expect(admin._state.rollbackWriteAttempts).toBe(2);
  });

  it('verifies a committed Preview job after response loss and wakes that exact id', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_healer_preview');
    const selected = cases[1].goal();
    const admin = exactAdmin(selected, { insertMode: 'commit-then-throw' });
    const triggerProcessNextImpl = vi.fn(() => true);

    const result = await h01.apply(admin, selected, { log: null, triggerProcessNextImpl });

    expect(result.action).toBe('resumed');
    expect(admin._state.jobs.size).toBe(1);
    const [jobId, queued] = [...admin._state.jobs.entries()][0];
    expect(queued).toMatchObject({
      id: jobId,
      status: 'queued',
      worker_scope: 'preview',
      payload: {
        goalId: selected.id,
        _userId: selected.user_id,
        _healedBy: 'h01-transient-error',
        _workerDeployment: 'vercel-deployment:dpl_healer_preview',
      },
    });
    expect(triggerProcessNextImpl).toHaveBeenCalledTimes(1);
    expect(triggerProcessNextImpl).toHaveBeenCalledWith({ jobId });
    expect(result.jobId).toBe(jobId);
    expect(admin._state.inserts.find((entry) => entry.table === 'goal_log')).toBeDefined();
  });

  it('terminalizes the exact committed Preview job and rolls back when its wake fails', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_healer_preview');
    const selected = cases[1].goal();
    const admin = exactAdmin(selected, { insertMode: 'commit-then-throw' });
    const triggerProcessNextImpl = vi.fn(() => false);

    const result = await h01.apply(admin, selected, { log: null, triggerProcessNextImpl });

    expect(result).toMatchObject({
      action: 'skipped',
      reason: 'Preview healing continuation could not be awakened',
    });
    expect(admin._state.jobs.size).toBe(1);
    const [jobId, abandoned] = [...admin._state.jobs.entries()][0];
    expect(abandoned).toMatchObject({
      id: jobId,
      status: 'failed',
      error: expect.stringContaining('could not be awakened'),
    });
    expect(admin._state.jobUpdates).toHaveLength(1);
    expect(admin._state.jobUpdates[0].filters.updated_at).toBe(abandoned.created_at);
    expect(admin._state.jobUpdates[0].filters).toMatchObject({
      id: jobId,
      user_id: selected.user_id,
      status: 'queued',
      worker_scope: 'preview',
      'payload->>goalId': selected.id,
      'payload->>_healedBy': 'h01-transient-error',
      'payload->>_healAt': abandoned.payload._healAt,
      'payload->>_workerDeployment': 'vercel-deployment:dpl_healer_preview',
    });
    expect(admin._state.goal).toMatchObject({
      status: selected.status,
      data: selected.data,
    });
    expect(admin._state.inserts.find((entry) => entry.table === 'goal_log')).toBeUndefined();
  });

  it.each(['commit-then-throw', 'commit-then-error'])(
    'reconciles a %s terminalization response before rolling the goal back',
    async (jobTerminalMode) => {
      vi.stubEnv('VERCEL', '1');
      vi.stubEnv('VERCEL_ENV', 'preview');
      vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_healer_preview');
      const selected = cases[1].goal();
      const admin = exactAdmin(selected, {
        insertMode: 'commit-then-throw',
        jobTerminalMode,
      });

      const result = await h01.apply(admin, selected, {
        log: null,
        triggerProcessNextImpl: vi.fn(() => false),
      });

      expect(result.action).toBe('skipped');
      expect(admin._state.goal).toMatchObject({ status: selected.status, data: selected.data });
      expect([...admin._state.jobs.values()]).toEqual([
        expect.objectContaining({ status: 'failed' }),
      ]);
      expect(admin._state.updates).toHaveLength(2);
    }
  );

  it('does not roll back when terminalization is verified as still queued', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_healer_preview');
    const selected = cases[1].goal();
    const admin = exactAdmin(selected, {
      insertMode: 'commit-then-throw',
      jobTerminalMode: 'error-original',
    });

    await expect(
      h01.apply(admin, selected, { log: null, triggerProcessNextImpl: vi.fn(() => false) })
    ).rejects.toThrow('exact cleanup failed');

    expect([...admin._state.jobs.values()]).toEqual([
      expect.objectContaining({ status: 'queued' }),
    ]);
    expect(admin._state.goal.status).toBe('analyzing');
    expect(admin._state.updates).toHaveLength(1);
  });

  it('does not terminalize or roll back after a Preview continuation is concurrently claimed', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_healer_preview');
    const selected = cases[1].goal();
    const admin = exactAdmin(selected, {
      insertMode: 'commit-then-throw',
      jobTerminalRace: 'claimed',
    });
    const triggerProcessNextImpl = vi.fn(() => false);

    await expect(h01.apply(admin, selected, { log: null, triggerProcessNextImpl })).rejects.toThrow(
      'exact cleanup failed'
    );

    expect([...admin._state.jobs.values()]).toEqual([
      expect.objectContaining({ status: 'running', updated_at: '2026-08-22T12:02:00.000Z' }),
    ]);
    expect(admin._state.goal.status).toBe('analyzing');
    expect(admin._state.updates).toHaveLength(1);
    expect(admin._state.inserts.find((entry) => entry.table === 'goal_log')).toBeUndefined();
  });

  it('rolls back h03 without exposing a job when orphan-task cleanup fails before enqueue', async () => {
    const selected = cases[3].goal();
    const admin = exactAdmin(selected, { teamTaskDeleteError: 'task cleanup unavailable' });
    const triggerProcessNextImpl = vi.fn(() => true);

    const result = await h03.apply(admin, selected, { log: null, triggerProcessNextImpl });

    expect(result).toMatchObject({ action: 'skipped', reason: 'task cleanup unavailable' });
    expect(admin._state.goal).toMatchObject({
      status: selected.status,
      data: selected.data,
      plan: selected.plan,
    });
    expect([...admin._state.jobs.values()]).toEqual([]);
    expect(admin._state.deletes).toEqual([{ table: 'team_tasks' }]);
    expect(triggerProcessNextImpl).not.toHaveBeenCalled();
    expect(admin._state.inserts.find((entry) => entry.table === 'goal_log')).toBeUndefined();
  });
});
