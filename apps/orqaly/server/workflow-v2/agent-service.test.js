import { describe, expect, it, vi } from 'vitest';
import { createAgentService } from './agent-service.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const AGENT_ID = '00000000-0000-4000-8000-000000000002';
const OTHER_AGENT_ID = '00000000-0000-4000-8000-000000000003';
const FIRST_WORKFLOW_RUN_ID = '10000000-0000-4000-8000-000000000001';
const LATEST_WORKFLOW_RUN_ID = '10000000-0000-4000-8000-000000000002';
const CONTROL_PLANE_RUN_ID = '20000000-0000-4000-8000-000000000001';
const AUTH = { userId: 'user_agentservice123' };
const OWNER = {
  organizationId: TENANT_ID,
  workspaceId: TENANT_ID,
  userId: AUTH.userId,
};

function harness(overrides = {}) {
  const repository = {
    resolveTenant: vi.fn().mockResolvedValue(TENANT_ID),
    ...(overrides.repository || {}),
  };
  const response = { status: 200, body: {}, headers: {} };
  const controlPlaneClient = {
    listAgents: vi.fn().mockResolvedValue(response),
    createAgent: vi.fn().mockResolvedValue(response),
    readAgent: vi.fn().mockResolvedValue(response),
    updateAgentProfile: vi.fn().mockResolvedValue(response),
    changeAgentLifecycle: vi.fn().mockResolvedValue(response),
    listAgentRuns: vi.fn().mockResolvedValue(response),
    runtimeStatus: vi.fn().mockResolvedValue({
      status: 200,
      body: {
        service: 'orqaly-agentic-control-plane',
        status: 'ready',
        executionEnabled: true,
      },
      headers: { requestId: 'runtime-request' },
    }),
    ...(overrides.controlPlaneClient || {}),
  };
  return {
    repository,
    controlPlaneClient,
    service: createAgentService({ repository, controlPlaneClient }),
  };
}

