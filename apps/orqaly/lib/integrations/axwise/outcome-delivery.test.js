import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./outcomes.js', () => ({
  reportGoalOutcome: vi.fn(),
}));

import { reportGoalOutcome } from './outcomes.js';
import {
  enqueueGoalOutcomeRetry,
  handleAxwiseOutcomeJob,
  markAxwiseOutcomeFinalFailure,
  reportOrEnqueueGoalOutcome,
} from './outcome-delivery.js';

const PRODUCTION_ENV = { VERCEL: '1', VERCEL_ENV: 'production' };
const PREVIEW_A_ENV = {
  VERCEL: '1',
  VERCEL_ENV: 'preview',
  VERCEL_DEPLOYMENT_ID: 'dpl_preview_a',
};
const PREVIEW_B_ENV = {
  VERCEL: '1',
  VERCEL_ENV: 'preview',
  VERCEL_DEPLOYMENT_ID: 'dpl_preview_b',
};

function testGoal(overrides = {}) {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    org_id: 'org-1',
    status: 'completed',
    data: {
      axwise_orchestration: { decision_id: 'decision-1', applied: true, feasible: true },
    },
    ...overrides,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function persistOutcomeProof(admin, decisionId = 'decision-1') {
  admin._state.goal.data = {
    ...admin._state.goal.data,
    axwise_outcome: {
      outcome_id: 'outcome-1',
      decision_id: decisionId,
      reported_at: '2026-08-24T12:00:00.000Z',
    },
  };
}

function pendingRetryGoal({ retryAttempt = 0 } = {}) {
  return testGoal({
    data: {
      axwise_orchestration: { decision_id: 'decision-1', applied: true, feasible: true },
      axwise_outcome_delivery: {
        status: 'pending',
        decision_id: 'decision-1',
        attempts: retryAttempt + 1,
        retry_job_id: 'retry-job',
        retry_attempt: retryAttempt,
      },
    },
  });
}

function fakeAdmin(initialGoal = testGoal(), { beforeGoalUpdate } = {}) {
  const state = {
    goal: structuredClone(initialGoal),
    jobs: [],
    nextJob: 1,
  };

  function matches(row, filters) {
    return Object.entries(filters).every(([key, value]) => {
      if (key.startsWith('payload->>')) {
        return String(row.payload?.[key.slice('payload->>'.length)]) === String(value);
      }
      if (key === 'data' && typeof value === 'string') {
        return JSON.stringify(row.data) === value;
      }
      if (value === null) return row[key] === null || row[key] === undefined;
      return row[key] === value;
    });
  }

  const admin = {
    _state: state,
    from: vi.fn((table) => {
      if (table === 'goals') {
        return {
          select: (columns) => {
            const filters = {};
            const query = {
              eq(key, value) {
                filters[key] = value;
                return query;
              },
              async single() {
                if (!matches(state.goal, filters)) {
                  return { data: null, error: { message: 'not found' } };
                }
                return {
                  data: columns === '*' ? structuredClone(state.goal) : structuredClone(state.goal),
                  error: null,
                };
              },
            };
            return query;
          },
          update: (patch) => {
            const filters = {};
            const query = {
              eq(key, value) {
                filters[key] = value;
                return query;
              },
              is(key, value) {
                filters[key] = value;
                return query;
              },
              select() {
                return query;
              },
              async maybeSingle() {
                if (beforeGoalUpdate) await beforeGoalUpdate(state, patch, filters);
                if (!matches(state.goal, filters)) {
                  return { data: null, error: null };
                }
                state.goal = { ...state.goal, ...structuredClone(patch) };
                return { data: { id: state.goal.id }, error: null };
              },
              then(resolve, reject) {
                return Promise.resolve()
                  .then(async () => {
                    if (beforeGoalUpdate) await beforeGoalUpdate(state, patch, filters);
                    if (!matches(state.goal, filters)) {
                      return { error: { message: 'not found' } };
                    }
                    state.goal = { ...state.goal, ...structuredClone(patch) };
                    return { error: null };
                  })
                  .then(resolve, reject);
              },
            };
            return query;
          },
        };
      }

      if (table === 'agent_jobs') {
        return {
          select: () => {
            const filters = {};
            let statuses = null;
            const query = {
              eq(key, value) {
                filters[key] = value;
                return query;
              },
              in(key, values) {
                if (key === 'status') statuses = values;
                return query;
              },
              limit() {
                return query;
              },
              async maybeSingle() {
                const row = state.jobs.find(
                  (candidate) =>
                    matches(candidate, filters) &&
                    (!statuses || statuses.includes(candidate.status))
                );
                return { data: row ? structuredClone(row) : null, error: null };
              },
            };
            return query;
          },
          insert: async (row) => {
            state.nextJob += 1;
            state.jobs.push(structuredClone(row));
            return { error: null };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return admin;
}

describe('durable AxWise outcome delivery', () => {
  beforeEach(() => {
    reportGoalOutcome.mockReset();
  });

  it('records a successful immediate report without changing completion', async () => {
    const admin = fakeAdmin();
    reportGoalOutcome.mockImplementation(async () => {
      persistOutcomeProof(admin);
      return { status: 'reported', outcome: { outcome_id: 'o-1' } };
    });

    const result = await reportOrEnqueueGoalOutcome(admin, admin._state.goal);

    expect(result.status).toBe('reported');
    expect(admin._state.goal.status).toBe('completed');
    expect(admin._state.goal.data.axwise_outcome_delivery).toMatchObject({
      status: 'reported',
      decision_id: 'decision-1',
      attempts: 1,
      last_error: null,
    });
    expect(admin._state.jobs).toHaveLength(0);
  });

  it('retries a lost full-snapshot CAS and preserves concurrent goal changes', async () => {
    let raced = false;
    const admin = fakeAdmin(
      testGoal({
        updated_at: '2026-08-24T10:00:00.000Z',
        data: {
          axwise_orchestration: { decision_id: 'decision-1', applied: true, feasible: true },
          existing: 'before',
        },
      }),
      {
        beforeGoalUpdate(state) {
          if (raced) return;
          raced = true;
          state.goal = {
            ...state.goal,
            status: 'completed_with_warnings',
            updated_at: '2026-08-24T10:00:01.000Z',
            data: {
              ...state.goal.data,
              existing: 'concurrent-value',
              concurrent_key: 'must-survive',
            },
          };
        },
      }
    );
    reportGoalOutcome.mockImplementation(async () => {
      persistOutcomeProof(admin);
      return { status: 'reported', outcome: { outcome_id: 'o-1' } };
    });

    await reportOrEnqueueGoalOutcome(admin, structuredClone(admin._state.goal));

    expect(admin._state.goal.status).toBe('completed_with_warnings');
    expect(admin._state.goal.data).toMatchObject({
      existing: 'concurrent-value',
      concurrent_key: 'must-survive',
      axwise_outcome_delivery: { status: 'reported' },
    });
  });

  it('does not deliver or retry an outcome for a shadow decision that was not applied', async () => {
    const goal = testGoal({
      data: {
        axwise_orchestration: {
          decision_id: 'decision-shadow',
          applied: false,
          feasible: true,
          enforcement: 'shadow',
        },
      },
    });
    const admin = fakeAdmin(goal);

    const result = await reportOrEnqueueGoalOutcome(admin, admin._state.goal);

    expect(result).toEqual({ status: 'skipped', reason: 'decision_not_applied' });
    expect(reportGoalOutcome).not.toHaveBeenCalled();
    expect(admin._state.jobs).toHaveLength(0);
    expect(admin._state.goal.data.axwise_outcome_delivery).toMatchObject({
      status: 'skipped',
      decision_id: 'decision-shadow',
      skip_reason: 'decision_not_applied',
    });
  });

  it('queues one active retry job and reuses it after repeated immediate failures', async () => {
    const error = Object.assign(new Error('AxWise orchestration API error: HTTP 503'), {
      code: 'AXWISE_HTTP_503',
    });
    reportGoalOutcome.mockRejectedValue(error);
    const admin = fakeAdmin();

    const first = await reportOrEnqueueGoalOutcome(admin, admin._state.goal);
    const second = await reportOrEnqueueGoalOutcome(admin, admin._state.goal);

    expect(first).toMatchObject({ status: 'queued', jobId: expect.any(String), reused: false });
    expect(second).toMatchObject({ status: 'queued', jobId: first.jobId, reused: true });
    expect(admin._state.jobs).toHaveLength(1);
    expect(admin._state.jobs[0].worker_scope).toBe('production');
    expect(admin._state.jobs[0]).toMatchObject({ user_id: 'user-1' });
    expect(admin._state.jobs[0].payload).toEqual({
      type: 'axwise-outcome',
      goalId: 'goal-1',
      decisionId: 'decision-1',
      _userId: 'user-1',
      userId: 'user-1',
      user_id: 'user-1',
    });
    expect(admin._state.goal.status).toBe('completed');
    expect(admin._state.goal.data.axwise_outcome_delivery).toMatchObject({
      status: 'pending',
      attempts: 2,
      retry_job_id: first.jobId,
      last_error: 'AxWise orchestration API error: HTTP 503',
      last_error_code: 'AXWISE_HTTP_503',
    });
  });

  it('does not enqueue another job when an active retry already exists', async () => {
    const admin = fakeAdmin();
    admin._state.jobs.push({
      id: 'existing-job',
      user_id: 'user-1',
      status: 'running',
      worker_scope: 'production',
      payload: { type: 'axwise-outcome', goalId: 'goal-1', decisionId: 'decision-1' },
    });

    const result = await enqueueGoalOutcomeRetry(admin, admin._state.goal, 'temporary failure');

    expect(result).toMatchObject({ status: 'queued', jobId: 'existing-job', reused: true });
    expect(admin._state.jobs).toHaveLength(1);
  });

  it('isolates active Preview retries by exact deployment and reuses only its own row', async () => {
    const admin = fakeAdmin();
    const triggerProcessNextImpl = vi.fn(() => true);

    const firstA = await enqueueGoalOutcomeRetry(admin, admin._state.goal, 'temporary failure', {
      env: PREVIEW_A_ENV,
      triggerProcessNextImpl,
    });
    const secondA = await enqueueGoalOutcomeRetry(admin, admin._state.goal, 'temporary failure', {
      env: PREVIEW_A_ENV,
      triggerProcessNextImpl,
    });
    const firstB = await enqueueGoalOutcomeRetry(admin, admin._state.goal, 'temporary failure', {
      env: PREVIEW_B_ENV,
      triggerProcessNextImpl,
    });

    expect(firstA).toMatchObject({ jobId: expect.any(String), reused: false });
    expect(secondA).toMatchObject({ jobId: firstA.jobId, reused: true });
    expect(firstB).toMatchObject({ jobId: expect.any(String), reused: false });
    expect(firstB.jobId).not.toBe(firstA.jobId);
    expect(admin._state.jobs).toHaveLength(2);
    expect(admin._state.jobs.map((job) => job.worker_scope)).toEqual(['preview', 'preview']);
    expect(admin._state.jobs.map((job) => job.payload._workerDeployment)).toEqual([
      'vercel-deployment:dpl_preview_a',
      'vercel-deployment:dpl_preview_b',
    ]);
    expect(triggerProcessNextImpl.mock.calls.map(([arg]) => arg.jobId)).toEqual([
      firstA.jobId,
      firstA.jobId,
      firstB.jobId,
    ]);
  });

  it('keeps Production retry deduplication separate from Preview deployments', async () => {
    const admin = fakeAdmin();
    const triggerProcessNextImpl = vi.fn(() => true);
    await enqueueGoalOutcomeRetry(admin, admin._state.goal, 'temporary failure', {
      env: PREVIEW_A_ENV,
      triggerProcessNextImpl,
    });

    const firstProduction = await enqueueGoalOutcomeRetry(
      admin,
      admin._state.goal,
      'temporary failure',
      { env: PRODUCTION_ENV }
    );
    const secondProduction = await enqueueGoalOutcomeRetry(
      admin,
      admin._state.goal,
      'temporary failure',
      { env: PRODUCTION_ENV }
    );

    expect(firstProduction).toMatchObject({ jobId: expect.any(String), reused: false });
    expect(secondProduction).toMatchObject({ jobId: firstProduction.jobId, reused: true });
    expect(admin._state.jobs).toHaveLength(2);
    expect(admin._state.jobs[1]).toMatchObject({
      worker_scope: 'production',
      payload: { type: 'axwise-outcome', goalId: 'goal-1' },
    });
    expect(admin._state.jobs[1].payload._workerDeployment).toBeUndefined();
  });

  it('fails closed before lookup or insertion when Preview identity is unavailable', async () => {
    const admin = fakeAdmin();

    await expect(
      enqueueGoalOutcomeRetry(admin, admin._state.goal, 'temporary failure', {
        env: { VERCEL: '1', VERCEL_ENV: 'preview' },
      })
    ).rejects.toMatchObject({
      code: 'AXWISE_OUTCOME_PREVIEW_IDENTITY_UNAVAILABLE',
    });

    expect(admin._state.jobs).toEqual([]);
    expect(admin._state.goal.data.axwise_outcome_delivery).toBeUndefined();
  });

  it('recovers a persisted outcome without sending it a second time', async () => {
    const goal = testGoal({
      data: {
        axwise_orchestration: { decision_id: 'decision-1', applied: true, feasible: true },
        axwise_outcome: {
          outcome_id: 'outcome-1',
          decision_id: 'decision-1',
          reported_at: '2026-08-03T10:00:00.000Z',
        },
        axwise_outcome_delivery: {
          status: 'pending',
          decision_id: 'decision-1',
          attempts: 1,
          retry_job_id: 'retry-job',
          retry_attempt: 0,
        },
      },
    });
    const admin = fakeAdmin(goal);

    const result = await handleAxwiseOutcomeJob(
      admin,
      { type: 'axwise-outcome', goalId: 'goal-1', decisionId: 'decision-1' },
      { id: 'retry-job', user_id: 'user-1', retry_count: 0 }
    );

    expect(result).toEqual({ status: 'reported', reused: true });
    expect(reportGoalOutcome).not.toHaveBeenCalled();
    expect(admin._state.goal.data.axwise_outcome_delivery).toMatchObject({
      status: 'reported',
      retry_job_id: 'retry-job',
      recovered_from_persisted_outcome: true,
    });
  });

  it('records final delivery failure without failing the completed goal', async () => {
    const admin = fakeAdmin(pendingRetryGoal());

    await markAxwiseOutcomeFinalFailure(
      admin,
      { type: 'axwise-outcome', goalId: 'goal-1', decisionId: 'decision-1' },
      new Error('retry budget exhausted'),
      { id: 'retry-job', user_id: 'user-1', retry_count: 0 }
    );

    expect(admin._state.goal.status).toBe('completed');
    expect(admin._state.goal.data.axwise_outcome_delivery).toMatchObject({
      status: 'final_failure',
      retry_job_id: 'retry-job',
      last_error: 'retry budget exhausted',
    });
    expect(admin._state.goal.data.axwise_outcome_delivery.final_failed_at).toBeTruthy();
  });

  it('keeps reported truth when a deferred stale final-failure CAS resumes last', async () => {
    const failureWriteReached = deferred();
    const releaseFailureWrite = deferred();
    let blocked = false;
    const admin = fakeAdmin(pendingRetryGoal(), {
      async beforeGoalUpdate(_state, patch) {
        if (patch.data?.axwise_outcome_delivery?.status !== 'final_failure' || blocked) return;
        blocked = true;
        failureWriteReached.resolve();
        await releaseFailureWrite.promise;
      },
    });
    reportGoalOutcome.mockImplementation(async () => {
      persistOutcomeProof(admin);
      return { status: 'reported', outcome: { outcome_id: 'outcome-1' } };
    });
    const payload = {
      type: 'axwise-outcome',
      goalId: 'goal-1',
      decisionId: 'decision-1',
    };
    const job = { id: 'retry-job', user_id: 'user-1', retry_count: 0 };

    const staleFailure = markAxwiseOutcomeFinalFailure(
      admin,
      payload,
      new Error('stale timeout'),
      job
    );
    await failureWriteReached.promise;
    const report = await handleAxwiseOutcomeJob(admin, payload, job);
    releaseFailureWrite.resolve();
    await staleFailure;

    expect(report.status).toBe('reported');
    expect(admin._state.goal.data.axwise_outcome_delivery).toMatchObject({
      status: 'reported',
      decision_id: 'decision-1',
      attempts: 1,
      retry_job_id: 'retry-job',
      retry_attempt: 0,
      last_error: null,
    });
  });

  it('promotes a matching final failure when the deferred report finishes last', async () => {
    const reportCallReached = deferred();
    const releaseReportCall = deferred();
    const admin = fakeAdmin(pendingRetryGoal());
    reportGoalOutcome.mockImplementation(async () => {
      reportCallReached.resolve();
      await releaseReportCall.promise;
      persistOutcomeProof(admin);
      return { status: 'reported', outcome: { outcome_id: 'outcome-1' } };
    });
    const payload = {
      type: 'axwise-outcome',
      goalId: 'goal-1',
      decisionId: 'decision-1',
    };
    const job = { id: 'retry-job', user_id: 'user-1', retry_count: 0 };

    const lateReport = handleAxwiseOutcomeJob(admin, payload, job);
    await reportCallReached.promise;
    await markAxwiseOutcomeFinalFailure(
      admin,
      payload,
      new Error('timeout won the first terminal write'),
      job
    );
    expect(admin._state.goal.data.axwise_outcome_delivery.status).toBe('final_failure');
    releaseReportCall.resolve();
    await lateReport;

    expect(admin._state.goal.data.axwise_outcome_delivery).toMatchObject({
      status: 'reported',
      decision_id: 'decision-1',
      attempts: 1,
      retry_job_id: 'retry-job',
      retry_attempt: 0,
      last_error: null,
    });
  });

  it('cannot mark another tenant goal as final failure by guessed goal ID', async () => {
    const victimGoal = testGoal({ user_id: 'victim-user' });
    const admin = fakeAdmin(victimGoal);

    await expect(
      markAxwiseOutcomeFinalFailure(
        admin,
        { type: 'axwise-outcome', goalId: 'goal-1', decisionId: 'decision-1' },
        new Error('forged failure'),
        { id: 'attacker-job', user_id: 'attacker-user', retry_count: 0 },
        'attacker-user'
      )
    ).rejects.toThrow('delivery state: not found');

    expect(admin._state.goal.data.axwise_outcome_delivery).toBeUndefined();
  });
});
