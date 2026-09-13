import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentGoal: null,
  loadGoal: vi.fn(),
  logGoalEvent: vi.fn(),
  enqueueAgentJob: vi.fn(),
  postMessage: vi.fn(),
}));

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../_helpers.js', async () => {
  const actual = await vi.importActual('../_helpers.js');
  return {
    ...actual,
    loadGoal: mocks.loadGoal,
    logGoalEvent: mocks.logGoalEvent,
    enqueueAgentJob: mocks.enqueueAgentJob,
  };
});
vi.mock('../goal-messaging.js', () => ({ postMessage: mocks.postMessage }));

import { buildFeedbackApplicationVersion, handle } from './apply-feedback.js';
import { acceptedNativeGoalFixture } from '../../_shared/native-goal-authority.test-fixture.js';

function goal() {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    status: 'completed',
    updated_at: '2026-08-22T10:00:00.000Z',
    row_version: 1,
    data: { completed_at: '2026-08-22T09:59:00.000Z' },
    plan: {
      phases: [
        { name: 'Design', status: 'done' },
        { name: 'Build', status: 'done' },
        { name: 'QA', status: 'done' },
      ],
    },
  };
}

function qualityGoal() {
  const current = goal();
  return {
    ...current,
    row_version: 7,
    data: {
      ...current.data,
      prd_quality_attestation: {
        version: 'prd-quality-attestation-v2',
        ruleset_version: 'prd-quality-ruleset-v2',
        status: 'passed',
        artifact_hash: 'a'.repeat(64),
        scope_hash: 'b'.repeat(64),
      },
      prd_quality_validation: {
        status: 'passed',
        candidate_id: 'task-2',
        candidate_set: [{ id: 'task-2', artifact_hash: 'a'.repeat(64) }],
      },
      prd_quality_repair: null,
    },
  };
}

function task(phaseIndex, status = 'done') {
  return {
    id: `task-${phaseIndex}`,
    goal_id: 'goal-1',
    user_id: 'user-1',
    status,
    updated_at: `2026-08-22T10:0${phaseIndex}:00.000Z`,
    data: {
      goal_id: 'goal-1',
      phase_index: phaseIndex,
      output: `Prior phase ${phaseIndex} output`,
    },
  };
}

function comment(id, text, sequence) {
  return {
    id,
    goal_id: 'goal-1',
    user_id: 'user-1',
    element_selector: `#${id}`,
    element_text: `Element ${id}`,
    comment_text: text,
    status: 'applied',
    applied_at: `2026-08-22T11:0${sequence}:00.000Z`,
    updated_at: `2026-08-22T11:0${sequence}:00.001Z`,
    created_at: `2026-08-22T10:0${sequence}:00.000Z`,
  };
}

