import { describe, expect, it, vi } from 'vitest';
import { canonicalHash } from '../../lib/workflow-v2/canonical.js';
import { AxWiseDispatchError } from './axwise-client.js';
import { createAssistantService } from './assistant-service.js';
import { deterministicUuid, workflowIds } from './ids.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const threadId = '22222222-2222-4222-8222-222222222222';
const turnId = '33333333-3333-4333-8333-333333333333';
const secondTurnId = '44444444-4444-4444-8444-444444444444';
const thirdTurnId = '88888888-8888-4888-8888-888888888888';
const agentId = '99999999-9999-4999-8999-999999999999';
const runId = workflowIds(
  tenantId,
  deterministicUuid(tenantId, threadId, turnId, 'start-goal')
).runId;
const auth = { userId: 'user_assistanttest' };
const issuedAt = '2026-08-31T18:00:00.000Z';

function publicMessage(message) {
  const { contentHash: _contentHash, ...value } = message;
  return value;
}

function memoryRepository() {
  const threads = new Map();
  const messages = [];
  const events = [];
  return {
    messages,
    events,
    resolveTenant: vi.fn(async () => tenantId),
    async findLatestAssistantGoalRunId(_tenantId, targetThreadId) {
      return (
        messages
          .slice()
          .reverse()
          .find((message) => message.threadId === targetThreadId && message.workflowRunId)
          ?.workflowRunId || null
      );
    },
    async createAssistantTurn(_tenantId, owner, thread, message) {
      if (!threads.has(thread.id)) {
        threads.set(thread.id, {
          id: thread.id,
          tenantId,
          ownerUserId: owner.userId,
          ownerOrganizationId: null,
          title: thread.title,
          status: 'active',
          createdAt: thread.createdAt,
          updatedAt: thread.createdAt,
        });
      }
      const stored = messages.find(
        (candidate) =>
          candidate.threadId === thread.id &&
          candidate.turnId === message.turnId &&
          candidate.role === 'user'
      );
      if (stored) return { thread: threads.get(thread.id), message: stored };
      const threadMessages = messages.filter((candidate) => candidate.threadId === thread.id);
      const pending = threadMessages.some(
        (candidate) =>
          candidate.role === 'user' &&
          !threadMessages.some(
            (other) => other.turnId === candidate.turnId && other.role === 'assistant'
          )
      );
      if (pending) {
        throw Object.assign(new Error('the previous assistant turn is still pending'), {
          code: 'ASSISTANT_TURN_PENDING',
        });
      }
      const latestCreatedAt = threadMessages
        .map((candidate) => candidate.createdAt)
        .sort()
        .at(-1);
      if (latestCreatedAt && message.createdAt <= latestCreatedAt) {
        throw Object.assign(new Error('assistant turn timestamps must increase monotonically'), {
          code: 'ASSISTANT_TURN_TIMESTAMP_CONFLICT',
        });
      }
      const inserted = publicMessage(message);
      messages.push(inserted);
      return { thread: threads.get(thread.id), message: inserted };
    },
    async appendAssistantMessage(_tenantId, _ownerUserId, message) {
      let stored = messages.find(
        (candidate) =>
          candidate.threadId === message.threadId &&
          candidate.turnId === message.turnId &&
          candidate.role === 'assistant'
      );
      if (!stored) {
        stored = publicMessage(message);
        messages.push(stored);
      }
      return stored;
    },
    async appendAssistantTurnEvent(_tenantId, _ownerUserId, event) {
      const existing = events.find((candidate) => candidate.id === event.id);
      if (existing) return existing;
      const stored = {
        ...event,
        occurredAt: new Date(event.occurredAt).toISOString(),
        sequence: events.filter((candidate) => candidate.threadId === event.threadId).length + 1,
      };
      events.push(stored);
      return stored;
    },
    async readAssistantTurnEvents(_tenantId, _ownerUserId, targetThreadId, afterSequence, limit) {
      const matching = events
        .filter((event) => event.threadId === targetThreadId && event.sequence > afterSequence)
        .slice(0, limit)
        .map(({ contentHash: _contentHash, ...event }) => event);
      return { events: matching, cursor: matching.at(-1)?.sequence || afterSequence };
    },
    async hasAssistantTurnEvent(_tenantId, _ownerUserId, targetThreadId, targetTurnId, type) {
      return events.some(
        (event) =>
          event.threadId === targetThreadId && event.turnId === targetTurnId && event.type === type
      );
    },
    async createAssistantRetryTurn(_tenantId, _ownerUserId, message) {
      const exact = messages.find(
        (candidate) =>
          candidate.threadId === message.threadId &&
          candidate.turnId === message.turnId &&
          candidate.role === 'user'
      );
      if (exact) return { message: exact, conflictingChild: false };
      const child = messages.find(
        (candidate) =>
          candidate.threadId === message.threadId &&
          candidate.retryOfTurnId === message.retryOfTurnId &&
          candidate.role === 'user'
      );
      if (child) return { message: child, conflictingChild: true };
      const threadMessages = messages.filter(
        (candidate) => candidate.threadId === message.threadId
      );
      const pending = threadMessages.some(
        (candidate) =>
          candidate.role === 'user' &&
          !threadMessages.some(
            (other) => other.turnId === candidate.turnId && other.role === 'assistant'
          )
      );
      if (pending) {
        throw Object.assign(new Error('the previous assistant turn is still pending'), {
          code: 'ASSISTANT_TURN_PENDING',
        });
      }
      const latestCreatedAt = threadMessages
        .map((candidate) => candidate.createdAt)
        .sort()
        .at(-1);
      if (latestCreatedAt && message.createdAt <= latestCreatedAt) {
        throw Object.assign(new Error('assistant turn timestamps must increase monotonically'), {
          code: 'ASSISTANT_TURN_TIMESTAMP_CONFLICT',
        });
      }
      const stored = publicMessage(message);
      messages.push(stored);
      return { message: stored, conflictingChild: false };
    },
    async loadAssistantThread(_tenantId, targetThreadId) {
      const thread = threads.get(targetThreadId);
      return thread
        ? {
            thread,
            messages: messages.filter((message) => message.threadId === targetThreadId),
          }
        : null;
    },
    async listAssistantThreads() {
      return [...threads.values()];
    },
    async listDelegatedAgents() {
      return messages.flatMap((message) =>
        message.parts
          .filter((part) => part.type === 'delegated_agent')
          .map(({ type: _type, ...agent }) => agent)
      );
    },
  };
}

function completed(markdown = 'A grounded answer.', overrides = {}, metrics = undefined) {
  return {
    operationId: '66666666-6666-4666-8666-666666666666',
    status: 'completed',
    canonicalInputHash: 'a'.repeat(64),
    result: {
      resultType: 'assistant_turn_completed',
      response: {
        schemaVersion: 'axwise.assistant-turn.v1',
        markdown,
        sources: [
          {
            title: 'European Commission',
            canonicalUrl: 'https://commission.europa.eu/strategy-and-policy_en',
            sourceTypes: ['government'],
          },
        ],
        facts: [
          {
            statement: 'The answer is supported by the returned source.',
            sourceUrls: ['https://commission.europa.eu/strategy-and-policy_en'],
          },
        ],
        recommendations: [],
        ...overrides,
      },
      ...(metrics === undefined ? {} : { metrics }),
    },
  };
}

function failed({
  retryable = true,
  errorClass = 'AXWISE_HTTP_500',
  retryAt,
  retryAfterSeconds,
  diagnostics,
} = {}) {
  return {
    operationId: '66666666-6666-4666-8666-666666666666',
    status: 'failed',
    canonicalInputHash: 'a'.repeat(64),
    retryable,
    errorClass,
    ...(retryAt ? { retryAt } : {}),
    ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
    ...(diagnostics ? { diagnostics } : {}),
  };
}

function forEnvelope(response, envelope) {
  return {
    ...response,
    operationId: envelope.operationId,
    canonicalInputHash: envelope.canonicalInputHash,
  };
}

