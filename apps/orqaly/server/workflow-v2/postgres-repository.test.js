import { describe, expect, it, vi } from 'vitest';
import { createScopeCompletion } from '../../scripts/workflow-v2-local-e2e-fixtures.mjs';
import { canonicalHash, sha256Hex } from '../../lib/workflow-v2/canonical.js';
import {
  appendAssistantTurnEventWithClient,
  createAssistantRetryTurnWithClient,
  createAssistantTurnWithClient,
  ensurePersonalTenant,
  loadPlanningAgentRows,
  loadSnapshotWithClient,
  readAgentAssignmentStatsWithClient,
  readAgentAssignmentsForAgentWithClient,
  readDelegatedAgentsWithClient,
  readAssistantThreadWithClient,
  readAssistantTurnEventsWithClient,
  readActivityProjectionWithClient,
  readOverviewProjectionWithClient,
  readWorkspaceProjectionWithClient,
  resolvePersonalTenant,
} from './postgres-repository.js';

const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

describe('workflow v2 tenant agent read path', () => {
  it('filters by each required capability set in PostgreSQL before ranking or limiting', async () => {
    const tenantId = id(1);
    const matching = {
      id: id(900),
      name: 'Lower-ranked matching tenant agent',
      capabilities: ['evidence_synthesis', 'prd', 'product_strategy'],
      tool_ids: [],
      quality_score: '0.10',
      cost_per_run_cents: 5,
    };
    const unrelated = Array.from({ length: 150 }, (_, index) => ({
      ...matching,
      id: id(100 + index),
      name: `Unrelated ${index}`,
      capabilities: ['research'],
      quality_score: '1.0',
    }));
    const client = {
      query: vi.fn(async (sql, parameters) => {
        const required = parameters[1];
        // This branch models the old bug: an unfiltered top-100 catalogue loses
        // the legitimate lower-ranked match behind unrelated agents.
        if (!required.length) return { rows: unrelated.slice(0, 100) };
        expect(sql).toContain('list_tenant_agents($1, $2::text[], 1000)');
        return { rows: [matching] };
      }),
    };
    const scope = createScopeCompletion({
      artifactId: id(901),
      inputHash: 'a'.repeat(64),
    }).artifact.payload;
    const rows = await loadPlanningAgentRows(client, tenantId, scope);

    expect(rows).toEqual([matching]);
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls.map(([, parameters]) => parameters)).toEqual([
      [tenantId, ['prd']],
      [tenantId, ['product_strategy']],
      [tenantId, ['evidence_synthesis']],
    ]);
    expect(client.query.mock.calls.every(([, parameters]) => parameters[1].length > 0)).toBe(true);
  });
});

describe('workflow v2 personal Clerk tenant provisioning', () => {
  it('ensures a personal user tenant and exposes the stable provisioning result', async () => {
    const identityPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ tenant_id: id(1), created: true }],
      }),
    };

    await expect(
      ensurePersonalTenant(identityPool, 'preview', 'user_personal123')
    ).resolves.toEqual({ tenantId: id(1), created: true });
    expect(identityPool.query).toHaveBeenCalledWith(
      'SELECT tenant_id, created FROM orqaly.ensure_personal_tenant($1, $2)',
      ['preview', 'user_personal123']
    );
  });

  it.each([
    { rows: [] },
    {
      rows: [
        { tenant_id: id(1), created: false },
        { tenant_id: id(1), created: false },
      ],
    },
    { rows: [{ tenant_id: null, created: false }] },
    { rows: [{ tenant_id: id(1), created: 'false' }] },
  ])('rejects a malformed provisioning result: $rows', async (result) => {
    const identityPool = { query: vi.fn().mockResolvedValue(result) };

    await expect(ensurePersonalTenant(identityPool, 'preview', 'user_personal123')).rejects.toThrow(
      'ensure_personal_tenant returned an invalid result'
    );
  });

  it('returns the ensured tenant id to the service-facing resolver', async () => {
    const identityPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ tenant_id: id(1), created: false }],
      }),
    };

    await expect(resolvePersonalTenant(identityPool, 'preview', 'user_personal123')).resolves.toBe(
      id(1)
    );
  });

  it('maps only a suspended-tenant authorization error to an unresolved tenant', async () => {
    const suspended = Object.assign(new Error('personal tenant is not active'), { code: '42501' });
    const identityPool = { query: vi.fn().mockRejectedValue(suspended) };

    await expect(
      resolvePersonalTenant(identityPool, 'preview', 'user_personal123')
    ).resolves.toBeNull();
  });

  it('propagates database and provisioning failures', async () => {
    const failure = Object.assign(new Error('database unavailable'), { code: '08006' });
    const identityPool = { query: vi.fn().mockRejectedValue(failure) };

    await expect(resolvePersonalTenant(identityPool, 'preview', 'user_personal123')).rejects.toBe(
      failure
    );
  });
});

