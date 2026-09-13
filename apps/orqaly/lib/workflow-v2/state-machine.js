import {
  TransitionPlanSchema,
  WorkflowEventSchema,
  WorkflowSnapshotSchema,
  WORKFLOW_CONTRACT_VERSION,
  blockedReportOutputContract,
  executionTaskSemanticHash,
  AxWiseOperationEnvelopeSchema,
} from '../../shared/workflow-v2/contracts.js';
import { capabilityTransition, CAPABILITY_OWNER_EVENT_TYPES } from './capability-state-machine.js';
import { validateCapabilityResultForInput } from './capability-result-validation.js';
import {
  artifactContentHash,
  canonicalHash,
  canonicalJson,
  sha256Hex,
} from './canonical.js';
import {
  WORKFLOW_ACTIVITY_STAGE_KINDS,
  WORKFLOW_REMOTE_STAGE_KINDS,
} from './transition-table.js';

const RETRY_LIMIT_BY_STAGE_KIND = Object.freeze({
  compile_scope: 3,
  execute_research: 3,
  planning: 2,
  execution: 2,
  evaluation: 2,
  synthesis: 2,
});

const ACTIVITY_TYPE_BY_STAGE_KIND = Object.freeze({
  compile_scope: 'axwise_operation',
  execute_research: 'axwise_operation',
  planning: 'orqaly_plan',
  execution: 'axwise_operation',
  evaluation: 'axwise_operation',
  synthesis: 'axwise_operation',
});

const INPUT_TYPES_BY_STAGE_KIND = Object.freeze({
  compile_scope: new Set(['CompileScopeV2', 'CompileScopeV3', 'ReviseScopeV2']),
  execute_research: new Set(['ExecuteResearchV2']),
  planning: new Set(['OrqalyPlanV2']),
  execution: new Set(['SynthesizeArtifactV1']),
  evaluation: new Set(['SynthesizeArtifactV1']),
  synthesis: new Set(['SynthesizeArtifactV1']),
});

const PLANNING_ARTIFACT_TYPES = new Set([
  'product_prd',
  'software_prd',
  'research_strategy',
  'operational_plan',
]);

function effectiveRequirementBlocking(artifactType, requirement) {
  const futureAuthorizationExemption =
    artifactType !== 'launch_authorization' &&
    requirement.evidenceRole === 'future_authorization_proof';
  const planningGroundedClaimExemption =
    PLANNING_ARTIFACT_TYPES.has(artifactType) &&
    requirement.evidenceRole === 'grounded_claim';
  return (
    requirement.criticality === 'blocking' &&
    !futureAuthorizationExemption &&
    !planningGroundedClaimExemption
  );
}

export class WorkflowTransitionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'WorkflowTransitionError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new WorkflowTransitionError(code, message);
}

function sameRef(left, right) {
  return (
    left?.artifactId === right?.artifactId &&
    left?.artifactHash === right?.artifactHash &&
    left?.kind === right?.kind
  );
}

function artifactRef(artifact) {
  return {
    artifactId: artifact.artifactId,
    artifactHash: artifact.artifactHash,
    kind: artifact.kind,
  };
}

function leaseTokenFingerprint(leaseToken) {
  return sha256Hex(leaseToken).slice(0, 16);
}

function sortedRefs(refs) {
  return [...refs].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
}

function sameRefs(left, right) {
  return canonicalJson(sortedRefs(left)) === canonicalJson(sortedRefs(right));
}

const SOURCE_CLASS_PRIORITY = Object.freeze([
  'primary_law',
  'government',
  'standard',
  'official_statistics',
  'academic',
  'industry',
  'grounded_web',
]);
const SERVER_OWNED_SOURCE_SECTION = /^(?:sources?|source appendix|references|bibliography)(?:\s*\/\s*(?:sources?|source appendix|references|bibliography))*$/iu;

function collapseAppendixText(value) {
  return value.trim().replace(/\s+/gu, ' ');
}

function boundedSourceSectionLabel(sections) {
  const ordered = [...new Set(sections)].sort();
  if (!ordered.length) {
    reject('SOURCE_APPENDIX_MISMATCH', 'source appendix citation has no Markdown section');
  }
  const retained = [];
  for (const [index, section] of ordered.entries()) {
    const candidate = [...retained, section].join(' · ');
    const remaining = ordered.length - index - 1;
    const suffix = remaining ? ` · (+${remaining} more sections)` : '';
    if ([...candidate, ...suffix].length <= 500) {
      retained.push(section);
      continue;
    }
    break;
  }
  if (retained.length) {
    const remaining = ordered.length - retained.length;
    const suffix = remaining ? ` · (+${remaining} more sections)` : '';
    return `${retained.join(' · ')}${suffix}`;
  }
  const suffix = ordered.length > 1 ? ` · (+${ordered.length - 1} more sections)` : '';
  const limit = 500 - [...suffix].length - 1;
  return `${[...ordered[0]].slice(0, limit).join('').trimEnd()}…${suffix}`;
}

function groupedSourceAppendixEntries(appendix) {
  const groups = new Map();
  for (const entry of appendix) {
    const groupKey = canonicalJson({
      claimId: entry.claimId,
      sourceTitle: entry.sourceTitle,
      canonicalUrl: entry.canonicalUrl,
      sourceClass: entry.sourceClass,
      retrievalDate: entry.retrievalDate,
      supportedClaim: entry.supportedClaim,
    });
    const group = groups.get(groupKey) || { ...entry, supportedSections: [] };
    group.supportedSections.push(entry.supportedSection);
    groups.set(groupKey, group);
  }
  return [...groups.values()].map(({ supportedSections, ...entry }) => ({
    ...entry,
    supportedSection: boundedSourceSectionLabel(supportedSections),
  }));
}

function renderSourceAppendix(appendix) {
  const rows = appendix.length
    ? groupedSourceAppendixEntries(appendix).map((entry) =>
        `- \`[evidence:${entry.claimId}]\` — ${collapseAppendixText(entry.sourceTitle)} — ${entry.canonicalUrl} — class: \`${entry.sourceClass}\` — retrieved: \`${entry.retrievalDate}\` — section: ${collapseAppendixText(entry.supportedSection)} — supported claim: ${collapseAppendixText(entry.supportedClaim)}`
      )
    : ['_No immutable evidence sources were cited for this artifact._'];
  return `## Sources\n\n${rows.join('\n')}\n`;
}

function baseMarkdownAndHeadings(markdown) {
  const sourceHeading = /^## Sources\s*$/imu.exec(markdown);
  const baseMarkdown = sourceHeading ? markdown.slice(0, sourceHeading.index) : markdown;
  const headings = [...baseMarkdown.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gmu)]
    .map((match) => ({
      index: match.index,
      name: match[1].trim().toLocaleLowerCase('en-US'),
    }));
  return { baseMarkdown, headings, sourceHeading };
}

function assertEvidenceMarkers(artifact, inputPayload) {
  if (!['task_result', 'final_markdown'].includes(artifact.kind)) return;
  const researchContent = inputPayload.artifactContents?.find(
    (content) => sameRef(content.artifact, inputPayload.research)
  );
  if (!researchContent?.payload) {
    reject('RESEARCH_CONTENT_MISSING', 'cognitive output requires exact immutable research content');
  }
  const research = researchContent.payload;
  const claims = new Map(
    [...(research.selectedClaims || []), ...(research.claimLedger || []).flatMap((pass) => pass.claims)]
      .map((claim) => [claim.claimId, claim])
  );
  const sources = research.sourceCatalogue || [];
  const appendix = artifact.payload.sourceAppendix || [];
  const appendixClaimIds = new Set(appendix.map((entry) => entry.claimId));
  const { baseMarkdown, headings, sourceHeading } = baseMarkdownAndHeadings(artifact.markdown);
  if (
    (artifact.kind !== 'final_markdown' && sourceHeading) ||
    headings.some((heading) => SERVER_OWNED_SOURCE_SECTION.test(heading.name))
  ) {
    reject(
      'SOURCE_APPENDIX_RENDER_MISMATCH',
      'source headings are server-owned and cannot appear in model-authored Markdown'
    );
  }
  const rawMarkerMatches = [...baseMarkdown.matchAll(/\[evidence:([^\]\r\n]*)\]/gu)];
  const markerMatches = [...baseMarkdown.matchAll(/\[evidence:([a-f0-9]{64})\]/gu)];
  if (
    rawMarkerMatches.length !== markerMatches.length ||
    rawMarkerMatches.some((marker) => !/^[a-f0-9]{64}$/u.test(marker[1]))
  ) {
    reject(
      'UNRESOLVED_EVIDENCE_MARKER',
      'every evidence marker must use one exact lowercase immutable claim ID'
    );
  }
  const markerSections = new Map();
  for (const marker of markerMatches) {
    const containingHeading = headings.findLast((heading) => heading.index < marker.index);
    if (!containingHeading) {
      reject('SOURCE_APPENDIX_MISMATCH', 'every evidence marker must occur inside a Markdown section');
    }
    const sections = markerSections.get(marker[1]) || new Set();
    sections.add(containingHeading.name);
    markerSections.set(marker[1], sections);
  }
  const markers = new Set(markerSections.keys());
  if ([...markers].some((claimId) => !appendixClaimIds.has(claimId))) {
    reject(
      'UNRESOLVED_EVIDENCE_MARKER',
      'every evidence marker must resolve to exact human-readable source appendix metadata'
    );
  }
  for (const entry of appendix) {
    const claim = claims.get(entry.claimId);
    const source = sources.find(
      (candidate) =>
        candidate.canonicalUrl === entry.canonicalUrl &&
        candidate.sourceTitle === entry.sourceTitle &&
        candidate.retrievalDate === entry.retrievalDate &&
        candidate.sourceClasses.includes(entry.sourceClass) &&
        candidate.supportedClaimIds.includes(entry.claimId)
    );
    const expectedSourceClass = source && SOURCE_CLASS_PRIORITY.find((sourceClass) =>
      source.sourceClasses.includes(sourceClass)
    );
    if (
      !markers.has(entry.claimId) ||
      !claim ||
      claim.text !== entry.supportedClaim ||
      !claim.sourceUrls.includes(entry.canonicalUrl) ||
      !claim.sourceTypes.includes(entry.sourceClass) ||
      !source ||
      entry.sourceClass !== expectedSourceClass ||
      !markerSections.get(entry.claimId)?.has(
        entry.supportedSection.trim().toLocaleLowerCase('en-US')
      )
    ) {
      reject(
        'SOURCE_APPENDIX_MISMATCH',
        'source appendix must exactly resolve persisted research claims and source metadata'
      );
    }
  }
  for (const [claimId, sections] of markerSections) {
    if ([...sections].some((section) => !appendix.some(
      (entry) =>
        entry.claimId === claimId &&
        entry.supportedSection.trim().toLocaleLowerCase('en-US') === section
    ))) {
      reject(
        'SOURCE_APPENDIX_MISMATCH',
        'each evidence marker must bind appendix metadata for its containing section'
      );
    }
  }
  if (
    artifact.kind === 'final_markdown' &&
    inputPayload.outputContract.sourceAppendixRequired &&
    appendix.length === 0
  ) {
    reject('SOURCE_APPENDIX_REQUIRED', 'grounded final Markdown requires a source appendix');
  }
  if (artifact.kind === 'final_markdown') {
    const scopeContent = inputPayload.artifactContents?.find(
      (content) => sameRef(content.artifact, inputPayload.acceptedScope)
    );
    const sourceSectionRequested = (scopeContent?.payload?.deliverables || []).some(
      (deliverable) => SERVER_OWNED_SOURCE_SECTION.test(deliverable.trim())
    );
    if (
      sourceHeading ||
      appendix.length ||
      inputPayload.outputContract.sourceAppendixRequired ||
      sourceSectionRequested
    ) {
      const expected = `${baseMarkdown.trimEnd()}\n\n${renderSourceAppendix(appendix)}`;
      if (!sourceHeading || artifact.markdown !== expected) {
        reject(
          'SOURCE_APPENDIX_RENDER_MISMATCH',
          'final Markdown must contain the exact deterministic server-owned source appendix'
        );
      }
    }
  }
}

