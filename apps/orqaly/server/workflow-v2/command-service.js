import { canonicalHash, sha256Hex } from '../../lib/workflow-v2/canonical.js';
import { transition } from '../../lib/workflow-v2/state-machine.js';
import {
  ApproveArtifactCommandSchema,
  ReviseScopeCommandSchema,
  StartWorkflowCommandSchema,
} from '../../shared/workflow-v2/commands.js';
import {
  ArtifactFactSchema,
  CompileScopeInputV3Schema,
  ExecutionAgentContractV1Schema,
  PlanningResultSchema,
  ScopeArtifactV2Schema,
  PublicWorkflowSnapshotSchema,
} from '../../shared/workflow-v2/contracts.js';
import { isCapabilityWork } from '../../shared/workflow-v2/capability-work-primitives.js';
import { deterministicUuid, workflowIds } from './ids.js';

export class WorkflowCommandError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'WorkflowCommandError';
    this.code = code;
    this.status = status;
  }
}

function requireSnapshot(snapshot) {
  if (!snapshot) throw new WorkflowCommandError('RUN_NOT_FOUND', 'workflow run not found', 404);
  return snapshot;
}

function stageByKind(snapshot, kind) {
  const stage = snapshot.stages.find((candidate) => candidate.kind === kind);
  if (!stage) throw new WorkflowCommandError('STAGE_NOT_FOUND', `${kind} stage not found`, 409);
  return stage;
}

function executionAgentFromSnapshot(snapshot) {
  const compileStage = stageByKind(snapshot, 'compile_scope');
  const compileAttempts = snapshot.attempts
    .filter(
      (attempt) =>
        attempt.stageId === compileStage.id && attempt.inputPayload?.type === 'CompileScopeV3'
    )
    .sort((left, right) => left.attemptNumber - right.attemptNumber);
  const rawExecutionAgent = compileAttempts[0]?.inputPayload?.executionAgent;
  const postRootTypes = new Set([
    'ReviseScopeV2',
    'ExecuteResearchV2',
    'OrqalyPlanV2',
    'SynthesizeArtifactV1',
  ]);
  const postRootAttempts = snapshot.attempts.filter((attempt) =>
    postRootTypes.has(attempt.inputPayload?.type)
  );
  const boundContracts = postRootAttempts
    .map((attempt) => attempt.inputPayload?.executionAgent)
    .filter(Boolean);
  if (!rawExecutionAgent) {
    if (boundContracts.length) {
      throw new WorkflowCommandError(
        'EXECUTION_AGENT_BINDING_MISMATCH',
        'stage execution Agent exists without an initial Goal binding',
        409
      );
    }
    return undefined;
  }
  const parsed = ExecutionAgentContractV1Schema.safeParse(rawExecutionAgent);
  if (
    !parsed.success ||
    parsed.data.runId !== snapshot.run.id ||
    postRootAttempts.some((attempt) => !attempt.inputPayload.executionAgent) ||
    boundContracts.some((candidate) => canonicalHash(candidate) !== canonicalHash(parsed.data))
  ) {
    throw new WorkflowCommandError(
      'EXECUTION_AGENT_BINDING_MISMATCH',
      'all Goal stages must retain the initial execution Agent contract',
      409
    );
  }
  return parsed.data;
}

function executionAgentField(executionAgent) {
  return executionAgent ? { executionAgent } : {};
}

function nextAttempt(commandId, stage, inputPayload, attemptNumber = 1) {
  return {
    stageId: stage.id,
    attemptId: deterministicUuid(commandId, stage.id, 'attempt', String(attemptNumber)),
    operationId: deterministicUuid(commandId, stage.id, 'operation', String(attemptNumber)),
    inputHash: canonicalHash(inputPayload),
    inputPayload,
  };
}

function exactArtifact(record, expected) {
  if (
    !record ||
    record.artifactId !== expected.artifactId ||
    record.artifactHash !== expected.artifactHash ||
    record.kind !== expected.kind
  ) {
    throw new WorkflowCommandError(
      'ARTIFACT_HASH_MISMATCH',
      'command must bind the exact immutable artifact',
      409
    );
  }
  ArtifactFactSchema.parse({
    artifactId: record.artifactId,
    artifactHash: record.artifactHash,
    kind: record.kind,
    contentType: record.contentType,
    payload: record.payload,
    markdown: record.markdown,
    sourceArtifactIds: record.sourceArtifactIds || [],
  });
  return record;
}