describe('workflow v2 Assistant persistence', () => {
  it('lists delegated Agents only through the tenant and owner-scoped chat projection', async () => {
    const tenantId = id(1);
    const threadId = id(2);
    const runId = id(3);
    const createdAt = new Date('2026-09-03T09:00:00.000Z');
    const updatedAt = new Date('2026-09-03T09:05:00.000Z');
    const task = 'Prepare the launch.';
    const profile = {
      version: 'orqaly_agent_profile_input_v1',
      displayName: 'Launch Agent',
      roleLabel: 'Task executor',
      description: 'Prepares launch work.',
      instructions: task,
      avatar: { kind: 'icon', value: 'smart_toy', color: '#6750A4' },
    };
    const executionAgent = {
      schemaVersion: 'orqaly.execution-agent.v1',
      id: id(4),
      runId,
      owner: { tenantId, userId: 'user_personal123' },
      lifetime: 'persistent',
      source: { threadId, turnId: id(5), taskHash: sha256Hex(task) },
      profileSnapshot: {
        version: 'orqaly_execution_agent_profile_snapshot_v1',
        profileVersion: {
          version: 'orqaly_agent_profile_v1',
          id: id(6),
          agentId: id(4),
          versionNumber: 1,
          contentHash: canonicalHash(profile),
        },
        profile,
      },
      executorPersona: {
        role: 'task_executor',
        profileVersion: 'axwise_executor_persona_v1',
        provider: 'axwise',
        binding: 'fixed_profile_contract',
      },
      memory: { scope: 'thread_and_goal', crossThread: false },
      runtime: { provider: 'orqaly_workflow_v2', isolation: 'tenant_user' },
      capabilities: {
        research: true,
        planning: true,
        artifactProduction: true,
        approvalGates: true,
      },
      tools: { externalActions: false, executionProvider: null },
    };
    const agentPart = {
      type: 'delegated_agent',
      id: id(4),
      runId,
      threadId,
      name: 'Launch Agent',
      task,
      lifetime: 'persistent',
      status: 'requested',
      executorPersona: {
        role: 'task_executor',
        version: 'axwise_executor_persona_v1',
        provider: 'axwise',
        status: 'contract_bound',
      },
      memoryScope: { kind: 'thread_and_goal', label: 'This chat and Goal only' },
      runtime: {
        provider: 'orqaly_workflow_v2',
        label: 'Orqaly GCP + AxWise',
        isolation: 'tenant_user',
      },
      capabilities: {
        research: true,
        planning: true,
        artifactProduction: true,
        approvalGates: true,
        externalActions: false,
      },
      toolExecution: { status: 'not_configured', provider: null },
      executionAgent,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
    };
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            thread_id: threadId,
            workflow_run_id: runId,
            created_at: createdAt,
            agent_part: agentPart,
            current_status: 'awaiting_gate_1',
            current_updated_at: updatedAt,
          },
        ],
      }),
    };

    await expect(
      readDelegatedAgentsWithClient(client, tenantId, 'user_personal123', 7)
    ).resolves.toEqual(
      [
        {
          ...agentPart,
          type: undefined,
          status: 'awaiting_gate_1',
          updatedAt: updatedAt.toISOString(),
        },
      ].map(({ type: _type, ...agent }) => agent)
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringMatching(
        /run\.owner_user_id = \$2[\s\S]*thread\.owner_user_id = \$2[\s\S]*agent_part\.value ->> 'type' = 'delegated_agent'/u
      ),
      [tenantId, 'user_personal123', 7]
    );
    expect(client.query.mock.calls[0][0]).toMatch(
      /lifetime' = 'persistent'[\s\S]*run\.status IN \('requested', 'running', 'awaiting_gate_1', 'awaiting_gate_2'\)/u
    );

    const terminalTemporaryPart = structuredClone(agentPart);
    terminalTemporaryPart.lifetime = 'temporary';
    terminalTemporaryPart.executionAgent.lifetime = 'temporary';
    const assignmentHistoryClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            thread_id: threadId,
            workflow_run_id: runId,
            created_at: createdAt,
            agent_part: terminalTemporaryPart,
            current_status: 'completed',
            current_updated_at: updatedAt,
          },
        ],
      }),
    };
    await expect(
      readAgentAssignmentsForAgentWithClient(
        assignmentHistoryClient,
        tenantId,
        'user_personal123',
        agentPart.id,
        500
      )
    ).resolves.toEqual([
      expect.objectContaining({
        id: agentPart.id,
        runId,
        lifetime: 'temporary',
        status: 'completed',
      }),
    ]);
    expect(assignmentHistoryClient.query.mock.calls[0][0]).not.toMatch(
      /lifetime' = 'persistent'|run\.status IN/u
    );
    expect(assignmentHistoryClient.query.mock.calls[0][0]).toMatch(
      /run\.owner_user_id = \$2[\s\S]*thread\.owner_user_id = \$2[\s\S]*agent_part\.value ->> 'type' = 'delegated_agent'/u
    );
    expect(assignmentHistoryClient.query.mock.calls[0][0]).toMatch(
      /agent_part\.value ->> 'id' = \$3[\s\S]*executionAgent,profileSnapshot,profileVersion,agentId[\s\S]*= \$3/u
    );
    expect(assignmentHistoryClient.query).toHaveBeenCalledWith(expect.any(String), [
      tenantId,
      'user_personal123',
      agentPart.id,
      500,
    ]);

    const assignmentStatsClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            thread_id: threadId,
            workflow_run_id: runId,
            created_at: createdAt,
            agent_id: agentPart.id,
            agent_part: terminalTemporaryPart,
            current_status: 'completed',
            current_updated_at: updatedAt,
            run_count: 2,
          },
        ],
      }),
    };
    await expect(
      readAgentAssignmentStatsWithClient(assignmentStatsClient, tenantId, 'user_personal123', [
        agentPart.id,
      ])
    ).resolves.toEqual([
      {
        agentId: agentPart.id,
        runCount: 2,
        latestAssignment: expect.objectContaining({
          id: agentPart.id,
          runId,
          lifetime: 'temporary',
          status: 'completed',
        }),
      },
    ]);

    const legacyPart = structuredClone(agentPart);
    delete legacyPart.executionAgent;
    legacyPart.executorPersona.status = 'formed_during_goal';
    const legacyClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            thread_id: threadId,
            workflow_run_id: runId,
            created_at: createdAt,
            agent_part: legacyPart,
            current_status: 'completed',
            current_updated_at: updatedAt,
          },
        ],
      }),
    };
    const [legacyAgent] = await readDelegatedAgentsWithClient(
      legacyClient,
      tenantId,
      'user_personal123',
      7
    );
    expect(legacyAgent.executorPersona.status).toBe('legacy_unverified');
    expect(legacyAgent).not.toHaveProperty('executionAgent');
    expect(legacyPart.executorPersona.status).toBe('formed_during_goal');

    const threadClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: threadId,
              tenant_id: tenantId,
              owner_user_id: 'user_personal123',
              owner_organization_id: null,
              title: 'Legacy Agent chat',
              status: 'active',
              created_at: createdAt,
              updated_at: updatedAt,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: id(6),
              thread_id: threadId,
              turn_id: id(5),
              role: 'assistant',
              route: 'START_GOAL',
              parts: [legacyPart],
              axwise_operation_id: null,
              workflow_run_id: runId,
              retry_of_turn_id: null,
              requested_intent: null,
              resolved_route: null,
              route_policy_version: null,
              route_reason_code: null,
              model: null,
              model_version: null,
              created_at: createdAt,
            },
          ],
        }),
    };
    const legacyThread = await readAssistantThreadWithClient(
      threadClient,
      tenantId,
      threadId,
      'user_personal123'
    );
    expect(legacyThread.messages[0].parts[0].executorPersona.status).toBe('legacy_unverified');
    expect(legacyThread.messages[0].parts[0]).not.toHaveProperty('executionAgent');
  });

  it('groups deduplicated Workflow assignment stats only for requested first-class Agent IDs', async () => {
    const tenantId = id(1);
    const firstAgentId = id(4);
    const secondAgentId = id(5);
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

    await expect(
      readAgentAssignmentStatsWithClient(client, tenantId, 'user_personal123', [])
    ).resolves.toEqual([]);
    expect(client.query).not.toHaveBeenCalled();

    await expect(
      readAgentAssignmentStatsWithClient(client, tenantId, 'user_personal123', [
        firstAgentId,
        secondAgentId,
        firstAgentId,
      ])
    ).resolves.toEqual([]);

    const [sql, parameters] = client.query.mock.calls[0];
    expect(parameters).toEqual([tenantId, 'user_personal123', [firstAgentId, secondAgentId]]);
    expect(sql).toMatch(/message\.tenant_id = \$1[\s\S]*thread\.owner_user_id = \$2/u);
    expect(sql).toMatch(/agent_part\.value ->> 'id' = ANY\(\$3::text\[\]\)/u);
    expect(sql).toMatch(
      /executionAgent,profileSnapshot,profileVersion,agentId[\s\S]*agent_part\.value ->> 'id'/u
    );
    expect(sql).toMatch(/DISTINCT ON \(agent_id, workflow_run_id\)/u);
    expect(sql).toMatch(/count\(\*\) OVER \(PARTITION BY agent_id\)/u);
    expect(sql).toMatch(/row_number\(\) OVER/u);
    expect(sql).not.toMatch(/lifetime' = 'persistent'|run\.status IN/u);
  });

  it('orders tied turn timestamps by turn and user before assistant', async () => {
    const tenantId = id(1);
    const threadId = id(2);
    const turnId = id(3);
    const ownerUserId = 'user_personal123';
    const createdAt = new Date('2026-08-31T18:00:00.000Z');
    const client = {
      query: vi.fn(async (sql, parameters) => {
        if (sql.includes('orqaly.assistant_threads')) {
          expect(parameters).toEqual([tenantId, threadId, ownerUserId]);
          return {
            rows: [
              {
                tenant_id: tenantId,
                id: threadId,
                owner_user_id: ownerUserId,
                owner_organization_id: null,
                title: 'Persisted conversation',
                status: 'active',
                created_at: createdAt,
                updated_at: createdAt,
              },
            ],
          };
        }

        expect(parameters).toEqual([tenantId, threadId]);
        expect(sql).toMatch(
          /ORDER BY created_at, turn_id,\s*CASE role WHEN 'user' THEN 0 WHEN 'assistant' THEN 1 ELSE 2 END,\s*id/u
        );
        return {
          rows: ['user', 'assistant'].map((role, index) => ({
            tenant_id: tenantId,
            thread_id: threadId,
            id: id(4 + index),
            turn_id: turnId,
            role,
            route: 'DIRECT_ANSWER',
            parts: [{ type: 'text', markdown: role === 'user' ? 'Question' : 'Answer' }],
            axwise_operation_id: null,
            workflow_run_id: null,
            retry_of_turn_id: null,
            ...(role === 'user'
              ? {
                  requested_intent: 'auto',
                  resolved_route: 'DIRECT_ANSWER',
                  route_policy_version: 'orqaly.assistant-route-policy.v1',
                  route_reason_code: 'auto_direct',
                }
              : {
                  model: 'models/gemini-3.8-flash',
                  model_version: 'gemini-3.8-flash',
                }),
            created_at: createdAt,
          })),
        };
      }),
    };

    const reloaded = await readAssistantThreadWithClient(client, tenantId, threadId, ownerUserId);

    expect(reloaded.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(reloaded.messages[0]).toMatchObject({
      requestedIntent: 'auto',
      resolvedRoute: 'DIRECT_ANSWER',
      routePolicyVersion: 'orqaly.assistant-route-policy.v1',
      routeReasonCode: 'auto_direct',
    });
    expect(reloaded.messages[1]).toMatchObject({
      model: 'models/gemini-3.8-flash',
      modelVersion: 'gemini-3.8-flash',
    });
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('writes complete route provenance through the parameterized user insert', async () => {
    const tenantId = id(1);
    const threadId = id(2);
    const turnId = id(3);
    const createdAt = '2026-09-03T09:00:00.000Z';
    const threadRow = {
      tenant_id: tenantId,
      id: threadId,
      owner_user_id: 'user_personal123',
      owner_organization_id: null,
      title: 'Verify production',
      status: 'active',
      created_at: new Date(createdAt),
      updated_at: new Date(createdAt),
    };
    const message = {
      id: id(4),
      threadId,
      turnId,
      role: 'user',
      route: 'AXWISE_ONE_SHOT',
      parts: [{ type: 'text', markdown: 'Verify the current production behavior.' }],
      contentHash: 'a'.repeat(64),
      axwiseOperationId: id(5),
      workflowRunId: null,
      retryOfTurnId: null,
      requestedIntent: 'auto',
      resolvedRoute: 'AXWISE_ONE_SHOT',
      routePolicyVersion: 'orqaly.assistant-route-policy.v1',
      routeReasonCode: 'verification_requested',
      createdAt,
    };
    const persistedRow = {
      tenant_id: tenantId,
      thread_id: threadId,
      id: message.id,
      turn_id: turnId,
      role: 'user',
      route: message.route,
      parts: message.parts,
      axwise_operation_id: message.axwiseOperationId,
      workflow_run_id: null,
      retry_of_turn_id: null,
      requested_intent: message.requestedIntent,
      resolved_route: message.resolvedRoute,
      route_policy_version: message.routePolicyVersion,
      route_reason_code: message.routeReasonCode,
      model: null,
      model_version: null,
      created_at: new Date(createdAt),
    };
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [threadRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ latest_created_at: null, has_pending_turn: false }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [persistedRow] }),
    };

    await expect(
      createAssistantTurnWithClient(
        client,
        tenantId,
        { userId: 'user_personal123' },
        { id: threadId, title: threadRow.title, createdAt },
        message
      )
    ).resolves.toMatchObject({
      message: {
        requestedIntent: 'auto',
        resolvedRoute: 'AXWISE_ONE_SHOT',
        routeReasonCode: 'verification_requested',
      },
    });
    expect(client.query.mock.calls[4][0]).toContain('requested_intent');
    expect(client.query.mock.calls[4][0]).toContain('model_version');
    expect(client.query.mock.calls[4][1].slice(10, 16)).toEqual([
      'auto',
      'AXWISE_ONE_SHOT',
      'orqaly.assistant-route-policy.v1',
      'verification_requested',
      null,
      null,
    ]);
  });

  it('serializes a thread and rejects a non-monotonic new turn timestamp', async () => {
    const tenantId = id(1);
    const threadId = id(2);
    const owner = { userId: 'user_personal123' };
    const createdAt = '2026-08-31T18:00:00.000Z';
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: threadId }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ latest_created_at: new Date(createdAt), has_pending_turn: false }],
        }),
    };

    await expect(
      createAssistantTurnWithClient(
        client,
        tenantId,
        owner,
        { id: threadId, title: 'Conversation', createdAt },
        {
          id: id(3),
          threadId,
          turnId: id(4),
          role: 'user',
          route: 'DIRECT_ANSWER',
          parts: [{ type: 'text', markdown: 'Second arrival' }],
          contentHash: 'a'.repeat(64),
          axwiseOperationId: null,
          workflowRunId: null,
          retryOfTurnId: null,
          createdAt,
        }
      )
    ).rejects.toMatchObject({ code: 'ASSISTANT_TURN_TIMESTAMP_CONFLICT' });
    expect(client.query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(client.query).toHaveBeenCalledTimes(4);
  });

  it('rejects a new turn while the locked thread still has an unanswered user message', async () => {
    const tenantId = id(1);
    const threadId = id(2);
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: threadId }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              latest_created_at: new Date('2026-08-31T18:00:00.000Z'),
              has_pending_turn: true,
            },
          ],
        }),
    };

    await expect(
      createAssistantTurnWithClient(
        client,
        tenantId,
        { userId: 'user_personal123' },
        { id: threadId, title: 'Conversation', createdAt: '2026-08-31T18:01:00.000Z' },
        {
          id: id(3),
          threadId,
          turnId: id(4),
          role: 'user',
          route: 'DIRECT_ANSWER',
          parts: [{ type: 'text', markdown: 'Too early' }],
          contentHash: 'a'.repeat(64),
          axwiseOperationId: null,
          workflowRunId: null,
          retryOfTurnId: null,
          createdAt: '2026-08-31T18:01:00.000Z',
        }
      )
    ).rejects.toMatchObject({ code: 'ASSISTANT_TURN_PENDING' });
  });

  it('rejects a retry while the locked thread has any unanswered user message', async () => {
    const tenantId = id(1);
    const threadId = id(2);
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: threadId }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              latest_created_at: new Date('2026-08-31T18:00:00.000Z'),
              has_pending_turn: true,
            },
          ],
        }),
    };

    await expect(
      createAssistantRetryTurnWithClient(client, tenantId, 'user_personal123', {
        id: id(3),
        threadId,
        turnId: id(4),
        role: 'user',
        route: 'DIRECT_ANSWER',
        parts: [{ type: 'text', markdown: 'Retry the answer' }],
        contentHash: 'a'.repeat(64),
        axwiseOperationId: id(5),
        workflowRunId: null,
        retryOfTurnId: id(6),
        createdAt: '2026-08-31T18:01:00.000Z',
      })
    ).rejects.toMatchObject({ code: 'ASSISTANT_TURN_PENDING' });
    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(client.query.mock.calls[3][0]).toContain('has_pending_turn');
  });

  it('returns the exact persisted retry before applying the pending-turn check', async () => {
    const tenantId = id(1);
    const threadId = id(2);
    const message = {
      id: id(3),
      threadId,
      turnId: id(4),
      role: 'user',
      route: 'DIRECT_ANSWER',
      parts: [{ type: 'text', markdown: 'Retry the answer' }],
      contentHash: 'a'.repeat(64),
      axwiseOperationId: id(5),
      workflowRunId: null,
      retryOfTurnId: id(6),
      createdAt: '2026-08-31T18:01:00.000Z',
    };
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: threadId }] })
        .mockResolvedValueOnce({
          rows: [
            {
              tenant_id: tenantId,
              thread_id: threadId,
              id: message.id,
              turn_id: message.turnId,
              role: message.role,
              route: message.route,
              parts: message.parts,
              axwise_operation_id: message.axwiseOperationId,
              workflow_run_id: null,
              retry_of_turn_id: message.retryOfTurnId,
              created_at: new Date(message.createdAt),
            },
          ],
        }),
    };

    await expect(
      createAssistantRetryTurnWithClient(client, tenantId, 'user_personal123', message)
    ).resolves.toMatchObject({
      conflictingChild: false,
      message: { turnId: message.turnId, retryOfTurnId: message.retryOfTurnId },
    });
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('appends an idempotent lifecycle event and accepts the database-assigned sequence', async () => {
    const tenantId = id(1);
    const threadId = id(2);
    const event = {
      id: id(3),
      threadId,
      turnId: id(4),
      type: 'submitted',
      route: 'DIRECT_ANSWER',
      operationId: id(5),
      retryOfTurnId: null,
      occurredAt: '2026-09-02T10:00:00.000Z',
      contentHash: 'a'.repeat(64),
    };
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: threadId }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              tenant_id: tenantId,
              thread_id: threadId,
              id: event.id,
              sequence: '7',
              turn_id: event.turnId,
              event_type: event.type,
              route: event.route,
              axwise_operation_id: event.operationId,
              retry_of_turn_id: null,
              event_hash: event.contentHash,
              occurred_at: new Date(event.occurredAt),
            },
          ],
        }),
    };

    await expect(
      appendAssistantTurnEventWithClient(client, tenantId, 'user_personal123', event)
    ).resolves.toMatchObject({ sequence: 7, type: 'submitted', contentHash: event.contentHash });
    expect(client.query.mock.calls[1][0]).toContain('ON CONFLICT (tenant_id, id) DO NOTHING');
    expect(client.query.mock.calls[1][1]).not.toContain(7);
  });

  it('reads lifecycle events after an owner-scoped monotonic cursor', async () => {
    const tenantId = id(1);
    const threadId = id(2);
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            tenant_id: tenantId,
            thread_id: threadId,
            id: id(3),
            sequence: '8',
            turn_id: id(4),
            event_type: 'completed',
            route: 'DIRECT_ANSWER',
            axwise_operation_id: id(5),
            retry_of_turn_id: null,
            event_hash: 'b'.repeat(64),
            occurred_at: new Date('2026-09-02T10:00:01.000Z'),
          },
        ],
      }),
    };

    await expect(
      readAssistantTurnEventsWithClient(client, tenantId, 'user_personal123', threadId, 7, 25)
    ).resolves.toMatchObject({ cursor: 8, events: [{ sequence: 8, type: 'completed' }] });
    expect(client.query.mock.calls[0][0]).toContain('thread.owner_user_id = $3');
    expect(client.query.mock.calls[0][0]).toContain('event.sequence > $4');
    expect(client.query.mock.calls[0][1]).toEqual([tenantId, threadId, 'user_personal123', 7, 25]);
  });
});