function makePlan(event) {
  const eventCanonical = canonicalJson(event);
  return {
    contractVersion: WORKFLOW_CONTRACT_VERSION,
    event,
    eventCanonical,
    eventHash: sha256Hex(eventCanonical),
    runMutation: null,
    stageMutations: [],
    attemptMutations: [],
    createStages: [],
    createDependencies: [],
    createAttempts: [],
    createArtifacts: [],
    createApproval: null,
    outbox: [],
    audit: { eventType: event.type, payload: { eventId: event.eventId } },
  };
}

function stageById(snapshot, stageId) {
  const stage = snapshot.stages.find((candidate) => candidate.id === stageId);
  if (!stage) reject('STAGE_NOT_FOUND', `stage ${stageId} does not exist`);
  return stage;
}

function stageByKind(snapshot, kind) {
  const stage = snapshot.stages.find((candidate) => candidate.kind === kind);
  if (!stage) reject('STAGE_NOT_FOUND', `stage kind ${kind} does not exist`);
  return stage;
}

function attemptById(snapshot, attemptId) {
  const attempt = snapshot.attempts.find((candidate) => candidate.id === attemptId);
  if (!attempt) reject('ATTEMPT_NOT_FOUND', `attempt ${attemptId} does not exist`);
  return attempt;
}

function assertEventIdentity(snapshot, event) {
  if (snapshot.run.id !== event.runId || snapshot.run.tenantId !== event.tenantId) {
    reject('TENANT_RUN_MISMATCH', 'event tenant/run does not match snapshot');
  }
}

function assertActivityStage(stage, allowedKinds = WORKFLOW_ACTIVITY_STAGE_KINDS) {
  if (!allowedKinds.includes(stage.kind)) {
    reject('NON_ACTIVITY_STAGE', `stage ${stage.kind} cannot receive activity lifecycle events`);
  }
}

function assertActiveRun(snapshot) {
  if (snapshot.run.status !== 'running') {
    reject('RUN_NOT_ACTIVE', `run status ${snapshot.run.status} cannot execute activity work`);
  }
}

function assertStageAttemptInputHash(stage, attempt) {
  if (!stage.inputHash || stage.inputHash !== attempt.inputHash) {
    reject(
      'STAGE_ATTEMPT_INPUT_HASH_MISMATCH',
      'stage and current attempt must bind the same canonical activity input hash'
    );
  }
}

function assertCurrentAttempt(snapshot, stage, attempt, event, allowedKinds) {
  assertActiveRun(snapshot);
  assertActivityStage(stage, allowedKinds);
  if (attempt.stageId !== stage.id || event.stageId !== stage.id) {
    reject('ATTEMPT_STAGE_MISMATCH', 'attempt is not owned by the event stage');
  }
  const eligible = ['running', 'polling'];
  if (!eligible.includes(attempt.status)) {
    reject('ATTEMPT_NOT_FINALIZABLE', `attempt status ${attempt.status} cannot finalize`);
  }
  if (stage.status !== attempt.status) {
    reject(
      'STAGE_ATTEMPT_STATUS_MISMATCH',
      `stage status ${stage.status} does not match current attempt status ${attempt.status}`
    );
  }
  assertStageAttemptInputHash(stage, attempt);
  if (!attempt.leaseToken || attempt.leaseToken !== event.leaseToken) {
    reject('STALE_LEASE', 'lease token is absent or stale');
  }
  if (!attempt.leaseExpiresAt || Date.parse(attempt.leaseExpiresAt) <= Date.parse(event.occurredAt)) {
    reject('EXPIRED_LEASE', 'expired lease cannot mutate durable workflow state');
  }
}

function mutateRun(plan, run, patch) {
  plan.runMutation = { id: run.id, expectedVersion: run.rowVersion, patch };
}

function mutateStage(plan, stage, patch) {
  plan.stageMutations.push({ id: stage.id, expectedVersion: stage.rowVersion, patch });
}

function mutateAttempt(plan, attempt, patch) {
  plan.attemptMutations.push({ id: attempt.id, expectedVersion: attempt.rowVersion, patch });
}

function nextAttemptFor(event, stageId) {
  const candidates = event.nextAttempts || [];
  const matches = candidates.filter((candidate) => candidate.stageId === stageId);
  if (matches.length !== 1) {
    reject('NEXT_ATTEMPT_REQUIRED', `exactly one next attempt is required for stage ${stageId}`);
  }
  return matches[0];
}

function createdAttempt(next, stage, attemptNumber) {
  if (!INPUT_TYPES_BY_STAGE_KIND[stage.kind]?.has(next.inputPayload.type)) {
    reject(
      'STAGE_INPUT_TYPE_MISMATCH',
      `${next.inputPayload.type} cannot be queued for ${stage.kind}`
    );
  }
  if (canonicalHash(next.inputPayload) !== next.inputHash) {
    reject('ATTEMPT_INPUT_HASH_MISMATCH', 'attempt input does not match its canonical hash');
  }
  const allowedPurposes = {
    execution: ['execute_task'],
    evaluation: ['evaluate_output'],
    synthesis: ['final_synthesis', 'blocked_report'],
  }[stage.kind];
  if (allowedPurposes && !allowedPurposes.includes(next.inputPayload.purpose)) {
    reject(
      'STAGE_INPUT_PURPOSE_MISMATCH',
      `${next.inputPayload.purpose} cannot be queued for ${stage.kind}`
    );
  }
  return {
    id: next.attemptId,
    stageId: stage.id,
    attemptNumber,
    operationId: next.operationId,
    inputHash: next.inputHash,
    inputPayload: next.inputPayload,
    inputCanonical: canonicalJson(next.inputPayload),
    activityType: ACTIVITY_TYPE_BY_STAGE_KIND[stage.kind],
  };
}

function assertFreshAttemptIdentity(snapshot, plan, next) {
  const attempts = [...snapshot.attempts, ...plan.createAttempts];
  if (attempts.some((attempt) => attempt.id === next.attemptId)) {
    reject('ATTEMPT_ID_REUSED', 'new attempt identity already exists');
  }
  if (attempts.some((attempt) => attempt.operationId === next.operationId)) {
    reject('OPERATION_ID_REUSED', 'new operation identity already exists');
  }
}

function queueExistingStage(plan, snapshot, event, stage, attemptNumber = 1) {
  if (!['pending', 'ready'].includes(stage.status)) {
    reject('STAGE_NOT_QUEUEABLE', `stage ${stage.stageKey} is ${stage.status}`);
  }
  const next = nextAttemptFor(event, stage.id);
  const activityType = ACTIVITY_TYPE_BY_STAGE_KIND[stage.kind];
  if (!activityType) reject('NON_ACTIVITY_STAGE', `stage ${stage.kind} has no activity`);
  assertFreshAttemptIdentity(snapshot, plan, next);
  mutateStage(plan, stage, { status: 'queued', input_hash: next.inputHash });
  plan.createAttempts.push(createdAttempt(next, stage, attemptNumber));
  plan.outbox.push({
    idempotencyKey: `dispatch:${next.operationId}`,
    commandType: 'dispatch_activity',
    stageId: stage.id,
    attemptId: next.attemptId,
    operationId: next.operationId,
    inputHash: next.inputHash,
    availableAt: event.occurredAt,
  });
}

function executionDependencyStages(snapshot, stage) {
  return snapshot.dependencies
    .filter((dependency) => dependency.stageId === stage.id)
    .map((dependency) => stageById(snapshot, dependency.dependsOnStageId))
    .filter((dependency) => dependency.kind === 'execution');
}

