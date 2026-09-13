import { describe, expect, it, vi } from 'vitest';
import { createWorkflowV2Client } from './api.js';

describe('workflow v2 browser client', () => {
  it('manages app-key metadata through Clerk routes while exposing only a server-call URL for machine access', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () => new Response('{}', { headers: { 'content-type': 'application/json' } })
      );
    const client = createWorkflowV2Client(
      async () => 'synthetic-clerk-session',
      'https://api.example/'
    );
    const solution = { id: 'solution/id', rowVersion: 7, workflowHash: 'exact-hash' };
    await client.solutionAppKeys(solution.id);
    expect(fetchMock.mock.lastCall[0]).toBe(
      'https://api.example/v2/solutions/solution%2Fid/app-keys'
    );
    await client.createSolutionAppKey(
      solution,
      { label: 'Billing server', expiresInDays: 30 },
      'create-once'
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.example/v2/solutions/solution%2Fid/app-keys',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          label: 'Billing server',
          expiresInDays: 30,
          workflowHash: 'exact-hash',
        }),
        headers: expect.objectContaining({
          authorization: 'Bearer synthetic-clerk-session',
          'if-match': '"7"',
          'idempotency-key': 'create-once',
        }),
      })
    );
    await client.revokeSolutionAppKey(solution.id, { id: 'key/id', rowVersion: 2 });
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.example/v2/solutions/solution%2Fid/app-keys/key%2Fid/revoke',
      expect.objectContaining({
        method: 'POST',
        body: '{}',
        headers: expect.objectContaining({
          authorization: 'Bearer synthetic-clerk-session',
          'if-match': '"2"',
        }),
      })
    );
    expect(client.appInvocationEndpoint(solution.id)).toBe(
      'https://api.example/invoke/v1/solutions/solution%2Fid'
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    fetchMock.mockRestore();
  });
  it('uses authenticated source-bound build routes with explicit versions and idempotency keys', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () => new Response('{}', { headers: { 'content-type': 'application/json' } })
      );
    const client = createWorkflowV2Client(
      async () => 'synthetic-session',
      'https://api.orqaly.test'
    );
    const commands = [
      [
        () =>
          client.createSolutionBuildRequest(
            { runId: 'run', instruction: 'Build this explicit request' },
            'create-key'
          ),
        '/v2/solution-build-requests',
        { runId: 'run', instruction: 'Build this explicit request' },
        'create-key',
      ],
      [
        () =>
          client.answerSolutionBuildRequest(
            'id',
            { expectedVersion: 2, questionId: 'output', value: 'result' },
            'answer-key'
          ),
        '/v2/solution-build-requests/id/answers',
        { expectedVersion: 2, questionId: 'output', value: 'result' },
        'answer-key',
      ],
      [
        () => client.reviewSolutionBuildRequest('id', { expectedVersion: 3 }),
        '/v2/solution-build-requests/id/review',
        { expectedVersion: 3 },
        undefined,
      ],
      [
        () =>
          client.confirmSolutionBuildRequest(
            'id',
            { expectedVersion: 4, workflowHash: 'exact-hash' },
            'confirm-key'
          ),
        '/v2/solution-build-requests/id/confirm',
        { expectedVersion: 4, workflowHash: 'exact-hash' },
        'confirm-key',
      ],
      [
        () => client.retrySolutionBuildRequest('id', { expectedVersion: 5 }, 'retry-key'),
        '/v2/solution-build-requests/id/retry',
        { expectedVersion: 5 },
        'retry-key',
      ],
      [
        () => client.nativeBuildRequestSession('id', { mode: 'edit' }),
        '/v2/solution-build-requests/id/native-session',
        { mode: 'edit' },
        undefined,
      ],
    ];
    for (const [call, path, body, key] of commands) {
      await call();
      expect(fetchMock).toHaveBeenLastCalledWith(
        `https://api.orqaly.test${path}`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
          headers: expect.objectContaining({
            authorization: 'Bearer synthetic-session',
            ...(key ? { 'idempotency-key': key } : {}),
          }),
        })
      );
    }
    await client.solutionBuildRequests({ runId: 'run', agentId: 'agent' });
    expect(fetchMock.mock.lastCall[0]).toBe(
      'https://api.orqaly.test/v2/solution-build-requests?runId=run&agentId=agent'
    );
    await client.solutionBuildRequest('safe/id');
    expect(fetchMock.mock.lastCall[0]).toBe(
      'https://api.orqaly.test/v2/solution-build-requests/safe%2Fid'
    );
    expect(client.buildRequestEndpoint('id')).toBe(
      'https://api.orqaly.test/v2/solution-build-requests/id'
    );
    fetchMock.mockRestore();
  });
  it('bootstraps the personal workspace session with a Clerk-authenticated POST', async () => {
    const getToken = vi.fn().mockResolvedValue('verified-clerk-jwt');
    const responseBody = { session: { userId: 'user_123', tenantBound: true } };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    const client = createWorkflowV2Client(getToken, 'https://orqaly-preview.example');

    await expect(client.session()).resolves.toEqual(responseBody);

    expect(getToken).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://orqaly-preview.example/v2/session',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer verified-clerk-jwt' }),
      })
    );
    fetchMock.mockRestore();
  });

  it.each(['simple', 'advanced'])(
    'routes %s through the same authenticated command endpoint',
    async (mode) => {
      const getToken = vi.fn().mockResolvedValue('verified-clerk-jwt');
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ receipt: {}, workflow: {} }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      );
      const client = createWorkflowV2Client(getToken, 'https://orqaly-preview.example');
      const command = {
        commandId: '00000000-0000-4000-8000-000000000001',
        issuedAt: '2026-08-27T12:00:00.000Z',
        mode,
        request: 'Create an Estonia cat-food launch PRD.',
      };
      await client.start(command);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://orqaly-preview.example/v2/workflows',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ authorization: 'Bearer verified-clerk-jwt' }),
          body: JSON.stringify(command),
        })
      );
      fetchMock.mockRestore();
    }
  );

  it('fails closed when Clerk has no session token', async () => {
    const client = createWorkflowV2Client(() => Promise.resolve(null), 'https://orqaly.test');
    await expect(client.read('run')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
  });

  it('lists resumable runs through the tenant-scoped command API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ workflows: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const client = createWorkflowV2Client(
      () => Promise.resolve('verified-clerk-jwt'),
      'https://orqaly-preview.example'
    );

    await client.list({ limit: 12 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://orqaly-preview.example/v2/workflows?limit=12',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer verified-clerk-jwt' }),
      })
    );
    fetchMock.mockRestore();
  });

  it('sends, resumes, retries, and cancels Assistant turns through authenticated server-only writes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ persisted: false, message: {} }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        })
    );
    const client = createWorkflowV2Client(
      () => Promise.resolve('verified-clerk-jwt'),
      'https://orqaly-preview.example'
    );
    const command = {
      turnId: '00000000-0000-4000-8000-000000000020',
      issuedAt: '2026-08-31T18:00:00.000Z',
      message: 'Hello Assistant',
    };
    await client.assistantSend('00000000-0000-4000-8000-000000000021', command);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/assistant/threads/00000000-0000-4000-8000-000000000021/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(command),
        headers: expect.objectContaining({ authorization: 'Bearer verified-clerk-jwt' }),
      })
    );
    await client.assistantResume('00000000-0000-4000-8000-000000000021', command.turnId);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/assistant/threads/00000000-0000-4000-8000-000000000021/turns/00000000-0000-4000-8000-000000000020/resume',
      expect.objectContaining({ method: 'POST' })
    );
    const retryCommand = {
      turnId: '00000000-0000-4000-8000-000000000022',
      issuedAt: '2026-08-31T18:01:00.000Z',
    };
    await client.assistantRetry(
      '00000000-0000-4000-8000-000000000021',
      command.turnId,
      retryCommand
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/assistant/threads/00000000-0000-4000-8000-000000000021/turns/00000000-0000-4000-8000-000000000020/retry',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(retryCommand),
      })
    );
    await client.assistantCancel('00000000-0000-4000-8000-000000000021', command.turnId);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/assistant/threads/00000000-0000-4000-8000-000000000021/turns/00000000-0000-4000-8000-000000000020/cancel',
      expect.objectContaining({ method: 'POST' })
    );
    fetchMock.mockRestore();
  });

  it('reads authenticated Assistant lifecycle SSE with a resumable cursor', async () => {
    const threadId = '00000000-0000-4000-8000-000000000021';
    const event = {
      id: '00000000-0000-4000-8000-000000000023',
      threadId,
      turnId: '00000000-0000-4000-8000-000000000020',
      sequence: 6,
      type: 'completed',
      route: 'DIRECT_ANSWER',
      operationId: '00000000-0000-4000-8000-000000000024',
      retryOfTurnId: null,
      taskId: null,
      attemptId: null,
      payload: {},
      occurredAt: '2026-09-02T10:00:00.000Z',
    };
    const streamBody = `id: 6\nevent: assistant_turn\ndata: ${JSON.stringify(
      event
    )}\n\nevent: cursor\ndata: {"cursor":6}\n\n`;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(streamBody, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    );
    const client = createWorkflowV2Client(
      () => Promise.resolve('verified-clerk-jwt'),
      'https://orqaly-preview.example'
    );
    const onEvent = vi.fn();

    await expect(client.streamAssistantEvents(threadId, { after: 5, onEvent })).resolves.toEqual({
      events: [event],
      cursor: 6,
    });
    expect(onEvent).toHaveBeenCalledWith(event);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://orqaly-preview.example/v2/assistant/threads/${threadId}/events?after=5&limit=100`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          accept: 'text/event-stream',
          authorization: 'Bearer verified-clerk-jwt',
        }),
      })
    );
    fetchMock.mockRestore();
  });

  it('sends scope corrections as a typed command bound to the accepted artifact', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ workflow: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const client = createWorkflowV2Client(
      () => Promise.resolve('verified-clerk-jwt'),
      'https://orqaly-preview.example'
    );
    const command = {
      commandId: '00000000-0000-4000-8000-000000000010',
      issuedAt: '2026-08-27T12:00:00.000Z',
      acceptedScope: {
        artifactId: '00000000-0000-4000-8000-000000000011',
        artifactHash: 'a'.repeat(64),
        kind: 'scope',
      },
      correction: 'Cover adult cats only.',
      idempotencyKey: 'stable-revision-command',
    };

    await client.reviseScope('00000000-0000-4000-8000-000000000012', command);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://orqaly-preview.example/v2/workflows/00000000-0000-4000-8000-000000000012/commands',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ type: 'revise_scope', ...command }),
      })
    );
    fetchMock.mockRestore();
  });

  it('can return final Markdown together with its immutable response ETag', async () => {
    const hash = 'c'.repeat(64);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('# Final artifact', {
        status: 200,
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          etag: `"sha256-${hash}"`,
        },
      })
    );
    const client = createWorkflowV2Client(
      () => Promise.resolve('verified-clerk-jwt'),
      'https://orqaly-preview.example'
    );

    await expect(
      client.artifact('run-id', 'artifact-id', { markdown: true, includeMetadata: true })
    ).resolves.toEqual({ markdown: '# Final artifact', etag: `"sha256-${hash}"` });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://orqaly-preview.example/v2/workflows/run-id/artifacts/artifact-id',
      expect.objectContaining({ headers: expect.objectContaining({ accept: 'text/markdown' }) })
    );
    fetchMock.mockRestore();
  });

  it('proposes, reads, and version-binds executable actions through the Workflow client', async () => {
    const responseBody = {
      version: 'orqaly_executable_action_aggregate_v1',
      action: null,
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    const client = createWorkflowV2Client(
      () => Promise.resolve('verified-clerk-jwt'),
      'https://orqaly-preview.example'
    );
    const runId = '10000000-0000-4000-8000-000000000001';
    const actionId = '20000000-0000-4000-8000-000000000001';
    const proposal = {
      version: 'orqaly_executable_action_proposal_v1',
      idempotencyKey: 'proposal-key',
      operation: 'operational_record_create_v1',
      input: { title: 'Create an execution proof' },
    };
    const decision = {
      version: 'orqaly_executable_action_decision_v1',
      idempotencyKey: 'approval-key',
      decision: 'approve',
    };

    await client.readExecutableAction(runId);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `https://orqaly-preview.example/v1/runs/${runId}/executable-actions`,
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer verified-clerk-jwt' }),
      })
    );

    await client.proposeExecutableAction(runId, proposal);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `https://orqaly-preview.example/v1/runs/${runId}/executable-actions`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(proposal) })
    );

    await client.decideExecutableAction(actionId, decision, 7);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `https://orqaly-preview.example/v1/executable-actions/${actionId}/decision`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(decision),
        headers: expect.objectContaining({ 'if-match': '"7"' }),
      })
    );
    fetchMock.mockRestore();
  });

  it('reads GCP workspace projections through concise authenticated client methods', async () => {
    const responseBody = { sentinel: 'projection' };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    const client = createWorkflowV2Client(
      () => Promise.resolve('verified-clerk-jwt'),
      'https://orqaly-preview.example/'
    );

    await expect(client.workspace()).resolves.toEqual(responseBody);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/workspace',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer verified-clerk-jwt' }),
      })
    );
    await expect(client.agents()).resolves.toEqual(responseBody);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/agents?limit=100',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer verified-clerk-jwt' }),
      })
    );
    await expect(client.agents({ limit: 9 })).resolves.toEqual(responseBody);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/agents?limit=9',
      expect.any(Object)
    );
    await expect(client.overview()).resolves.toEqual(responseBody);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/overview?limit=25',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer verified-clerk-jwt' }),
      })
    );
    await expect(client.overview({ limit: 11 })).resolves.toEqual(responseBody);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/overview?limit=11',
      expect.any(Object)
    );
    await expect(client.activity()).resolves.toEqual(responseBody);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/activity?limit=50',
      expect.any(Object)
    );
    await expect(client.activity({ limit: 8 })).resolves.toEqual(responseBody);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/activity?limit=8',
      expect.any(Object)
    );

    fetchMock.mockRestore();
  });

  it('manages first-class Agents through authenticated, version-checked requests', async () => {
    const responseBody = { agent: { id: 'agent/id' } };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    const client = createWorkflowV2Client(
      () => Promise.resolve('verified-clerk-jwt'),
      'https://orqaly-preview.example'
    );
    const profile = {
      version: 'orqaly_agent_profile_input_v1',
      displayName: 'Mara Ops',
      roleLabel: 'Operations lead',
      description: 'Owns routine operations.',
      instructions: 'Draft first and request approval before an external effect.',
      avatar: { kind: 'icon', value: 'bolt', color: '#3559E0' },
    };
    const createCommand = {
      version: 'orqaly_agent_create_request_v1',
      agentKind: 'persistent',
      profile,
      expiresAt: null,
      idempotencyKey: 'create-agent-once',
    };

    await client.agents({ limit: 7, state: 'active' });
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/agents?limit=7&state=active',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer verified-clerk-jwt' }),
      })
    );

    await client.agent('agent/id');
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/agents/agent%2Fid',
      expect.any(Object)
    );

    await client.createAgent(createCommand);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/agents',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(createCommand),
        headers: expect.objectContaining({
          authorization: 'Bearer verified-clerk-jwt',
          'idempotency-key': 'create-agent-once',
        }),
      })
    );

    const updateCommand = {
      version: 'orqaly_agent_profile_update_request_v1',
      profile,
      idempotencyKey: 'update-agent-once',
    };
    await client.updateAgentProfile('agent/id', 3, updateCommand);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/agents/agent%2Fid/profile',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify(updateCommand),
        headers: expect.objectContaining({
          'idempotency-key': 'update-agent-once',
          'if-match': '3',
        }),
      })
    );

    const lifecycleCommand = {
      version: 'orqaly_agent_lifecycle_request_v1',
      action: 'pause',
      reason: 'Customer paused this Agent.',
      idempotencyKey: 'pause-agent-once',
    };
    await client.changeAgentLifecycle('agent/id', 4, lifecycleCommand);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/agents/agent%2Fid/lifecycle',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(lifecycleCommand),
        headers: expect.objectContaining({
          'idempotency-key': 'pause-agent-once',
          'if-match': '4',
        }),
      })
    );

    await client.agentRuns('agent/id', { limit: 12 });
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/agents/agent%2Fid/runs?limit=12',
      expect.any(Object)
    );

    await client.agentRuntimeStatus();
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://orqaly-preview.example/v2/agent-runtime/status',
      expect.any(Object)
    );
    fetchMock.mockRestore();
  });
});
