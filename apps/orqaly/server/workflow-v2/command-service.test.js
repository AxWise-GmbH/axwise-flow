import { describe, expect, it, vi } from 'vitest';
import scopeCompletion from '../../shared/workflow-v2/fixtures/scope_completion_result_v2.json';
import compileScopeV3Envelope from '../../shared/workflow-v2/fixtures/compile_scope_envelope_v3.json';
import { canonicalHash, sha256Hex } from '../../lib/workflow-v2/canonical.js';
import { compileAssistantGoalContext } from './assistant-context.js';
import { createWorkflowCommandService } from './command-service.js';
import { workflowIds } from './ids.js';

const tenantId = '00000000-0000-4000-8000-000000000001';
const userId = 'user_commandtest123';
const commandId = '00000000-0000-4000-8000-000000000002';
const issuedAt = '2026-08-27T12:00:00.000Z';

function executionAgentFor({ threadId, turnId, task, lifetime = 'temporary' }) {
  return {
    schemaVersion: 'orqaly.execution-agent.v1',
    id: '00000000-0000-4000-8000-000000000099',
    runId: workflowIds(tenantId, commandId).runId,
    owner: { tenantId, userId },
    lifetime,
    source: { threadId, turnId, taskHash: sha256Hex(task) },
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
}

function repository() {
  return {
    resolveTenant: vi.fn().mockResolvedValue(tenantId),
    applyTransition: vi.fn().mockResolvedValue({ idempotent: false }),
    loadSnapshot: vi.fn().mockResolvedValue({ sentinel: 'snapshot' }),
    listSnapshots: vi.fn().mockResolvedValue([{ run: { id: commandId } }]),
    loadWorkspaceProjection: vi.fn(),
    loadOverviewProjection: vi.fn(),
    loadActivityProjection: vi.fn(),
    loadArtifact: vi.fn(),
    readiness: vi.fn().mockResolvedValue({ database: 'ready' }),
  };
}

describe('workflow v2 command service', () => {
  it('projects the personal workspace, active capabilities, and tools without cost metadata', async () => {
    const repo = repository();
    repo.loadWorkspaceProjection.mockResolvedValue({
      displayName: 'Ada workspace',
      status: 'active',
      tenantId: 'must-not-escape',
      agents: [
        {
          id: '00000000-0000-4000-8000-000000000010',
          name: 'Zeta researcher',
          status: 'active',
          capabilities: ['research', 'research', 'evidence_synthesis'],
          toolIds: ['00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000020'],
          updatedAt: '2026-08-31T12:00:00.000Z',
          qualityScore: 1,
          costPerRunCents: 999,
        },
        {
          id: '00000000-0000-4000-8000-000000000011',
          name: 'Alpha planner',
          status: 'active',
          capabilities: ['planning', 'research'],
          toolIds: ['00000000-0000-4000-8000-000000000021'],
          updatedAt: '2026-08-31T11:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000012',
          name: 'Disabled agent',
          status: 'disabled',
          capabilities: ['private_disabled_capability'],
          toolIds: ['00000000-0000-4000-8000-000000000022'],
          updatedAt: '2026-08-31T10:00:00.000Z',
        },
      ],
    });
    const service = createWorkflowCommandService({ repository: repo });

    const result = await service.workspace({ userId, orgId: 'org_must_not_propagate' });

    expect(repo.loadWorkspaceProjection).toHaveBeenCalledWith(tenantId);
    expect(result.workspace).toEqual({
      displayName: 'Ada workspace',
      status: 'active',
      agentCount: 3,
      activeAgentCount: 2,
      capabilityCount: 3,
      toolCount: 2,
    });
    expect(result.capabilities).toEqual([
      { name: 'evidence_synthesis', agentCount: 1 },
      { name: 'planning', agentCount: 1 },
      { name: 'research', agentCount: 2 },
    ]);
    expect(result.agents.map((agent) => agent.name)).toEqual([
      'Alpha planner',
      'Disabled agent',
      'Zeta researcher',
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /tenantId|org_must_not_propagate|qualityScore|costPerRunCents|999/
    );
  });

  it('returns a not-found error when a resolved tenant has no workspace row', async () => {
    const repo = repository();
    repo.loadWorkspaceProjection.mockResolvedValue(null);
    const service = createWorkflowCommandService({ repository: repo });

    await expect(service.workspace({ userId })).rejects.toMatchObject({
      code: 'WORKSPACE_NOT_FOUND',
      status: 404,
    });
  });

  it('returns chronological named workflows, results, and derived notifications', async () => {
    const repo = repository();
    const awaitingId = '00000000-0000-4000-8000-000000000030';
    const completedId = '00000000-0000-4000-8000-000000000031';
    const failedId = '00000000-0000-4000-8000-000000000032';
    const artifact = {
      artifactId: '00000000-0000-4000-8000-000000000040',
      artifactHash: 'b'.repeat(64),
      kind: 'final_markdown',
    };
    repo.loadOverviewProjection.mockResolvedValue({
      counts: {
        total: '10',
        active: '2',
        awaitingApproval: '1',
        completed: '5',
        attention: '2',
        tenantId: 'must-not-escape',
      },
      workflows: [
        {
          id: failedId,
          request: '',
          mode: 'simple',
          status: 'failed',
          createdAt: '2026-08-31T08:00:00.000Z',
          updatedAt: '2026-08-31T10:00:00.000Z',
          evidenceReadiness: null,
          completedStages: 2,
          totalStages: 7,
          finalArtifact: null,
          eventPayload: { secret: 'must-not-escape' },
        },
        {
          id: completedId,
          request: '  Evidence\n  review   for launch  ',
          mode: 'advanced',
          status: 'completed_with_evidence_gaps',
          createdAt: '2026-08-31T07:00:00.000Z',
          updatedAt: '2026-08-31T11:00:00.000Z',
          evidenceReadiness: 'ready_with_gaps',
          completedStages: 7,
          totalStages: 7,
          finalArtifact: { ...artifact, internalUrl: 'https://internal.invalid/result' },
        },
        {
          id: awaitingId,
          request: `Scope ${'x'.repeat(140)}`,
          mode: 'simple',
          status: 'awaiting_gate_1',
          createdAt: '2026-08-31T06:00:00.000Z',
          updatedAt: '2026-08-31T12:00:00.000Z',
          evidenceReadiness: null,
          completedStages: 1,
          totalStages: 7,
          finalArtifact: null,
        },
      ],
    });
    const service = createWorkflowCommandService({ repository: repo });

    const result = await service.overview({ userId, orgId: 'org_must_not_propagate' }, 17);

    expect(repo.loadOverviewProjection).toHaveBeenCalledWith(tenantId, 17, { capabilityOwnerUserId: userId });
    expect(result.counts).toEqual({
      total: 10,
      active: 2,
      awaitingApproval: 1,
      completed: 5,
      attention: 2,
    });
    expect(result.workflows.map((workflow) => workflow.id)).toEqual([
      awaitingId,
      completedId,
      failedId,
    ]);
    expect(Array.from(result.workflows[0].title)).toHaveLength(120);
    expect(result.workflows[0]).toMatchObject({
      pendingApproval: 'scope',
      progress: { completedStages: 1, totalStages: 7 },
    });
    expect(result.workflows[1]).toMatchObject({
      title: 'Evidence review for launch',
      pendingApproval: null,
      finalArtifact: artifact,
    });
    expect(result.workflows[2].title).toBe('Untitled goal');
    expect(result.results).toEqual([
      {
        runId: completedId,
        title: 'Evidence review for launch',
        status: 'completed_with_evidence_gaps',
        completedAt: '2026-08-31T11:00:00.000Z',
        evidenceReadiness: 'ready_with_gaps',
        artifact,
      },
    ]);
    expect(
      result.notifications.map(({ kind, severity, runId }) => ({ kind, severity, runId }))
    ).toEqual([
      { kind: 'approval_required', severity: 'action', runId: awaitingId },
      { kind: 'evidence_gaps', severity: 'warning', runId: completedId },
      { kind: 'run_failed', severity: 'error', runId: failedId },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /tenantId|org_must_not_propagate|eventPayload|must-not-escape|internal\.invalid/
    );
  });

  it('maps immutable events to a redacted, chronological activity feed', async () => {
    const repo = repository();
    repo.loadActivityProjection.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000050',
        runId: '00000000-0000-4000-8000-000000000060',
        request: 'Research launch evidence',
        eventType: 'ActivityCompleted',
        stageKind: 'execute_research',
        occurredAt: '2026-08-31T11:00:00.000Z',
        eventPayload: { secret: 'must-not-escape' },
      },
      {
        id: '00000000-0000-4000-8000-000000000051',
        runId: '00000000-0000-4000-8000-000000000061',
        request: 'Unknown future event',
        eventType: 'FutureInternalEvent',
        stageKind: null,
        occurredAt: '2026-08-31T12:00:00.000Z',
        auditPayload: { clerkClaims: 'must-not-escape' },
      },
    ]);
    const service = createWorkflowCommandService({ repository: repo });

    const result = await service.activity({ userId }, 9);

    expect(repo.loadActivityProjection).toHaveBeenCalledWith(tenantId, 9, { capabilityOwnerUserId: userId });
    expect(result.activities).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000051',
        runId: '00000000-0000-4000-8000-000000000061',
        workflowTitle: 'Unknown future event',
        kind: 'workflow_activity',
        label: 'Workflow updated',
        stage: null,
        occurredAt: '2026-08-31T12:00:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000050',
        runId: '00000000-0000-4000-8000-000000000060',
        workflowTitle: 'Research launch evidence',
        kind: 'stage_completed',
        label: 'Research completed',
        stage: 'Research',
        occurredAt: '2026-08-31T11:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /FutureInternalEvent|eventPayload|auditPayload|clerkClaims|must-not-escape/
    );
  });

  it('returns an idempotent personal session without exposing tenant or organization identity', async () => {
    const repo = repository();
    const service = createWorkflowCommandService({ repository: repo });
    const organizationShapedAuth = {
      userId,
      organizationId: 'org_commandtest123',
      orgId: 'org_commandtest456',
    };

    await expect(service.session(organizationShapedAuth)).resolves.toEqual({
      userId,
      tenantBound: true,
    });
    await expect(service.session(organizationShapedAuth)).resolves.toEqual({
      userId,
      tenantBound: true,
    });
    expect(repo.resolveTenant).toHaveBeenCalledTimes(2);
    expect(repo.resolveTenant).toHaveBeenNthCalledWith(1, { userId });
    expect(repo.resolveTenant).toHaveBeenNthCalledWith(2, { userId });
  });

  it.each(['simple', 'advanced'])(
    'starts %s mode through the identical transition engine',
    async (mode) => {
      const repo = repository();
      const service = createWorkflowCommandService({ repository: repo });
      const result = await service.start(
        { userId },
        { commandId, issuedAt, mode, request: 'Create an Estonia cat-food launch PRD.' }
      );

      expect(repo.resolveTenant).toHaveBeenCalledWith({ userId });
      const [resolvedTenant, runId, plan] = repo.applyTransition.mock.calls[0];
      expect(resolvedTenant).toBe(tenantId);
      expect(plan.event).toMatchObject({
        eventId: commandId,
        occurredAt: issuedAt,
        tenantId,
        runId,
        mode,
        ownerUserId: userId,
      });
      expect(plan.createStages.map((stage) => stage.kind)).toEqual([
        'compile_scope',
        'gate_1',
        'execute_research',
        'planning',
        'gate_2',
        'evaluation',
        'synthesis',
      ]);
      expect(plan.createAttempts[0]).toMatchObject({
        inputPayload: {
          type: 'CompileScopeV2',
          request: 'Create an Estonia cat-food launch PRD.',
          objectiveOnlyContext: [],
          safeDefaults: {
            geography: [],
            acceptedSourceTypes: [],
            assumptions: [],
            limits: [],
            policies: [],
          },
        },
      });
      expect(result.workflow).toEqual({ sentinel: 'snapshot' });
    }
  );

  it('starts an assistant-owned Goal with V3 context while retaining the concise public request', async () => {
    const repo = repository();
    const service = createWorkflowCommandService({ repository: repo });
    const threadId = '00000000-0000-4000-8000-000000000070';
    const turnId = '00000000-0000-4000-8000-000000000071';
    const instruction = 'Create the launch plan from that 🚀.';
    const current = {
      id: '00000000-0000-4000-8000-000000000072',
      threadId,
      turnId,
      role: 'user',
      route: 'START_GOAL',
      parts: [{ type: 'text', markdown: instruction }],
      axwiseOperationId: null,
      workflowRunId: null,
      retryOfTurnId: null,
      createdAt: issuedAt,
    };
    const priorTurnId = '00000000-0000-4000-8000-000000000073';
    const prior = [
      {
        ...current,
        id: '00000000-0000-4000-8000-000000000074',
        turnId: priorTurnId,
        role: 'user',
        route: 'DIRECT_ANSWER',
        parts: [{ type: 'text', markdown: 'Research the Estonia launch.' }],
        axwiseOperationId: '00000000-0000-4000-8000-000000000076',
        createdAt: '2026-08-27T11:58:00.000Z',
      },
      {
        ...current,
        id: '00000000-0000-4000-8000-000000000075',
        turnId: priorTurnId,
        role: 'assistant',
        route: 'DIRECT_ANSWER',
        parts: [{ type: 'text', markdown: 'Use a staged rollout.' }],
        axwiseOperationId: '00000000-0000-4000-8000-000000000076',
        createdAt: '2026-08-27T11:59:00.000Z',
      },
    ];
    const trustedContext = compileAssistantGoalContext([...prior, current], turnId, instruction);
    trustedContext.executionAgent = executionAgentFor({ threadId, turnId, task: instruction });

    await service.startFromAssistant(
      { userId },
      { commandId, issuedAt, mode: 'advanced', request: instruction },
      trustedContext
    );

    const plan = repo.applyTransition.mock.calls[0][2];
    expect(plan.event).toMatchObject({
      type: 'RunRequested',
      request: instruction,
      requestHash: sha256Hex(instruction),
      inputPayload: {
        type: 'CompileScopeV3',
        assistantContext: { instruction: { content: instruction } },
      },
    });
    expect(plan.event.inputPayload.request).toBe(
      `${instruction}\n\nOWNER_PRIOR\nResearch the Estonia launch.` +
        '\n\nASSISTANT_REFERENCE\nUse a staged rollout.'
    );
    expect(plan.event.inputPayload.request).not.toBe(plan.event.request);
    expect(plan.createAttempts[0].inputPayload.type).toBe('CompileScopeV3');
    expect(plan.createAttempts[0].inputHash).toBe(
      canonicalHash(plan.createAttempts[0].inputPayload)
    );
  });

  it('rejects an assistant context that does not bind the exact public Goal request', async () => {
    const repo = repository();
    const service = createWorkflowCommandService({ repository: repo });
    const turnId = '00000000-0000-4000-8000-000000000081';
    const context = compileAssistantGoalContext(
      [
        {
          id: '00000000-0000-4000-8000-000000000082',
          threadId: '00000000-0000-4000-8000-000000000080',
          turnId,
          role: 'user',
          route: 'START_GOAL',
          parts: [{ type: 'text', markdown: 'Original instruction.' }],
          axwiseOperationId: null,
          workflowRunId: null,
          retryOfTurnId: null,
          createdAt: issuedAt,
        },
      ],
      turnId,
      'Original instruction.'
    );
    context.executionAgent = executionAgentFor({
      threadId: '00000000-0000-4000-8000-000000000080',
      turnId,
      task: 'Original instruction.',
    });

    await expect(
      service.startFromAssistant(
        { userId },
        { commandId, issuedAt, mode: 'advanced', request: 'Changed instruction.' },
        context
      )
    ).rejects.toMatchObject({ code: 'ASSISTANT_CONTEXT_MISMATCH', status: 409 });
    expect(repo.applyTransition).not.toHaveBeenCalled();
  });

  it('ignores organization-shaped caller data and stores personal run ownership', async () => {
    const repo = repository();
    const service = createWorkflowCommandService({ repository: repo });
    const organizationId = 'org_commandtest123';
    await service.start(
      { userId, organizationId },
      {
        commandId,
        issuedAt,
        mode: 'advanced',
        request: 'Create an Estonia cat-food launch PRD.',
      }
    );

    expect(repo.resolveTenant).toHaveBeenCalledWith({ userId });
    expect(repo.applyTransition.mock.calls[0][2].event).toMatchObject({
      ownerUserId: userId,
      ownerOrganizationId: null,
      tenantId,
    });
  });

  it('returns only the tenant-scoped workflow list after resolving identity', async () => {
    const repo = repository();
    const service = createWorkflowCommandService({ repository: repo });
    await expect(service.list({ userId }, 25)).resolves.toEqual({
      workflows: [{ run: { id: commandId } }],
    });
    expect(repo.listSnapshots).toHaveBeenCalledWith(tenantId, 25);
  });

  it('fails readiness closed if Clerk identity configuration is absent', async () => {
    const repo = repository();
    const service = createWorkflowCommandService({
      repository: repo,
      identityConfigured: false,
    });
    await expect(service.ready()).rejects.toThrow('Clerk identity configuration is missing');
    expect(repo.readiness).not.toHaveBeenCalled();
  });

  it('reconstructs byte-equivalent events for a lost start response', async () => {
    const repo = repository();
    const service = createWorkflowCommandService({ repository: repo });
    const command = {
      commandId,
      issuedAt,
      mode: 'simple',
      request: 'Create an Estonia cat-food launch PRD.',
    };
    await service.start({ userId }, command);
    await service.start({ userId }, command);
    expect(repo.applyTransition.mock.calls[0][2]).toEqual(repo.applyTransition.mock.calls[1][2]);
  });

  it('reconstructs and adopts the exact V3 context event after a lost assistant start response', async () => {
    const repo = repository();
    repo.loadWorkflowEvent = vi.fn().mockResolvedValue(null);
    const service = createWorkflowCommandService({ repository: repo });
    const trustedContext = {
      request: compileScopeV3Envelope.input.request,
      assistantContext: compileScopeV3Envelope.input.assistantContext,
      executionAgent: executionAgentFor({
        threadId: compileScopeV3Envelope.input.assistantContext.threadId,
        turnId: compileScopeV3Envelope.input.assistantContext.currentTurnId,
        task: compileScopeV3Envelope.input.assistantContext.instruction.content,
      }),
    };
    const command = {
      commandId,
      issuedAt,
      mode: 'advanced',
      request: trustedContext.assistantContext.instruction.content,
    };

    await service.startFromAssistant({ userId }, command, trustedContext);
    const firstPlan = repo.applyTransition.mock.calls[0][2];
    repo.loadWorkflowEvent.mockResolvedValue({
      event: firstPlan.event,
      receipt: { eventId: commandId, idempotent: false },
    });

    await expect(
      service.startFromAssistant({ userId }, command, structuredClone(trustedContext))
    ).resolves.toMatchObject({ receipt: { idempotent: true } });
    expect(repo.applyTransition).toHaveBeenCalledTimes(1);
    expect(firstPlan.event.request).toBe(command.request);
    expect(firstPlan.event.inputPayload.request).toBe(trustedContext.request);
  });

  it('adopts an exact stored start but rejects changed command ID reuse', async () => {
    const repo = repository();
    repo.loadWorkflowEvent = vi.fn().mockResolvedValue(null);
    const service = createWorkflowCommandService({ repository: repo });
    const command = {
      commandId,
      issuedAt,
      mode: 'simple',
      request: 'Create an Estonia cat-food launch PRD.',
    };
    await service.start({ userId }, command);
    const storedEvent = repo.applyTransition.mock.calls[0][2].event;
    repo.loadWorkflowEvent.mockResolvedValue({
      event: storedEvent,
      receipt: { eventId: commandId, idempotent: false },
    });
    await expect(service.start({ userId }, command)).resolves.toMatchObject({
      receipt: { idempotent: true },
    });
    await expect(
      service.start(
        { userId },
        {
          ...command,
          request: 'Create a changed Estonia dog-food launch PRD.',
        }
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', status: 409 });
    expect(repo.applyTransition).toHaveBeenCalledTimes(1);
  });

  it('does not accept a browser-provided tenant field', async () => {
    const repo = repository();
    const service = createWorkflowCommandService({ repository: repo });
    await expect(
      service.start(
        { userId },
        {
          commandId,
          issuedAt,
          mode: 'simple',
          request: 'Create an Estonia cat-food launch PRD.',
          tenantId: '00000000-0000-4000-8000-000000000999',
        }
      )
    ).rejects.toMatchObject({ name: 'ZodError' });
    expect(repo.applyTransition).not.toHaveBeenCalled();
  });

  it('creates a valid same-stage attempt for a scope revision command', async () => {
    const repo = repository();
    const runId = '00000000-0000-4000-8000-000000000100';
    const compileStageId = '00000000-0000-4000-8000-000000000101';
    const gateStageId = '00000000-0000-4000-8000-000000000102';
    const request = 'Create an Estonia cat-food launch PRD.';
    const compileInput = {
      type: 'CompileScopeV2',
      request,
      objectiveOnlyContext: [],
      safeDefaults: {
        geography: [],
        acceptedSourceTypes: [],
        assumptions: [],
        limits: [],
        policies: [],
      },
    };
    const compileInputHash = canonicalHash(compileInput);
    const scopeArtifact = scopeCompletion.artifact;
    const scopeRef = {
      artifactId: scopeArtifact.artifactId,
      artifactHash: scopeArtifact.artifactHash,
      kind: scopeArtifact.kind,
    };
    const stage = (id, stageKey, kind, status, ordinal, values = {}) => ({
      id,
      stageKey,
      kind,
      status,
      rowVersion: values.rowVersion ?? 0,
      ordinal,
      inputHash: values.inputHash ?? null,
      outputArtifact: values.outputArtifact ?? null,
    });
    const snapshot = {
      run: {
        id: runId,
        tenantId,
        ownerUserId: userId,
        ownerOrganizationId: null,
        mode: 'simple',
        status: 'awaiting_gate_1',
        requestHash: sha256Hex(request),
        rowVersion: 2,
        evidenceReadiness: null,
        finalArtifact: null,
      },
      stages: [
        stage(compileStageId, 'compile-scope', 'compile_scope', 'completed', 0, {
          rowVersion: 2,
          inputHash: compileInputHash,
          outputArtifact: scopeRef,
        }),
        stage(gateStageId, 'gate-1', 'gate_1', 'awaiting_approval', 1, { rowVersion: 1 }),
        stage(
          '00000000-0000-4000-8000-000000000103',
          'execute-research',
          'execute_research',
          'pending',
          2
        ),
        stage('00000000-0000-4000-8000-000000000104', 'planning', 'planning', 'pending', 3),
        stage('00000000-0000-4000-8000-000000000105', 'gate-2', 'gate_2', 'pending', 4),
        stage('00000000-0000-4000-8000-000000000106', 'evaluation', 'evaluation', 'pending', 5),
        stage('00000000-0000-4000-8000-000000000107', 'synthesis', 'synthesis', 'pending', 6),
      ],
      attempts: [
        {
          id: '00000000-0000-4000-8000-000000000108',
          stageId: compileStageId,
          attemptNumber: 1,
          status: 'succeeded',
          operationId: '00000000-0000-4000-8000-000000000109',
          inputHash: compileInputHash,
          inputPayload: compileInput,
          rowVersion: 2,
          leaseToken: null,
          leaseExpiresAt: null,
        },
      ],
      dependencies: [],
      approvals: [],
    };
    repo.loadSnapshot.mockResolvedValue(snapshot);
    repo.loadArtifact.mockResolvedValue(scopeArtifact);
    const service = createWorkflowCommandService({ repository: repo });

    await expect(
      service.reviseScope({ userId }, runId, {
        type: 'revise_scope',
        commandId,
        issuedAt,
        acceptedScope: scopeRef,
        correction: 'Cover adult cats only.',
        idempotencyKey: 'revision-command-regression',
      })
    ).resolves.toMatchObject({ workflow: snapshot });

    const plan = repo.applyTransition.mock.calls[0][2];
    expect(plan.createAttempts[0]).toMatchObject({
      stageId: compileStageId,
      attemptNumber: 2,
      inputPayload: {
        type: 'ReviseScopeV2',
        acceptedScope: scopeRef,
        correction: 'Cover adult cats only.',
      },
    });
    expect(plan.event.nextAttempt).not.toHaveProperty('stageId');
  });
});