function expectedExecutionSources(
  snapshot,
  stage,
  acceptedScope,
  research,
  acceptedPlan,
  completingStage = null,
  completingArtifact = null
) {
  if (!acceptedScope || !research || !acceptedPlan) {
    reject('EXECUTION_AUTHORITY_MISSING', 'execution input requires accepted scope, research, and plan');
  }
  const dependencies = executionDependencyStages(snapshot, stage);
  const dependencyArtifacts = dependencies.map((dependency) =>
    dependency.id === completingStage?.id
      ? artifactRef(completingArtifact)
      : dependency.outputArtifact
  );
  if (dependencyArtifacts.some((artifact) => !artifact)) {
    reject('EXECUTION_DEPENDENCY_INCOMPLETE', 'execution input requires every dependency artifact');
  }
  return sortedRefs([
    acceptedScope,
    research,
    acceptedPlan,
    ...dependencyArtifacts,
  ]);
}

function assertExecutionSuccessorInput(
  snapshot,
  stage,
  next,
  acceptedPlan,
  completingStage,
  completingArtifact
) {
  const acceptedScope = stageByKind(snapshot, 'compile_scope').outputArtifact;
  const research = stageByKind(snapshot, 'execute_research').outputArtifact;
  const task = next.inputPayload.task;
  const expectedSources = expectedExecutionSources(
    snapshot,
    stage,
    acceptedScope,
    research,
    acceptedPlan,
    completingStage,
    completingArtifact
  );
  if (
    next.inputPayload.type !== 'SynthesizeArtifactV1' ||
    next.inputPayload.purpose !== 'execute_task' ||
    next.inputPayload.repairPass !== 0 ||
    task.stageId !== stage.id ||
    executionTaskSemanticHash(task) !== task.inputHash ||
    task.inputHash !== stage.inputHash ||
    !sameRef(next.inputPayload.acceptedPlan, acceptedPlan) ||
    !sameRef(next.inputPayload.acceptedScope, acceptedScope) ||
    !sameRef(next.inputPayload.research, research) ||
    !sameRefs(next.inputPayload.sourceArtifacts, expectedSources) ||
    !sameRefs(
      next.inputPayload.artifactContents.map((content) => content.artifact),
      expectedSources
    )
  ) {
    reject(
      'EXECUTION_SUCCESSOR_INPUT_MISMATCH',
      'execution successor must bind the approved task semantics and exact immutable sources'
    );
  }
}

function assertEvaluationSuccessorInput(snapshot, completingStage, completingArtifact, next) {
  const taskArtifacts = snapshot.stages
    .filter((stage) => stage.kind === 'execution')
    .map((stage) => (stage.id === completingStage.id ? artifactRef(completingArtifact) : stage.outputArtifact));
  if (taskArtifacts.some((artifact) => !artifact)) {
    reject('EVALUATION_INPUT_INCOMPLETE', 'evaluation requires every accepted execution artifact');
  }
  const acceptedScope = stageByKind(snapshot, 'compile_scope').outputArtifact;
  const research = stageByKind(snapshot, 'execute_research').outputArtifact;
  const acceptedPlan = stageByKind(snapshot, 'planning').outputArtifact;
  const sortedTasks = sortedRefs(taskArtifacts);
  const expectedSources = sortedRefs([acceptedScope, research, acceptedPlan, ...sortedTasks]);
  const executionAttempts = snapshot.attempts.filter((attempt) =>
    snapshot.stages.some(
      (stage) => stage.kind === 'execution' && stage.id === attempt.stageId
    )
  );
  const outputContracts = executionAttempts.map((attempt) => attempt.inputPayload.outputContract);
  const acceptedOutputContract = outputContracts[0];
  if (
    !acceptedOutputContract ||
    outputContracts.some(
      (contract) => canonicalJson(contract) !== canonicalJson(acceptedOutputContract)
    ) ||
    next.inputPayload.type !== 'SynthesizeArtifactV1' ||
    next.inputPayload.purpose !== 'evaluate_output' ||
    next.inputPayload.repairPass !== 0 ||
    !sameRef(next.inputPayload.acceptedScope, acceptedScope) ||
    !sameRef(next.inputPayload.research, research) ||
    !sameRef(next.inputPayload.acceptedPlan, acceptedPlan) ||
    !sameRefs(next.inputPayload.taskArtifacts, sortedTasks) ||
    !sameRefs(next.inputPayload.sourceArtifacts, expectedSources) ||
    !sameRefs(
      next.inputPayload.artifactContents.map((content) => content.artifact),
      expectedSources
    ) ||
    canonicalJson(next.inputPayload.outputContract) !== canonicalJson(acceptedOutputContract)
  ) {
    reject(
      'EVALUATION_SUCCESSOR_INPUT_MISMATCH',
      'evaluation successor must bind exact task contents and the approved output contract'
    );
  }
}

function assertSynthesisSuccessorInput(snapshot, event, evaluationAttempt, next) {
  if (
    next.inputPayload.type !== 'SynthesizeArtifactV1' ||
    next.inputPayload.purpose !== 'final_synthesis' ||
    next.inputPayload.repairPass !== 1
  ) {
    reject(
      'SYNTHESIS_SUCCESSOR_INPUT_MISMATCH',
      'synthesis successor must use SynthesizeArtifactV1'
    );
  }
  const acceptedPlan = stageByKind(snapshot, 'planning').outputArtifact;
  const executionStages = snapshot.stages.filter((stage) => stage.kind === 'execution');
  if (executionStages.some((stage) => !stage.outputArtifact)) {
    reject('SYNTHESIS_SUCCESSOR_INPUT_MISMATCH', 'synthesis requires every execution artifact');
  }
  const taskArtifacts = sortedRefs(executionStages.map((stage) => stage.outputArtifact));
  const evaluation = artifactRef(event.result.artifact);
  const expectedContentRefs = sortedRefs([
    evaluationAttempt.inputPayload.acceptedScope,
    evaluationAttempt.inputPayload.research,
    acceptedPlan,
    ...taskArtifacts,
    evaluation,
  ]);
  const observedContentRefs = next.inputPayload.artifactContents.map((content) => content.artifact);
  if (
    !sameRef(next.inputPayload.acceptedScope, evaluationAttempt.inputPayload.acceptedScope) ||
    !sameRef(next.inputPayload.research, evaluationAttempt.inputPayload.research) ||
    !sameRef(next.inputPayload.acceptedPlan, acceptedPlan) ||
    !sameRefs(next.inputPayload.taskArtifacts, taskArtifacts) ||
    !sameRef(next.inputPayload.evaluation, evaluation) ||
    !sameRefs(next.inputPayload.sourceArtifacts, expectedContentRefs) ||
    !sameRefs(observedContentRefs, expectedContentRefs) ||
    canonicalJson(next.inputPayload.outputContract) !==
      canonicalJson(evaluationAttempt.inputPayload.outputContract) ||
    next.inputPayload.outputContract.evidenceReadiness !== snapshot.run.evidenceReadiness
  ) {
    reject(
      'SYNTHESIS_SUCCESSOR_INPUT_MISMATCH',
      'synthesis successor must be derived from current accepted artifacts and output contract'
    );
  }
}

function assertExactNextAttempts(plan, event) {
  const expected = plan.createAttempts.map((attempt) => attempt.stageId).sort();
  const observed = (event.nextAttempts || []).map((attempt) => attempt.stageId).sort();
  if (canonicalJson(expected) !== canonicalJson(observed)) {
    reject('UNEXPECTED_NEXT_ATTEMPT', 'event must provide exactly the state-machine successors');
  }
}

function handleRunRequested(snapshot, event) {
  if (
    snapshot.run.status !== 'requested' ||
    snapshot.stages.length ||
    snapshot.attempts.length ||
    snapshot.approvals.length
  ) {
    reject('RUN_ALREADY_INITIALIZED', 'run request may initialize an empty requested run only');
  }
  if (canonicalHash(event.inputPayload) !== event.inputHash) {
    reject('RUN_INPUT_HASH_MISMATCH', 'initial typed input does not match its hash');
  }
  if (
    snapshot.run.ownerUserId !== event.ownerUserId ||
    snapshot.run.ownerOrganizationId !== event.ownerOrganizationId ||
    snapshot.run.mode !== event.mode ||
    snapshot.run.requestHash !== event.requestHash
  ) {
    reject('RUN_FACT_MISMATCH', 'requested run facts do not match the initialization event');
  }
  const compileRequestMatches =
    event.inputPayload.type === 'CompileScopeV2'
      ? event.inputPayload.request === event.request
      : event.inputPayload.assistantContext.instruction.content === event.request;
  if (sha256Hex(event.request) !== event.requestHash || !compileRequestMatches) {
    reject('RUN_REQUEST_HASH_MISMATCH', 'run request and compile input must bind exact bytes');
  }
  const plan = makePlan(event);
  const ids = event.stageIds;
  if (new Set(Object.values(ids)).size !== 7) {
    reject('DUPLICATE_STAGE_ID', 'the seven stable workflow stages require distinct IDs');
  }
  const stages = [
    [ids.compileScope, 'compile-scope', 'compile_scope', 'queued', 10, event.inputHash],
    [ids.gate1, 'gate-1', 'gate_1', 'pending', 20, null],
    [ids.research, 'execute-research', 'execute_research', 'pending', 30, null],
    [ids.planning, 'planning', 'planning', 'pending', 40, null],
    [ids.gate2, 'gate-2', 'gate_2', 'pending', 50, null],
    [ids.evaluation, 'evaluation', 'evaluation', 'pending', 900, null],
    [ids.synthesis, 'synthesis', 'synthesis', 'pending', 1000, null],
  ];
  plan.createStages = stages.map(([id, stageKey, kind, status, ordinal, inputHash]) => ({
    id,
    stageKey,
    kind,
    status,
    ordinal,
    inputHash,
  }));
  plan.createDependencies = [
    { stageId: ids.gate1, dependsOnStageId: ids.compileScope },
    { stageId: ids.research, dependsOnStageId: ids.gate1 },
    { stageId: ids.planning, dependsOnStageId: ids.research },
    { stageId: ids.gate2, dependsOnStageId: ids.planning },
    { stageId: ids.evaluation, dependsOnStageId: ids.gate2 },
  ];
  plan.createAttempts.push({
    id: event.attemptId,
    stageId: ids.compileScope,
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
    stageId: ids.compileScope,
    attemptId: event.attemptId,
    operationId: event.operationId,
    inputHash: event.inputHash,
    availableAt: event.occurredAt,
  });
  mutateRun(plan, snapshot.run, { status: 'running' });
  plan.audit.payload = { eventId: event.eventId, initializedStageCount: stages.length };
  return plan;
}

