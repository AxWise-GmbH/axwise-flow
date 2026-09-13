// A bounded profile inside the existing transition engine, not a scheduler.
// Only explicit authenticated owner events create capability attempts. Scope
// compilation uses the existing signed result and approval ledger.
import { canonicalHash, canonicalJson, sha256Hex } from './canonical.js';
import {
  capabilityScopeRequest,
  isCapabilityWork,
} from '../../shared/workflow-v2/capability-work-primitives.js';

export const CAPABILITY_OWNER_EVENT_TYPES = Object.freeze([
  'CapabilityRunRequested',
  'CapabilityScopeApproved',
  'CapabilityActivityRequested',
]);
export const PAID_CAPABILITY_TYPES = Object.freeze(['AnalyzeEvidenceV1', 'SimulateV1']);
export const CAPABILITY_ACTIVITY_TYPES = Object.freeze([
  'AdmitTranscriptCorpusV1',
  ...PAID_CAPABILITY_TYPES,
]);

export function capabilityAllows(profile, type) {
  return (
    (type === 'AdmitTranscriptCorpusV1' && profile.capability === 'AnalyzeEvidenceV1') ||
    profile.capability === type ||
    (profile.capability === 'SimulateV1' &&
      profile.allowSimulationAnalysis &&
      type === 'AnalyzeEvidenceV1')
  );
}

export function capabilityScopeApproval(snapshot) {
  const scope = snapshot.stages.find((stage) => stage.kind === 'compile_scope');
  const gate = snapshot.stages.find((stage) => stage.kind === 'gate_1');
  const approval = snapshot.approvals.find(
    (item) =>
      item.kind === 'scope' &&
      item.stageId === gate?.id &&
      item.decision === 'approved' &&
      canonicalJson(item.artifact) === canonicalJson(scope?.outputArtifact ?? null)
  );
  return scope?.status === 'completed' && gate?.status === 'completed' && approval
    ? { scope, gate, approval }
    : null;
}

