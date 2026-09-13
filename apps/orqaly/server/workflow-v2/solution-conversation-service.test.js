// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import { nativeOrderSpec, nativeOrderWorkflow } from './fixtures/native-order-routing.js';
import { nativeOutboundFixture } from '../../scripts/fixtures/native-outbound-workflow.mjs';
import { describeNativeConnection, bindNativeConnections } from './native-workflow-connections.js';
import { normalizeNativeWorkflow } from './native-workflow-runtime-contract.js';
import { createSolutionConversationStore } from './solution-conversation-store.js';
import { AxWiseDispatchError } from './axwise-client.js';
import { deterministicUuid } from './ids.js';
import { reviewNativeWorkflow, createBoundedHttpPolicy } from './native-workflow-review.js';
import {
  makeSolutionConversationEnvelope,
  completeSolutionConversationModel,
  publicSolutionConversationTurn,
  redactConversationWorkflow,
  redactConversationBundle,
  sameConversationConnections,
  createSolutionConversationService,
  safeConsentedInvocationValue,
  resolveConversationReference,
} from './solution-conversation-service.js';
import {
  parseConversationPlan,
  publicConversationProposals,
} from './solution-conversation-planning.js';
import {
  SolutionConversationTurnSchema,
  solutionConversationEnabledFromEnvironment,
} from '../../shared/workflow-v2/solution-conversation-contracts.js';

export function conversationFixture(mode = 'change') {
  const scope = { tenantId: randomUUID(), userId: 'user_testowner' };
  const id = randomUUID();
  const context = {
    solutionId: randomUUID(),
    name: 'Order routing',
    status: 'active',
    activeRevisionId: null,
    activeVersion: 1,
    selectedDraft: null,
    workflow: nativeOrderWorkflow(),
    spec: nativeOrderSpec(),
    evidence: [
      {
        kind: 'invocation',
        id: randomUUID(),
        workflowHash: 'a'.repeat(64),
        status: 'failed',
        errorCode: 'NODE_FAILED',
      },
    ],
    agent: {
      id: randomUUID(),
      name: 'Order assistant',
      profileVersion: 1,
      roleLabel: 'Workflow designer',
      description: 'Scoped order workflow',
      instructions: 'Work only on this task',
      profileHash: 'b'.repeat(64),
      profileReference: { id: randomUUID() },
    },
    source: {
      runId: randomUUID(),
      taskHash: 'c'.repeat(64),
      title: 'Order routing',
      taskText: 'Route orders using the selected threshold.',
      contextHash: 'd'.repeat(64),
    },
  };
  context.activeWorkflowHash = hash(context.workflow);
  const command = {
    turnId: id,
    mode,
    message:
      mode === 'ask' ? 'Why was this order rejected?' : 'Change the acceptance minimum to 150.',
    expectedSolutionVersion: 2,
    workflowHash: context.activeWorkflowHash,
  };
  const envelope = makeSolutionConversationEnvelope({
    scope,
    turnId: id,
    command,
    context,
    history: [],
  });
  const turn = {
    id,
    mode,
    message: command.message,
    command,
    envelope,
    operation_id: envelope.operationId,
    target_revision_id: randomUUID(),
    context_snapshot: context,
    context_hash: hash(context),
    created_at: new Date().toISOString(),
    dispatch_count: 1,
    status: 'running',
  };
  return { scope, context, command, envelope, turn };
}
function responseFor(turn, overrides = {}) {
  const workflow = nativeOrderWorkflow();
  workflow.nodes.find((n) => n.id === 'route').parameters.conditions.conditions[0].rightValue = 150;
  const spec = nativeOrderSpec();
  spec.requirements[0].description = 'Accept orders of at least 150; reject smaller orders.';
  spec.acceptanceCases[0].input.order.amount = 150;
  return {
    operationId: turn.operation_id,
    canonicalInputHash: turn.envelope.canonicalInputHash,
    status: 'completed',
    result: {
      resultType: 'solution_prepared',
      metrics: {
        latencyMs: 50,
        provider: 'google',
        model: 'fixture-only',
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      },
      response: {
        schemaVersion: 'axwise.solution-preparation.v2',
        buildRequestId: turn.id,
        inputVersion: 1,
        outcome: 'candidate',
        name: 'Order routing',
        purpose: 'Route orders',
        explanation: 'Prepared the proposed threshold change for review; it has not run.',
        workflow,
        spec,
        questions: [],
        dependencies: [],
        baseWorkflowHash: turn.envelope.input.draft.workflowHash,
        semanticReview: { advisory: true, summary: 'Threshold matches request', concerns: [] },
        ...overrides,
      },
    },
  };
}