function handleScopeRevisionRequested(snapshot, event) {
  const scopeStage = stageByKind(snapshot, 'compile_scope');
  const gate = stageByKind(snapshot, 'gate_1');
  const research = stageByKind(snapshot, 'execute_research');
  if (event.stageId !== scopeStage.id || event.gateStageId !== gate.id) {
    reject('SCOPE_REVISION_STAGE_MISMATCH', 'scope revision does not target Gate 1');
  }
  if (
    scopeStage.status !== 'completed' ||
    gate.status !== 'awaiting_approval' ||
    research.status !== 'pending' ||
    snapshot.run.status !== 'awaiting_gate_1'
  ) {
    reject('SCOPE_REVISION_NOT_ALLOWED', 'scope may only be revised before Gate 1 approval');
  }
  if (!sameRef(scopeStage.outputArtifact, event.acceptedScope)) {
    reject('SCOPE_REVISION_HASH_MISMATCH', 'revision must bind the exact current scope artifact');
  }
  if (
    event.nextAttempt.inputPayload.type !== 'ReviseScopeV2' ||
    !sameRef(event.nextAttempt.inputPayload.acceptedScope, event.acceptedScope) ||
    event.nextAttempt.inputPayload.correction !== event.correction
  ) {
    reject(
      'SCOPE_REVISION_INPUT_MISMATCH',
      'revision attempt must bind the exact current scope and correction'
    );
  }
  const priorAttempts = snapshot.attempts.filter((attempt) => attempt.stageId === scopeStage.id);
  const nextNumber = Math.max(...priorAttempts.map((attempt) => attempt.attemptNumber), 0) + 1;
  const plan = makePlan(event);
  mutateRun(plan, snapshot.run, { status: 'running' });
  mutateStage(plan, scopeStage, {
    status: 'queued',
    input_hash: event.nextAttempt.inputHash,
    output_artifact_id: null,
  });
  mutateStage(plan, gate, { status: 'pending' });
  assertFreshAttemptIdentity(snapshot, plan, event.nextAttempt);
  plan.createAttempts.push(createdAttempt(event.nextAttempt, scopeStage, nextNumber));
  plan.outbox.push({
    idempotencyKey: `dispatch:${event.nextAttempt.operationId}`,
    commandType: 'dispatch_activity',
    stageId: scopeStage.id,
    attemptId: event.nextAttempt.attemptId,
    operationId: event.nextAttempt.operationId,
    inputHash: event.nextAttempt.inputHash,
    artifact: null,
    availableAt: event.occurredAt,
  });
  plan.audit.payload = {
    eventId: event.eventId,
    stageId: scopeStage.id,
    acceptedScopeHash: event.acceptedScope.artifactHash,
    attemptNumber: nextNumber,
  };
  return plan;
}

function handleActivityStarted(snapshot, event) {
  const stage = stageById(snapshot, event.stageId);
  const attempt = attemptById(snapshot, event.attemptId);
  assertActiveRun(snapshot);
  assertActivityStage(stage);
  if (attempt.stageId !== stage.id) {
    reject('ATTEMPT_STAGE_MISMATCH', 'attempt is not owned by the event stage');
  }
  if (stage.status !== attempt.status) {
    reject(
      'STAGE_ATTEMPT_STATUS_MISMATCH',
      `stage status ${stage.status} does not match current attempt status ${attempt.status}`
    );
  }
  if (attempt.status !== 'queued') {
    reject('ACTIVITY_NOT_STARTABLE', 'only the queued current stage attempt may start');
  }
  assertStageAttemptInputHash(stage, attempt);
  if (attempt.leaseToken !== event.leaseToken) {
    reject('STALE_LEASE', 'start event must carry the claimed lease token');
  }
  if (!attempt.leaseExpiresAt || Date.parse(attempt.leaseExpiresAt) <= Date.parse(event.occurredAt)) {
    reject('EXPIRED_LEASE', 'expired lease cannot start an activity');
  }
  const plan = makePlan(event);
  mutateStage(plan, stage, { status: 'running' });
  mutateAttempt(plan, attempt, { status: 'running', deployment_id: event.deploymentId });
  plan.audit.payload = {
    eventId: event.eventId,
    stageId: stage.id,
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    operationId: attempt.operationId,
    leaseTokenFingerprint: leaseTokenFingerprint(event.leaseToken),
    deploymentId: event.deploymentId,
  };
  return plan;
}

function handleActivityDeferred(snapshot, event) {
  const stage = stageById(snapshot, event.stageId);
  const attempt = attemptById(snapshot, event.attemptId);
  assertCurrentAttempt(snapshot, stage, attempt, event, WORKFLOW_REMOTE_STAGE_KINDS);
  const plan = makePlan(event);
  mutateStage(plan, stage, { status: 'polling' });
  mutateAttempt(plan, attempt, {
    status: 'polling',
    operation_status_url: event.statusUrl,
    clear_lease: true,
  });
  plan.outbox.push({
    idempotencyKey: `poll:${attempt.operationId}`,
    commandType: 'poll_activity',
    stageId: stage.id,
    attemptId: attempt.id,
    operationId: attempt.operationId,
    inputHash: attempt.inputHash,
    artifact: null,
    availableAt: event.nextPollAt,
  });
  plan.audit.payload = {
    eventId: event.eventId,
    stageId: stage.id,
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    operationId: attempt.operationId,
    leaseTokenFingerprint: leaseTokenFingerprint(event.leaseToken),
  };
  return plan;
}

function handleActivityDispatchAmbiguous(snapshot, event) {
  const plan = handleActivityDeferred(snapshot, event);
  plan.audit.eventType = 'ActivityDispatchAmbiguous';
  plan.audit.payload.recovery = 'poll_same_operation';
  return plan;
}

function handleActivityRedispatchRequested(snapshot, event) {
  const stage = stageById(snapshot, event.stageId);
  const attempt = attemptById(snapshot, event.attemptId);
  assertCurrentAttempt(snapshot, stage, attempt, event, WORKFLOW_REMOTE_STAGE_KINDS);
  if (!attempt.inputPayload || canonicalHash(attempt.inputPayload) !== attempt.inputHash) {
    reject('ATTEMPT_INPUT_HASH_MISMATCH', 'persisted attempt input is invalid');
  }
  const plan = makePlan(event);
  mutateStage(plan, stage, { status: 'queued' });
  mutateAttempt(plan, attempt, { status: 'queued', clear_lease: true });
  plan.outbox.push({
    idempotencyKey: `dispatch:${attempt.operationId}`,
    commandType: 'dispatch_activity',
    stageId: stage.id,
    attemptId: attempt.id,
    operationId: attempt.operationId,
    inputHash: attempt.inputHash,
    artifact: null,
    availableAt: event.redispatchAt,
  });
  plan.audit.payload = {
    eventId: event.eventId,
    stageId: stage.id,
    attemptId: attempt.id,
    operationId: attempt.operationId,
    leaseTokenFingerprint: leaseTokenFingerprint(event.leaseToken),
    recovery: 'resubmit_same_operation',
  };
  return plan;
}

function baseCompletion(plan, stage, attempt, artifact, stageStatus = 'completed') {
  plan.createArtifacts.push({
    ...artifact,
    stageId: stage.id,
    attemptId: attempt.id,
    operationId: attempt.operationId,
    inputHash: attempt.inputHash,
    canonicalContent: canonicalJson({
      contentType: artifact.contentType,
      payload: artifact.payload,
      markdown: artifact.markdown,
    }),
  });
  mutateAttempt(plan, attempt, { status: 'succeeded', clear_lease: true });
  mutateStage(plan, stage, { status: stageStatus, output_artifact_id: artifact.artifactId });
}

function completedStageIds(snapshot, completingStageId) {
  const ids = new Set(
    snapshot.stages
      .filter((stage) => ['completed', 'completed_with_evidence_gaps'].includes(stage.status))
      .map((stage) => stage.id)
  );
  ids.add(completingStageId);
  return ids;
}

function handleCompileCompleted(snapshot, event, plan, stage, attempt) {
  if (event.result.artifact.payload.authority.canonicalInputHash !== attempt.inputHash) {
    reject('SCOPE_AUTHORITY_MISMATCH', 'scope authority must seal the exact compile input hash');
  }
  const expectedSources =
    attempt.inputPayload.type === 'ReviseScopeV2'
      ? [attempt.inputPayload.acceptedScope.artifactId]
      : [];
  if (canonicalJson(event.result.artifact.sourceArtifactIds) !== canonicalJson(expectedSources)) {
    reject('SCOPE_PROVENANCE_MISMATCH', 'scope lineage must reflect compile or exact revision input');
  }
  const gate = stageByKind(snapshot, 'gate_1');
  baseCompletion(plan, stage, attempt, event.result.artifact);
  mutateStage(plan, gate, { status: 'awaiting_approval' });
  mutateRun(plan, snapshot.run, { status: 'awaiting_gate_1' });
}