describe('workflow v2 GCP-safe read projections', () => {
  it('restores the durable original request when reopening a workflow snapshot', async () => {
    const tenantId = id(1);
    const runId = id(4);
    const originalRequest = 'Create the launch brief with cited evidence.';
    const client = {
      query: vi.fn(async (sql, parameters) => {
        expect(parameters).toEqual([tenantId, runId]);
        if (sql.includes('FROM orqaly.workflow_runs AS run')) {
          expect(sql).toContain("run.request_payload ->> 'request' AS request");
          return {
            rows: [
              {
                id: runId,
                tenant_id: tenantId,
                owner_user_id: 'user_personal123',
                owner_organization_id: null,
                mode: 'simple',
                status: 'completed',
                request: originalRequest,
                request_hash: 'a'.repeat(64),
                row_version: '3',
                evidence_readiness: 'ready',
                artifact_id: null,
                artifact_hash: null,
                artifact_kind: null,
              },
            ],
          };
        }
        return { rows: [] };
      }),
    };

    await expect(loadSnapshotWithClient(client, tenantId, runId)).resolves.toMatchObject({
      run: { id: runId, request: originalRequest },
    });
    expect(client.query).toHaveBeenCalledTimes(5);
  });

  it('loads a workspace and its agent catalogue without selecting cost or quality fields', async () => {
    const tenantId = id(1);
    const client = {
      query: vi.fn(async (sql, parameters) => {
        expect(parameters).toEqual([tenantId]);
        expect(sql).not.toContain('orqaly.tenants');
        expect(sql).toContain('WHERE tenant_id = $1');
        expect(sql).not.toContain('quality_score');
        expect(sql).not.toContain('cost_per_run_cents');
        return {
          rows: [
            {
              tenant_id: tenantId,
              id: id(2),
              name: 'Researcher',
              status: 'active',
              capabilities: ['research', 'evidence_synthesis'],
              tool_ids: [id(3)],
              quality_score: '0.99999',
              cost_per_run_cents: 5000,
              updated_at: new Date('2026-08-31T11:00:00.000Z'),
            },
          ],
        };
      }),
    };

    await expect(readWorkspaceProjectionWithClient(client, tenantId)).resolves.toEqual({
      displayName: 'Personal workspace',
      status: 'active',
      agents: [
        {
          id: id(2),
          name: 'Researcher',
          status: 'active',
          capabilities: ['research', 'evidence_synthesis'],
          toolIds: [id(3)],
          updatedAt: '2026-08-31T11:00:00.000Z',
        },
      ],
    });
    expect(client.query).toHaveBeenCalledOnce();
  });

  it('returns an empty active personal workspace when no agents are configured', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

    await expect(readWorkspaceProjectionWithClient(client, id(1))).resolves.toEqual({
      displayName: 'Personal workspace',
      status: 'active',
      agents: [],
    });
    expect(client.query).toHaveBeenCalledOnce();
  });

  it('loads bounded workflow summaries and all-tenant counts using explicit tenant filters', async () => {
    const tenantId = id(1);
    const runId = id(4);
    const client = {
      query: vi.fn(async (sql, parameters) => {
        expect(parameters[0]).toBe(tenantId);
        expect(sql).toContain('tenant_id = $1');
        expect(sql).not.toContain('owner_user_id');
        expect(sql).not.toContain('owner_organization_id');
        expect(sql).not.toContain('operation_status_url');
        expect(sql).not.toContain('lease_token');
        if (sql.includes('AS awaiting_approval')) {
          expect(parameters).toEqual([tenantId]);
          return {
            rows: [
              {
                total: '8',
                active: '2',
                awaiting_approval: '1',
                completed: '4',
                attention: '2',
              },
            ],
          };
        }
        expect(parameters).toEqual([tenantId, 12]);
        return {
          rows: [
            {
              tenant_id: tenantId,
              owner_user_id: 'user_must_not_escape',
              id: runId,
              request: 'Prepare the launch plan',
              mode: 'advanced',
              status: 'completed',
              evidence_readiness: 'ready',
              created_at: new Date('2026-08-31T09:00:00.000Z'),
              updated_at: new Date('2026-08-31T10:00:00.000Z'),
              total_stages: '7',
              completed_stages: '7',
              artifact_id: id(5),
              artifact_hash: 'a'.repeat(64),
              artifact_kind: 'final_markdown',
              operation_status_url: 'https://internal.invalid/operation',
            },
          ],
        };
      }),
    };

    await expect(readOverviewProjectionWithClient(client, tenantId, 12)).resolves.toEqual({
      counts: {
        total: 8,
        active: 2,
        awaitingApproval: 1,
        completed: 4,
        attention: 2,
      },
      workflows: [
        {
          id: runId,
          request: 'Prepare the launch plan',
          mode: 'advanced',
          status: 'completed',
          evidenceReadiness: 'ready',
          createdAt: '2026-08-31T09:00:00.000Z',
          updatedAt: '2026-08-31T10:00:00.000Z',
          totalStages: 7,
          completedStages: 7,
          finalArtifact: {
            artifactId: id(5),
            artifactHash: 'a'.repeat(64),
            kind: 'final_markdown',
          },
        },
      ],
    });
  });

  it('reads only public audit metadata and never selects event payloads or receipts', async () => {
    const tenantId = id(1);
    const client = {
      query: vi.fn(async (sql, parameters) => {
        expect(parameters).toEqual([tenantId, 50]);
        expect(sql).toContain('WHERE event.tenant_id = $1');
        expect(sql).not.toContain('event_payload');
        expect(sql).not.toContain('audit_payload');
        expect(sql).not.toContain('transition_receipt');
        expect(sql).not.toContain('event_hash');
        return {
          rows: [
            {
              tenant_id: tenantId,
              id: id(6),
              run_id: id(4),
              request: 'Prepare the launch plan',
              event_type: 'ActivityCompleted',
              stage_kind: 'execute_research',
              occurred_at: new Date('2026-08-31T10:30:00.000Z'),
              event_payload: { secret: 'must not escape' },
              transition_receipt: { leaseToken: id(99) },
            },
          ],
        };
      }),
    };

    await expect(readActivityProjectionWithClient(client, tenantId, 50)).resolves.toEqual([
      {
        id: id(6),
        runId: id(4),
        request: 'Prepare the launch plan',
        eventType: 'ActivityCompleted',
        stageKind: 'execute_research',
        occurredAt: '2026-08-31T10:30:00.000Z',
      },
    ]);
  });
});
