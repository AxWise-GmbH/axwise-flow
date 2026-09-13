import { describe, expect, it } from 'vitest';
import { PREDEFINED_TOOLS } from '../../src/config/predefinedTools.js';
import {
  JOB_OWNER_VALIDATION_ERROR,
  RUNTIME_JOB_TYPES,
  authorizeQueuedJob,
  canonicalizeJobOwner,
  isJobOwnerValidationError,
} from './job-authority.js';

function fakeAdmin(seed = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const filters = [];
      const query = {
        select(columns) {
          calls.push({ table, operation: 'select', columns });
          return query;
        },
        eq(column, value) {
          filters.push([column, value]);
          return query;
        },
        maybeSingle: async () => {
          const matches = (seed[table] || []).filter((row) =>
            filters.every(([column, value]) => String(row[column]) === String(value))
          );
          return {
            data: matches.length === 1 ? structuredClone(matches[0]) : null,
            error:
              matches.length > 1
                ? { message: 'JSON object requested, multiple (or no) rows returned' }
                : null,
          };
        },
        then(resolve, reject) {
          const matches = (seed[table] || []).filter((row) =>
            filters.every(([column, value]) => String(row[column]) === String(value))
          );
          return Promise.resolve({ data: structuredClone(matches), error: null }).then(
            resolve,
            reject
          );
        },
      };
      return query;
    },
  };
}

function queued(type, payload = {}, extra = {}) {
  return {
    id: `${type}-queue`,
    user_id: 'user-1',
    status: 'running',
    payload: { type, ...payload },
    ...extra,
  };
}

function goal(id = 'goal-1', extra = {}) {
  return {
    id,
    user_id: 'user-1',
    status: 'active',
    updated_at: '2026-08-24T00:00:00.000Z',
    org_id: null,
    team_id: null,
    agent_team_id: null,
    concilium_id: null,
    workflow_id: null,
    executor_type: 'organization',
    executor_id: null,
    parent_goal_id: null,
    continuation_goal_id: null,
    data: {},
    ...extra,
  };
}

function executionFixture({ toolIds = [], manifestAgentId = 'agent-1' } = {}) {
  const manifest = {
    valid: true,
    tasks: [
      {
        task_id: 'task-1',
        agent_id: manifestAgentId,
        required_role: 'Analyst',
        granted_tool_ids: toolIds,
        tool_grants: [],
      },
    ],
  };
  return {
    goals: [
      goal('goal-1', {
        data: {
          goal_approvals: {
            execution: {
              status: 'approved',
              snapshot_hash: 'approval-hash',
              snapshot: { authorization_manifest: manifest },
            },
          },
          execution_authorization: {
            status: 'approved',
            snapshot_hash: 'approval-hash',
            manifest,
          },
        },
      }),
    ],
    team_tasks: [
      {
        id: 'task-1',
        user_id: 'user-1',
        title: 'Durable task title',
        description: 'Durable task instructions',
        assigned_to: 'Owned analyst',
        job_pool_id: 'work-job-1',
        goal_id: 'goal-1',
        agent_id: 'agent-1',
        status: 'todo',
        data: {
          goal_id: 'goal-1',
          axwise_execution_context: { authorization_snapshot_hash: 'approval-hash' },
        },
      },
    ],
    jobs: [
      {
        id: 'work-job-1',
        user_id: 'user-1',
        goal_id: 'goal-1',
        assigned_agent_id: 'agent-1',
        status: 'active',
      },
    ],
    agents: [
      {
        id: 'agent-1',
        user_id: 'user-1',
        name: 'Owned analyst',
        category: 'analysis',
        capabilities: ['research'],
        metadata: { system_prompt: 'Owned system prompt' },
        status: 'active',
      },
    ],
  };
}