function handleResearchCompleted(snapshot, event, plan, stage, attempt) {
  const scope = stageByKind(snapshot, 'compile_scope').outputArtifact;
  const payload = event.result.artifact.payload;
  if (
    payload.acceptedScopeArtifactId !== scope?.artifactId ||
    payload.acceptedScopeHash !== scope?.artifactHash ||
    payload.researchInputHash !== attempt.inputPayload.scope.researchInputHash ||
    canonicalHash(attempt.inputPayload) !== attempt.inputHash ||
    !sameRef(attempt.inputPayload.acceptedScope, scope)
  ) {
    reject('RESEARCH_INPUT_MISMATCH', 'research result must bind the exact accepted scope/input');
  }
  const evidenceRequirements = attempt.inputPayload.scope.evidenceRequirements;
  const expectedRequirementIds = evidenceRequirements
    .map((requirement) => requirement.id)
    .sort();
  const observedRequirementIds = payload.findings
    .map((finding) => finding.requirementId)
    .sort();
  const artifactType = attempt.inputPayload.scope.deliverableProfile.artifactType;
  const findingsByRequirementId = new Map(
    payload.findings.map((finding) => [finding.requirementId, finding])
  );
  const authorityMismatch = evidenceRequirements.some((requirement) => {
    const expectedBlocking = effectiveRequirementBlocking(artifactType, requirement);
    return findingsByRequirementId.get(requirement.id)?.blocking !== expectedBlocking;
  });
  if (
    canonicalJson(observedRequirementIds) !== canonicalJson(expectedRequirementIds) ||
    authorityMismatch
  ) {
    reject(
      'RESEARCH_FINDING_AUTHORITY_MISMATCH',
      'research findings must exactly project accepted evidence requirements and blocking authority'
    );
  }
  const readiness = event.result.evidenceReadiness;
  if (!readiness) reject('READINESS_REQUIRED', 'research completion requires evidence readiness');
  if (readiness === 'blocked') {
    baseCompletion(plan, stage, attempt, event.result.artifact, 'blocked');
    mutateRun(plan, snapshot.run, { status: 'running', evidence_readiness: 'blocked' });
    const planning = stageByKind(snapshot, 'planning');
    const gate2 = stageByKind(snapshot, 'gate_2');
    const evaluation = stageByKind(snapshot, 'evaluation');
    const synthesis = stageByKind(snapshot, 'synthesis');
    for (const skipped of [planning, gate2, evaluation]) {
      if (skipped.status !== 'pending' || skipped.inputHash || skipped.outputArtifact) {
        reject('BLOCKED_BRANCH_NOT_CLEAN', 'blocked research may skip only unused downstream stages');
      }
      mutateStage(plan, skipped, { status: 'cancelled' });
    }
    const next = nextAttemptFor(event, synthesis.id);
    const expectedSources = sortedRefs([scope, artifactRef(event.result.artifact)]);
    if (
      next.inputPayload.type !== 'SynthesizeArtifactV1' ||
      next.inputPayload.purpose !== 'blocked_report' ||
      next.inputPayload.repairPass !== 0 ||
      !sameRef(next.inputPayload.acceptedScope, scope) ||
      !sameRef(next.inputPayload.research, artifactRef(event.result.artifact)) ||
      !sameRefs(next.inputPayload.sourceArtifacts, expectedSources) ||
      !sameRefs(
        next.inputPayload.artifactContents.map((content) => content.artifact),
        expectedSources
      ) ||
      canonicalJson(next.inputPayload.outputContract) !==
        canonicalJson(blockedReportOutputContract(event.result.artifact.payload))
    ) {
      reject(
        'BLOCKED_REPORT_INPUT_MISMATCH',
        'blocked report must bind only the accepted scope and immutable blocked research facts'
      );
    }
    plan.createDependencies.push({ stageId: synthesis.id, dependsOnStageId: stage.id });
    queueExistingStage(plan, snapshot, event, synthesis);
    return;
  }
  const stageStatus = readiness === 'ready' ? 'completed' : 'completed_with_evidence_gaps';
  baseCompletion(plan, stage, attempt, event.result.artifact, stageStatus);
  mutateRun(plan, snapshot.run, { status: 'running', evidence_readiness: readiness });
  queueExistingStage(plan, snapshot, event, stageByKind(snapshot, 'planning'));
}

function validatePlanningTasks(tasks) {
  const keys = new Set(tasks.map((task) => task.stageKey));
  if (keys.size !== tasks.length) reject('DUPLICATE_STAGE_KEY', 'planning task keys must be unique');
  for (const task of tasks) {
    if (task.dependsOnStageKeys.includes(task.stageKey)) {
      reject('SELF_DEPENDENCY', `task ${task.stageKey} depends on itself`);
    }
    for (const dependency of task.dependsOnStageKeys) {
      if (!keys.has(dependency)) {
        reject('UNKNOWN_DEPENDENCY', `task ${task.stageKey} depends on unknown ${dependency}`);
      }
    }
  }
  const indegree = new Map(tasks.map((task) => [task.stageKey, 0]));
  const successors = new Map(tasks.map((task) => [task.stageKey, []]));
  for (const task of tasks) {
    indegree.set(task.stageKey, task.dependsOnStageKeys.length);
    for (const dependency of task.dependsOnStageKeys) {
      successors.get(dependency).push(task.stageKey);
    }
  }
  const queue = [...indegree].filter(([, value]) => value === 0).map(([key]) => key);
  let visited = 0;
  while (queue.length) {
    const key = queue.shift();
    visited += 1;
    for (const successor of successors.get(key)) {
      const remaining = indegree.get(successor) - 1;
      indegree.set(successor, remaining);
      if (remaining === 0) queue.push(successor);
    }
  }
  if (visited !== tasks.length) reject('CYCLIC_PLAN', 'execution task graph must be acyclic');
}

function handlePlanningCompleted(snapshot, event, plan, stage, attempt) {
  const planning = event.result.planning;
  if (!planning) reject('PLANNING_RESULT_REQUIRED', 'planning completion requires typed plan facts');
  validatePlanningTasks(planning.tasks);
  const stableStageKeys = new Set(snapshot.stages.map((candidate) => candidate.stageKey));
  if (planning.tasks.some((task) => stableStageKeys.has(task.stageKey))) {
    reject('RESERVED_STAGE_KEY', 'planning task stage keys must not collide with stable stages');
  }
  if (
    !sameRef(planning.acceptedScopeArtifact, stageByKind(snapshot, 'compile_scope').outputArtifact) ||
    !sameRef(planning.researchArtifact, stageByKind(snapshot, 'execute_research').outputArtifact) ||
    !sameRef(planning.acceptedScopeArtifact, attempt.inputPayload.acceptedScope) ||
    !sameRef(planning.researchArtifact, attempt.inputPayload.research) ||
    planning.outputContract.evidenceReadiness !== snapshot.run.evidenceReadiness ||
    planning.outputContract.launchReadyAllowed !== (
      snapshot.run.evidenceReadiness === 'ready' &&
      planning.outputContract.artifactType === 'launch_authorization'
    ) ||
    planning.tasks.some((task) =>
      !attempt.inputPayload.agentCatalogue.some(
        (agent) => canonicalJson(agent) === canonicalJson(task.agent)
      )
    )
  ) {
    reject(
      'PLAN_INPUT_MISMATCH',
      'plan must bind accepted authority, readiness, and exact tenant agent snapshots'
    );
  }
  const reserved = new Set(snapshot.stages.map((candidate) => candidate.id));
  const ids = new Set();
  for (const task of planning.tasks) {
    if (reserved.has(task.stageId) || ids.has(task.stageId)) {
      reject('DUPLICATE_STAGE_ID', 'planning task stage ids must be new and unique');
    }
    ids.add(task.stageId);
  }
  const gate = stageByKind(snapshot, 'gate_2');
  const evaluation = stageByKind(snapshot, 'evaluation');
  plan.createDependencies.push({
    stageId: stageByKind(snapshot, 'synthesis').id,
    dependsOnStageId: evaluation.id,
  });
  baseCompletion(plan, stage, attempt, event.result.artifact);
  const byKey = new Map(planning.tasks.map((task) => [task.stageKey, task]));
  plan.createStages.push(
    ...planning.tasks.map((task, index) => ({
      id: task.stageId,
      stageKey: task.stageKey,
      kind: 'execution',
      status: 'pending',
      ordinal: 100 + index,
      inputHash: task.inputHash,
    }))
  );
  for (const task of planning.tasks) {
    plan.createDependencies.push({ stageId: task.stageId, dependsOnStageId: gate.id });
    for (const dependencyKey of task.dependsOnStageKeys) {
      plan.createDependencies.push({
        stageId: task.stageId,
        dependsOnStageId: byKey.get(dependencyKey).stageId,
      });
    }
    plan.createDependencies.push({
      stageId: evaluation.id,
      dependsOnStageId: task.stageId,
    });
  }
  mutateStage(plan, gate, { status: 'awaiting_approval' });
  mutateRun(plan, snapshot.run, { status: 'awaiting_gate_2' });
}

function currentExecutionAttempt(snapshot, stage) {
  const candidates = snapshot.attempts.filter((candidate) =>
    candidate.stageId === stage.id &&
    candidate.inputHash === stage.inputHash &&
    candidate.inputPayload?.type === 'SynthesizeArtifactV1' &&
    candidate.inputPayload?.purpose === 'execute_task'
  );
  return candidates.find((candidate) => candidate.status === 'succeeded') || candidates.at(-1);
}

