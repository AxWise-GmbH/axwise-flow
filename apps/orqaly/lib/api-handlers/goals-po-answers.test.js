import { describe, expect, it, vi } from 'vitest';
import { handleAnswerPoQuestions } from './goals.js';

const USER = { id: 'user-1' };
const SUBMITTED_AT = Date.parse('2026-08-22T16:00:00.000Z');

function expertGoal(overrides = {}) {
  return {
    id: 'goal-1',
    user_id: USER.id,
    status: 'awaiting_po_input',
    po_depth: 'expert',
    updated_at: '2026-08-22T15:59:00.000Z',
    data: {
      po_questions: ['Who is affected?', 'What outcome is required?'],
      ...overrides.data,
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'data')),
  };
}

function submission(overrides = {}) {
  return {
    id: 'goal-1',
    answers: [
      { question: 'Who is affected?', answer: '  Clinic operators  ' },
      { question: 'What outcome is required?', answer: 'Reduce missed appointments' },
    ],
    ...overrides,
  };
}

function createAdmin(
  initialGoal,
  {
    enqueueError = null,
    enqueueThrows = null,
    enqueueCommitsBeforeThrow = false,
    inspectionError = null,
    beforeTransition = null,
    beforeEnqueueFailure = null,
    transitionThrowsAfterCommit = null,
  } = {}
) {
  let goal = structuredClone(initialGoal);
  let pendingBeforeTransition = beforeTransition;
  const jobs = [];
  const logs = [];

  function fieldValue(field) {
    if (field === 'id') return goal.id;
    if (field === 'user_id') return goal.user_id;
    if (field === 'status') return goal.status;
    if (field === 'po_depth') return goal.po_depth;
    if (field === 'updated_at') return goal.updated_at;
    if (field === 'data->po_questions') return JSON.stringify(goal.data?.po_questions);
    if (field === 'data->po_answer_submission->>id') {
      return goal.data?.po_answer_submission?.id;
    }
    return undefined;
  }

  function matches(filters) {
    return filters.every(([field, expected]) => {
      const current = fieldValue(field);
      return current === expected || String(current) === String(expected);
    });
  }

  function goalSelectQuery() {
    const filters = [];
    const query = {
      eq(field, value) {
        filters.push([field, value]);
        return query;
      },
      async maybeSingle() {
        return {
          data: matches(filters) ? structuredClone(goal) : null,
          error: null,
        };
      },
    };
    return query;
  }

  function goalUpdateQuery(patch) {
    const filters = [];
    const query = {
      eq(field, value) {
        filters.push([field, value]);
        return query;
      },
      select() {
        return query;
      },
      async maybeSingle() {
        if (patch.status === 'analyzing' && pendingBeforeTransition) {
          pendingBeforeTransition(goal);
          pendingBeforeTransition = null;
        }
        if (!matches(filters)) return { data: null, error: null };
        goal = { ...goal, ...structuredClone(patch) };
        if (patch.status === 'analyzing' && transitionThrowsAfterCommit) {
          throw transitionThrowsAfterCommit;
        }
        return { data: { id: goal.id, status: goal.status }, error: null };
      },
    };
    return query;
  }

  const admin = {
    get goal() {
      return structuredClone(goal);
    },
    _mutateGoal(patch) {
      goal = { ...goal, ...structuredClone(patch) };
    },
    jobs,
    logs,
    from(table) {
      if (table === 'goals') {
        return {
          select: () => goalSelectQuery(),
          update: (patch) => goalUpdateQuery(patch),
        };
      }
      if (table === 'agent_jobs') {
        const jobFieldValue = (job, field) => {
          if (field.startsWith('payload->>'))
            return job.payload?.[field.slice('payload->>'.length)];
          return job[field];
        };
        const matchingJob = (filters) =>
          jobs.find((candidate) =>
            filters.every(
              ([field, expected]) =>
                jobFieldValue(candidate, field) === expected ||
                String(jobFieldValue(candidate, field)) === String(expected)
            )
          );
        return {
          insert: async (row) => {
            if ((enqueueError || enqueueThrows) && beforeEnqueueFailure) {
              beforeEnqueueFailure(goal);
            }
            if (enqueueThrows) {
              if (enqueueCommitsBeforeThrow) {
                jobs.push({
                  ...structuredClone(row),
                  worker_scope: row.payload?._workerDeployment ? 'preview' : 'production',
                });
              }
              throw enqueueThrows;
            }
            if (!enqueueError) {
              jobs.push({
                ...structuredClone(row),
                worker_scope: row.payload?._workerDeployment ? 'preview' : 'production',
              });
            }
            return { error: enqueueError };
          },
          select: () => {
            const filters = [];
            const query = {
              eq(field, value) {
                filters.push([field, value]);
                return query;
              },
              async maybeSingle() {
                if (inspectionError) return { data: null, error: inspectionError };
                const job = matchingJob(filters);
                return { data: job ? structuredClone(job) : null, error: null };
              },
            };
            return query;
          },
          update: (patch) => {
            const filters = [];
            const query = {
              eq(field, value) {
                filters.push([field, value]);
                return query;
              },
              select() {
                return query;
              },
              async maybeSingle() {
                const job = matchingJob(filters);
                if (!job) return { data: null, error: null };
                Object.assign(job, structuredClone(patch));
                return { data: structuredClone(job), error: null };
              },
            };
            return query;
          },
        };
      }
      if (table === 'goal_log') {
        return {
          insert: async (row) => {
            logs.push(structuredClone(row));
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
  return admin;
}

function options(overrides = {}) {
  return {
    env: {
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VERCEL_DEPLOYMENT_ID: 'dpl_po_answers',
    },
    now: () => SUBMITTED_AT,
    kickProcessing: vi.fn(async () => ({ mode: 'preview-worker', triggered: true })),
    ...overrides,
  };
}

describe('Expert PO answer submission', () => {
  it('CAS-saves exact answers, queues a deployment-bound continuation, logs, and wakes its exact id', async () => {
    const admin = createAdmin(expertGoal());
    const runtime = options();

    const result = await handleAnswerPoQuestions(admin, USER, submission(), runtime);

    expect(result).toMatchObject({
      status: 202,
      data: {
        goalId: 'goal-1',
        status: 'analyzing',
        job_id: expect.any(String),
        question_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        pickup_requested: true,
      },
    });
    expect(admin.goal).toMatchObject({
      status: 'analyzing',
      data: {
        po_answers: [
          { question: 'Who is affected?', answer: 'Clinic operators' },
          { question: 'What outcome is required?', answer: 'Reduce missed appointments' },
        ],
        po_answer_submission: {
          question_hash: result.data.question_hash,
          question_count: 2,
          submitted_by: USER.id,
        },
      },
    });
    expect(admin.jobs).toHaveLength(1);
    expect(admin.jobs[0]).toMatchObject({
      id: result.data.job_id,
      status: 'queued',
      payload: {
        type: 'orchestrate-goal',
        action: 'po-analysis-continue',
        goalId: 'goal-1',
        _userId: USER.id,
        _workerDeployment: 'vercel-deployment:dpl_po_answers',
      },
    });
    expect(admin.logs).toEqual([
      expect.objectContaining({
        goal_id: 'goal-1',
        event_type: 'po_answers_submitted',
        details: expect.objectContaining({ job_id: result.data.job_id, question_count: 2 }),
      }),
    ]);
    expect(runtime.kickProcessing).toHaveBeenCalledWith(admin, 'goal-1', {
      jobId: result.data.job_id,
    });
  });

  it('fails closed when the exact Preview continuation wake is rejected', async () => {
    const admin = createAdmin(expertGoal());
    const runtime = options({
      kickProcessing: vi.fn(async () => ({ mode: 'preview-worker', triggered: false })),
    });

    const result = await handleAnswerPoQuestions(admin, USER, submission(), runtime);

    expect(result).toMatchObject({
      status: 503,
      error:
        'Goal processing could not be handed to the Preview worker. The exact goal state was restored; refresh and retry.',
      data: {
        goal_id: 'goal-1',
        job_id: admin.jobs[0].id,
        reconciliation_state: 'terminalized-safe:rolled-back',
        retry_safe: true,
      },
    });
    expect(admin.jobs).toHaveLength(1);
    expect(admin.jobs[0]).toMatchObject({
      status: 'failed',
      error: 'Preview exact goal handoff was unavailable: answer-po-questions',
    });
    expect(admin.goal).toMatchObject({ status: 'awaiting_po_input', data: expertGoal().data });
    expect(runtime.kickProcessing).toHaveBeenCalledWith(admin, 'goal-1', {
      jobId: admin.jobs[0].id,
    });
  });

  it.each([
    ['undefined', undefined],
    ['an empty object', {}],
  ])('fails closed when the Preview continuation returns %s', async (_label, handoffResult) => {
    const admin = createAdmin(expertGoal());
    const runtime = options({
      kickProcessing: vi.fn(async () => handoffResult),
    });

    const result = await handleAnswerPoQuestions(admin, USER, submission(), runtime);

    expect(result).toMatchObject({
      status: 503,
      data: {
        goal_id: 'goal-1',
        job_id: admin.jobs[0].id,
        reconciliation_state: 'terminalized-safe:rolled-back',
        retry_safe: true,
      },
    });
    expect(admin.jobs[0]).toMatchObject({
      status: 'failed',
      error: 'Preview exact goal handoff was unavailable: answer-po-questions',
    });
    expect(admin.goal).toMatchObject({ status: 'awaiting_po_input', data: expertGoal().data });
  });

  it('can retry the same PO gate after a proven rejected wake without duplicating live work', async () => {
    const admin = createAdmin(expertGoal());
    const rejected = options({
      kickProcessing: vi.fn(async () => ({ mode: 'preview-worker', triggered: false })),
    });

    const first = await handleAnswerPoQuestions(admin, USER, submission(), rejected);
    const accepted = await handleAnswerPoQuestions(admin, USER, submission(), options());

    expect(first).toMatchObject({ status: 503, data: { retry_safe: true } });
    expect(accepted).toMatchObject({ status: 202, data: { status: 'analyzing' } });
    expect(admin.jobs.filter((job) => job.status === 'queued')).toHaveLength(1);
    expect(admin.jobs.filter((job) => job.status === 'failed')).toHaveLength(1);
  });

  it('parks instead of rolling back when the rejected handoff job may have been leased', async () => {
    const admin = createAdmin(expertGoal());
    const runtime = options({
      kickProcessing: vi.fn(async () => {
        admin.jobs[0].status = 'running';
        return { mode: 'preview-worker', triggered: false };
      }),
    });

    const result = await handleAnswerPoQuestions(admin, USER, submission(), runtime);

    expect(result).toMatchObject({
      status: 503,
      data: {
        goal_id: 'goal-1',
        job_id: admin.jobs[0].id,
        reconciliation_state: 'leased:parked',
        retry_safe: false,
      },
    });
    expect(admin.jobs[0].status).toBe('running');
    expect(admin.goal).toMatchObject({
      status: 'needs_human',
      data: {
        goal_handoff_reconciliation: {
          status: 'required',
          job_id: admin.jobs[0].id,
          job_state: 'leased',
        },
      },
    });
  });

  it('never downgrades a concurrently completed-with-warnings goal while parking a lost handoff', async () => {
    const admin = createAdmin(expertGoal());
    let completedData;
    const runtime = options({
      kickProcessing: vi.fn(async () => {
        admin.jobs[0].status = 'running';
        completedData = { ...admin.goal.data, delivery_marker: 'kept' };
        admin._mutateGoal({
          status: 'completed_with_warnings',
          data: completedData,
          updated_at: '2026-08-22T16:01:00.000Z',
        });
        return { mode: 'preview-worker', triggered: false };
      }),
    });

    const result = await handleAnswerPoQuestions(admin, USER, submission(), runtime);

    expect(result).toMatchObject({
      status: 503,
      data: {
        reconciliation_state: 'leased:goal-terminal',
        retry_safe: false,
      },
    });
    expect(admin.goal).toEqual(
      expect.objectContaining({
        status: 'completed_with_warnings',
        data: completedData,
        updated_at: '2026-08-22T16:01:00.000Z',
      })
    );
    expect(admin.goal.data.goal_handoff_reconciliation).toBeUndefined();
  });

  it('fails closed and parks without rollback when exact job inspection is unknown', async () => {
    const admin = createAdmin(expertGoal(), {
      inspectionError: new Error('queue read unavailable'),
    });
    const runtime = options({
      kickProcessing: vi.fn(async () => ({ mode: 'preview-worker', triggered: false })),
    });

    const result = await handleAnswerPoQuestions(admin, USER, submission(), runtime);

    expect(result).toMatchObject({
      status: 503,
      data: {
        goal_id: 'goal-1',
        job_id: admin.jobs[0].id,
        reconciliation_state: 'unknown:parked',
        retry_safe: false,
      },
    });
    expect(admin.goal.status).toBe('needs_human');
  });

  it('hides foreign goals and never mutates or queues work for them', async () => {
    const initial = expertGoal();
    const admin = createAdmin(initial);
    const runtime = options();

    const result = await handleAnswerPoQuestions(admin, { id: 'user-2' }, submission(), runtime);

    expect(result).toEqual({ status: 404, error: 'Goal not found' });
    expect(admin.goal).toEqual(initial);
    expect(admin.jobs).toEqual([]);
    expect(runtime.kickProcessing).not.toHaveBeenCalled();
  });

  it('rejects a goal that has already left the PO input gate', async () => {
    const initial = expertGoal({ status: 'analyzing' });
    const admin = createAdmin(initial);

    const result = await handleAnswerPoQuestions(admin, USER, submission(), options());

    expect(result).toEqual({ status: 409, error: 'Goal is not awaiting Expert PO answers' });
    expect(admin.goal).toEqual(initial);
    expect(admin.jobs).toEqual([]);
  });

  it('rejects a non-Expert goal even when it carries legacy PO questions', async () => {
    const initial = expertGoal({ po_depth: 'standard' });
    const admin = createAdmin(initial);

    const result = await handleAnswerPoQuestions(admin, USER, submission(), options());

    expect(result).toEqual({ status: 409, error: 'Goal is not at an Expert PO question gate' });
    expect(admin.goal).toEqual(initial);
    expect(admin.jobs).toEqual([]);
  });

  it('fails before reading or mutating a Preview goal without an exact deployment identity', async () => {
    const initial = expertGoal();
    const admin = createAdmin(initial);
    const runtime = options({ env: { VERCEL: '1', VERCEL_ENV: 'preview' } });

    const result = await handleAnswerPoQuestions(admin, USER, submission(), runtime);

    expect(result).toEqual({ status: 503, error: 'Preview deployment identity is unavailable' });
    expect(admin.goal).toEqual(initial);
    expect(admin.jobs).toEqual([]);
    expect(runtime.kickProcessing).not.toHaveBeenCalled();
  });

  it('rejects stale question text even when the submitted array has the current length', async () => {
    const initial = expertGoal();
    const admin = createAdmin(initial);
    const stale = submission({
      answers: [
        { question: 'Who was affected before?', answer: 'Clinic operators' },
        { question: 'What outcome is required?', answer: 'Reduce missed appointments' },
      ],
    });

    const result = await handleAnswerPoQuestions(admin, USER, stale, options());

    expect(result).toEqual({
      status: 409,
      error: 'The PO questions changed. Refresh before submitting answers.',
    });
    expect(admin.goal).toEqual(initial);
    expect(admin.jobs).toEqual([]);
  });

  it('loses the CAS if questions rotate after verification, even without an updated_at change', async () => {
    const initial = expertGoal();
    const admin = createAdmin(initial, {
      beforeTransition: (goal) => {
        goal.data.po_questions = ['Who is newly affected?', 'What outcome is required?'];
      },
    });

    const result = await handleAnswerPoQuestions(admin, USER, submission(), options());

    expect(result.status).toBe(409);
    expect(admin.goal.status).toBe('awaiting_po_input');
    expect(admin.goal.data.po_answers).toBeUndefined();
    expect(admin.jobs).toEqual([]);
  });

  it('continues from the exact PO submission when its transition response is lost', async () => {
    const admin = createAdmin(expertGoal(), {
      transitionThrowsAfterCommit: new Error('goal transition response lost'),
    });
    const runtime = options();

    const result = await handleAnswerPoQuestions(admin, USER, submission(), runtime);

    expect(result).toMatchObject({
      status: 202,
      data: {
        goalId: 'goal-1',
        status: 'analyzing',
        job_id: expect.any(String),
      },
    });
    expect(admin.goal).toMatchObject({
      status: 'analyzing',
      data: {
        po_answer_submission: {
          id: expect.any(String),
          question_hash: result.data.question_hash,
        },
      },
    });
    expect(admin.jobs).toHaveLength(1);
    expect(runtime.kickProcessing).toHaveBeenCalledTimes(1);
  });

  it('restores the exact PO gate snapshot when the continuation insert fails', async () => {
    const initial = expertGoal();
    const admin = createAdmin(initial, { enqueueError: new Error('queue unavailable') });
    const runtime = options();

    const result = await handleAnswerPoQuestions(admin, USER, submission(), runtime);

    expect(result).toEqual({
      status: 503,
      error: 'PRD continuation could not be queued. Your goal remains at the PO question gate.',
    });
    expect(admin.goal.status).toBe('awaiting_po_input');
    expect(admin.goal.data).toEqual(initial.data);
    expect(admin.jobs).toEqual([]);
    expect(runtime.kickProcessing).not.toHaveBeenCalled();
  });

  it('restores the exact PO gate when a rejected insert is verified absent', async () => {
    const initial = expertGoal();
    const admin = createAdmin(initial, { enqueueThrows: new Error('transport unavailable') });
    const runtime = options();

    const result = await handleAnswerPoQuestions(admin, USER, submission(), runtime);

    expect(result).toEqual({
      status: 503,
      error: 'PRD continuation could not be queued. Your goal remains at the PO question gate.',
    });
    expect(admin.goal.status).toBe('awaiting_po_input');
    expect(admin.goal.data).toEqual(initial.data);
    expect(admin.jobs).toEqual([]);
    expect(runtime.kickProcessing).not.toHaveBeenCalled();
  });

  it('keeps an exact continuation committed before a transport rejection', async () => {
    const admin = createAdmin(expertGoal(), {
      enqueueThrows: new Error('response lost after commit'),
      enqueueCommitsBeforeThrow: true,
    });
    const runtime = options();

    const result = await handleAnswerPoQuestions(admin, USER, submission(), runtime);

    expect(result).toMatchObject({
      status: 202,
      data: { status: 'analyzing', job_id: admin.jobs[0].id, pickup_requested: true },
    });
    expect(admin.goal.status).toBe('analyzing');
    expect(admin.jobs).toHaveLength(1);
    expect(runtime.kickProcessing).toHaveBeenCalledWith(admin, 'goal-1', {
      jobId: admin.jobs[0].id,
    });
  });

  it('cannot bypass the decision-bound AxWise scope confirmation path', async () => {
    const initial = expertGoal({
      data: {
        axwise_customer_intelligence: {
          status: 'human_clarification',
          decision_id: 'decision-1',
        },
      },
    });
    const admin = createAdmin(initial);

    const result = await handleAnswerPoQuestions(admin, USER, submission(), options());

    expect(result).toEqual({
      status: 409,
      error: 'This goal is awaiting AxWise scope confirmation, not Expert PO answers',
    });
    expect(admin.goal).toEqual(initial);
    expect(admin.jobs).toEqual([]);
  });
});