function harness({ submitResult = completed(), agentService = null } = {}) {
  const repository = memoryRepository();
  const startResult = async (_auth, _command, trustedContext) => ({
    receipt: { idempotent: false },
    workflow: {
      run: { id: trustedContext.executionAgent.runId, status: 'requested' },
      attempts: [
        {
          inputPayload: {
            type: 'CompileScopeV3',
            executionAgent: trustedContext.executionAgent,
          },
        },
      ],
    },
  });
  const workflowCommandService = {
    start: vi.fn(startResult),
    startFromAssistant: vi.fn(startResult),
    read: vi.fn(async () => ({ run: { id: runId, status: 'running' } })),
  };
  let latestEnvelope = null;
  const axwiseClient = {
    submit: vi.fn(async (envelope) => {
      latestEnvelope = envelope;
      return forEnvelope(submitResult, envelope);
    }),
    poll: vi.fn(async () => forEnvelope(completed('Finished after polling.'), latestEnvelope)),
    cancel: vi.fn(async () =>
      forEnvelope(
        {
          operationId: '66666666-6666-4666-8666-666666666666',
          status: 'cancelled',
          canonicalInputHash: 'a'.repeat(64),
        },
        latestEnvelope
      )
    ),
    deterministicStatusUrl: vi.fn(
      (operationId) => `https://axwise.example/v2/operations/${operationId}?tenantId=${tenantId}`
    ),
  };
  return {
    repository,
    workflowCommandService,
    axwiseClient,
    service: createAssistantService({
      repository,
      workflowCommandService,
      axwiseClient,
      agentService,
    }),
  };
}