function assertPromotableCoreTopology(snapshot, coreStage, coreAttempt) {
  const coreTask = coreAttempt?.inputPayload?.task;
  const executionStages = snapshot.stages.filter((candidate) => candidate.kind === 'execution');
  const specialistStages = executionStages.filter((candidate) => candidate.id !== coreStage?.id);
  const dependencyStages = snapshot.dependencies
    .filter((dependency) => dependency.stageId === coreStage?.id)
    .map((dependency) => stageById(snapshot, dependency.dependsOnStageId))
    .filter((dependency) => dependency.kind === 'execution');
  const specialistKeys = specialistStages.map((candidate) => candidate.stageKey).sort();
  const dependencyKeys = dependencyStages.map((candidate) => candidate.stageKey).sort();
  const declaredKeys = [...(coreTask?.dependsOnStageKeys || [])].sort();
  const specialistAttempts = specialistStages.map((candidate) =>
    currentExecutionAttempt(snapshot, candidate)
  );
  const validSpecialists = specialistStages.every((candidate, index) => {
    const specialistAttempt = specialistAttempts[index];
    const task = specialistAttempt?.inputPayload?.task;
    const executionDependencies = snapshot.dependencies
      .filter((dependency) => dependency.stageId === candidate.id)
      .map((dependency) => stageById(snapshot, dependency.dependsOnStageId))
      .filter((dependency) => dependency.kind === 'execution');
    return (
      ['completed', 'completed_with_evidence_gaps'].includes(candidate.status) &&
      candidate.outputArtifact?.kind === 'task_result' &&
      specialistAttempt?.status === 'succeeded' &&
      task?.taskKind === 'specialist_analysis' &&
      task.producesFullContract === false &&
      task.stageId === candidate.id &&
      task.dependsOnStageKeys.length === 0 &&
      executionDependencies.length === 0
    );
  });
  if (
    !coreStage ||
    !coreTask ||
    coreTask.stageId !== coreStage.id ||
    coreTask.taskKind !== 'core_draft' ||
    !coreTask.producesFullContract ||
    specialistStages.length < 2 ||
    !validSpecialists ||
    canonicalJson(dependencyKeys) !== canonicalJson(specialistKeys) ||
    canonicalJson(declaredKeys) !== canonicalJson(specialistKeys)
  ) {
    reject(
      'FINAL_CANDIDATE_TOPOLOGY_MISMATCH',
      'a promotable core must depend on every completed independent specialist analysis'
    );
  }
}

function handleExecutionCompleted(snapshot, event, plan, stage, attempt) {
  const artifact = event.result.artifact;
  const planArtifact = stageByKind(snapshot, 'planning').outputArtifact;
  const scopeArtifact = stageByKind(snapshot, 'compile_scope').outputArtifact;
  const researchArtifact = stageByKind(snapshot, 'execute_research').outputArtifact;
  if (
    attempt.inputPayload.type !== 'SynthesizeArtifactV1' ||
    attempt.inputPayload.purpose !== 'execute_task' ||
    attempt.inputPayload.repairPass !== 0 ||
    attempt.inputPayload.outputContract.evidenceReadiness !== snapshot.run.evidenceReadiness
  ) {
    reject('TASK_RESULT_INPUT_MISMATCH', 'execution must use the bounded AxWise task purpose');
  }
  assertEvidenceMarkers(artifact, attempt.inputPayload);
  if (artifact.kind === 'task_result') {
    if (
      artifact.payload.task.stageId !== stage.id ||
      canonicalJson(artifact.payload.task) !== canonicalJson(attempt.inputPayload.task) ||
      !sameRef(artifact.payload.acceptedPlan, planArtifact) ||
      !sameRef(artifact.payload.acceptedScope, scopeArtifact) ||
      !sameRef(artifact.payload.research, researchArtifact) ||
      !sameRefs(artifact.payload.sourceArtifacts, attempt.inputPayload.sourceArtifacts) ||
      artifact.payload.evidenceReadiness !== snapshot.run.evidenceReadiness ||
      canonicalJson(artifact.payload.executionReceipt.agent) !==
        canonicalJson(attempt.inputPayload.task.agent)
    ) {
      reject('TASK_RESULT_INPUT_MISMATCH', 'task result must bind exact execution inputs');
    }
  } else {
    const attestation = artifact.payload.candidateAttestation;
    assertPromotableCoreTopology(snapshot, stage, attempt);
    if (
      attempt.inputPayload.task.taskKind !== 'core_draft' ||
      !attempt.inputPayload.task.producesFullContract ||
      !attestation ||
      canonicalJson(attestation.task) !== canonicalJson(attempt.inputPayload.task) ||
      canonicalJson(attestation.requirementCoverage.map((item) => item.requirementId)) !==
        canonicalJson(attempt.inputPayload.outputContract.requirementIds) ||
      artifact.payload.evidenceReadiness !== snapshot.run.evidenceReadiness ||
      artifact.payload.launchReady !== attempt.inputPayload.outputContract.launchReadyAllowed ||
      !sameRefs(artifact.payload.sourceArtifacts, attempt.inputPayload.sourceArtifacts)
    ) {
      reject(
        'FINAL_READINESS_MISMATCH',
        'only the complete dependency-bound core may return a final candidate without changing readiness'
      );
    }
  }
  baseCompletion(plan, stage, attempt, event.result.artifact);
  const completed = completedStageIds(snapshot, stage.id);
  const executionStages = snapshot.stages.filter((candidate) => candidate.kind === 'execution');
  const unfinished = executionStages.filter((candidate) => !completed.has(candidate.id));
  if (unfinished.length === 0) {
    const evaluation = stageByKind(snapshot, 'evaluation');
    const evaluationNext = nextAttemptFor(event, evaluation.id);
    assertEvaluationSuccessorInput(snapshot, stage, artifact, evaluationNext);
    queueExistingStage(plan, snapshot, event, evaluation);
    return;
  }
  const ready = unfinished.filter((candidate) => {
    if (candidate.status !== 'pending') return false;
    const dependencies = snapshot.dependencies
      .filter((dependency) => dependency.stageId === candidate.id)
      .map((dependency) => dependency.dependsOnStageId)
      .filter((dependencyId) => stageById(snapshot, dependencyId).kind === 'execution');
    return dependencies.every((dependencyId) => completed.has(dependencyId));
  });
  for (const successor of ready) {
    const next = nextAttemptFor(event, successor.id);
    assertExecutionSuccessorInput(
      snapshot,
      successor,
      next,
      planArtifact,
      stage,
      artifact
    );
    queueExistingStage(plan, snapshot, event, successor);
  }
}

function terminalStatusForReadiness(readiness) {
  if (readiness === 'ready') return 'completed';
  if (readiness === 'ready_with_gaps') return 'completed_with_evidence_gaps';
  return 'blocked';
}

function handleEvaluationCompleted(snapshot, event, plan, stage, attempt) {
  const executionStages = snapshot.stages.filter((candidate) => candidate.kind === 'execution');
  if (executionStages.some((candidate) => !candidate.outputArtifact)) {
    reject('EVALUATION_INPUT_MISMATCH', 'evaluation requires every execution artifact');
  }
  const expectedTaskArtifacts = executionStages
    .map((candidate) => candidate.outputArtifact)
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  const observedTaskArtifacts = [...event.result.artifact.payload.taskArtifacts].sort((left, right) =>
    left.artifactId.localeCompare(right.artifactId)
  );
  if (canonicalJson(expectedTaskArtifacts) !== canonicalJson(observedTaskArtifacts)) {
    reject('EVALUATION_INPUT_MISMATCH', 'evaluation result must cover exact task artifacts');
  }
  const expectedSources = sortedRefs([
    stageByKind(snapshot, 'compile_scope').outputArtifact,
    stageByKind(snapshot, 'execute_research').outputArtifact,
    stageByKind(snapshot, 'planning').outputArtifact,
    ...expectedTaskArtifacts,
  ]);
  if (
    attempt.inputPayload.type !== 'SynthesizeArtifactV1' ||
    attempt.inputPayload.purpose !== 'evaluate_output' ||
    attempt.inputPayload.repairPass !== 0 ||
    !sameRefs(attempt.inputPayload.taskArtifacts, observedTaskArtifacts) ||
    !sameRefs(event.result.artifact.payload.sourceArtifacts, expectedSources) ||
    !sameRef(attempt.inputPayload.acceptedScope, stageByKind(snapshot, 'compile_scope').outputArtifact) ||
    !sameRef(attempt.inputPayload.research, stageByKind(snapshot, 'execute_research').outputArtifact) ||
    !sameRef(attempt.inputPayload.acceptedPlan, stageByKind(snapshot, 'planning').outputArtifact) ||
    !sameRefs(attempt.inputPayload.sourceArtifacts, expectedSources) ||
    !sameRefs(
      attempt.inputPayload.artifactContents.map((content) => content.artifact),
      expectedSources
    ) ||
    event.result.artifact.payload.outputContractHash !==
      canonicalHash(attempt.inputPayload.outputContract) ||
    event.result.artifact.payload.repairPass !== 0 ||
    event.result.artifact.payload.evidenceReadiness !== snapshot.run.evidenceReadiness ||
    attempt.inputPayload.outputContract.evidenceReadiness !== snapshot.run.evidenceReadiness
  ) {
    reject('EVALUATION_READINESS_MISMATCH', 'evaluation readiness must equal research readiness');
  }
  baseCompletion(plan, stage, attempt, event.result.artifact);
  if (event.result.artifact.payload.outputContractSatisfied) {
    const promoted = event.result.artifact.payload.promotedArtifact;
    if (!promoted || promoted.kind !== 'final_markdown') {
      reject('FINAL_MARKDOWN_REQUIRED', 'direct promotion requires a final_markdown artifact');
    }
    const promotedStage = snapshot.stages.find(
      (candidate) => candidate.kind === 'execution' && sameRef(candidate.outputArtifact, promoted)
    );
    const promotedContent = attempt.inputPayload.artifactContents.find(
      (content) => sameRef(content.artifact, promoted)
    );
    const promotedAttempt = promotedStage && currentExecutionAttempt(snapshot, promotedStage);
    const candidateAttestation = promotedContent?.payload?.candidateAttestation;
    // AxWise owns prose-level cognitive safety. Orqaly accepts only its typed,
    // immutable evaluation and enforces workflow, provenance, and receipt integrity.
    const issueFields = [
      'unmetRequirementIds',
      'unresolvedSourceMarkers',
      'unsupportedPrecision',
      'contradictions',
      'staleTopicReferences',
      'readinessViolations',
      'substantiveContentDefects',
      'practicalityDefects',
    ];
    const finalCandidates = expectedTaskArtifacts.filter(
      (candidate) => candidate.kind === 'final_markdown'
    );
    assertPromotableCoreTopology(snapshot, promotedStage, promotedAttempt);
    if (
      !promotedStage ||
      promotedAttempt?.status !== 'succeeded' ||
      !promotedAttempt?.inputPayload.task.producesFullContract ||
      promotedAttempt.inputPayload.task.taskKind !== 'core_draft' ||
      finalCandidates.length !== 1 ||
      !sameRef(finalCandidates[0], promoted) ||
      issueFields.some((field) => event.result.artifact.payload[field].length !== 0) ||
      !candidateAttestation ||
      canonicalJson(candidateAttestation.task) !==
        canonicalJson(promotedAttempt.inputPayload.task) ||
      canonicalJson(candidateAttestation.requirementCoverage.map((item) => item.requirementId)) !==
        canonicalJson(attempt.inputPayload.outputContract.requirementIds) ||
      !sameRefs(
        promotedContent.payload.sourceArtifacts,
        promotedAttempt.inputPayload.sourceArtifacts
      )
    ) {
      reject(
        'PROMOTION_ARTIFACT_MISMATCH',
        'only the sole exact dependency-bound full-contract core candidate may be promoted'
      );
    }
    const synthesis = stageByKind(snapshot, 'synthesis');
    if (synthesis.status !== 'pending' || synthesis.inputHash || synthesis.outputArtifact) {
      reject(
        'SYNTHESIS_NOT_SKIPPABLE',
        'direct promotion may cancel only the unused pending synthesis stage'
      );
    }
    const readiness = snapshot.run.evidenceReadiness || 'blocked';
    mutateStage(plan, synthesis, { status: 'cancelled' });
    mutateRun(plan, snapshot.run, {
      status: terminalStatusForReadiness(readiness),
      final_artifact_id: promoted.artifactId,
    });
    plan.outbox.push({
      idempotencyKey: `export-final:${promoted.artifactId}:${promoted.artifactHash}`,
      commandType: 'export_final_artifact',
      stageId: stage.id,
      attemptId: attempt.id,
      operationId: attempt.operationId,
      inputHash: attempt.inputHash,
      artifact: artifactRef(promoted),
      availableAt: event.occurredAt,
    });
    return;
  }
  const synthesis = stageByKind(snapshot, 'synthesis');
  const synthesisNext = nextAttemptFor(event, synthesis.id);
  assertSynthesisSuccessorInput(snapshot, event, attempt, synthesisNext);
  queueExistingStage(plan, snapshot, event, synthesis);
}

