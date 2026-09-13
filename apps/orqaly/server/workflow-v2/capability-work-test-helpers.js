import { vi } from 'vitest';
import scopeResult from '../../shared/workflow-v2/fixtures/scope_completion_result_v2.json';
import analysisVectors from '../../shared/workflow-v2/fixtures/capability-analysis-python-goldens.json';
import simulationVectors from '../../shared/workflow-v2/fixtures/capability-simulation-vectors.json';
import { artifactContentHash } from '../../lib/workflow-v2/canonical.js';
import { transition } from '../../lib/workflow-v2/state-machine.js';
import { capabilityArtifactId } from '../../shared/workflow-v2/capability-contracts.js';
import { buildQualitativeAnalysis } from '../../shared/workflow-v2/capability-analysis-contracts.js';
import {
  buildSimulation,
  simulationPlan,
} from '../../shared/workflow-v2/capability-simulation-contracts.js';
import { createCapabilityWorkService } from './capability-work-service.js';

export const uid = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
export const tenantId = uid(901),
  userId = 'user_capabilityfixture';
export const issuedAt = '2026-09-09T12:00:00.000Z';
export const clone = (value) => structuredClone(value);
export const ref = ({ artifactId, artifactHash, kind }) => ({ artifactId, artifactHash, kind });
export const analysisVector = analysisVectors.cases.find((row) => row.name === 'complete_supplied');
export const simulationVector = simulationVectors.cases[0];

export function fact(kind, payload, operationId, sourceArtifactIds = []) {
  const content = { contentType: 'application/json', payload, markdown: null };
  return {
    artifactId: capabilityArtifactId(operationId, kind),
    artifactHash: artifactContentHash(content),
    kind,
    ...content,
    sourceArtifactIds: [...new Set(sourceArtifactIds)].sort(),
  };
}