// Existing transition helpers are injected to retain the exact lease/CAS,
// immutable-artifact and audit behavior already used by the legacy profile.
export function capabilityTransition(snapshot, event, helpers) {
  const {
    reject,
    makePlan,
    mutateRun,
    mutateStage,
    mutateAttempt,
    stageById,
    attemptById,
    assertCurrentAttempt,
    assertFreshAttemptIdentity,
    baseCompletion,
    validateCapabilityEnvelope,
    validateCapabilityCompletion,
  } = helpers;
  const ownedEvent = CAPABILITY_OWNER_EVENT_TYPES.includes(event.type);
  if (!isCapabilityWork(snapshot.run)) {
    if (ownedEvent)
      reject('CAPABILITY_PROFILE_REQUIRED', 'capability commands require explicit capability work');
    if (
      snapshot.attempts.some((attempt) =>
        CAPABILITY_ACTIVITY_TYPES.includes(attempt.inputPayload.type)
      )
    ) {
      reject('CAPABILITY_PROFILE_REQUIRED', 'legacy Goals cannot execute capability inputs');
    }
    return null;
  }
  if (['RunRequested', 'ScopeRevisionRequested', 'ApprovalGranted'].includes(event.type)) {
    reject(
      'CAPABILITY_OWNER_COMMAND_REQUIRED',
      'capability work requires its explicit owner commands'
    );
  }
  const profile = snapshot.run.workProfile;
  const plan = makePlan(event);
  if (event.type === 'CapabilityRunRequested') {
    if (
      snapshot.run.status !== 'requested' ||
      snapshot.stages.length ||
      snapshot.attempts.length ||
      snapshot.approvals.length
    ) {
      reject('RUN_ALREADY_INITIALIZED', 'capability work must initialize a fresh empty run');
    }
    const request = capabilityScopeRequest({
      capability: profile.capability,
      request: profile.purpose,
      allowSimulationAnalysis: profile.allowSimulationAnalysis,
    });
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
    if (
      snapshot.run.ownerUserId !== event.ownerUserId ||
      event.ownerOrganizationId !== null ||
      snapshot.run.ownerOrganizationId !== null ||
      snapshot.run.mode !== 'simple' ||
      event.mode !== 'simple' ||
      canonicalJson(profile) !== canonicalJson(event.workProfile) ||
      event.request !== request ||
      event.inputPayload.request !== request ||
      sha256Hex(request) !== event.requestHash ||
      snapshot.run.requestHash !== event.requestHash ||
      canonicalHash(event.inputPayload) !== event.inputHash ||
      canonicalJson(event.inputPayload) !== canonicalJson(compileInput)
    ) {
      reject(
        'CAPABILITY_INITIAL_INPUT_MISMATCH',
        'capability scope must bind the exact owner-disclosed request'
      );
    }
    const { compileScope, gate1 } = event.stageIds;
    if (compileScope === gate1)
      reject('DUPLICATE_STAGE_ID', 'scope and approval stages must be distinct');
    plan.createStages = [
      {
        id: compileScope,
        stageKey: 'capability-compile-scope',
        kind: 'compile_scope',
        status: 'queued',
        ordinal: 10,
        inputHash: event.inputHash,
      },
      {
        id: gate1,
        stageKey: 'capability-scope-approval',
        kind: 'gate_1',
        status: 'pending',
        ordinal: 20,
        inputHash: null,
      },
    ];
    plan.createDependencies = [{ stageId: gate1, dependsOnStageId: compileScope }];
    plan.createAttempts.push({
      id: event.attemptId,
      stageId: compileScope,
      attemptNumber: 1,
      operationId: event.operationId,
      inputHash: event.inputHash,
      inputPayload: event.inputPayload,
      inputCanonical: canonicalJson(event.inputPayload),
      activityType: 'axwise_operation',
    });
    plan.outbox.push({
      idempotencyKey: `dispatch:${event.operationId}`,
      commandType: 'dispatch_activity',
      stageId: compileScope,
      attemptId: event.attemptId,
      operationId: event.operationId,
      inputHash: event.inputHash,
      availableAt: event.occurredAt,
    });
    mutateRun(plan, snapshot.run, { status: 'running' });
    plan.audit.payload = {
      eventId: event.eventId,
      profile: profile.type,
      capability: profile.capability,
      initializedStageCount: 2,
    };
    return plan;
  }
  if (event.type === 'CapabilityScopeApproved') {
    const gate = stageById(snapshot, event.stageId);
    const scope = snapshot.stages.find((stage) => stage.kind === 'compile_scope');
    const expectedDecision = canonicalHash({
      artifact: event.artifact,
      workProfile: profile,
      scopeCompatible: true,
    });
    if (
      snapshot.run.status !== 'awaiting_gate_1' ||
      gate.kind !== 'gate_1' ||
      gate.status !== 'awaiting_approval' ||
      scope?.status !== 'completed' ||
      canonicalJson(scope.outputArtifact) !== canonicalJson(event.artifact) ||
      scope.inputHash !== event.inputHash ||
      event.decidedBy !== snapshot.run.ownerUserId ||
      event.decisionHash !== expectedDecision ||
      snapshot.approvals.length
    ) {
      reject(
        'CAPABILITY_SCOPE_APPROVAL_MISMATCH',
        'owner must approve the exact current capability scope'
      );
    }
    plan.createApproval = {
      id: event.approvalId,
      kind: 'scope',
      stageId: gate.id,
      artifact: event.artifact,
      inputHash: event.inputHash,
      idempotencyKey: event.idempotencyKey,
      decisionHash: event.decisionHash,
      decidedBy: event.decidedBy,
    };
    mutateStage(plan, gate, { status: 'completed', input_hash: event.inputHash });
    mutateRun(plan, snapshot.run, { status: 'awaiting_capability_input' });
    plan.audit.payload = {
      eventId: event.eventId,
      approvalId: event.approvalId,
      artifactId: event.artifact.artifactId,
      artifactHash: event.artifact.artifactHash,
    };
    return plan;
  }
  if (event.type === 'CapabilityActivityRequested') {
    const approved = capabilityScopeApproval(snapshot);
    const input = event.inputPayload;
    if (
      !approved ||
      event.scopeApprovalId !== approved.approval.id ||
      canonicalJson(event.acceptedScope) !== canonicalJson(approved.scope.outputArtifact) ||
      event.decidedBy !== snapshot.run.ownerUserId ||
      event.expectedRowVersion !== snapshot.run.rowVersion ||
      !['awaiting_capability_input', 'completed', 'failed'].includes(snapshot.run.status) ||
      snapshot.stages.some((stage) =>
        ['pending', 'queued', 'running', 'polling', 'awaiting_approval'].includes(stage.status)
      ) ||
      !CAPABILITY_ACTIVITY_TYPES.includes(input.type) ||
      !capabilityAllows(profile, input.type)
    ) {
      reject(
        'CAPABILITY_OWNER_SCOPE_MISMATCH',
        'capability must be an explicit owner-reviewed continuation of this idle work item'
      );
    }
    if (
      snapshot.stages.length >= 60 ||
      snapshot.attempts.length >= 100 ||
      snapshot.stages.some(
        (stage) =>
          stage.id === event.stageId ||
          stage.stageKey === event.stageKey ||
          stage.ordinal === event.ordinal
      ) ||
      event.ordinal !== Math.max(...snapshot.stages.map((stage) => stage.ordinal)) + 10
    ) {
      reject(
        'CAPABILITY_STAGE_LIMIT',
        'capability stage identity or bounded stage count is invalid'
      );
    }
    assertFreshAttemptIdentity(snapshot, plan, event);
    if (canonicalHash(input) !== event.inputHash || input.executionAgent) {
      reject('CAPABILITY_INPUT_MISMATCH', 'capability must bind its exact non-delegated input');
    }
    if (PAID_CAPABILITY_TYPES.includes(input.type)) {
      if (
        !event.reviewId ||
        canonicalJson(input.acceptedScope) !== canonicalJson(event.acceptedScope)
      ) {
        reject(
          'CAPABILITY_REVIEW_REQUIRED',
          'paid capability requires a bound scope and owner review'
        );
      }
      validateCapabilityEnvelope({
        operationId: event.operationId,
        operationType: input.type,
        owner: {
          tenantId: snapshot.run.tenantId,
          userId: snapshot.run.ownerUserId,
          organizationId: null,
        },
        workflow: {
          runId: snapshot.run.id,
          stageId: event.stageId,
          stageAttemptId: event.attemptId,
        },
        contractVersion: 'axwise.operation.v2',
        canonicalInputHash: event.inputHash,
        input,
      });
      if (
        profile.capability === 'SimulateV1' &&
        input.type === 'AnalyzeEvidenceV1' &&
        input.source.artifact.kind !== 'simulation'
      ) {
        reject(
          'CAPABILITY_CONTINUATION_SOURCE_MISMATCH',
          'simulation continuation may analyze only this work item’s simulation outputs'
        );
      }
      const expectedSource =
        input.type === 'AnalyzeEvidenceV1'
          ? [input.source.artifact]
          : input.selectedGrounding.map((item) => item.artifact);
      for (const reference of expectedSource) {
        if (
          !snapshot.stages.some(
            (stage) =>
              stage.status === 'completed' &&
              canonicalJson(stage.outputArtifact) === canonicalJson(reference)
          )
        ) {
          reject(
            'CAPABILITY_SOURCE_NOT_OWNED',
            'capability source must be a completed output of this exact work item'
          );
        }
      }
    } else if (
      event.reviewId !== null ||
      input.corpus.documents.some(
        (doc) => doc.origin !== 'supplied_transcript' || doc.originArtifactRefs.length
      )
    ) {
      reject(
        'CAPABILITY_UPLOAD_ORIGIN_INVALID',
        'new uploads cannot impersonate synthetic or cross-run provenance'
      );
    }
    plan.createStages.push({
      id: event.stageId,
      stageKey: event.stageKey,
      kind: 'execution',
      status: 'queued',
      ordinal: event.ordinal,
      inputHash: event.inputHash,
    });
    plan.createDependencies.push({ stageId: event.stageId, dependsOnStageId: approved.gate.id });
    plan.createAttempts.push({
      id: event.attemptId,
      stageId: event.stageId,
      attemptNumber: 1,
      operationId: event.operationId,
      inputHash: event.inputHash,
      inputPayload: input,
      inputCanonical: canonicalJson(input),
      activityType: 'axwise_operation',
    });
    plan.outbox.push({
      idempotencyKey: `dispatch:${event.operationId}`,
      commandType: 'dispatch_activity',
      stageId: event.stageId,
      attemptId: event.attemptId,
      operationId: event.operationId,
      inputHash: event.inputHash,
      availableAt: event.occurredAt,
    });
    mutateRun(plan, snapshot.run, { status: 'running' });
    plan.audit.payload = {
      eventId: event.eventId,
      stageId: event.stageId,
      operationId: event.operationId,
      inputHash: event.inputHash,
      scopeApprovalId: event.scopeApprovalId,
      reviewId: event.reviewId,
      operationType: input.type,
    };
    return plan;
  }
  if (event.type === 'ActivityCompleted') {
    const stage = stageById(snapshot, event.stageId);
    if (stage.kind === 'compile_scope') return null;
    const attempt = attemptById(snapshot, event.attemptId);
    assertCurrentAttempt(snapshot, stage, attempt, event);
    if (
      stage.kind !== 'execution' ||
      !CAPABILITY_ACTIVITY_TYPES.includes(attempt.inputPayload.type) ||
      event.nextAttempts.length
    ) {
      reject(
        'CAPABILITY_SUCCESSOR_FORBIDDEN',
        'capability results cannot queue any successor activity'
      );
    }
    validateCapabilityCompletion(attempt.inputPayload, event.result, {
      operationId: attempt.operationId,
      workflow: { runId: snapshot.run.id, stageId: stage.id, stageAttemptId: attempt.id },
      canonicalInputHash: attempt.inputHash,
    });
    baseCompletion(plan, stage, attempt, event.result.artifact);
    const admission = attempt.inputPayload.type === 'AdmitTranscriptCorpusV1';
    mutateRun(
      plan,
      snapshot.run,
      admission
        ? { status: 'awaiting_capability_input' }
        : { status: 'completed', final_artifact_id: event.result.artifact.artifactId }
    );
    plan.audit.payload = {
      eventId: event.eventId,
      stageId: stage.id,
      attemptId: attempt.id,
      operationId: attempt.operationId,
      artifactId: event.result.artifact.artifactId,
      artifactHash: event.result.artifact.artifactHash,
      metrics: event.result.metrics ?? null,
    };
    return plan;
  }
  if (event.type === 'ActivityFailed') {
    const attempt = attemptById(snapshot, event.attemptId);
    if (!CAPABILITY_ACTIVITY_TYPES.includes(attempt.inputPayload.type)) return null;
    const stage = stageById(snapshot, event.stageId);
    assertCurrentAttempt(snapshot, stage, attempt, event);
    if (event.retryable || event.nextAttempt)
      reject(
        'CAPABILITY_RECONSENT_REQUIRED',
        'paid capability failure requires a fresh owner confirmation'
      );
    mutateAttempt(plan, attempt, {
      status: 'failed',
      error_class: event.errorClass,
      clear_lease: true,
    });
    mutateStage(plan, stage, { status: 'failed' });
    mutateRun(plan, snapshot.run, { status: 'failed' });
    plan.audit.payload = {
      eventId: event.eventId,
      stageId: stage.id,
      attemptId: attempt.id,
      operationId: attempt.operationId,
      errorClass: event.errorClass,
      retryScheduled: false,
    };
    return plan;
  }
  return null;
}