function handleSynthesisCompleted(snapshot, event, plan, stage, attempt) {
  if (event.result.artifact.kind !== 'final_markdown') {
    reject('FINAL_MARKDOWN_REQUIRED', 'synthesis must return a final_markdown artifact');
  }
  assertEvidenceMarkers(event.result.artifact, attempt.inputPayload);
  const purpose = attempt.inputPayload.purpose;
  if (!['final_synthesis', 'blocked_report'].includes(purpose)) {
    reject('SYNTHESIS_PURPOSE_MISMATCH', 'synthesis stage received an invalid bounded purpose');
  }
  if (event.result.artifact.payload.candidateAttestation !== null) {
    reject('FINAL_CANDIDATE_ATTESTATION_FORBIDDEN', 'terminal synthesis cannot impersonate a task candidate');
  }
  // AxWise validates the Markdown itself. Orqaly must not reinterpret prose; it
  // enforces the exact typed readiness contract and immutable artifact bindings.
  if (
    event.result.artifact.payload.evidenceReadiness !== snapshot.run.evidenceReadiness ||
    attempt.inputPayload.outputContract.evidenceReadiness !== snapshot.run.evidenceReadiness ||
    event.result.artifact.payload.launchReady !==
      attempt.inputPayload.outputContract.launchReadyAllowed
  ) {
    reject('FINAL_READINESS_MISMATCH', 'final artifact readiness must equal research readiness');
  }
  const expectedSources = attempt.inputPayload.sourceArtifacts;
  if (!sameRefs(event.result.artifact.payload.sourceArtifacts, expectedSources)) {
    reject('FINAL_PROVENANCE_MISMATCH', 'final artifact must bind exact synthesis inputs');
  }
  if (purpose === 'blocked_report') {
    const expected = sortedRefs([
      attempt.inputPayload.acceptedScope,
      attempt.inputPayload.research,
    ]);
    if (
      snapshot.run.evidenceReadiness !== 'blocked' ||
      attempt.inputPayload.repairPass !== 0 ||
      !sameRefs(expectedSources, expected)
    ) {
      reject(
        'BLOCKED_REPORT_INPUT_MISMATCH',
        'blocked report cannot run launch planning or change evidence authority'
      );
    }
  } else {
    const evaluationContent = attempt.inputPayload.artifactContents.find(
      (content) => sameRef(content.artifact, attempt.inputPayload.evaluation)
    );
    if (
      attempt.inputPayload.repairPass !== 1 ||
      !evaluationContent?.payload?.repairRequired ||
      evaluationContent.payload.repairPass !== 0
    ) {
      reject(
        'TARGETED_REPAIR_MISMATCH',
        'final synthesis is the single repair pass authorized by immutable evaluation facts'
      );
    }
  }
  baseCompletion(plan, stage, attempt, event.result.artifact);
  const readiness = snapshot.run.evidenceReadiness || 'blocked';
  mutateRun(plan, snapshot.run, {
    status: terminalStatusForReadiness(readiness),
    final_artifact_id: event.result.artifact.artifactId,
  });
  plan.outbox.push({
    idempotencyKey: `export-final:${event.result.artifact.artifactId}:${event.result.artifact.artifactHash}`,
    commandType: 'export_final_artifact',
    stageId: stage.id,
    attemptId: attempt.id,
    operationId: attempt.operationId,
    inputHash: attempt.inputHash,
    artifact: artifactRef(event.result.artifact),
    availableAt: event.occurredAt,
  });
}

function handleActivityCompleted(snapshot, event) {
  const stage = stageById(snapshot, event.stageId);
  const attempt = attemptById(snapshot, event.attemptId);
  assertCurrentAttempt(snapshot, stage, attempt, event);
  const plan = makePlan(event);
  const expectedResult = {
    compile_scope: 'scope_compiled',
    execute_research: 'research_completed',
    planning: 'plan_created',
    execution: 'task_completed',
    evaluation: 'evaluation_completed',
    synthesis: 'artifact_synthesized',
  }[stage.kind];
  if (event.result.resultType !== expectedResult) {
    reject('RESULT_STAGE_MISMATCH', `result ${event.result.resultType} cannot complete ${stage.kind}`);
  }
  switch (stage.kind) {
    case 'compile_scope':
      handleCompileCompleted(snapshot, event, plan, stage, attempt);
      break;
    case 'execute_research':
      handleResearchCompleted(snapshot, event, plan, stage, attempt);
      break;
    case 'planning':
      handlePlanningCompleted(snapshot, event, plan, stage, attempt);
      break;
    case 'execution':
      handleExecutionCompleted(snapshot, event, plan, stage, attempt);
      break;
    case 'evaluation':
      handleEvaluationCompleted(snapshot, event, plan, stage, attempt);
      break;
    case 'synthesis':
      handleSynthesisCompleted(snapshot, event, plan, stage, attempt);
      break;
    default:
      reject('NON_ACTIVITY_STAGE', `stage ${stage.kind} cannot complete an activity`);
  }
  plan.audit.payload = {
    eventId: event.eventId,
    stageId: stage.id,
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    artifactId: event.result.artifact.artifactId,
    artifactHash: event.result.artifact.artifactHash,
    operationId: attempt.operationId,
    leaseTokenFingerprint: leaseTokenFingerprint(event.leaseToken),
    metrics: event.result.metrics || null,
  };
  assertExactNextAttempts(plan, event);
  return plan;
}

function handleActivityFailed(snapshot, event) {
  const stage = stageById(snapshot, event.stageId);
  const attempt = attemptById(snapshot, event.attemptId);
  assertCurrentAttempt(snapshot, stage, attempt, event);
  const plan = makePlan(event);
  mutateAttempt(plan, attempt, {
    status: 'failed',
    error_class: event.errorClass,
    clear_lease: true,
  });
  const retryLimit = RETRY_LIMIT_BY_STAGE_KIND[stage.kind] || 1;
  if (event.retryable && attempt.attemptNumber < retryLimit) {
    if (!event.nextAttempt) {
      reject('NEXT_ATTEMPT_REQUIRED', 'retryable terminal failure requires new attempt identity');
    }
    if (event.nextAttempt.inputHash !== attempt.inputHash) {
      reject('RETRY_INPUT_CHANGED', 'retry must retain the canonical input hash');
    }
    mutateStage(plan, stage, { status: 'queued' });
    if (canonicalJson(event.nextAttempt.inputPayload) !== canonicalJson(attempt.inputPayload)) {
      reject('RETRY_INPUT_CHANGED', 'retry must retain the exact canonical typed input');
    }
    assertFreshAttemptIdentity(snapshot, plan, event.nextAttempt);
    plan.createAttempts.push(createdAttempt(event.nextAttempt, stage, attempt.attemptNumber + 1));
    plan.outbox.push({
      idempotencyKey: `dispatch:${event.nextAttempt.operationId}`,
      commandType: 'dispatch_activity',
      stageId: stage.id,
      attemptId: event.nextAttempt.attemptId,
      operationId: event.nextAttempt.operationId,
      inputHash: event.nextAttempt.inputHash,
      artifact: null,
      availableAt: event.occurredAt,
    });
  } else {
    mutateStage(plan, stage, { status: 'failed' });
    mutateRun(plan, snapshot.run, { status: 'failed' });
  }
  plan.audit.payload = {
    eventId: event.eventId,
    stageId: stage.id,
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    retryScheduled: plan.createAttempts.length === 1,
    errorClass: event.errorClass,
    operationId: attempt.operationId,
    leaseTokenFingerprint: leaseTokenFingerprint(event.leaseToken),
  };
  return plan;
}

