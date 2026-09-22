import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../lib/workflow-v2/canonical.js';
import {
  ASSISTANT_ROUTE_POLICY_VERSION,
  AssistantMessageSchema,
  AssistantRetryCommandSchema,
  AssistantTurnCommandSchema,
  parsePersistedAssistantMessage,
  routeAssistantTurn,
} from './assistant.js';

describe('assistant deterministic route policy', () => {
  const cases = [
    ['What is photosynthesis?', {}, 'DIRECT_ANSWER'],
    ['Explain this error in plain English.', {}, 'DIRECT_ANSWER'],
    ['How many minutes are in two hours?', {}, 'DIRECT_ANSWER'],
    ['Give me three names for a bakery.', {}, 'DIRECT_ANSWER'],
    ['Help me', {}, 'DISCOVER'],
    ['I need help.', {}, 'DISCOVER'],
    ['Do it', {}, 'DISCOVER'],
    ['A goal', {}, 'DISCOVER'],
    ['Research the EU AI Act and summarize the main duties.', {}, 'AXWISE_ONE_SHOT'],
    ['Compare Linear and Jira for a ten-person team.', {}, 'AXWISE_ONE_SHOT'],
    ['Draft a one-page PRD for passwordless login.', {}, 'AXWISE_ONE_SHOT'],
    ['Investigate why this API latency chart spikes at noon.', {}, 'AXWISE_ONE_SHOT'],
    ['Monitor our competitors every week.', {}, 'PROPOSE_GOAL'],
    ['Work in the background until the launch is complete.', {}, 'PROPOSE_GOAL'],
    ['Use multiple agents and ask for approval after each stage.', {}, 'PROPOSE_GOAL'],
    ['Research vendors over the next month and keep checking prices.', {}, 'PROPOSE_GOAL'],
    ['Start a goal to prepare our product launch.', {}, 'START_GOAL'],
    ['Create this project for me.', {}, 'START_GOAL'],
    ['Turn this into a workflow.', {}, 'START_GOAL'],
    ["Goal — let's do it.", {}, 'START_GOAL'],
    [
      'Continue the goal.',
      { activeGoalRunId: '11111111-1111-4111-8111-111111111111' },
      'CONTINUE_GOAL',
    ],
    [
      'Resume where we left off.',
      { activeGoalRunId: '11111111-1111-4111-8111-111111111111' },
      'CONTINUE_GOAL',
    ],
    ['Keep going.', { activeGoalRunId: '11111111-1111-4111-8111-111111111111' }, 'CONTINUE_GOAL'],
    [
      'Continue explaining the answer.',
      { activeGoalRunId: '11111111-1111-4111-8111-111111111111' },
      'DIRECT_ANSWER',
    ],
  ];

  it.each(cases)('%s -> %s', (message, context, expected) => {
    expect(routeAssistantTurn(message, context)).toBe(expected);
  });
});

describe('assistant typed composer intent', () => {
  it.each([
    ['assistant', 'Research current EU AI Act duties.', {}, 'DIRECT_ANSWER'],
    ['research', 'What is photosynthesis?', {}, 'AXWISE_ONE_SHOT'],
    ['goal', 'Prepare the launch.', {}, 'START_GOAL'],
    [
      'assistant',
      'Continue the goal.',
      { activeGoalRunId: '11111111-1111-4111-8111-111111111111' },
      'CONTINUE_GOAL',
    ],
    ['assistant', 'Start a goal for the launch.', {}, 'START_GOAL'],
    ['assistant', 'Help me', {}, 'DISCOVER'],
  ])('%s intent routes %s safely', (intent, message, context, expected) => {
    expect(routeAssistantTurn(message, { ...context, intent })).toBe(expected);
  });

  it('keeps auto behavior identical to the legacy omitted intent', () => {
    const message = 'Research the EU AI Act.';
    expect(routeAssistantTurn(message, { intent: 'auto' })).toBe(routeAssistantTurn(message));
  });

  it('accepts an Agent lifetime only on the existing goal wire intent', () => {
    const command = {
      turnId: '11111111-1111-4111-8111-111111111111',
      issuedAt: '2026-09-01T10:00:00.000Z',
      message: 'Prepare the launch.',
      intent: 'goal',
      agentLifetime: 'persistent',
    };
    expect(AssistantTurnCommandSchema.parse(command).agentLifetime).toBe('persistent');
    expect(() => AssistantTurnCommandSchema.parse({ ...command, intent: 'assistant' })).toThrow(
      /only when intent is goal/
    );
    expect(() =>
      AssistantTurnCommandSchema.parse({ ...command, intent: 'goal', agentLifetime: 'forever' })
    ).toThrow();
  });
});

