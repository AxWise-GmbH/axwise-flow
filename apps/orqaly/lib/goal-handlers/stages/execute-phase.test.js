import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../_helpers.js', () => ({
  loadGoal: vi.fn(),
  updateGoal: vi.fn(async () => {}),
  enqueueAgentJob: vi.fn(async (admin, row) => {
    const inserted = {
      ...row,
      id: 'agent-job-1',
      status: 'queued',
      worker_scope: 'preview',
    };
    await admin.from('agent_jobs').insert(inserted);
    return inserted;
  }),
  enqueueGoalAction: vi.fn(async () => {}),
  triggerProcessNext: vi.fn(),
  checkBudget: vi.fn(() => ({ ok: true, warning: false })),
  pickTestModel: vi.fn(() => ({})),
  logGoalEvent: vi.fn(async () => {}),
}));
vi.mock('../goal-messaging.js', () => ({
  consiliumBriefTeamLead: vi.fn(async () => {}),
  teamLeadInstruct: vi.fn(async () => {}),
}));
vi.mock('../../usage-handlers/tracked-llm.js', () => ({
  executeLlmTracked: vi.fn(async () => ({ content: 'brief' })),
}));
vi.mock('../../_shared/kb-scope.js', () => ({ orgScopeFromGoal: vi.fn(() => ({})) }));
vi.mock('../approval-audit.js', () => ({
  buildContextApprovalSnapshot: vi.fn(() => ({})),
  buildExecutionApprovalSnapshot: vi.fn(() => ({})),
  isApprovalCurrent: vi.fn(() => true),
  pendingApproval: vi.fn(() => ({ snapshot_hash: 'pending-hash' })),
}));
vi.mock('../execution-authorization.js', () => ({
  loadExecutionAuthorizationManifest: vi.fn(),
}));
vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handle as handleImpl } from './execute-phase.js';
import { loadGoal, triggerProcessNext, updateGoal } from '../_helpers.js';
import { loadExecutionAuthorizationManifest } from '../execution-authorization.js';

const TASK = {
  id: 't1',
  user_id: 'u1',
  goal_id: 'g1',
  title: 'Task',
  status: 'planned',
  job_pool_id: 'jp1',
  agent_id: 'a1',
  assigned_to: 'Agent One',
  data: { goal_id: 'g1', phase_index: 0, tool_requirements: ['doc-generator'] },
};

function handle(admin, payload, req) {
  return handleImpl(admin, { _userId: 'u1', userId: 'u1', user_id: 'u1', ...payload }, req);
}

const MANIFEST = {
  version: 'orqaly_execution_authorization_v1',
  goal_id: 'g1',
  team_id: 'team1',
  team_members: [{ agent_id: 'a1', team_role: 'member' }],
  agent_grants: [{ agent_id: 'a1', tool_ids: ['tool-doc-generator'] }],
  tasks: [
    {
      task_id: 't1',
      agent_id: 'a1',
      required_tool_ids: ['tool-doc-generator'],
      granted_tool_ids: ['tool-doc-generator'],
      tool_grants: [{ tool_id: 'tool-doc-generator', allowed_actions: [] }],
    },
  ],
  valid: true,
  issues: [],
};

function goal(data = {}) {
  return {
    id: 'g1',
    user_id: 'u1',
    status: 'active',
    title: 'Ship it',
    agent_team_id: 'team1',
    workflow_id: null,
    data: {
      goal_approvals: { context: { status: 'approved' }, execution: { snapshot_hash: 'hash-1' } },
      execution_authorization: {
        status: 'approved',
        snapshot_hash: 'hash-1',
        manifest: MANIFEST,
      },
      ...data,
    },
    plan: { phases: [{ name: 'P1', status: 'pending', jobs: [] }] },
  };
}

function feedbackGoal(version, data = {}) {
  const current = goal({
    last_feedback_application_version: version,
    ...data,
  });
  current.iteration = 0;
  current.plan.phases[0].feedback = {
    kind: 'feedback_application',
    application_version: version,
    retry_count: Number(current.data.retry_count || 0),
    iteration: 0,
  };
  return current;
}

