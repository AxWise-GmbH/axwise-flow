import { describe, expect, it, vi } from 'vitest';
import {
  artifactContentHash,
  canonicalHash,
  sha256Hex,
} from '../../lib/workflow-v2/canonical.js';
import compileScopeV3Envelope from '../../shared/workflow-v2/fixtures/compile_scope_envelope_v3.json';
import { ArtifactFactSchema } from '../../shared/workflow-v2/contracts.js';
import {
  createResearchCompletion,
  createScopeCompletion,
} from '../../scripts/workflow-v2-local-e2e-fixtures.mjs';
import { createActivityExecutor } from './activity-executor.js';
import { AxWiseDispatchError } from './axwise-client.js';
import { createWorkerEngine } from './worker-engine.js';

const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const hash = (value) => String(value).repeat(64).slice(0, 64);
const occurredAt = '2026-08-27T12:00:00.000Z';
const leaseExpiresAt = '2026-08-27T12:10:00.000Z';
const ids = {
  tenant: id(1),
  run: id(2),
  stage: id(3),
  attempt: id(4),
  operation: id(5),
  lease: id(6),
  outbox: id(7),
};

function executionAgentFor(input) {
  return {
    schemaVersion: 'orqaly.execution-agent.v1',
    id: id(8),
    runId: ids.run,
    owner: { tenantId: ids.tenant, userId: 'user_workertest123' },
    lifetime: 'temporary',
    source: {
      threadId: input.assistantContext.threadId,
      turnId: input.assistantContext.currentTurnId,
      taskHash: sha256Hex(input.assistantContext.instruction.content),
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
}

function acceptedRequirement(category, description, priority = 'P1', authority = 'owner') {
  const semantic = { category, description, priority, authority };
  return { id: `req-${canonicalHash(semantic).slice(0, 16)}`, ...semantic };
}

function acceptanceCriterion(requirements) {
  const semantic = {
    given: 'The accepted scope and immutable research are available.',
    when: 'The requested artifact is evaluated.',
    then: 'Every accepted requirement is visibly satisfied or explicitly retained as a gap.',
    supports: requirements.map((requirement) => requirement.id).sort(),
  };
  return { id: `acc-${canonicalHash(semantic).slice(0, 16)}`, ...semantic };
}

function compileInput() {
  return {
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
  };
}

function scopePayload({
  deliverables = ['Market PRD'],
  artifactType = 'product_prd',
} = {}) {
  const request = 'Create an Estonia cat-food launch PRD.';
  const span = {
    start: 0,
    end: request.length,
    text: request,
    sha256: sha256Hex(request),
    offsetUnit: 'utf16_code_units',
  };
  const requirements = deliverables
    .map((description) => acceptedRequirement('deliverable', description, 'P0'))
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    schemaVersion: 'axwise.scope.v2',
    objective: request,
    objectiveSourceSpans: [span],
    topicAnchors: [{ value: 'Estonia cat food', sourceSpans: [span] }],
    geography: ['Estonia'],
    evidenceRequirements: [],
    deliverables,
    personas: [],
    interviewRequirements: [],
    prdRequirements: [],
    limits: [],
    policies: [],
    assumptions: [],
    deliverableProfile: {
      schemaVersion: 'axwise.deliverable-profile.v1',
      artifactType,
      domain: 'Estonia cat-food product planning',
      problem: 'Define a useful product without inventing market or launch authority.',
      desiredOutcome: 'A decision-ready, evidence-bounded product requirements document.',
      audiences: ['Product and launch team'],
      nonGoals: ['Authorizing launch without verified evidence'],
      requiredSections: [...deliverables].sort(),
    },
    requirements,
    acceptanceCriteria: [acceptanceCriterion(requirements)],
    materialClarification: null,
    researchInputHash: canonicalHash({ scope: 'accepted' }),
    authority: {
      canonicalInputHash: canonicalHash({ operation: 'compile' }),
      seal: 'worker-test-authority-seal-0000000000',
    },
  };
}

function researchInput() {
  return {
    type: 'ExecuteResearchV2',
    acceptedScope: {
      artifactId: id(80),
      artifactHash: hash('a'),
      kind: 'scope',
    },
    scope: scopePayload(),
    selectedEvidence: [],
  };
}

function snapshot({
  stageKind = 'compile_scope',
  stageStatus,
  attemptStatus,
  attemptNumber = 1,
  inputPayload = compileInput(),
}) {
  const inputHash = canonicalHash(inputPayload);
  return {
    run: {
      id: ids.run,
      tenantId: ids.tenant,
      ownerUserId: 'user_workertest123',
      mode: 'simple',
      status: 'running',
      requestHash: hash('a'),
      rowVersion: 1,
      evidenceReadiness: null,
      finalArtifact: null,
    },
    stages: [
      {
        id: ids.stage,
        stageKey: stageKind.replaceAll('_', '-'),
        kind: stageKind,
        status: stageStatus,
        rowVersion: stageStatus === 'queued' ? 0 : 1,
        ordinal: 10,
        inputHash,
        outputArtifact: null,
      },
    ],
    attempts: [
      {
        id: ids.attempt,
        stageId: ids.stage,
        attemptNumber,
        status: attemptStatus,
        operationId: ids.operation,
        inputHash,
        inputPayload,
        rowVersion: attemptStatus === 'queued' ? 1 : 2,
        leaseToken: ids.lease,
        leaseExpiresAt,
      },
    ],
    dependencies: [],
    approvals: [],
  };
}

function fixture({
  outcome,
  activityExecutor,
  stageKind = 'compile_scope',
  attemptNumber = 1,
  attemptStatus = 'queued',
  inputPayload = stageKind === 'execute_research' ? researchInput() : compileInput(),
  commandType = 'dispatch_activity',
  operationStatusUrl = null,
}) {
  const inputHash = canonicalHash(inputPayload);
  const queuedOrCurrent = snapshot({
    stageKind,
    stageStatus: attemptStatus === 'queued' ? 'queued' : attemptStatus,
    attemptStatus,
    attemptNumber,
    inputPayload,
  });
  const running = snapshot({
    stageKind,
    stageStatus: 'running',
    attemptStatus: 'running',
    attemptNumber,
    inputPayload,
  });
  const plans = [];
  const repository = {
    claimOutbox: vi.fn().mockResolvedValue({
      tenantId: ids.tenant,
      runId: ids.run,
      outboxId: ids.outbox,
      commandType,
      stageId: ids.stage,
      attemptId: ids.attempt,
      operationId: ids.operation,
      inputHash,
      leaseToken: ids.lease,
      leaseExpiresAt,
      deliveryCount: 1,
    }),
    loadWorkerSnapshot:
      attemptStatus === 'queued'
        ? vi.fn().mockResolvedValueOnce(queuedOrCurrent).mockResolvedValueOnce(running)
        : vi.fn().mockResolvedValue(queuedOrCurrent),
    loadActivityContext: vi.fn().mockResolvedValue({
      ownerUserId: 'user_workertest123',
      ownerOrganizationId: null,
      mode: 'simple',
      stageId: ids.stage,
      stageKind,
      attemptId: ids.attempt,
      attemptNumber,
      operationId: ids.operation,
      inputHash,
      inputPayload,
      operationStatusUrl,
      artifacts: [],
      agents: [],
    }),
    applyWorkerTransition: vi.fn(async (_tenantId, _runId, plan) => {
      plans.push(plan);
      return { eventId: plan.event.eventId, idempotent: false };
    }),
  };
  const engine = createWorkerEngine({
    repository,
    activityExecutor: activityExecutor || { execute: vi.fn().mockResolvedValue(outcome) },
    workerId: 'preview-worker-1',
    deploymentId: 'preview-worker-revision-42',
    clock: () => new Date(occurredAt),
  });
  return { engine, plans, repository, inputPayload, inputHash };
}

function artifactRef(artifactId, kind, artifactHash = hash(artifactId.slice(-1))) {
  return { artifactId, artifactHash, kind };
}

function selectedAgent() {
  return {
    id: id(90),
    name: 'Preview Product Researcher',
    capabilities: ['evidence_synthesis', 'prd', 'product_strategy'],
    toolIds: [],
    qualityScoreMicros: 950000,
    costPerRunCents: 20,
  };
}

function executionTask(stageId, stageKey, {
  taskKind = 'core_draft',
  requiredCapabilities = ['prd'],
  acceptanceRequirementIds = [acceptedRequirement('deliverable', 'Market PRD', 'P0').id],
  dependsOnStageKeys = [],
} = {}) {
  const agent = selectedAgent();
  const core = {
    stageId,
    stageKey,
    title: stageKey,
    taskKind,
    requiredRole: taskKind === 'core_draft' ? 'product specification author' : 'product strategy reviewer',
    lens: taskKind === 'core_draft' ? 'Produce the complete output contract.' : 'Review material defects.',
    requiredCapabilities,
    acceptanceRequirementIds,
    producesFullContract: taskKind === 'core_draft',
    dependsOnStageKeys,
    agent,
    agentId: agent.id,
    toolIds: [],
    budgetCents: agent.costPerRunCents,
    dataBoundary: [],
  };
  return { ...core, inputHash: canonicalHash(core) };
}

function outputContract(
  requiredSections = ['Product requirements document'],
  requirements = [acceptedRequirement('deliverable', 'Market PRD', 'P0')],
  artifactType = 'product_prd'
) {
  const acceptanceCriteria = [acceptanceCriterion(requirements)];
  return {
    format: 'text/markdown',
    artifactType,
    requiredSections: [...requiredSections].sort(),
    requirementIds: requirements.map((requirement) => requirement.id).sort(),
    rubric: ['Produce useful, traceable deliverable-specific decisions.'],
    acceptanceCriteria,
    evidenceReadiness: 'ready',
    launchReadyAllowed: artifactType === 'launch_authorization',
    sourceAppendixRequired: false,
  };
}

function artifactContent(artifact) {
  return {
    artifact: artifactRef(artifact.artifactId, artifact.kind, artifact.artifactHash),
    contentType: artifact.contentType,
    payload: artifact.payload,
    markdown: artifact.markdown,
  };
}

function finalArtifact(
  artifactId,
  sources,
  markdown = '# Final\n\nExact result.',
  { task = null } = {}
) {
  const payload = {
    schemaVersion: 'axwise.final-markdown.v1',
    title: 'Final result',
    markdown,
    sourceArtifacts: sources,
    sourceAppendix: [],
    candidateAttestation: task
      ? {
          task,
          requirementCoverage: task.acceptanceRequirementIds.map((requirementId) => ({
            requirementId,
            status: 'satisfied',
            note: 'Covered by the complete core artifact.',
          })),
          executionReceipt: {
            agent: task.agent,
            toolIds: task.toolIds,
            budgetCents: task.budgetCents,
            dataBoundary: task.dataBoundary,
          },
        }
      : null,
    evidenceReadiness: 'ready',
    launchReady: false,
  };
  const base = {
    artifactId,
    kind: 'final_markdown',
    contentType: 'text/markdown',
    payload,
    markdown,
    sourceArtifactIds: sources.map((source) => source.artifactId).sort(),
  };
  return ArtifactFactSchema.parse({ ...base, artifactHash: artifactContentHash(base) });
}

function taskResultArtifact(artifactId, task, { scopeRef, researchRef, planRef, sources }) {
  const markdown = `# ${task.title}\n\nBounded task result.`;
  const payload = {
    schemaVersion: 'orqaly.task-result.v2',
    task,
    acceptedScope: scopeRef,
    research: researchRef,
    acceptedPlan: planRef,
    title: task.title,
    markdown,
    evidenceReadiness: 'ready',
    sourceArtifacts: sources,
    requirementCoverage: task.acceptanceRequirementIds.map((requirementId) => ({
      requirementId,
      status: 'satisfied',
      note: 'Covered by the bounded task output.',
    })),
    sourceAppendix: [],
    executionReceipt: {
      agent: task.agent,
      toolIds: task.toolIds,
      budgetCents: task.budgetCents,
      dataBoundary: task.dataBoundary,
    },
    conclusions: ['Prepared the bounded task output.'],
    unknowns: [],
  };
  const base = {
    artifactId,
    kind: 'task_result',
    contentType: 'text/markdown',
    payload,
    markdown,
    sourceArtifactIds: sources.map((source) => source.artifactId).sort(),
  };
  return ArtifactFactSchema.parse({ ...base, artifactHash: artifactContentHash(base) });
}

function jsonArtifact(artifactId, kind, payload, sourceArtifactIds = []) {
  const base = {
    artifactId,
    kind,
    contentType: 'application/json',
    payload,
    markdown: null,
    sourceArtifactIds: [...sourceArtifactIds].sort(),
  };
  return ArtifactFactSchema.parse({ ...base, artifactHash: artifactContentHash(base) });
}

function contentRecord(artifactId, kind, payload) {
  const base = {
    artifactId,
    kind,
    contentType: 'application/json',
    payload,
    markdown: null,
    sourceArtifactIds: [],
  };
  return { ...base, artifactHash: artifactContentHash(base) };
}

function readyResearchArtifact(artifactId, scopeArtifact) {
  return jsonArtifact(
    artifactId,
    'research',
    {
      schemaVersion: 'axwise.research.v2',
      acceptedScopeArtifactId: scopeArtifact.artifactId,
      acceptedScopeHash: scopeArtifact.artifactHash,
      researchInputHash: scopeArtifact.payload.researchInputHash,
      readiness: 'ready',
      findings: [],
      boundedRepairPasses: 0,
      assumptions: [],
      gaps: [],
      conflicts: [],
      claimLedgerArtifactId: id(199),
      claimLedger: [],
      selectedClaims: [],
      sourceCatalogue: [],
    },
    [scopeArtifact.artifactId]
  );
}

function evaluationArtifact(
  artifactId,
  candidate,
  contract = outputContract(),
  specialistArtifacts = []
) {
  const candidateRef = artifactRef(
    candidate.artifactId,
    candidate.kind,
    candidate.artifactHash
  );
  const taskArtifacts = [
    ...specialistArtifacts.map((artifact) => artifactRef(
      artifact.artifactId, artifact.kind, artifact.artifactHash
    )),
    candidateRef,
  ].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  const sourceArtifacts = [
    ...candidate.payload.sourceArtifacts.filter((artifact) =>
      ['scope', 'research', 'plan'].includes(artifact.kind)
    ),
    ...taskArtifacts,
  ]
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  const payload = {
    schemaVersion: 'orqaly.evaluation.v1',
    taskArtifacts,
    sourceArtifacts,
    evidenceReadiness: 'ready',
    outputContractHash: canonicalHash(contract),
    repairPass: 0,
    outputContractSatisfied: true,
    promotedArtifact: candidateRef,
    unmetRequirementIds: [],
    unresolvedSourceMarkers: [],
    unsupportedPrecision: [],
    contradictions: [],
    staleTopicReferences: [],
    readinessViolations: [],
    substantiveContentDefects: [],
    practicalityDefects: [],
    repairRequired: false,
    repairInstructions: [],
    note: 'The accepted task artifact satisfies the exact final Markdown contract.',
  };
  const base = {
    artifactId,
    kind: 'evaluation',
    contentType: 'application/json',
    payload,
    markdown: null,
    sourceArtifactIds: sourceArtifacts.map((artifact) => artifact.artifactId).sort(),
  };
  return ArtifactFactSchema.parse({ ...base, artifactHash: artifactContentHash(base) });
}

describe('workflow v2 outbox worker', () => {
  it('skips a terminal recovery metadata result on every idle pass without loading activity context', async () => {
    const current = fixture({ outcome: { kind: 'deferred' } });
    current.repository.claimOutbox.mockResolvedValue(null);
    current.repository.listExpiredAttemptLeases = vi.fn().mockResolvedValue([{
      tenantId: ids.tenant, runId: ids.run, observedAt: occurredAt,
    }]);
    current.repository.loadWorkerSnapshot.mockReset().mockResolvedValue(null);
    for (let pass = 0; pass < 3; pass++)
      await expect(current.engine.processOne()).resolves.toEqual({ status: 'idle' });
    expect(current.repository.loadWorkerSnapshot).toHaveBeenCalledWith(ids.tenant, ids.run, { skipTerminal: true });
    expect(current.repository.loadActivityContext).not.toHaveBeenCalled();
    expect(current.repository.applyWorkerTransition).not.toHaveBeenCalled();
  });

  it.each([
    { kind: 'deferred', statusUrl: 'https://example.invalid/status', nextPollAt: leaseExpiresAt },
    { kind: 'failed', retryable: true, errorClass: 'UPSTREAM_RETRYABLE' },
    { kind: 'redispatch', redispatchAt: leaseExpiresAt, errorClass: 'NOT_FOUND' },
  ])('does not hydrate artifacts for remote $kind while retaining transition validation', async (outcome) => {
    const current = fixture({ outcome, commandType: 'poll_activity', attemptStatus: 'polling' });
    await expect(current.engine.processOne()).resolves.toMatchObject({ status: 'processed', outcome: outcome.kind });
    expect(current.repository.loadActivityContext).toHaveBeenCalledExactlyOnceWith(
      ids.tenant, ids.run, ids.attempt, { includeArtifacts: false, inputPayload: current.inputPayload }
    );
    if (outcome.kind === 'failed') {
      expect(current.plans[0].event.nextAttempt.inputPayload).toEqual(current.inputPayload);
      expect(current.plans[0].event.nextAttempt.inputHash).toBe(current.inputHash);
    }
  });

  it('does not report recovery when cancellation wins after the snapshot', async () => {
    const current = fixture({ outcome: { kind: 'deferred' }, attemptStatus: 'running' });
    current.repository.claimOutbox.mockResolvedValue(null);
    current.repository.listExpiredAttemptLeases = vi.fn().mockResolvedValue([{
      tenantId: ids.tenant, runId: ids.run, stageId: ids.stage, attemptId: ids.attempt,
      operationId: ids.operation, leaseToken: ids.lease, status: 'running',
      observedAt: '2026-08-27T12:11:00.000Z',
    }]);
    current.repository.applyWorkerTransition.mockResolvedValue({ skipped: true, reason: 'run_not_active' });
    await expect(current.engine.processOne()).resolves.toEqual({ status: 'idle' });
    expect(current.repository.loadActivityContext).not.toHaveBeenCalled();
  });
  it('normalizes an offset expired-lease observation before state-machine recovery', async () => {
    const inputPayload = compileInput();
    const workflowSnapshot = snapshot({
      stageKind: 'compile_scope',
      stageStatus: 'running',
      attemptStatus: 'running',
      inputPayload,
    });
    const offsetObservedAt = '2026-08-27T14:11:00+02:00';
    const normalizedObservedAt = '2026-08-27T12:11:00.000Z';
    const plans = [];
    const repository = {
      listExpiredAttemptLeases: vi.fn().mockResolvedValue([{
        tenantId: ids.tenant,
        runId: ids.run,
        stageId: ids.stage,
        attemptId: ids.attempt,
        operationId: ids.operation,
        leaseToken: ids.lease,
        status: 'running',
        observedAt: offsetObservedAt,
      }]),
      loadWorkerSnapshot: vi.fn().mockResolvedValue(workflowSnapshot),
      applyWorkerTransition: vi.fn(async (_tenantId, _runId, plan) => {
        plans.push(plan);
        return { idempotent: false };
      }),
    };
    const engine = createWorkerEngine({
      repository,
      activityExecutor: { execute: vi.fn() },
      workerId: 'preview-worker-1',
      deploymentId: 'preview-worker-revision-42',
      clock: () => new Date(occurredAt),
    });

    await expect(engine.processOne()).resolves.toMatchObject({
      status: 'recovered',
      attemptId: ids.attempt,
    });

    expect(plans).toHaveLength(1);
    expect(plans[0].event).toMatchObject({
      type: 'LeaseExpired',
      occurredAt: normalizedObservedAt,
      requeueAt: normalizedObservedAt,
    });
    expect(plans[0].outbox[0]).toMatchObject({
      commandType: 'dispatch_activity',
      attemptId: ids.attempt,
      operationId: ids.operation,
      availableAt: normalizedObservedAt,
    });
  });

  it('skips an inactive expired lease and continues to the ordinary outbox', async () => {
    const current = fixture({
      outcome: { kind: 'failed', retryable: false, errorClass: 'TEST_STOP' },
    });
    const inactiveSnapshot = snapshot({
      stageKind: 'compile_scope',
      stageStatus: 'running',
      attemptStatus: 'running',
      inputPayload: current.inputPayload,
    });
    inactiveSnapshot.run.status = 'completed';
    current.repository.listExpiredAttemptLeases = vi.fn().mockResolvedValue([{
      tenantId: ids.tenant,
      runId: ids.run,
      stageId: ids.stage,
      attemptId: ids.attempt,
      operationId: ids.operation,
      leaseToken: ids.lease,
      status: 'running',
      observedAt: occurredAt,
    }]);
    current.repository.loadWorkerSnapshot
      .mockReset()
      .mockResolvedValueOnce(inactiveSnapshot)
      .mockResolvedValueOnce(snapshot({
        stageKind: 'compile_scope',
        stageStatus: 'queued',
        attemptStatus: 'queued',
        inputPayload: current.inputPayload,
      }))
      .mockResolvedValueOnce(snapshot({
        stageKind: 'compile_scope',
        stageStatus: 'running',
        attemptStatus: 'running',
        inputPayload: current.inputPayload,
      }));

    await expect(current.engine.processOne()).resolves.toMatchObject({
      status: 'processed',
      outcome: 'failed',
    });

    expect(current.repository.claimOutbox).toHaveBeenCalledOnce();
    expect(current.plans).toHaveLength(2);
    expect(current.plans.map((plan) => plan.event.type)).toEqual([
      'ActivityStarted',
      'ActivityFailed',
    ]);
  });

  it('returns idle when an inactive expired lease is the only available work', async () => {
    const inactiveSnapshot = snapshot({
      stageKind: 'compile_scope',
      stageStatus: 'running',
      attemptStatus: 'running',
    });
    inactiveSnapshot.run.status = 'failed';
    const repository = {
      listExpiredAttemptLeases: vi.fn().mockResolvedValue([{
        tenantId: ids.tenant,
        runId: ids.run,
        stageId: ids.stage,
        attemptId: ids.attempt,
        operationId: ids.operation,
        leaseToken: ids.lease,
        status: 'running',
        observedAt: occurredAt,
      }]),
      loadWorkerSnapshot: vi.fn().mockResolvedValue(inactiveSnapshot),
      applyWorkerTransition: vi.fn(),
      claimOutbox: vi.fn().mockResolvedValue(null),
    };
    const engine = createWorkerEngine({
      repository,
      activityExecutor: { execute: vi.fn() },
      workerId: 'preview-worker-1',
      deploymentId: 'preview-worker-revision-42',
      clock: () => new Date(occurredAt),
    });

    await expect(engine.processOne()).resolves.toEqual({ status: 'idle' });

    expect(repository.claimOutbox).toHaveBeenCalledOnce();
    expect(repository.applyWorkerTransition).not.toHaveBeenCalled();
  });

  it('recovers an active expired lease after an older terminal lease', async () => {
    const terminalSnapshot = snapshot({
      stageKind: 'compile_scope',
      stageStatus: 'running',
      attemptStatus: 'running',
    });
    terminalSnapshot.run.status = 'completed_with_evidence_gaps';
    const activeSnapshot = snapshot({
      stageKind: 'compile_scope',
      stageStatus: 'running',
      attemptStatus: 'running',
    });
    const plans = [];
    const terminalLease = {
      tenantId: ids.tenant,
      runId: id(20),
      stageId: ids.stage,
      attemptId: id(21),
      operationId: id(22),
      leaseToken: id(23),
      status: 'running',
      observedAt: occurredAt,
    };
    terminalSnapshot.run.id = terminalLease.runId;
    terminalSnapshot.stages[0].id = terminalLease.stageId;
    terminalSnapshot.attempts[0] = {
      ...terminalSnapshot.attempts[0],
      id: terminalLease.attemptId,
      stageId: terminalLease.stageId,
      operationId: terminalLease.operationId,
      leaseToken: terminalLease.leaseToken,
    };
    const activeLease = {
      tenantId: ids.tenant,
      runId: ids.run,
      stageId: ids.stage,
      attemptId: ids.attempt,
      operationId: ids.operation,
      leaseToken: ids.lease,
      status: 'running',
      observedAt: '2026-08-27T12:11:00.000Z',
    };
    const repository = {
      listExpiredAttemptLeases: vi.fn().mockResolvedValue([terminalLease, activeLease]),
      loadWorkerSnapshot: vi.fn(async (_tenantId, runId) =>
        runId === terminalLease.runId ? terminalSnapshot : activeSnapshot
      ),
      applyWorkerTransition: vi.fn(async (_tenantId, _runId, plan) => {
        plans.push(plan);
        return { idempotent: false };
      }),
      claimOutbox: vi.fn(),
    };
    const engine = createWorkerEngine({
      repository,
      activityExecutor: { execute: vi.fn() },
      workerId: 'preview-worker-1',
      deploymentId: 'preview-worker-revision-42',
      clock: () => new Date(occurredAt),
    });

    await expect(engine.processOne()).resolves.toMatchObject({
      status: 'recovered',
      attemptId: ids.attempt,
    });

    expect(repository.loadWorkerSnapshot).toHaveBeenCalledTimes(2);
    expect(repository.applyWorkerTransition).toHaveBeenCalledOnce();
    expect(repository.claimOutbox).not.toHaveBeenCalled();
    expect(plans[0].event.type).toBe('LeaseExpired');
  });

  it('does not suppress RUN_NOT_ACTIVE for a nonterminal run', async () => {
    const awaitingSnapshot = snapshot({
      stageKind: 'compile_scope',
      stageStatus: 'running',
      attemptStatus: 'running',
    });
    awaitingSnapshot.run.status = 'awaiting_gate_1';
    const repository = {
      listExpiredAttemptLeases: vi.fn().mockResolvedValue([{
        tenantId: ids.tenant,
        runId: ids.run,
        stageId: ids.stage,
        attemptId: ids.attempt,
        operationId: ids.operation,
        leaseToken: ids.lease,
        status: 'running',
        observedAt: occurredAt,
      }]),
      loadWorkerSnapshot: vi.fn().mockResolvedValue(awaitingSnapshot),
      applyWorkerTransition: vi.fn(),
      claimOutbox: vi.fn(),
    };
    const engine = createWorkerEngine({
      repository,
      activityExecutor: { execute: vi.fn() },
      workerId: 'preview-worker-1',
      deploymentId: 'preview-worker-revision-42',
      clock: () => new Date(occurredAt),
    });

    await expect(engine.processOne()).rejects.toMatchObject({
      code: 'RUN_NOT_ACTIVE',
    });

    expect(repository.claimOutbox).not.toHaveBeenCalled();
    expect(repository.applyWorkerTransition).not.toHaveBeenCalled();
  });

  it('projects a strict research ArtifactFact to an ArtifactRef in the planning input', async () => {
    const compilePayload = structuredClone(compileScopeV3Envelope.input);
    const executionAgent = executionAgentFor(compilePayload);
    compilePayload.executionAgent = executionAgent;
    const compileInputHash = canonicalHash(compilePayload);
    const scopeArtifact = createScopeCompletion({
      inputHash: hash('c'),
      artifactId: id(130),
    }).artifact;
    const scopeRef = artifactRef(
      scopeArtifact.artifactId,
      scopeArtifact.kind,
      scopeArtifact.artifactHash
    );
    const inputPayload = {
      type: 'ExecuteResearchV2',
      executionAgent,
      acceptedScope: scopeRef,
      scope: scopeArtifact.payload,
      selectedEvidence: [],
    };
    const inputHash = canonicalHash(inputPayload);
    const result = createResearchCompletion({
      input: inputPayload,
      artifactId: id(131),
      claimLedgerArtifactId: id(132),
    });
    const planningStageId = id(133);
    const workflowSnapshot = {
      run: {
        id: ids.run,
        tenantId: ids.tenant,
        ownerUserId: 'user_workertest123',
        ownerOrganizationId: null,
        mode: 'simple',
        status: 'running',
        requestHash: hash('d'),
        rowVersion: 5,
        evidenceReadiness: null,
        finalArtifact: null,
      },
      stages: [
        {
          id: id(129), stageKey: 'compile-scope', kind: 'compile_scope', status: 'completed',
          rowVersion: 2, ordinal: 10, inputHash: compileInputHash, outputArtifact: scopeRef,
        },
        {
          id: ids.stage, stageKey: 'execute-research', kind: 'execute_research', status: 'running',
          rowVersion: 2, ordinal: 30, inputHash, outputArtifact: null,
        },
        {
          id: planningStageId, stageKey: 'planning', kind: 'planning', status: 'pending',
          rowVersion: 0, ordinal: 40, inputHash: null, outputArtifact: null,
        },
      ],
      attempts: [
        {
          id: id(128),
          stageId: id(129),
          attemptNumber: 1,
          status: 'succeeded',
          operationId: id(127),
          inputHash: compileInputHash,
          inputPayload: compilePayload,
          rowVersion: 2,
          leaseToken: null,
          leaseExpiresAt: null,
        },
        {
          id: ids.attempt,
          stageId: ids.stage,
          attemptNumber: 1,
          status: 'running',
          operationId: ids.operation,
          inputHash,
          inputPayload,
          rowVersion: 2,
          leaseToken: ids.lease,
          leaseExpiresAt,
        },
      ],
      dependencies: [],
      approvals: [],
    };
    const plans = [];
    const repository = {
      claimOutbox: vi.fn().mockResolvedValue({
        tenantId: ids.tenant,
        runId: ids.run,
        outboxId: ids.outbox,
        commandType: 'dispatch_activity',
        stageId: ids.stage,
        attemptId: ids.attempt,
        operationId: ids.operation,
        inputHash,
        leaseToken: ids.lease,
        leaseExpiresAt,
        deliveryCount: 1,
      }),
      loadWorkerSnapshot: vi.fn().mockResolvedValue(workflowSnapshot),
      loadActivityContext: vi.fn().mockResolvedValue({
        ownerUserId: 'user_workertest123',
        ownerOrganizationId: null,
        mode: 'simple',
        stageId: ids.stage,
        stageKind: 'execute_research',
        attemptId: ids.attempt,
        attemptNumber: 1,
        operationId: ids.operation,
        inputHash,
        inputPayload,
        operationStatusUrl: null,
        artifacts: [scopeArtifact],
        agents: [],
      }),
      applyWorkerTransition: vi.fn(async (_tenantId, _runId, plan) => {
        plans.push(plan);
        return { idempotent: false };
      }),
    };
    const engine = createWorkerEngine({
      repository,
      activityExecutor: { execute: vi.fn().mockResolvedValue({ kind: 'completed', result }) },
      workerId: 'preview-worker-1',
      deploymentId: 'preview-worker-revision-42',
      clock: () => new Date(occurredAt),
    });

    await engine.processOne();

    expect(plans).toHaveLength(1);
    const planningInput = plans[0].event.nextAttempts[0].inputPayload;
    expect(repository.loadActivityContext.mock.calls.map((call) => call[3])).toEqual([
      { includeArtifacts: false, inputPayload },
      { includeArtifacts: true, inputPayload },
    ]);
    expect(planningInput.research).toEqual({
      artifactId: result.artifact.artifactId,
      artifactHash: result.artifact.artifactHash,
      kind: 'research',
    });
    expect(planningInput.research).not.toHaveProperty('payload');
    expect(planningInput.executionAgent).toEqual(executionAgent);
    expect(plans[0].createAttempts[0]).toMatchObject({ stageId: planningStageId });
  });

  it('turns AxWise 202 into polling on the same attempt and operation', async () => {
    const statusUrl = `https://axwise.example/v2/operations/${ids.operation}?tenantId=${ids.tenant}`;
    const { engine, plans } = fixture({
      outcome: {
        kind: 'deferred',
        statusUrl,
        nextPollAt: '2026-08-27T12:00:05.000Z',
      },
    });
    await engine.processOne();
    expect(plans[0].event).toMatchObject({
      type: 'ActivityStarted',
      deploymentId: 'preview-worker-revision-42',
      attemptId: ids.attempt,
    });
    expect(plans[1].event).toMatchObject({
      type: 'ActivityDeferred',
      attemptId: ids.attempt,
      statusUrl,
    });
    expect(plans[1].createAttempts).toHaveLength(0);
    expect(plans[1].outbox[0]).toMatchObject({
      commandType: 'poll_activity',
      attemptId: ids.attempt,
      operationId: ids.operation,
    });
  });

  it('recovers an ambiguous lost POST by polling the same durable identity', async () => {
    const statusUrl = `https://axwise.example/v2/operations/${ids.operation}?tenantId=${ids.tenant}`;
    const { engine, plans } = fixture({
      outcome: {
        kind: 'ambiguous',
        statusUrl,
        nextPollAt: '2026-08-27T12:00:02.000Z',
        errorClass: 'AXWISE_NETWORK',
      },
    });

    await engine.processOne();
    expect(plans[1].event.type).toBe('ActivityDispatchAmbiguous');
    expect(plans[1].audit.payload.recovery).toBe('poll_same_operation');
    expect(plans[1].createAttempts).toHaveLength(0);
    expect(plans[1].outbox).toEqual([
      expect.objectContaining({
        commandType: 'poll_activity',
        attemptId: ids.attempt,
        operationId: ids.operation,
      }),
    ]);
  });

  it('turns poll 404 into same-envelope redispatch without a new attempt or operation', async () => {
    const operationStatusUrl = `https://axwise.example/v2/operations/${ids.operation}?tenantId=${ids.tenant}`;
    const axwiseClient = {
      poll: vi.fn().mockRejectedValue(
        new AxWiseDispatchError('not found', {
          retryable: true,
          errorClass: 'AXWISE_OPERATION_NOT_FOUND',
          status: 404,
          disposition: 'not_found',
        })
      ),
      submit: vi.fn(),
      deterministicStatusUrl: vi.fn(),
    };
    const activityExecutor = createActivityExecutor({
      axwiseClient,
      internalExecutor: { execute: vi.fn() },
    });
    const { engine, plans, inputHash } = fixture({
      activityExecutor,
      attemptStatus: 'polling',
      commandType: 'poll_activity',
      operationStatusUrl,
    });

    await engine.processOne();
    expect(axwiseClient.poll).toHaveBeenCalledWith(
      operationStatusUrl,
      ids.operation,
      ids.tenant
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].event.type).toBe('ActivityRedispatchRequested');
    expect(plans[0].createAttempts).toHaveLength(0);
    expect(plans[0].outbox).toEqual([
      expect.objectContaining({
        commandType: 'dispatch_activity',
        attemptId: ids.attempt,
        operationId: ids.operation,
        inputHash,
      }),
    ]);
  });

  it('turns an explicit AxWise 500 into attempt N+1 under the stable research stage', async () => {
    const axwiseClient = {
      submit: vi.fn().mockRejectedValue(
        new AxWiseDispatchError('explicit 500', {
          retryable: true,
          errorClass: 'AXWISE_HTTP_500',
          status: 500,
        })
      ),
      poll: vi.fn(),
      deterministicStatusUrl: vi.fn(),
    };
    const activityExecutor = createActivityExecutor({
      axwiseClient,
      internalExecutor: { execute: vi.fn() },
    });
    const { engine, plans, inputPayload, inputHash } = fixture({
      stageKind: 'execute_research',
      attemptNumber: 1,
      activityExecutor,
    });

    await engine.processOne();
    expect(axwiseClient.submit).toHaveBeenCalledOnce();
    expect(plans[1].event).toMatchObject({
      type: 'ActivityFailed',
      stageId: ids.stage,
      attemptId: ids.attempt,
      retryable: true,
      errorClass: 'AXWISE_HTTP_500',
    });
    expect(plans[1].createAttempts).toEqual([
      expect.objectContaining({
        stageId: ids.stage,
        attemptNumber: 2,
        inputHash,
        inputPayload,
      }),
    ]);
    expect(plans[1].createAttempts[0].id).not.toBe(ids.attempt);
    expect(plans[1].createAttempts[0].operationId).not.toBe(ids.operation);
  });

  it('turns a transition-rejected AxWise completion into a bounded N+1 attempt', async () => {
    const rejectedResult = createResearchCompletion({
      input: researchInput(),
      artifactId: id(140),
      claimLedgerArtifactId: id(141),
    });
    const { engine, plans, inputHash } = fixture({
      stageKind: 'compile_scope',
      outcome: { kind: 'completed', result: rejectedResult },
    });

    await expect(engine.processOne()).resolves.toMatchObject({
      status: 'processed',
      outcome: 'completed',
    });

    expect(plans).toHaveLength(2);
    expect(plans[1].event).toMatchObject({
      type: 'ActivityFailed',
      stageId: ids.stage,
      attemptId: ids.attempt,
      retryable: true,
      errorClass: 'AXWISE_RESULT_REJECTED_RESULT_STAGE_MISMATCH',
    });
    expect(plans[1].createAttempts).toEqual([
      expect.objectContaining({
        stageId: ids.stage,
        attemptNumber: 2,
        inputHash,
      }),
    ]);
    expect(plans[1].createAttempts[0].id).not.toBe(ids.attempt);
    expect(plans[1].createAttempts[0].operationId).not.toBe(ids.operation);
    expect(plans[1].outbox).toEqual([
      expect.objectContaining({
        commandType: 'dispatch_activity',
        attemptId: plans[1].createAttempts[0].id,
        operationId: plans[1].createAttempts[0].operationId,
      }),
    ]);
  });

  it('lets the state machine stop rejected completions at the retry limit', async () => {
    const rejectedResult = createResearchCompletion({
      input: researchInput(),
      artifactId: id(142),
      claimLedgerArtifactId: id(143),
    });
    const { engine, plans } = fixture({
      stageKind: 'compile_scope',
      attemptNumber: 3,
      outcome: { kind: 'completed', result: rejectedResult },
    });

    await engine.processOne();

    expect(plans[1].event).toMatchObject({
      type: 'ActivityFailed',
      retryable: true,
      errorClass: 'AXWISE_RESULT_REJECTED_RESULT_STAGE_MISMATCH',
    });
    expect(plans[1].createAttempts).toEqual([]);
    expect(plans[1].outbox).toEqual([]);
    expect(plans[1].runMutation.patch.status).toBe('failed');
  });

  it('does not reinterpret untyped completion errors as retryable transition failures', async () => {
    const { engine, plans } = fixture({
      stageKind: 'compile_scope',
      outcome: { kind: 'completed', result: { resultType: 'not-a-contract-result' } },
    });

    await expect(engine.processOne()).rejects.toThrow();
    expect(plans).toHaveLength(1);
    expect(plans[0].event.type).toBe('ActivityStarted');
  });

  it('keeps deployment rotation out of durable work identity', async () => {
    const first = fixture({
      outcome: { kind: 'failed', retryable: false, errorClass: 'TEST_STOP' },
    });
    await first.engine.processOne();
    const started = first.plans[0];
    expect(started.attemptMutations[0]).toMatchObject({
      id: ids.attempt,
      patch: { status: 'running', deployment_id: 'preview-worker-revision-42' },
    });
    expect(started.createAttempts).toHaveLength(0);
  });

  it('does not queue evaluation while another parallel execution stage is unfinished', async () => {
    const scopeRecord = contentRecord(id(100), 'scope', { fixture: 'scope' });
    const researchRecord = contentRecord(id(101), 'research', {
      fixture: 'research',
      sourceCatalogue: [],
    });
    const planRecord = contentRecord(id(102), 'plan', { fixture: 'plan' });
    const scopeRef = artifactRef(scopeRecord.artifactId, 'scope', scopeRecord.artifactHash);
    const researchRef = artifactRef(
      researchRecord.artifactId,
      'research',
      researchRecord.artifactHash
    );
    const planRef = artifactRef(planRecord.artifactId, 'plan', planRecord.artifactHash);
    const currentStageId = ids.stage;
    const siblingStageId = id(104);
    const evaluationStageId = id(105);
    const sourceArtifacts = [scopeRef, researchRef, planRef].sort((left, right) =>
      left.artifactId.localeCompare(right.artifactId)
    );
    const task = executionTask(currentStageId, 'parallel-a');
    const contract = outputContract();
    const inputPayload = {
      type: 'SynthesizeArtifactV1',
      purpose: 'execute_task',
      task,
      acceptedScope: scopeRef,
      research: researchRef,
      acceptedPlan: planRef,
      sourceArtifacts,
      artifactContents: [scopeRecord, researchRecord, planRecord]
        .sort((left, right) => left.artifactId.localeCompare(right.artifactId))
        .map(artifactContent),
      outputContract: contract,
      repairPass: 0,
    };
    const inputHash = canonicalHash(inputPayload);
    const resultArtifact = taskResultArtifact(id(106), task, {
      scopeRef,
      researchRef,
      planRef,
      sources: sourceArtifacts,
    });
    const workflowSnapshot = {
      run: {
        id: ids.run,
        tenantId: ids.tenant,
        ownerUserId: 'user_workertest123',
        mode: 'advanced',
        status: 'running',
        requestHash: hash('d'),
        rowVersion: 8,
        evidenceReadiness: 'ready',
        finalArtifact: null,
      },
      stages: [
        { id: id(107), stageKey: 'scope', kind: 'compile_scope', status: 'completed', rowVersion: 2, ordinal: 10, inputHash: hash('1'), outputArtifact: scopeRef },
        { id: id(108), stageKey: 'research', kind: 'execute_research', status: 'completed', rowVersion: 2, ordinal: 30, inputHash: hash('2'), outputArtifact: researchRef },
        { id: id(109), stageKey: 'plan', kind: 'planning', status: 'completed', rowVersion: 2, ordinal: 40, inputHash: hash('3'), outputArtifact: planRef },
        { id: currentStageId, stageKey: 'parallel-a', kind: 'execution', status: 'running', rowVersion: 3, ordinal: 100, inputHash, outputArtifact: null },
        { id: siblingStageId, stageKey: 'parallel-b', kind: 'execution', status: 'running', rowVersion: 3, ordinal: 101, inputHash: hash('4'), outputArtifact: null },
        { id: evaluationStageId, stageKey: 'evaluation', kind: 'evaluation', status: 'pending', rowVersion: 0, ordinal: 900, inputHash: null, outputArtifact: null },
      ],
      attempts: [
        {
          id: ids.attempt,
          stageId: currentStageId,
          attemptNumber: 1,
          status: 'running',
          operationId: ids.operation,
          inputHash,
          inputPayload,
          rowVersion: 2,
          leaseToken: ids.lease,
          leaseExpiresAt,
        },
      ],
      dependencies: [],
      approvals: [],
    };
    const plans = [];
    const repository = {
      claimOutbox: vi.fn().mockResolvedValue({
        tenantId: ids.tenant,
        runId: ids.run,
        outboxId: ids.outbox,
        commandType: 'dispatch_activity',
        stageId: currentStageId,
        attemptId: ids.attempt,
        operationId: ids.operation,
        inputHash,
        leaseToken: ids.lease,
        leaseExpiresAt,
        deliveryCount: 1,
      }),
      loadWorkerSnapshot: vi.fn().mockResolvedValue(workflowSnapshot),
      loadActivityContext: vi.fn().mockResolvedValue({
        ownerUserId: 'user_workertest123',
        ownerOrganizationId: null,
        mode: 'advanced',
        stageId: currentStageId,
        stageKind: 'execution',
        attemptId: ids.attempt,
        attemptNumber: 1,
        operationId: ids.operation,
        inputHash,
        inputPayload,
        operationStatusUrl: null,
        artifacts: [],
        agents: [],
      }),
      applyWorkerTransition: vi.fn(async (_tenantId, _runId, plan) => {
        plans.push(plan);
        return { idempotent: false };
      }),
    };
    const engine = createWorkerEngine({
      repository,
      activityExecutor: {
        execute: vi.fn().mockResolvedValue({
          kind: 'completed',
          result: {
            resultType: 'task_completed',
            artifact: resultArtifact,
            evidenceReadiness: 'ready',
          },
        }),
      },
      workerId: 'preview-worker-1',
      deploymentId: 'preview-worker-revision-42',
      clock: () => new Date(occurredAt),
    });

    await engine.processOne();
    expect(plans).toHaveLength(1);
    expect(plans[0].event.nextAttempts).toEqual([]);
    expect(plans[0].createAttempts).toEqual([]);
    expect(plans[0].outbox).toEqual([]);
    expect(plans[0].stageMutations).not.toContainEqual(
      expect.objectContaining({ id: evaluationStageId })
    );
  });

  it('queues the dependent core after both independent specialist artifacts exist', async () => {
    const scopeRecord = contentRecord(id(210), 'scope', { fixture: 'accepted scope' });
    const researchRecord = contentRecord(id(211), 'research', {
      fixture: 'ready research',
      sourceCatalogue: [],
    });
    const scopeRef = artifactRef(scopeRecord.artifactId, 'scope', scopeRecord.artifactHash);
    const researchRef = artifactRef(
      researchRecord.artifactId,
      'research',
      researchRecord.artifactHash
    );
    const requirements = [acceptedRequirement(
      'deliverable', 'Product requirements document', 'P0'
    )];
    const contract = outputContract(
      ['Product requirements document'], requirements, 'product_prd'
    );
    const product = executionTask(id(212), 'product-user-analysis', {
      taskKind: 'specialist_analysis',
      requiredCapabilities: ['product_strategy'],
      acceptanceRequirementIds: contract.requirementIds,
    });
    const evidence = executionTask(ids.stage, 'domain-evidence-analysis', {
      taskKind: 'specialist_analysis',
      requiredCapabilities: ['evidence_synthesis'],
      acceptanceRequirementIds: contract.requirementIds,
    });
    const core = executionTask(id(213), 'core-draft', {
      acceptanceRequirementIds: contract.requirementIds,
      dependsOnStageKeys: ['domain-evidence-analysis', 'product-user-analysis'],
    });
    const planCore = {
      schemaVersion: 'orqaly.plan.v2',
      acceptedScopeArtifact: scopeRef,
      researchArtifact: researchRef,
      workShape: 'product_prd',
      requirements,
      outputContract: contract,
      tasks: [product, evidence, core],
    };
    const planArtifact = jsonArtifact(
      id(214),
      'plan',
      { ...planCore, planHash: canonicalHash(planCore) },
      [scopeRef.artifactId, researchRef.artifactId]
    );
    const planRef = artifactRef(
      planArtifact.artifactId,
      planArtifact.kind,
      planArtifact.artifactHash
    );
    const specialistSources = [scopeRef, researchRef, planRef]
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    const evidenceInput = {
      type: 'SynthesizeArtifactV1',
      purpose: 'execute_task',
      task: evidence,
      acceptedScope: scopeRef,
      research: researchRef,
      acceptedPlan: planRef,
      sourceArtifacts: specialistSources,
      artifactContents: [scopeRecord, researchRecord, planArtifact]
        .sort((left, right) => left.artifactId.localeCompare(right.artifactId))
        .map(artifactContent),
      outputContract: contract,
      repairPass: 0,
    };
    const productResult = taskResultArtifact(id(215), product, {
      scopeRef,
      researchRef,
      planRef,
      sources: specialistSources,
    });
    const productRef = artifactRef(
      productResult.artifactId,
      productResult.kind,
      productResult.artifactHash
    );
    const evidenceResult = taskResultArtifact(id(220), evidence, {
      scopeRef,
      researchRef,
      planRef,
      sources: specialistSources,
    });
    const evidenceRef = artifactRef(
      evidenceResult.artifactId,
      evidenceResult.kind,
      evidenceResult.artifactHash
    );
    const inputHash = canonicalHash(evidenceInput);
    const workflowSnapshot = {
      run: {
        id: ids.run,
        tenantId: ids.tenant,
        ownerUserId: 'user_workertest123',
        mode: 'advanced',
        status: 'running',
        requestHash: hash('d'),
        rowVersion: 8,
        evidenceReadiness: 'ready',
        finalArtifact: null,
      },
      stages: [
        { id: id(216), stageKey: 'scope', kind: 'compile_scope', status: 'completed', rowVersion: 2, ordinal: 10, inputHash: hash('1'), outputArtifact: scopeRef },
        { id: id(217), stageKey: 'research', kind: 'execute_research', status: 'completed', rowVersion: 2, ordinal: 30, inputHash: hash('2'), outputArtifact: researchRef },
        { id: id(218), stageKey: 'plan', kind: 'planning', status: 'completed', rowVersion: 2, ordinal: 40, inputHash: hash('3'), outputArtifact: planRef },
        { id: product.stageId, stageKey: product.stageKey, kind: 'execution', status: 'completed', rowVersion: 3, ordinal: 100, inputHash: canonicalHash({ product: 'completed' }), outputArtifact: productRef },
        { id: evidence.stageId, stageKey: evidence.stageKey, kind: 'execution', status: 'running', rowVersion: 3, ordinal: 101, inputHash, outputArtifact: null },
        { id: core.stageId, stageKey: core.stageKey, kind: 'execution', status: 'pending', rowVersion: 0, ordinal: 102, inputHash: core.inputHash, outputArtifact: null },
        { id: id(219), stageKey: 'evaluation', kind: 'evaluation', status: 'pending', rowVersion: 0, ordinal: 900, inputHash: null, outputArtifact: null },
      ],
      attempts: [{
        id: ids.attempt,
        stageId: evidence.stageId,
        attemptNumber: 1,
        status: 'running',
        operationId: ids.operation,
        inputHash,
        inputPayload: evidenceInput,
        rowVersion: 2,
        leaseToken: ids.lease,
        leaseExpiresAt,
      }],
      dependencies: [
        { stageId: core.stageId, dependsOnStageId: product.stageId },
        { stageId: core.stageId, dependsOnStageId: evidence.stageId },
      ],
      approvals: [],
    };
    const plans = [];
    const repository = {
      claimOutbox: vi.fn().mockResolvedValue({
        tenantId: ids.tenant,
        runId: ids.run,
        outboxId: ids.outbox,
        commandType: 'dispatch_activity',
        stageId: evidence.stageId,
        attemptId: ids.attempt,
        operationId: ids.operation,
        inputHash,
        leaseToken: ids.lease,
        leaseExpiresAt,
        deliveryCount: 1,
      }),
      loadWorkerSnapshot: vi.fn().mockResolvedValue(workflowSnapshot),
      loadActivityContext: vi.fn().mockResolvedValue({
        ownerUserId: 'user_workertest123',
        ownerOrganizationId: null,
        mode: 'advanced',
        stageId: core.stageId,
        stageKind: 'execution',
        attemptId: ids.attempt,
        attemptNumber: 1,
        operationId: ids.operation,
        inputHash,
        inputPayload: evidenceInput,
        operationStatusUrl: null,
        artifacts: [scopeRecord, researchRecord, planArtifact, productResult],
        agents: [],
      }),
      applyWorkerTransition: vi.fn(async (_tenantId, _runId, plan) => {
        plans.push(plan);
        return { idempotent: false };
      }),
    };
    const engine = createWorkerEngine({
      repository,
      activityExecutor: {
        execute: vi.fn().mockResolvedValue({
          kind: 'completed',
          result: {
            resultType: 'task_completed',
            artifact: evidenceResult,
            evidenceReadiness: 'ready',
          },
        }),
      },
      workerId: 'preview-worker-1',
      deploymentId: 'preview-worker-revision-42',
      clock: () => new Date(occurredAt),
    });

    await engine.processOne();

    expect(plans).toHaveLength(1);
    expect(plans[0].createAttempts.map((created) => created.stageId)).toEqual([core.stageId]);
    expect(plans[0].createAttempts[0].inputPayload.sourceArtifacts).toEqual([
      scopeRef,
      researchRef,
      planRef,
      productRef,
      evidenceRef,
    ].sort((left, right) => left.artifactId.localeCompare(right.artifactId)));
  });

  it('derives synthesis requirements from the exact current scope despite stale scope history', async () => {
    const staleScopeArtifact = jsonArtifact(
      id(140), 'scope', scopePayload({
        deliverables: ['Stale historical section'], artifactType: 'general_artifact',
      })
    );
    const acceptedScopeArtifact = jsonArtifact(
      id(141), 'scope', scopePayload({
        deliverables: ['Current accepted section'], artifactType: 'general_artifact',
      })
    );
    const scopeRef = artifactRef(
      acceptedScopeArtifact.artifactId,
      acceptedScopeArtifact.kind,
      acceptedScopeArtifact.artifactHash
    );
    const acceptedResearchArtifact = readyResearchArtifact(id(142), acceptedScopeArtifact);
    const researchRef = artifactRef(
      acceptedResearchArtifact.artifactId,
      acceptedResearchArtifact.kind,
      acceptedResearchArtifact.artifactHash
    );
    const executionStageId = id(143);
    const evidenceStageId = id(153);
    const coreStageId = id(154);
    const evaluationStageId = ids.stage;
    const synthesisStageId = id(144);
    const requirements = acceptedScopeArtifact.payload.requirements;
    const contract = outputContract(
      ['Current accepted section'], requirements, 'general_artifact'
    );
    contract.acceptanceCriteria = acceptedScopeArtifact.payload.acceptanceCriteria;
    const productTask = executionTask(executionStageId, 'product-user-analysis', {
      taskKind: 'specialist_analysis',
      requiredCapabilities: ['product_strategy'],
      acceptanceRequirementIds: contract.requirementIds,
    });
    const evidenceTask = executionTask(evidenceStageId, 'domain-evidence-analysis', {
      taskKind: 'specialist_analysis',
      requiredCapabilities: ['evidence_synthesis'],
      acceptanceRequirementIds: contract.requirementIds,
    });
    const task = executionTask(coreStageId, 'core-current-section', {
      requiredCapabilities: ['evidence_synthesis'],
      acceptanceRequirementIds: contract.requirementIds,
      dependsOnStageKeys: ['domain-evidence-analysis', 'product-user-analysis'],
    });
    const planCore = {
      schemaVersion: 'orqaly.plan.v2',
      acceptedScopeArtifact: scopeRef,
      researchArtifact: researchRef,
      workShape: 'general_artifact',
      requirements,
      outputContract: contract,
      tasks: [productTask, evidenceTask, task],
    };
    const planArtifact = jsonArtifact(
      id(145),
      'plan',
      { ...planCore, planHash: canonicalHash(planCore) },
      [scopeRef.artifactId, researchRef.artifactId]
    );
    const planRef = artifactRef(
      planArtifact.artifactId,
      planArtifact.kind,
      planArtifact.artifactHash
    );
    const sources = [scopeRef, researchRef, planRef].sort((left, right) =>
      left.artifactId.localeCompare(right.artifactId)
    );
    const productArtifact = taskResultArtifact(id(146), productTask, {
      scopeRef,
      researchRef,
      planRef,
      sources,
    });
    const evidenceArtifact = taskResultArtifact(id(156), evidenceTask, {
      scopeRef,
      researchRef,
      planRef,
      sources,
    });
    const productRef = artifactRef(
      productArtifact.artifactId, productArtifact.kind, productArtifact.artifactHash
    );
    const evidenceRef = artifactRef(
      evidenceArtifact.artifactId, evidenceArtifact.kind, evidenceArtifact.artifactHash
    );
    const coreSources = [...sources, productRef, evidenceRef].sort((left, right) =>
      left.artifactId.localeCompare(right.artifactId)
    );
    const taskArtifact = taskResultArtifact(id(157), task, {
      scopeRef,
      researchRef,
      planRef,
      sources: coreSources,
    });
    const taskRef = artifactRef(
      taskArtifact.artifactId,
      taskArtifact.kind,
      taskArtifact.artifactHash
    );
    const taskRefs = [productRef, evidenceRef, taskRef].sort((left, right) =>
      left.artifactId.localeCompare(right.artifactId)
    );
    const evaluationSources = [scopeRef, researchRef, planRef, ...taskRefs]
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    const resultArtifact = jsonArtifact(
      id(147),
      'evaluation',
      {
        schemaVersion: 'orqaly.evaluation.v1',
        taskArtifacts: taskRefs,
        sourceArtifacts: evaluationSources,
        evidenceReadiness: 'ready',
        outputContractHash: canonicalHash(contract),
        repairPass: 0,
        outputContractSatisfied: false,
        promotedArtifact: null,
        unmetRequirementIds: contract.requirementIds,
        unresolvedSourceMarkers: [],
        unsupportedPrecision: [],
        contradictions: [],
        staleTopicReferences: [],
        readinessViolations: [],
        substantiveContentDefects: [],
        practicalityDefects: [],
        repairRequired: true,
        repairInstructions: ['Consolidate the exact current accepted section.'],
        note: 'Synthesis is required for the current accepted section.',
      },
      evaluationSources.map((artifact) => artifact.artifactId).sort()
    );
    const inputPayload = {
      type: 'SynthesizeArtifactV1',
      purpose: 'evaluate_output',
      acceptedScope: scopeRef,
      research: researchRef,
      acceptedPlan: planRef,
      taskArtifacts: taskRefs,
      sourceArtifacts: evaluationSources,
      artifactContents: [
        acceptedScopeArtifact,
        acceptedResearchArtifact,
        planArtifact,
        productArtifact,
        evidenceArtifact,
        taskArtifact,
      ]
        .sort((left, right) => left.artifactId.localeCompare(right.artifactId))
        .map(artifactContent),
      outputContract: contract,
      repairPass: 0,
    };
    const inputHash = canonicalHash(inputPayload);
    const acceptedResearchInput = {
      type: 'ExecuteResearchV2',
      acceptedScope: scopeRef,
      scope: acceptedScopeArtifact.payload,
      selectedEvidence: [],
    };
    const workflowSnapshot = {
      run: {
        id: ids.run,
        tenantId: ids.tenant,
        ownerUserId: 'user_workertest123',
        mode: 'advanced',
        status: 'running',
        requestHash: hash('d'),
        rowVersion: 9,
        evidenceReadiness: 'ready',
        finalArtifact: null,
      },
      stages: [
        { id: id(148), stageKey: 'compile-scope', kind: 'compile_scope', status: 'completed', rowVersion: 3, ordinal: 10, inputHash: hash('1'), outputArtifact: scopeRef },
        { id: id(149), stageKey: 'execute-research', kind: 'execute_research', status: 'completed', rowVersion: 2, ordinal: 30, inputHash: hash('2'), outputArtifact: researchRef },
        { id: id(150), stageKey: 'planning', kind: 'planning', status: 'completed', rowVersion: 2, ordinal: 40, inputHash: hash('3'), outputArtifact: planRef },
        { id: executionStageId, stageKey: productTask.stageKey, kind: 'execution', status: 'completed', rowVersion: 3, ordinal: 100, inputHash: hash('4'), outputArtifact: productRef },
        { id: evidenceStageId, stageKey: evidenceTask.stageKey, kind: 'execution', status: 'completed', rowVersion: 3, ordinal: 101, inputHash: hash('5'), outputArtifact: evidenceRef },
        { id: coreStageId, stageKey: task.stageKey, kind: 'execution', status: 'completed', rowVersion: 3, ordinal: 102, inputHash: hash('6'), outputArtifact: taskRef },
        { id: evaluationStageId, stageKey: 'evaluation', kind: 'evaluation', status: 'running', rowVersion: 3, ordinal: 900, inputHash, outputArtifact: null },
        { id: synthesisStageId, stageKey: 'synthesis', kind: 'synthesis', status: 'pending', rowVersion: 0, ordinal: 1000, inputHash: null, outputArtifact: null },
      ],
      attempts: [
        {
          id: id(151),
          stageId: id(149),
          attemptNumber: 1,
          status: 'succeeded',
          operationId: id(152),
          inputHash: canonicalHash(acceptedResearchInput),
          inputPayload: acceptedResearchInput,
          rowVersion: 3,
          leaseToken: null,
          leaseExpiresAt: null,
        },
        {
          id: ids.attempt,
          stageId: evaluationStageId,
          attemptNumber: 1,
          status: 'running',
          operationId: ids.operation,
          inputHash,
          inputPayload,
          rowVersion: 2,
          leaseToken: ids.lease,
          leaseExpiresAt,
        },
      ],
      dependencies: [],
      approvals: [],
    };
    const plans = [];
    const repository = {
      claimOutbox: vi.fn().mockResolvedValue({
        tenantId: ids.tenant,
        runId: ids.run,
        outboxId: ids.outbox,
        commandType: 'dispatch_activity',
        stageId: evaluationStageId,
        attemptId: ids.attempt,
        operationId: ids.operation,
        inputHash,
        leaseToken: ids.lease,
        leaseExpiresAt,
        deliveryCount: 1,
      }),
      loadWorkerSnapshot: vi.fn().mockResolvedValue(workflowSnapshot),
      loadActivityContext: vi.fn().mockResolvedValue({
        ownerUserId: 'user_workertest123',
        ownerOrganizationId: null,
        mode: 'advanced',
        stageId: evaluationStageId,
        stageKind: 'evaluation',
        attemptId: ids.attempt,
        attemptNumber: 1,
        operationId: ids.operation,
        inputHash,
        inputPayload,
        operationStatusUrl: null,
        artifacts: [
          staleScopeArtifact,
          acceptedScopeArtifact,
          acceptedResearchArtifact,
          planArtifact,
          productArtifact,
          evidenceArtifact,
          taskArtifact,
        ],
        agents: [],
      }),
      applyWorkerTransition: vi.fn(async (_tenantId, _runId, plan) => {
        plans.push(plan);
        return { idempotent: false };
      }),
    };
    const engine = createWorkerEngine({
      repository,
      activityExecutor: {
        execute: vi.fn().mockResolvedValue({
          kind: 'completed',
          result: {
            resultType: 'evaluation_completed',
            artifact: resultArtifact,
            executionOutputContractSatisfied: false,
            directPromotionArtifact: null,
          },
        }),
      },
      workerId: 'preview-worker-1',
      deploymentId: 'preview-worker-revision-42',
      clock: () => new Date(occurredAt),
    });

    await engine.processOne();

    expect(plans).toHaveLength(1);
    const synthesisInput = plans[0].createAttempts[0].inputPayload;
    expect(synthesisInput.acceptedScope).toEqual(scopeRef);
    expect(synthesisInput.outputContract.requiredSections).toEqual(['Current accepted section']);
    expect(synthesisInput.outputContract.requiredSections).not.toContain('Stale historical section');
  });

  it('finishes and exports a directly promoted execution artifact without a synthesis attempt', async () => {
    const acceptedScopePayload = scopePayload({
      deliverables: ['Product requirements document'],
    });
    const scopeRecord = contentRecord(id(150), 'scope', acceptedScopePayload);
    const researchRecord = contentRecord(id(151), 'research', {
      fixture: 'ready research',
      sourceCatalogue: [],
    });
    const scopeRef = artifactRef(
      scopeRecord.artifactId,
      'scope',
      scopeRecord.artifactHash
    );
    const researchRef = artifactRef(
      researchRecord.artifactId,
      'research',
      researchRecord.artifactHash
    );
    const productStageId = id(164);
    const evidenceStageId = id(165);
    const executionStageId = id(153);
    const evaluationStageId = ids.stage;
    const synthesisStageId = id(154);
    const requirements = acceptedScopePayload.requirements;
    const contract = outputContract(
      acceptedScopePayload.deliverableProfile.requiredSections,
      requirements,
      acceptedScopePayload.deliverableProfile.artifactType
    );
    expect(contract.acceptanceCriteria).toEqual(acceptedScopePayload.acceptanceCriteria);
    const productTask = executionTask(productStageId, 'product-user-analysis', {
      taskKind: 'specialist_analysis',
      requiredCapabilities: ['product_strategy'],
      acceptanceRequirementIds: contract.requirementIds,
    });
    const evidenceTask = executionTask(evidenceStageId, 'domain-evidence-analysis', {
      taskKind: 'specialist_analysis',
      requiredCapabilities: ['evidence_synthesis'],
      acceptanceRequirementIds: contract.requirementIds,
    });
    const task = executionTask(executionStageId, 'core-product-requirements', {
      acceptanceRequirementIds: contract.requirementIds,
      dependsOnStageKeys: ['domain-evidence-analysis', 'product-user-analysis'],
    });
    const planCore = {
      schemaVersion: 'orqaly.plan.v2',
      acceptedScopeArtifact: scopeRef,
      researchArtifact: researchRef,
      workShape: 'product_prd',
      requirements,
      outputContract: contract,
      tasks: [productTask, evidenceTask, task],
    };
    const planRecord = contentRecord(
      id(152), 'plan', { ...planCore, planHash: canonicalHash(planCore) }
    );
    const planRef = artifactRef(planRecord.artifactId, 'plan', planRecord.artifactHash);
    const specialistSources = [scopeRef, researchRef, planRef].sort((left, right) =>
      left.artifactId.localeCompare(right.artifactId)
    );
    const productArtifact = taskResultArtifact(id(166), productTask, {
      scopeRef,
      researchRef,
      planRef,
      sources: specialistSources,
    });
    const evidenceArtifact = taskResultArtifact(id(167), evidenceTask, {
      scopeRef,
      researchRef,
      planRef,
      sources: specialistSources,
    });
    const productRef = artifactRef(
      productArtifact.artifactId, productArtifact.kind, productArtifact.artifactHash
    );
    const evidenceRef = artifactRef(
      evidenceArtifact.artifactId, evidenceArtifact.kind, evidenceArtifact.artifactHash
    );
    const sources = [scopeRef, researchRef, planRef, productRef, evidenceRef].sort(
      (left, right) => left.artifactId.localeCompare(right.artifactId)
    );
    const candidate = finalArtifact(
      id(155),
      sources,
      '# Product requirements document\n\nComplete and evidence-ready.',
      { task }
    );
    const candidateRef = artifactRef(
      candidate.artifactId,
      candidate.kind,
      candidate.artifactHash
    );
    const inputPayload = {
      type: 'SynthesizeArtifactV1',
      purpose: 'evaluate_output',
      acceptedScope: scopeRef,
      research: researchRef,
      acceptedPlan: planRef,
      taskArtifacts: [productRef, evidenceRef, candidateRef]
        .sort((left, right) => left.artifactId.localeCompare(right.artifactId)),
      sourceArtifacts: [scopeRef, researchRef, planRef, productRef, evidenceRef, candidateRef]
        .sort((left, right) => left.artifactId.localeCompare(right.artifactId)),
      artifactContents: [
        scopeRecord,
        researchRecord,
        planRecord,
        productArtifact,
        evidenceArtifact,
        candidate,
      ]
        .sort((left, right) => left.artifactId.localeCompare(right.artifactId))
        .map(artifactContent),
      outputContract: contract,
      repairPass: 0,
    };
    const inputHash = canonicalHash(inputPayload);
    const resultArtifact = evaluationArtifact(
      id(156), candidate, contract, [productArtifact, evidenceArtifact]
    );
    const specialistInput = (specialistTask) => ({
      type: 'SynthesizeArtifactV1',
      purpose: 'execute_task',
      task: specialistTask,
      acceptedScope: scopeRef,
      research: researchRef,
      acceptedPlan: planRef,
      sourceArtifacts: specialistSources,
      artifactContents: [scopeRecord, researchRecord, planRecord]
        .sort((left, right) => left.artifactId.localeCompare(right.artifactId))
        .map(artifactContent),
      outputContract: contract,
      repairPass: 0,
    });
    const productInput = specialistInput(productTask);
    const evidenceInput = specialistInput(evidenceTask);
    const executionInput = {
      type: 'SynthesizeArtifactV1',
      purpose: 'execute_task',
      task,
      acceptedScope: scopeRef,
      research: researchRef,
      acceptedPlan: planRef,
      sourceArtifacts: sources,
      artifactContents: [
        scopeRecord,
        researchRecord,
        planRecord,
        productArtifact,
        evidenceArtifact,
      ]
        .sort((left, right) => left.artifactId.localeCompare(right.artifactId))
        .map(artifactContent),
      outputContract: contract,
      repairPass: 0,
    };
    const acceptedResearchInput = {
      type: 'ExecuteResearchV2',
      acceptedScope: scopeRef,
      scope: acceptedScopePayload,
      selectedEvidence: [],
    };
    const acceptedResearchInputHash = canonicalHash(acceptedResearchInput);
    const workflowSnapshot = {
      run: {
        id: ids.run,
        tenantId: ids.tenant,
        ownerUserId: 'user_workertest123',
        mode: 'simple',
        status: 'running',
        requestHash: hash('d'),
        rowVersion: 9,
        evidenceReadiness: 'ready',
        finalArtifact: null,
      },
      stages: [
        { id: id(157), stageKey: 'compile-scope', kind: 'compile_scope', status: 'completed', rowVersion: 2, ordinal: 10, inputHash: hash('1'), outputArtifact: scopeRef },
        { id: id(158), stageKey: 'execute-research', kind: 'execute_research', status: 'completed', rowVersion: 2, ordinal: 30, inputHash: hash('2'), outputArtifact: researchRef },
        { id: id(159), stageKey: 'planning', kind: 'planning', status: 'completed', rowVersion: 2, ordinal: 40, inputHash: hash('3'), outputArtifact: planRef },
        { id: productStageId, stageKey: productTask.stageKey, kind: 'execution', status: 'completed', rowVersion: 3, ordinal: 100, inputHash: canonicalHash(productInput), outputArtifact: productRef },
        { id: evidenceStageId, stageKey: evidenceTask.stageKey, kind: 'execution', status: 'completed', rowVersion: 3, ordinal: 101, inputHash: canonicalHash(evidenceInput), outputArtifact: evidenceRef },
        { id: executionStageId, stageKey: task.stageKey, kind: 'execution', status: 'completed', rowVersion: 3, ordinal: 102, inputHash: canonicalHash(executionInput), outputArtifact: candidateRef },
        { id: evaluationStageId, stageKey: 'evaluation', kind: 'evaluation', status: 'running', rowVersion: 3, ordinal: 900, inputHash, outputArtifact: null },
        { id: synthesisStageId, stageKey: 'synthesis', kind: 'synthesis', status: 'pending', rowVersion: 0, ordinal: 1000, inputHash: null, outputArtifact: null },
      ],
      attempts: [
        {
          id: id(160),
          stageId: id(158),
          attemptNumber: 1,
          status: 'succeeded',
          operationId: id(161),
          inputHash: acceptedResearchInputHash,
          inputPayload: acceptedResearchInput,
          rowVersion: 3,
          leaseToken: null,
          leaseExpiresAt: null,
        },
        {
          id: id(162),
          stageId: executionStageId,
          attemptNumber: 1,
          status: 'succeeded',
          operationId: id(163),
          inputHash: canonicalHash(executionInput),
          inputPayload: executionInput,
          rowVersion: 3,
          leaseToken: null,
          leaseExpiresAt: null,
        },
        {
          id: id(168),
          stageId: productStageId,
          attemptNumber: 1,
          status: 'succeeded',
          operationId: id(170),
          inputHash: canonicalHash(productInput),
          inputPayload: productInput,
          rowVersion: 3,
          leaseToken: null,
          leaseExpiresAt: null,
        },
        {
          id: id(169),
          stageId: evidenceStageId,
          attemptNumber: 1,
          status: 'succeeded',
          operationId: id(171),
          inputHash: canonicalHash(evidenceInput),
          inputPayload: evidenceInput,
          rowVersion: 3,
          leaseToken: null,
          leaseExpiresAt: null,
        },
        {
          id: ids.attempt,
          stageId: evaluationStageId,
          attemptNumber: 1,
          status: 'running',
          operationId: ids.operation,
          inputHash,
          inputPayload,
          rowVersion: 2,
          leaseToken: ids.lease,
          leaseExpiresAt,
        },
      ],
      dependencies: [
        { stageId: executionStageId, dependsOnStageId: productStageId },
        { stageId: executionStageId, dependsOnStageId: evidenceStageId },
      ],
      approvals: [],
    };
    const plans = [];
    const repository = {
      claimOutbox: vi.fn().mockResolvedValue({
        tenantId: ids.tenant,
        runId: ids.run,
        outboxId: ids.outbox,
        commandType: 'dispatch_activity',
        stageId: evaluationStageId,
        attemptId: ids.attempt,
        operationId: ids.operation,
        inputHash,
        leaseToken: ids.lease,
        leaseExpiresAt,
        deliveryCount: 1,
      }),
      loadWorkerSnapshot: vi.fn().mockResolvedValue(workflowSnapshot),
      loadActivityContext: vi.fn().mockResolvedValue({
        ownerUserId: 'user_workertest123',
        ownerOrganizationId: null,
        mode: 'simple',
        stageId: evaluationStageId,
        stageKind: 'evaluation',
        attemptId: ids.attempt,
        attemptNumber: 1,
        operationId: ids.operation,
        inputHash,
        inputPayload,
        operationStatusUrl: null,
        artifacts: [productArtifact, evidenceArtifact, candidate],
        agents: [],
      }),
      applyWorkerTransition: vi.fn(async (_tenantId, _runId, plan) => {
        plans.push(plan);
        return { idempotent: false };
      }),
    };
    const engine = createWorkerEngine({
      repository,
      activityExecutor: {
        execute: vi.fn().mockResolvedValue({
          kind: 'completed',
          result: {
            resultType: 'evaluation_completed',
            artifact: resultArtifact,
            executionOutputContractSatisfied: true,
            directPromotionArtifact: candidateRef,
          },
        }),
      },
      workerId: 'preview-worker-1',
      deploymentId: 'preview-worker-revision-42',
      clock: () => new Date(occurredAt),
    });

    await engine.processOne();

    expect(plans).toHaveLength(1);
    expect(plans[0].createAttempts).toEqual([]);
    expect(plans[0].runMutation.patch).toMatchObject({
      status: 'completed',
      final_artifact_id: candidate.artifactId,
    });
    expect(plans[0].outbox).toEqual([
      expect.objectContaining({
        commandType: 'export_final_artifact',
        artifact: candidateRef,
      }),
    ]);
    expect(plans[0].stageMutations).toContainEqual({
      id: synthesisStageId,
      expectedVersion: 0,
      patch: { status: 'cancelled' },
    });
  });

  it('acknowledges an exact immutable final export with the claimed lease', async () => {
    const artifact = finalArtifact(id(120), [artifactRef(id(121), 'scope', hash('e'))]);
    const exportClaim = {
      tenantId: ids.tenant,
      runId: ids.run,
      outboxId: ids.outbox,
      leaseToken: ids.lease,
      deliveryCount: 1,
      artifact: {
        artifactId: artifact.artifactId,
        artifactHash: artifact.artifactHash,
        kind: 'final_markdown',
      },
    };
    const repository = {
      claimExportOutbox: vi.fn().mockResolvedValue(exportClaim),
      loadArtifact: vi.fn().mockResolvedValue(artifact),
      acknowledgeExport: vi.fn().mockResolvedValue({ idempotent: false }),
    };
    const finalArtifactExporter = {
      exportFinalMarkdown: vi.fn().mockResolvedValue({ generation: '7', created: true }),
    };
    const engine = createWorkerEngine({
      repository,
      activityExecutor: {},
      finalArtifactExporter,
      workerId: 'preview-worker-1',
      deploymentId: 'preview-worker-revision-42',
      clock: () => new Date(occurredAt),
    });

    await expect(engine.processOne()).resolves.toMatchObject({ status: 'exported' });
    expect(finalArtifactExporter.exportFinalMarkdown).toHaveBeenCalledWith({
      tenantId: ids.tenant,
      runId: ids.run,
      artifact,
    });
    expect(repository.acknowledgeExport).toHaveBeenCalledWith({
      tenantId: ids.tenant,
      outboxId: ids.outbox,
      leaseToken: ids.lease,
      succeeded: true,
    });
  });

  it('nacks a failed final export with bounded backoff and the exact claimed lease', async () => {
    const artifact = finalArtifact(id(130), [artifactRef(id(131), 'scope', hash('f'))]);
    const repository = {
      claimExportOutbox: vi.fn().mockResolvedValue({
        tenantId: ids.tenant,
        runId: ids.run,
        outboxId: ids.outbox,
        leaseToken: ids.lease,
        deliveryCount: 3,
        artifact: {
          artifactId: artifact.artifactId,
          artifactHash: artifact.artifactHash,
          kind: 'final_markdown',
        },
      }),
      loadArtifact: vi.fn().mockResolvedValue(artifact),
      acknowledgeExport: vi.fn().mockResolvedValue({ idempotent: false }),
    };
    const finalArtifactExporter = {
      exportFinalMarkdown: vi.fn().mockRejectedValue(
        Object.assign(new Error('temporary GCS outage'), { code: 'GCS_UNAVAILABLE' })
      ),
    };
    const engine = createWorkerEngine({
      repository,
      activityExecutor: {},
      finalArtifactExporter,
      workerId: 'preview-worker-1',
      deploymentId: 'preview-worker-revision-42',
      clock: () => new Date(occurredAt),
    });

    await expect(engine.processOne()).resolves.toMatchObject({
      status: 'export_retry_scheduled',
      retryAt: '2026-08-27T12:00:08.000Z',
    });
    expect(repository.acknowledgeExport).toHaveBeenCalledWith({
      tenantId: ids.tenant,
      outboxId: ids.outbox,
      leaseToken: ids.lease,
      succeeded: false,
      retryAt: '2026-08-27T12:00:08.000Z',
      errorClass: 'GCS_UNAVAILABLE',
    });
  });

  it('refuses to export or acknowledge an artifact that differs from the outbox binding', async () => {
    const artifact = finalArtifact(id(140), [artifactRef(id(141), 'scope', hash('a'))]);
    const repository = {
      claimExportOutbox: vi.fn().mockResolvedValue({
        tenantId: ids.tenant,
        runId: ids.run,
        outboxId: ids.outbox,
        leaseToken: ids.lease,
        deliveryCount: 1,
        artifact: {
          artifactId: artifact.artifactId,
          artifactHash: hash('0'),
          kind: 'final_markdown',
        },
      }),
      loadArtifact: vi.fn().mockResolvedValue(artifact),
      acknowledgeExport: vi.fn(),
    };
    const finalArtifactExporter = { exportFinalMarkdown: vi.fn() };
    const engine = createWorkerEngine({
      repository,
      activityExecutor: {},
      finalArtifactExporter,
      workerId: 'preview-worker-1',
      deploymentId: 'preview-worker-revision-42',
      clock: () => new Date(occurredAt),
    });

    await expect(engine.processOne()).rejects.toThrow(
      'export outbox does not bind the exact final Markdown artifact'
    );
    expect(finalArtifactExporter.exportFinalMarkdown).not.toHaveBeenCalled();
    expect(repository.acknowledgeExport).not.toHaveBeenCalled();
  });
});