describe('assistant retry contracts', () => {
  it('accepts a strict retry command without browser-provided message content', () => {
    expect(
      AssistantRetryCommandSchema.parse({
        turnId: '11111111-1111-4111-8111-111111111111',
        issuedAt: '2026-09-01T10:00:00.000Z',
      })
    ).toBeTruthy();
    expect(() =>
      AssistantRetryCommandSchema.parse({
        turnId: '11111111-1111-4111-8111-111111111111',
        issuedAt: '2026-09-01T10:00:00.000Z',
        message: 'replace the immutable input',
      })
    ).toThrow();
  });

  it('defaults retry lineage for old messages and preserves new-attempt failure metadata', () => {
    const message = AssistantMessageSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      threadId: '22222222-2222-4222-8222-222222222222',
      turnId: '33333333-3333-4333-8333-333333333333',
      role: 'assistant',
      route: 'DIRECT_ANSWER',
      parts: [
        {
          type: 'operation_status',
          operationId: '44444444-4444-4444-8444-444444444444',
          status: 'failed',
          retryMode: 'new_attempt',
          errorClass: 'AXWISE_HTTP_500',
          retryAt: '2026-09-01T10:10:00.000Z',
        },
      ],
      axwiseOperationId: '44444444-4444-4444-8444-444444444444',
      workflowRunId: null,
      createdAt: '2026-09-01T10:00:00.000Z',
    });
    expect(message.retryOfTurnId).toBeNull();
    expect(message.parts[0]).toMatchObject({
      retryMode: 'new_attempt',
      retryAt: '2026-09-01T10:10:00.000Z',
    });
  });

  it('accepts structured facts and recommendations as durable message parts', () => {
    const message = AssistantMessageSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      threadId: '22222222-2222-4222-8222-222222222222',
      turnId: '33333333-3333-4333-8333-333333333333',
      role: 'assistant',
      route: 'DIRECT_ANSWER',
      parts: [
        {
          type: 'fact',
          statement: 'This claim is grounded.',
          sourceUrls: ['https://example.com/source'],
        },
        {
          type: 'recommendation',
          kind: 'continue_conversation',
          summary: 'Ask a follow-up question.',
        },
      ],
      axwiseOperationId: '44444444-4444-4444-8444-444444444444',
      workflowRunId: null,
      createdAt: '2026-09-01T10:00:00.000Z',
    });

    expect(message.parts.map((part) => part.type)).toEqual(['fact', 'recommendation']);
  });

  it('accepts complete user route provenance while leaving legacy messages unchanged', () => {
    const base = {
      id: '11111111-1111-4111-8111-111111111111',
      threadId: '22222222-2222-4222-8222-222222222222',
      turnId: '33333333-3333-4333-8333-333333333333',
      role: 'user',
      route: 'AXWISE_ONE_SHOT',
      parts: [{ type: 'text', markdown: 'Verify the current behavior.' }],
      axwiseOperationId: '44444444-4444-4444-8444-444444444444',
      workflowRunId: null,
      retryOfTurnId: null,
      createdAt: '2026-09-01T10:00:00.000Z',
    };
    const legacy = AssistantMessageSchema.parse(base);
    expect(legacy).not.toHaveProperty('requestedIntent');

    expect(
      AssistantMessageSchema.parse({
        ...base,
        requestedIntent: 'auto',
        resolvedRoute: 'AXWISE_ONE_SHOT',
        routePolicyVersion: 'orqaly.assistant-route-policy.v1',
        routeReasonCode: 'verification_requested',
      })
    ).toMatchObject({ routePolicyVersion: 'orqaly.assistant-route-policy.v1' });

    expect(
      AssistantMessageSchema.parse({
        ...base,
        requestedIntent: 'auto',
        resolvedRoute: 'AXWISE_ONE_SHOT',
        routePolicyVersion: ASSISTANT_ROUTE_POLICY_VERSION,
        routeReasonCode: 'verification_requested',
      })
    ).toMatchObject({
      requestedIntent: 'auto',
      resolvedRoute: 'AXWISE_ONE_SHOT',
      routeReasonCode: 'verification_requested',
    });
  });

  it('rejects partial or inconsistent route provenance', () => {
    const base = {
      id: '11111111-1111-4111-8111-111111111111',
      threadId: '22222222-2222-4222-8222-222222222222',
      turnId: '33333333-3333-4333-8333-333333333333',
      role: 'user',
      route: 'DIRECT_ANSWER',
      parts: [{ type: 'text', markdown: 'Hello' }],
      axwiseOperationId: null,
      workflowRunId: null,
      retryOfTurnId: null,
      createdAt: '2026-09-01T10:00:00.000Z',
    };
    expect(() => AssistantMessageSchema.parse({ ...base, requestedIntent: 'auto' })).toThrow();
    expect(() =>
      AssistantMessageSchema.parse({
        ...base,
        requestedIntent: 'auto',
        resolvedRoute: 'AXWISE_ONE_SHOT',
        routePolicyVersion: ASSISTANT_ROUTE_POLICY_VERSION,
        routeReasonCode: 'bounded_research',
      })
    ).toThrow();
  });

  it('accepts reported model provenance only on assistant messages', () => {
    const base = {
      id: '11111111-1111-4111-8111-111111111111',
      threadId: '22222222-2222-4222-8222-222222222222',
      turnId: '33333333-3333-4333-8333-333333333333',
      role: 'assistant',
      route: 'DIRECT_ANSWER',
      parts: [{ type: 'text', markdown: 'Hello' }],
      axwiseOperationId: '44444444-4444-4444-8444-444444444444',
      workflowRunId: null,
      retryOfTurnId: null,
      createdAt: '2026-09-01T10:00:00.000Z',
    };
    expect(
      AssistantMessageSchema.parse({
        ...base,
        model: 'models/gemini-3.8-flash',
        modelVersion: 'gemini-3.8-flash',
      })
    ).toMatchObject({
      model: 'models/gemini-3.8-flash',
      modelVersion: 'gemini-3.8-flash',
    });
    expect(() =>
      AssistantMessageSchema.parse({ ...base, role: 'user', model: 'gemini-3.8-flash' })
    ).toThrow();
  });

  it('validates an Agent part against its real thread and Goal run', () => {
    const threadId = '22222222-2222-4222-8222-222222222222';
    const runId = '55555555-5555-4555-8555-555555555555';
    const task = 'Prepare the launch.';
    const executionAgent = {
      schemaVersion: 'orqaly.execution-agent.v1',
      id: '44444444-4444-4444-8444-444444444444',
      runId,
      owner: {
        tenantId: '77777777-7777-4777-8777-777777777777',
        userId: 'user_agentcontract123',
      },
      lifetime: 'temporary',
      source: {
        threadId,
        turnId: '33333333-3333-4333-8333-333333333333',
        taskHash: sha256Hex(task),
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
    const base = {
      id: '11111111-1111-4111-8111-111111111111',
      threadId,
      turnId: '33333333-3333-4333-8333-333333333333',
      role: 'assistant',
      route: 'START_GOAL',
      parts: [
        {
          type: 'delegated_agent',
          id: executionAgent.id,
          runId,
          threadId,
          name: 'Launch Agent',
          task,
          lifetime: 'temporary',
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
          createdAt: '2026-09-01T10:00:00.000Z',
          updatedAt: '2026-09-01T10:00:00.000Z',
        },
      ],
      axwiseOperationId: null,
      workflowRunId: runId,
      retryOfTurnId: null,
      createdAt: '2026-09-01T10:00:00.000Z',
    };

    expect(AssistantMessageSchema.parse(base).parts[0]).toMatchObject({
      type: 'delegated_agent',
      runId,
      lifetime: 'temporary',
      capabilities: { externalActions: false },
      toolExecution: { status: 'not_configured', provider: null },
    });
    expect(() =>
      AssistantMessageSchema.parse({
        ...base,
        workflowRunId: '66666666-6666-4666-8666-666666666666',
      })
    ).toThrow(/must match/);

    const legacy = structuredClone(base);
    delete legacy.parts[0].executionAgent;
    legacy.parts[0].executorPersona.status = 'formed_during_goal';

    expect(() => AssistantMessageSchema.parse(legacy)).toThrow();
    expect(parsePersistedAssistantMessage(legacy).parts[0]).toMatchObject({
      type: 'delegated_agent',
      executorPersona: { status: 'legacy_unverified' },
    });
    expect(parsePersistedAssistantMessage(legacy).parts[0]).not.toHaveProperty(
      'executionAgent'
    );

    const masquerading = structuredClone(legacy);
    masquerading.parts[0].executorPersona.status = 'contract_bound';
    expect(() => parsePersistedAssistantMessage(masquerading)).toThrow();
  });
});

