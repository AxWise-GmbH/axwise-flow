import { randomUUID } from 'node:crypto';
import { canonicalHash, sha256Hex } from '../../lib/workflow-v2/canonical.js';
import {
  transition,
  WorkflowTransitionError,
} from '../../lib/workflow-v2/state-machine.js';
import { WORKFLOW_REMOTE_STAGE_KINDS } from '../../lib/workflow-v2/transition-table.js';
import {
  blockedReportOutputContract,
  ExecutionAgentContractV1Schema,
} from '../../shared/workflow-v2/contracts.js';
import { deterministicUuid } from './ids.js';
import { isCapabilityWork } from '../../shared/workflow-v2/capability-work-primitives.js';
import { CAPABILITY_ACTIVITY_TYPES } from '../../lib/workflow-v2/capability-state-machine.js';
import { validateCapabilityResultForInput } from '../../lib/workflow-v2/capability-result-validation.js';

const TERMINAL_RUN_STATUSES = new Set([
  'completed',
  'completed_with_evidence_gaps',
  'blocked',
  'failed',
  'cancelled',
]);

function iso(clock) {
  return clock().toISOString();
}

function attemptById(snapshot, attemptId) {
  const attempt = snapshot.attempts.find((candidate) => candidate.id === attemptId);
  if (!attempt) throw new Error(`claimed attempt ${attemptId} is missing`);
  return attempt;
}

function stageById(snapshot, stageId) {
  const stage = snapshot.stages.find((candidate) => candidate.id === stageId);
  if (!stage) throw new Error(`claimed stage ${stageId} is missing`);
  return stage;
}

function executionAgentFromSnapshot(snapshot) {
  const compileStage = snapshot.stages.find((stage) => stage.kind === 'compile_scope');
  if (!compileStage) throw new Error('compile_scope stage is missing');
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
      throw new Error('stage execution Agent exists without an initial Goal binding');
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
    throw new Error('all Goal stages must retain the initial execution Agent contract');
  }
  return parsed.data;
}

function executionAgentField(executionAgent) {
  return executionAgent ? { executionAgent } : {};
}

function artifactRef(artifact) {
  return {
    artifactId: artifact.artifactId,
    artifactHash: artifact.artifactHash,
    kind: artifact.kind,
  };
}

function nextAttempt(seed, stage, inputPayload, attemptNumber = 1) {
  return {
    stageId: stage.id,
    attemptId: deterministicUuid(seed, stage.id, 'attempt', String(attemptNumber)),
    operationId: deterministicUuid(seed, stage.id, 'operation', String(attemptNumber)),
    inputHash: canonicalHash(inputPayload),
    inputPayload,
  };
}

function retryAttempt(attempt) {
  const attemptNumber = attempt.attemptNumber + 1;
  return {
    attemptId: deterministicUuid(
      attempt.operationId,
      'retry',
      String(attemptNumber),
      'attempt'
    ),
    operationId: deterministicUuid(
      attempt.operationId,
      'retry',
      String(attemptNumber),
      'operation'
    ),
    inputHash: attempt.inputHash,
    inputPayload: attempt.inputPayload,
  };
}

function artifactContent(context, reference, completingArtifact = null) {
  const value =
    (completingArtifact?.artifactId === reference.artifactId ? completingArtifact : null) ||
    context.artifacts.find(
      (artifact) =>
        artifact.artifactId === reference.artifactId &&
        artifact.artifactHash === reference.artifactHash &&
        artifact.kind === reference.kind
    );
  if (!value) throw new Error(`immutable artifact content ${reference.artifactId} is missing`);
  return {
    artifact: reference,
    contentType: value.contentType,
    payload: value.payload,
    markdown: value.markdown,
  };
}

function exactContents(context, sourceArtifacts, completingArtifact = null) {
  return sourceArtifacts.map((reference) =>
    artifactContent(context, reference, completingArtifact)
  );
}