function ownedHandlerFixture() {
  const workflow = nativeOrderWorkflow();
  const spec = nativeOrderSpec();
  const child = nativeOutboundFixture();
  child.workflow.nodes = child.workflow.nodes.slice(0, 2);
  Object.assign(child.workflow.nodes[0], {
    type: 'n8n-nodes-base.errorTrigger',
    typeVersion: 1,
    parameters: {},
  });
  delete child.workflow.connections['Deliver event'];
  workflow.settings = { ...workflow.settings, errorWorkflow: 'orqaly:error:alerts' };
  spec.ownedDependencies = [{ id: 'alerts', kind: 'error_handler', ...child }];
  return { workflow, spec };
}
describe('scoped durable workflow conversation model boundary', () => {
  function routerResponse(turn, plan) {
    return {
      operationId: turn.operation_id,
      canonicalInputHash: turn.envelope.canonicalInputHash,
      status: 'completed',
      result: {
        resultType: 'assistant_turn_completed',
        response: {
          schemaVersion: 'axwise.assistant-turn.v1',
          markdown: JSON.stringify(plan),
        },
      },
    };
  }
  const routeChange = {
    intent: 'change',
    reply: 'Preparing an unapproved draft.',
    request: 'Raise the minimum order amount to 150.',
    questions: [],
    proposals: [],
  };
  const option = {
    id: 'option_2',
    title: 'Raise minimum',
    request: 'Raise the minimum order amount to 150, preserving all other behavior.',
    requirements: {
      nodeTypes: ['n8n-nodes-base.if'],
      newConnection: false,
      separateWorkflow: false,
    },
  };

  it('resolves natural-language auto intent through the existing model then addresses a separate durable design operation', () => {
    const { turn } = conversationFixture('auto');
    expect(turn.envelope.operationType).toBe('AssistantTurnV1');
    expect(turn.envelope.input.message).toContain('Return ONLY valid JSON');
    const routed = completeSolutionConversationModel(turn, routerResponse(turn, routeChange));
    expect(routed.transition).toBe(true);
    expect(routed.lifecycle).toMatchObject({ resolvedMode: 'change', phase: 'designing' });
    expect(routed.lifecycle.envelope.operationId).not.toBe(turn.operation_id);
    expect(routed.lifecycle.envelope.workflow.stageAttemptId).not.toBe(
      turn.envelope.workflow.stageAttemptId
    );
    expect(turn.envelope.workflow.stageAttemptId).toBe(
      deterministicUuid(turn.id, 'solution-conversation-attempt')
    );
    expect(routed.lifecycle.envelope.workflow.stageAttemptId).toBe(
      deterministicUuid(turn.id, 'solution-conversation-attempt-design')
    );
    expect(routed.lifecycle.envelope.workflow.stageId).toBe(turn.envelope.workflow.stageId);
    expect(routed.lifecycle.envelope.workflow.runId).toBe(turn.envelope.workflow.runId);
    expect(completeSolutionConversationModel(turn, routerResponse(turn, routeChange))).toEqual(
      routed
    );
    expect(routed.lifecycle.envelope.operationType).toBe('PrepareSolutionV2');
    expect(routed.lifecycle.envelope.input.instruction).toContain(routeChange.request);
    expect(routed.lifecycle.envelope.input.draft.workflow).toEqual(turn.context_snapshot.workflow);
    expect(routed).not.toHaveProperty('candidate');
    expect(routed.lifecycle.envelope.input).not.toHaveProperty('tools');
  });

  it('asks about an existing draft only after auto resolves change, while simple questions remain read-only', () => {
    const { turn } = conversationFixture('auto');
    turn.context_snapshot.availableDraft = {
      id: randomUUID(),
      rowVersion: 3,
      workflowHash: 'a'.repeat(64),
    };
    const ask = completeSolutionConversationModel(
      turn,
      routerResponse(turn, { ...routeChange, intent: 'answer', request: null, proposals: [option] })
    );
    expect(ask.status).toBe('completed');
    expect(ask.reply.proposals[0]).toMatchObject({
      ...option,
      capability: 'supported',
      contentHash: hash(option),
    });
    expect(ask.reply).not.toHaveProperty('draftSelectionRequired');
    const change = completeSolutionConversationModel(turn, routerResponse(turn, routeChange));
    expect(change).toMatchObject({
      status: 'blocked',
      errorCode: 'DRAFT_SELECTION_REQUIRED',
      reply: {
        phase: 'needs_input',
        draftSelectionRequired: true,
        availableDraft: turn.context_snapshot.availableDraft,
      },
    });
    expect(change).not.toHaveProperty('candidate');
    expect(change.lifecycle.request).toBe(routeChange.request);
  });

  it.each([
    'This is an answer, not structured JSON.',
    JSON.stringify({ ...routeChange, intent: 'execute' }),
    JSON.stringify({ ...routeChange, tools: ['publish_workflow'] }),
    JSON.stringify({
      ...routeChange,
      intent: 'clarify',
      questions: [{ id: 'key', prompt: 'Please paste your API key here.' }],
    }),
    JSON.stringify({ ...routeChange, proposals: [option, option] }),
  ])(
    'fails closed on malformed, authority-expanding or secret-collecting router output',
    (value) => {
      expect(() => parseConversationPlan(value)).toThrow();
    }
  );

  it('does not advertise child workflows, unknown nodes or new connections as ready to execute', () => {
    expect(
      publicConversationProposals([
        { ...option, requirements: { ...option.requirements, separateWorkflow: true } },
      ])[0].capability
    ).toBe('requires_runtime');
    expect(
      publicConversationProposals([
        {
          ...option,
          requirements: { ...option.requirements, nodeTypes: ['n8n-nodes-base.errorTrigger'] },
        },
      ])[0].capability
    ).toBe('requires_runtime');
    expect(
      publicConversationProposals([
        { ...option, requirements: { ...option.requirements, newConnection: true } },
      ])[0].capability
    ).toBe('requires_setup');
  });

  it('keeps an entire bounded legacy option after character 2000 rather than silently clipping its meaning', () => {
    const f = conversationFixture();
    const response = `${'Explanation '.repeat(220)}\nOption 2: use the exact threshold 150.`;
    const envelope = makeSolutionConversationEnvelope({
      scope: f.scope,
      turnId: f.turn.id,
      command: f.command,
      context: f.context,
      history: [
        {
          command: f.command,
          mode: 'ask',
          message: 'Suggest options',
          reply: { markdown: response },
          status: 'completed',
        },
      ],
    });
    expect(envelope.input.instruction).toContain('Option 2: use the exact threshold 150.');
  });

  it('binds complete saved proposal content across live-to-draft selection and rejects tampering, old releases and stale retries', () => {
    const f = conversationFixture('auto');
    const proposed = publicConversationProposals([option])[0];
    const previous = { ...f.turn, status: 'completed', reply: { proposals: [proposed] } };
    const command = {
      ...f.command,
      proposalRef: {
        turnId: previous.id,
        proposalId: option.id,
        proposalHash: proposed.contentHash,
      },
      draft: { id: randomUUID(), rowVersion: 4, workflowHash: 'e'.repeat(64) },
    };
    expect(resolveConversationReference(command, previous, f.context)).toMatchObject({
      request: option.request,
      changeRequestId: previous.id,
    });
    expect(() =>
      resolveConversationReference(
        { ...command, proposalRef: { ...command.proposalRef, proposalHash: 'f'.repeat(64) } },
        previous,
        f.context
      )
    ).toThrow();
    expect(() =>
      resolveConversationReference(
        { ...command, workflowHash: 'f'.repeat(64) },
        previous,
        f.context
      )
    ).toThrow();
    const retry = {
      ...command,
      proposalRef: undefined,
      continuation: { turnId: previous.id, kind: 'retry' },
    };
    expect(() => resolveConversationReference(retry, previous, f.context)).toThrow();
    previous.command.includeInvocation = { id: randomUUID(), inputOutput: true };
    expect(() => resolveConversationReference(command, previous, f.context)).toThrow(
      /Include the same run/
    );
  });
  it('uses existing read-only AssistantTurnV1 and only scoped safe evidence, with no tools', () => {
    const { envelope, context } = conversationFixture('ask');
    expect(envelope.operationType).toBe('AssistantTurnV1');
    expect(envelope.input.responseMode).toBe('direct_answer');
    expect(envelope.input).not.toHaveProperty('tools');
    expect(envelope.input.conversation[0].content).toContain(context.evidence[0].id);
    expect(envelope.input.conversation[0].content).toContain(context.source.taskHash);
    expect(envelope.input.conversation[0].content).not.toContain('rawRequest');
    expect(envelope.input.conversation[0].content).toContain(
      'Raw invocation inputs, outputs and provider diagnostics are not included'
    );
    expect(envelope.input.conversation[0].content).toContain('acceptanceCases');
  });
  it.each(['ask', 'auto'])(
    'provides customer controls and hides native transport paths for %s without changing saved graph bytes',
    (mode) => {
      const { scope, turn, command, context } = conversationFixture(mode);
      const webhook = context.workflow.nodes.find((node) => node.type === 'n8n-nodes-base.webhook');
      webhook.parameters.path = 'internal-synthetic-webhook-only-7c8a';
      context.activeWorkflowHash = hash(context.workflow);
      const before = JSON.stringify(context.workflow);
      context.customerControls = {
        kind: 'selected_draft',
        status: 'draft',
        version: 2,
        deployment: 'not_deployed',
        testCoverage: { status: 'missing' },
        nextControl: 'Review changes',
      };
      const message = 'How can I test this?\nKeep my wording exactly.';
      const envelope = makeSolutionConversationEnvelope({
        scope,
        turnId: turn.id,
        command: { ...command, message, workflowHash: context.activeWorkflowHash },
        context,
        history: [],
      });
      expect(envelope.operationType).toBe('AssistantTurnV1');
      expect(envelope.input.message).toContain('Deploy approved version (stages it inactive)');
      expect(envelope.input.message).toContain('Test all agreed cases');
      expect(envelope.input.message).toContain(JSON.stringify(message));
      expect(envelope.input.conversation[0].content).toContain('"status":"draft"');
      expect(envelope.input.conversation[0].content).toContain('"deployment":"not_deployed"');
      expect(envelope.input.conversation[0].content).not.toContain(webhook.parameters.path);
      expect(envelope.input.conversation[0].content).toContain(
        'internal_runtime_managed_by_orqaly_not_a_customer_invocation_url'
      );
      expect(JSON.stringify(context.workflow)).toBe(before);
      if (mode === 'auto') expect(envelope.input.message).toContain('Return ONLY valid JSON');
    }
  );
  it('includes one consented run only when this turn opts in, with an explicit older-version marker', () => {
    const { scope, turn, command, context } = conversationFixture('ask');
    const invocationId = randomUUID();
    context.selectedInvocation = {
      id: invocationId,
      workflowHash: 'e'.repeat(64),
      matchesSelectedWorkflow: false,
      input: { value: { order: 120 } },
      output: { value: { accepted: false } },
      omissionReasons: [],
    };
    const privateReply = 'customer-specific-private-output';
    const history = [
      {
        ...turn,
        command: { ...command, includeInvocation: { id: invocationId, inputOutput: true } },
        reply: { markdown: privateReply },
      },
    ];
    const noConsent = makeSolutionConversationEnvelope({
      scope,
      turnId: randomUUID(),
      command,
      context,
      history,
    });
    expect(JSON.stringify(noConsent.input)).not.toContain(privateReply);
    expect(JSON.stringify(noConsent.input)).not.toContain('matchesSelectedWorkflow');
    const yesConsent = makeSolutionConversationEnvelope({
      scope,
      turnId: randomUUID(),
      command: { ...command, includeInvocation: { id: invocationId, inputOutput: true } },
      context,
      history,
    });
    expect(JSON.stringify(yesConsent.input)).toContain(privateReply);
    expect(yesConsent.input.conversation[0].content).toContain('"matchesSelectedWorkflow":false');
    const otherId = randomUUID();
    const otherConsent = makeSolutionConversationEnvelope({
      scope,
      turnId: randomUUID(),
      command: { ...command, includeInvocation: { id: otherId, inputOutput: true } },
      context: {
        ...context,
        selectedInvocation: { id: otherId, input: { omitted: 'not_recorded' } },
      },
      history,
    });
    expect(JSON.stringify(otherConsent.input)).not.toContain(privateReply);
    expect(() =>
      makeSolutionConversationEnvelope({
        scope,
        turnId: randomUUID(),
        command: { ...command, includeInvocation: { id: otherId, inputOutput: true } },
        context,
        history,
      })
    ).toThrow('selected run');
  });
  it.each([
    { password: 'short' },
    { nested: { Authorization: 'anything' } },
    { token: 'tiny' },
    { safe: 'Bearer abcdefghijklmnop' },
    { nested: [{ apiKey: 'short' }] },
    { session: { cookie: 'abc' } },
  ])('omits credentials regardless of selected-run consent', (value) => {
    expect(safeConsentedInvocationValue(value)).toEqual({
      omitted: 'credential_or_sensitive_content',
    });
  });
  it('bounds payloads and makes missing or omitted evidence truthful', () => {
    expect(safeConsentedInvocationValue({ customer: 'Ada', accepted: false })).toEqual({
      value: { customer: 'Ada', accepted: false },
    });
    expect(safeConsentedInvocationValue('x'.repeat(2001))).toEqual({ omitted: 'size_limit' });
    expect(safeConsentedInvocationValue(null)).toEqual({ omitted: 'not_recorded' });
  });
  it('uses design, not repair, so actual business requirements may change, bound to the exact draft', () => {
    const { envelope, turn } = conversationFixture();
    expect(envelope.input).toMatchObject({
      type: 'PrepareSolutionV2',
      phase: 'design',
      frozenAcceptanceCases: [],
    });
    expect(envelope.input.agent).not.toHaveProperty('profileReference');
    expect(envelope.input.draft.workflowHash).toBe(hash(envelope.input.draft.workflow));
    const result = completeSolutionConversationModel(turn, responseFor(turn));
    expect(result.status).toBe('completed');
    expect(result.candidate.validated).toBe(true);
    expect(result.candidate.spec.acceptanceCases[0].input.order.amount).toBe(150);
    expect(result.candidate.workflow.nodes[0].parameters.path).toBe(
      `solution-${turn.target_revision_id}`
    );
    expect(result.candidate).not.toHaveProperty('testedAt');
    expect(result.candidate).not.toHaveProperty('approved');
  });
  it('excludes main and linked-handler credential references from model context and rejects model-provided child selectors', () => {
    const { scope, context, command, turn } = conversationFixture();
    const fixture = ownedHandlerFixture();
    const child = fixture.spec.ownedDependencies[0].workflow;
    child.nodes[1].credentials = {
      orqalyBoundedHttp: { id: 'owned-child-private-selector', name: 'Private label' },
    };
    const clean = redactConversationBundle(fixture);
    expect(clean.spec.ownedDependencies[0].workflow.nodes[1]).not.toHaveProperty('credentials');
    expect(child.nodes[1]).toHaveProperty('credentials');
    Object.assign(context, fixture);
    const envelope = makeSolutionConversationEnvelope({
      scope,
      turnId: turn.id,
      command,
      context,
      history: [],
    });
    expect(JSON.stringify(envelope)).not.toContain('owned-child-private-selector');
    expect(envelope.input.draft.spec.ownedDependencies[0].workflow.nodes[1]).not.toHaveProperty(
      'credentials'
    );
    turn.envelope = envelope;
    turn.operation_id = envelope.operationId;
    expect(() => completeSolutionConversationModel(turn, responseFor(turn, fixture))).toThrow(
      'conversation_candidate_credential_rejected'
    );
  });
  it('pins child connection requirements and parameters even when the main workflow hash stays unchanged', () => {
    const fixture = ownedHandlerFixture();
    const candidate = structuredClone(fixture);
    expect(
      sameConversationConnections(
        fixture.workflow,
        fixture.spec,
        candidate.workflow,
        candidate.spec
      )
    ).toBe(true);
    candidate.spec.ownedDependencies[0].workflow.nodes[1].parameters.url =
      'https://different.example/alerts';
    expect(hash(fixture.workflow)).toBe(hash(candidate.workflow));
    expect(
      sameConversationConnections(
        fixture.workflow,
        fixture.spec,
        candidate.workflow,
        candidate.spec
      )
    ).toBe(false);
    candidate.spec.ownedDependencies[0].spec.connections = [];
    expect(
      sameConversationConnections(
        fixture.workflow,
        fixture.spec,
        candidate.workflow,
        candidate.spec
      )
    ).toBe(false);
  });
  it.each(['AXWISE_NATIVE_SOLUTION_BUDGET_EXHAUSTED', 'AXWISE_SOLUTION_DESIGN_DEADLINE'])(
    'retains only the safe design stop reason %s',
    (errorClass) => {
      const { turn } = conversationFixture();
      const result = completeSolutionConversationModel(turn, {
        operationId: turn.operation_id,
        canonicalInputHash: turn.envelope.canonicalInputHash,
        status: 'failed',
        errorClass,
      });
      expect(result).toMatchObject({
        status: 'failed',
        errorCode: errorClass,
        reply: null,
        result: null,
      });
      expect(
        publicSolutionConversationTurn({ ...turn, status: 'failed', error_code: errorClass })
          .nextInstruction
      ).toBeTruthy();
    }
  );
  it.each(['operation', 'base', 'turn'])('rejects model %s binding drift', (field) => {
    const { turn } = conversationFixture();
    const response = responseFor(turn);
    if (field === 'operation') response.operationId = randomUUID();
    if (field === 'base') response.result.response.baseWorkflowHash = 'e'.repeat(64);
    if (field === 'turn') response.result.response.buildRequestId = randomUUID();
    expect(() => completeSolutionConversationModel(turn, response)).toThrow();
  });
  it('persists useful clarification and includes bounded prior discussion in the next real design request', () => {
    const { turn, scope, command, context } = conversationFixture();
    const completed = completeSolutionConversationModel(
      turn,
      responseFor(turn, {
        outcome: 'needs_input',
        workflow: null,
        spec: null,
        questions: [
          {
            id: 'threshold',
            kind: 'information',
            prompt: 'Should exactly 150 be accepted?',
            reason: 'Clarify equality',
          },
        ],
      })
    );
    expect(completed).toMatchObject({
      status: 'blocked',
      reply: { questions: [{ id: 'threshold', prompt: 'Should exactly 150 be accepted?' }] },
    });
    expect(completed).not.toHaveProperty('candidate');
    const followup = makeSolutionConversationEnvelope({
      scope,
      turnId: randomUUID(),
      command: { ...command, message: 'Yes, exactly 150 should be accepted.' },
      context,
      history: [{ ...turn, status: 'blocked', reply: completed.reply }],
    });
    expect(followup.input.instruction).toContain(command.message);
    expect(followup.input.instruction).toContain('Should exactly 150 be accepted?');
    expect(followup.input.instruction).toContain('Yes, exactly 150');
  });
  it('rejects secret inputs and credentials, never returns raw model failures or a fabricated success', () => {
    const { turn, command } = conversationFixture();
    expect(
      SolutionConversationTurnSchema.safeParse({
        ...command,
        message: 'My key is orqaly_app_' + 'a'.repeat(80),
      }).success
    ).toBe(false);
    const workflow = nativeOrderWorkflow();
    workflow.nodes[0].credentials = {
      headerAuth: { id: 'native-private-id', name: 'secret selector' },
    };
    expect(redactConversationWorkflow(workflow).nodes[0]).not.toHaveProperty('credentials');
    expect(workflow.nodes[0]).toHaveProperty('credentials');
    const response = responseFor(turn, { workflow });
    expect(() => completeSolutionConversationModel(turn, response)).toThrow();
    expect(
      completeSolutionConversationModel(turn, {
        operationId: turn.operation_id,
        canonicalInputHash: turn.envelope.canonicalInputHash,
        status: 'failed',
        errorClass: 'UPSTREAM_INTERNAL_DETAIL',
      })
    ).toMatchObject({
      status: 'failed',
      reply: null,
      result: null,
      errorCode: 'WORKFLOW_CONVERSATION_FAILED',
    });
  });
  it('allows unchanged connector scope but blocks changed destination, method, payload and new requirements', () => {
    const { workflow, spec } = nativeOutboundFixture();
    const candidate = structuredClone(workflow);
    candidate.nodes[0].position = [999, 0];
    expect(sameConversationConnections(workflow, spec, candidate, spec)).toBe(true);
    for (const [field, value] of [
      ['url', 'https://different.example/path'],
      ['method', 'GET'],
      ['body', '={{ { changed: true } }}'],
    ]) {
      const changed = structuredClone(workflow);
      changed.nodes[1].parameters[field] = value;
      expect(sameConversationConnections(workflow, spec, changed, spec)).toBe(false);
    }
    expect(
      sameConversationConnections(workflow, spec, workflow, { ...spec, connections: [] })
    ).toBe(false);
  });
  it('saves an unbound pending-setup draft for changed connection scope without granting execution authority', () => {
    const { turn } = conversationFixture();
    const { workflow, spec } = nativeOutboundFixture();
    turn.context_snapshot.workflow = structuredClone(workflow);
    turn.context_snapshot.spec = spec;
    const response = responseFor(turn, { workflow, spec });
    expect(completeSolutionConversationModel(turn, response)).toMatchObject({
      status: 'completed',
      candidate: { validated: true },
    });
    workflow.nodes[1].parameters.url = 'https://changed.example/api';
    const result = completeSolutionConversationModel(turn, response);
    expect(result).toMatchObject({
      status: 'completed',
      reply: { phase: 'needs_setup', setupRef: { revisionId: turn.target_revision_id } },
      candidate: { connectionSetupRequired: true, validated: true },
    });
    expect(result.candidate.workflow.nodes.every((node) => !node.credentials)).toBe(true);
    expect(result).not.toHaveProperty('executionId');
  });
  it('restores only exact existing connector references internally, preserving later release review without exporting them to the model', () => {
    const { turn, context, scope, command } = conversationFixture();
    const { workflow, spec } = nativeOutboundFixture();
    const environmentId = 'owned-environment';
    const connection = {
      id: randomUUID(),
      requirement_id: 'receiver',
      environment_id: environmentId,
      credential_type: 'orqalyBoundedHttp',
      provider_credential_id: 'native-owned-ref',
      status: 'saved',
      scope: describeNativeConnection({ requirement: spec.connections[0], workflow, environmentId })
        .scope,
    };
    const authoritativeWorkflow = normalizeNativeWorkflow({
      workflow: bindNativeConnections(workflow, spec, [connection], environmentId),
      id: turn.target_revision_id,
    }).workflow;
    Object.assign(context, {
      workflow: redactConversationWorkflow(authoritativeWorkflow),
      authoritativeWorkflow,
      spec,
    });
    turn.context_snapshot = context;
    const envelope = makeSolutionConversationEnvelope({
      scope,
      turnId: turn.id,
      command,
      context,
      history: [],
    });
    expect(JSON.stringify(envelope)).not.toContain('native-owned-ref');
    expect(JSON.stringify(envelope)).not.toContain(`Orqaly connection ${connection.id}`);
    turn.envelope = envelope;
    turn.operation_id = envelope.operationId;
    const result = completeSolutionConversationModel(
      turn,
      responseFor(turn, { workflow: context.workflow, spec })
    );
    expect(result.status).toBe('completed');
    expect(result.candidate.workflow.nodes.find((n) => n.id === 'deliver').credentials).toEqual(
      authoritativeWorkflow.nodes.find((n) => n.id === 'deliver').credentials
    );
    expect(result.candidate.workflowHash).toBe(hash(result.candidate.workflow));
    expect(
      reviewNativeWorkflow({
        workflow: result.candidate.workflow,
        spec,
        environmentId,
        connections: [connection],
        runtimePolicy: createBoundedHttpPolicy({ imageDigest: `sha256:${'a'.repeat(64)}` }),
      })
    ).toMatchObject({ valid: true, execution: { allowed: true } });
    connection.status = 'revoked';
    expect(
      reviewNativeWorkflow({
        workflow: result.candidate.workflow,
        spec,
        environmentId,
        connections: [connection],
        runtimePolicy: createBoundedHttpPolicy({ imageDigest: `sha256:${'a'.repeat(64)}` }),
      }).execution.allowed
    ).toBe(false);
  });
  it('turns model credential questions into secure-setup instructions, not a chat collection prompt', () => {
    const { turn } = conversationFixture();
    const result = completeSolutionConversationModel(
      turn,
      responseFor(turn, {
        outcome: 'needs_input',
        workflow: null,
        spec: null,
        questions: [
          {
            id: 'credential',
            kind: 'connection',
            prompt: 'Please paste the API key here.',
            reason: 'Connect the provider',
          },
        ],
      })
    );
    expect(result).toMatchObject({
      status: 'blocked',
      errorCode: 'CONVERSATION_CONNECTION_SETUP_REQUIRED',
      reply: { questions: [] },
    });
    expect(JSON.stringify(result)).not.toContain('Please paste the API key');
  });
  it('projects authoritative references separately and omits context/envelope/raw model result', () => {
    const { turn } = conversationFixture();
    const projected = publicSolutionConversationTurn({
      ...turn,
      status: 'blocked',
      error_code: 'SOLUTION_CONVERSATION_CONFLICT',
      reply: { markdown: 'Proposed change', questions: [], dependencies: [] },
      result: { private: 'unused' },
    });
    expect(projected.evidence).toEqual(turn.context_snapshot.evidence);
    expect(projected.nextInstruction).toContain('Refresh');
    for (const name of ['envelope', 'context_snapshot', 'result', 'candidate'])
      expect(projected).not.toHaveProperty(name);
  });
  it('fails closed when disabled without reaching the model or queue', async () => {
    const repository = { claimSolutionConversationTurnV2: vi.fn() };
    const model = { submit: vi.fn() };
    const service = createSolutionConversationService({ repository, axwiseClient: model });
    expect(await service.advanceOne()).toEqual({ processed: false });
    await expect(service.send({}, randomUUID(), {}, 'valid_key')).rejects.toMatchObject({
      code: 'SOLUTION_CONVERSATION_DISABLED',
    });
    expect(repository.claimSolutionConversationTurnV2).not.toHaveBeenCalled();
    expect(model.submit).not.toHaveBeenCalled();
    expect(solutionConversationEnabledFromEnvironment({})).toBe(false);
    expect(
      solutionConversationEnabledFromEnvironment({ ORQALY_SOLUTION_CONVERSATIONS_ENABLED: 'true' })
    ).toBe(true);
    expect(() =>
      solutionConversationEnabledFromEnvironment({ ORQALY_SOLUTION_CONVERSATIONS_ENABLED: 'TRUE' })
    ).toThrow();
  });
  it.each([
    [409, 'AXWISE_HTTP_409'],
    [400, 'AXWISE_HTTP_400'],
    [401, 'AXWISE_HTTP_401'],
    [403, 'AXWISE_HTTP_403'],
    [422, 'AXWISE_HTTP_422'],
    [200, 'AXWISE_INVALID_TERMINAL_CONTRACT'],
  ])(
    'persists safe transport failure %s without upstream messages or bodies',
    async (status, errorClass) => {
      const { turn, scope } = conversationFixture();
      const failure = new AxWiseDispatchError(
        'private diagnostic orqaly_app_secret must never persist',
        {
          retryable: false,
          errorClass,
          status,
        }
      );
      const saved = [];
      const repository = {
        claimSolutionConversationTurnV2: vi.fn(async (leaseToken) => ({
          ...scope,
          turnId: turn.id,
          leaseToken,
        })),
        solutionBuildTransaction: vi.fn(async (_scope, callback) =>
          callback({
            query: vi.fn(async (sql, args) => {
              if (sql.startsWith('SELECT * FROM orqaly.solution_conversation_turns'))
                return { rows: [turn] };
              if (sql.startsWith('SELECT status FROM orqaly.tenants'))
                return { rows: [{ status: 'active' }] };
              if (sql.startsWith('SELECT orqaly.complete_solution_conversation_turn')) {
                const result = JSON.parse(args[2]);
                saved.push(result);
                return { rows: [{ result }] };
              }
              throw new Error('unexpected fixture query');
            }),
          })
        ),
      };
      const model = {
        submit: vi.fn(async () => {
          throw failure;
        }),
        poll: vi.fn(),
      };
      const service = createSolutionConversationService({
        repository,
        axwiseClient: model,
        enabled: true,
      });
      expect(await service.advanceOne()).toMatchObject({ status: 'failed', errorCode: errorClass });
      expect(saved).toEqual([{ status: 'failed', errorCode: errorClass, reply: null }]);
      expect(JSON.stringify(saved)).not.toContain('orqaly_app_secret');
      const publicTurn = publicSolutionConversationTurn({
        ...turn,
        status: 'failed',
        error_code: errorClass,
      });
      expect(publicTurn.nextInstruction).toBeTruthy();
      expect(JSON.stringify(publicTurn)).not.toContain('private diagnostic');
      expect(model.submit).toHaveBeenCalledOnce();
      expect(model.poll).not.toHaveBeenCalled();
    }
  );
  it.each([
    Object.assign(new Error('provider payload'), { errorClass: 'AXWISE_HTTP_409', status: 409 }),
    new AxWiseDispatchError('provider payload', {
      retryable: false,
      errorClass: 'AXWISE_HTTP_422',
      status: 409,
    }),
    new AxWiseDispatchError('provider payload', {
      retryable: false,
      errorClass: 'PRIVATE_CUSTOM_CLASS',
      status: 409,
    }),
  ])('does not persist forged, mismatched, or unrecognized transport metadata', async (failure) => {
    const { turn, scope } = conversationFixture();
    let completion;
    const repository = {
      claimSolutionConversationTurnV2: async (leaseToken) => ({
        ...scope,
        turnId: turn.id,
        leaseToken,
      }),
      solutionBuildTransaction: async (_scope, callback) =>
        callback({
          query: async (sql, args) => {
            if (sql.startsWith('SELECT * FROM orqaly.solution_conversation_turns'))
              return { rows: [turn] };
            if (sql.startsWith('SELECT status FROM orqaly.tenants'))
              return { rows: [{ status: 'active' }] };
            if (sql.startsWith('SELECT orqaly.complete_solution_conversation_turn')) {
              completion = JSON.parse(args[2]);
              return { rows: [{ result: completion }] };
            }
            throw new Error('unexpected fixture query');
          },
        }),
    };
    await createSolutionConversationService({
      repository,
      enabled: true,
      axwiseClient: {
        submit: async () => {
          throw failure;
        },
      },
    }).advanceOne();
    expect(completion).toEqual({
      status: 'failed',
      errorCode: 'WORKFLOW_CONVERSATION_FAILED',
      reply: null,
    });
  });
  it('cannot resume secure setup from matching draft bytes alone when no scoped setup adapter exists', async () => {
    const { command, scope } = conversationFixture('change');
    const repository = {
      resolveTenant: vi.fn(async () => scope.tenantId),
      solutionBuildTransaction: vi.fn(),
      claimSolutionConversationTurnV2: vi.fn(),
    };
    const model = { submit: vi.fn(), poll: vi.fn() };
    const service = createSolutionConversationService({
      repository,
      axwiseClient: model,
      enabled: true,
    });
    await expect(
      service.send(
        { userId: scope.userId },
        randomUUID(),
        {
          ...command,
          continuation: { turnId: randomUUID(), kind: 'resume_setup' },
        },
        'resume_unavailable_setup'
      )
    ).rejects.toMatchObject({ code: 'CONVERSATION_CONNECTION_SETUP_UNAVAILABLE', status: 503 });
    expect(repository.solutionBuildTransaction).not.toHaveBeenCalled();
    expect(model.submit).not.toHaveBeenCalled();
    expect(model.poll).not.toHaveBeenCalled();
  });
  it('claims only through the versioned worker entry point and never falls back to a legacy claim', async () => {
    const leaseToken = randomUUID();
    const claim = {
      tenantId: randomUUID(),
      userId: 'user_owner',
      turnId: randomUUID(),
      leaseToken,
    };
    const repository = {
      claimSolutionConversationTurn: vi.fn(),
      claimSolutionConversationTurnV2: vi.fn().mockResolvedValue(claim),
    };
    await expect(createSolutionConversationStore(repository).claim(leaseToken)).resolves.toEqual(
      claim
    );
    expect(repository.claimSolutionConversationTurnV2).toHaveBeenCalledExactlyOnceWith(leaseToken);
    expect(repository.claimSolutionConversationTurn).not.toHaveBeenCalled();
  });
});