describe('assistant capability and presentation parts', () => {
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    threadId: '22222222-2222-4222-8222-222222222222',
    turnId: '33333333-3333-4333-8333-333333333333',
    route: 'DIRECT_ANSWER',
    axwiseOperationId: '44444444-4444-4444-8444-444444444444',
    workflowRunId: null,
    createdAt: '2026-09-01T10:00:00.000Z',
  };

  it('accepts an explicit capability command and persists it only on the user turn', () => {
    const capability = { kind: 'weather', location: 'Berlin', tempUnit: 'C' };
    expect(AssistantTurnCommandSchema.parse({
      turnId: base.turnId,
      issuedAt: base.createdAt,
      message: 'Show the weather.',
      capability,
    }).capability).toEqual(capability);
    const user = AssistantMessageSchema.parse({
      ...base,
      role: 'user',
      parts: [
        { type: 'text', markdown: 'Show the weather.' },
        { type: 'capability_request', capability },
      ],
    });
    expect(user.parts[1]).toEqual({ type: 'capability_request', capability });
    expect(() => AssistantMessageSchema.parse({ ...user, role: 'assistant' })).toThrow(
      /capability request/
    );
  });

  it('accepts validated rich presentations only on assistant turns', () => {
    const presentation = {
      schemaVersion: 'axwise.presentation.weather.v1',
      kind: 'weather',
      location: 'Berlin',
      observedAt: '2026-09-01T10:00:00Z',
      temperatureUnit: 'C',
      temperature: '18.5',
      condition: 'Partly cloudy',
      high: '21',
      low: '12',
      forecast: [{ label: 'Tomorrow', condition: 'Sunny', high: '23', low: '13' }],
      source: { title: 'Weather service', url: 'https://example.com/weather' },
    };
    const assistant = AssistantMessageSchema.parse({
      ...base,
      role: 'assistant',
      parts: [{ type: 'presentation', presentation }],
    });
    expect(assistant.parts[0].presentation).toEqual(presentation);
    expect(() => AssistantMessageSchema.parse({ ...assistant, role: 'user' })).toThrow(
      /presentations/
    );
  });
});