export function fixture({ enabled = true } = {}) {
  let snapshot = null,
    serial = 5000;
  const records = new Map(),
    events = new Map(),
    plans = [];
  function applyPlan(_tenantId, runId, rawPlan) {
    const plan = clone(rawPlan),
      event = plan.event;
    if (events.has(event.eventId)) return events.get(event.eventId).receipt;
    if (!snapshot)
      snapshot = {
        run: {
          id: runId,
          tenantId,
          ownerUserId: userId,
          ownerOrganizationId: null,
          mode: 'simple',
          workProfile: event.workProfile,
          status: 'requested',
          request: event.request,
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
    for (const stage of plan.createStages)
      snapshot.stages.push({ ...stage, rowVersion: 0, outputArtifact: null });
    for (const attempt of plan.createAttempts)
      snapshot.attempts.push({
        id: attempt.id,
        stageId: attempt.stageId,
        attemptNumber: attempt.attemptNumber,
        operationId: attempt.operationId,
        inputHash: attempt.inputHash,
        inputPayload: attempt.inputPayload,
        status: 'queued',
        rowVersion: 0,
        leaseToken: null,
        leaseExpiresAt: null,
      });
    snapshot.dependencies.push(...plan.createDependencies);
    for (const artifact of plan.createArtifacts) records.set(artifact.artifactId, artifact);
    function mutate(row, mutation) {
      if (row.rowVersion !== mutation.expectedVersion)
        throw Object.assign(new Error('Synthetic CAS conflict'), { code: '40001' });
      for (const [field, value] of Object.entries(mutation.patch)) {
        if (field === 'output_artifact_id') row.outputArtifact = ref(records.get(value));
        else if (field === 'final_artifact_id') row.finalArtifact = ref(records.get(value));
        else if (field === 'input_hash') row.inputHash = value;
        else if (field === 'evidence_readiness') row.evidenceReadiness = value;
        else if (field === 'clear_lease' && value) {
          row.leaseToken = null;
          row.leaseExpiresAt = null;
        } else if (field === 'status') row.status = value;
      }
      row.rowVersion += 1;
    }
    for (const mutation of plan.stageMutations)
      mutate(
        snapshot.stages.find((row) => row.id === mutation.id),
        mutation
      );
    for (const mutation of plan.attemptMutations)
      mutate(
        snapshot.attempts.find((row) => row.id === mutation.id),
        mutation
      );
    if (plan.runMutation) mutate(snapshot.run, plan.runMutation);
    if (plan.createApproval) {
      const item = plan.createApproval;
      snapshot.approvals.push({
        id: item.id,
        kind: item.kind,
        stageId: item.stageId,
        artifact: item.artifact,
        inputHash: item.inputHash,
        idempotencyKey: item.idempotencyKey,
        decisionHash: item.decisionHash,
        decision: 'approved',
      });
    }
    const receipt = { idempotent: false, eventId: event.eventId };
    events.set(event.eventId, { event, receipt });
    plans.push(plan);
    return receipt;
  }
  const repository = {
    resolveTenant: vi.fn(async () => tenantId),
    resolveExistingTenant: vi.fn(async () => tenantId),
    loadWorkflowEvent: vi.fn(async (_tenant, _run, id) => clone(events.get(id) ?? null)),
    loadSnapshot: vi.fn(async () => clone(snapshot)),
    loadArtifact: vi.fn(async (_tenant, _run, id) => clone(records.get(id) ?? null)),
    applyCapabilityTransition: vi.fn(async (...args) => applyPlan(...args)),
    applyWorkerTransition: vi.fn(async (...args) => applyPlan(...args)),
  };
  const service = createCapabilityWorkService({ repository, enabled });
  const nextCommand = () => ({ commandId: uid(serial++), issuedAt });
  function activeAttempt() {
    const attempt = snapshot.attempts.findLast((row) => row.status === 'queued');
    attempt.leaseToken = uid(serial++);
    attempt.leaseExpiresAt = '2030-01-01T00:00:00.000Z';
    const event = {
      type: 'ActivityStarted',
      eventId: uid(serial++),
      tenantId,
      runId: snapshot.run.id,
      occurredAt: issuedAt,
      stageId: attempt.stageId,
      attemptId: attempt.id,
      leaseToken: attempt.leaseToken,
      deploymentId: 'synthetic-test',
    };
    applyPlan(tenantId, snapshot.run.id, transition(snapshot, event));
    return clone(snapshot.attempts.find((row) => row.id === attempt.id));
  }
  function complete(resultOrFactory) {
    const attempt = activeAttempt();
    const result =
      typeof resultOrFactory === 'function' ? resultOrFactory(attempt) : resultOrFactory;
    const event = {
      type: 'ActivityCompleted',
      eventId: uid(serial++),
      tenantId,
      runId: snapshot.run.id,
      occurredAt: issuedAt,
      stageId: attempt.stageId,
      attemptId: attempt.id,
      leaseToken: attempt.leaseToken,
      result,
      nextAttempts: [],
    };
    applyPlan(tenantId, snapshot.run.id, transition(snapshot, event));
    return clone(result.artifact);
  }
  async function start({ capability = 'AnalyzeEvidenceV1', allowSimulationAnalysis = false } = {}) {
    const command = {
      ...nextCommand(),
      capability,
      request: 'Understand this explicitly selected synthetic test workflow.',
      allowSimulationAnalysis,
      compilerDisclosure: { accepted: true, noticeVersion: 'google-scope-compiler-v1' },
    };
    await service.start({ userId }, command);
    return command;
  }
  function compile() {
    return complete((attempt) => {
      const result = clone(scopeResult);
      result.artifact.payload.authority.canonicalInputHash = attempt.inputHash;
      result.artifact.artifactHash = artifactContentHash(result.artifact);
      return result;
    });
  }
  async function approve() {
    const command = {
      ...nextCommand(),
      artifact: snapshot.stages.find((stage) => stage.kind === 'compile_scope').outputArtifact,
      scopeCompatible: true,
    };
    await service.approveScope({ userId }, snapshot.run.id, command);
    return command;
  }
  async function ready(options) {
    await start(options);
    compile();
    await approve();
    return clone(snapshot);
  }
  async function admit() {
    const command = {
      ...nextCommand(),
      expectedRowVersion: snapshot.run.rowVersion,
      corpus: clone(analysisVector.context.corpus),
    };
    await service.admitCorpus({ userId }, snapshot.run.id, command);
    return complete((attempt) => ({
      resultType: 'transcript_corpus_admitted',
      artifact: fact('transcript_corpus', attempt.inputPayload.corpus, attempt.operationId),
    }));
  }
  const confirm = (draft, review) => ({
    draft,
    confirmation: {
      granted: true,
      provider: review.provider,
      purpose: review.purpose,
      operationId: review.operationId,
      bindingHash: review.bindingHash,
      reviewId: review.reviewId,
      noticeVersion: review.noticeVersion,
      scopeCompatible: true,
    },
  });
  function analysisDraft(source) {
    return {
      ...nextCommand(),
      expectedRowVersion: snapshot.run.rowVersion,
      operationType: 'AnalyzeEvidenceV1',
      sourceArtifact: ref(source),
      request: clone(analysisVector.context.request),
    };
  }
  function simulationDraft() {
    return {
      ...nextCommand(),
      expectedRowVersion: snapshot.run.rowVersion,
      operationType: 'SimulateV1',
      request: clone(simulationVector.request),
      selectedGrounding: [],
    };
  }
  function analysisResult(attempt) {
    const input = attempt.inputPayload;
    const payload = buildQualitativeAnalysis({
      ...analysisVector.artifact,
      corpus: input.source.payload,
      request: input.request,
      acceptedScope: input.acceptedScope,
      sourceArtifacts: [input.source.artifact],
    });
    return {
      resultType: 'evidence_analyzed',
      artifact: fact('qualitative_analysis', payload, attempt.operationId, [
        input.acceptedScope.artifactId,
        input.source.artifact.artifactId,
      ]),
    };
  }
  function simulationResult(attempt) {
    const input = attempt.inputPayload,
      candidate = clone(simulationVector.candidate);
    const plan = simulationPlan(input.request, { operationId: attempt.operationId });
    candidate.participants = candidate.participants.map((person, index) => ({
      ...person,
      ...plan[index],
    }));
    candidate.interviews = candidate.interviews.map((interview, index) => ({
      ...interview,
      participantId: plan[index].participantId,
    }));
    const payload = buildSimulation(candidate, {
      request: input.request,
      operationId: attempt.operationId,
      acceptedScope: input.acceptedScope,
    });
    return {
      resultType: 'simulation_completed',
      artifact: fact('simulation', payload, attempt.operationId, [input.acceptedScope.artifactId]),
    };
  }
  return {
    repository,
    service,
    records,
    events,
    plans,
    nextCommand,
    start,
    ready,
    compile,
    approve,
    admit,
    complete,
    activeAttempt,
    analysisDraft,
    simulationDraft,
    confirm,
    analysisResult,
    simulationResult,
    snapshot: () => snapshot,
    setSnapshot: (value) => {
      snapshot = value;
    },
    applyPlan,
  };
}