function makeAdmin(jobs, taskRows = [TASK]) {
  const selects = [];
  const results = {
    agents: {
      data: [{ id: 'a1', name: 'Agent One', category: 'engineer', metadata: {} }],
    },
    team_tasks: { data: taskRows },
    agent_jobs: { error: null },
    knowledge_documents: { error: null },
    workflows: { data: null },
    jobs: {
      data: taskRows.map((task) => ({
        id: task.job_pool_id,
        user_id: task.user_id,
        goal_id: task.goal_id,
        status: 'active',
      })),
    },
  };
  const build = (table) => {
    const result = results[table] ?? { data: [] };
    const filters = [];
    const builder = {
      select: (columns) => {
        selects.push({ table, columns });
        return builder;
      },
      eq: (column, value) => {
        filters.push([column, value]);
        return builder;
      },
      in: () => builder,
      limit: () => builder,
      order: () => builder,
      single: async () => result,
      maybeSingle: async () =>
        table === 'team_tasks'
          ? {
              data: {
                id: filters.find(([column]) => column === 'id')?.[1] || taskRows[0]?.id,
                status: 'todo',
              },
              error: null,
            }
          : result,
      insert: (arg) => {
        if (table === 'agent_jobs') jobs.push(arg);
        return builder;
      },
      update: () => builder,
      then: (resolve) => Promise.resolve(result).then(resolve),
    };
    return builder;
  };
  return { from: vi.fn(build), selects };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadExecutionAuthorizationManifest.mockResolvedValue(structuredClone(MANIFEST));
});

