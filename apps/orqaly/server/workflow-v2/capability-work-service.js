import {
  ActivityInputSchema,
  ArtifactFactSchema,
  ArtifactContentSchema,
  CompileScopeInputV2Schema,
  PublicWorkflowSnapshotSchema,
  ScopeArtifactV2Schema,
  UuidSchema,
  AxWiseOperationEnvelopeSchema,
  AnalyzeEvidenceDraftInputV1Schema,
  SimulateDraftInputV1Schema,
} from '../../shared/workflow-v2/contracts.js';
import {
  StartCapabilityWorkCommandSchema,
  ApproveCapabilityScopeCommandSchema,
  AdmitCapabilityCorpusCommandSchema,
  PrepareCapabilityOperationCommandSchema,
  ConfirmCapabilityOperationCommandSchema,
  CapabilityWorkProfileSchema,
} from '../../shared/workflow-v2/capability-work-contracts.js';
import { processingConsentBindingHash } from '../../shared/workflow-v2/capability-contracts.js';
import {
  CAPABILITY_WORK_PROFILE,
  CAPABILITY_COMPILER_NOTICE,
  CAPABILITY_PROCESSING_NOTICE,
  capabilityScopeRequest,
  capabilityReviewLimitations,
  isCapabilityWork,
} from '../../shared/workflow-v2/capability-work-primitives.js';
import {
  SimulationV1Schema,
  simulationPlan,
} from '../../shared/workflow-v2/capability-simulation-contracts.js';
import { TranscriptCorpusV1Schema } from '../../shared/workflow-v2/capability-source-contracts.js';
import { validateAnalysisRequest } from '../../shared/workflow-v2/capability-analysis-contracts.js';
import { canonicalHash, canonicalJson, sha256Hex } from '../../lib/workflow-v2/canonical.js';
import { transition } from '../../lib/workflow-v2/state-machine.js';
import {
  capabilityAllows,
  capabilityScopeApproval,
  CAPABILITY_OWNER_EVENT_TYPES,
} from '../../lib/workflow-v2/capability-state-machine.js';
import { resolveCapabilityGrounding } from '../../lib/workflow-v2/capability-result-validation.js';
import { WorkflowCommandError } from './command-service.js';
import { deterministicUuid } from './ids.js';

export const CAPABILITY_DEFAULT_LIMITS = Object.freeze({
  deadlineMs: 180_000,
  maxModelCalls: 2,
  maxInputTokens: 120_000,
  maxOutputTokens: 65_536,
});
const fail = (code, message, status = 409) => {
  throw new WorkflowCommandError(code, message, status);
};
const exact = (left, right) => canonicalJson(left) === canonicalJson(right);
const immutableRef = (record) => ({
  artifactId: record.artifactId,
  artifactHash: record.artifactHash,
  kind: record.kind,
});
const asFact = (record) =>
  ArtifactFactSchema.parse({
    ...immutableRef(record),
    contentType: record.contentType,
    payload: record.payload,
    markdown: record.markdown,
    sourceArtifactIds: record.sourceArtifactIds,
  });

export function publicCapabilityWorkflow(snapshot) {
  // Corpus/scenario inputs are execution state, not metadata polling payloads.
  return PublicWorkflowSnapshotSchema.parse({ ...snapshot, attempts: [] });
}

function currentScope(snapshot) {
  const result = capabilityScopeApproval(snapshot);
  if (!result)
    fail(
      'CAPABILITY_SCOPE_APPROVAL_REQUIRED',
      'approve this work item’s exact capability scope first'
    );
  return result;
}

