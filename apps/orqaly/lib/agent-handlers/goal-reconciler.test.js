import { describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { RECONCILABLE_STATUSES, reconcileGoals } from './goal-reconciler.js';

function makeGoal(index, status, overrides = {}) {
  return {
    id: `goal-${String(index).padStart(3, '0')}`,
    user_id: 'user-1',
    title: `Goal ${index}`,
    status,
    plan: status === 'active' ? { phases: [{ name: 'Execute', status: 'pending' }] } : null,
    data: {},
    updated_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    autopilot_enabled: true,
    ...overrides,
  };
}

function valueAtPath(row, column) {
  return column
    .replaceAll('->>', '->')
    .split('->')
    .reduce((value, key) => value?.[key], row);
}

function makeAdmin(goals, { activeJobGoalIds = [], beforeGoalUpdate = null } = {}) {
  const state = {
    goalFilters: [],
    goalOrders: [],
    goalRanges: [],
    insertedJobs: [],
    goalUpdates: [],
  };
  const activeJobs = new Set(activeJobGoalIds);

  function goalsTable() {
    return {
      select: () => {
        const query = {
          statuses: null,
          equals: [],
          lessThan: [],
          greaterThan: [],
          orders: [],
          in(column, values) {
            if (column === 'status') {
              this.statuses = values;
              state.goalFilters.push([...values]);
            }
            return this;
          },
          eq(column, value) {
            this.equals.push([column, value]);
            return this;
          },
          lt(column, value) {
            this.lessThan.push([column, value]);
            return this;
          },
          gt(column, value) {
            this.greaterThan.push([column, value]);
            return this;
          },
          order(column, options) {
            this.orders.push({ column, options });
            state.goalOrders.push({ column, options });
            return this;
          },
          filteredRows() {
            let rows = [...goals];
            if (this.statuses) rows = rows.filter((goal) => this.statuses.includes(goal.status));
            rows = rows.filter((goal) =>
              this.equals.every(([column, value]) => String(goal[column]) === String(value))
            );
            rows = rows.filter((goal) =>
              this.lessThan.every(([column, value]) => String(goal[column]) < String(value))
            );
            rows = rows.filter((goal) =>
              this.greaterThan.every(([column, value]) => String(goal[column]) > String(value))
            );
            rows.sort((left, right) => {
              for (const { column, options } of this.orders) {
                const comparison = String(left[column]).localeCompare(String(right[column]));
                if (comparison !== 0)
                  return options?.ascending === false ? -comparison : comparison;
              }
              return 0;
            });
            return rows;
          },
          async limit(count) {
            return { data: this.filteredRows().slice(0, count), error: null };
          },
          async range(from, to) {
            state.goalRanges.push([from, to]);
            return { data: this.filteredRows().slice(from, to + 1), error: null };
          },
        };
        return query;
      },
      update: (patch) => {
        const filters = [];
        const nullFilters = [];
        let intercepted = false;
        const apply = () => {
          if (!intercepted && beforeGoalUpdate) {
            intercepted = true;
            beforeGoalUpdate(goals);
          }
          const match = goals.find(
            (goal) =>
              filters.every(
                ([column, value]) => String(valueAtPath(goal, column)) === String(value)
              ) && nullFilters.every((column) => valueAtPath(goal, column) == null)
          );
          if (!match) return { data: null, error: null };
          Object.assign(match, patch);
          state.goalUpdates.push({ id: match.id, patch });
          return { data: { id: match.id }, error: null };
        };
        const query = {
          eq(column, value) {
            filters.push([column, value]);
            return this;
          },
          is(column, value) {
            if (value !== null) throw new Error('Test builder supports only IS NULL');
            nullFilters.push(column);
            return this;
          },
          select() {
            return this;
          },
          async maybeSingle() {
            return apply();
          },
          then(resolve) {
            return Promise.resolve(apply()).then(resolve);
          },
        };
        return query;
      },
    };
  }

  function jobsTable() {
    return {
      select: () => {
        const query = {
          goalId: null,
          userId: null,
          eq(column, value) {
            if (column === 'user_id') this.userId = value;
            return this;
          },
          in() {
            return this;
          },
          contains(_column, payload) {
            this.goalId = payload.goalId;
            return this;
          },
          async limit() {
            return {
              data: activeJobs.has(this.goalId) ? [{ id: `job-${this.goalId}` }] : [],
              error: null,
            };
          },
        };
        return query;
      },
      insert: async (row) => {
        state.insertedJobs.push(row);
        return { error: null };
      },
    };
  }

  return {
    _state: state,
    from: vi.fn((table) => {
      if (table === 'goals') return goalsTable();
      if (table === 'agent_jobs') return jobsTable();
      if (table === 'goal_log') return { insert: async () => ({ error: null }) };
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe('goal reconciler fairness', () => {
  it('filters 20 approval-gated goals before paging so a later research goal still runs', async () => {
    const approvalGoals = Array.from({ length: 20 }, (_, index) =>
      makeGoal(index, index % 2 === 0 ? 'awaiting_context_approval' : 'awaiting_approval')
    );
    const researchGoal = makeGoal(20, 'researching_customer');
    const admin = makeAdmin([...approvalGoals, researchGoal]);

    const result = await reconcileGoals(admin, { pageSize: 20 });

    expect(result).toEqual({ reconciled: 1, skipped: 0 });
    expect(admin._state.goalFilters[0]).toEqual(RECONCILABLE_STATUSES);
    expect(admin._state.goalFilters[0]).not.toContain('awaiting_context_approval');
    expect(admin._state.goalFilters[0]).not.toContain('awaiting_approval');
    expect(admin._state.insertedJobs).toHaveLength(1);
    expect(admin._state.insertedJobs[0]).toMatchObject({
      user_id: researchGoal.user_id,
      worker_scope: 'production',
      payload: {
        goalId: researchGoal.id,
        action: 'customer-intelligence',
        _userId: researchGoal.user_id,
        userId: researchGoal.user_id,
        user_id: researchGoal.user_id,
      },
    });
  });

  it('recovers a scope-first Smart Request at admission rather than legacy PO analysis', async () => {
    const scopeFirstGoal = makeGoal(1, 'analyzing', {
      data: {
        scope_admission: {
          version: 1,
          native_scope: true,
          status: 'queued',
          state_key: 'axwise_customer_intelligence',
        },
      },
    });
    const admin = makeAdmin([scopeFirstGoal]);

    const result = await reconcileGoals(admin);

    expect(result).toEqual({ reconciled: 1, skipped: 0 });
    expect(admin._state.insertedJobs[0].payload).toMatchObject({
      goalId: scopeFirstGoal.id,
      action: 'scope-admission',
    });
  });

  it.each(['started', 'enqueue_failed', 'processing'])(
    'recovers a historical %s Smart Request without the newer native scope flag',
    async (admissionStatus) => {
      const historicalSmartGoal = makeGoal(1, 'analyzing', {
        data: {
          smart_request_admission: {
            status: admissionStatus,
            started_at: '2026-08-24T08:00:00.000Z',
          },
          scope_admission: {
            version: 1,
            status: 'queued',
            state_key: 'axwise_customer_intelligence',
          },
        },
      });
      const admin = makeAdmin([historicalSmartGoal]);

      const result = await reconcileGoals(admin);

      expect(result).toEqual({ reconciled: 1, skipped: 0 });
      expect(admin._state.insertedJobs[0].payload).toMatchObject({
        goalId: historicalSmartGoal.id,
        action: 'scope-admission',
      });
    }
  );

  it('keeps a historical legacy admission stamp on PO analysis', async () => {
    const legacyGoal = makeGoal(1, 'analyzing', {
      data: {
        scope_admission: {
          version: 1,
          status: 'queued',
          state_key: 'axwise_customer_intelligence',
        },
      },
    });
    const admin = makeAdmin([legacyGoal]);

    const result = await reconcileGoals(admin);

    expect(result).toEqual({ reconciled: 1, skipped: 0 });
    expect(admin._state.insertedJobs[0].payload).toMatchObject({
      goalId: legacyGoal.id,
      action: 'po-analysis',
    });
  });

  it.each([
    ['analyzing', 'scope-admission'],
    ['researching_customer', 'customer-intelligence'],
  ])('binds a pending %s continuation to the exact scope revision', async (status, action) => {
    const pendingGoal = makeGoal(1, status, {
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
          revision_token: 'revision-current',
        },
      },
    });
    const admin = makeAdmin([pendingGoal]);

    const result = await reconcileGoals(admin);

    expect(result).toEqual({ reconciled: 1, skipped: 0 });
    expect(admin._state.insertedJobs[0].payload).toMatchObject({
      goalId: pendingGoal.id,
      action,
      scope_revision_token: 'revision-current',
    });
  });

  it('fails closed instead of reconstructing a pending revision without its token', async () => {
    const malformedGoal = makeGoal(1, 'researching_customer', {
      updated_at: new Date().toISOString(),
      data: {
        scope_revision: {
          version: 'orqaly_scope_revision_v1',
          status: 'pending_rebuild',
          revision_token: ' ',
        },
      },
    });
    const admin = makeAdmin([malformedGoal]);

    const result = await reconcileGoals(admin);

    expect(result).toEqual({ reconciled: 0, skipped: 1 });
    expect(admin._state.insertedJobs).toEqual([]);
    expect(admin._state.goalUpdates).toEqual([]);
  });

  it('walks deterministic pages and reconciles all 30 varied runnable goals', async () => {
    const statuses = [
      'feasibility',
      'analyzing',
      'researching_customer',
      'planning',
      'forming_team',
      'provisioning_tools',
      'estimating',
      'active',
    ];
    const goals = Array.from({ length: 30 }, (_, index) =>
      makeGoal(index, statuses[index % statuses.length])
    );
    const admin = makeAdmin([...goals].reverse());

    const result = await reconcileGoals(admin, { pageSize: 20 });

    expect(result).toEqual({ reconciled: 30, skipped: 0 });
    expect(admin._state.goalRanges).toEqual([
      [0, 19],
      [20, 39],
    ]);
    expect(admin._state.goalOrders.slice(-2)).toEqual([
      { column: 'updated_at', options: { ascending: true } },
      { column: 'id', options: { ascending: true } },
    ]);
    expect(admin._state.insertedJobs.map((job) => job.payload.goalId)).toEqual(
      goals.map((goal) => goal.id)
    );
  });

  it('returns an interrupted authorization reservation to the second human gate', async () => {
    const goal = makeGoal(1, 'authorizing_execution', {
      updated_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      data: {
        execution_authorization: {
          status: 'pending',
          snapshot_hash: 'snapshot-1',
        },
        execution_approval_attempt: {
          version: 'orqaly_execution_approval_attempt_v1',
          attempt_token: 'attempt-1',
          snapshot_hash: 'snapshot-1',
          started_at: '2026-08-24T08:00:00.000Z',
        },
        goal_approvals: {
          execution: { status: 'pending', snapshot_hash: 'snapshot-1' },
        },
      },
    });
    const admin = makeAdmin([goal]);

    const result = await reconcileGoals(admin);

    expect(result).toEqual({ reconciled: 1, skipped: 0 });
    expect(admin._state.insertedJobs).toHaveLength(0);
    expect(goal.status).toBe('awaiting_approval');
    expect(goal.data.execution_authorization).toMatchObject({
      status: 'binding_interrupted',
      snapshot_hash: 'snapshot-1',
    });
  });

  it('does not recover a replaced same-status Gate-2 attempt after losing its snapshot CAS', async () => {
    const goal = makeGoal(1, 'authorizing_execution', {
      updated_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      data: {
        execution_approval_attempt: {
          version: 'orqaly_execution_approval_attempt_v1',
          attempt_token: 'attempt-old',
          snapshot_hash: 'snapshot-old',
        },
        goal_approvals: {
          execution: { status: 'pending', snapshot_hash: 'snapshot-old' },
        },
      },
    });
    const admin = makeAdmin([goal], {
      beforeGoalUpdate: ([current]) => {
        current.updated_at = new Date().toISOString();
        current.data.execution_approval_attempt = {
          ...current.data.execution_approval_attempt,
          attempt_token: 'attempt-new',
          snapshot_hash: 'snapshot-new',
        };
        current.data.goal_approvals.execution.snapshot_hash = 'snapshot-new';
      },
    });

    const result = await reconcileGoals(admin);

    expect(result).toEqual({ reconciled: 0, skipped: 1 });
    expect(goal.status).toBe('authorizing_execution');
    expect(goal.data.execution_approval_attempt.attempt_token).toBe('attempt-new');
    expect(admin._state.goalUpdates).toHaveLength(0);
  });

  it('does not interfere with an authorization reservation still in flight', async () => {
    const goal = makeGoal(1, 'authorizing_execution', {
      updated_at: new Date().toISOString(),
    });
    const admin = makeAdmin([goal]);

    const result = await reconcileGoals(admin);

    expect(result).toEqual({ reconciled: 0, skipped: 0 });
    expect(admin._state.goalUpdates).toHaveLength(0);
    expect(admin._state.insertedJobs).toHaveLength(0);
  });

  it('recovers a stale reservation even when goal autopilot is disabled', async () => {
    const goal = makeGoal(1, 'authorizing_execution', {
      updated_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      autopilot_enabled: false,
    });
    const admin = makeAdmin([goal]);

    const result = await reconcileGoals(admin);

    expect(result).toEqual({ reconciled: 1, skipped: 0 });
    expect(goal.status).toBe('awaiting_approval');
  });

  it('does not recover a stale reservation while its binding job is active', async () => {
    const goal = makeGoal(1, 'authorizing_execution', {
      updated_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    });
    const admin = makeAdmin([goal], { activeJobGoalIds: [goal.id] });

    const result = await reconcileGoals(admin);

    expect(result).toEqual({ reconciled: 0, skipped: 1 });
    expect(goal.status).toBe('authorizing_execution');
    expect(admin._state.goalUpdates).toHaveLength(0);
  });

  it('recovers a reservation without shifting the 30-project runnable pages', async () => {
    const reservation = makeGoal(0, 'authorizing_execution', {
      updated_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    });
    const runnable = Array.from({ length: 30 }, (_, index) => makeGoal(index + 1, 'feasibility'));
    const admin = makeAdmin([reservation, ...runnable]);

    const result = await reconcileGoals(admin, { pageSize: 20 });

    expect(result).toEqual({ reconciled: 31, skipped: 0 });
    expect(admin._state.goalRanges).toEqual([
      [0, 19],
      [20, 39],
    ]);
    expect(admin._state.insertedJobs.map((job) => job.payload.goalId)).toEqual(
      runnable.map((goal) => goal.id)
    );
  });

  it('resumes an interrupted strict PRD validation through completion', async () => {
    const goal = makeGoal(1, 'pending_validation', {
      data: { prd_quality_validation: { status: 'running' } },
    });
    const admin = makeAdmin([goal]);

    const result = await reconcileGoals(admin);

    expect(result).toEqual({ reconciled: 1, skipped: 0 });
    expect(admin._state.insertedJobs[0].payload).toMatchObject({
      goalId: goal.id,
      action: 'complete',
    });
  });

  it('resumes only the hash-bound PRD repair after an interrupted worker', async () => {
    const goal = makeGoal(1, 'pending_validation', {
      data: {
        prd_quality_attestation: { status: 'failed' },
        prd_quality_repair: {
          status: 'running',
          task_id: 'task-1',
          artifact_hash: 'artifact-1',
          scope_hash: 'scope-1',
        },
      },
    });
    const admin = makeAdmin([goal]);

    const result = await reconcileGoals(admin);

    expect(result).toEqual({ reconciled: 1, skipped: 0 });
    expect(admin._state.insertedJobs[0].payload).toMatchObject({
      goalId: goal.id,
      action: 'prd-quality-repair',
      artifactHash: 'artifact-1',
      scopeHash: 'scope-1',
    });
  });
});