describe('central queued-job authority', () => {
  it('exports only the supported runtime surface (not global optimizer cron jobs)', () => {
    expect(RUNTIME_JOB_TYPES).not.toContain('optimize-prompts');
    expect(RUNTIME_JOB_TYPES).not.toContain('evaluate-prompt-variants');
    expect(RUNTIME_JOB_TYPES).toContain('execute-task');
  });

  it('rejects an ownerless queue row with the terminal authority code', async () => {
    const promise = authorizeQueuedJob(fakeAdmin(), {
      id: 'ownerless',
      user_id: null,
      payload: { type: 'run-llm', prompt: 'no' },
    });
    await expect(promise).rejects.toMatchObject({ code: JOB_OWNER_VALIDATION_ERROR });
    await expect(promise).rejects.toThrow('agent_jobs.user_id is required');
  });

  it.each(['_userId', 'userId', 'user_id'])(
    'rejects mismatched %s before a database lookup',
    async (alias) => {
      const admin = fakeAdmin();
      await expect(
        authorizeQueuedJob(admin, queued('run-llm', { prompt: 'steal', [alias]: 'victim-user' }))
      ).rejects.toThrow(`${alias} does not match agent_jobs.user_id`);
      expect(admin.calls).toHaveLength(0);
    }
  );

  it('canonicalizes nested owner aliases without mutating the claimed CAS row', () => {
    const original = queued('run-llm', {
      prompt: 'hello',
      agentContext: { _userId: 'user-1' },
      tenant: { userId: 'user-1' },
    });
    const canonical = canonicalizeJobOwner(original);
    expect(canonical).not.toBe(original);
    expect(canonical.payload).not.toBe(original.payload);
    expect(canonical.payload.agentContext).toMatchObject({
      _userId: 'user-1',
      userId: 'user-1',
      user_id: 'user-1',
    });
    expect(original.payload.agentContext).toEqual({ _userId: 'user-1' });
  });

  it('returns the requested flat immutable snapshot for a reference-free LLM job', async () => {
    const { authority } = await authorizeQueuedJob(
      fakeAdmin(),
      queued('run-llm', { prompt: 'hello' })
    );
    expect(authority).toMatchObject({
      userId: 'user-1',
      queueJobId: 'run-llm-queue',
      type: 'run-llm',
      goalId: null,
      taskId: null,
      workJobId: null,
      agentId: null,
      agentTable: null,
      teamId: null,
      conciliumId: null,
      workflowId: null,
      organizationId: null,
      channelId: null,
      parentGoalId: null,
      continuationGoalId: null,
      payload: {
        type: 'run-llm',
        prompt: 'hello',
        _userId: 'user-1',
        userId: 'user-1',
        user_id: 'user-1',
      },
    });
    expect(Object.isFrozen(authority)).toBe(true);
    expect(Object.isFrozen(authority.payload)).toBe(true);
  });

  it('rejects unsupported and global optimizer queue types', async () => {
    for (const type of ['unknown', 'optimize-prompts', 'evaluate-prompt-variants']) {
      await expect(authorizeQueuedJob(fakeAdmin(), queued(type))).rejects.toMatchObject({
        code: JOB_OWNER_VALIDATION_ERROR,
      });
    }
  });

  it('rejects durable entity smuggling on evaluate jobs', async () => {
    await expect(
      authorizeQueuedJob(fakeAdmin({ goals: [goal()] }), queued('evaluate', { goalId: 'goal-1' }))
    ).rejects.toThrow('evaluate does not accept durable entity attribution');
  });

  it('fails a declared goal closed when it belongs to another owner', async () => {
    const foreign = goal('goal-1', { user_id: 'victim-user' });
    await expect(
      authorizeQueuedJob(
        fakeAdmin({ goals: [foreign] }),
        queued('run-llm', { prompt: 'read victim', goalId: 'goal-1' })
      )
    ).rejects.toThrow('goal is missing or belongs to another owner');
  });

  it('does not load unused jobs.related_workflows into the runtime authority snapshot', async () => {
    const admin = fakeAdmin({
      jobs: [
        {
          id: 'work-job-1',
          user_id: 'user-1',
          goal_id: null,
          assigned_agent_id: null,
          related_workflows: ['untrusted-unused-reference'],
          status: 'active',
        },
      ],
    });

    await authorizeQueuedJob(admin, queued('run-llm', { prompt: 'work', jobId: 'work-job-1' }));

    const jobsSelect = admin.calls.find((call) => call.table === 'jobs');
    expect(jobsSelect.columns).not.toContain('related_workflows');
  });

  it('binds agent memory to the exact owned agent', async () => {
    const admin = fakeAdmin({
      agents: [{ id: 'agent-1', user_id: 'user-1', metadata: {}, capabilities: [] }],
    });
    const { authority } = await authorizeQueuedJob(
      admin,
      queued('run-llm', {
        prompt: 'remember',
        memory: { owner_type: 'agent', owner_id: 'agent-1' },
      })
    );
    expect(authority.resources.agents).toEqual([
      expect.objectContaining({ id: 'agent-1', user_id: 'user-1' }),
    ]);
  });

  it('uses an owned blueprint snapshot and permits predefined tools without user tool rows', async () => {
    const catalogToolId = PREDEFINED_TOOLS[0].id;
    const admin = fakeAdmin({
      agent_blueprints: [
        {
          id: 'blueprint-1',
          user_id: 'user-1',
          name: 'Owned blueprint',
          description: 'Trusted row',
          category: 'research',
          system_prompt: 'Authoritative prompt',
          provider: 'gemini',
          model: 'gemini-3.8-flash',
          tools: [catalogToolId],
          status: 'active',
        },
      ],
    });
    const { authority } = await authorizeQueuedJob(
      admin,
      queued('agent', {
        task: 'work',
        agentId: 'blueprint-1',
        blueprint_id: 'blueprint-1',
        agentContext: {
          _agentId: 'blueprint-1',
          blueprint_id: 'blueprint-1',
          system_prompt: 'attacker supplied prompt',
        },
      })
    );
    expect(authority.agentTable).toBe('agent_blueprints');
    expect(authority.payload.agentContext.system_prompt).toBe('Authoritative prompt');
    expect(authority.payload.tools).toEqual([catalogToolId]);
    expect(authority.execution).toMatchObject({
      catalogToolIds: [catalogToolId],
      customToolIds: [],
    });
    expect(admin.calls.filter((call) => call.table === 'tools')).toHaveLength(0);
  });

  it('rejects a foreign custom tool even when an owned blueprint names it', async () => {
    const admin = fakeAdmin({
      agent_blueprints: [
        {
          id: 'blueprint-1',
          user_id: 'user-1',
          name: 'Owned blueprint',
          system_prompt: 'prompt',
          tools: ['custom-secret-tool'],
        },
      ],
      tools: [{ id: 'custom-secret-tool', user_id: 'victim-user', status: 'active' }],
    });
    await expect(
      authorizeQueuedJob(
        admin,
        queued('agent', {
          task: 'work',
          agentId: 'blueprint-1',
          blueprint_id: 'blueprint-1',
        })
      )
    ).rejects.toThrow('agent tool is missing or belongs to another owner');
  });

  it('treats an owned blueprint tools:[] as an explicit grant of no tools', async () => {
    const admin = fakeAdmin({
      agent_blueprints: [
        {
          id: 'blueprint-1',
          user_id: 'user-1',
          name: 'No-tool blueprint',
          status: 'active',
          tools: [],
        },
      ],
    });

    await expect(
      authorizeQueuedJob(
        admin,
        queued('agent', {
          agentId: 'blueprint-1',
          blueprint_id: 'blueprint-1',
          tools: ['tool-web-search'],
        })
      )
    ).rejects.toThrow('queued tool is not granted by the owned blueprint');
  });

  it('rejects disagreement between queued agent aliases', async () => {
    await expect(
      authorizeQueuedJob(
        fakeAdmin(),
        queued('agent', {
          task: 'work',
          agentId: 'agent-1',
          agentContext: { _agentId: 'agent-2' },
        })
      )
    ).rejects.toThrow('agent and agentContext references disagree');
  });

  it('binds execute-task queue→task→work job→goal→manifest→agent and canonicalizes tool order', async () => {
    const toolIds = [PREDEFINED_TOOLS[0].id, PREDEFINED_TOOLS[1].id];
    const admin = fakeAdmin(executionFixture({ toolIds }));
    const { authority } = await authorizeQueuedJob(
      admin,
      queued('execute-task', {
        taskId: 'task-1',
        jobId: 'work-job-1',
        goalId: 'goal-1',
        authorizationSnapshotHash: 'approval-hash',
        toolIds: [...toolIds].reverse(),
        task: 'poisoned queued task',
        prompt: 'poisoned queued prompt',
        jobDescription: 'poisoned queued job description',
        context: { instructions: 'poisoned queued context' },
        agentName: 'Foreign agent label',
        agentContext: { _agentId: 'agent-1', system_prompt: 'untrusted' },
      })
    );
    expect(authority).toMatchObject({
      goalId: 'goal-1',
      taskId: 'task-1',
      workJobId: 'work-job-1',
      agentId: 'agent-1',
      agentTable: 'agents',
    });
    expect(authority.payload.agentContext).toMatchObject({
      id: 'agent-1',
      name: 'Owned analyst',
      system_prompt: 'Owned system prompt',
    });
    expect(authority.payload.toolIds).toEqual([...toolIds].sort());
    expect(authority.payload).toMatchObject({
      task: 'Durable task instructions',
      taskTitle: 'Durable task title',
      agentName: 'Owned analyst',
      assigned_to: 'Owned analyst',
    });
    expect(authority.payload).not.toHaveProperty('prompt');
    expect(authority.payload).not.toHaveProperty('jobDescription');
    expect(authority.payload).not.toHaveProperty('context');
    expect(admin.calls.filter((call) => call.table === 'tools')).toHaveLength(0);
  });

  it('rejects execute-task when the task points at another work job', async () => {
    const fixture = executionFixture();
    fixture.team_tasks[0].job_pool_id = 'other-job';
    await expect(
      authorizeQueuedJob(
        fakeAdmin(fixture),
        queued('execute-task', {
          taskId: 'task-1',
          jobId: 'work-job-1',
          authorizationSnapshotHash: 'approval-hash',
          toolIds: [],
        })
      )
    ).rejects.toThrow('task does not belong to queued job');
  });

  it.each(['inProgress', 'done', 'failed'])(
    'rejects an execute-task task in %s state',
    async (status) => {
      const fixture = executionFixture();
      fixture.team_tasks[0].status = status;
      await expect(
        authorizeQueuedJob(
          fakeAdmin(fixture),
          queued('execute-task', {
            taskId: 'task-1',
            jobId: 'work-job-1',
            agentId: 'agent-1',
            authorizationSnapshotHash: 'approval-hash',
            toolIds: ['tool-web-search'],
          })
        )
      ).rejects.toThrow('execute-task task is not ready to start');
    }
  );

  it('permits a failed execute-task retry only for the exact same durable queue row', async () => {
    const fixture = executionFixture({ toolIds: ['tool-web-search'] });
    fixture.team_tasks[0].status = 'failed';
    fixture.team_tasks[0].data.failed_queue_job_id = 'execute-task-queue';

    const { authority } = await authorizeQueuedJob(
      fakeAdmin(fixture),
      queued('execute-task', {
        taskId: 'task-1',
        jobId: 'work-job-1',
        agentId: 'agent-1',
        authorizationSnapshotHash: 'approval-hash',
        toolIds: ['tool-web-search'],
      })
    );

    expect(authority.execution.sameQueueRetry).toBe(true);
  });

  it('rejects execute-task when the manifest assigns another agent', async () => {
    await expect(
      authorizeQueuedJob(
        fakeAdmin(executionFixture({ manifestAgentId: 'victim-agent' })),
        queued('execute-task', {
          taskId: 'task-1',
          jobId: 'work-job-1',
          authorizationSnapshotHash: 'approval-hash',
          toolIds: [],
        })
      )
    ).rejects.toThrow('manifest agent does not match task');
  });

  it('rejects mixed-owner Concilium children before evaluation', async () => {
    const admin = fakeAdmin({
      concilium: [{ id: 'board-1', user_id: 'user-1', status: 'active' }],
      concilium_members: [
        { id: 'member-1', user_id: 'user-1', concilium_id: 'board-1' },
        { id: 'member-2', user_id: 'victim-user', concilium_id: 'board-1' },
      ],
    });
    await expect(
      authorizeQueuedJob(
        admin,
        queued('concilium-evaluate', { conciliumId: 'board-1', agentOutput: 'result' })
      )
    ).rejects.toThrow('concilium members contains a foreign or ownerless row');
  });

  it('rejects a non-active Concilium before evaluation', async () => {
    await expect(
      authorizeQueuedJob(
        fakeAdmin({
          concilium: [{ id: 'board-1', user_id: 'user-1', status: 'inactive' }],
        }),
        queued('concilium-evaluate', { conciliumId: 'board-1', agentOutput: 'result' })
      )
    ).rejects.toThrow('concilium is not active');
  });

  it('preauthorizes workflow, trigger goal, blueprint, agent, and board references', async () => {
    const admin = fakeAdmin({
      workflows: [
        {
          id: 'workflow-1',
          user_id: 'user-1',
          enabled: true,
          data: {
            nodes: [
              { data: { config: { blueprint_id: 'blueprint-1' } } },
              { data: { config: { agent_id: 'c-agent-1', board_id: 'board-1' } } },
            ],
          },
        },
      ],
      goals: [goal()],
      agent_blueprints: [
        { id: 'blueprint-1', user_id: 'user-1', name: 'B', system_prompt: 'P', tools: [] },
      ],
      concilium_agents: [{ id: 'c-agent-1', user_id: 'user-1', board_id: 'board-1' }],
      concilium: [{ id: 'board-1', user_id: 'user-1', status: 'active' }],
    });
    const { authority } = await authorizeQueuedJob(
      admin,
      queued('execute-workflow', {
        workflowId: 'workflow-1',
        triggerData: { goal_id: 'goal-1' },
      })
    );
    expect(authority.workflowId).toBe('workflow-1');
    expect(authority.goalId).toBe('goal-1');
    expect(authority.execution).toEqual({
      blueprintIds: ['blueprint-1'],
      agentIds: ['c-agent-1'],
      boardIds: ['board-1'],
    });
  });

  it('rejects a mixed-owner council team membership', async () => {
    const admin = fakeAdmin({
      agent_teams: [
        {
          id: 'team-1',
          user_id: 'user-1',
          leader_id: 'agent-1',
          goal_id: null,
          is_active: true,
        },
      ],
      agent_team_members: [
        { id: 'm1', team_id: 'team-1', member_id: 'agent-1', user_id: 'user-1' },
        { id: 'm2', team_id: 'team-1', member_id: 'agent-2', user_id: 'victim-user' },
      ],
      agents: [{ id: 'agent-1', user_id: 'user-1' }],
    });
    await expect(
      authorizeQueuedJob(admin, queued('council-meeting', { team_id: 'team-1' }))
    ).rejects.toThrow('agent team members contains a foreign or ownerless row');
  });

  it('rejects an inactive council team before loading members', async () => {
    const admin = fakeAdmin({
      agent_teams: [
        {
          id: 'team-1',
          user_id: 'user-1',
          leader_id: 'agent-1',
          goal_id: null,
          is_active: false,
        },
      ],
    });

    await expect(
      authorizeQueuedJob(admin, queued('council-meeting', { team_id: 'team-1' }))
    ).rejects.toThrow('team is not active');
    expect(admin.calls.filter(({ table }) => table === 'agent_team_members')).toHaveLength(0);
  });

  it('rejects inactive organization and Concilium-team links on a goal', async () => {
    const inactiveOrganization = fakeAdmin({
      goals: [goal('goal-1', { org_id: 'org-1' })],
      organizations: [
        {
          id: 'org-1',
          user_id: 'user-1',
          parent_id: null,
          consilium_id: null,
          is_active: false,
        },
      ],
    });
    await expect(
      authorizeQueuedJob(inactiveOrganization, queued('orchestrate-goal', { goalId: 'goal-1' }))
    ).rejects.toThrow('organization is not active');

    const inactiveTeam = fakeAdmin({
      goals: [goal('goal-1', { team_id: 'team-1' })],
      concilium_teams: [{ id: 'team-1', user_id: 'user-1', leader_id: null, is_active: false }],
    });
    await expect(
      authorizeQueuedJob(inactiveTeam, queued('orchestrate-goal', { goalId: 'goal-1' }))
    ).rejects.toThrow('goal concilium team is not active');
  });

  it('binds goal-owned organization, team, and concilium before orchestration', async () => {
    const admin = fakeAdmin({
      goals: [
        goal('goal-1', {
          org_id: 'org-1',
          agent_team_id: 'team-1',
          concilium_id: 'board-1',
          executor_type: 'organization',
          executor_id: 'org-1',
        }),
      ],
      organizations: [
        {
          id: 'org-1',
          user_id: 'user-1',
          parent_id: null,
          consilium_id: 'board-1',
          is_active: true,
        },
      ],
      agent_teams: [{ id: 'team-1', user_id: 'user-1', goal_id: 'goal-1', is_active: true }],
      concilium: [{ id: 'board-1', user_id: 'user-1', status: 'active' }],
    });
    const { authority } = await authorizeQueuedJob(
      admin,
      queued('orchestrate-goal', { goalId: 'goal-1', action: 'pm-planning' })
    );
    expect(authority).toMatchObject({
      goalId: 'goal-1',
      organizationId: 'org-1',
      teamId: 'team-1',
      conciliumId: 'board-1',
    });
  });

  it('binds a goal workflow to the exact same-owner workflow row', async () => {
    const admin = fakeAdmin({
      goals: [goal('goal-1', { workflow_id: 'workflow-1' })],
      workflows: [{ id: 'workflow-1', user_id: 'user-1', enabled: true, data: { nodes: [] } }],
    });

    const { authority } = await authorizeQueuedJob(
      admin,
      queued('orchestrate-goal', { goalId: 'goal-1', action: 'execute-phase' })
    );

    expect(authority.workflowId).toBe('workflow-1');
    expect(authority.resources.workflows).toEqual([
      expect.objectContaining({ id: 'workflow-1', user_id: 'user-1' }),
    ]);
  });

  it('rejects a goal workflow that is foreign to the queue owner', async () => {
    await expect(
      authorizeQueuedJob(
        fakeAdmin({
          goals: [goal('goal-1', { workflow_id: 'workflow-1' })],
          workflows: [
            { id: 'workflow-1', user_id: 'victim-user', enabled: true, data: { nodes: [] } },
          ],
        }),
        queued('orchestrate-goal', { goalId: 'goal-1' })
      )
    ).rejects.toThrow('goal workflow is missing or belongs to another owner');
  });

  it('rejects disagreement between a queued workflow and the goal workflow', async () => {
    await expect(
      authorizeQueuedJob(
        fakeAdmin({
          goals: [goal('goal-1', { workflow_id: 'workflow-1' })],
          workflows: [
            { id: 'workflow-1', user_id: 'user-1', enabled: true, data: { nodes: [] } },
            { id: 'workflow-2', user_id: 'user-1', enabled: true, data: { nodes: [] } },
          ],
        }),
        queued('orchestrate-goal', { goalId: 'goal-1', workflowId: 'workflow-2' })
      )
    ).rejects.toThrow('workflowId references disagree');
  });

  it('does not conflate an ordinary decomposed child with a reciprocal loop continuation', async () => {
    const { authority } = await authorizeQueuedJob(
      fakeAdmin({ goals: [goal('child', { parent_goal_id: 'decomposition-parent' })] }),
      queued('orchestrate-goal', { goalId: 'child' })
    );

    expect(authority.goalId).toBe('child');
    expect(authority.parentGoalId).toBeNull();
  });

  it('requires the pulse agent to retain the exact owned goal binding', async () => {
    const admin = fakeAdmin({
      goals: [goal()],
      concilium_agents: [
        { id: 'pulse-agent', user_id: 'user-1', pulse_goal_id: 'other-goal', status: 'active' },
      ],
    });
    await expect(
      authorizeQueuedJob(admin, queued('pulse-cycle', { agentId: 'pulse-agent', goalId: 'goal-1' }))
    ).rejects.toThrow('pulse agent is bound to another goal');
  });

  it('binds pulse and prompt-refinement agents to their exact owned concilium', async () => {
    for (const type of ['pulse-cycle', 'prompt-refinement']) {
      const seed = {
        goals: [goal()],
        concilium_agents: [
          {
            id: 'pulse-agent',
            user_id: 'user-1',
            board_id: 'board-1',
            pulse_goal_id: 'goal-1',
            status: 'active',
          },
        ],
        concilium: [{ id: 'board-1', user_id: 'user-1', status: 'active' }],
      };
      const { authority } = await authorizeQueuedJob(
        fakeAdmin(seed),
        queued(type, {
          agentId: 'pulse-agent',
          ...(type === 'pulse-cycle' ? { goalId: 'goal-1' } : {}),
        })
      );
      expect(authority.conciliumId).toBe('board-1');
      expect(authority.resources.concilium).toEqual([
        expect.objectContaining({ id: 'board-1', user_id: 'user-1' }),
      ]);
    }
  });

  it('rejects a foreign or contradictory pulse-agent concilium binding', async () => {
    const baseAgent = {
      id: 'pulse-agent',
      user_id: 'user-1',
      board_id: 'board-1',
      pulse_goal_id: 'goal-1',
      status: 'active',
    };
    await expect(
      authorizeQueuedJob(
        fakeAdmin({
          goals: [goal()],
          concilium_agents: [baseAgent],
          concilium: [{ id: 'board-1', user_id: 'victim-user', status: 'active' }],
        }),
        queued('pulse-cycle', { agentId: 'pulse-agent', goalId: 'goal-1' })
      )
    ).rejects.toThrow('pulse agent concilium is missing or belongs to another owner');

    await expect(
      authorizeQueuedJob(
        fakeAdmin({
          goals: [goal()],
          concilium_agents: [baseAgent],
          concilium: [
            { id: 'board-1', user_id: 'user-1', status: 'active' },
            { id: 'board-2', user_id: 'user-1', status: 'active' },
          ],
        }),
        queued('pulse-cycle', {
          agentId: 'pulse-agent',
          goalId: 'goal-1',
          conciliumId: 'board-2',
        })
      )
    ).rejects.toThrow('conciliumId references disagree');
  });

  it('binds AxWise grounding to the nested tenant organization', async () => {
    const admin = fakeAdmin({
      organizations: [
        {
          id: 'org-1',
          user_id: 'user-1',
          parent_id: null,
          consilium_id: null,
          is_active: true,
        },
      ],
    });
    const { authority } = await authorizeQueuedJob(
      admin,
      queued('axwise-ground', {
        requestId: 'request-1',
        organizationId: 'org-1',
        tenant: { userId: 'user-1', orgId: 'org-1' },
      })
    );
    expect(authority.organizationId).toBe('org-1');
    expect(authority.payload.tenant).toMatchObject({ userId: 'user-1', orgId: 'org-1' });
  });

  it('binds an AxWise outcome job to the exact current goal decision', async () => {
    const admin = fakeAdmin({
      goals: [
        goal('goal-1', {
          status: 'completed',
          org_id: 'user-1',
          data: { axwise_orchestration: { decision_id: 'decision-1' } },
        }),
      ],
    });
    const { authority } = await authorizeQueuedJob(
      admin,
      queued('axwise-outcome', { goalId: 'goal-1', decision_id: 'decision-1' })
    );

    expect(authority.decisionId).toBe('decision-1');
    expect(authority.payload).toMatchObject({
      goalId: 'goal-1',
      goal_id: 'goal-1',
      decisionId: 'decision-1',
      decision_id: 'decision-1',
    });
  });

  it.each([
    [{ goalId: 'goal-1' }, 'AxWise decision is required'],
    [
      { goalId: 'goal-1', decisionId: 'stale-decision' },
      'axwise-outcome decision does not match the owned goal',
    ],
  ])('rejects an unbound AxWise outcome decision %#', async (payload, message) => {
    const admin = fakeAdmin({
      goals: [
        goal('goal-1', {
          status: 'completed',
          org_id: 'user-1',
          data: { axwise_orchestration: { decision_id: 'decision-1' } },
        }),
      ],
    });
    await expect(authorizeQueuedJob(admin, queued('axwise-outcome', payload))).rejects.toThrow(
      message
    );
  });

  it('binds communicator processing to the exact channel owner and platform', async () => {
    const admin = fakeAdmin({
      communication_channels: [
        {
          id: 'channel-1',
          connected_by: 'user-1',
          platform: 'telegram',
          status: 'active',
        },
      ],
    });
    const { authority } = await authorizeQueuedJob(
      admin,
      queued('communicator-process', {
        platform: 'telegram',
        channel_id: 'channel-1',
        message: { chat_id: '1', from_id: '1', text: 'hello' },
      })
    );
    expect(authority.channelId).toBe('channel-1');
    expect(authority.payload.channel_id).toBe('channel-1');
  });

  it('requires an exact reciprocal same-owner loop-refinement chain', async () => {
    const admin = fakeAdmin({
      goals: [
        goal('parent', { continuation_goal_id: 'continuation' }),
        goal('continuation', { parent_goal_id: 'parent' }),
      ],
    });
    const { authority } = await authorizeQueuedJob(
      admin,
      queued('loop-refine-parent-deliverables', {
        parentGoalId: 'parent',
        continuationGoalId: 'continuation',
      })
    );
    expect(authority).toMatchObject({
      parentGoalId: 'parent',
      continuationGoalId: 'continuation',
    });

    admin.from = fakeAdmin({
      goals: [
        goal('parent', { continuation_goal_id: 'different' }),
        goal('continuation', { parent_goal_id: 'parent' }),
      ],
    }).from;
    await expect(
      authorizeQueuedJob(
        admin,
        queued('loop-refine-parent-deliverables', {
          parentGoalId: 'parent',
          continuationGoalId: 'continuation',
        })
      )
    ).rejects.toThrow('not an exact reciprocal chain');
  });

  it('recognizes authority errors by code or persisted terminal prefix', () => {
    expect(isJobOwnerValidationError({ code: JOB_OWNER_VALIDATION_ERROR })).toBe(true);
    expect(isJobOwnerValidationError(`${JOB_OWNER_VALIDATION_ERROR}: denied`)).toBe(true);
    expect(isJobOwnerValidationError(new Error('ordinary failure'))).toBe(false);
  });
});
