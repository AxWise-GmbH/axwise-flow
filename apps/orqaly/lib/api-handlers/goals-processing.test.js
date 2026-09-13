import { describe, expect, it, vi } from 'vitest';
import { enqueueGoalWorkerJob, kickGoalProcessing, sendGoalHandlerResult } from './goals.js';

const OWNER_ID = '00000000-0000-4000-8000-000000000099';

describe('goal worker handoff', () => {
  it('preserves durable reconciliation ids in the HTTP 503 body', () => {
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })) };

    sendGoalHandlerResult(res, {
      status: 503,
      error: 'Preview handoff needs reconciliation',
      data: {
        goal_id: 'goal-durable',
        job_id: 'job-durable',
        reconciliation_state: 'leased:parked',
        retry_safe: false,
      },
    });

    expect(res.status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      error: 'Preview handoff needs reconciliation',
      goal_id: 'goal-durable',
      job_id: 'job-durable',
      data: {
        goal_id: 'goal-durable',
        job_id: 'job-durable',
        reconciliation_state: 'leased:parked',
        retry_safe: false,
      },
    });
  });

  it('pre-generates the durable row id used by the exact wake', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const admin = { from: vi.fn(() => ({ insert })) };

    const result = await enqueueGoalWorkerJob(
      admin,
      {
        user_id: OWNER_ID,
        status: 'queued',
        payload: { type: 'orchestrate-goal', goalId: 'goal-1' },
      },
      { env: {} }
    );

    expect(result).toEqual({ jobId: expect.stringMatching(/^[0-9a-f-]{36}$/i), error: null });
    expect(insert).toHaveBeenCalledWith({
      id: result.jobId,
      user_id: OWNER_ID,
      status: 'queued',
      worker_scope: 'local',
      payload: {
        type: 'orchestrate-goal',
        goalId: 'goal-1',
        _userId: OWNER_ID,
        userId: OWNER_ID,
        user_id: OWNER_ID,
      },
    });
  });

  it('rejects missing or disagreeing durable queue owners before insert', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const admin = { from: vi.fn(() => ({ insert })) };

    const missing = await enqueueGoalWorkerJob(admin, {
      status: 'queued',
      payload: { type: 'orchestrate-goal', goalId: 'goal-1' },
    });
    const mismatched = await enqueueGoalWorkerJob(admin, {
      user_id: OWNER_ID,
      status: 'queued',
      payload: { type: 'orchestrate-goal', goalId: 'goal-1', _userId: 'other-owner' },
    });

    expect(missing.error).toMatchObject({ code: 'AGENT_JOB_OWNER_REQUIRED' });
    expect(mismatched.error).toMatchObject({ code: 'AGENT_JOB_OWNER_MISMATCH' });
    expect(insert).not.toHaveBeenCalled();
  });

  it.each(['returned', 'thrown'])(
    'reconciles a %s insert response loss against the exact pre-generated id',
    async (failureMode) => {
      const jobId = '00000000-0000-4000-8000-000000000001';
      const insertError = new Error('connection closed after commit');
      const expectedPayload = {
        type: 'orchestrate-goal',
        goalId: 'goal-1',
        _userId: OWNER_ID,
        userId: OWNER_ID,
        user_id: OWNER_ID,
      };
      const query = {
        insert: vi.fn(async () => {
          if (failureMode === 'thrown') throw insertError;
          return { error: insertError };
        }),
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({
          data: {
            id: jobId,
            worker_scope: 'local',
            user_id: OWNER_ID,
            payload: expectedPayload,
          },
          error: null,
        })),
      };
      const admin = { from: vi.fn(() => query) };

      const result = await enqueueGoalWorkerJob(
        admin,
        { user_id: OWNER_ID, status: 'queued', payload: expectedPayload },
        { env: {}, jobId }
      );

      expect(result).toEqual({ jobId, error: null });
      expect(query.insert).toHaveBeenCalledWith(
        expect.objectContaining({ id: jobId, user_id: OWNER_ID, payload: expectedPayload })
      );
      expect(query.eq).toHaveBeenCalledWith('id', jobId);
    }
  );

  it('returns the original insert error only after the exact id is proven absent', async () => {
    const jobId = '00000000-0000-4000-8000-000000000002';
    const insertError = new Error('constraint rejected');
    const query = {
      insert: vi.fn(async () => ({ error: insertError })),
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    const admin = { from: vi.fn(() => query) };

    const result = await enqueueGoalWorkerJob(
      admin,
      {
        user_id: OWNER_ID,
        status: 'queued',
        payload: { type: 'orchestrate-goal', goalId: 'goal-1' },
      },
      { env: {}, jobId }
    );

    expect(result).toEqual({ jobId, error: insertError });
  });

  it.each([
    ['unknown', null, new Error('readback unavailable')],
    [
      'conflict',
      { id: '00000000-0000-4000-8000-000000000003', payload: { goalId: 'other' } },
      null,
    ],
  ])(
    'requires reconciliation when the exact insert outcome is %s',
    async (state, data, readError) => {
      const jobId = '00000000-0000-4000-8000-000000000003';
      const query = {
        insert: vi.fn(async () => ({ error: new Error('response lost') })),
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data, error: readError })),
      };
      const admin = { from: vi.fn(() => query) };

      const result = await enqueueGoalWorkerJob(
        admin,
        {
          user_id: OWNER_ID,
          status: 'queued',
          payload: { type: 'orchestrate-goal', goalId: 'goal-1' },
        },
        { env: {}, jobId }
      );

      expect(result.jobId).toBe(jobId);
      expect(result.error).toMatchObject({
        code: 'AGENT_JOB_ENQUEUE_RECONCILIATION_REQUIRED',
        jobId,
        reconciliationState: state,
      });
    }
  );

  it('wakes the deployment worker immediately in Preview without claiming inline', async () => {
    const processNext = vi.fn();
    const trigger = vi.fn(() => true);
    const setTimeoutImpl = vi.fn();

    const result = await kickGoalProcessing({}, 'goal-preview', {
      env: { VERCEL: '1', VERCEL_ENV: 'preview' },
      processNext,
      trigger,
      setTimeoutImpl,
    });

    expect(result).toEqual({ mode: 'preview-worker', triggered: true });
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(processNext).not.toHaveBeenCalled();
    expect(setTimeoutImpl).not.toHaveBeenCalled();
  });

  it('forwards a matched queue id for a targeted Preview recovery', async () => {
    const processNext = vi.fn();
    const trigger = vi.fn(() => true);

    const result = await kickGoalProcessing({}, 'goal-preview', {
      env: { VERCEL: '1', VERCEL_ENV: 'preview' },
      processNext,
      trigger,
      setTimeoutImpl: vi.fn(),
      jobId: 'job-preview-goal-1',
    });

    expect(result).toEqual({ mode: 'preview-worker', triggered: true });
    expect(trigger).toHaveBeenCalledWith({
      jobId: 'job-preview-goal-1',
      env: { VERCEL: '1', VERCEL_ENV: 'preview' },
    });
    expect(processNext).not.toHaveBeenCalled();
  });

  it('retains the inline head start and delayed wake-up in Production', async () => {
    const processNext = vi.fn(async () => ({ processed: true }));
    const trigger = vi.fn(() => true);
    const setTimeoutImpl = vi.fn();

    const result = await kickGoalProcessing({}, 'goal-production', {
      env: { VERCEL: '1', VERCEL_ENV: 'production' },
      processNext,
      trigger,
      setTimeoutImpl,
    });

    expect(result).toEqual({ mode: 'production-inline', triggered: true });
    expect(processNext).toHaveBeenCalledWith({}, null);
    expect(trigger).not.toHaveBeenCalled();
    expect(setTimeoutImpl).toHaveBeenCalledTimes(2);
    expect(setTimeoutImpl.mock.calls[1][1]).toBe(2000);
    setTimeoutImpl.mock.calls[1][0]();
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('keeps both Production handoffs scoped to the inserted job id', async () => {
    const admin = {};
    const processNext = vi.fn(async () => ({ processed: true }));
    const trigger = vi.fn(() => true);
    const setTimeoutImpl = vi.fn();

    await kickGoalProcessing(admin, 'goal-production', {
      env: { VERCEL: '1', VERCEL_ENV: 'production' },
      processNext,
      trigger,
      setTimeoutImpl,
      jobId: 'exact-job-1',
    });

    expect(processNext).toHaveBeenCalledWith(admin, null, 'exact-job-1');
    expect(processNext).not.toHaveBeenCalledWith(admin, null);
    setTimeoutImpl.mock.calls[1][0]();
    expect(trigger).toHaveBeenCalledWith({ jobId: 'exact-job-1' });
  });
});