function payloadFor(comments, nonce) {
  return {
    type: 'orchestrate-goal',
    action: 'apply-feedback',
    goalId: 'goal-1',
    _userId: 'user-1',
    commentIds: comments.map((item) => item.id),
    feedbackApplicationNonce: nonce,
    feedbackApplicationVersion: buildFeedbackApplicationVersion({
      goalId: 'goal-1',
      userId: 'user-1',
      nonce,
      comments,
    }),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sameDatabaseValue(column, actual, expected) {
  if (column.includes('->>') && actual !== null && actual !== undefined) {
    return String(actual) === String(expected);
  }
  if ((column === 'data' || column === 'plan') && typeof expected === 'string') {
    try {
      return JSON.stringify(actual) === JSON.stringify(JSON.parse(expected));
    } catch {
      return false;
    }
  }
  if (column.endsWith('_at')) {
    const actualMs = Date.parse(actual);
    const expectedMs = Date.parse(expected);
    if (Number.isFinite(actualMs) && Number.isFinite(expectedMs)) return actualMs === expectedMs;
  }
  return actual === expected;
}

function databaseColumnValue(row, column) {
  const path = String(column).split(/->>?/);
  if (path.length === 1) return row?.[column];
  return path.reduce((value, key) => value?.[key], row);
}

function createAdmin(
  rows,
  {
    beforeFirstGoalUpdate = null,
    loseFirstGoalUpdateResponse = false,
    taskRows = [task(0), task(1), task(2)],
    loseFirstTaskUpdateResponse = false,
    beforeFirstTaskUpdate = null,
    rpcImplementation = null,
  } = {}
) {
  const operations = [];
  const goalOperations = [];
  const taskOperations = [];
  let firstGoalUpdate = true;
  let goalUpdateResponseLost = false;
  let taskUpdateResponseLost = false;
  let firstTaskUpdate = true;
  return {
    operations,
    goalOperations,
    taskOperations,
    taskRows,
    rpc: vi.fn(async (name, args) => {
      if (rpcImplementation) return rpcImplementation(name, args);
      if (name === 'reopen_quality_goal_revision') {
        return {
          data: { status: 'not_frozen', reason: 'legacy_goal_without_freeze' },
          error: null,
        };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    }),
    from: vi.fn((table) => {
      if (table === 'goals') {
        const state = { mode: 'select', patch: null, eq: {}, is: {} };
        const query = {
          select: vi.fn(() => query),
          update: vi.fn((patch) => {
            state.mode = 'update';
            state.patch = patch;
            return query;
          }),
          eq: vi.fn((column, value) => {
            state.eq[column] = value;
            return query;
          }),
          is: vi.fn((column, value) => {
            state.is[column] = value;
            return query;
          }),
          maybeSingle: vi.fn(async () => {
            if (state.mode === 'update' && firstGoalUpdate) {
              firstGoalUpdate = false;
              if (beforeFirstGoalUpdate) {
                const concurrent = beforeFirstGoalUpdate(clone(mocks.currentGoal));
                if (concurrent) mocks.currentGoal = concurrent;
              }
            }

            const matches =
              mocks.currentGoal &&
              Object.entries(state.eq).every(([column, expected]) =>
                sameDatabaseValue(column, databaseColumnValue(mocks.currentGoal, column), expected)
              ) &&
              Object.entries(state.is).every(
                ([column, expected]) => mocks.currentGoal[column] === expected
              );
            let selected = matches ? clone(mocks.currentGoal) : null;
            if (matches && state.mode === 'update') {
              mocks.currentGoal = { ...mocks.currentGoal, ...clone(state.patch) };
              if (Number.isInteger(mocks.currentGoal.row_version)) {
                mocks.currentGoal.row_version += 1;
              }
              selected = clone(mocks.currentGoal);
            }
            goalOperations.push({
              mode: state.mode,
              eq: { ...state.eq },
              is: { ...state.is },
              patch: state.patch ? clone(state.patch) : null,
              matched: Boolean(matches),
            });
            if (state.mode === 'update' && loseFirstGoalUpdateResponse && !goalUpdateResponseLost) {
              goalUpdateResponseLost = true;
              throw new Error('goal update response lost');
            }
            return { data: selected, error: null };
          }),
        };
        return query;
      }
      if (table === 'team_tasks') {
        const state = { mode: 'select', patch: null, eq: {}, is: {} };
        const matchingRows = () =>
          taskRows.filter((row) =>
            Object.entries(state.eq).every(([column, expected]) => {
              if (column === 'data->>goal_id') return row.data?.goal_id === expected;
              return sameDatabaseValue(column, row[column], expected);
            })
          );
        const query = {
          select: vi.fn(() => query),
          update: vi.fn((patch) => {
            state.mode = 'update';
            state.patch = patch;
            return query;
          }),
          eq: vi.fn((column, value) => {
            state.eq[column] = value;
            return query;
          }),
          is: vi.fn((column, value) => {
            state.is[column] = value;
            return query;
          }),
          maybeSingle: vi.fn(async () => {
            if (state.mode === 'update' && firstTaskUpdate) {
              firstTaskUpdate = false;
              if (beforeFirstTaskUpdate) beforeFirstTaskUpdate(taskRows);
            }
            const matchedRows = matchingRows();
            const selected = matchedRows.length === 1 ? matchedRows[0] : null;
            if (selected && state.mode === 'update') Object.assign(selected, clone(state.patch));
            taskOperations.push({
              mode: state.mode,
              eq: { ...state.eq },
              patch: state.patch ? clone(state.patch) : null,
              matched: Boolean(selected),
            });
            if (state.mode === 'update' && loseFirstTaskUpdateResponse && !taskUpdateResponseLost) {
              taskUpdateResponseLost = true;
              throw new Error('task update response lost');
            }
            return { data: selected ? clone(selected) : null, error: null };
          }),
          then(onFulfilled, onRejected) {
            return Promise.resolve({ data: matchingRows().map(clone), error: null }).then(
              onFulfilled,
              onRejected
            );
          },
        };
        return query;
      }
      if (table !== 'design_comments') throw new Error(`Unexpected table: ${table}`);
      const filters = { eq: {}, in: {} };
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column, value) => {
          filters.eq[column] = value;
          return query;
        }),
        in: vi.fn((column, values) => {
          filters.in[column] = values;
          return query;
        }),
        order: vi.fn(() => query),
        then(onFulfilled, onRejected) {
          const selected = rows.filter((row) => {
            for (const [column, value] of Object.entries(filters.eq)) {
              if (row[column] !== value) return false;
            }
            for (const [column, values] of Object.entries(filters.in)) {
              if (!values.includes(row[column])) return false;
            }
            return true;
          });
          operations.push({
            eq: { ...filters.eq },
            in: Object.fromEntries(
              Object.entries(filters.in).map(([column, values]) => [column, [...values]])
            ),
          });
          return Promise.resolve({ data: selected.map((row) => ({ ...row })), error: null }).then(
            onFulfilled,
            onRejected
          );
        },
      };
      return query;
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentGoal = goal();
  mocks.loadGoal.mockImplementation(async () => clone(mocks.currentGoal));
  mocks.logGoalEvent.mockResolvedValue();
  mocks.postMessage.mockResolvedValue();
  mocks.enqueueAgentJob.mockImplementation(async (_admin, job) => ({
    ...job,
    status: 'queued',
  }));
});

describe('apply-feedback stage', () => {
  it('routes accepted native feedback through a new canonical plan generation', async () => {
    const row = comment('comment-1', 'Increase the CTA contrast', 1);
    mocks.currentGoal = acceptedNativeGoalFixture({
      id: 'goal-1',
      status: 'completed',
      updated_at: '2026-08-22T10:00:00.000Z',
      row_version: 4,
      agent_team_id: 'old-team',
      team_id: 'old-team',
      plan: {
        phases: [
          { name: 'Design', status: 'done' },
          { name: 'Build', status: 'done' },
          { name: 'QA', status: 'done' },
        ],
      },
      data: {
        completed_at: '2026-08-22T09:59:00.000Z',
        goal_approvals: {
          execution: {
            version: 1,
            status: 'approved',
            snapshot_hash: 'old-execution-snapshot',
          },
        },
        execution_authorization: {
          status: 'approved',
          snapshot_hash: 'old-execution-snapshot',
          manifest: { version: 1 },
        },
        prd_quality_attestation: {
          status: 'passed',
          artifact_hash: 'artifact-hash',
          scope_hash: 'scope-hash',
        },
      },
    });
    const originalTasks = [task(0), task(1), task(2)];
    const admin = createAdmin([row], { taskRows: originalTasks });
    const payload = payloadFor([row], 'native-feedback-generation');

    const result = await handle(admin, payload, null);

    expect(result).toMatchObject({
      status: 'applied',
      revisionKind: 'native_execution_plan',
      resetTaskCount: 0,
    });
    expect(mocks.currentGoal).toMatchObject({
      status: 'planning',
      agent_team_id: null,
      team_id: null,
      data: {
        last_feedback_application_version: payload.feedbackApplicationVersion,
        native_execution_plan_revision: {
          status: 'requested',
          source: 'design_comments',
          feedback_application_version: payload.feedbackApplicationVersion,
        },
        execution_authorization: {
          status: 'invalidated',
          snapshot_hash: null,
        },
      },
    });
    expect(mocks.currentGoal.data.native_execution_plan_revision.feedback).toContain(
      'Increase the CTA contrast'
    );
    expect(mocks.currentGoal.data.user_feedback_addendum).toBeUndefined();
    expect(mocks.currentGoal.data.prd_quality_attestation).toBeUndefined();
    expect(admin.taskOperations).toHaveLength(0);
    expect(originalTasks.map((item) => item.status)).toEqual(['done', 'done', 'done']);
    expect(mocks.postMessage).not.toHaveBeenCalled();
    expect(mocks.enqueueAgentJob).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        user_id: 'user-1',
        payload: expect.objectContaining({
          action: 'pm-planning',
          goalId: 'goal-1',
          _userId: 'user-1',
          userId: 'user-1',
          user_id: 'user-1',
        }),
      }),
      { idempotent: true }
    );

    const firstContinuationId = mocks.enqueueAgentJob.mock.calls[0][1].id;
    const retry = await handle(admin, payload, null);
    expect(retry.status).toBe('already_applied');
    expect(admin.goalOperations.filter((operation) => operation.mode === 'update')).toHaveLength(1);
    expect(mocks.enqueueAgentJob.mock.calls[1][1].id).toBe(firstContinuationId);
  });

  it('applies only the exact payload batch and does not reappend historical feedback', async () => {
    const firstComment = comment('comment-1', 'Make the headline shorter', 1);
    const secondComment = comment('comment-2', 'Increase the CTA contrast', 2);
    const rows = [firstComment];
    const admin = createAdmin(rows);

    const first = await handle(admin, payloadFor([firstComment], 'application-one'), null);
    expect(first.status).toBe('applied');

    // The next feedback generation arrives after the first re-run completed.
    mocks.currentGoal.status = 'completed';
    mocks.currentGoal.updated_at = '2026-08-22T12:00:00.000Z';
    mocks.currentGoal.data.completed_at = '2026-08-22T11:59:00.000Z';
    mocks.currentGoal.plan.phases = mocks.currentGoal.plan.phases.map((phase) => ({
      ...phase,
      status: 'done',
    }));
    admin.taskRows.forEach((row, index) => {
      row.status = 'done';
      row.updated_at = `2026-08-22T12:0${index}:00.000Z`;
    });

    rows.push(secondComment);
    const second = await handle(admin, payloadFor([secondComment], 'application-two'), null);
    expect(second.status).toBe('applied');

    const addendum = mocks.currentGoal.data.user_feedback_addendum;
    expect(addendum.match(/Make the headline shorter/g)).toHaveLength(1);
    expect(addendum.match(/Increase the CTA contrast/g)).toHaveLength(1);
    expect(mocks.currentGoal.data.feedback_applications).toHaveLength(2);
    expect(mocks.currentGoal.status).toBe('active');
    expect(mocks.currentGoal.data.completed_at).toBeUndefined();
    expect(mocks.currentGoal.plan.phases.map((phase) => phase.status)).toEqual([
      'pending',
      'pending',
      'pending',
    ]);
    expect(admin.taskRows.map((row) => row.status)).toEqual(['planned', 'planned', 'planned']);
    expect(admin.taskRows.every((row) => row.data.output === undefined)).toBe(true);
    expect(admin.taskRows.map((row) => row.data.feedback_application_version)).toEqual([
      payloadFor([secondComment], 'application-two').feedbackApplicationVersion,
      payloadFor([secondComment], 'application-two').feedbackApplicationVersion,
      payloadFor([secondComment], 'application-two').feedbackApplicationVersion,
    ]);
    expect(admin.operations).toEqual([
      {
        eq: { goal_id: 'goal-1', user_id: 'user-1' },
        in: { id: ['comment-1'] },
      },
      {
        eq: { goal_id: 'goal-1', user_id: 'user-1' },
        in: { id: ['comment-2'] },
      },
    ]);

    const continuationPayloads = mocks.enqueueAgentJob.mock.calls.map((call) => call[1].payload);
    expect(continuationPayloads).toHaveLength(2);
    expect(admin.rpc).toHaveBeenCalledTimes(2);
    expect(continuationPayloads[1]).toMatchObject({
      action: 'execute-phase',
      goalId: 'goal-1',
      _userId: 'user-1',
      phaseIndex: 0,
    });
  });

  it('treats an edited or reopened generation as superseded', async () => {
    const original = comment('comment-1', 'Original text', 1);
    const edited = {
      ...original,
      comment_text: 'Edited text',
      status: 'open',
      updated_at: '2026-08-22T12:00:00.000Z',
    };
    const admin = createAdmin([edited]);

    const result = await handle(admin, payloadFor([original], 'old-application'), null);

    expect(result).toMatchObject({ status: 'superseded', commentCount: 0 });
    expect(admin.goalOperations).toHaveLength(0);
    expect(mocks.enqueueAgentJob).not.toHaveBeenCalled();
  });

  it('rejects a cross-tenant payload before reading comments', async () => {
    const admin = createAdmin([]);
    const payload = payloadFor([comment('comment-1', 'Change it', 1)], 'foreign-application');
    payload._userId = 'user-2';

    await expect(handle(admin, payload, null)).rejects.toThrow(
      'payload owner does not match goal owner'
    );
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('does not append the same immutable application twice but repairs its exact continuation', async () => {
    const row = comment('comment-1', 'Use a stronger headline', 1);
    const admin = createAdmin([row]);
    const payload = payloadFor([row], 'retryable-application');

    await handle(admin, payload, null);
    const beforeRetry = mocks.currentGoal.data.user_feedback_addendum;
    const retry = await handle(admin, payload, null);

    expect(retry.status).toBe('already_applied');
    expect(mocks.currentGoal.data.user_feedback_addendum).toBe(beforeRetry);
    expect(admin.goalOperations.filter((operation) => operation.mode === 'update')).toHaveLength(1);
    expect(mocks.enqueueAgentJob).toHaveBeenCalledTimes(2);
    expect(mocks.enqueueAgentJob.mock.calls[1][1].id).toBe(
      mocks.enqueueAgentJob.mock.calls[0][1].id
    );
    expect(mocks.enqueueAgentJob.mock.calls[1][2]).toEqual({ idempotent: true });
  });

  it('does not reset work that already progressed when the same application retries late', async () => {
    const row = comment('comment-1', 'Use a stronger headline', 1);
    const admin = createAdmin([row]);
    const payload = payloadFor([row], 'late-retry-application');

    await handle(admin, payload, null);
    admin.taskRows[0].status = 'done';
    admin.taskRows[0].data.output = 'New feedback-aware design output';
    admin.taskRows[0].updated_at = '2026-08-22T13:00:00.000Z';
    mocks.currentGoal.plan.phases[0].status = 'executing';
    const taskWritesBeforeRetry = admin.taskOperations.filter(
      (operation) => operation.mode === 'update'
    ).length;

    const retry = await handle(admin, payload, null);

    expect(retry.status).toBe('already_applied');
    expect(admin.taskRows[0]).toMatchObject({
      status: 'done',
      data: { output: 'New feedback-aware design output' },
    });
    expect(admin.taskOperations.filter((operation) => operation.mode === 'update')).toHaveLength(
      taskWritesBeforeRetry
    );
    expect(mocks.enqueueAgentJob).toHaveBeenCalledTimes(2);
  });

  it('merges a concurrent feedback batch after an exact goal CAS miss', async () => {
    const row = comment('comment-1', 'Use a clearer headline', 1);
    const concurrentApplication = {
      version: 'concurrent-feedback-version',
      comment_ids: ['comment-2'],
      applied_at: '2026-08-22T11:02:00.000Z',
    };
    const admin = createAdmin([row], {
      beforeFirstGoalUpdate(current) {
        return {
          ...current,
          updated_at: '2026-08-22T10:00:00.010Z',
          data: {
            ...current.data,
            user_feedback_addendum: 'Concurrent feedback already persisted',
            feedback_applications: [concurrentApplication],
          },
        };
      },
    });
    const payload = payloadFor([row], 'application-after-concurrent-batch');

    const result = await handle(admin, payload, null);

    expect(result.status).toBe('applied');
    expect(mocks.currentGoal.data.feedback_applications.map((entry) => entry.version)).toEqual([
      concurrentApplication.version,
      payload.feedbackApplicationVersion,
    ]);
    expect(mocks.currentGoal.data.user_feedback_addendum).toContain(
      'Concurrent feedback already persisted'
    );
    expect(mocks.currentGoal.data.user_feedback_addendum).toContain('Use a clearer headline');
    expect(admin.goalOperations.filter((operation) => operation.mode === 'update')).toMatchObject([
      { matched: false },
      { matched: true },
    ]);
    expect(mocks.enqueueAgentJob).toHaveBeenCalledTimes(1);
  });

  it('rejects a new feedback generation while a prior re-run is active', async () => {
    const first = comment('comment-1', 'First generation', 1);
    const second = comment('comment-2', 'Second generation', 2);
    const admin = createAdmin([first, second]);

    await handle(admin, payloadFor([first], 'first-active-generation'), null);

    await expect(
      handle(admin, payloadFor([second], 'second-active-generation'), null)
    ).rejects.toMatchObject({ code: 'FEEDBACK_GOAL_CONFLICT' });
    expect(mocks.enqueueAgentJob).toHaveBeenCalledTimes(1);
  });

  it('adopts an exact committed goal update after its response is lost', async () => {
    const row = comment('comment-1', 'Strengthen the CTA', 1);
    const admin = createAdmin([row], { loseFirstGoalUpdateResponse: true });
    const payload = payloadFor([row], 'response-loss-application');

    const result = await handle(admin, payload, null);

    expect(result.status).toBe('already_applied');
    expect(mocks.currentGoal.data.feedback_applications).toHaveLength(1);
    expect(mocks.currentGoal.data.feedback_applications[0].version).toBe(
      payload.feedbackApplicationVersion
    );
    expect(mocks.logGoalEvent).not.toHaveBeenCalled();
    expect(mocks.postMessage).not.toHaveBeenCalled();
    expect(mocks.enqueueAgentJob).toHaveBeenCalledTimes(1);
  });

  it('adopts an exact task reset after its database response is lost', async () => {
    const row = comment('comment-1', 'Rework the visual hierarchy', 1);
    const admin = createAdmin([row], { loseFirstTaskUpdateResponse: true });
    const payload = payloadFor([row], 'task-response-loss-application');

    const result = await handle(admin, payload, null);

    expect(result).toMatchObject({ status: 'applied', resetTaskCount: 3 });
    expect(admin.taskRows.map((item) => item.status)).toEqual(['planned', 'planned', 'planned']);
    expect(admin.taskRows.every((item) => item.data.output === undefined)).toBe(true);
    expect(mocks.enqueueAgentJob).toHaveBeenCalledTimes(1);
  });

  it('reopens completed_with_warnings goals and resets their exact current task set', async () => {
    const row = comment('comment-1', 'Tighten the final layout', 1);
    mocks.currentGoal.status = 'completed_with_warnings';
    const admin = createAdmin([row]);

    const result = await handle(admin, payloadFor([row], 'warnings-application'), null);

    expect(result).toMatchObject({ status: 'applied', resetTaskCount: 3 });
    expect(mocks.currentGoal.status).toBe('active');
    expect(admin.taskRows.map((item) => item.status)).toEqual(['planned', 'planned', 'planned']);
  });

  it('atomically reopens a frozen quality revision and archives its attestation', async () => {
    const row = comment('comment-1', 'Tighten the attested deliverable', 1);
    mocks.currentGoal = qualityGoal();
    const admin = createAdmin([row], {
      rpcImplementation: async (name, args) => {
        expect(name).toBe('reopen_quality_goal_revision');
        expect(args).toMatchObject({
          p_goal_id: 'goal-1',
          p_user_id: 'user-1',
          p_expected_status: 'completed',
          p_expected_row_version: 7,
        });
        expect(args.p_next_data.prd_quality_attestation).toBeUndefined();
        expect(args.p_next_data.prd_quality_validation).toBeUndefined();
        expect(args.p_next_data.prd_quality_repair).toBeUndefined();
        mocks.currentGoal = {
          ...mocks.currentGoal,
          status: 'active',
          data: clone(args.p_next_data),
          plan: clone(args.p_next_plan),
          updated_at: args.p_next_updated_at,
          row_version: 8,
        };
        return {
          data: { status: 'reopened', goal: clone(mocks.currentGoal) },
          error: null,
        };
      },
    });
    const payload = payloadFor([row], 'quality-revision');

    const result = await handle(admin, payload, null);

    expect(result).toMatchObject({ status: 'applied', resetTaskCount: 3 });
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(admin.goalOperations.filter((operation) => operation.mode === 'update')).toHaveLength(0);
    expect(mocks.currentGoal.data.prd_quality_history).toHaveLength(1);
    expect(mocks.currentGoal.data.prd_quality_history[0]).toMatchObject({
      revision_ref: payload.feedbackApplicationVersion,
      artifact_hash: 'a'.repeat(64),
      scope_hash: 'b'.repeat(64),
    });
    expect(mocks.currentGoal.data.quality_revision).toMatchObject({
      revision_ref: payload.feedbackApplicationVersion,
      reason: 'user_feedback',
    });
  });

  it('reopens and resets typed-parent tasks whose legacy JSON parent is blank', async () => {
    const row = comment('comment-1', 'Revise the typed-parent artifact', 1);
    mocks.currentGoal = qualityGoal();
    const typedOnlyTasks = [task(0), task(1), task(2)].map((item) => ({
      ...item,
      data: { ...item.data, goal_id: '' },
    }));
    const admin = createAdmin([row], {
      taskRows: typedOnlyTasks,
      rpcImplementation: async (_name, args) => {
        mocks.currentGoal = {
          ...mocks.currentGoal,
          status: 'active',
          data: clone(args.p_next_data),
          plan: clone(args.p_next_plan),
          updated_at: args.p_next_updated_at,
          row_version: 8,
        };
        return { data: { status: 'reopened', goal: clone(mocks.currentGoal) }, error: null };
      },
    });

    const result = await handle(admin, payloadFor([row], 'typed-only-quality-revision'), null);

    expect(result).toMatchObject({ status: 'applied', resetTaskCount: 3 });
    expect(admin.taskRows.map((item) => item.status)).toEqual(['planned', 'planned', 'planned']);
  });

  it('adopts only the exact frozen reopen when the RPC response is lost', async () => {
    const row = comment('comment-1', 'Revise the attested deliverable', 1);
    mocks.currentGoal = qualityGoal();
    const admin = createAdmin([row], {
      rpcImplementation: async (_name, args) => {
        mocks.currentGoal = {
          ...mocks.currentGoal,
          status: 'active',
          data: clone(args.p_next_data),
          plan: clone(args.p_next_plan),
          updated_at: args.p_next_updated_at,
          row_version: 8,
        };
        return { data: null, error: new Error('response lost after commit') };
      },
    });

    const result = await handle(admin, payloadFor([row], 'quality-response-loss'), null);

    expect(result.status).toBe('already_applied');
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(admin.goalOperations.filter((operation) => operation.mode === 'update')).toHaveLength(0);
  });

  it('adopts an already-reopened quality revision after task resets advanced its database version', async () => {
    const row = comment('comment-1', 'Continue the attested revision', 1);
    mocks.currentGoal = qualityGoal();
    const admin = createAdmin([row], {
      rpcImplementation: async (_name, args) => {
        mocks.currentGoal = {
          ...mocks.currentGoal,
          status: 'active',
          data: clone(args.p_next_data),
          plan: clone(args.p_next_plan),
          updated_at: new Date(Date.parse(args.p_next_updated_at) + 5_000).toISOString(),
          row_version: 12,
        };
        return {
          data: { status: 'already_reopened', goal: clone(mocks.currentGoal) },
          error: null,
        };
      },
    });

    const result = await handle(admin, payloadFor([row], 'quality-already-reopened'), null);

    expect(result.status).toBe('already_applied');
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(admin.goalOperations.filter((operation) => operation.mode === 'update')).toHaveLength(0);
    expect(admin.taskRows.map((item) => item.status)).toEqual(['planned', 'planned', 'planned']);
  });

  it('never falls back to a direct update when a frozen reopen RPC fails', async () => {
    const row = comment('comment-1', 'Revise the attested deliverable', 1);
    mocks.currentGoal = qualityGoal();
    const admin = createAdmin([row], {
      rpcImplementation: async () => ({ data: null, error: new Error('database unavailable') }),
    });

    await expect(
      handle(admin, payloadFor([row], 'quality-rpc-failure'), null)
    ).rejects.toMatchObject({ code: 'FEEDBACK_GOAL_UPDATE_RECONCILIATION_REQUIRED' });
    expect(admin.rpc).toHaveBeenCalledTimes(3);
    expect(admin.goalOperations.filter((operation) => operation.mode === 'update')).toHaveLength(0);
  });

  it('does not reset a task moved to another goal after the snapshot was loaded', async () => {
    const row = comment('comment-1', 'Rebuild the hero', 1);
    const admin = createAdmin([row], {
      beforeFirstTaskUpdate(taskRows) {
        taskRows[0].data = { ...taskRows[0].data, goal_id: 'goal-2' };
        taskRows[0].updated_at = '2026-08-22T12:30:00.000Z';
      },
    });

    await expect(
      handle(admin, payloadFor([row], 'moved-task-application'), null)
    ).rejects.toMatchObject({ code: 'FEEDBACK_TASK_CONFLICT' });

    expect(admin.taskRows[0]).toMatchObject({
      status: 'done',
      data: { goal_id: 'goal-2', output: 'Prior phase 0 output' },
    });
    expect(mocks.enqueueAgentJob).not.toHaveBeenCalled();
  });
});