function artifactContent(record, reference) {
  exactArtifact(record, reference);
  return {
    artifact: reference,
    contentType: record.contentType,
    payload: record.payload,
    markdown: record.markdown,
  };
}

function workflowTitle(request) {
  const normalized = typeof request === 'string' ? request.replace(/\s+/gu, ' ').trim() : '';
  if (!normalized) return 'Untitled goal';
  const characters = Array.from(normalized);
  return characters.length > 120 ? `${characters.slice(0, 119).join('')}…` : normalized;
}

function uniqueStrings(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .filter((value) => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ].sort((left, right) => left.localeCompare(right));
}

const STAGE_LABELS = {
  compile_scope: 'Scope',
  gate_1: 'Scope approval',
  execute_research: 'Research',
  planning: 'Plan',
  gate_2: 'Plan approval',
  execution: 'Execution',
  evaluation: 'Evaluation',
  synthesis: 'Finalization',
};

function emptySafeDefaults() {
  return {
    geography: [],
    acceptedSourceTypes: [],
    assumptions: [],
    limits: [],
    policies: [],
  };
}

function activityDescription(eventType, stage) {
  const stageLabel = stage || 'Workflow';
  switch (eventType) {
    case 'RunRequested':
      return { kind: 'workflow_started', label: 'Goal started' };
    case 'ScopeRevisionRequested':
      return { kind: 'scope_revised', label: 'Scope revision requested' };
    case 'ActivityStarted':
      return { kind: 'stage_started', label: `${stageLabel} started` };
    case 'ActivityDeferred':
      return { kind: 'stage_deferred', label: `${stageLabel} paused for retry` };
    case 'ActivityDispatchAmbiguous':
    case 'ActivityRedispatchRequested':
    case 'LeaseExpired':
      return { kind: 'stage_recovery', label: `${stageLabel} recovery scheduled` };
    case 'ActivityCompleted':
      return { kind: 'stage_completed', label: `${stageLabel} completed` };
    case 'ActivityFailed':
      return { kind: 'stage_failed', label: `${stageLabel} needs attention` };
    case 'ApprovalGranted':
      return { kind: 'approval_granted', label: 'Approval granted' };
    default:
      return { kind: 'workflow_activity', label: 'Workflow updated' };
  }
}

function notificationFor(workflow) {
  const common = {
    id: `${workflow.id}:${workflow.status}`,
    runId: workflow.id,
    occurredAt: workflow.updatedAt,
  };
  if (workflow.status === 'awaiting_gate_1') {
    return {
      ...common,
      kind: 'approval_required',
      severity: 'action',
      title: 'Scope approval required',
      message: `${workflow.title} is waiting for scope approval.`,
    };
  }
  if (workflow.status === 'awaiting_gate_2') {
    return {
      ...common,
      kind: 'approval_required',
      severity: 'action',
      title: 'Plan approval required',
      message: `${workflow.title} is waiting for plan approval.`,
    };
  }
  if (workflow.status === 'blocked') {
    return {
      ...common,
      kind: 'run_blocked',
      severity: 'warning',
      title: 'Goal is blocked',
      message: `${workflow.title} needs attention before it can continue.`,
    };
  }
  if (workflow.status === 'failed') {
    return {
      ...common,
      kind: 'run_failed',
      severity: 'error',
      title: 'Goal failed',
      message: `${workflow.title} did not complete.`,
    };
  }
  if (workflow.status === 'completed_with_evidence_gaps') {
    return {
      ...common,
      kind: 'evidence_gaps',
      severity: 'warning',
      title: 'Result has evidence gaps',
      message: `${workflow.title} completed with evidence gaps.`,
    };
  }
  return null;
}