function handleLeaseExpired(snapshot, event) {
  const stage = stageById(snapshot, event.stageId);
  const attempt = attemptById(snapshot, event.attemptId);
  assertActiveRun(snapshot);
  assertActivityStage(stage);
  if (attempt.stageId !== stage.id || event.leaseToken !== attempt.leaseToken) {
    reject('STALE_LEASE', 'only the currently recorded lease may expire');
  }
  if (!['running', 'polling'].includes(attempt.status)) {
    reject('LEASE_NOT_RECOVERABLE', `attempt status ${attempt.status} has no recoverable lease`);
  }
  if (stage.status !== attempt.status) {
    reject(
      'STAGE_ATTEMPT_STATUS_MISMATCH',
      `stage status ${stage.status} does not match current attempt status ${attempt.status}`
    );
  }
  assertStageAttemptInputHash(stage, attempt);
  if (!attempt.leaseExpiresAt || Date.parse(attempt.leaseExpiresAt) > Date.parse(event.occurredAt)) {
    reject('LEASE_NOT_EXPIRED', 'an active lease cannot be recovered');
  }
  const polling = attempt.status === 'polling';
  const plan = makePlan(event);
  mutateStage(plan, stage, { status: polling ? 'polling' : 'queued' });
  mutateAttempt(plan, attempt, {
    status: polling ? 'polling' : 'queued',
    clear_lease: true,
  });
  plan.outbox.push({
    idempotencyKey: `${polling ? 'poll' : 'dispatch'}:${attempt.operationId}`,
    commandType: polling ? 'poll_activity' : 'dispatch_activity',
    stageId: stage.id,
    attemptId: attempt.id,
    operationId: attempt.operationId,
    inputHash: attempt.inputHash,
    artifact: null,
    availableAt: event.requeueAt,
  });
  plan.audit.payload = {
    eventId: event.eventId,
    stageId: stage.id,
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    operationId: attempt.operationId,
    leaseTokenFingerprint: leaseTokenFingerprint(event.leaseToken),
    recovery: polling ? 'poll_same_operation' : 'dispatch_same_operation',
  };
  return plan;
}

function handleApprovalGranted(snapshot, event) {
  const expectedDecisionHash = canonicalHash({
    approvalKind: event.approvalKind,
    artifact: event.artifact,
    inputHash: event.inputHash,
    selectedEvidence: event.selectedEvidence,
  });
  if (event.decisionHash !== expectedDecisionHash) {
    reject('APPROVAL_DECISION_HASH_MISMATCH', 'approval decision hash changed');
  }
  const duplicate = snapshot.approvals.find(
    (approval) => approval.idempotencyKey === event.idempotencyKey
  );
  if (duplicate) {
    if (
      duplicate.stageId !== event.stageId ||
      duplicate.inputHash !== event.inputHash ||
      duplicate.decisionHash !== event.decisionHash ||
      !sameRef(duplicate.artifact, event.artifact) ||
      duplicate.decision !== 'approved'
    ) {
      reject('IDEMPOTENCY_CONFLICT', 'approval idempotency key was reused with changed input');
    }
    const plan = makePlan(event);
    plan.audit.eventType = 'ApprovalDuplicateAdopted';
    plan.audit.payload = {
      eventId: event.eventId,
      approvalId: duplicate.id,
      idempotencyKey: duplicate.idempotencyKey,
    };
    return plan;
  }

  const stage = stageById(snapshot, event.stageId);
  const expectedKind = event.approvalKind === 'scope' ? 'gate_1' : 'gate_2';
  const expectedRunStatus = event.approvalKind === 'scope'
    ? 'awaiting_gate_1'
    : 'awaiting_gate_2';
  if (snapshot.run.status !== expectedRunStatus) {
    reject(
      'APPROVAL_NOT_ALLOWED',
      `${event.approvalKind} approval requires run status ${expectedRunStatus}`
    );
  }
  if (stage.kind !== expectedKind || stage.status !== 'awaiting_approval') {
    reject('APPROVAL_NOT_ALLOWED', `${event.approvalKind} approval does not match active gate`);
  }
  const producer = stageByKind(snapshot, event.approvalKind === 'scope' ? 'compile_scope' : 'planning');
  if (!sameRef(producer.outputArtifact, event.artifact) || producer.inputHash !== event.inputHash) {
    reject('APPROVAL_HASH_MISMATCH', 'approval must bind exact producer artifact and input hashes');
  }

  const plan = makePlan(event);
  mutateStage(plan, stage, { status: 'completed' });
  mutateRun(plan, snapshot.run, { status: 'running' });
  plan.createApproval = {
    id: event.approvalId,
    kind: event.approvalKind,
    stageId: stage.id,
    artifact: event.artifact,
    inputHash: event.inputHash,
    idempotencyKey: event.idempotencyKey,
    decisionHash: event.decisionHash,
    decidedBy: event.decidedBy,
  };

  if (event.approvalKind === 'scope') {
    const research = stageByKind(snapshot, 'execute_research');
    const researchNext = nextAttemptFor(event, research.id);
    if (
      researchNext.inputPayload.type !== 'ExecuteResearchV2' ||
      !sameRef(researchNext.inputPayload.acceptedScope, event.artifact) ||
      artifactContentHash({
        contentType: 'application/json',
        payload: researchNext.inputPayload.scope,
        markdown: null,
      }) !== event.artifact.artifactHash ||
      !sameRefs(researchNext.inputPayload.selectedEvidence, event.selectedEvidence)
    ) {
      reject(
        'SCOPE_APPROVAL_INPUT_MISMATCH',
        'research successor must bind approved scope and exact selected evidence'
      );
    }
    queueExistingStage(plan, snapshot, event, research);
  } else {
    const executionStages = snapshot.stages.filter((candidate) => candidate.kind === 'execution');
    const roots = executionStages.filter((candidate) => {
      const executionDependencies = snapshot.dependencies.filter(
        (dependency) =>
          dependency.stageId === candidate.id &&
          stageById(snapshot, dependency.dependsOnStageId).kind === 'execution'
      );
      return executionDependencies.length === 0;
    });
    if (!roots.length) reject('PLAN_WITHOUT_ROOTS', 'accepted execution DAG must have a root');
    for (const root of roots) {
      const rootNext = nextAttemptFor(event, root.id);
      assertExecutionSuccessorInput(snapshot, root, rootNext, event.artifact);
      queueExistingStage(plan, snapshot, event, root);
    }
  }
  plan.audit.payload = {
    eventId: event.eventId,
    approvalId: event.approvalId,
    approvalKind: event.approvalKind,
    stageId: stage.id,
    artifactId: event.artifact.artifactId,
    artifactHash: event.artifact.artifactHash,
    inputHash: event.inputHash,
  };
  assertExactNextAttempts(plan, event);
  return plan;
}

const TRANSITION_HANDLERS = Object.freeze({
  RunRequested: handleRunRequested,
  ScopeRevisionRequested: handleScopeRevisionRequested,
  ActivityStarted: handleActivityStarted,
  ActivityDeferred: handleActivityDeferred,
  ActivityDispatchAmbiguous: handleActivityDispatchAmbiguous,
  ActivityRedispatchRequested: handleActivityRedispatchRequested,
  ActivityCompleted: handleActivityCompleted,
  ActivityFailed: handleActivityFailed,
  LeaseExpired: handleLeaseExpired,
  ApprovalGranted: handleApprovalGranted,
});

export const WORKFLOW_TRANSITION_EVENT_TYPES = Object.freeze(
  [...Object.keys(TRANSITION_HANDLERS), ...CAPABILITY_OWNER_EVENT_TYPES]
);

export function transition(rawSnapshot, rawEvent) {
  const snapshot = WorkflowSnapshotSchema.parse(rawSnapshot);
  const event = WorkflowEventSchema.parse(rawEvent);
  assertEventIdentity(snapshot, event);
  const capabilityPlan = capabilityTransition(snapshot, event, {
    reject, makePlan, mutateRun, mutateStage, mutateAttempt, stageById, attemptById,
    assertCurrentAttempt, assertFreshAttemptIdentity, baseCompletion,
    validateCapabilityEnvelope(envelope) {
      try { AxWiseOperationEnvelopeSchema.parse(envelope); }
      catch { reject('CAPABILITY_CONSENT_MISMATCH', 'capability consent must bind the exact owner and operation input'); }
    },
    validateCapabilityCompletion(input, result, binding) {
      try { validateCapabilityResultForInput(input, result, binding); }
      catch { reject('CAPABILITY_RESULT_MISMATCH', 'capability result must bind its exact input and immutable sources'); }
    },
  });
  if (capabilityPlan) return TransitionPlanSchema.parse(capabilityPlan);
  const handler = TRANSITION_HANDLERS[event.type];
  if (!handler) reject('UNKNOWN_EVENT', `unsupported event ${event.type}`);
  const plan = handler(snapshot, event);
  return TransitionPlanSchema.parse(plan);
}

export const workflowRetryLimits = RETRY_LIMIT_BY_STAGE_KIND;