describe('execute-phase authorization boundary', () => {
  it('rejects disagreeing queued owner aliases before loading the goal', async () => {
    const admin = makeAdmin([]);

    await expect(
      handleImpl(
        admin,
        {
          goalId: 'g1',
          phaseIndex: 0,
          _userId: 'u1',
          userId: 'victim-user',
          user_id: 'u1',
        },
        {}
      )
    ).rejects.toMatchObject({ code: 'AGENT_JOB_OWNER_VALIDATION_ERROR' });

    expect(loadGoal).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('enqueues exactly the task-scoped tool grant, never the user tool catalogue', async () => {
    loadGoal.mockResolvedValue(goal());
    const jobs = [];

    await handle(makeAdmin(jobs), { goalId: 'g1', phaseIndex: 0 }, {});

    const executeJob = jobs.find((job) => job.payload?.type === 'execute-task');
    expect(executeJob.user_id).toBe('u1');
    expect(executeJob.payload).toMatchObject({
      taskId: 't1',
      _userId: 'u1',
      userId: 'u1',
      user_id: 'u1',
      toolIds: ['tool-doc-generator'],
      authorizationSnapshotHash: 'hash-1',
    });
    expect(executeJob.payload).not.toHaveProperty('agentContext');
    expect(executeJob.payload).not.toHaveProperty('jobDescription');
    expect(executeJob.payload).not.toHaveProperty('jobRequirements');
    expect(triggerProcessNext).toHaveBeenCalledWith({ jobId: 'agent-job-1' });
    expect(triggerProcessNext).not.toHaveBeenCalledWith();
  });

  it('never enqueues a non-retired task from an older AxWise attempt', async () => {
    const currentTask = {
      ...TASK,
      data: { ...TASK.data, axwise_decision_id: 'decision-new' },
    };
    const oldTask = {
      ...TASK,
      id: 't-old',
      job_pool_id: 'jp-old',
      status: 'todo',
      data: { ...TASK.data, axwise_decision_id: 'decision-old' },
    };
    loadGoal.mockResolvedValue(goal({ axwise_orchestration: { decision_id: 'decision-new' } }));
    const jobs = [];

    await handle(makeAdmin(jobs, [oldTask, currentTask]), { goalId: 'g1', phaseIndex: 0 }, {});

    const executeJobs = jobs.filter((job) => job.payload?.type === 'execute-task');
    expect(executeJobs).toHaveLength(1);
    expect(executeJobs[0].payload.taskId).toBe('t1');
  });

  it('executes only the current durable task materialization', async () => {
    const currentGoal = goal({
      team_formation_attempt: {
        version: 'orqaly_team_formation_attempt_v1',
        attempt_id: 'ntf-current',
        status: 'completed',
      },
      team_work_materialization: {
        version: 'orqaly_team_work_materialization_v1',
        formation_attempt: 'ntf-current',
      },
    });
    const currentTask = {
      ...TASK,
      materialization_attempt: 'ntf-current',
      data: { ...TASK.data, materialization_attempt: 'ntf-current' },
    };
    const staleTask = {
      ...TASK,
      id: 't-stale',
      job_pool_id: 'jp-stale',
      materialization_attempt: 'ntf-stale',
      data: { ...TASK.data, materialization_attempt: 'ntf-stale' },
    };
    loadGoal.mockResolvedValue(currentGoal);
    const jobs = [];
    const admin = makeAdmin(jobs, [staleTask, currentTask]);

    await handle(admin, { goalId: 'g1', phaseIndex: 0 }, {});

    const executeJobs = jobs.filter((job) => job.payload?.type === 'execute-task');
    expect(executeJobs.map((job) => job.payload.taskId)).toEqual(['t1']);
    const taskSelects = admin.selects.filter(({ table }) => table === 'team_tasks');
    expect(taskSelects).toHaveLength(4);
    expect(
      taskSelects.filter(({ columns }) => columns.includes('materialization_attempt'))
    ).toHaveLength(3);
  });

  it('supports an explicitly approved one-shot tool-free retry', async () => {
    loadGoal.mockResolvedValue(goal({ skip_tools: true, skip_tools_reason: 'user approved' }));
    loadExecutionAuthorizationManifest.mockResolvedValue({
      ...structuredClone(MANIFEST),
      tool_mode: 'skipped_by_user',
      tasks: [
        {
          ...MANIFEST.tasks[0],
          declared_tool_ids: ['tool-doc-generator'],
          waived_tool_ids: ['tool-doc-generator'],
          required_tool_ids: [],
          granted_tool_ids: [],
          tool_grants: [],
        },
      ],
    });
    const jobs = [];

    await handle(makeAdmin(jobs), { goalId: 'g1', phaseIndex: 0 }, {});

    expect(jobs.find((job) => job.payload?.type === 'execute-task').payload.toolIds).toEqual([]);
    const patchCall = updateGoal.mock.calls.find((call) => call[2]?.data && call[2]?.plan);
    expect('skip_tools' in patchCall[2].data).toBe(false);
  });

  it('honors the approved existing-only projection without reopening the tool gate', async () => {
    const task = {
      ...TASK,
      data: {
        ...TASK.data,
        tool_requirements: ['web-search', 'doc-generator'],
      },
    };
    loadGoal.mockResolvedValue(
      goal({ tool_mode: 'existing_only', required_tools: ['tool-doc-generator'] })
    );
    loadExecutionAuthorizationManifest.mockResolvedValue({
      ...structuredClone(MANIFEST),
      tasks: [
        {
          ...MANIFEST.tasks[0],
          declared_tool_ids: ['tool-web-search', 'tool-doc-generator'],
          waived_tool_ids: ['tool-web-search'],
          required_tool_ids: ['tool-doc-generator'],
        },
      ],
    });
    const jobs = [];

    const result = await handle(makeAdmin(jobs, [task]), { goalId: 'g1', phaseIndex: 0 }, {});

    expect(result).toMatchObject({ action: 'execute-phase', jobsCreated: 1 });
    expect(jobs.find((job) => job.payload?.type === 'execute-task').payload.toolIds).toEqual([
      'tool-doc-generator',
    ]);
    expect(updateGoal).not.toHaveBeenCalledWith(
      expect.anything(),
      'g1',
      expect.objectContaining({ status: 'awaiting_approval' })
    );
  });

  it('pauses before enqueuing when the approved task assignment changed', async () => {
    loadGoal.mockResolvedValue(goal());
    loadExecutionAuthorizationManifest.mockResolvedValue({
      ...MANIFEST,
      tasks: [{ ...MANIFEST.tasks[0], agent_id: 'a2' }],
    });
    const jobs = [];

    const result = await handle(makeAdmin(jobs), { goalId: 'g1', phaseIndex: 0 }, {});

    expect(result.status).toBe('awaiting_approval');
    expect(jobs).toEqual([]);
  });

  it('pauses at the tool gate when a current task grant is invalid', async () => {
    loadGoal.mockResolvedValue(goal());
    loadExecutionAuthorizationManifest.mockResolvedValue({
      ...MANIFEST,
      valid: false,
      issues: [
        {
          code: 'task_tool_not_granted',
          task_id: 't1',
          agent_id: 'a1',
          tool_id: 'tool-doc-generator',
        },
      ],
    });

    const result = await handle(makeAdmin([]), { goalId: 'g1', phaseIndex: 0 }, {});

    expect(result.status).toBe('awaiting_tools');
    expect(updateGoal).toHaveBeenCalledWith(
      expect.anything(),
      'g1',
      expect.objectContaining({ status: 'awaiting_tools' })
    );
  });

  it.each(['awaiting_approval', 'authorizing_execution', 'paused', 'cancelled'])(
    'does not execute a queued job for a %s goal',
    async (status) => {
      loadGoal.mockResolvedValue({ ...goal(), status });
      const jobs = [];
      const admin = makeAdmin(jobs);

      const result = await handle(admin, { goalId: 'g1', phaseIndex: 0 }, {});

      expect(result.status).toBe('goal_not_active');
      expect(loadExecutionAuthorizationManifest).not.toHaveBeenCalled();
      expect(admin.from).not.toHaveBeenCalled();
      expect(jobs).toEqual([]);
    }
  );

  it('stops before queue insertion when cancellation wins after the task update', async () => {
    loadGoal
      .mockResolvedValueOnce(goal())
      .mockResolvedValueOnce(goal())
      .mockResolvedValueOnce(goal())
      .mockResolvedValueOnce({ ...goal(), status: 'cancelled' });
    const jobs = [];

    const result = await handle(makeAdmin(jobs), { goalId: 'g1', phaseIndex: 0 }, {});

    expect(result.status).toBe('goal_not_active');
    expect(jobs).toEqual([]);
  });

  it('carries the exact feedback generation into every queued task worker', async () => {
    const version = 'feedback-v1';
    const currentGoal = feedbackGoal(version);
    const currentTask = {
      ...TASK,
      data: { ...TASK.data, feedback_application_version: version },
    };
    loadGoal.mockResolvedValue(currentGoal);
    const jobs = [];

    await handle(
      makeAdmin(jobs, [currentTask]),
      { goalId: 'g1', phaseIndex: 0, feedbackApplicationVersion: version },
      {}
    );

    expect(jobs.find((job) => job.payload?.type === 'execute-task').payload).toMatchObject({
      taskId: 't1',
      feedbackApplicationVersion: version,
    });
  });

  it('rejects an unversioned worker while a feedback phase generation is active', async () => {
    loadGoal.mockResolvedValue(feedbackGoal('feedback-v1'));
    const jobs = [];
    const admin = makeAdmin(jobs);

    const result = await handle(admin, { goalId: 'g1', phaseIndex: 0 }, {});

    expect(result).toMatchObject({ status: 'feedback_superseded', phaseIndex: 0 });
    expect(loadExecutionAuthorizationManifest).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
    expect(jobs).toEqual([]);
  });

  it('rejects a feedback continuation until every current phase task has the exact reset marker', async () => {
    const version = 'feedback-v1';
    loadGoal.mockResolvedValue(feedbackGoal(version));
    const jobs = [];
    const admin = makeAdmin(jobs, [TASK]);

    const result = await handle(
      admin,
      { goalId: 'g1', phaseIndex: 0, feedbackApplicationVersion: version },
      {}
    );

    expect(result).toMatchObject({ status: 'feedback_superseded', phaseIndex: 0 });
    expect(jobs).toEqual([]);
  });

  it('retires an old feedback phase marker after a full retry generation starts', async () => {
    const currentGoal = feedbackGoal('feedback-v1');
    currentGoal.data.retry_count = 1;
    loadGoal.mockResolvedValue(currentGoal);
    const jobs = [];

    await handle(makeAdmin(jobs), { goalId: 'g1', phaseIndex: 0 }, {});

    expect(jobs.find((job) => job.payload?.type === 'execute-task')).toBeTruthy();
  });
});