describe('selected frozen revision discussion does not grant mutation authority', () => {
  function fixture(status = 'ready', mode = 'auto') {
    const source = conversationFixture('ask');
    const { scope, context } = source;
    const parent = {
      id: context.solutionId,
      tenant_id: scope.tenantId,
      owner_user_id: scope.userId,
      name: context.name,
      row_version: 6,
      status: 'active',
      active_revision_id: null,
      build_request_id: randomUUID(),
      workflow: context.workflow,
      workflow_hash: hash(context.workflow),
      spec: context.spec,
      deployment: { workflowId: 'live-provider', versionId: 'live-version' },
    };
    const workflow = structuredClone(context.workflow);
    workflow.nodes[1].position[0] += 10;
    const revision = {
      id: randomUUID(),
      tenant_id: scope.tenantId,
      owner_user_id: scope.userId,
      solution_id: parent.id,
      version: 2,
      row_version: 11,
      status,
      workflow,
      workflow_hash: hash(workflow),
      spec: structuredClone(context.spec),
      approved_at: '2026-09-07T13:00:00Z',
      tested_at: '2026-09-07T13:01:00Z',
      review: { valid: true, workflowHash: hash(workflow) },
      deployment: {
        workflowId: 'candidate-provider',
        versionId: 'candidate-version',
        active: false,
      },
    };
    const revisions = [revision];
    const turns = [];
    const finished = [];
    const command = {
      turnId: randomUUID(),
      mode,
      message:
        'Explain this selected version and the next Orqaly control without changing anything.',
      expectedSolutionVersion: parent.row_version,
      workflowHash: parent.workflow_hash,
      draft: {
        id: revision.id,
        rowVersion: revision.row_version,
        workflowHash: revision.workflow_hash,
      },
    };
    const query = vi.fn(async (sql, args) => {
      if (sql.startsWith('SELECT * FROM orqaly.customer_solutions'))
        return {
          rows:
            args[0] === scope.tenantId && args[1] === scope.userId && args[2] === parent.id
              ? [parent]
              : [],
        };
      if (sql.startsWith('SELECT * FROM orqaly.solution_connections')) return { rows: [] };
      if (sql.startsWith('SELECT * FROM orqaly.solution_revisions')) {
        expect(sql).toContain('tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3');
        return {
          rows: revisions.filter(
            (r) =>
              r.tenant_id === args[0] &&
              r.owner_user_id === args[1] &&
              r.solution_id === args[2] &&
              (sql.includes("status IN ('draft','reviewed')")
                ? ['draft', 'reviewed'].includes(r.status)
                : r.id === args[3])
          ),
        };
      }
      if (sql.startsWith('SELECT * FROM orqaly.solution_conversation_turns')) {
        if (sql.includes('request_key=$5'))
          return { rows: turns.filter((t) => t.id === args[3] || t.request_key === args[4]) };
        if (sql.includes('lease_token=$4'))
          return { rows: turns.filter((t) => t.id === args[2] && t.lease_token === args[3]) };
        if (sql.endsWith('AND id=$4')) return { rows: turns.filter((t) => t.id === args[3]) };
        return { rows: turns };
      }
      if (sql.startsWith('SELECT status FROM orqaly.tenants'))
        return { rows: [{ status: 'active' }] };
      if (sql.startsWith('SELECT source_snapshot,agent_snapshot,run_id'))
        return {
          rows: [
            {
              source_snapshot: context.source,
              agent_snapshot: context.agent,
              run_id: context.source.runId,
            },
          ],
        };
      if (sql.startsWith('SELECT input,output,evidence FROM orqaly.solution_invocations'))
        return {
          rows: revision.spec.acceptanceCases.map((test) => ({
            input: test.input,
            output: test.expectedOutput,
            evidence: {
              testArtifactHash: 'a'.repeat(64),
              responseStatus: test.expectedStatus,
              cleanup: { status: 'removed' },
            },
          })),
        };
      if (sql.includes('FROM orqaly.solution_invocations')) return { rows: [] };
      if (sql.startsWith('INSERT INTO orqaly.solution_conversation_turns')) {
        turns.push({
          tenant_id: args[0],
          solution_id: args[1],
          id: args[2],
          owner_user_id: args[3],
          mode: args[4],
          message: args[5],
          request_key: args[6],
          request_hash: args[7],
          command: args[8],
          context_snapshot: args[9],
          context_hash: args[10],
          operation_id: args[11],
          envelope: args[12],
          target_revision_id: args[13],
          lifecycle: {},
          status: 'queued',
          dispatch_count: 0,
          created_at: new Date().toISOString(),
        });
        return { rows: [] };
      }
      if (sql.startsWith('SELECT orqaly.complete_solution_conversation_turn')) {
        const result = JSON.parse(args[2]);
        finished.push(result);
        Object.assign(
          turns.find((t) => t.id === args[0]),
          result,
          {
            error_code: result.errorCode ?? null,
            draft_revision_id: null,
            completed_at: new Date().toISOString(),
          }
        );
        return { rows: [{ result }] };
      }
      throw new Error(`Unexpected synthetic query: ${sql}`);
    });
    const repository = {
      resolveTenant: vi.fn(async () => scope.tenantId),
      revisionConnectionsEnabled: true,
      solutionBuildTransaction: vi.fn(async (_scope, callback) => callback({ query })),
      claimSolutionConversationTurnV2: vi.fn(async (leaseToken) => {
        const turn = turns.find((t) => t.status === 'queued');
        if (!turn) return null;
        Object.assign(turn, { status: 'running', lease_token: leaseToken, dispatch_count: 1 });
        return { ...scope, turnId: turn.id, leaseToken };
      }),
    };
    let intent = 'answer';
    const model = {
      submit: vi.fn(async (envelope) => ({
        operationId: envelope.operationId,
        canonicalInputHash: envelope.canonicalInputHash,
        status: 'completed',
        result: {
          resultType: 'assistant_turn_completed',
          response: {
            schemaVersion: 'axwise.assistant-turn.v1',
            markdown:
              command.mode === 'ask'
                ? 'Synthetic read-only answer.'
                : JSON.stringify({
                    intent,
                    reply: 'Synthetic read-only answer.',
                    request: intent === 'change' ? 'Change the minimum to 150.' : null,
                    questions: [],
                    proposals: [],
                  }),
          },
        },
      })),
      poll: vi.fn(),
    };
    const runtime = { nativePolicy: vi.fn(), createCredential: vi.fn(), readCredential: vi.fn() };
    const service = createSolutionConversationService({
      repository,
      enabled: true,
      axwiseClient: model,
      runtime,
    });
    return {
      scope,
      parent,
      revision,
      revisions,
      turns,
      finished,
      command,
      query,
      repository,
      model,
      service,
      runtime,
      setIntent: (value) => {
        intent = value;
      },
    };
  }

  it.each([
    'approved',
    'ready',
    'deploying',
    'deployment_unknown',
    'active',
    'paused',
    'superseded',
    'rejected',
  ])(
    'reads the exact owned %s revision while availableDraft stays editable-only',
    async (status) => {
      const f = fixture(status);
      const before = hash([f.parent, f.revision]);
      const result = await f.service.read({ userId: f.scope.userId }, f.parent.id, {
        draftId: f.revision.id,
      });
      expect(result.context.selectedDraft).toEqual(f.command.draft);
      expect(result.context.availableDraft).toBeNull();
      expect(hash([f.parent, f.revision])).toBe(before);
      expect(f.model.submit).not.toHaveBeenCalled();
    }
  );
  it.each(['ask', 'auto'])(
    'queues and completes %s on a ready candidate without changing approval, tests, deployment or live selection',
    async (mode) => {
      const f = fixture('ready', mode);
      const before = hash([f.parent, f.revision]);
      const result = await f.service.send(
        { userId: f.scope.userId },
        f.parent.id,
        f.command,
        'frozen_question_1'
      );
      expect(result.context.selectedDraft).toEqual(f.command.draft);
      expect(f.model.submit).not.toHaveBeenCalled();
      expect(f.turns[0].envelope.operationType).toBe('AssistantTurnV1');
      expect(f.turns[0].context_snapshot).toMatchObject({
        changeAllowed: false,
        changeBlockedReason: 'SOLUTION_REVISION_NOT_EDITABLE',
        customerControls: {
          status: 'ready',
          version: 2,
          workflowHash: f.revision.workflow_hash,
          testCoverage: { status: 'verified' },
          nextControl: 'Activate v2',
        },
      });
      const modelSummary = JSON.parse(
        f.turns[0].envelope.input.conversation[0].content.split('\n').slice(1).join('\n')
      );
      expect(modelSummary).toMatchObject({
        changeAllowed: false,
        changeBlockedReason: 'SOLUTION_REVISION_NOT_EDITABLE',
        editControl: {
          label: 'Fix this version',
          creates: 'new_unapproved_revision',
          changesSelectedVersion: false,
          isAuthorization: false,
        },
      });
      expect(await f.service.advanceOne()).toMatchObject({ status: 'completed' });
      expect(f.model.submit).toHaveBeenCalledTimes(1);
      expect(f.finished[0]).not.toHaveProperty('candidate');
      expect(hash([f.parent, f.revision])).toBe(before);
      expect(
        f.query.mock.calls.some(([sql]) =>
          /UPDATE orqaly.solution_revisions|INSERT INTO orqaly.solution_revisions/.test(sql)
        )
      ).toBe(false);
      const replay = await f.service.send(
        { userId: f.scope.userId },
        f.parent.id,
        f.command,
        'frozen_question_1'
      );
      expect(replay.replayed).toBe(true);
      expect(f.turns).toHaveLength(1);
      expect(f.model.submit).toHaveBeenCalledTimes(1);
    }
  );
  it('routes a frozen-candidate change to a saved Fix this version blocker, never a design operation', async () => {
    const f = fixture();
    f.setIntent('change');
    const before = hash([f.parent, f.revision]);
    await f.service.send({ userId: f.scope.userId }, f.parent.id, f.command, 'frozen_change_1');
    expect(await f.service.advanceOne()).toMatchObject({
      status: 'blocked',
      errorCode: 'SOLUTION_REVISION_NOT_EDITABLE',
    });
    expect(f.finished[0]).toMatchObject({ reply: { phase: 'needs_input' } });
    expect(f.finished[0].reply.markdown).toContain('Fix this version');
    expect(f.finished[0]).not.toHaveProperty('candidate');
    expect(f.finished[0]).not.toHaveProperty('transition');
    expect(f.model.submit).toHaveBeenCalledTimes(1);
    expect(f.model.submit.mock.calls[0][0].operationType).toBe('AssistantTurnV1');
    expect(publicSolutionConversationTurn(f.turns[0]).nextInstruction).toContain(
      'Fix this version'
    );
    expect(hash([f.parent, f.revision])).toBe(before);
  });
  it('rejects explicit frozen-candidate design before enqueue or any model call', async () => {
    const f = fixture('approved', 'change');
    await expect(
      f.service.send({ userId: f.scope.userId }, f.parent.id, f.command, 'frozen_direct_change')
    ).rejects.toMatchObject({ code: 'SOLUTION_REVISION_NOT_EDITABLE' });
    expect(f.turns).toEqual([]);
    expect(f.model.submit).not.toHaveBeenCalled();
  });
  it.each(['proposal', 'resume_setup'])(
    'blocks frozen %s before setup or runtime readiness checks',
    async (kind) => {
      const f = fixture();
      if (kind === 'proposal')
        f.command.proposalRef = {
          turnId: randomUUID(),
          proposalId: 'option_1',
          proposalHash: 'a'.repeat(64),
        };
      else f.command.continuation = { turnId: randomUUID(), kind };
      await expect(
        f.service.send({ userId: f.scope.userId }, f.parent.id, f.command, 'frozen_reference')
      ).rejects.toMatchObject({ code: 'SOLUTION_REVISION_NOT_EDITABLE' });
      expect(f.turns).toEqual([]);
      expect(f.model.submit).not.toHaveBeenCalled();
      expect(f.runtime.nativePolicy).not.toHaveBeenCalled();
      expect(f.runtime.readCredential).not.toHaveBeenCalled();
      expect(f.runtime.createCredential).not.toHaveBeenCalled();
    }
  );
  it.each(['answer', 'retry'])(
    'routes a frozen %s continuation through read-only intent, never directly into design',
    async (kind) => {
      const f = fixture();
      await f.service.send(
        { userId: f.scope.userId },
        f.parent.id,
        f.command,
        'first_frozen_question'
      );
      await f.service.advanceOne();
      const next = {
        ...structuredClone(f.command),
        turnId: randomUUID(),
        continuation: { turnId: f.command.turnId, kind },
      };
      await f.service.send({ userId: f.scope.userId }, f.parent.id, next, 'next_frozen_question');
      expect(f.turns[1].envelope.operationType).toBe('AssistantTurnV1');
      expect(f.turns[1].context_snapshot.continuationNeedsRouting).toBe(true);
      expect(f.turns[1].context_snapshot.changeAllowed).toBe(false);
      expect(f.runtime.nativePolicy).not.toHaveBeenCalled();
      expect(f.runtime.readCredential).not.toHaveBeenCalled();
    }
  );
  it.each(['rowVersion', 'workflowHash'])(
    'retains exact selected %s CAS before queuing a question',
    async (field) => {
      const f = fixture();
      f.command.draft[field] = field === 'rowVersion' ? 10 : 'f'.repeat(64);
      await expect(
        f.service.send({ userId: f.scope.userId }, f.parent.id, f.command, 'stale_question')
      ).rejects.toMatchObject({ code: 'SOLUTION_CONVERSATION_CONFLICT' });
      expect(f.turns).toEqual([]);
      expect(f.model.submit).not.toHaveBeenCalled();
    }
  );
  it.each(['owner_user_id', 'tenant_id', 'solution_id'])(
    'does not resolve a selected revision from another %s',
    async (field) => {
      const f = fixture();
      f.revision[field] = field === 'owner_user_id' ? 'user_someone_else' : randomUUID();
      await expect(
        f.service.read({ userId: f.scope.userId }, f.parent.id, { draftId: f.revision.id })
      ).rejects.toMatchObject({ code: 'SOLUTION_DRAFT_NOT_FOUND' });
      await expect(
        f.service.send({ userId: f.scope.userId }, f.parent.id, f.command, 'foreign_question')
      ).rejects.toMatchObject({ code: 'SOLUTION_DRAFT_NOT_FOUND' });
      expect(f.turns).toEqual([]);
    }
  );
  it('does not substitute a different editable draft for the selected ready candidate', async () => {
    const f = fixture();
    const editable = {
      ...structuredClone(f.revision),
      id: randomUUID(),
      version: 3,
      status: 'draft',
      row_version: 0,
    };
    f.revisions.push(editable);
    const result = await f.service.read({ userId: f.scope.userId }, f.parent.id, {
      draftId: f.revision.id,
    });
    expect(result.context.selectedDraft.id).toBe(f.revision.id);
    expect(result.context.availableDraft.id).toBe(editable.id);
    await f.service.send(
      { userId: f.scope.userId },
      f.parent.id,
      f.command,
      'exact_frozen_selection'
    );
    expect(f.turns[0].context_snapshot.selectedDraft.id).toBe(f.revision.id);
    expect(f.turns[0].context_snapshot.changeAllowed).toBe(false);
  });
  it.each(['draft', 'reviewed'])('preserves explicit %s mutation admission', async (status) => {
    const f = fixture(status, 'change');
    await f.service.send({ userId: f.scope.userId }, f.parent.id, f.command, 'editable_change');
    expect(f.turns[0].envelope.operationType).toBe('PrepareSolutionV2');
    expect(f.turns[0].context_snapshot.changeAllowed).toBe(true);
    expect(f.turns[0].context_snapshot.changeBlockedReason).toBeNull();
  });
  it('cannot bypass frozen authority using a direct design envelope or candidate result', () => {
    const { turn, scope, command, context } = conversationFixture('change');
    context.changeAllowed = false;
    context.changeBlockedReason = 'SOLUTION_REVISION_NOT_EDITABLE';
    expect(() =>
      makeSolutionConversationEnvelope({ scope, turnId: turn.id, command, context, history: [] })
    ).toThrow(/Fix this version/);
    const result = completeSolutionConversationModel(turn, responseFor(turn));
    expect(result).toMatchObject({
      status: 'blocked',
      errorCode: 'SOLUTION_REVISION_NOT_EDITABLE',
    });
    expect(result).not.toHaveProperty('candidate');
  });
});