function assertIdle(snapshot, expectedRowVersion) {
  if (snapshot.run.rowVersion !== expectedRowVersion)
    fail('CAPABILITY_REVIEW_STALE', 'work changed; review the selected input again');
  if (
    !['awaiting_capability_input', 'completed', 'failed'].includes(snapshot.run.status) ||
    snapshot.stages.some((stage) =>
      ['pending', 'queued', 'running', 'polling', 'awaiting_approval'].includes(stage.status)
    )
  ) {
    fail('CAPABILITY_WORK_NOT_IDLE', 'wait for the current work or its scope approval');
  }
  if (snapshot.stages.length >= 60 || snapshot.attempts.length >= 100) {
    fail('CAPABILITY_STAGE_LIMIT', 'this work item reached its bounded activity limit');
  }
}

export function createCapabilityWorkService({ repository, enabled = false }) {
  async function identity(auth, { create = false } = {}) {
    if (!auth?.userId || !/^user_[A-Za-z0-9]+$/.test(auth.userId))
      fail('UNAUTHENTICATED', 'sign-in required', 401);
    if (!enabled) fail('CAPABILITY_WORK_UNAVAILABLE', 'capability work is not configured', 503);
    const tenantId = create
      ? await repository.resolveTenant({ userId: auth.userId })
      : await repository.resolveExistingTenant({ userId: auth.userId });
    if (!tenantId) fail('TENANT_NOT_BOUND', 'identity has no active personal tenant', 403);
    return { tenantId, userId: auth.userId };
  }

  async function snapshotFor(owner, runId) {
    UuidSchema.parse(runId);
    const snapshot = await repository.loadSnapshot(owner.tenantId, runId);
    if (
      !snapshot ||
      snapshot.run.id !== runId ||
      snapshot.run.tenantId !== owner.tenantId ||
      snapshot.run.ownerUserId !== owner.userId ||
      snapshot.run.ownerOrganizationId !== null
    ) {
      fail('WORKFLOW_NOT_FOUND', 'work item not found', 404);
    }
    if (!isCapabilityWork(snapshot.run))
      fail('CAPABILITY_PROFILE_REQUIRED', 'existing Goals cannot be reopened as capability work');
    CapabilityWorkProfileSchema.parse(snapshot.run.workProfile);
    return snapshot;
  }

  async function ownedArtifact(owner, snapshot, reference, { scope = false } = {}) {
    const producer = snapshot.stages.find(
      (stage) =>
        stage.status === 'completed' &&
        exact(stage.outputArtifact, reference) &&
        (scope ? stage.kind === 'compile_scope' : stage.kind === 'execution')
    );
    if (!producer)
      fail('CAPABILITY_SOURCE_NOT_OWNED', 'select an exact completed output from this work item');
    const record = await repository.loadArtifact(
      owner.tenantId,
      snapshot.run.id,
      reference.artifactId
    );
    if (
      !record ||
      !exact(immutableRef(record), reference) ||
      (record.runId && record.runId !== snapshot.run.id)
    ) {
      fail('CAPABILITY_SOURCE_NOT_OWNED', 'selected immutable output is unavailable');
    }
    return asFact(record);
  }

  async function replay(owner, runId, commandId, ownerCommandHash) {
    const existing = await repository.loadWorkflowEvent(owner.tenantId, runId, commandId);
    if (!existing) return null;
    if (
      !CAPABILITY_OWNER_EVENT_TYPES.includes(existing.event.type) ||
      existing.event.ownerCommandHash !== ownerCommandHash
    ) {
      fail('IDEMPOTENCY_CONFLICT', 'command ID was reused with changed input');
    }
    const snapshot = await snapshotFor(owner, runId);
    return {
      workflow: publicCapabilityWorkflow(snapshot),
      receipt: { ...existing.receipt, idempotent: true },
    };
  }

  async function persist(owner, snapshot, event) {
    let receipt;
    try {
      receipt = await repository.applyCapabilityTransition(
        owner.tenantId,
        snapshot.run.id,
        transition(snapshot, event)
      );
    } catch (error) {
      if (!['23505', '40001'].includes(error.code)) throw error;
      const existing = await replay(owner, snapshot.run.id, event.eventId, event.ownerCommandHash);
      if (existing) return existing;
      fail('CAPABILITY_REVIEW_STALE', 'work changed; review the selected input again');
    }
    return {
      receipt,
      workflow: publicCapabilityWorkflow(await snapshotFor(owner, snapshot.run.id)),
    };
  }

  async function start(auth, rawCommand) {
    const command = StartCapabilityWorkCommandSchema.parse(rawCommand);
    const owner = await identity(auth, { create: true });
    const ownerCommandHash = canonicalHash(command);
    const runId = deterministicUuid(
      owner.tenantId,
      owner.userId,
      command.commandId,
      'capability-work'
    );
    const existing = await replay(owner, runId, command.commandId, ownerCommandHash);
    if (existing) return existing;
    const workProfile = CapabilityWorkProfileSchema.parse({
      type: CAPABILITY_WORK_PROFILE,
      capability: command.capability,
      purpose: command.request,
      allowSimulationAnalysis: command.allowSimulationAnalysis,
      compilerNoticeVersion: CAPABILITY_COMPILER_NOTICE,
    });
    const request = capabilityScopeRequest(command);
    const inputPayload = CompileScopeInputV2Schema.parse({
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
    });
    const event = {
      type: 'CapabilityRunRequested',
      eventId: command.commandId,
      ownerCommandHash,
      tenantId: owner.tenantId,
      runId,
      occurredAt: command.issuedAt,
      ownerUserId: owner.userId,
      ownerOrganizationId: null,
      mode: 'simple',
      workProfile,
      request,
      requestHash: sha256Hex(request),
      stageIds: {
        compileScope: deterministicUuid(runId, 'compile-scope'),
        gate1: deterministicUuid(runId, 'scope-approval'),
      },
      attemptId: deterministicUuid(runId, 'compile-scope', 'attempt'),
      operationId: deterministicUuid(runId, 'compile-scope', 'operation'),
      inputHash: canonicalHash(inputPayload),
      inputPayload,
    };
    const snapshot = {
      run: {
        id: runId,
        tenantId: owner.tenantId,
        ownerUserId: owner.userId,
        ownerOrganizationId: null,
        mode: 'simple',
        workProfile,
        status: 'requested',
        request,
        requestHash: event.requestHash,
        rowVersion: 0,
        evidenceReadiness: null,
        finalArtifact: null,
      },
      stages: [],
      attempts: [],
      dependencies: [],
      approvals: [],
    };
    return persist(owner, snapshot, event);
  }

  async function approveScope(auth, runId, rawCommand) {
    const command = ApproveCapabilityScopeCommandSchema.parse(rawCommand),
      owner = await identity(auth);
    const snapshot = await snapshotFor(owner, runId),
      ownerCommandHash = canonicalHash(command);
    const existing = await replay(owner, runId, command.commandId, ownerCommandHash);
    if (existing) return existing;
    const record = await ownedArtifact(owner, snapshot, command.artifact, { scope: true });
    ScopeArtifactV2Schema.parse(record.payload);
    const scope = snapshot.stages.find((stage) => stage.kind === 'compile_scope');
    const gate = snapshot.stages.find((stage) => stage.kind === 'gate_1');
    if (!gate)
      fail('CAPABILITY_SCOPE_APPROVAL_REQUIRED', 'capability scope approval is unavailable');
    return persist(owner, snapshot, {
      type: 'CapabilityScopeApproved',
      eventId: command.commandId,
      ownerCommandHash,
      tenantId: owner.tenantId,
      runId,
      occurredAt: command.issuedAt,
      approvalId: deterministicUuid(runId, command.commandId, 'scope-approval'),
      stageId: gate.id,
      artifact: command.artifact,
      inputHash: scope.inputHash,
      idempotencyKey: `capability-scope:${runId}:${command.artifact.artifactHash}`,
      decisionHash: canonicalHash({
        artifact: command.artifact,
        workProfile: snapshot.run.workProfile,
        scopeCompatible: true,
      }),
      decidedBy: owner.userId,
      scopeCompatible: true,
    });
  }

  function activityEvent(
    owner,
    snapshot,
    command,
    inputPayload,
    scope,
    { ownerCommandHash, reviewId, ids } = {}
  ) {
    const ordinal = Math.max(...snapshot.stages.map((stage) => stage.ordinal)) + 10;
    const seed = canonicalHash({
      commandId: command.commandId,
      expectedRowVersion: command.expectedRowVersion,
      input: inputPayload,
    });
    const identity = ids || {
      stageId: deterministicUuid(snapshot.run.id, seed, 'stage'),
      attemptId: deterministicUuid(snapshot.run.id, seed, 'attempt'),
      operationId: deterministicUuid(snapshot.run.id, seed, 'operation'),
    };
    const name = {
      AdmitTranscriptCorpusV1: 'admit',
      AnalyzeEvidenceV1: 'analyze',
      SimulateV1: 'simulate',
    }[inputPayload.type];
    return {
      type: 'CapabilityActivityRequested',
      eventId: command.commandId,
      ownerCommandHash,
      tenantId: owner.tenantId,
      runId: snapshot.run.id,
      occurredAt: command.issuedAt,
      decidedBy: owner.userId,
      expectedRowVersion: command.expectedRowVersion,
      ...identity,
      stageKey: `capability-${name}-${ordinal / 10 - 2}`,
      ordinal,
      inputHash: canonicalHash(inputPayload),
      inputPayload,
      acceptedScope: scope.scope.outputArtifact,
      scopeApprovalId: scope.approval.id,
      scopeCompatible: true,
      reviewId: reviewId ?? null,
    };
  }

  async function admitCorpus(auth, runId, rawCommand) {
    const command = AdmitCapabilityCorpusCommandSchema.parse(rawCommand),
      owner = await identity(auth);
    const snapshot = await snapshotFor(owner, runId),
      ownerCommandHash = canonicalHash(command);
    const existing = await replay(owner, runId, command.commandId, ownerCommandHash);
    if (existing) return existing;
    assertIdle(snapshot, command.expectedRowVersion);
    const scope = currentScope(snapshot);
    if (
      !capabilityAllows(snapshot.run.workProfile, 'AdmitTranscriptCorpusV1') ||
      command.corpus.documents.some(
        (document) =>
          document.origin !== 'supplied_transcript' || document.originArtifactRefs.length
      )
    ) {
      fail(
        'CAPABILITY_UPLOAD_ORIGIN_INVALID',
        'upload explicitly supplied transcripts to analysis work; synthetic outputs must retain their original provenance',
        400
      );
    }
    const inputPayload = ActivityInputSchema.parse({
      type: 'AdmitTranscriptCorpusV1',
      corpus: command.corpus,
      admissionProfile: 'supplied_transcript_v1',
    });
    return persist(
      owner,
      snapshot,
      activityEvent(owner, snapshot, command, inputPayload, scope, { ownerCommandHash })
    );
  }

  async function prepared(owner, snapshot, draft) {
    assertIdle(snapshot, draft.expectedRowVersion);
    const scope = currentScope(snapshot);
    if (!capabilityAllows(snapshot.run.workProfile, draft.operationType))
      fail(
        'CAPABILITY_SCOPE_MISMATCH',
        'this capability is outside the owner-approved work profile'
      );
    const scopeRecord = await ownedArtifact(owner, snapshot, scope.scope.outputArtifact, {
      scope: true,
    });
    const scopePayload = ScopeArtifactV2Schema.parse(scopeRecord.payload);
    let input, selectedSources, providerPayload, selectedPassages;
    if (draft.operationType === 'AnalyzeEvidenceV1') {
      if (
        snapshot.run.workProfile.capability === 'SimulateV1' &&
        draft.sourceArtifact.kind !== 'simulation'
      ) {
        fail(
          'CAPABILITY_CONTINUATION_SOURCE_MISMATCH',
          'simulation continuation can analyze only its own simulation outputs'
        );
      }
      const source = await ownedArtifact(owner, snapshot, draft.sourceArtifact);
      const corpus =
        source.kind === 'simulation'
          ? SimulationV1Schema.parse(source.payload).corpus
          : TranscriptCorpusV1Schema.parse(source.payload);
      validateAnalysisRequest(draft.request, corpus);
      input = {
        type: draft.operationType,
        acceptedScope: scope.scope.outputArtifact,
        scope: scopePayload,
        source: ArtifactContentSchema.parse({
          artifact: draft.sourceArtifact,
          contentType: source.contentType,
          payload: source.payload,
          markdown: source.markdown,
        }),
        request: draft.request,
        limits: { ...CAPABILITY_DEFAULT_LIMITS },
      };
      selectedSources = [
        {
          artifact: draft.sourceArtifact,
          title:
            source.kind === 'simulation'
              ? 'Synthetic simulation transcripts'
              : 'Selected supplied transcripts',
          documents: corpus.documents.map(
            ({ documentId, title, text, textSha256, origin, participants, turns }) => ({
              documentId,
              title,
              text,
              textSha256,
              origin,
              participants,
              turns,
            })
          ),
        },
      ];
      providerPayload = {
        request: draft.request,
        corpus: { schemaVersion: corpus.schemaVersion, documents: selectedSources[0].documents },
      };
    } else {
      input = {
        type: draft.operationType,
        acceptedScope: scope.scope.outputArtifact,
        scope: scopePayload,
        request: draft.request,
        selectedGrounding: draft.selectedGrounding,
        limits: { ...CAPABILITY_DEFAULT_LIMITS },
      };
      const artifacts = [];
      for (const reference of draft.request.grounding.sourceArtifacts) {
        // There is no research/import stage in this profile. Only exact quotes
        // from its own earlier explicit analysis can ground another simulation.
        if (reference.kind !== 'qualitative_analysis')
          fail('CAPABILITY_SOURCE_NOT_OWNED', 'select analysis quotes from this same work item');
        artifacts.push(await ownedArtifact(owner, snapshot, reference));
      }
      const passages = resolveCapabilityGrounding(input, artifacts);
      selectedPassages = passages;
      const keys = new Set(
        passages.map((row) => canonicalJson([row.artifact.artifactId, row.entryKind, row.entryId]))
      );
      if (
        keys.size !== passages.length ||
        !exact(
          [...new Set(passages.map((row) => row.artifact.artifactId))].sort(),
          artifacts.map((row) => row.artifactId).sort()
        ) ||
        passages.reduce((total, row) => total + Buffer.byteLength(row.text, 'utf8'), 0) > 32_000
      ) {
        fail(
          'CAPABILITY_GROUNDING_INVALID',
          'selected passages must exactly cover the requested owned sources',
          400
        );
      }
      selectedSources = artifacts.map((record) => ({
        artifact: immutableRef(record),
        title: 'Selected analysis quotes',
        passages: passages
          .filter((row) => row.artifact.artifactId === record.artifactId)
          .map(({ entryId, text }) => ({ entryId, text })),
      }));
    }
    input = (
      draft.operationType === 'AnalyzeEvidenceV1'
        ? AnalyzeEvidenceDraftInputV1Schema
        : SimulateDraftInputV1Schema
    ).parse(input);
    if (Buffer.byteLength(canonicalJson(input), 'utf8') > 999_000)
      fail('PAYLOAD_TOO_LARGE', 'selected capability input exceeds its aggregate byte limit', 413);
    const seed = canonicalHash({
      commandId: draft.commandId,
      expectedRowVersion: draft.expectedRowVersion,
      input,
    });
    const ids = {
      stageId: deterministicUuid(snapshot.run.id, seed, 'stage'),
      attemptId: deterministicUuid(snapshot.run.id, seed, 'attempt'),
      operationId: deterministicUuid(snapshot.run.id, seed, 'operation'),
    };
    const envelope = {
      operationType: draft.operationType,
      operationId: ids.operationId,
      owner: { tenantId: owner.tenantId, userId: owner.userId, organizationId: null },
      workflow: { runId: snapshot.run.id, stageId: ids.stageId, stageAttemptId: ids.attemptId },
      contractVersion: 'axwise.operation.v2',
      input,
    };
    if (draft.operationType === 'SimulateV1') {
      providerPayload = {
        scenario: draft.request.scenario,
        stakeholders: draft.request.stakeholders,
        sampling: draft.request.sampling,
        responseStyle: draft.request.responseStyle,
        generationProfile: draft.request.generationProfile,
        plan: simulationPlan(draft.request, { operationId: ids.operationId }),
        selectedPassages: selectedPassages.map((row, index) => ({
          passageId: `passage-${index + 1}`,
          text: row.text,
        })),
      };
    }
    const bindingHash = processingConsentBindingHash(envelope);
    const reviewBody = {
      operationId: ids.operationId,
      bindingHash,
      provider: 'google',
      purpose: draft.operationType,
      noticeVersion: CAPABILITY_PROCESSING_NOTICE,
      runId: snapshot.run.id,
      expectedRowVersion: snapshot.run.rowVersion,
      acceptedScope: scope.scope.outputArtifact,
      selectedSources,
      request: draft.request,
      limits: { ...CAPABILITY_DEFAULT_LIMITS },
      providerPayload,
      limitations: capabilityReviewLimitations(draft.operationType, draft.request.grounding?.mode),
    };
    const reviewId = canonicalHash({
      schemaVersion: 'orqaly.capability-review.v1',
      draft,
      scopeApprovalId: scope.approval.id,
      review: reviewBody,
    });
    return { review: { ...reviewBody, reviewId }, input, envelope, ids, scope };
  }

  async function prepareOperation(auth, runId, rawDraft) {
    const draft = PrepareCapabilityOperationCommandSchema.parse(rawDraft),
      owner = await identity(auth);
    const snapshot = await snapshotFor(owner, runId);
    const result = await prepared(owner, snapshot, draft);
    return { review: result.review };
  }

  async function confirmOperation(auth, runId, rawCommand) {
    const command = ConfirmCapabilityOperationCommandSchema.parse(rawCommand),
      owner = await identity(auth);
    const snapshot = await snapshotFor(owner, runId),
      ownerCommandHash = canonicalHash(command);
    const existing = await replay(owner, runId, command.draft.commandId, ownerCommandHash);
    if (existing) return existing;
    const result = await prepared(owner, snapshot, command.draft),
      confirmation = command.confirmation;
    if (
      ['provider', 'purpose', 'operationId', 'bindingHash', 'reviewId', 'noticeVersion'].some(
        (field) => confirmation[field] !== result.review[field]
      )
    ) {
      fail(
        'CAPABILITY_REVIEW_STALE',
        'confirmation does not match the exact selected input; review it again'
      );
    }
    // The explicit authenticated confirmation is the only place consent is
    // constructed. Preparing, uploading, polling and model output cannot grant it.
    const input = ActivityInputSchema.parse({
      ...result.input,
      processingConsent: {
        schemaVersion: 'axwise.processing-consent.v1',
        granted: true,
        provider: confirmation.provider,
        purpose: confirmation.purpose,
        operationId: confirmation.operationId,
        bindingHash: confirmation.bindingHash,
        noticeVersion: confirmation.noticeVersion,
      },
    });
    AxWiseOperationEnvelopeSchema.parse({
      ...result.envelope,
      input,
      canonicalInputHash: canonicalHash(input),
    });
    return persist(
      owner,
      snapshot,
      activityEvent(owner, snapshot, command.draft, input, result.scope, {
        ownerCommandHash,
        reviewId: result.review.reviewId,
        ids: result.ids,
      })
    );
  }

  return { enabled, start, approveScope, admitCorpus, prepareOperation, confirmOperation };
}