function nextAttemptsForCompletion(snapshot, stage, result, seed, context) {
  if (isCapabilityWork(snapshot.run)) return [];
  const executionAgent = executionAgentFromSnapshot(snapshot);
  if (stage.kind === 'execute_research') {
    const planning = snapshot.stages.find((candidate) => candidate.kind === 'planning');
    const scope = snapshot.stages.find((candidate) => candidate.kind === 'compile_scope');
    if (result.evidenceReadiness === 'blocked') {
      const synthesis = snapshot.stages.find((candidate) => candidate.kind === 'synthesis');
      const researchRef = artifactRef(result.artifact);
      const sourceArtifacts = [scope.outputArtifact, researchRef].sort((left, right) =>
        left.artifactId.localeCompare(right.artifactId)
      );
      return [nextAttempt(seed, synthesis, {
        type: 'SynthesizeArtifactV1',
        ...executionAgentField(executionAgent),
        purpose: 'blocked_report',
        acceptedScope: scope.outputArtifact,
        research: researchRef,
        sourceArtifacts,
        artifactContents: exactContents(context, sourceArtifacts, result.artifact),
        outputContract: blockedReportOutputContract(result.artifact.payload),
        repairPass: 0,
      })];
    }
    return [nextAttempt(seed, planning, {
      type: 'OrqalyPlanV2',
      ...executionAgentField(executionAgent),
      acceptedScope: scope.outputArtifact,
      research: artifactRef(result.artifact),
      agentCatalogue: [...(context.agents || [])].sort((left, right) =>
        left.id.localeCompare(right.id)
      ),
    })];
  }
  if (stage.kind === 'execution') {
    const completedIds = new Set(
      snapshot.stages
        .filter((candidate) =>
          ['completed', 'completed_with_evidence_gaps'].includes(candidate.status)
        )
        .map((candidate) => candidate.id)
    );
    completedIds.add(stage.id);
    const executionStages = snapshot.stages.filter((candidate) => candidate.kind === 'execution');
    const unfinishedAfterCurrent = executionStages.filter(
      (candidate) => candidate.id !== stage.id && !completedIds.has(candidate.id)
    );
    const candidates = unfinishedAfterCurrent.filter((candidate) => candidate.status === 'pending');
    const ready = candidates.filter((candidate) =>
      snapshot.dependencies
        .filter((dependency) => dependency.stageId === candidate.id)
        .filter((dependency) => stageById(snapshot, dependency.dependsOnStageId).kind === 'execution')
        .every((dependency) => completedIds.has(dependency.dependsOnStageId))
    );
    if (unfinishedAfterCurrent.length === 0) {
      const evaluation = snapshot.stages.find((candidate) => candidate.kind === 'evaluation');
      const taskArtifacts = snapshot.stages
        .filter((candidate) => candidate.kind === 'execution' && candidate.outputArtifact)
        .map((candidate) => candidate.outputArtifact)
        .concat(artifactRef(result.artifact));
      const scope = snapshot.stages.find((candidate) => candidate.kind === 'compile_scope');
      const research = snapshot.stages.find((candidate) => candidate.kind === 'execute_research');
      const plan = snapshot.stages.find((candidate) => candidate.kind === 'planning');
      const sourceArtifacts = [
        scope.outputArtifact,
        research.outputArtifact,
        plan.outputArtifact,
        ...taskArtifacts,
      ].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
      const planRecord = context.artifacts.find(
        (artifact) => artifact.artifactId === plan.outputArtifact.artifactId
      );
      return [nextAttempt(seed, evaluation, {
        type: 'SynthesizeArtifactV1',
        ...executionAgentField(executionAgent),
        purpose: 'evaluate_output',
        acceptedScope: scope.outputArtifact,
        research: research.outputArtifact,
        acceptedPlan: plan.outputArtifact,
        taskArtifacts: taskArtifacts.sort((left, right) =>
          left.artifactId.localeCompare(right.artifactId)
        ),
        sourceArtifacts,
        artifactContents: exactContents(context, sourceArtifacts, result.artifact),
        outputContract: planRecord.payload.outputContract,
        repairPass: 0,
      })];
    }
    if (!ready.length) return [];
    const plan = snapshot.stages.find((candidate) => candidate.kind === 'planning');
    const planRecord = context.artifacts.find(
      (artifact) => artifact.artifactId === plan.outputArtifact.artifactId
    );
    return ready.map((candidate) => {
      const task = planRecord.payload.tasks.find((item) => item.stageId === candidate.id);
      const scopeRef = planRecord.payload.acceptedScopeArtifact;
      const researchRef = planRecord.payload.researchArtifact;
      const dependencyArtifacts = snapshot.dependencies
        .filter((dependency) => dependency.stageId === candidate.id)
        .map((dependency) => stageById(snapshot, dependency.dependsOnStageId))
        .filter((dependency) => dependency.kind === 'execution')
        .map((dependency) =>
          dependency.id === stage.id ? artifactRef(result.artifact) : dependency.outputArtifact
        );
      if (dependencyArtifacts.some((artifact) => !artifact)) {
        throw new Error('ready execution successor is missing a dependency artifact');
      }
      const sourceArtifacts = [scopeRef, researchRef, plan.outputArtifact, ...dependencyArtifacts]
        .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
      return nextAttempt(seed, candidate, {
        type: 'SynthesizeArtifactV1',
        ...executionAgentField(executionAgent),
        purpose: 'execute_task',
        task,
        acceptedScope: scopeRef,
        research: researchRef,
        acceptedPlan: plan.outputArtifact,
        sourceArtifacts,
        artifactContents: exactContents(context, sourceArtifacts, result.artifact),
        outputContract: planRecord.payload.outputContract,
        repairPass: 0,
      });
    });
  }
  if (stage.kind === 'evaluation' && !result.executionOutputContractSatisfied) {
    const synthesis = snapshot.stages.find((candidate) => candidate.kind === 'synthesis');
    const scope = snapshot.stages.find((candidate) => candidate.kind === 'compile_scope');
    const research = snapshot.stages.find((candidate) => candidate.kind === 'execute_research');
    const planning = snapshot.stages.find((candidate) => candidate.kind === 'planning');
    const taskArtifacts = snapshot.stages
      .filter((candidate) => candidate.kind === 'execution' && candidate.outputArtifact)
      .map((candidate) => candidate.outputArtifact)
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    const acceptedScope = scope?.outputArtifact;
    const scopeArtifact = acceptedScope && context.artifacts.find(
      (artifact) =>
        artifact.artifactId === acceptedScope.artifactId &&
        artifact.artifactHash === acceptedScope.artifactHash &&
        artifact.kind === acceptedScope.kind
    );
    if (!scopeArtifact) {
      throw new Error('current accepted scope artifact is required to schedule synthesis');
    }
    const sourceArtifacts = [
      acceptedScope,
      research.outputArtifact,
      planning.outputArtifact,
      ...taskArtifacts,
      artifactRef(result.artifact),
    ].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    const planRecord = context.artifacts.find(
      (artifact) => artifact.artifactId === planning.outputArtifact.artifactId
    );
    const synthesisInput = {
      type: 'SynthesizeArtifactV1',
      ...executionAgentField(executionAgent),
      purpose: 'final_synthesis',
      acceptedScope,
      research: research.outputArtifact,
      acceptedPlan: planning.outputArtifact,
      taskArtifacts,
      evaluation: artifactRef(result.artifact),
      sourceArtifacts,
      artifactContents: exactContents(context, sourceArtifacts, result.artifact),
      outputContract: planRecord.payload.outputContract,
      repairPass: 1,
    };
    return [nextAttempt(seed, synthesis, synthesisInput)];
  }
  return [];
}