describe('first-class Agent service', () => {
  it('derives every agentic tenant dimension from the personal Clerk tenant', async () => {
    const h = harness();

    await h.service.list(AUTH, 25, 'paused');
    await h.service.create(AUTH, { idempotencyKey: 'create-1' });
    await h.service.read(AUTH, AGENT_ID);

    expect(h.repository.resolveTenant).toHaveBeenCalledTimes(3);
    expect(h.repository.resolveTenant).toHaveBeenCalledWith({ userId: AUTH.userId });
    expect(h.controlPlaneClient.listAgents).toHaveBeenCalledWith(OWNER, {
      limit: 25,
      state: 'paused',
    });
    expect(h.controlPlaneClient.createAgent).toHaveBeenCalledWith(OWNER, {
      idempotencyKey: 'create-1',
      origin: null,
    });
    expect(h.controlPlaneClient.readAgent).toHaveBeenCalledWith(OWNER, AGENT_ID);
  });

  it('never accepts browser-supplied owner identity as authoritative', async () => {
    const h = harness();
    const request = {
      idempotencyKey: 'create-2',
      organizationId: 'browser-org',
      workspaceId: 'browser-workspace',
      userId: 'browser-user',
    };

    await h.service.create(AUTH, request);

    expect(h.controlPlaneClient.createAgent).toHaveBeenCalledWith(OWNER, {
      ...request,
      origin: null,
    });
  });

  it('adds server-owned Workflow provenance only for Assistant assignments', async () => {
    const h = harness();
    const request = { idempotencyKey: 'create-from-assignment' };
    const origin = {
      kind: 'assistant_goal',
      sourceTaskId: 'turn-1',
      conversationId: 'thread-1',
      workflowRunId: FIRST_WORKFLOW_RUN_ID,
    };

    await h.service.createFromAssignment(AUTH, request, origin);

    expect(h.controlPlaneClient.createAgent).toHaveBeenCalledWith(OWNER, {
      ...request,
      origin,
    });
  });

  it('passes profile and lifecycle concurrency state through the private bridge', async () => {
    const h = harness();
    const profileRequest = { idempotencyKey: 'profile-1' };
    const lifecycleRequest = { idempotencyKey: 'lifecycle-1', action: 'pause' };

    await h.service.updateProfile(AUTH, AGENT_ID, '"4"', profileRequest);
    await h.service.lifecycle(AUTH, AGENT_ID, '"5"', lifecycleRequest);
    await h.service.runs(AUTH, AGENT_ID, 7);

    expect(h.controlPlaneClient.updateAgentProfile).toHaveBeenCalledWith(
      OWNER,
      AGENT_ID,
      profileRequest,
      '"4"'
    );
    expect(h.controlPlaneClient.changeAgentLifecycle).toHaveBeenCalledWith(
      OWNER,
      AGENT_ID,
      lifecycleRequest,
      '"5"'
    );
    expect(h.controlPlaneClient.listAgentRuns).toHaveBeenCalledWith(OWNER, AGENT_ID, {
      limit: 7,
    });
  });

  it('enriches list, read, and run history with completed temporary assignments under one stable Agent ID', async () => {
    const assignments = [
      {
        id: AGENT_ID,
        runId: FIRST_WORKFLOW_RUN_ID,
        task: 'Prepare onboarding operations',
        lifetime: 'temporary',
        status: 'completed',
        createdAt: '2026-09-02T08:00:00.000Z',
        updatedAt: '2026-09-02T09:00:00.000Z',
      },
      {
        id: AGENT_ID,
        runId: LATEST_WORKFLOW_RUN_ID,
        task: 'Audit customer handoffs',
        status: 'running',
        createdAt: '2026-09-04T08:00:00.000Z',
        updatedAt: '2026-09-04T09:00:00.000Z',
      },
      {
        id: OTHER_AGENT_ID,
        runId: '10000000-0000-4000-8000-000000000003',
        task: 'Unrelated Agent assignment',
        status: 'running',
        createdAt: '2026-09-04T10:00:00.000Z',
        updatedAt: '2026-09-04T10:00:00.000Z',
      },
    ];
    const controlPlaneAgent = {
      id: AGENT_ID,
      agent_kind: 'persistent',
      state: 'active',
      run_count: 1,
      latest_run: {
        id: CONTROL_PLANE_RUN_ID,
        state: 'completed',
        created_at: '2026-09-01T08:00:00.000Z',
        updated_at: '2026-09-01T09:00:00.000Z',
      },
    };
    const h = harness({
      repository: {
        readAgentAssignmentStats: vi.fn().mockResolvedValue([
          {
            agentId: AGENT_ID,
            runCount: 2,
            latestAssignment: assignments[1],
          },
          {
            agentId: OTHER_AGENT_ID,
            runCount: 1,
            latestAssignment: assignments[2],
          },
        ]),
        listAgentAssignmentsForAgent: vi.fn().mockResolvedValue(assignments),
      },
      controlPlaneClient: {
        listAgents: vi.fn().mockResolvedValue({
          status: 200,
          headers: {},
          body: { agents: [controlPlaneAgent] },
        }),
        readAgent: vi.fn().mockResolvedValue({
          status: 200,
          headers: {},
          body: { agent: controlPlaneAgent },
        }),
        listAgentRuns: vi.fn().mockResolvedValue({
          status: 200,
          headers: {},
          body: {
            runs: [
              {
                id: CONTROL_PLANE_RUN_ID,
                state: 'completed',
                created_at: '2026-09-01T08:00:00.000Z',
                updated_at: '2026-09-01T09:00:00.000Z',
              },
            ],
          },
        }),
      },
    });

    const listed = await h.service.list(AUTH, 25);
    const read = await h.service.read(AUTH, AGENT_ID);
    const history = await h.service.runs(AUTH, AGENT_ID, 10);

    expect(listed.body.agents).toEqual([
      expect.objectContaining({
        id: AGENT_ID,
        run_count: 3,
        latest_run: expect.objectContaining({
          id: LATEST_WORKFLOW_RUN_ID,
          workflowRunId: LATEST_WORKFLOW_RUN_ID,
          state: 'running',
        }),
      }),
    ]);
    expect(read.body.agent).toMatchObject({
      id: AGENT_ID,
      run_count: 3,
      latest_run: {
        id: LATEST_WORKFLOW_RUN_ID,
        source_task_id: null,
        state: 'running',
        created_at: '2026-09-04T08:00:00.000Z',
        updated_at: '2026-09-04T09:00:00.000Z',
        workflowRunId: LATEST_WORKFLOW_RUN_ID,
      },
    });
    expect(history.body.agentId).toBe(AGENT_ID);
    expect(history.body.runs).toEqual([
      expect.objectContaining({
        id: LATEST_WORKFLOW_RUN_ID,
        workflowRunId: LATEST_WORKFLOW_RUN_ID,
        source: 'orqaly_workflow_v2',
        title: 'Audit customer handoffs',
        state: 'running',
      }),
      expect.objectContaining({
        id: FIRST_WORKFLOW_RUN_ID,
        workflowRunId: FIRST_WORKFLOW_RUN_ID,
        source: 'orqaly_workflow_v2',
        title: 'Prepare onboarding operations',
        state: 'completed',
      }),
      expect.objectContaining({ id: CONTROL_PLANE_RUN_ID, state: 'completed' }),
    ]);
    expect(history.body.runs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: '10000000-0000-4000-8000-000000000003' }),
      ])
    );
    expect(h.repository.readAgentAssignmentStats).toHaveBeenCalledTimes(2);
    expect(h.repository.readAgentAssignmentStats).toHaveBeenCalledWith(TENANT_ID, AUTH.userId, [
      AGENT_ID,
    ]);
    expect(h.repository.listAgentAssignmentsForAgent).toHaveBeenCalledOnce();
    expect(h.repository.listAgentAssignmentsForAgent).toHaveBeenCalledWith(
      TENANT_ID,
      AUTH.userId,
      AGENT_ID,
      10
    );
  });

  it('deduplicates shared run IDs and keeps the newest source state while retaining Workflow linkage', async () => {
    const sharedRunId = FIRST_WORKFLOW_RUN_ID;
    const h = harness({
      repository: {
        listAgentAssignmentsForAgent: vi.fn().mockResolvedValue([
          {
            id: AGENT_ID,
            runId: sharedRunId,
            task: 'Original assignment title',
            status: 'running',
            createdAt: '2026-09-02T08:00:00.000Z',
            updatedAt: '2026-09-02T09:00:00.000Z',
          },
          {
            id: AGENT_ID,
            runId: sharedRunId,
            task: 'Current assignment title',
            status: 'completed',
            createdAt: '2026-09-02T08:00:00.000Z',
            updatedAt: '2026-09-04T09:00:00.000Z',
          },
        ]),
      },
      controlPlaneClient: {
        listAgentRuns: vi.fn().mockResolvedValue({
          status: 200,
          headers: {},
          body: {
            runs: [
              {
                id: sharedRunId,
                state: 'awaiting_approval',
                created_at: '2026-09-02T08:00:00.000Z',
                updated_at: '2026-09-03T09:00:00.000Z',
              },
            ],
          },
        }),
      },
    });

    const history = await h.service.runs(AUTH, AGENT_ID, 10);

    expect(history.body.runs).toEqual([
      expect.objectContaining({
        id: sharedRunId,
        workflowRunId: sharedRunId,
        title: 'Current assignment title',
        state: 'completed',
        updated_at: '2026-09-04T09:00:00.000Z',
      }),
    ]);
  });

  it('keeps control-plane readiness separate from the locked n8n execution path', async () => {
    const h = harness();

    await expect(h.service.runtimeStatus(AUTH)).resolves.toEqual({
      status: 200,
      headers: { requestId: 'runtime-request' },
      body: {
        version: 'orqaly_agent_runtime_status_v1',
        configured: true,
        status: 'identity_ready_execution_locked',
        controlPlane: { service: 'orqaly-agentic-control-plane', status: 'ready' },
        execution: {
          enabled: true,
          connected: false,
          status: 'release_gated',
          provider: 'n8n',
          mode: 'self_hosted',
        },
      },
    });
    expect(h.controlPlaneClient.runtimeStatus).toHaveBeenCalledOnce();
  });

  it('fails closed for unbound users and invalid Agent selectors', async () => {
    const unbound = harness({
      repository: { resolveTenant: vi.fn().mockResolvedValue(null) },
    });
    await expect(unbound.service.list(AUTH)).rejects.toMatchObject({
      code: 'TENANT_NOT_BOUND',
      status: 403,
    });
    expect(unbound.controlPlaneClient.listAgents).not.toHaveBeenCalled();

    const invalid = harness();
    await expect(invalid.service.read(AUTH, '../another-tenant')).rejects.toMatchObject({
      code: 'INVALID_AGENT_ID',
      status: 400,
    });
    expect(invalid.controlPlaneClient.readAgent).not.toHaveBeenCalled();
    await expect(invalid.service.list(AUTH, 100, 'unknown')).rejects.toMatchObject({
      code: 'INVALID_AGENT_STATE',
      status: 400,
    });
    expect(invalid.controlPlaneClient.listAgents).not.toHaveBeenCalled();
  });
});