describe('assistant message length boundary', () => {
  const base = {
    turnId: '11111111-1111-4111-8111-111111111111',
    issuedAt: '2026-09-01T10:00:00.000Z',
  };

  it('reserves protocol overhead for approving a full-length proposed Goal', () => {
    expect(() =>
      AssistantTurnCommandSchema.parse({
        ...base,
        message: `Start a goal: ${'x'.repeat(24_000)}`,
      })
    ).not.toThrow();
  });

  it('accepts exactly 24,000 original characters for a typed Goal', () => {
    expect(() =>
      AssistantTurnCommandSchema.parse({
        ...base,
        intent: 'goal',
        message: 'x'.repeat(24_000),
      })
    ).not.toThrow();
  });

  it('does not grant legacy prefix overhead to typed composer commands', () => {
    expect(() =>
      AssistantTurnCommandSchema.parse({
        ...base,
        intent: 'goal',
        message: `Start a goal: ${'x'.repeat(24_000)}`,
      })
    ).toThrow();
  });

  it('keeps ordinary user-authored messages capped at 24,000 characters', () => {
    expect(() =>
      AssistantTurnCommandSchema.parse({ ...base, message: 'x'.repeat(24_001) })
    ).toThrow();
  });

  it('rejects an unknown composer intent', () => {
    expect(() =>
      AssistantTurnCommandSchema.parse({ ...base, intent: 'browse', message: 'Find it.' })
    ).toThrow();
  });
});