describe('assistant service', () => {
  it('reads reported metrics from the original completed operation after persisted replay and later turns', async () => {
    const h = harness();
    const metrics = { latencyMs: 900, provider: 'google', model: 'gemini-3.8-flash',
      inputTokens: 120, outputTokens: 40, totalTokens: 160 };
    await h.service.send(auth, threadId, { turnId, issuedAt, message: 'Explain retries.' });
    const original = h.axwiseClient.submit.mock.calls[0][0];
    await h.service.send(auth, threadId, { turnId: secondTurnId,
      issuedAt: '2026-08-31T18:01:00.000Z', message: 'Explain queues.' });
    h.axwiseClient.poll.mockResolvedValue(forEnvelope(completed('Original answer.', {}, metrics), original));
    expect((await h.service.resume(auth, threadId, turnId)).idempotent).toBe(true);
    const before = structuredClone({ messages: h.repository.messages, events: h.repository.events });
    await expect(h.service.readTurnMetrics(auth, threadId, turnId)).resolves.toEqual(metrics);
    expect(h.axwiseClient.poll).toHaveBeenCalledWith(
      `https://axwise.example/v2/operations/${original.operationId}?tenantId=${tenantId}`,
      original.operationId, tenantId
    );
    expect(h.axwiseClient.submit).toHaveBeenCalledTimes(2);
    expect({ messages: h.repository.messages, events: h.repository.events }).toEqual(before);
  });

  it.each(['user', 'tenant'])('checks %s ownership before reading operation metrics', async (changed) => {
    const h = harness();
    await h.service.send(auth, threadId, { turnId, issuedAt, message: 'Explain retries.' });
    const originalLoad = h.repository.loadAssistantThread;
    h.repository.loadAssistantThread = vi.fn(async (tenant, thread, user) =>
      tenant === tenantId && user === auth.userId ? originalLoad(tenant, thread, user) : null);
    if (changed === 'tenant') h.repository.resolveTenant.mockResolvedValue(secondTurnId);
    await expect(h.service.readTurnMetrics(
      changed === 'user' ? { userId: 'user_somebodyelse' } : auth, threadId, turnId
    )).rejects.toMatchObject({ code: 'ASSISTANT_THREAD_NOT_FOUND', status: 404 });
    expect(h.axwiseClient.poll).not.toHaveBeenCalled();
  });

  it.each([
    ['operationId', secondTurnId, 'AXWISE_OPERATION_ID_MISMATCH'],
    ['canonicalInputHash', 'b'.repeat(64), 'AXWISE_INPUT_HASH_MISMATCH'],
  ])('rejects changed %s when reading operation metrics', async (key, value, errorClass) => {
    const h = harness();
    await h.service.send(auth, threadId, { turnId, issuedAt, message: 'Explain retries.' });
    const original = h.axwiseClient.submit.mock.calls[0][0];
    h.axwiseClient.poll.mockResolvedValue({
      ...forEnvelope(completed('Answer.', {}, { latencyMs: 10, inputTokens: 9,
        outputTokens: 2, totalTokens: 11 }), original), [key]: value,
    });
    await expect(h.service.readTurnMetrics(auth, threadId, turnId)).rejects.toMatchObject({ errorClass });
    expect(h.axwiseClient.submit).toHaveBeenCalledOnce();
  });

  it('does not look up a changed persisted operation identity or invent missing metrics', async () => {
    const h = harness();
    await h.service.send(auth, threadId, { turnId, issuedAt, message: 'Explain retries.' });
    await expect(h.service.readTurnMetrics(auth, threadId, turnId)).resolves.toBeNull();
    h.axwiseClient.poll.mockClear();
    h.repository.messages.find((message) => message.role === 'user').axwiseOperationId = secondTurnId;
    await expect(h.service.readTurnMetrics(auth, threadId, turnId))
      .rejects.toMatchObject({ code: 'ASSISTANT_RETRY_LINEAGE_INVALID' });
    expect(h.axwiseClient.poll).not.toHaveBeenCalled();
  });

  it('does not query completion metrics for a failed assistant turn', async () => {
    const h = harness({ submitResult: failed() });
    await h.service.send(auth, threadId, { turnId, issuedAt, message: 'Explain retries.' });
    await expect(h.service.readTurnMetrics(auth, threadId, turnId)).resolves.toBeNull();
    expect(h.axwiseClient.poll).not.toHaveBeenCalled();
  });

  it('persists the user turn before direct AxWise dispatch', async () => {
    const h = harness();
    h.axwiseClient.submit.mockImplementation(async (envelope) => {
      expect(h.repository.messages[0]).toMatchObject({ role: 'user', route: 'DIRECT_ANSWER' });
      expect(envelope.operationType).toBe('AssistantTurnV1');
      expect(envelope.owner).toMatchObject({
        tenantId,
        userId: auth.userId,
        organizationId: null,
      });
      return forEnvelope(completed(), envelope);
    });
    const result = await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'What is the EU AI Act?',
    });
    expect(h.repository.resolveTenant).toHaveBeenCalledWith({ userId: auth.userId });
    expect(result.persisted).toBe(true);
    expect(result.message.parts.map((part) => part.type)).toEqual(['text', 'fact', 'source']);
    expect(h.repository.events.map((event) => event.type)).toEqual([
      'routed',
      'submitted',
      'completed',
    ]);
  });

  it('renders bounded work as an inline artifact', async () => {
    const h = harness();
    const result = await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Research the EU AI Act.',
    });
    expect(result.route).toBe('AXWISE_ONE_SHOT');
    expect(result.message.parts[0]).toMatchObject({
      type: 'artifact',
      contentType: 'text/markdown',
    });
  });

  it('rejects source-free completed Research as a retryable evidence gap', async () => {
    const h = harness({
      submitResult: completed(
        'An answer without verifiable evidence.',
        { sources: [], facts: [] },
        { latencyMs: 42, searchCalls: 0 }
      ),
    });

    const result = await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      intent: 'research',
      message: 'Research the current EU AI Act guidance.',
    });

    expect(result).toMatchObject({ route: 'AXWISE_ONE_SHOT', persisted: true });
    expect(result.message.parts).toEqual([
      {
        type: 'operation_status',
        operationId: expect.any(String),
        status: 'failed',
        retryMode: 'new_attempt',
        errorClass: 'AXWISE_UNGROUNDED_RESEARCH_RESULT',
      },
    ]);
    expect(h.repository.messages).toHaveLength(2);
    expect(h.repository.messages[1].parts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'artifact' })])
    );
    expect(h.repository.events.map((event) => event.type)).toEqual([
      'routed',
      'submitted',
      'failed',
    ]);
  });

  it('rejects Research whose facts do not cite a returned structured source', async () => {
    const h = harness({
      submitResult: completed('An answer with disconnected evidence.', {
        facts: [
          {
            statement: 'This citation is not represented in the structured source list.',
            sourceUrls: ['https://example.com/unmatched'],
          },
        ],
      }),
    });

    const result = await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      intent: 'research',
      message: 'Research the current EU AI Act guidance.',
    });

    expect(result.message.parts[0]).toMatchObject({
      type: 'operation_status',
      status: 'failed',
      retryMode: 'new_attempt',
      errorClass: 'AXWISE_UNGROUNDED_RESEARCH_RESULT',
    });
    expect(h.repository.events.at(-1).type).toBe('failed');
  });

  it('allows source-free conversational answers outside Research mode', async () => {
    const h = harness({
      submitResult: completed('A conversational answer.', { sources: [], facts: [] }),
    });

    const result = await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      intent: 'assistant',
      message: 'Help me refine this idea.',
    });

    expect(result.message.parts).toEqual([{ type: 'text', markdown: 'A conversational answer.' }]);
    expect(h.repository.events.map((event) => event.type)).toEqual([
      'routed',
      'submitted',
      'completed',
    ]);
  });

  it('uses typed intent without changing the persisted user text', async () => {
    const assistant = harness();
    const assistantResult = await assistant.service.send(auth, threadId, {
      turnId,
      issuedAt,
      intent: 'assistant',
      message: 'Research the EU AI Act.',
    });
    expect(assistantResult.route).toBe('DIRECT_ANSWER');
    expect(assistant.repository.messages[0]).toMatchObject({
      requestedIntent: 'assistant',
      resolvedRoute: 'DIRECT_ANSWER',
      routePolicyVersion: 'orqaly.assistant-route-policy.v2',
      routeReasonCode: 'assistant_direct',
    });
    expect(assistant.axwiseClient.submit.mock.calls[0][0].input).toMatchObject({
      responseMode: 'direct_answer',
      message: 'Research the EU AI Act.',
    });

    const research = harness();
    const researchResult = await research.service.send(auth, threadId, {
      turnId,
      issuedAt,
      intent: 'research',
      message: 'What is photosynthesis?',
    });
    expect(researchResult.route).toBe('AXWISE_ONE_SHOT');
    expect(research.repository.messages[0]).toMatchObject({
      requestedIntent: 'research',
      resolvedRoute: 'AXWISE_ONE_SHOT',
      routeReasonCode: 'requested_research',
    });
    expect(researchResult.message.parts[0]).toMatchObject({
      type: 'artifact',
      title: 'Research result',
    });

    const goal = harness();
    const goalResult = await goal.service.send(auth, threadId, {
      turnId,
      issuedAt,
      intent: 'goal',
      agentLifetime: 'persistent',
      message: 'Prepare the launch in three stages.',
    });
    expect(goalResult.route).toBe('START_GOAL');
    expect(goal.repository.messages[0]).toMatchObject({
      requestedIntent: 'goal',
      resolvedRoute: 'START_GOAL',
      routeReasonCode: 'requested_goal',
    });
    expect(goal.repository.messages[0].parts).toEqual([
      { type: 'text', markdown: 'Prepare the launch in three stages.' },
      { type: 'delegation_request', lifetime: 'persistent' },
    ]);
    expect(goalResult.message.parts[1]).toMatchObject({
      type: 'delegated_agent',
      id: expect.any(String),
      runId,
      threadId,
      task: 'Prepare the launch in three stages.',
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
    });
    expect(goal.workflowCommandService.startFromAssistant).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({ request: 'Prepare the launch in three stages.' }),
      expect.objectContaining({
        request: 'Prepare the launch in three stages.',
        assistantContext: expect.objectContaining({ type: 'AssistantContextEnvelopeV1' }),
      })
    );
  });

  it('reuses and activates the selected control-plane Agent without creating a replacement', async () => {
    const profile = {
      version: 'orqaly_agent_profile_input_v1',
      displayName: 'Mara Ops',
      roleLabel: 'Operations lead',
      description: 'Owns customer operations.',
      instructions: 'Stop before external effects.',
      avatar: { kind: 'icon', value: 'bolt', color: '#3559E0' },
    };
    const proposedAgent = {
      id: agentId,
      agent_kind: 'persistent',
      state: 'proposed',
      version: 7,
      profile: {
        version: 'orqaly_agent_profile_v1',
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        agentId,
        versionNumber: 2,
        contentHash: canonicalHash(profile),
        profile,
      },
    };
    const activeAgent = { ...proposedAgent, state: 'active', version: 8 };
    const agentService = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ body: { agent: proposedAgent } })
        .mockResolvedValueOnce({ body: { agent: activeAgent } }),
      create: vi.fn(),
      createFromAssignment: vi.fn(),
      lifecycle: vi.fn().mockResolvedValue({ body: { agent: activeAgent } }),
    };
    const h = harness({ agentService });

    const result = await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      intent: 'goal',
      agentId,
      agentLifetime: 'persistent',
      message: 'Prepare customer onboarding operations.',
    });

    expect(h.repository.messages[0].parts).toEqual([
      { type: 'text', markdown: 'Prepare customer onboarding operations.' },
      { type: 'delegation_request', lifetime: 'persistent', agentId },
    ]);
    expect(agentService.read).toHaveBeenCalledTimes(2);
    expect(agentService.read).toHaveBeenNthCalledWith(1, auth, agentId);
    expect(agentService.read).toHaveBeenNthCalledWith(2, auth, agentId);
    expect(agentService.create).not.toHaveBeenCalled();
    expect(agentService.createFromAssignment).not.toHaveBeenCalled();
    expect(agentService.lifecycle).toHaveBeenCalledOnce();
    expect(agentService.lifecycle).toHaveBeenCalledWith(auth, agentId, '7', {
      version: 'orqaly_agent_lifecycle_request_v1',
      action: 'activate',
      reason: 'Assigned work from the Orqaly Assistant',
      idempotencyKey: `assistant-agent-activate-${turnId}`,
    });
    expect(h.workflowCommandService.startFromAssistant).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({ request: 'Prepare customer onboarding operations.' }),
      expect.objectContaining({
        executionAgent: expect.objectContaining({
          id: agentId,
          lifetime: 'persistent',
          owner: { tenantId, userId: auth.userId },
          source: expect.objectContaining({ threadId, turnId }),
          profileSnapshot: {
            version: 'orqaly_execution_agent_profile_snapshot_v1',
            profileVersion: expect.objectContaining({ agentId, versionNumber: 2 }),
            profile,
          },
        }),
      })
    );
    expect(result.message.parts[1]).toMatchObject({
      type: 'delegated_agent',
      id: agentId,
      name: 'Mara Ops',
      lifetime: 'persistent',
      executionAgent: { id: agentId },
    });
  });

  it('refuses to start a selected first-class Agent without an exact profile snapshot', async () => {
    const activeAgentWithoutProfile = {
      id: agentId,
      agent_kind: 'persistent',
      state: 'active',
      version: 8,
      profile: null,
    };
    const agentService = {
      read: vi.fn().mockResolvedValue({ body: { agent: activeAgentWithoutProfile } }),
      createFromAssignment: vi.fn(),
      lifecycle: vi.fn(),
    };
    const h = harness({ agentService });

    await expect(
      h.service.send(auth, threadId, {
        turnId,
        issuedAt,
        intent: 'goal',
        agentId,
        agentLifetime: 'persistent',
        message: 'Prepare customer onboarding operations.',
      })
    ).rejects.toMatchObject({ code: 'AGENT_PROFILE_BINDING_MISSING', status: 502 });

    expect(agentService.read).toHaveBeenCalledTimes(2);
    expect(h.workflowCommandService.startFromAssistant).not.toHaveBeenCalled();
  });

  it('creates a first-class Agent with server-owned Goal provenance before starting its work', async () => {
    const profile = {
      version: 'orqaly_agent_profile_input_v1',
      displayName: 'Prepare customer onboarding operations. Agent',
      roleLabel: 'Task executor',
      description: 'Works on: Prepare customer onboarding operations.',
      instructions: 'Prepare customer onboarding operations.',
      avatar: { kind: 'icon', value: 'smart_toy', color: '#6750A4' },
    };
    const profileVersion = {
      version: 'orqaly_agent_profile_v1',
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      agentId,
      versionNumber: 1,
      contentHash: canonicalHash(profile),
      profile,
    };
    const draftAgent = {
      id: agentId,
      agent_kind: 'persistent',
      state: 'draft',
      version: 1,
      profile: profileVersion,
    };
    const proposedAgent = { ...draftAgent, state: 'proposed', version: 2 };
    const activeAgent = { ...draftAgent, state: 'active', version: 3 };
    const agentService = {
      read: vi.fn().mockResolvedValue({ body: { agent: activeAgent } }),
      create: vi.fn(),
      createFromAssignment: vi.fn().mockResolvedValue({ body: { agent: draftAgent } }),
      lifecycle: vi
        .fn()
        .mockResolvedValueOnce({ body: { agent: proposedAgent } })
        .mockResolvedValueOnce({ body: { agent: activeAgent } }),
    };
    const h = harness({ agentService });

    await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      intent: 'goal',
      agentLifetime: 'persistent',
      message: 'Prepare customer onboarding operations.',
    });

    expect(agentService.create).not.toHaveBeenCalled();
    expect(agentService.createFromAssignment).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({
        agentKind: 'persistent',
        profile,
        idempotencyKey: `assistant-agent-${turnId}`,
      }),
      {
        kind: 'assistant_goal',
        sourceTaskId: turnId,
        conversationId: threadId,
        workflowRunId: runId,
      }
    );
    expect(agentService.lifecycle).toHaveBeenNthCalledWith(1, auth, agentId, '1', {
      version: 'orqaly_agent_lifecycle_request_v1',
      action: 'propose',
      reason: 'Assigned work from the Orqaly Assistant',
      idempotencyKey: `assistant-agent-propose-${turnId}`,
    });
    expect(agentService.lifecycle).toHaveBeenNthCalledWith(2, auth, agentId, '2', {
      version: 'orqaly_agent_lifecycle_request_v1',
      action: 'activate',
      reason: 'Assigned work from the Orqaly Assistant',
      idempotencyKey: `assistant-agent-activate-${turnId}`,
    });
    expect(agentService.read).toHaveBeenCalledWith(auth, agentId);
    expect(h.workflowCommandService.startFromAssistant).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({ request: 'Prepare customer onboarding operations.' }),
      expect.objectContaining({
        executionAgent: expect.objectContaining({
          id: agentId,
          runId,
          profileSnapshot: expect.objectContaining({ profile }),
        }),
      })
    );
  });

  it('refuses to start a newly created first-class Agent when its profile is not retained', async () => {
    const draftAgent = {
      id: agentId,
      agent_kind: 'persistent',
      state: 'draft',
      version: 1,
      profile: null,
    };
    const proposedAgent = { ...draftAgent, state: 'proposed', version: 2 };
    const activeAgent = { ...draftAgent, state: 'active', version: 3 };
    const agentService = {
      read: vi.fn().mockResolvedValue({ body: { agent: activeAgent } }),
      createFromAssignment: vi.fn().mockResolvedValue({ body: { agent: draftAgent } }),
      lifecycle: vi
        .fn()
        .mockResolvedValueOnce({ body: { agent: proposedAgent } })
        .mockResolvedValueOnce({ body: { agent: activeAgent } }),
    };
    const h = harness({ agentService });

    await expect(
      h.service.send(auth, threadId, {
        turnId,
        issuedAt,
        intent: 'goal',
        agentLifetime: 'persistent',
        message: 'Prepare customer onboarding operations.',
      })
    ).rejects.toMatchObject({ code: 'AGENT_PROFILE_BINDING_MISSING', status: 502 });

    expect(agentService.createFromAssignment).toHaveBeenCalledOnce();
    expect(agentService.lifecycle).toHaveBeenCalledTimes(2);
    expect(h.workflowCommandService.startFromAssistant).not.toHaveBeenCalled();
  });

  it('revalidates the current Agent state and refuses assignment after a concurrent pause', async () => {
    const profile = {
      version: 'orqaly_agent_profile_input_v1',
      displayName: 'Mara Ops',
      roleLabel: 'Operations lead',
      description: 'Owns customer operations.',
      instructions: 'Stop before external effects.',
      avatar: { kind: 'icon', value: 'bolt', color: '#3559E0' },
    };
    const activeAgent = {
      id: agentId,
      agent_kind: 'persistent',
      state: 'active',
      version: 8,
      profile: {
        version: 'orqaly_agent_profile_v1',
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        agentId,
        versionNumber: 2,
        contentHash: canonicalHash(profile),
        profile,
      },
    };
    const agentService = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ body: { agent: activeAgent } })
        .mockResolvedValueOnce({
          body: { agent: { ...activeAgent, state: 'paused', version: 9 } },
        }),
      createFromAssignment: vi.fn(),
      lifecycle: vi.fn(),
    };
    const h = harness({ agentService });

    await expect(
      h.service.send(auth, threadId, {
        turnId,
        issuedAt,
        intent: 'goal',
        agentId,
        agentLifetime: 'persistent',
        message: 'Prepare customer onboarding operations.',
      })
    ).rejects.toMatchObject({ code: 'AGENT_NOT_ASSIGNABLE', status: 409 });

    expect(agentService.read).toHaveBeenCalledTimes(2);
    expect(h.workflowCommandService.startFromAssistant).not.toHaveBeenCalled();
  });

  it('persists the Auto routing decision for real-world verification language', async () => {
    const h = harness();
    const result = await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'can you check how it will really work',
      intent: 'auto',
    });

    expect(result.route).toBe('AXWISE_ONE_SHOT');
    expect(h.repository.messages[0]).toMatchObject({
      requestedIntent: 'auto',
      resolvedRoute: 'AXWISE_ONE_SHOT',
      routePolicyVersion: 'orqaly.assistant-route-policy.v2',
      routeReasonCode: 'verification_requested',
    });
  });

  it('persists model identifiers only when AxWise reports their actual values', async () => {
    const h = harness({
      submitResult: completed(
        'A grounded answer.',
        {},
        {
          latencyMs: 42,
          provider: 'google',
          model: 'models/gemini-3.8-flash',
          modelVersion: 'gemini-3.8-flash',
        }
      ),
    });

    const result = await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'What is photosynthesis?',
    });

    expect(result.message).toMatchObject({
      model: 'models/gemini-3.8-flash',
      modelVersion: 'gemini-3.8-flash',
    });
    expect(h.repository.messages[0]).not.toHaveProperty('model');
    expect(h.repository.messages[1]).toMatchObject({
      model: 'models/gemini-3.8-flash',
      modelVersion: 'gemini-3.8-flash',
    });
  });

  it('replays a legacy turn whose immutable hash predates route provenance', async () => {
    const h = harness();
    const command = { turnId, issuedAt, message: 'What is photosynthesis?' };
    await h.service.send(auth, threadId, command);
    const legacyUser = h.repository.messages.find((message) => message.role === 'user');
    delete legacyUser.requestedIntent;
    delete legacyUser.resolvedRoute;
    delete legacyUser.routePolicyVersion;
    delete legacyUser.routeReasonCode;

    await expect(h.service.send(auth, threadId, command)).resolves.toMatchObject({
      persisted: true,
      idempotent: true,
    });
    expect(h.axwiseClient.submit).toHaveBeenCalledOnce();
  });

  it('routes a plan follow-up as direct conversation using the completed prior turn', async () => {
    const h = harness();
    await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Draft a launch plan.',
    });

    const result = await h.service.send(auth, threadId, {
      turnId: secondTurnId,
      issuedAt: '2026-08-31T18:01:00.000Z',
      message: 'perfect, can you tell me more about that plan',
    });

    expect(result.route).toBe('DIRECT_ANSWER');
    expect(h.axwiseClient.submit.mock.calls[1][0].input).toMatchObject({
      responseMode: 'direct_answer',
      conversation: [
        { role: 'user', content: 'Draft a launch plan.' },
        { role: 'assistant', content: 'A grounded answer.' },
      ],
    });
  });

  it('starts a vague Goal with bounded server-owned context from the completed conversation', async () => {
    const h = harness();
    await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      intent: 'assistant',
      message: 'Research the EU AI Act launch obligations.',
    });

    await h.service.send(auth, threadId, {
      turnId: secondTurnId,
      issuedAt: '2026-08-31T18:01:00.000Z',
      intent: 'goal',
      message: 'Create a good plan from that.',
    });

    const [startAuth, command, trusted] = h.workflowCommandService.startFromAssistant.mock.calls[0];
    expect(startAuth).toEqual(auth);
    expect(command.request).toBe('Create a good plan from that.');
    expect(trusted.request).toBe(
      'Create a good plan from that.\n\n' +
        'OWNER_PRIOR\nResearch the EU AI Act launch obligations.\n\n' +
        'ASSISTANT_REFERENCE\nA grounded answer.'
    );
    expect(trusted.assistantContext).toMatchObject({
      type: 'AssistantContextEnvelopeV1',
      instruction: { content: 'Create a good plan from that.', authority: 'owner_current' },
      turns: [
        {
          route: 'DIRECT_ANSWER',
          user: { authority: 'owner_prior', provenance: 'persisted_owner_message' },
          assistant: {
            authority: 'assistant_reference',
            provenance: 'axwise_operation_output',
          },
        },
      ],
    });
    expect(JSON.stringify(trusted)).not.toContain('commission.europa.eu');
  });

  it('persists AxWise facts and recommendations as typed message parts', async () => {
    const h = harness({
      submitResult: completed('A grounded answer.', {
        facts: [
          {
            statement: 'The source supports the answer.',
            sourceUrls: ['https://commission.europa.eu/strategy-and-policy_en'],
          },
        ],
        recommendations: [
          { kind: 'continue_conversation', summary: 'Ask about implementation details.' },
        ],
      }),
    });

    const result = await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Explain the source.',
    });

    expect(result.message.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'fact', statement: 'The source supports the answer.' }),
        expect.objectContaining({
          type: 'recommendation',
          kind: 'continue_conversation',
          summary: 'Ask about implementation details.',
        }),
      ])
    );
  });

  it('keeps accepted operations resumable without mutating a message', async () => {
    const h = harness({
      submitResult: {
        operationId: '66666666-6666-4666-8666-666666666666',
        status: 'accepted',
        canonicalInputHash: 'a'.repeat(64),
        statusUrl: 'https://axwise.example/status',
        retryAfterSeconds: 2,
      },
    });
    const pending = await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Explain photosynthesis.',
    });
    expect(pending.persisted).toBe(false);
    expect(h.repository.messages).toHaveLength(1);
    const finished = await h.service.resume(auth, threadId, turnId);
    expect(finished.persisted).toBe(true);
    expect(finished.message.parts[0]).toMatchObject({ markdown: 'Finished after polling.' });
    expect(h.repository.messages).toHaveLength(2);
    expect(h.repository.events.map((event) => event.type)).toEqual([
      'routed',
      'submitted',
      'running',
      'completed',
    ]);
  });

  it('cancels a pending operation idempotently and persists the terminal projection', async () => {
    const h = harness({
      submitResult: {
        operationId: '66666666-6666-4666-8666-666666666666',
        status: 'accepted',
        canonicalInputHash: 'a'.repeat(64),
        statusUrl: 'https://axwise.example/status',
        retryAfterSeconds: 2,
      },
    });
    await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Research the EU AI Act.',
    });

    const cancelled = await h.service.cancel(auth, threadId, turnId);
    const replayed = await h.service.cancel(auth, threadId, turnId);

    expect(cancelled).toMatchObject({ persisted: true, idempotent: false });
    expect(cancelled.message.parts[0]).toMatchObject({
      type: 'operation_status',
      status: 'cancelled',
    });
    expect(replayed).toMatchObject({ persisted: true, idempotent: true });
    expect(h.axwiseClient.cancel).toHaveBeenCalledOnce();
    expect(h.axwiseClient.cancel).toHaveBeenCalledWith(expect.any(String), tenantId);
    expect(h.repository.events.map((event) => event.type)).toEqual([
      'routed',
      'submitted',
      'running',
      'cancel_requested',
      'cancelled',
    ]);
  });

  it('mirrors upstream progress events without making them the polling engine', async () => {
    const h = harness({
      submitResult: {
        operationId: '66666666-6666-4666-8666-666666666666',
        status: 'accepted',
        canonicalInputHash: 'a'.repeat(64),
        statusUrl: 'https://axwise.example/status',
        retryAfterSeconds: 2,
      },
    });
    await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Explain photosynthesis.',
    });
    h.axwiseClient.events = vi.fn(async (operationId) => ({
      operationId,
      after: 0,
      nextAfter: 2,
      hasMore: false,
      events: [
        {
          operationId,
          sequence: 1,
          eventType: 'accepted',
          status: 'accepted',
          occurredAt: '2026-08-31T18:00:00.123456Z',
        },
        {
          operationId,
          sequence: 2,
          eventType: 'heartbeat',
          status: 'running',
          occurredAt: '2026-08-31T18:00:01.987654Z',
        },
      ],
    }));

    await h.service.resume(auth, threadId, turnId);

    expect(h.axwiseClient.events).toHaveBeenCalledOnce();
    expect(h.axwiseClient.poll).toHaveBeenCalledOnce();
    expect(h.repository.events.filter((event) => event.type === 'progress')).toHaveLength(2);
    expect(
      h.repository.events
        .filter((event) => event.type === 'progress')
        .map((event) => event.occurredAt)
    ).toEqual(['2026-08-31T18:00:00.123Z', '2026-08-31T18:00:01.987Z']);
  });

  it('recovers immutable progress rows hashed before provider timestamps were normalized', async () => {
    const h = harness({
      submitResult: {
        operationId: '66666666-6666-4666-8666-666666666666',
        status: 'accepted',
        canonicalInputHash: 'a'.repeat(64),
        statusUrl: 'https://axwise.example/status',
        retryAfterSeconds: 2,
      },
    });
    await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Explain photosynthesis.',
    });
    h.axwiseClient.events = vi.fn(async (operationId) => ({
      operationId,
      after: 0,
      nextAfter: 1,
      hasMore: false,
      events: [
        {
          operationId,
          sequence: 1,
          eventType: 'accepted',
          status: 'accepted',
          occurredAt: '2026-08-31T18:00:00.123456Z',
        },
      ],
    }));
    const append = h.repository.appendAssistantTurnEvent.bind(h.repository);
    h.repository.appendAssistantTurnEvent = vi.fn(async (...args) => {
      const event = args[2];
      if (event.type !== 'progress') return append(...args);
      const { contentHash: _contentHash, ...eventInput } = event;
      const legacyEvent = {
        ...eventInput,
        occurredAt: '2026-08-31T18:00:00.123456Z',
      };
      return append(args[0], args[1], {
        ...event,
        contentHash: canonicalHash(legacyEvent),
      });
    });

    await expect(h.service.resume(auth, threadId, turnId)).resolves.toMatchObject({
      persisted: true,
    });
    expect(h.repository.events.find((event) => event.type === 'progress')).toMatchObject({
      occurredAt: '2026-08-31T18:00:00.123Z',
    });
  });

  it('never redispatches a cancelled turn when recovery observes a poll 404', async () => {
    const h = harness({
      submitResult: {
        operationId: '66666666-6666-4666-8666-666666666666',
        status: 'accepted',
        canonicalInputHash: 'a'.repeat(64),
        statusUrl: 'https://axwise.example/status',
        retryAfterSeconds: 2,
      },
    });
    await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Research the EU AI Act.',
    });
    await h.repository.appendAssistantTurnEvent(tenantId, auth.userId, {
      id: '99999999-9999-4999-8999-999999999990',
      threadId,
      turnId,
      type: 'cancel_requested',
      route: 'AXWISE_ONE_SHOT',
      operationId: h.repository.messages[0].axwiseOperationId,
      retryOfTurnId: null,
      taskId: null,
      attemptId: null,
      payload: {},
      occurredAt: issuedAt,
      contentHash: 'b'.repeat(64),
    });
    h.axwiseClient.cancel.mockRejectedValue(
      new AxWiseDispatchError('not found', {
        retryable: true,
        errorClass: 'AXWISE_OPERATION_NOT_FOUND',
        status: 404,
        disposition: 'not_found',
      })
    );

    const recovered = await h.service.resume(auth, threadId, turnId);

    expect(recovered.message.parts[0]).toMatchObject({ status: 'cancelled' });
    expect(h.axwiseClient.poll).not.toHaveBeenCalled();
    expect(h.axwiseClient.submit).toHaveBeenCalledOnce();
  });

  it('persists a retryable terminal failure and never resumes its operation again', async () => {
    const h = harness({ submitResult: failed() });
    const result = await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Explain photosynthesis.',
    });
    expect(result).toMatchObject({ persisted: true, idempotent: false });
    expect(result.message.parts[0]).toMatchObject({
      type: 'operation_status',
      status: 'failed',
      retryMode: 'new_attempt',
      errorClass: 'AXWISE_HTTP_500',
    });
    expect(result.message.parts[0]).not.toHaveProperty('retryable');
    expect(h.repository.messages).toHaveLength(2);

    const resumed = await h.service.resume(auth, threadId, turnId);
    expect(resumed).toMatchObject({ persisted: true, idempotent: true });
    expect(h.axwiseClient.poll).not.toHaveBeenCalled();
    expect(h.repository.messages).toHaveLength(2);
  });

  it('preserves an optional provider retry time on the immutable failure', async () => {
    const retryAt = '2026-09-01T10:10:00.000Z';
    const diagnostics = {
      route: 'grounded_search',
      status: 'rate_limited',
      retryAfterSeconds: 450,
      fallbackAttempted: true,
      fallbackUsed: false,
    };
    const h = harness({
      submitResult: failed({ retryAt, retryAfterSeconds: 450, diagnostics }),
    });

    const result = await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Explain photosynthesis.',
    });

    expect(result.message.parts[0]).toMatchObject({
      status: 'failed',
      retryMode: 'new_attempt',
      retryAt,
      retryAfterSeconds: 450,
      diagnostics,
    });
  });

  it('rejects a new attempt before the provider retry time', async () => {
    const retryAt = new Date(Date.now() + 60_000).toISOString();
    const h = harness({ submitResult: failed({ retryAt }) });
    await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Explain photosynthesis.',
    });

    await expect(
      h.service.retry(auth, threadId, turnId, {
        turnId: secondTurnId,
        issuedAt: '2026-08-31T18:01:00.000Z',
      })
    ).rejects.toMatchObject({ code: 'ASSISTANT_RETRY_NOT_READY', status: 409 });
    expect(h.axwiseClient.submit).toHaveBeenCalledTimes(1);
  });

  it('persists an explicit terminal AxWise HTTP failure instead of returning request failed', async () => {
    const h = harness();
    h.axwiseClient.submit.mockRejectedValue(
      new AxWiseDispatchError('explicit 500', {
        retryable: true,
        errorClass: 'AXWISE_HTTP_500',
        status: 500,
      })
    );
    const result = await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Explain photosynthesis.',
    });
    expect(result.persisted).toBe(true);
    expect(result.message.parts[0]).toMatchObject({
      status: 'failed',
      retryMode: 'new_attempt',
      errorClass: 'AXWISE_HTTP_500',
    });
  });

  it('recovers an ambiguous dispatch by polling the same operation', async () => {
    const h = harness();
    let envelope;
    h.axwiseClient.submit.mockImplementation(async (value) => {
      envelope = value;
      throw new AxWiseDispatchError('network ambiguity', {
        retryable: true,
        errorClass: 'AXWISE_NETWORK',
        disposition: 'ambiguous',
      });
    });
    h.axwiseClient.poll.mockImplementation(async () =>
      forEnvelope(completed('Recovered result.'), envelope)
    );
    const pending = await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Explain photosynthesis.',
    });
    expect(pending.persisted).toBe(false);
    expect(pending.message.parts[0]).toMatchObject({
      status: 'running',
      operationId: envelope.operationId,
    });
    const finished = await h.service.resume(auth, threadId, turnId);
    expect(finished.message.parts[0]).toMatchObject({ markdown: 'Recovered result.' });
    expect(h.axwiseClient.poll.mock.calls[0][1]).toBe(envelope.operationId);
  });

  it('redispatches the exact same envelope when polling reports operation not found', async () => {
    const h = harness();
    let submissions = 0;
    h.axwiseClient.submit.mockImplementation(async (envelope) => {
      submissions += 1;
      return forEnvelope(
        submissions === 1
          ? {
              operationId: envelope.operationId,
              status: 'accepted',
              canonicalInputHash: envelope.canonicalInputHash,
              statusUrl: 'https://axwise.example/status',
              retryAfterSeconds: 2,
            }
          : completed('Recovered by redispatch.'),
        envelope
      );
    });
    h.axwiseClient.poll.mockRejectedValue(
      new AxWiseDispatchError('not found', {
        retryable: true,
        errorClass: 'AXWISE_OPERATION_NOT_FOUND',
        status: 404,
        disposition: 'not_found',
      })
    );
    await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Explain photosynthesis.',
    });
    const recovered = await h.service.resume(auth, threadId, turnId);
    expect(recovered.message.parts[0]).toMatchObject({ markdown: 'Recovered by redispatch.' });
    expect(h.axwiseClient.submit).toHaveBeenCalledTimes(2);
    expect(h.axwiseClient.submit.mock.calls[1][0]).toEqual(h.axwiseClient.submit.mock.calls[0][0]);
  });

  it('fails closed when AxWise changes the operation identity', async () => {
    const h = harness();
    h.axwiseClient.submit.mockImplementation(async (envelope) => ({
      ...forEnvelope(completed(), envelope),
      operationId: '99999999-9999-4999-8999-999999999999',
    }));
    const result = await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Explain photosynthesis.',
    });
    expect(result.message.parts[0]).toMatchObject({
      status: 'failed',
      retryMode: 'none',
      errorClass: 'AXWISE_OPERATION_ID_MISMATCH',
    });
  });

  it('creates one explicit retry with a new operation and the exact root input', async () => {
    const h = harness();
    let dispatch = 0;
    h.axwiseClient.submit.mockImplementation(async (envelope) => {
      dispatch += 1;
      return forEnvelope(dispatch === 1 ? failed() : completed('Retry succeeded.'), envelope);
    });
    const first = await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      intent: 'research',
      message: 'Explain photosynthesis.',
    });
    const immutableFailure = first.message;
    const retried = await h.service.retry(auth, threadId, turnId, {
      turnId: secondTurnId,
      issuedAt: '2026-08-31T18:01:00.000Z',
    });
    expect(retried.message.parts[0]).toMatchObject({ markdown: 'Retry succeeded.' });
    const [firstEnvelope, retryEnvelope] = h.axwiseClient.submit.mock.calls.map(([value]) => value);
    expect(retryEnvelope.operationId).not.toBe(firstEnvelope.operationId);
    expect(retryEnvelope.canonicalInputHash).toBe(firstEnvelope.canonicalInputHash);
    expect(retryEnvelope.input).toEqual(firstEnvelope.input);
    expect(retryEnvelope.workflow.runId).toBe(firstEnvelope.workflow.runId);
    expect(retryEnvelope.workflow.stageId).toBe(firstEnvelope.workflow.stageId);
    expect(retryEnvelope.workflow.stageAttemptId).not.toBe(firstEnvelope.workflow.stageAttemptId);
    expect(
      h.repository.messages.find(
        (message) => message.turnId === secondTurnId && message.role === 'user'
      )
    ).toMatchObject({
      retryOfTurnId: turnId,
      route: 'AXWISE_ONE_SHOT',
      requestedIntent: 'research',
      resolvedRoute: 'AXWISE_ONE_SHOT',
      routePolicyVersion: 'orqaly.assistant-route-policy.v2',
      routeReasonCode: 'requested_research',
    });
    expect(firstEnvelope.input.responseMode).toBe('one_shot');
    expect(retryEnvelope.input.responseMode).toBe('one_shot');
    expect(
      h.repository.messages.find(
        (message) => message.turnId === turnId && message.role === 'assistant'
      )
    ).toEqual(immutableFailure);
    expect(
      h.repository.events
        .filter((event) => event.turnId === secondTurnId)
        .map((event) => event.type)
    ).toEqual(['retry_created', 'routed', 'submitted', 'completed']);

    const replayed = await h.service.retry(auth, threadId, turnId, {
      turnId: secondTurnId,
      issuedAt: '2026-08-31T18:01:00.000Z',
    });
    expect(replayed.idempotent).toBe(true);
    expect(h.axwiseClient.submit).toHaveBeenCalledTimes(2);
    await expect(
      h.service.retry(auth, threadId, turnId, {
        turnId: thirdTurnId,
        issuedAt: '2026-08-31T18:02:00.000Z',
      })
    ).rejects.toMatchObject({ code: 'ASSISTANT_RETRY_ALREADY_EXISTS' });
  });

  it('rejects explicit retry for a nonretryable terminal failure', async () => {
    const h = harness({
      submitResult: failed({ retryable: false, errorClass: 'AXWISE_BAD_INPUT' }),
    });
    await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Explain photosynthesis.',
    });
    await expect(
      h.service.retry(auth, threadId, turnId, {
        turnId: secondTurnId,
        issuedAt: '2026-08-31T18:01:00.000Z',
      })
    ).rejects.toMatchObject({ code: 'ASSISTANT_TURN_NOT_RETRYABLE' });
  });

  it('rejects a retry while another persisted turn is unanswered', async () => {
    const h = harness({ submitResult: failed() });
    await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Explain photosynthesis.',
    });
    h.repository.messages.push({
      id: '99999999-9999-4999-8999-999999999991',
      threadId,
      turnId: thirdTurnId,
      role: 'user',
      route: 'PROPOSE_GOAL',
      parts: [{ type: 'text', markdown: 'Monitor competitors every week.' }],
      axwiseOperationId: null,
      workflowRunId: null,
      retryOfTurnId: null,
      createdAt: '2026-08-31T18:01:00.000Z',
    });

    await expect(
      h.service.retry(auth, threadId, turnId, {
        turnId: secondTurnId,
        issuedAt: '2026-08-31T18:02:00.000Z',
      })
    ).rejects.toMatchObject({ code: 'ASSISTANT_TURN_PENDING', status: 409 });
    expect(h.axwiseClient.submit).toHaveBeenCalledTimes(1);
  });

  it('proposes a Goal but does not create one without approval', async () => {
    const h = harness();
    const result = await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Monitor competitors every week.',
    });
    expect(result.route).toBe('PROPOSE_GOAL');
    expect(result.message.parts.at(-1)).toMatchObject({ type: 'approval', action: 'start_goal' });
    expect(h.workflowCommandService.startFromAssistant).not.toHaveBeenCalled();
    expect(h.axwiseClient.submit).not.toHaveBeenCalled();
  });

  it('resumes a persisted Goal proposal after crashing before the assistant reply', async () => {
    const h = harness();
    const append = h.repository.appendAssistantMessage.bind(h.repository);
    h.repository.appendAssistantMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('crashed before assistant persistence'))
      .mockImplementation(append);

    await expect(
      h.service.send(auth, threadId, {
        turnId,
        issuedAt,
        message: 'Monitor competitors every week.',
      })
    ).rejects.toThrow('crashed before assistant persistence');

    const recovered = await h.service.resume(auth, threadId, turnId);
    const replayed = await h.service.resume(auth, threadId, turnId);

    expect(recovered.message.parts.at(-1)).toMatchObject({
      type: 'approval',
      action: 'start_goal',
      request: 'Monitor competitors every week.',
    });
    expect(replayed).toMatchObject({ persisted: true, idempotent: true });
    expect(h.repository.messages).toHaveLength(2);
  });

  it('starts one durable Goal for an idempotent turn', async () => {
    const h = harness();
    const command = { turnId, issuedAt, message: 'Start a goal: plan the launch.' };
    const first = await h.service.send(auth, threadId, command);
    const second = await h.service.send(auth, threadId, command);
    expect(first.message.parts.at(-1)).toMatchObject({ type: 'goal_link', runId });
    expect(first.message.parts[1]).toMatchObject({
      type: 'delegated_agent',
      lifetime: 'temporary',
      runId,
    });
    expect(second.idempotent).toBe(true);
    expect(h.workflowCommandService.startFromAssistant).toHaveBeenCalledTimes(1);
    expect(h.workflowCommandService.startFromAssistant).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({ request: 'plan the launch.' }),
      expect.objectContaining({
        assistantContext: expect.objectContaining({
          instruction: expect.objectContaining({ content: 'plan the launch.' }),
        }),
      })
    );
  });

  it('resumes a persisted Goal start after crashing before the assistant reply', async () => {
    const h = harness();
    const append = h.repository.appendAssistantMessage.bind(h.repository);
    h.repository.appendAssistantMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('crashed before assistant persistence'))
      .mockImplementation(append);
    const command = { turnId, issuedAt, message: 'Start a goal: plan the launch.' };

    await expect(h.service.send(auth, threadId, command)).rejects.toThrow(
      'crashed before assistant persistence'
    );
    expect(h.repository.messages).toHaveLength(1);

    const recovered = await h.service.resume(auth, threadId, turnId);

    expect(recovered.message.parts.at(-1)).toMatchObject({ type: 'goal_link', runId });
    expect(h.workflowCommandService.startFromAssistant).toHaveBeenCalledTimes(2);
    expect(h.workflowCommandService.startFromAssistant.mock.calls[1]).toEqual(
      h.workflowCommandService.startFromAssistant.mock.calls[0]
    );
    expect(h.repository.messages).toHaveLength(2);
    await expect(h.service.resume(auth, threadId, turnId)).resolves.toMatchObject({
      persisted: true,
      idempotent: true,
    });
  });

  it('continues the linked Goal without creating another run', async () => {
    const h = harness();
    await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Start a goal to plan the launch.',
    });
    const result = await h.service.send(auth, threadId, {
      turnId: secondTurnId,
      issuedAt: '2026-08-31T18:01:00.000Z',
      message: 'Continue the goal.',
    });
    expect(result.route).toBe('CONTINUE_GOAL');
    expect(h.workflowCommandService.startFromAssistant).toHaveBeenCalledTimes(1);
    expect(h.workflowCommandService.read).toHaveBeenCalledWith(auth, runId);
  });

  it('resumes the exact persisted Goal target after a continue crash', async () => {
    const h = harness();
    await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Start a goal to plan the launch.',
    });
    const append = h.repository.appendAssistantMessage.bind(h.repository);
    h.repository.appendAssistantMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('crashed before assistant persistence'))
      .mockImplementation(append);

    await expect(
      h.service.send(auth, threadId, {
        turnId: secondTurnId,
        issuedAt: '2026-08-31T18:01:00.000Z',
        message: 'Continue the goal.',
      })
    ).rejects.toThrow('crashed before assistant persistence');
    const persisted = h.repository.messages.find(
      (message) => message.turnId === secondTurnId && message.role === 'user'
    );
    expect(persisted).toMatchObject({ route: 'CONTINUE_GOAL', workflowRunId: runId });
    h.repository.findLatestAssistantGoalRunId = vi.fn(async () => thirdTurnId);

    const recovered = await h.service.resume(auth, threadId, secondTurnId);
    const replayed = await h.service.resume(auth, threadId, secondTurnId);

    expect(recovered.message.parts.at(-1)).toMatchObject({ type: 'goal_link', runId });
    expect(h.workflowCommandService.read).toHaveBeenLastCalledWith(auth, runId);
    expect(h.repository.findLatestAssistantGoalRunId).not.toHaveBeenCalled();
    expect(replayed).toMatchObject({ persisted: true, idempotent: true });
  });

  it('fails closed for persisted routes missing their immutable recovery identity', async () => {
    const h = harness({
      submitResult: {
        operationId: '66666666-6666-4666-8666-666666666666',
        status: 'accepted',
        canonicalInputHash: 'a'.repeat(64),
        statusUrl: 'https://axwise.example/status',
        retryAfterSeconds: 2,
      },
    });
    await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Explain photosynthesis.',
    });
    h.repository.messages[0].axwiseOperationId = null;
    await expect(h.service.resume(auth, threadId, turnId)).rejects.toMatchObject({
      code: 'ASSISTANT_TURN_NOT_RESUMABLE',
      status: 409,
    });

    h.repository.messages[0].route = 'CONTINUE_GOAL';
    await expect(h.service.resume(auth, threadId, turnId)).rejects.toMatchObject({
      code: 'ASSISTANT_GOAL_NOT_FOUND',
      status: 409,
    });
  });

  it('rejects reuse of a turn ID with changed input', async () => {
    const h = harness();
    await h.service.send(auth, threadId, { turnId, issuedAt, message: 'What is 2+2?' });
    await expect(
      h.service.send(auth, threadId, { turnId, issuedAt, message: 'What is 3+3?' })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('rejects reuse of a turn ID with a changed typed intent', async () => {
    const h = harness();
    const command = {
      turnId,
      issuedAt,
      intent: 'assistant',
      message: 'Research the EU AI Act.',
    };
    await h.service.send(auth, threadId, command);
    await expect(
      h.service.send(auth, threadId, { ...command, intent: 'research' })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(h.axwiseClient.submit).toHaveBeenCalledTimes(1);
  });

  it('adopts the persisted route when surrounding Goal state changes', async () => {
    const h = harness({
      submitResult: {
        operationId: '66666666-6666-4666-8666-666666666666',
        status: 'accepted',
        canonicalInputHash: 'a'.repeat(64),
        statusUrl: 'https://axwise.example/status',
        retryAfterSeconds: 2,
      },
    });
    const command = { turnId, issuedAt, message: 'Continue the goal.' };
    expect((await h.service.send(auth, threadId, command)).route).toBe('DISCOVER');
    h.repository.messages.push({
      id: '77777777-7777-4777-8777-777777777777',
      threadId,
      turnId: secondTurnId,
      role: 'assistant',
      route: 'START_GOAL',
      parts: [{ type: 'goal_link', runId, label: 'Existing Goal', status: 'running' }],
      axwiseOperationId: null,
      workflowRunId: runId,
      createdAt: '2026-08-31T18:01:00.000Z',
    });
    const retried = await h.service.send(auth, threadId, command);
    expect(retried.route).toBe('DISCOVER');
    expect(h.workflowCommandService.read).not.toHaveBeenCalled();
    expect(h.axwiseClient.submit).toHaveBeenCalledTimes(2);
    expect(h.axwiseClient.submit.mock.calls[1][0].canonicalInputHash).toBe(
      h.axwiseClient.submit.mock.calls[0][0].canonicalInputHash
    );
  });

  it('lists and reads only through the authenticated tenant identity', async () => {
    const h = harness();
    await h.service.send(auth, threadId, { turnId, issuedAt, message: 'Hello there.' });
    expect((await h.service.list(auth)).threads).toHaveLength(1);
    expect((await h.service.read(auth, threadId)).messages).toHaveLength(2);
  });

  it('lists persisted delegated Agents through the authenticated tenant identity', async () => {
    const h = harness();
    await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      intent: 'goal',
      agentLifetime: 'persistent',
      message: 'Prepare a launch brief.',
    });

    await expect(h.service.agents(auth)).resolves.toMatchObject({
      agents: [
        {
          runId,
          threadId,
          lifetime: 'persistent',
          status: 'requested',
          task: 'Prepare a launch brief.',
        },
      ],
    });
    expect(h.repository.resolveTenant).toHaveBeenLastCalledWith({ userId: auth.userId });
  });

  it('rejects replaying an Agent turn with a different lifetime', async () => {
    const h = harness();
    const command = {
      turnId,
      issuedAt,
      intent: 'goal',
      agentLifetime: 'temporary',
      message: 'Prepare a launch brief.',
    };
    await h.service.send(auth, threadId, command);

    await expect(
      h.service.send(auth, threadId, { ...command, agentLifetime: 'persistent' })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', status: 409 });
    expect(h.workflowCommandService.startFromAssistant).toHaveBeenCalledTimes(1);
  });

  it('normalizes an omitted replay lifetime to temporary before idempotency comparison', async () => {
    const h = harness();
    const persistent = {
      turnId,
      issuedAt,
      intent: 'goal',
      agentLifetime: 'persistent',
      message: 'Prepare a launch brief.',
    };
    await h.service.send(auth, threadId, persistent);

    await expect(
      h.service.send(auth, threadId, { ...persistent, agentLifetime: undefined })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', status: 409 });
    expect(h.workflowCommandService.startFromAssistant).toHaveBeenCalledTimes(1);
  });

  it('reads lifecycle events after a validated cursor', async () => {
    const h = harness();
    await h.service.send(auth, threadId, {
      turnId,
      issuedAt,
      message: 'Hello there.',
    });

    await expect(h.service.events(auth, threadId, 1, 100)).resolves.toMatchObject({
      cursor: 3,
      events: [
        { sequence: 2, type: 'submitted' },
        { sequence: 3, type: 'completed' },
      ],
    });
    await expect(h.service.events(auth, threadId, -1, 100)).rejects.toMatchObject({
      code: 'INVALID_ASSISTANT_EVENT_CURSOR',
      status: 400,
    });
  });

  it('restores each persisted turn in user then assistant order', async () => {
    const h = harness();
    await h.service.send(auth, threadId, { turnId, issuedAt, message: 'Hello there.' });
    await h.service.send(auth, threadId, {
      turnId: secondTurnId,
      issuedAt: '2026-08-31T18:00:00.001Z',
      message: 'Hello again.',
    });
    h.repository.messages.reverse();

    const reloaded = await h.service.read(auth, threadId);

    expect(reloaded.messages.map((message) => [message.turnId, message.role])).toEqual([
      [turnId, 'user'],
      [turnId, 'assistant'],
      [secondTurnId, 'user'],
      [secondTurnId, 'assistant'],
    ]);
    expect(h.repository.messages.map((message) => message.role)).toEqual([
      'assistant',
      'user',
      'assistant',
      'user',
    ]);
  });

  it('rejects a new equal-timestamp turn even when its random UUID would sort first', async () => {
    const h = harness();
    const lexicallyLaterTurn = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const lexicallyEarlierTurn = '11111111-1111-4111-8111-111111111111';
    await h.service.send(auth, threadId, {
      turnId: lexicallyLaterTurn,
      issuedAt,
      message: 'First arrival.',
    });

    await expect(
      h.service.send(auth, threadId, {
        turnId: lexicallyEarlierTurn,
        issuedAt,
        message: 'Second arrival.',
      })
    ).rejects.toMatchObject({ code: 'ASSISTANT_TURN_TIMESTAMP_CONFLICT', status: 409 });
  });
});