export function createWorkflowCommandService({ repository, identityConfigured = true }) {
  async function identity(auth) {
    if (!auth?.userId) throw new WorkflowCommandError('UNAUTHENTICATED', 'sign-in required', 401);
    const tenantId = await repository.resolveTenant({ userId: auth.userId });
    if (!tenantId)
      throw new WorkflowCommandError('TENANT_NOT_BOUND', 'identity has no tenant', 403);
    return { tenantId, userId: auth.userId };
  }

  async function ready() {
    if (!identityConfigured) throw new Error('Clerk identity configuration is missing');
    return repository.readiness();
  }

  async function session(auth) {
    const owner = await identity(auth);
    return { userId: owner.userId, tenantBound: true };
  }

  async function workspace(auth) {
    const owner = await identity(auth);
    const projection = await repository.loadWorkspaceProjection(owner.tenantId);
    if (!projection) {
      throw new WorkflowCommandError('WORKSPACE_NOT_FOUND', 'workspace not found', 404);
    }
    const agents = projection.agents
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        status: agent.status,
        capabilities: uniqueStrings(agent.capabilities),
        toolIds: uniqueStrings(agent.toolIds),
        updatedAt: agent.updatedAt,
      }))
      .sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
      );
    const activeAgents = agents.filter((agent) => agent.status === 'active');
    const capabilityAgents = new Map();
    const toolIds = new Set();
    for (const agent of activeAgents) {
      for (const capability of agent.capabilities) {
        capabilityAgents.set(capability, (capabilityAgents.get(capability) || 0) + 1);
      }
      for (const toolId of agent.toolIds) toolIds.add(toolId);
    }
    const capabilities = [...capabilityAgents.entries()]
      .map(([name, agentCount]) => ({ name, agentCount }))
      .sort((left, right) => left.name.localeCompare(right.name));
    return {
      workspace: {
        displayName: projection.displayName,
        status: projection.status,
        agentCount: agents.length,
        activeAgentCount: activeAgents.length,
        capabilityCount: capabilities.length,
        toolCount: toolIds.size,
      },
      agents,
      capabilities,
    };
  }

  async function overview(auth, limit = 25) {
    const owner = await identity(auth);
    const projection = await repository.loadOverviewProjection(owner.tenantId, limit, { capabilityOwnerUserId: owner.userId });
    const workflows = projection.workflows
      .map((workflow) => ({
        id: workflow.id,
        title: workflowTitle(workflow.workProfile?.purpose || workflow.request),
        ...(workflow.workProfile ? { workProfile: workflow.workProfile } : {}),
        mode: workflow.mode,
        status: workflow.status,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
        evidenceReadiness: workflow.evidenceReadiness,
        progress: {
          completedStages: Number(workflow.completedStages || 0),
          totalStages: Number(workflow.totalStages || 0),
        },
        pendingApproval:
          workflow.status === 'awaiting_gate_1'
            ? 'scope'
            : workflow.status === 'awaiting_gate_2'
              ? 'plan'
              : null,
        finalArtifact: workflow.finalArtifact
          ? {
              artifactId: workflow.finalArtifact.artifactId,
              artifactHash: workflow.finalArtifact.artifactHash,
              kind: workflow.finalArtifact.kind,
            }
          : null,
      }))
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id)
      );
    const results = workflows
      .filter(
        (workflow) =>
          workflow.finalArtifact &&
          ['completed', 'completed_with_evidence_gaps'].includes(workflow.status)
      )
      .map((workflow) => ({
        runId: workflow.id,
        title: workflow.title,
        status: workflow.status,
        completedAt: workflow.updatedAt,
        evidenceReadiness: workflow.evidenceReadiness,
        artifact: workflow.finalArtifact,
      }));
    const notifications = workflows.map(notificationFor).filter(Boolean);
    return {
      counts: {
        total: Number(projection.counts.total || 0),
        active: Number(projection.counts.active || 0),
        awaitingApproval: Number(projection.counts.awaitingApproval || 0),
        completed: Number(projection.counts.completed || 0),
        attention: Number(projection.counts.attention || 0),
      },
      workflows,
      results,
      notifications,
    };
  }

  async function activity(auth, limit = 50) {
    const owner = await identity(auth);
    const events = await repository.loadActivityProjection(owner.tenantId, limit, { capabilityOwnerUserId: owner.userId });
    return {
      activities: events
        .map((event) => {
          const stage = STAGE_LABELS[event.stageKind] || null;
          return {
            id: event.id,
            runId: event.runId,
            workflowTitle: workflowTitle(event.request),
            ...activityDescription(event.eventType, stage),
            stage,
            occurredAt: event.occurredAt,
          };
        })
        .sort(
          (left, right) =>
            right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id)
        ),
    };
  }

  async function startWithCompileInput(auth, command, compileInput) {
    const owner = await identity(auth);
    const ids = workflowIds(owner.tenantId, command.commandId);
    if (
      compileInput.executionAgent &&
      (compileInput.executionAgent.runId !== ids.runId ||
        compileInput.executionAgent.owner.tenantId !== owner.tenantId ||
        compileInput.executionAgent.owner.userId !== owner.userId)
    ) {
      throw new WorkflowCommandError(
        'EXECUTION_AGENT_OWNER_MISMATCH',
        'delegated Agent must bind the exact Workflow run and personal owner',
        409
      );
    }
    const requestHash = sha256Hex(command.request);
    const inputHash = canonicalHash(compileInput);
    const event = {
      type: 'RunRequested',
      eventId: command.commandId,
      tenantId: owner.tenantId,
      runId: ids.runId,
      occurredAt: command.issuedAt,
      ownerUserId: owner.userId,
      ownerOrganizationId: null,
      mode: command.mode,
      request: command.request,
      requestHash,
      stageIds: ids.stageIds,
      attemptId: ids.attemptId,
      operationId: ids.operationId,
      inputHash,
      inputPayload: compileInput,
    };
    const initialSnapshot = {
      run: {
        id: ids.runId,
        tenantId: owner.tenantId,
        ownerUserId: owner.userId,
        ownerOrganizationId: null,
        mode: command.mode,
        status: 'requested',
        requestHash,
        rowVersion: 0,
        evidenceReadiness: null,
        finalArtifact: null,
      },
      stages: [],
      attempts: [],
      dependencies: [],
      approvals: [],
    };
    const adoptExisting = async (existing) => {
      if (!existing || canonicalHash(existing.event) !== canonicalHash(event)) {
        throw new WorkflowCommandError(
          'IDEMPOTENCY_CONFLICT',
          'start command ID was reused with changed input',
          409
        );
      }
      return {
        receipt: { ...existing.receipt, idempotent: true },
        workflow: requireSnapshot(await repository.loadSnapshot(owner.tenantId, ids.runId)),
      };
    };
    const existing = await repository.loadWorkflowEvent?.(
      owner.tenantId,
      ids.runId,
      command.commandId
    );
    if (existing) return adoptExisting(existing);
    let receipt;
    try {
      receipt = await repository.applyTransition(
        owner.tenantId,
        ids.runId,
        transition(initialSnapshot, event)
      );
    } catch (error) {
      if (!['23505', '40001'].includes(error.code) || !repository.loadWorkflowEvent) {
        throw error;
      }
      return adoptExisting(
        await repository.loadWorkflowEvent(owner.tenantId, ids.runId, command.commandId)
      );
    }
    return {
      receipt,
      workflow: await repository.loadSnapshot(owner.tenantId, ids.runId),
    };
  }

  async function start(auth, rawCommand) {
    const command = StartWorkflowCommandSchema.parse(rawCommand);
    return startWithCompileInput(auth, command, {
      type: 'CompileScopeV2',
      request: command.request,
      objectiveOnlyContext: [],
      safeDefaults: emptySafeDefaults(),
    });
  }

  async function startFromAssistant(auth, rawCommand, trustedContext) {
    const command = StartWorkflowCommandSchema.parse(rawCommand);
    if (!trustedContext?.executionAgent) {
      throw new WorkflowCommandError(
        'EXECUTION_AGENT_REQUIRED',
        'Assistant-delegated Goals require an execution Agent contract',
        400
      );
    }
    const compileInput = CompileScopeInputV3Schema.parse({
      type: 'CompileScopeV3',
      request: trustedContext?.request,
      assistantContext: trustedContext?.assistantContext,
      executionAgent: trustedContext.executionAgent,
      objectiveOnlyContext: [],
      safeDefaults: emptySafeDefaults(),
    });
    if (compileInput.assistantContext.instruction.content !== command.request) {
      throw new WorkflowCommandError(
        'ASSISTANT_CONTEXT_MISMATCH',
        'assistant context must bind the exact Goal instruction',
        409
      );
    }
    return startWithCompileInput(auth, command, compileInput);
  }

  async function read(auth, runId) {
    const owner = await identity(auth);
    const snapshot = requireSnapshot(await repository.loadSnapshot(owner.tenantId, runId));
    if (isCapabilityWork(snapshot.run)) {
      if (snapshot.run.ownerUserId !== owner.userId) throw new WorkflowCommandError('RUN_NOT_FOUND', 'workflow run not found', 404);
      return PublicWorkflowSnapshotSchema.parse({ ...snapshot, attempts: [] });
    }
    return snapshot;
  }

  async function list(auth, limit = 25) {
    const owner = await identity(auth);
    const workflows = await repository.listSnapshots(owner.tenantId, limit);
    return { workflows: workflows.filter((snapshot) => !isCapabilityWork(snapshot.run) || snapshot.run.ownerUserId === owner.userId)
      .map((snapshot) => isCapabilityWork(snapshot.run) ? PublicWorkflowSnapshotSchema.parse({ ...snapshot, attempts: [] }) : snapshot) };
  }

  async function artifact(auth, runId, artifactId) {
    const owner = await identity(auth);
    const result = await repository.loadArtifact(owner.tenantId, runId, artifactId, { capabilityOwnerUserId: owner.userId });
    if (!result) throw new WorkflowCommandError('ARTIFACT_NOT_FOUND', 'artifact not found', 404);
    return result;
  }

  async function approve(auth, runId, rawCommand) {
    const command = ApproveArtifactCommandSchema.parse(rawCommand);
    const owner = await identity(auth);
    const snapshot = requireSnapshot(await repository.loadSnapshot(owner.tenantId, runId));
    const executionAgent = executionAgentFromSnapshot(snapshot);
    const gateKind = command.approvalKind === 'scope' ? 'gate_1' : 'gate_2';
    const producerKind = command.approvalKind === 'scope' ? 'compile_scope' : 'planning';
    const gate = stageByKind(snapshot, gateKind);
    const producer = stageByKind(snapshot, producerKind);
    const artifactRecord = await repository.loadArtifact(
      owner.tenantId,
      runId,
      command.artifact.artifactId
    );
    if (!artifactRecord) {
      throw new WorkflowCommandError('ARTIFACT_NOT_FOUND', 'approval artifact not found', 404);
    }
    exactArtifact(artifactRecord, command.artifact);
    if (command.approvalKind === 'plan' && command.selectedEvidence.length) {
      throw new WorkflowCommandError(
        'SELECTED_EVIDENCE_NOT_ALLOWED',
        'selected evidence is bound only at scope approval',
        400
      );
    }
    const selectedEvidence = [...command.selectedEvidence].sort((left, right) =>
      left.artifactId.localeCompare(right.artifactId)
    );
    if (
      new Set(selectedEvidence.map((artifact) => artifact.artifactId)).size !==
      selectedEvidence.length
    ) {
      throw new WorkflowCommandError(
        'DUPLICATE_SELECTED_EVIDENCE',
        'selected evidence references must be unique',
        400
      );
    }
    if (command.approvalKind === 'scope') {
      for (const evidenceRef of selectedEvidence) {
        if (evidenceRef.kind !== 'evidence') {
          throw new WorkflowCommandError(
            'INVALID_SELECTED_EVIDENCE',
            'selected evidence must use the evidence artifact kind',
            400
          );
        }
        const evidence = repository.loadTenantArtifact
          ? await repository.loadTenantArtifact(owner.tenantId, evidenceRef.artifactId)
          : await repository.loadArtifact(owner.tenantId, runId, evidenceRef.artifactId);
        exactArtifact(evidence, evidenceRef);
      }
    }

    let targetStages;
    let scopeResearchInputHash = null;
    let acceptedPlan = null;
    let rootSourceArtifacts = null;
    let rootArtifactContents = null;
    if (command.approvalKind === 'scope') {
      targetStages = [stageByKind(snapshot, 'execute_research')];
      const scope = ScopeArtifactV2Schema.parse(artifactRecord.payload);
      scopeResearchInputHash = {
        type: 'ExecuteResearchV2',
        ...executionAgentField(executionAgent),
        acceptedScope: command.artifact,
        scope,
        selectedEvidence,
      };
    } else {
      acceptedPlan = PlanningResultSchema.parse(artifactRecord.payload);
      rootSourceArtifacts = [
        acceptedPlan.acceptedScopeArtifact,
        acceptedPlan.researchArtifact,
        command.artifact,
      ].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
      rootArtifactContents = await Promise.all(
        rootSourceArtifacts.map(async (reference) => {
          const record =
            reference.artifactId === command.artifact.artifactId
              ? artifactRecord
              : await repository.loadArtifact(owner.tenantId, runId, reference.artifactId);
          return artifactContent(record, reference);
        })
      );
      const executionIdsWithParents = new Set(
        snapshot.dependencies
          .filter((dependency) =>
            snapshot.stages.some(
              (stage) => stage.id === dependency.dependsOnStageId && stage.kind === 'execution'
            )
          )
          .map((dependency) => dependency.stageId)
      );
      targetStages = snapshot.stages.filter(
        (stage) => stage.kind === 'execution' && !executionIdsWithParents.has(stage.id)
      );
    }
    const nextAttempts = targetStages.map((stage) => {
      let inputPayload;
      if (command.approvalKind === 'scope') {
        inputPayload = scopeResearchInputHash;
      } else {
        const task = acceptedPlan.tasks.find((candidate) => candidate.stageId === stage.id);
        if (!task)
          throw new WorkflowCommandError('PLAN_TASK_NOT_FOUND', 'execution task missing', 409);
        inputPayload = {
          type: 'SynthesizeArtifactV1',
          ...executionAgentField(executionAgent),
          purpose: 'execute_task',
          task,
          acceptedScope: acceptedPlan.acceptedScopeArtifact,
          research: acceptedPlan.researchArtifact,
          acceptedPlan: command.artifact,
          sourceArtifacts: rootSourceArtifacts,
          artifactContents: rootArtifactContents,
          outputContract: acceptedPlan.outputContract,
          repairPass: 0,
        };
      }
      return nextAttempt(command.commandId, stage, inputPayload);
    });
    const event = {
      type: 'ApprovalGranted',
      eventId: command.commandId,
      tenantId: owner.tenantId,
      runId,
      occurredAt: command.issuedAt,
      approvalId: deterministicUuid(command.commandId, 'approval'),
      approvalKind: command.approvalKind,
      stageId: gate.id,
      artifact: command.artifact,
      inputHash: producer.inputHash,
      selectedEvidence,
      idempotencyKey: command.idempotencyKey,
      decisionHash: canonicalHash({
        approvalKind: command.approvalKind,
        artifact: command.artifact,
        inputHash: producer.inputHash,
        selectedEvidence,
      }),
      decidedBy: owner.userId,
      nextAttempts,
    };
    let receipt;
    try {
      receipt = await repository.applyTransition(
        owner.tenantId,
        runId,
        transition(snapshot, event)
      );
    } catch (error) {
      if (!['40001', '23505'].includes(error.code)) throw error;
      const adopted = requireSnapshot(await repository.loadSnapshot(owner.tenantId, runId));
      const approval = adopted.approvals.find(
        (candidate) => candidate.idempotencyKey === command.idempotencyKey
      );
      if (!approval || approval.decisionHash !== event.decisionHash) {
        throw new WorkflowCommandError(
          'IDEMPOTENCY_CONFLICT',
          'approval idempotency key was reused with changed input',
          409
        );
      }
      return {
        receipt: {
          idempotent: true,
          tenantId: owner.tenantId,
          runId,
          approvalId: approval.id,
        },
        workflow: adopted,
      };
    }
    return {
      receipt,
      workflow: await repository.loadSnapshot(owner.tenantId, runId),
    };
  }

  async function reviseScope(auth, runId, rawCommand) {
    const command = ReviseScopeCommandSchema.parse(rawCommand);
    const owner = await identity(auth);
    const existingEvent = await repository.loadWorkflowEvent?.(
      owner.tenantId,
      runId,
      command.commandId
    );
    if (existingEvent) {
      const prior = existingEvent.event;
      if (
        prior.type !== 'ScopeRevisionRequested' ||
        prior.idempotencyKey !== command.idempotencyKey ||
        prior.correction !== command.correction ||
        canonicalHash(prior.acceptedScope) !== canonicalHash(command.acceptedScope)
      ) {
        throw new WorkflowCommandError(
          'IDEMPOTENCY_CONFLICT',
          'scope revision command ID was reused with changed input',
          409
        );
      }
      return {
        receipt: { ...existingEvent.receipt, idempotent: true },
        workflow: requireSnapshot(await repository.loadSnapshot(owner.tenantId, runId)),
      };
    }
    const snapshot = requireSnapshot(await repository.loadSnapshot(owner.tenantId, runId));
    const executionAgent = executionAgentFromSnapshot(snapshot);
    const scopeStage = stageByKind(snapshot, 'compile_scope');
    const gate = stageByKind(snapshot, 'gate_1');
    const current = await repository.loadArtifact(
      owner.tenantId,
      runId,
      command.acceptedScope.artifactId
    );
    exactArtifact(current, command.acceptedScope);
    const correctionSourceSpans = [
      {
        start: 0,
        end: command.correction.length,
        text: command.correction,
        sha256: sha256Hex(command.correction),
        offsetUnit: 'utf16_code_units',
      },
    ];
    const inputPayload = {
      type: 'ReviseScopeV2',
      ...executionAgentField(executionAgent),
      acceptedScope: command.acceptedScope,
      correction: command.correction,
      correctionSourceSpans,
    };
    const nextNumber =
      Math.max(
        0,
        ...snapshot.attempts
          .filter((attempt) => attempt.stageId === scopeStage.id)
          .map((attempt) => attempt.attemptNumber)
      ) + 1;
    const revisionAttempt = nextAttempt(command.commandId, scopeStage, inputPayload, nextNumber);
    const event = {
      type: 'ScopeRevisionRequested',
      eventId: command.commandId,
      tenantId: owner.tenantId,
      runId,
      occurredAt: command.issuedAt,
      stageId: scopeStage.id,
      gateStageId: gate.id,
      acceptedScope: command.acceptedScope,
      correction: command.correction,
      idempotencyKey: command.idempotencyKey,
      nextAttempt: {
        attemptId: revisionAttempt.attemptId,
        operationId: revisionAttempt.operationId,
        inputHash: revisionAttempt.inputHash,
        inputPayload: revisionAttempt.inputPayload,
      },
    };
    let receipt;
    try {
      receipt = await repository.applyTransition(
        owner.tenantId,
        runId,
        transition(snapshot, event)
      );
    } catch (error) {
      if (!['40001', '23505'].includes(error.code) || !repository.findScopeRevisionByIdempotency) {
        throw error;
      }
      const adopted = await repository.findScopeRevisionByIdempotency(
        owner.tenantId,
        runId,
        command.idempotencyKey
      );
      if (
        !adopted ||
        adopted.event.correction !== command.correction ||
        canonicalHash(adopted.event.acceptedScope) !== canonicalHash(command.acceptedScope)
      ) {
        throw new WorkflowCommandError(
          'IDEMPOTENCY_CONFLICT',
          'scope revision idempotency key was reused with changed input',
          409
        );
      }
      return {
        receipt: { ...adopted.receipt, idempotent: true },
        workflow: requireSnapshot(await repository.loadSnapshot(owner.tenantId, runId)),
      };
    }
    return { receipt, workflow: await repository.loadSnapshot(owner.tenantId, runId) };
  }

  return {
    ready,
    session,
    workspace,
    overview,
    activity,
    start,
    startFromAssistant,
    list,
    read,
    artifact,
    approve,
    reviseScope,
  };
}