export function createWorkerEngine({
  repository,
  activityExecutor,
  finalArtifactExporter = null,
  workerId,
  deploymentId,
  clock = () => new Date(),
  leaseSeconds = 120,
  capabilityWorkEnabled = false,
}) {
  function trace(claim, metrics = null) {
    return {
      tenantId: claim.tenantId,
      runId: claim.runId,
      stageId: claim.stageId,
      attemptId: claim.attemptId,
      operationId: claim.operationId,
      commandType: claim.commandType,
      leaseTokenFingerprint: sha256Hex(claim.leaseToken).slice(0, 16),
      deploymentId,
      metrics,
    };
  }

  async function apply(claim, snapshot, event) {
    return repository.applyWorkerTransition(
      claim.tenantId,
      claim.runId,
      transition(snapshot, event)
    );
  }

  async function processOne() {
    const exportClaim = await repository.claimExportOutbox?.(
      workerId,
      randomUUID(),
      leaseSeconds
    );
    if (exportClaim) {
      if (!finalArtifactExporter) throw new Error('final artifact exporter is not configured');
      const artifact = await repository.loadArtifact(
        exportClaim.tenantId,
        exportClaim.runId,
        exportClaim.artifact.artifactId
      );
      if (
        !artifact ||
        artifact.artifactHash !== exportClaim.artifact.artifactHash ||
        artifact.kind !== 'final_markdown'
      ) {
        throw new Error('export outbox does not bind the exact final Markdown artifact');
      }
      try {
        const exported = await finalArtifactExporter.exportFinalMarkdown({
          tenantId: exportClaim.tenantId,
          runId: exportClaim.runId,
          artifact,
        });
        const receipt = await repository.acknowledgeExport({
          tenantId: exportClaim.tenantId,
          outboxId: exportClaim.outboxId,
          leaseToken: exportClaim.leaseToken,
          succeeded: true,
        });
        return {
          status: 'exported', claim: exportClaim, exported, receipt,
          trace: trace(exportClaim),
        };
      } catch (error) {
        const backoffSeconds = Math.min(300, 2 ** Math.min(exportClaim.deliveryCount, 8));
        const retryAt = new Date(clock().getTime() + backoffSeconds * 1000).toISOString();
        const receipt = await repository.acknowledgeExport({
          tenantId: exportClaim.tenantId,
          outboxId: exportClaim.outboxId,
          leaseToken: exportClaim.leaseToken,
          succeeded: false,
          retryAt,
          errorClass: String(error.code || error.name || 'EXPORT_FAILED').slice(0, 200),
        });
        return {
          status: 'export_retry_scheduled', claim: exportClaim, retryAt, receipt,
          trace: trace(exportClaim),
        };
      }
    }
    const expired = await repository.listExpiredAttemptLeases?.(100);
    for (const lease of expired || []) {
      if (typeof lease.observedAt !== 'string' || !lease.observedAt.trim()) {
        throw new Error('expired lease observedAt is invalid');
      }
      const observed = new Date(lease.observedAt);
      if (Number.isNaN(observed.getTime())) {
        throw new Error('expired lease observedAt is invalid');
      }
      const observedAt = observed.toISOString();
      const snapshot = await repository.loadWorkerSnapshot(lease.tenantId, lease.runId, {
        skipTerminal: true,
      });
      if (!snapshot) continue;
      const event = {
        type: 'LeaseExpired',
        eventId: deterministicUuid(lease.attemptId, lease.leaseToken, 'lease-expired'),
        tenantId: lease.tenantId,
        runId: lease.runId,
        occurredAt: observedAt,
        stageId: lease.stageId,
        attemptId: lease.attemptId,
        leaseToken: lease.leaseToken,
        requeueAt: observedAt,
      };
      let plan;
      try {
        plan = transition(snapshot, event);
      } catch (error) {
        // A terminal run can retain an expired attempt lease. Recovery is no
        // longer valid, but the stale lease must not prevent later recovery or
        // ordinary outbox work.
        if (
          !(error instanceof WorkflowTransitionError) ||
          error.code !== 'RUN_NOT_ACTIVE' ||
          !TERMINAL_RUN_STATUSES.has(snapshot.run.status)
        ) {
          throw error;
        }
      }
      if (plan) {
        const receipt = await repository.applyWorkerTransition(
          lease.tenantId,
          lease.runId,
          plan
        );
        if (receipt.skipped && receipt.reason === 'run_not_active') continue;
        return {
          status: 'recovered', attemptId: lease.attemptId, receipt,
          trace: trace({
            ...lease,
            commandType: lease.status === 'polling' ? 'poll_activity' : 'dispatch_activity',
          }),
        };
      }
    }
    const claim = await repository.claimOutbox(workerId, randomUUID(), leaseSeconds);
    if (!claim) return { status: 'idle' };
    let snapshot = await repository.loadWorkerSnapshot(claim.tenantId, claim.runId);
    let attempt = attemptById(snapshot, claim.attemptId);
    const stage = stageById(snapshot, claim.stageId);
    if (attempt.leaseToken !== claim.leaseToken) throw new Error('claim lease was not attached to attempt');

    if (attempt.status === 'queued') {
      const event = {
        type: 'ActivityStarted',
        eventId: deterministicUuid(claim.outboxId, claim.leaseToken, 'started'),
        tenantId: claim.tenantId,
        runId: claim.runId,
        occurredAt: iso(clock),
        stageId: claim.stageId,
        attemptId: claim.attemptId,
        leaseToken: claim.leaseToken,
        deploymentId,
      };
      await apply(claim, snapshot, event);
      snapshot = await repository.loadWorkerSnapshot(claim.tenantId, claim.runId);
      attempt = attemptById(snapshot, claim.attemptId);
    } else if (!['running', 'polling'].includes(attempt.status)) {
      throw new Error(`claimed attempt is ${attempt.status}`);
    }

    const remote = WORKFLOW_REMOTE_STAGE_KINDS.includes(stage.kind);
    let context = await repository.loadActivityContext(
      claim.tenantId,
      claim.runId,
      claim.attemptId,
      { includeArtifacts: !remote, inputPayload: attempt.inputPayload }
    );
    let outcome = isCapabilityWork(snapshot.run) && !capabilityWorkEnabled
      ? { kind: 'failed', retryable: false, errorClass: 'CAPABILITY_WORK_UNAVAILABLE' }
      : await activityExecutor.execute({ claim, context, snapshot });
    if (remote && outcome.kind === 'completed') {
      // Pending/failed upstream operations need no artifact bodies or planning
      // catalogue. Hydrate only once a result can construct a successor input.
      context = await repository.loadActivityContext(
        claim.tenantId,
        claim.runId,
        claim.attemptId,
        { includeArtifacts: true, inputPayload: attempt.inputPayload }
      );
    }
    const explicitCapability = isCapabilityWork(snapshot.run) && CAPABILITY_ACTIVITY_TYPES.includes(attempt.inputPayload.type);
    if (explicitCapability && outcome.kind === 'completed') {
      try {
        validateCapabilityResultForInput(attempt.inputPayload, outcome.result, {
          operationId: attempt.operationId, artifacts: context.artifacts,
        });
      } catch {
        outcome = { kind: 'failed', retryable: false, errorClass: 'AXWISE_CAPABILITY_RESULT_REJECTED' };
      }
    }
    const occurredAt = iso(clock);
    let event;
    if (outcome.kind === 'deferred' || outcome.kind === 'ambiguous') {
      event = {
        type: outcome.kind === 'ambiguous' ? 'ActivityDispatchAmbiguous' : 'ActivityDeferred',
        eventId: deterministicUuid(claim.outboxId, claim.leaseToken, 'deferred'),
        tenantId: claim.tenantId,
        runId: claim.runId,
        occurredAt,
        stageId: claim.stageId,
        attemptId: claim.attemptId,
        leaseToken: claim.leaseToken,
        statusUrl: outcome.statusUrl,
        nextPollAt: outcome.nextPollAt,
      };
    } else if (outcome.kind === 'redispatch') {
      event = {
        type: 'ActivityRedispatchRequested',
        eventId: deterministicUuid(claim.outboxId, claim.leaseToken, 'redispatch'),
        tenantId: claim.tenantId,
        runId: claim.runId,
        occurredAt,
        stageId: claim.stageId,
        attemptId: claim.attemptId,
        leaseToken: claim.leaseToken,
        redispatchAt: outcome.redispatchAt,
      };
    } else if (outcome.kind === 'failed') {
      event = {
        type: 'ActivityFailed',
        eventId: deterministicUuid(claim.outboxId, claim.leaseToken, 'failed'),
        tenantId: claim.tenantId,
        runId: claim.runId,
        occurredAt,
        stageId: claim.stageId,
        attemptId: claim.attemptId,
        leaseToken: claim.leaseToken,
        retryable: explicitCapability ? false : outcome.retryable,
        errorClass: outcome.errorClass,
        ...(outcome.retryable && !explicitCapability ? { nextAttempt: retryAttempt(attempt) } : {}),
      };
    } else {
      event = {
        type: 'ActivityCompleted',
        eventId: deterministicUuid(claim.outboxId, claim.leaseToken, 'completed'),
        tenantId: claim.tenantId,
        runId: claim.runId,
        occurredAt,
        stageId: claim.stageId,
        attemptId: claim.attemptId,
        leaseToken: claim.leaseToken,
        result: outcome.result,
        nextAttempts: nextAttemptsForCompletion(
          snapshot,
          stage,
          outcome.result,
          attempt.operationId,
          context
        ),
      };
    }
    let plan;
    try {
      plan = transition(snapshot, event);
    } catch (error) {
      if (
        outcome.kind !== 'completed' ||
        !WORKFLOW_REMOTE_STAGE_KINDS.includes(stage.kind) ||
        !(error instanceof WorkflowTransitionError)
      ) {
        throw error;
      }
      event = {
        type: 'ActivityFailed',
        eventId: deterministicUuid(
          claim.outboxId,
          claim.leaseToken,
          'completed-result-rejected'
        ),
        tenantId: claim.tenantId,
        runId: claim.runId,
        occurredAt,
        stageId: claim.stageId,
        attemptId: claim.attemptId,
        leaseToken: claim.leaseToken,
        retryable: !explicitCapability,
        errorClass: `AXWISE_RESULT_REJECTED_${error.code}`.slice(0, 200),
        ...(!explicitCapability ? { nextAttempt: retryAttempt(attempt) } : {}),
      };
      plan = transition(snapshot, event);
    }
    const receipt = await repository.applyWorkerTransition(
      claim.tenantId,
      claim.runId,
      plan
    );
    return {
      status: 'processed', claim, outcome: outcome.kind, receipt,
      trace: trace(claim, outcome.result?.metrics || null),
    };
  }

  return { processOne };
}
