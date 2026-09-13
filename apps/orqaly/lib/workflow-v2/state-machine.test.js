import { afterAll, describe, expect, it } from 'vitest';
import { artifactContentHash, canonicalHash, canonicalJson, sha256Hex } from './canonical.js';
import {
  transition,
  workflowRetryLimits,
  WorkflowTransitionError,
} from './state-machine.js';
import { WORKFLOW_TRANSITION_CELLS } from './transition-table.js';
import {
  TransitionPlanSchema,
  blockedReportOutputContract,
} from '../../shared/workflow-v2/contracts.js';
import { workflowPlanRequirements } from '../../server/workflow-v2/internal-activity-executor.js';
import compileScopeV3Envelope from '../../shared/workflow-v2/fixtures/compile_scope_envelope_v3.json';
import { fixture as capabilityFixture } from '../../server/workflow-v2/capability-work-test-helpers.js';

const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const at = (minute = 10) => `2026-08-27T10:${String(minute).padStart(2, '0')}:00.000Z`;
const request = 'Create an Estonia cat-food launch PRD.';
const ids = {
  tenant: id(1), run: id(2), owner: 'user_stateowner123',
  compile: id(10), gate1: id(11), research: id(12), planning: id(13), gate2: id(14),
  evaluation: id(15), synthesis: id(16), executionA: id(17), executionB: id(18),
  executionC: id(19),
  compileAttempt: id(30), researchAttempt: id(31), planningAttempt: id(32),
  executionAttemptA: id(33), executionAttemptB: id(34), executionAttemptC: id(37),
  evaluationAttempt: id(35),
  synthesisAttempt: id(36), compileOperation: id(50), researchOperation: id(51),
  planningOperation: id(52), executionOperationA: id(53), executionOperationB: id(54),
  executionOperationC: id(57),
  evaluationOperation: id(55), synthesisOperation: id(56), lease: id(70),
};

describe('default-disabled explicit capability owner cells', () => {
  it('initializes only the explicitly requested capability scope', async () => {
    const f = capabilityFixture(); await f.start();
    const initial = structuredClone(f.snapshot());
    initial.run.status = 'requested'; initial.run.rowVersion = 0;
    initial.stages = []; initial.attempts = []; initial.dependencies = []; initial.approvals = [];
    const plan = transitionCell('capability-run-requested', initial, f.plans[0].event);
    expect(plan.createStages.map((stage) => stage.kind)).toEqual(['compile_scope', 'gate_1']);
  });
  it('records owner scope approval without a paid successor', async () => {
    const f = capabilityFixture(); await f.start(); f.compile();
    const before = structuredClone(f.snapshot()); await f.approve();
    const plan = transitionCell('capability-scope-approved', before, f.plans.at(-1).event);
    expect(plan.outbox).toEqual([]); expect(plan.runMutation.patch.status).toBe('awaiting_capability_input');
  });
  it('adds exactly the requested model-free admission activity', async () => {
    const f = capabilityFixture(); await f.ready();
    const before = structuredClone(f.snapshot()); await f.admit();
    const event = f.plans.find((plan) => plan.event.type === 'CapabilityActivityRequested').event;
    const plan = transitionCell('capability-activity-requested', before, event);
    expect(plan.createAttempts.map((attempt) => attempt.inputPayload.type)).toEqual(['AdmitTranscriptCorpusV1']);
  });
});

function sourceSpan(text) {
  const start = request.indexOf(text);
  return {
    start,
    end: start + text.length,
    text,
    sha256: sha256Hex(text),
    offsetUnit: 'utf16_code_units',
  };
}

function ref(artifact) {
  return {
    artifactId: artifact.artifactId,
    artifactHash: artifact.artifactHash,
    kind: artifact.kind,
  };
}

function semanticId(prefix, value) {
  const { id: _id, ...semanticValue } = value;
  return `${prefix}-${canonicalHash(semanticValue).slice(0, 16)}`;
}

function requirement(category, description, priority = 'P1', authority = 'owner') {
  const core = { category, description, priority, authority };
  return { id: semanticId('req', core), ...core };
}

function fact(artifactId, kind, contentType, payload, sourceArtifactIds = []) {
  const markdown = contentType === 'text/markdown' ? payload.markdown : null;
  const value = {
    artifactId,
    kind,
    contentType,
    payload,
    markdown,
    sourceArtifactIds: [...sourceArtifactIds].sort(),
  };
  return { ...value, artifactHash: artifactContentHash(value) };
}

function compileInput() {
  return {
    type: 'CompileScopeV2',
    request,
    objectiveOnlyContext: [],
    safeDefaults: {
      geography: [], acceptedSourceTypes: [], assumptions: [], limits: [], policies: [],
    },
  };
}

function scopePayload(inputHash = canonicalHash(compileInput())) {
  const deliverables = ['Product requirements document'];
  const personas = ['Estonian cat owner'];
  const interviewRequirements = ['Interview five cat owners'];
  const prdRequirements = ['Product requirements document'];
  const limits = ['No invented prices'];
  const policies = ['Cite claim IDs'];
  const evidenceRequirements = [
    {
      id: 'feed-law', claimType: 'legal_requirement', description: 'Verify feed law.',
      criticality: 'blocking', appliesWhen: 'launching in Estonia',
      evidenceRole: 'grounded_claim',
      verificationBasis: 'grounded_claims',
      acceptedSourceTypes: ['government', 'primary_law'],
      allowedSourceHosts: [],
    },
    {
      id: 'market-size', claimType: 'market_statistic', description: 'Estimate market size.',
      criticality: 'nonblocking', appliesWhen: 'reliable data exists',
      evidenceRole: 'grounded_claim',
      verificationBasis: 'grounded_claims',
      acceptedSourceTypes: ['industry', 'official_statistics'],
      allowedSourceHosts: [],
    },
  ];
  const requirements = [
    ...deliverables.map((description) => requirement('deliverable', description, 'P0')),
    ...personas.map((description) => requirement('persona', description)),
    ...interviewRequirements.map((description) => requirement('interview', description)),
    ...prdRequirements.map((description) => requirement('prd', description, 'P0')),
    ...limits.map((description) => requirement('limit', description, 'P0')),
    ...policies.map((description) => requirement('policy', description)),
    ...evidenceRequirements.map(({ description, criticality }) =>
      requirement('evidence', description, criticality === 'blocking' ? 'P0' : 'P2')
    ),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const criterionCore = {
    given: 'The accepted product scope and research evidence are available.',
    when: 'The product requirements document is evaluated.',
    then: 'Every accepted requirement is traceable to a concrete product decision.',
    supports: requirements.map(({ id: requirementId }) => requirementId),
  };
  return {
    schemaVersion: 'axwise.scope.v2',
    objective: request,
    objectiveSourceSpans: [sourceSpan(request)],
    topicAnchors: [{ value: 'cat-food', sourceSpans: [sourceSpan('cat-food')] }],
    geography: ['Estonia'],
    evidenceRequirements,
    deliverables,
    personas,
    interviewRequirements,
    prdRequirements,
    limits,
    policies,
    assumptions: [],
    deliverableProfile: {
      schemaVersion: 'axwise.deliverable-profile.v1',
      artifactType: 'product_prd',
      domain: 'Commercial cat-food launch in Estonia',
      problem: 'Define a useful, evidence-bounded cat-food product for Estonian cat owners.',
      desiredOutcome: 'An actionable product PRD with explicit evidence gaps and launch limits.',
      audiences: ['Estonian cat owner', 'Product and launch team'],
      nonGoals: ['Inventing legal clearance or market facts'],
      requiredSections: [
        'Acceptance criteria',
        'Evidence, assumptions, and gaps',
        'Metrics and validation',
        'Next steps',
        'Prioritized requirements',
        'Problem and desired outcome',
        'Product thesis, scope, and non-goals',
        'Risks',
        'User journeys',
        'Users, jobs, and pains',
      ],
    },
    requirements,
    acceptanceCriteria: [{ id: semanticId('acc', criterionCore), ...criterionCore }],
    materialClarification: null,
    researchInputHash: canonicalHash({ objective: request, geography: ['Estonia'] }),
    authority: { canonicalInputHash: inputHash, seal: 'scope-seal-'.padEnd(64, 's') },
  };
}

function fixture({ readiness = 'ready_with_gaps' } = {}) {
  const compile = compileInput();
  const scopePayloadValue = scopePayload(canonicalHash(compile));
  if (readiness === 'blocked') {
    scopePayloadValue.evidenceRequirements = scopePayloadValue.evidenceRequirements.map(
      (requirement) => requirement.id === 'feed-law'
        ? {
            ...requirement,
            evidenceRole: 'selected_artifact_proof',
            verificationBasis: 'selected_evidence',
          }
        : requirement
    );
  }
  const scope = fact(id(100), 'scope', 'application/json', scopePayloadValue);
  const researchInput = {
    type: 'ExecuteResearchV2', acceptedScope: ref(scope), scope: scope.payload, selectedEvidence: [],
  };
  const findings = readiness === 'blocked'
    ? [
        { requirementId: 'feed-law', status: 'missing', blocking: true, sourceArtifactIds: [], note: 'Law unresolved.' },
        { requirementId: 'market-size', status: 'verified', blocking: false, sourceArtifactIds: [], note: 'Statistic verified.' },
      ]
    : [
        { requirementId: 'feed-law', status: 'verified', blocking: false, sourceArtifactIds: [], note: 'Law verified.' },
        { requirementId: 'market-size', status: readiness === 'ready' ? 'verified' : 'missing', blocking: false, sourceArtifactIds: [], note: readiness === 'ready' ? 'Statistic verified.' : 'Statistic unavailable.' },
      ];
  const researchPayload = {
    schemaVersion: 'axwise.research.v2',
    acceptedScopeArtifactId: scope.artifactId,
    acceptedScopeHash: scope.artifactHash,
    researchInputHash: scope.payload.researchInputHash,
    readiness,
    findings,
    boundedRepairPasses: readiness === 'ready' ? 0 : 1,
    assumptions: readiness === 'ready_with_gaps' ? ['Current demand is assumed stable.'] : [],
    gaps: readiness === 'ready_with_gaps' ? ['Statistic unavailable.'] : [],
    conflicts: [],
    claimLedgerArtifactId: id(199),
    claimLedger: [],
    selectedClaims: [],
    sourceCatalogue: [],
  };
  const research = fact(
    id(101), 'research', 'application/json', researchPayload, [scope.artifactId]
  );
  const agent = {
    id: id(300), name: 'Product researcher',
    capabilities: ['evidence_synthesis', 'prd', 'product_strategy', 'research'],
    toolIds: [id(301)],
    qualityScoreMicros: 900000, costPerRunCents: 100,
  };
  const planInput = {
    type: 'OrqalyPlanV2', acceptedScope: ref(scope), research: ref(research),
    agentCatalogue: [agent],
  };
  const requirements = workflowPlanRequirements(scope.payload);
  const outputContract = {
    format: 'text/markdown',
    artifactType: 'product_prd',
    requiredSections: scope.payload.deliverableProfile.requiredSections,
    requirementIds: requirements.map((requirement) => requirement.id),
    rubric: [
      'Evidence, assumptions, and gaps are explicit.',
      'Metrics and validation are actionable.',
      'Priorities, scope, and non-goals are coherent.',
      'Requirements are traceable to acceptance criteria.',
      'Risks and next steps are concrete.',
      'Users, jobs, pains, and journeys are specific.',
    ],
    acceptanceCriteria: scope.payload.acceptanceCriteria,
    evidenceReadiness: readiness,
    launchReadyAllowed: false,
    sourceAppendixRequired: false,
  };
  const taskDefinitions = [
    {
      stageId: ids.executionA,
      stageKey: 'core-draft',
      title: 'Coherent full-contract draft',
      taskKind: 'core_draft',
      requiredRole: 'product specification author',
      lens: 'Synthesize the complete accepted product contract from every specialist analysis.',
      requiredCapabilities: ['prd', 'product_strategy'],
      acceptanceRequirementIds: requirements.map((requirement) => requirement.id),
      producesFullContract: true,
      dependsOnStageKeys: ['domain-evidence-analysis', 'product-user-analysis'],
    },
    {
      stageId: ids.executionB,
      stageKey: 'product-user-analysis',
      title: 'Product and user analysis',
      taskKind: 'specialist_analysis',
      requiredRole: 'product strategy specialist',
      lens: 'Analyze users, jobs, pains, scope, priorities, journeys, and validation needs.',
      requiredCapabilities: ['product_strategy'],
      acceptanceRequirementIds: requirements.filter((requirement) =>
        ['deliverable', 'interview', 'persona', 'prd'].includes(requirement.category)
      ).map((requirement) => requirement.id),
      producesFullContract: false,
      dependsOnStageKeys: [],
    },
    {
      stageId: ids.executionC,
      stageKey: 'domain-evidence-analysis',
      title: 'Domain and evidence analysis',
      taskKind: 'specialist_analysis',
      requiredRole: 'domain evidence specialist',
      lens: 'Analyze evidence, assumptions, gaps, constraints, risks, and bounded next steps.',
      requiredCapabilities: ['evidence_synthesis'],
      acceptanceRequirementIds: requirements.filter((requirement) =>
        ['evidence', 'limit', 'policy'].includes(requirement.category)
      ).map((requirement) => requirement.id),
      producesFullContract: false,
      dependsOnStageKeys: [],
    },
  ];
  const tasks = taskDefinitions.map((definition) => {
    const core = {
      ...definition,
      agent,
      agentId: agent.id,
      toolIds: agent.toolIds,
      budgetCents: agent.costPerRunCents,
      dataBoundary: ['No invented prices'],
    };
    return { ...core, inputHash: canonicalHash(core) };
  });
  const planCore = {
    schemaVersion: 'orqaly.plan.v2', acceptedScopeArtifact: ref(scope),
    researchArtifact: ref(research), workShape: 'product_prd', requirements,
    outputContract, tasks,
  };
  const planPayload = { ...planCore, planHash: canonicalHash(planCore) };
  const plan = fact(
    id(102), 'plan', 'application/json', planPayload, [scope.artifactId, research.artifactId]
  );
  const executionInputs = Array(tasks.length);
  const taskArtifacts = Array(tasks.length);
  const artifactIds = [id(103), id(104), id(107)];
  function createTaskArtifact(index, dependencyArtifacts = []) {
    const task = tasks[index];
    const sourceArtifacts = [
      ref(scope), ref(research), ref(plan), ...dependencyArtifacts.map(ref),
    ].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    const sourceRecords = [scope, research, plan, ...dependencyArtifacts]
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    const input = {
      type: 'SynthesizeArtifactV1', purpose: 'execute_task', task,
      acceptedScope: ref(scope), research: ref(research), acceptedPlan: ref(plan),
      sourceArtifacts,
      artifactContents: sourceRecords.map((value) => ({
        artifact: ref(value), contentType: value.contentType,
        payload: value.payload, markdown: value.markdown,
      })),
      outputContract,
      repairPass: 0,
    };
    executionInputs[index] = input;
    const markdown = `# ${input.task.title}\n\nEvidence readiness: ${readiness}.`;
    const payload = {
      schemaVersion: 'orqaly.task-result.v2', task: input.task,
      acceptedScope: input.acceptedScope, research: input.research, acceptedPlan: input.acceptedPlan,
      title: input.task.title, markdown, evidenceReadiness: readiness,
      sourceArtifacts: input.sourceArtifacts,
      requirementCoverage: input.task.acceptanceRequirementIds.map((requirementId) => ({
        requirementId, status: 'satisfied', note: 'Covered by the bounded task output.',
      })),
      sourceAppendix: [],
      executionReceipt: { agent, toolIds: input.task.toolIds, budgetCents: input.task.budgetCents, dataBoundary: input.task.dataBoundary },
      conclusions: [`Prepared ${input.task.title}.`],
      unknowns: researchPayload.gaps,
    };
    taskArtifacts[index] = fact(
      artifactIds[index], 'task_result', 'text/markdown', payload,
      input.sourceArtifacts.map((value) => value.artifactId)
    );
  }
  createTaskArtifact(1);
  createTaskArtifact(2);
  createTaskArtifact(0, [taskArtifacts[1], taskArtifacts[2]]);
  const evaluationSources = [ref(scope), ref(research), ref(plan), ...taskArtifacts.map(ref)]
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  const evaluationRecords = [scope, research, plan, ...taskArtifacts]
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  const evaluationInput = {
    type: 'SynthesizeArtifactV1', purpose: 'evaluate_output',
    acceptedScope: ref(scope), research: ref(research), acceptedPlan: ref(plan),
    taskArtifacts: taskArtifacts.map(ref).sort((left, right) => left.artifactId.localeCompare(right.artifactId)),
    sourceArtifacts: evaluationSources,
    artifactContents: evaluationRecords.map((value) => ({
      artifact: ref(value), contentType: value.contentType,
      payload: value.payload, markdown: value.markdown,
    })),
    outputContract,
    repairPass: 0,
  };
  const evaluationPayload = {
    schemaVersion: 'orqaly.evaluation.v1', taskArtifacts: evaluationInput.taskArtifacts,
    sourceArtifacts: evaluationInput.sourceArtifacts,
    evidenceReadiness: readiness, outputContractHash: canonicalHash(outputContract), repairPass: 0,
    outputContractSatisfied: false, promotedArtifact: null,
    unmetRequirementIds: [requirements[0].id], unresolvedSourceMarkers: [],
    unsupportedPrecision: [], contradictions: [], staleTopicReferences: [],
    readinessViolations: [], substantiveContentDefects: [], practicalityDefects: [],
    repairRequired: true, repairInstructions: ['Repair the missing deliverable requirement.'],
    note: 'Final synthesis is required.',
  };
  const evaluation = fact(
    id(105), 'evaluation', 'application/json', evaluationPayload,
    evaluationInput.sourceArtifacts.map((value) => value.artifactId)
  );
  const synthesisInput = {
    type: 'SynthesizeArtifactV1', purpose: 'final_synthesis',
    acceptedScope: ref(scope), research: ref(research),
    acceptedPlan: ref(plan), taskArtifacts: evaluationInput.taskArtifacts, evaluation: ref(evaluation),
    sourceArtifacts: [ref(scope), ref(research), ref(plan), ...taskArtifacts.map(ref), ref(evaluation)]
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId)),
    artifactContents: [scope, research, plan, ...taskArtifacts, evaluation]
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId))
      .map((value) => ({
      artifact: ref(value), contentType: value.contentType, payload: value.payload, markdown: value.markdown,
    })),
    outputContract,
    repairPass: 1,
  };
  const finalPayload = {
    schemaVersion: 'axwise.final-markdown.v1', title: 'Estonia cat-food PRD',
    markdown: '# Product requirements document\n\n## Evidence gaps\n\nCurrent market-size statistic unavailable.',
    sourceArtifacts: [ref(scope), ref(research), ref(plan), ...taskArtifacts.map(ref), ref(evaluation)]
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId)),
    sourceAppendix: [],
    candidateAttestation: null,
    evidenceReadiness: readiness, launchReady: false,
  };
  const final = fact(
    id(106), 'final_markdown', 'text/markdown', finalPayload,
    finalPayload.sourceArtifacts.map((value) => value.artifactId)
  );
  const blockedSources = [ref(scope), ref(research)]
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  const blockedReportInput = {
    type: 'SynthesizeArtifactV1', purpose: 'blocked_report',
    acceptedScope: ref(scope), research: ref(research),
    sourceArtifacts: blockedSources,
    artifactContents: [scope, research]
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId))
      .map((value) => ({
        artifact: ref(value), contentType: value.contentType,
        payload: value.payload, markdown: value.markdown,
      })),
    outputContract: blockedReportOutputContract(researchPayload),
    repairPass: 0,
  };
  return { compile, scope, researchInput, research, agent, planInput, tasks, plan,
    executionInputs, taskArtifacts, evaluationInput, evaluation, synthesisInput, final,
    blockedReportInput };
}

function groundedBlockedFixture() {
  const base = fixture({ readiness: 'blocked' });
  const claimText = 'Commercial pet-food launch requirements remain unresolved.';
  const canonicalUrl = 'https://example.eu/feed-law';
  const sourceTypes = ['government', 'primary_law'];
  const claimId = canonicalHash({
    text: claimText,
    sourceTypes,
    sourceUrls: [canonicalUrl],
  });
  const claim = {
    claimId,
    text: claimText,
    textSha256: sha256Hex(claimText),
    sourceUrls: [canonicalUrl],
    sourceTypes,
    providerResponseHash: null,
    segmentStart: null,
    segmentEnd: null,
    offsetUnit: null,
  };
  const source = {
    sourceId: canonicalHash({
      canonicalUrl,
      retrievalDate: '2026-08-27T12:00:00Z',
      sourceClasses: sourceTypes,
      sourceTitle: 'EU Feed Law Register',
    }),
    sourceTitle: 'EU Feed Law Register',
    canonicalUrl,
    sourceClasses: sourceTypes,
    retrievalDate: '2026-08-27T12:00:00Z',
    supportedClaimIds: [claimId],
  };
  const researchPayload = {
    ...base.research.payload,
    selectedClaims: [claim],
    sourceCatalogue: [source],
  };
  const research = fact(
    base.research.artifactId,
    'research',
    'application/json',
    researchPayload,
    [base.scope.artifactId]
  );
  const sourceArtifacts = [ref(base.scope), ref(research)]
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  const blockedReportInput = {
    type: 'SynthesizeArtifactV1',
    purpose: 'blocked_report',
    acceptedScope: ref(base.scope),
    research: ref(research),
    sourceArtifacts,
    artifactContents: [base.scope, research]
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId))
      .map((artifact) => ({
        artifact: ref(artifact),
        contentType: artifact.contentType,
        payload: artifact.payload,
        markdown: artifact.markdown,
      })),
    outputContract: blockedReportOutputContract(researchPayload),
    repairPass: 0,
  };
  const appendixEntry = {
    claimId,
    sourceTitle: source.sourceTitle,
    canonicalUrl,
    sourceClass: 'primary_law',
    retrievalDate: source.retrievalDate,
    supportedClaim: claimText,
    supportedSection: 'Evidence decision',
  };
  function finalWith({ appendix = [appendixEntry], appendixBody = null, body = null } = {}) {
    const baseMarkdown = body ?? [
      '# Evidence decision',
      '',
      `The essential legal evidence is unresolved [evidence:${claimId}].`,
      '',
      '## Remediation plan',
      '',
      'Obtain authoritative verification before planning or launch execution.',
    ].join('\n');
    const renderedRows = appendixBody ?? appendix.map((entry) =>
      `- \`[evidence:${entry.claimId}]\` — ${entry.sourceTitle} — ${entry.canonicalUrl} — class: \`${entry.sourceClass}\` — retrieved: \`${entry.retrievalDate}\` — section: ${entry.supportedSection} — supported claim: ${entry.supportedClaim}`
    ).join('\n');
    const markdown = `${baseMarkdown}\n\n## Sources\n\n${renderedRows}\n`;
    const payload = {
      schemaVersion: 'axwise.final-markdown.v1',
      title: 'Blocked evidence report',
      markdown,
      sourceArtifacts,
      sourceAppendix: appendix,
      candidateAttestation: null,
      evidenceReadiness: 'blocked',
      launchReady: false,
    };
    return fact(
      id(540),
      'final_markdown',
      'text/markdown',
      payload,
      sourceArtifacts.map((artifact) => artifact.artifactId)
    );
  }
  return { ...base, research, blockedReportInput, appendixEntry, finalWith };
}

function completedSpecialistTopology(workflowFixture) {
  const specialistIndexes = [1, 2];
  return {
    stages: specialistIndexes.map((index) => stage(
      workflowFixture.tasks[index].stageId,
      workflowFixture.tasks[index].stageKey,
      'execution',
      100 + index,
      {
        status: workflowFixture.research.payload.readiness === 'ready'
          ? 'completed'
          : 'completed_with_evidence_gaps',
        inputHash: canonicalHash(workflowFixture.executionInputs[index]),
        outputArtifact: ref(workflowFixture.taskArtifacts[index]),
      }
    )),
    attempts: specialistIndexes.map((index) => attempt(
      index === 1 ? ids.executionAttemptB : ids.executionAttemptC,
      workflowFixture.tasks[index].stageId,
      index === 1 ? ids.executionOperationB : ids.executionOperationC,
      workflowFixture.executionInputs[index],
      { status: 'succeeded', leaseToken: null, leaseExpiresAt: null }
    )),
    dependencies: specialistIndexes.map((index) => ({
      stageId: workflowFixture.tasks[0].stageId,
      dependsOnStageId: workflowFixture.tasks[index].stageId,
    })),
  };
}

function groundedExecutionFixture() {
  const base = fixture({ taskCount: 2, readiness: 'ready' });
  const claimText = 'Registered pet-food operators must comply with the applicable feed rules.';
  const canonicalUrl = 'https://example.eu/feed-law';
  const sourceClasses = ['government', 'primary_law'];
  const claimId = canonicalHash({
    text: claimText,
    sourceTypes: sourceClasses,
    sourceUrls: [canonicalUrl],
  });
  const claim = {
    claimId,
    text: claimText,
    textSha256: sha256Hex(claimText),
    sourceUrls: [canonicalUrl],
    sourceTypes: sourceClasses,
    providerResponseHash: null,
    segmentStart: null,
    segmentEnd: null,
    offsetUnit: null,
  };
  const source = {
    sourceId: canonicalHash({
      canonicalUrl,
      retrievalDate: '2026-08-27T12:00:00Z',
      sourceClasses,
      sourceTitle: 'EU Feed Law Register',
    }),
    sourceTitle: 'EU Feed Law Register',
    canonicalUrl,
    sourceClasses,
    retrievalDate: '2026-08-27T12:00:00Z',
    supportedClaimIds: [claimId],
  };
  const researchPayload = {
    ...base.research.payload,
    selectedClaims: [claim],
    sourceCatalogue: [source],
  };
  const research = fact(
    base.research.artifactId,
    'research',
    'application/json',
    researchPayload,
    [base.scope.artifactId]
  );
  const outputContract = {
    ...base.plan.payload.outputContract,
    sourceAppendixRequired: true,
  };
  const planCore = {
    schemaVersion: base.plan.payload.schemaVersion,
    acceptedScopeArtifact: ref(base.scope),
    researchArtifact: ref(research),
    workShape: base.plan.payload.workShape,
    requirements: base.plan.payload.requirements,
    outputContract,
    tasks: base.tasks,
  };
  const plan = fact(
    base.plan.artifactId,
    'plan',
    'application/json',
    { ...planCore, planHash: canonicalHash(planCore) },
    [base.scope.artifactId, research.artifactId]
  );
  const sourceRecords = [base.scope, research, plan]
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  const sourceArtifacts = sourceRecords.map(ref);
  const executionInput = {
    ...base.executionInputs[0],
    research: ref(research),
    acceptedPlan: ref(plan),
    sourceArtifacts,
    artifactContents: sourceRecords.map((artifact) => ({
      artifact: ref(artifact),
      contentType: artifact.contentType,
      payload: artifact.payload,
      markdown: artifact.markdown,
    })),
    outputContract,
  };
  const supportedSection = base.tasks[0].title;
  const markdown = `# ${supportedSection}\n\n${claimText} [evidence:${claimId}].`;
  const appendixEntry = {
    claimId,
    sourceTitle: source.sourceTitle,
    canonicalUrl,
    sourceClass: 'primary_law',
    retrievalDate: source.retrievalDate,
    supportedClaim: claimText,
    supportedSection,
  };
  const taskPayload = {
    ...base.taskArtifacts[0].payload,
    research: ref(research),
    acceptedPlan: ref(plan),
    markdown,
    sourceArtifacts,
    sourceAppendix: [appendixEntry],
  };
  const taskResult = fact(
    id(700),
    'task_result',
    'text/markdown',
    taskPayload,
    sourceArtifacts.map((artifact) => artifact.artifactId)
  );
  const renderedRow =
    `- \`[evidence:${claimId}]\` — ${source.sourceTitle} — ${canonicalUrl} — ` +
    `class: \`primary_law\` — retrieved: \`${source.retrievalDate}\` — ` +
    `section: ${supportedSection} — supported claim: ${claimText}`;
  const renderedMarkdown = `${markdown}\n\n## Sources\n\n${renderedRow}\n`;
  const renderedTaskResult = fact(
    id(701),
    'task_result',
    'text/markdown',
    { ...taskPayload, markdown: renderedMarkdown },
    sourceArtifacts.map((artifact) => artifact.artifactId)
  );
  return { ...base, research, plan, executionInput, taskResult, renderedTaskResult };
}

function run(overrides = {}) {
  return {
    id: ids.run, tenantId: ids.tenant, ownerUserId: ids.owner, ownerOrganizationId: null,
    mode: 'simple',
    status: 'running', requestHash: sha256Hex(request), rowVersion: 4,
    evidenceReadiness: null, finalArtifact: null, ...overrides,
  };
}

function stage(idValue, stageKey, kind, ordinal, overrides = {}) {
  return {
    id: idValue, stageKey, kind, status: 'pending', rowVersion: 1, ordinal,
    inputHash: null, outputArtifact: null, ...overrides,
  };
}

function fixedStages(overrides = {}) {
  const values = [
    stage(ids.compile, 'compile-scope', 'compile_scope', 10),
    stage(ids.gate1, 'gate-1', 'gate_1', 20),
    stage(ids.research, 'execute-research', 'execute_research', 30),
    stage(ids.planning, 'planning', 'planning', 40),
    stage(ids.gate2, 'gate-2', 'gate_2', 50),
    stage(ids.evaluation, 'evaluation', 'evaluation', 900),
    stage(ids.synthesis, 'synthesis', 'synthesis', 1000),
  ];
  return values.map((value) => ({ ...value, ...(overrides[value.kind] || {}) }));
}

function attempt(idValue, stageId, operationId, inputPayload, overrides = {}) {
  return {
    id: idValue, stageId, attemptNumber: 1, status: 'running', operationId,
    inputHash: canonicalHash(inputPayload), inputPayload, rowVersion: 2,
    leaseToken: ids.lease, leaseExpiresAt: at(20), ...overrides,
  };
}

function completedResearchAttempt(workflowFixture) {
  return attempt(
    ids.researchAttempt,
    ids.research,
    ids.researchOperation,
    workflowFixture.researchInput,
    { status: 'succeeded', leaseToken: null, leaseExpiresAt: null }
  );
}

function snapshot(overrides = {}) {
  return {
    run: run(overrides.run),
    stages: overrides.stages || fixedStages(overrides.stageOverrides),
    attempts: overrides.attempts || [],
    dependencies: overrides.dependencies || [],
    approvals: overrides.approvals || [],
  };
}

function event(type, overrides = {}) {
  return {
    type, eventId: id(800), tenantId: ids.tenant, runId: ids.run, occurredAt: at(10),
    ...overrides,
  };
}

function next(stageId, attemptId, operationId, inputPayload) {
  return { stageId, attemptId, operationId, inputHash: canonicalHash(inputPayload), inputPayload };
}

function expectCode(callback, code) {
  try {
    callback();
    throw new Error('expected transition to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(WorkflowTransitionError);
    expect(error.code).toBe(code);
  }
}

const executedTransitionCells = new Set();

function expectEligibleValue(values, actual) {
  expect(values.includes('*') || values.includes(actual)).toBe(true);
}

function assertTransitionCellEligibility(cell, snapshotValue, eventValue) {
  if (cell.eventType === 'CapabilityActivityRequested') {
    expect(cell.eligible.runStatuses).toContain(snapshotValue.run.status);
    expect(snapshotValue.run.workProfile.type).toBe('capability_work_v1');
    expect(eventValue.decidedBy).toBe(snapshotValue.run.ownerUserId);
    expect(snapshotValue.stages.some((stage) => stage.id === eventValue.stageId)).toBe(false);
    expect(snapshotValue.attempts.some((attempt) => attempt.id === eventValue.attemptId || attempt.operationId === eventValue.operationId)).toBe(false);
    expect(eventValue.expectedRowVersion).toBe(snapshotValue.run.rowVersion);
    return;
  }
  expectEligibleValue(cell.eligible.runStatuses, snapshotValue.run.status);
  if (eventValue.type === 'RunRequested') {
    expect(snapshotValue.stages).toEqual([]);
    expect(snapshotValue.attempts).toEqual([]);
    expect(snapshotValue.approvals).toEqual([]);
  } else if (eventValue.type === 'ScopeRevisionRequested') {
    const composite = ['compile_scope', 'gate_1', 'execute_research'].map((kind) =>
      snapshotValue.stages.find((stageValue) => stageValue.kind === kind)
    );
    expect(composite.map((stageValue) => stageValue.kind)).toEqual(cell.eligible.stageKinds);
    expect(composite.map((stageValue) => stageValue.status)).toEqual(cell.eligible.stageStatuses);
  }
  if ('attemptId' in eventValue && 'stageId' in eventValue) {
    const eventStage = snapshotValue.stages.find((value) => value.id === eventValue.stageId);
    const eventAttempt = snapshotValue.attempts.find((value) => value.id === eventValue.attemptId);
    expect(eventStage, `cell ${cell.id} stage`).toBeDefined();
    expect(eventAttempt, `cell ${cell.id} attempt`).toBeDefined();
    expectEligibleValue(cell.eligible.stageKinds, eventStage.kind);
    expectEligibleValue(cell.eligible.stageStatuses, eventStage.status);
    expectEligibleValue(cell.eligible.attemptStatuses, eventAttempt.status);
  } else if (eventValue.type === 'ApprovalGranted' && cell.id !== 'approval-granted-duplicate') {
    const gate = snapshotValue.stages.find((value) => value.id === eventValue.stageId);
    expectEligibleValue(cell.eligible.stageKinds, gate.kind);
    expectEligibleValue(cell.eligible.stageStatuses, gate.status);
  }

  const branch = cell.eligible.branch;
  if (!branch) return;
  if (['ready', 'ready_with_gaps', 'blocked_report'].includes(branch)) {
    expect(eventValue.result.artifact.payload.readiness).toBe(
      branch === 'blocked_report' ? 'blocked' : branch
    );
  } else if (branch === 'execution_successors_remain' || branch === 'last_execution_stage') {
    const completed = new Set(
      snapshotValue.stages
        .filter((value) => ['completed', 'completed_with_evidence_gaps'].includes(value.status))
        .map((value) => value.id)
    );
    completed.add(eventValue.stageId);
    const unfinished = snapshotValue.stages.filter(
      (value) => value.kind === 'execution' && !completed.has(value.id)
    );
    expect(unfinished.length === 0 ? 'last_execution_stage' : 'execution_successors_remain')
      .toBe(branch);
  } else if (['output_contract_satisfied', 'output_contract_unsatisfied'].includes(branch)) {
    expect(
      eventValue.result.artifact.payload.outputContractSatisfied
        ? 'output_contract_satisfied'
        : 'output_contract_unsatisfied'
    ).toBe(branch);
  } else if (branch === 'retryable_below_limit' || branch === 'nonretryable_or_limit_reached') {
    const stageValue = snapshotValue.stages.find((value) => value.id === eventValue.stageId);
    const attemptValue = snapshotValue.attempts.find((value) => value.id === eventValue.attemptId);
    expect(
      eventValue.retryable && attemptValue.attemptNumber < workflowRetryLimits[stageValue.kind]
        ? 'retryable_below_limit'
        : 'nonretryable_or_limit_reached'
    ).toBe(branch);
  } else if (branch === 'scope' || branch === 'plan') {
    expect(eventValue.approvalKind).toBe(branch);
  } else if (branch === 'exact_idempotent_duplicate') {
    expect(snapshotValue.approvals.some(
      (approval) => approval.idempotencyKey === eventValue.idempotencyKey
    )).toBe(true);
  }
}

function transitionCell(cellId, snapshotValue, eventValue) {
  const cell = WORKFLOW_TRANSITION_CELLS.find((candidate) => candidate.id === cellId);
  if (!cell) throw new Error(`unknown transition cell ${cellId}`);
  expect(eventValue.type).toBe(cell.eventType);
  assertTransitionCellEligibility(cell, snapshotValue, eventValue);
  const plan = transition(snapshotValue, eventValue);
  executedTransitionCells.add(cellId);
  return plan;
}

afterAll(() => {
  expect([...executedTransitionCells].sort()).toEqual(
    WORKFLOW_TRANSITION_CELLS.map((cell) => cell.id).sort()
  );
});

describe('workflow v2 pure transition table', () => {
  it('initializes the explicit thin vertical and persists canonical input before dispatch', () => {
    const f = fixture();
    const initial = snapshot({ run: { status: 'requested', rowVersion: 0 }, stages: [] });
    const plan = transitionCell('run-requested', initial, event('RunRequested', {
      ownerUserId: ids.owner, ownerOrganizationId: null, mode: 'simple', request,
      requestHash: sha256Hex(request),
      stageIds: { compileScope: ids.compile, gate1: ids.gate1, research: ids.research,
        planning: ids.planning, gate2: ids.gate2, evaluation: ids.evaluation, synthesis: ids.synthesis },
      attemptId: ids.compileAttempt, operationId: ids.compileOperation,
      inputHash: canonicalHash(f.compile), inputPayload: f.compile,
    }));
    expect(plan.createStages.map((value) => value.kind)).toEqual([
      'compile_scope', 'gate_1', 'execute_research', 'planning', 'gate_2', 'evaluation', 'synthesis',
    ]);
    expect(plan.createAttempts[0]).toMatchObject({
      id: ids.compileAttempt, operationId: ids.compileOperation,
      inputPayload: f.compile, inputCanonical: canonicalJson(f.compile),
    });
    expect(plan.eventCanonical).toBe(canonicalJson(plan.event));
    expect(plan.eventHash).toBe(canonicalHash(plan.event));
    expect(TransitionPlanSchema.safeParse({ ...plan, eventCanonical: '{}' }).success).toBe(false);
    expect(TransitionPlanSchema.safeParse({ ...plan, eventHash: 'f'.repeat(64) }).success).toBe(false);
    expect(plan.outbox).toHaveLength(1);
  });

  it('persists a V3 context corpus while keeping the run request owner-facing and concise', () => {
    const inputPayload = structuredClone(compileScopeV3Envelope.input);
    const ownerRequest = inputPayload.assistantContext.instruction.content;
    const initial = snapshot({
      run: {
        status: 'requested',
        rowVersion: 0,
        mode: 'advanced',
        requestHash: sha256Hex(ownerRequest),
      },
      stages: [],
    });
    const eventValue = event('RunRequested', {
      ownerUserId: ids.owner,
      ownerOrganizationId: null,
      mode: 'advanced',
      request: ownerRequest,
      requestHash: sha256Hex(ownerRequest),
      stageIds: {
        compileScope: ids.compile,
        gate1: ids.gate1,
        research: ids.research,
        planning: ids.planning,
        gate2: ids.gate2,
        evaluation: ids.evaluation,
        synthesis: ids.synthesis,
      },
      attemptId: ids.compileAttempt,
      operationId: ids.compileOperation,
      inputHash: canonicalHash(inputPayload),
      inputPayload,
    });

    const plan = transition(initial, eventValue);
    expect(plan.event.request).toBe(ownerRequest);
    expect(plan.createAttempts[0].inputPayload.request).not.toBe(ownerRequest);
    expect(plan.createAttempts[0].inputPayload.type).toBe('CompileScopeV3');

    const changedRequest = 'A different public Goal request.';
    expectCode(
      () =>
        transition(
          snapshot({
            run: {
              status: 'requested',
              rowVersion: 0,
              mode: 'advanced',
              requestHash: sha256Hex(changedRequest),
            },
            stages: [],
          }),
          event('RunRequested', {
            ...eventValue,
            request: changedRequest,
            requestHash: sha256Hex(changedRequest),
          })
        ),
      'RUN_REQUEST_HASH_MISMATCH'
    );
  });

  it('rejects cross-tenant facts before making a decision', () => {
    const f = fixture();
    expectCode(() => transition(snapshot({ run: { status: 'requested', rowVersion: 0 }, stages: [] }),
      event('RunRequested', {
        tenantId: id(999), ownerUserId: ids.owner, ownerOrganizationId: null, mode: 'simple', request,
        requestHash: sha256Hex(request), stageIds: { compileScope: ids.compile, gate1: ids.gate1,
          research: ids.research, planning: ids.planning, gate2: ids.gate2,
          evaluation: ids.evaluation, synthesis: ids.synthesis }, attemptId: ids.compileAttempt,
        operationId: ids.compileOperation, inputHash: canonicalHash(f.compile), inputPayload: f.compile,
      })), 'TENANT_RUN_MISMATCH');
  });

  it('binds RunRequested to exact request bytes and seven distinct stable stage IDs', () => {
    const f = fixture();
    const base = {
      ownerUserId: ids.owner, ownerOrganizationId: null, mode: 'simple', request,
      requestHash: sha256Hex(request),
      stageIds: { compileScope: ids.compile, gate1: ids.gate1, research: ids.research,
        planning: ids.planning, gate2: ids.gate2, evaluation: ids.evaluation,
        synthesis: ids.synthesis },
      attemptId: ids.compileAttempt, operationId: ids.compileOperation,
      inputHash: canonicalHash(f.compile), inputPayload: f.compile,
    };
    const wrongHash = sha256Hex('different request');
    expectCode(() => transition(snapshot({
      run: { status: 'requested', rowVersion: 0, requestHash: wrongHash }, stages: [],
    }), event('RunRequested', { ...base, requestHash: wrongHash })), 'RUN_REQUEST_HASH_MISMATCH');
    expectCode(() => transition(snapshot({
      run: { status: 'requested', rowVersion: 0 }, stages: [],
    }), event('RunRequested', {
      ...base, stageIds: { ...base.stageIds, synthesis: ids.evaluation },
    })), 'DUPLICATE_STAGE_ID');
    expectCode(() => transition(snapshot({
      run: { status: 'requested', rowVersion: 0, ownerOrganizationId: 'org_owner123' },
      stages: [],
    }), event('RunRequested', base)), 'RUN_FACT_MISMATCH');
  });

  it('uses deployment ID only as trace metadata and rejects exact-expiry starts', () => {
    const f = fixture();
    const queued = attempt(ids.compileAttempt, ids.compile, ids.compileOperation, f.compile, { status: 'queued' });
    const stages = fixedStages({ compile_scope: { status: 'queued', inputHash: queued.inputHash } });
    const plan = transitionCell('activity-started', snapshot({ stages, attempts: [queued] }), event('ActivityStarted', {
      stageId: ids.compile, attemptId: ids.compileAttempt, leaseToken: ids.lease,
      deploymentId: 'revision-b',
    }));
    expect(plan.attemptMutations[0].patch.deployment_id).toBe('revision-b');
    expect(plan.createAttempts).toHaveLength(0);
    expectCode(() => transition(snapshot({ stages, attempts: [{ ...queued, leaseExpiresAt: at(10) }] }),
      event('ActivityStarted', { stageId: ids.compile, attemptId: ids.compileAttempt,
        leaseToken: ids.lease, deploymentId: 'revision-c' })), 'EXPIRED_LEASE');
  });

  it('rejects ineligible run, stage, and stage/attempt state combinations explicitly', () => {
    const f = fixture();
    const current = attempt(ids.compileAttempt, ids.compile, ids.compileOperation, f.compile);
    const completion = (stageId = ids.compile) => event('ActivityCompleted', {
      stageId,
      attemptId: current.id,
      leaseToken: ids.lease,
      result: { resultType: 'scope_compiled', artifact: f.scope },
      nextAttempts: [],
    });
    expectCode(() => transition(snapshot({
      run: { status: 'completed' },
      stages: fixedStages({
        compile_scope: { status: 'running', inputHash: current.inputHash },
      }),
      attempts: [current],
    }), completion()), 'RUN_NOT_ACTIVE');

    const gateAttempt = { ...current, stageId: ids.gate1 };
    expectCode(() => transition(snapshot({
      stages: fixedStages({ gate_1: { status: 'running', inputHash: gateAttempt.inputHash } }),
      attempts: [gateAttempt],
    }), completion(ids.gate1)), 'NON_ACTIVITY_STAGE');

    expectCode(() => transition(snapshot({
      stages: fixedStages({
        compile_scope: { status: 'polling', inputHash: current.inputHash },
      }),
      attempts: [current],
    }), completion()), 'STAGE_ATTEMPT_STATUS_MISMATCH');

    expectCode(() => transition(snapshot({
      stages: fixedStages({ compile_scope: { status: 'running', inputHash: 'f'.repeat(64) } }),
      attempts: [current],
    }), completion()), 'STAGE_ATTEMPT_INPUT_HASH_MISMATCH');
  });

  it('enforces stage/attempt input hash parity when starting and recovering work', () => {
    const f = fixture();
    const queued = attempt(ids.compileAttempt, ids.compile, ids.compileOperation, f.compile, {
      status: 'queued',
    });
    expectCode(() => transition(snapshot({
      stages: fixedStages({ compile_scope: { status: 'queued', inputHash: 'e'.repeat(64) } }),
      attempts: [queued],
    }), event('ActivityStarted', {
      stageId: ids.compile,
      attemptId: queued.id,
      leaseToken: ids.lease,
      deploymentId: 'revision-hash-mismatch',
    })), 'STAGE_ATTEMPT_INPUT_HASH_MISMATCH');

    const expired = { ...queued, status: 'running', leaseExpiresAt: at(9) };
    expectCode(() => transition(snapshot({
      stages: fixedStages({ compile_scope: { status: 'running', inputHash: 'd'.repeat(64) } }),
      attempts: [expired],
    }), event('LeaseExpired', {
      stageId: ids.compile,
      attemptId: expired.id,
      leaseToken: ids.lease,
      requeueAt: at(10),
    })), 'STAGE_ATTEMPT_INPUT_HASH_MISMATCH');
  });

  it('turns ambiguous dispatch and poll 404 into polling/redispatch on the same attempt/op', () => {
    const f = fixture();
    const current = attempt(ids.compileAttempt, ids.compile, ids.compileOperation, f.compile);
    const stages = fixedStages({ compile_scope: { status: 'running', inputHash: current.inputHash } });
    const deferred = transitionCell('activity-deferred', snapshot({ stages, attempts: [current] }),
      event('ActivityDeferred', { stageId: ids.compile, attemptId: current.id,
        leaseToken: ids.lease, statusUrl: `https://axwise.test/v2/operations/${current.operationId}?tenantId=${ids.tenant}`,
        nextPollAt: at(11) }));
    expect(deferred.outbox[0]).toMatchObject({ commandType: 'poll_activity',
      operationId: current.operationId });
    const ambiguous = transitionCell('activity-dispatch-ambiguous', snapshot({ stages, attempts: [current] }),
      event('ActivityDispatchAmbiguous', { stageId: ids.compile, attemptId: current.id,
        leaseToken: ids.lease, statusUrl: `https://axwise.test/v2/operations/${current.operationId}?tenantId=${ids.tenant}`,
        nextPollAt: at(11) }));
    expect(ambiguous.createAttempts).toHaveLength(0);
    expect(ambiguous.outbox[0]).toMatchObject({ commandType: 'poll_activity', attemptId: current.id,
      operationId: current.operationId });
    const polling = { ...current, status: 'polling' };
    const redispatch = transitionCell('activity-redispatch-requested', snapshot({ stages: fixedStages({ compile_scope: { status: 'polling', inputHash: current.inputHash } }), attempts: [polling] }),
      event('ActivityRedispatchRequested', { stageId: ids.compile, attemptId: current.id,
        leaseToken: ids.lease, redispatchAt: at(11) }));
    expect(redispatch.createAttempts).toHaveLength(0);
    expect(redispatch.outbox[0]).toMatchObject({ commandType: 'dispatch_activity', attemptId: current.id,
      operationId: current.operationId });
  });

  it('creates N+1 only after explicit terminal failure and preserves exact input', () => {
    const f = fixture();
    const current = attempt(ids.researchAttempt, ids.research, ids.researchOperation, f.researchInput);
    const stages = fixedStages({ execute_research: { status: 'running', inputHash: current.inputHash } });
    const retryInput = next(ids.research, id(400), id(401), f.researchInput);
    const plan = transitionCell('activity-failed-retry', snapshot({ stages, attempts: [current] }), event('ActivityFailed', {
      stageId: ids.research, attemptId: current.id, leaseToken: ids.lease,
      retryable: true, errorClass: 'AXWISE_HTTP_500', nextAttempt: {
        attemptId: retryInput.attemptId, operationId: retryInput.operationId,
        inputHash: retryInput.inputHash, inputPayload: retryInput.inputPayload,
      },
    }));
    expect(plan.createAttempts[0]).toMatchObject({ stageId: ids.research, attemptNumber: 2 });
    expect(plan.createAttempts[0].operationId).not.toBe(current.operationId);
    const atRetryLimit = { ...current, attemptNumber: 3 };
    const limitPlan = transitionCell(
      'activity-failed-terminal',
      snapshot({ stages, attempts: [atRetryLimit] }),
      event('ActivityFailed', {
        stageId: ids.research,
        attemptId: atRetryLimit.id,
        leaseToken: ids.lease,
        retryable: true,
        errorClass: 'AXWISE_RESULT_REJECTED_RESULT_STAGE_MISMATCH',
        nextAttempt: {
          attemptId: id(407),
          operationId: id(408),
          inputHash: atRetryLimit.inputHash,
          inputPayload: atRetryLimit.inputPayload,
        },
      })
    );
    expect(limitPlan.createAttempts).toEqual([]);
    expect(limitPlan.outbox).toEqual([]);
    expect(limitPlan.runMutation.patch.status).toBe('failed');
    const terminal = transitionCell(
      'activity-failed-terminal',
      snapshot({ stages, attempts: [current] }),
      event('ActivityFailed', {
        stageId: ids.research,
        attemptId: current.id,
        leaseToken: ids.lease,
        retryable: false,
        errorClass: 'INVALID_PROVIDER_RESULT',
      })
    );
    expect(terminal.runMutation.patch.status).toBe('failed');
    expectCode(() => transition(snapshot({ stages, attempts: [current] }), event('ActivityFailed', {
      stageId: ids.research, attemptId: current.id, leaseToken: ids.lease, retryable: true,
      errorClass: 'AXWISE_HTTP_500', nextAttempt: {
        attemptId: id(402), operationId: id(403), inputPayload: {
          ...f.researchInput,
          selectedEvidence: [{ artifactId: id(404), artifactHash: 'd'.repeat(64), kind: 'evidence' }],
        },
        inputHash: canonicalHash({
          ...f.researchInput,
          selectedEvidence: [{ artifactId: id(404), artifactHash: 'd'.repeat(64), kind: 'evidence' }],
        }),
      },
    })), 'RETRY_INPUT_CHANGED');
    expectCode(() => transition(snapshot({ stages, attempts: [current] }),
      event('ActivityFailed', {
        stageId: ids.research, attemptId: current.id, leaseToken: ids.lease,
        retryable: true, errorClass: 'AXWISE_HTTP_500', nextAttempt: {
          attemptId: current.id, operationId: id(405), inputHash: current.inputHash,
          inputPayload: current.inputPayload,
        },
      })), 'ATTEMPT_ID_REUSED');
    expectCode(() => transition(snapshot({ stages, attempts: [current] }),
      event('ActivityFailed', {
        stageId: ids.research, attemptId: current.id, leaseToken: ids.lease,
        retryable: true, errorClass: 'AXWISE_HTTP_500', nextAttempt: {
          attemptId: id(406), operationId: current.operationId, inputHash: current.inputHash,
          inputPayload: current.inputPayload,
        },
      })), 'OPERATION_ID_REUSED');
  });

  it('recovers an expired lease through the state machine without changing durable identity', () => {
    const f = fixture();
    const expired = attempt(ids.compileAttempt, ids.compile, ids.compileOperation, f.compile, {
      leaseExpiresAt: at(9), status: 'running',
    });
    const plan = transitionCell('lease-expired-running', snapshot({
      stages: fixedStages({ compile_scope: { status: 'running', inputHash: expired.inputHash } }),
      attempts: [expired],
    }), event('LeaseExpired', { stageId: ids.compile, attemptId: expired.id,
      leaseToken: ids.lease, requeueAt: at(10) }));
    expect(plan.createAttempts).toHaveLength(0);
    expect(plan.outbox[0]).toMatchObject({ attemptId: expired.id, operationId: expired.operationId });
    const expiredPolling = { ...expired, status: 'polling' };
    const pollingPlan = transitionCell('lease-expired-polling', snapshot({
      stages: fixedStages({ compile_scope: { status: 'polling', inputHash: expired.inputHash } }),
      attempts: [expiredPolling],
    }), event('LeaseExpired', { stageId: ids.compile, attemptId: expired.id,
      leaseToken: ids.lease, requeueAt: at(10) }));
    expect(pollingPlan.outbox[0]).toMatchObject({ commandType: 'poll_activity',
      operationId: expired.operationId });
  });

  it('opens Gate 1 only for a scope result sealed to the exact compile input', () => {
    const f = fixture();
    const current = attempt(ids.compileAttempt, ids.compile, ids.compileOperation, f.compile);
    const plan = transitionCell('activity-completed-compile', snapshot({
      run: { rowVersion: 1 },
      stages: fixedStages({ compile_scope: { status: 'running', inputHash: current.inputHash }, gate_1: { status: 'pending' } }),
      attempts: [current],
    }), event('ActivityCompleted', { stageId: ids.compile, attemptId: current.id,
      leaseToken: ids.lease, result: { resultType: 'scope_compiled', artifact: f.scope }, nextAttempts: [] }));
    expect(plan.runMutation.patch.status).toBe('awaiting_gate_1');
    expect(plan.stageMutations.find((value) => value.id === ids.gate1).patch.status).toBe('awaiting_approval');
  });

  it('revises scope as attempt N+1 on the stable compile stage and resets Gate 1', () => {
    const f = fixture();
    const prior = attempt(ids.compileAttempt, ids.compile, ids.compileOperation, f.compile, {
      status: 'succeeded', leaseToken: null, leaseExpiresAt: null,
    });
    const correction = 'Target premium indoor-cat nutrition.';
    const reviseInput = {
      type: 'ReviseScopeV2', acceptedScope: ref(f.scope), correction,
      correctionSourceSpans: [{ start: 0, end: correction.length, text: correction,
        sha256: sha256Hex(correction), offsetUnit: 'utf16_code_units' }],
    };
    const plan = transitionCell('scope-revision-requested', snapshot({
      run: { status: 'awaiting_gate_1' },
      stages: fixedStages({ compile_scope: { status: 'completed', inputHash: prior.inputHash,
        outputArtifact: ref(f.scope) }, gate_1: { status: 'awaiting_approval' },
        execute_research: { status: 'pending' } }), attempts: [prior],
    }), event('ScopeRevisionRequested', { stageId: ids.compile, gateStageId: ids.gate1,
      acceptedScope: ref(f.scope), correction, idempotencyKey: 'revise-1',
      nextAttempt: { attemptId: id(410), operationId: id(411),
        inputHash: canonicalHash(reviseInput), inputPayload: reviseInput } }));
    expect(plan.createAttempts[0]).toMatchObject({ stageId: ids.compile, attemptNumber: 2 });
    expect(plan.stageMutations.find((value) => value.id === ids.gate1).patch.status).toBe('pending');
  });

  it('rejects scope revision facts that diverge from the persisted typed attempt input', () => {
    const f = fixture();
    const prior = attempt(ids.compileAttempt, ids.compile, ids.compileOperation, f.compile, {
      status: 'succeeded', leaseToken: null, leaseExpiresAt: null,
    });
    const correction = 'Target premium indoor-cat nutrition.';
    const wrongScope = { artifactId: id(412), artifactHash: 'f'.repeat(64), kind: 'scope' };
    const inputPayload = {
      type: 'ReviseScopeV2', acceptedScope: wrongScope, correction,
      correctionSourceSpans: [{ start: 0, end: correction.length, text: correction,
        sha256: sha256Hex(correction), offsetUnit: 'utf16_code_units' }],
    };
    expectCode(() => transition(snapshot({
      run: { status: 'awaiting_gate_1' },
      stages: fixedStages({ compile_scope: { status: 'completed', inputHash: prior.inputHash,
        outputArtifact: ref(f.scope) }, gate_1: { status: 'awaiting_approval' },
        execute_research: { status: 'pending' } }), attempts: [prior],
    }), event('ScopeRevisionRequested', { stageId: ids.compile, gateStageId: ids.gate1,
      acceptedScope: ref(f.scope), correction, idempotencyKey: 'revise-invalid',
      nextAttempt: { attemptId: id(413), operationId: id(414),
        inputHash: canonicalHash(inputPayload), inputPayload } })),
    'SCOPE_REVISION_INPUT_MISMATCH');
  });

  it.each([
    ['ready', 'completed', 'running'],
    ['ready_with_gaps', 'completed_with_evidence_gaps', 'running'],
    ['blocked', 'blocked', 'running'],
  ])('applies evidence readiness %s deterministically', (readiness, stageStatus, runStatus) => {
    const f = fixture({ readiness });
    const current = attempt(ids.researchAttempt, ids.research, ids.researchOperation, f.researchInput);
    const nextPlanning = next(ids.planning, ids.planningAttempt, ids.planningOperation, f.planInput);
    const nextBlockedReport = next(
      ids.synthesis, ids.synthesisAttempt, ids.synthesisOperation, f.blockedReportInput
    );
    const completionCell = {
      ready: 'activity-completed-research-ready',
      ready_with_gaps: 'activity-completed-research-gaps',
      blocked: 'activity-completed-research-blocked',
    }[readiness];
    const plan = transitionCell(completionCell, snapshot({
      run: { evidenceReadiness: null },
      stages: fixedStages({ compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
        execute_research: { status: 'running', inputHash: current.inputHash }, planning: { status: 'pending' } }),
      attempts: [current],
    }), event('ActivityCompleted', { stageId: ids.research, attemptId: current.id,
      leaseToken: ids.lease, result: { resultType: 'research_completed', artifact: f.research,
        evidenceReadiness: readiness },
      nextAttempts: readiness === 'blocked' ? [nextBlockedReport] : [nextPlanning] }));
    expect(plan.stageMutations.find((value) => value.id === ids.research).patch.status).toBe(stageStatus);
    expect(plan.runMutation.patch.status).toBe(runStatus);
    expect(plan.createAttempts).toHaveLength(1);
    if (readiness === 'blocked') {
      expect(plan.createAttempts[0]).toMatchObject({ stageId: ids.synthesis });
      expect(plan.stageMutations.filter((mutation) =>
        [ids.planning, ids.gate2, ids.evaluation].includes(mutation.id)
      ).every((mutation) => mutation.patch.status === 'cancelled')).toBe(true);
    }
  });

  it('rejects research that omits an accepted evidence requirement', () => {
    const f = fixture({ readiness: 'ready' });
    const payload = { ...f.research.payload, findings: f.research.payload.findings.slice(1) };
    const incompleteResearch = fact(
      id(746),
      'research',
      'application/json',
      payload,
      [f.scope.artifactId]
    );
    const current = attempt(
      ids.researchAttempt,
      ids.research,
      ids.researchOperation,
      f.researchInput
    );
    expectCode(() => transition(snapshot({
      stages: fixedStages({
        compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
        execute_research: { status: 'running', inputHash: current.inputHash },
        planning: { status: 'pending' },
      }),
      attempts: [current],
    }), event('ActivityCompleted', {
      eventId: id(747),
      stageId: ids.research,
      attemptId: current.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'research_completed',
        artifact: incompleteResearch,
        evidenceReadiness: 'ready',
      },
      nextAttempts: [next(
        ids.planning,
        ids.planningAttempt,
        ids.planningOperation,
        f.planInput
      )],
    })), 'RESEARCH_FINDING_AUTHORITY_MISMATCH');
  });

  it('rejects weakening selected-artifact proof for a product PRD', () => {
    const f = fixture({ readiness: 'ready' });
    const scopePayloadValue = structuredClone(f.scope.payload);
    scopePayloadValue.evidenceRequirements = scopePayloadValue.evidenceRequirements.map(
      (requirement) => requirement.id === 'feed-law'
        ? {
            ...requirement,
            evidenceRole: 'selected_artifact_proof',
            verificationBasis: 'selected_evidence',
          }
        : requirement
    );
    const acceptedScope = fact(
      id(748),
      'scope',
      'application/json',
      scopePayloadValue
    );
    const researchInput = {
      ...f.researchInput,
      acceptedScope: ref(acceptedScope),
      scope: acceptedScope.payload,
    };
    const payload = {
      ...f.research.payload,
      acceptedScopeArtifactId: acceptedScope.artifactId,
      acceptedScopeHash: acceptedScope.artifactHash,
      findings: f.research.payload.findings.map((finding) =>
        finding.requirementId === 'feed-law' ? { ...finding, blocking: false } : finding
      ),
    };
    const weakenedResearch = fact(
      id(759),
      'research',
      'application/json',
      payload,
      [acceptedScope.artifactId]
    );
    const planInput = {
      ...f.planInput,
      acceptedScope: ref(acceptedScope),
      research: ref(weakenedResearch),
    };
    const current = attempt(
      ids.researchAttempt,
      ids.research,
      ids.researchOperation,
      researchInput
    );
    expectCode(() => transition(snapshot({
      stages: fixedStages({
        compile_scope: { status: 'completed', outputArtifact: ref(acceptedScope) },
        execute_research: { status: 'running', inputHash: current.inputHash },
        planning: { status: 'pending' },
      }),
      attempts: [current],
    }), event('ActivityCompleted', {
      eventId: id(749),
      stageId: ids.research,
      attemptId: current.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'research_completed',
        artifact: weakenedResearch,
        evidenceReadiness: 'ready',
      },
      nextAttempts: [next(
        ids.planning,
        ids.planningAttempt,
        ids.planningOperation,
        planInput
      )],
    })), 'RESEARCH_FINDING_AUTHORITY_MISMATCH');
  });

  it('rejects weakening grounded legal evidence for launch authorization', () => {
    const f = fixture({ readiness: 'ready' });
    const scopePayloadValue = structuredClone(f.scope.payload);
    scopePayloadValue.deliverableProfile = {
      ...scopePayloadValue.deliverableProfile,
      artifactType: 'launch_authorization',
    };
    const acceptedScope = fact(
      id(756),
      'scope',
      'application/json',
      scopePayloadValue
    );
    const researchInput = {
      ...f.researchInput,
      acceptedScope: ref(acceptedScope),
      scope: acceptedScope.payload,
    };
    const payload = {
      ...f.research.payload,
      acceptedScopeArtifactId: acceptedScope.artifactId,
      acceptedScopeHash: acceptedScope.artifactHash,
      findings: f.research.payload.findings.map((finding) =>
        finding.requirementId === 'feed-law' ? { ...finding, blocking: false } : finding
      ),
    };
    const weakenedResearch = fact(
      id(757),
      'research',
      'application/json',
      payload,
      [acceptedScope.artifactId]
    );
    const planInput = {
      ...f.planInput,
      acceptedScope: ref(acceptedScope),
      research: ref(weakenedResearch),
    };
    const current = attempt(
      ids.researchAttempt,
      ids.research,
      ids.researchOperation,
      researchInput
    );
    expectCode(() => transition(snapshot({
      stages: fixedStages({
        compile_scope: { status: 'completed', outputArtifact: ref(acceptedScope) },
        execute_research: { status: 'running', inputHash: current.inputHash },
        planning: { status: 'pending' },
      }),
      attempts: [current],
    }), event('ActivityCompleted', {
      eventId: id(758),
      stageId: ids.research,
      attemptId: current.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'research_completed',
        artifact: weakenedResearch,
        evidenceReadiness: 'ready',
      },
      nextAttempts: [next(
        ids.planning,
        ids.planningAttempt,
        ids.planningOperation,
        planInput
      )],
    })), 'RESEARCH_FINDING_AUTHORITY_MISMATCH');
  });

  it('keeps missing future authorization proof nonblocking for a product PRD', () => {
    const f = fixture({ readiness: 'ready' });
    const scopePayloadValue = structuredClone(f.scope.payload);
    scopePayloadValue.evidenceRequirements = scopePayloadValue.evidenceRequirements.map(
      (requirement) => requirement.id === 'feed-law'
        ? {
            ...requirement,
            evidenceRole: 'future_authorization_proof',
            verificationBasis: 'selected_evidence',
          }
        : requirement
    );
    const acceptedScope = fact(
      id(750),
      'scope',
      'application/json',
      scopePayloadValue
    );
    const researchInput = {
      ...f.researchInput,
      acceptedScope: ref(acceptedScope),
      scope: acceptedScope.payload,
    };
    const researchPayloadValue = {
      ...f.research.payload,
      acceptedScopeArtifactId: acceptedScope.artifactId,
      acceptedScopeHash: acceptedScope.artifactHash,
      readiness: 'ready_with_gaps',
      findings: f.research.payload.findings.map((finding) =>
        finding.requirementId === 'feed-law'
          ? {
              ...finding,
              status: 'missing',
              blocking: false,
              note: 'Product-specific authorization is not yet available.',
            }
          : finding
      ),
      boundedRepairPasses: 1,
      assumptions: [],
      gaps: ['Product-specific authorization is not yet available.'],
    };
    const research = fact(
      id(751),
      'research',
      'application/json',
      researchPayloadValue,
      [acceptedScope.artifactId]
    );
    const planInput = {
      ...f.planInput,
      acceptedScope: ref(acceptedScope),
      research: ref(research),
    };
    const current = attempt(
      ids.researchAttempt,
      ids.research,
      ids.researchOperation,
      researchInput
    );
    const plan = transition(snapshot({
      stages: fixedStages({
        compile_scope: { status: 'completed', outputArtifact: ref(acceptedScope) },
        execute_research: { status: 'running', inputHash: current.inputHash },
        planning: { status: 'pending' },
      }),
      attempts: [current],
    }), event('ActivityCompleted', {
      eventId: id(752),
      stageId: ids.research,
      attemptId: current.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'research_completed',
        artifact: research,
        evidenceReadiness: 'ready_with_gaps',
      },
      nextAttempts: [next(
        ids.planning,
        ids.planningAttempt,
        ids.planningOperation,
        planInput
      )],
    }));

    expect(plan.runMutation.patch).toMatchObject({
      status: 'running',
      evidence_readiness: 'ready_with_gaps',
    });
    expect(plan.createAttempts).toHaveLength(1);
    expect(plan.createAttempts[0].stageId).toBe(ids.planning);
  });

  it('accepts missing statutory grounded evidence as nonblocking for a product PRD', () => {
    const f = fixture({ readiness: 'ready_with_gaps' });
    const researchPayloadValue = {
      ...f.research.payload,
      findings: f.research.payload.findings.map((finding) =>
        finding.requirementId === 'feed-law'
          ? {
              ...finding,
              status: 'missing',
              blocking: false,
              note: 'Statutory feed-law research is unresolved.',
            }
          : {
              ...finding,
              status: 'verified',
              blocking: false,
              note: 'Statistic verified.',
            }
      ),
      assumptions: [],
      gaps: ['Statutory feed-law research is unresolved.'],
    };
    const research = fact(
      id(754),
      'research',
      'application/json',
      researchPayloadValue,
      [f.scope.artifactId]
    );
    const planInput = {
      ...f.planInput,
      research: ref(research),
    };
    const current = attempt(
      ids.researchAttempt,
      ids.research,
      ids.researchOperation,
      f.researchInput
    );
    const plan = transition(snapshot({
      stages: fixedStages({
        compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
        execute_research: { status: 'running', inputHash: current.inputHash },
        planning: { status: 'pending' },
      }),
      attempts: [current],
    }), event('ActivityCompleted', {
      eventId: id(755),
      stageId: ids.research,
      attemptId: current.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'research_completed',
        artifact: research,
        evidenceReadiness: 'ready_with_gaps',
      },
      nextAttempts: [next(
        ids.planning,
        ids.planningAttempt,
        ids.planningOperation,
        planInput
      )],
    }));

    expect(plan.runMutation.patch).toMatchObject({
      status: 'running',
      evidence_readiness: 'ready_with_gaps',
    });
    expect(plan.createAttempts).toHaveLength(1);
    expect(plan.createAttempts[0].stageId).toBe(ids.planning);
  });

  it('rejects successor input types that do not belong to the target stage', () => {
    const f = fixture({ readiness: 'ready' });
    const current = attempt(ids.researchAttempt, ids.research, ids.researchOperation, f.researchInput);
    const wrongPlanning = next(
      ids.planning, ids.planningAttempt, ids.planningOperation, f.researchInput
    );
    expectCode(() => transition(snapshot({
      stages: fixedStages({ compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
        execute_research: { status: 'running', inputHash: current.inputHash },
        planning: { status: 'pending' } }), attempts: [current],
    }), event('ActivityCompleted', { stageId: ids.research, attemptId: current.id,
      leaseToken: ids.lease, result: { resultType: 'research_completed', artifact: f.research,
        evidenceReadiness: 'ready' }, nextAttempts: [wrongPlanning] })),
    'STAGE_INPUT_TYPE_MISMATCH');
  });

  it('rejects cyclic execution DAGs before opening Gate 2', () => {
    const f = fixture({ readiness: 'ready' });
    const cyclic = f.tasks.map((task, index) => {
      const core = {
        ...task,
        dependsOnStageKeys: index === 0
          ? ['domain-evidence-analysis', 'product-user-analysis']
          : ['core-draft'],
      };
      delete core.inputHash;
      return { ...core, inputHash: canonicalHash(core) };
    });
    const core = { ...f.plan.payload, tasks: cyclic };
    delete core.planHash;
    const payload = { ...core, planHash: canonicalHash(core) };
    const artifact = fact(f.plan.artifactId, 'plan', 'application/json', payload,
      [f.scope.artifactId, f.research.artifactId]);
    const current = attempt(ids.planningAttempt, ids.planning, ids.planningOperation, f.planInput);
    expect(() => transition(snapshot({
      run: { evidenceReadiness: 'ready' },
      stages: fixedStages({ compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
        execute_research: { status: 'completed', outputArtifact: ref(f.research) },
        planning: { status: 'running', inputHash: current.inputHash } }), attempts: [current],
    }), event('ActivityCompleted', { stageId: ids.planning, attemptId: current.id,
      leaseToken: ids.lease, result: { resultType: 'plan_created', artifact, planning: payload },
      nextAttempts: [] }))).toThrow(/parallel specialist roots|must be acyclic/);
  });

  it('rejects planning task keys that collide with stable workflow stages', () => {
    const f = fixture({ readiness: 'ready' });
    const taskCore = { ...f.tasks[0], stageKey: 'planning' };
    delete taskCore.inputHash;
    const task = { ...taskCore, inputHash: canonicalHash(taskCore) };
    const planCore = { ...f.plan.payload, tasks: [task, ...f.tasks.slice(1)] };
    delete planCore.planHash;
    const payload = { ...planCore, planHash: canonicalHash(planCore) };
    const artifact = fact(f.plan.artifactId, 'plan', 'application/json', payload,
      [f.scope.artifactId, f.research.artifactId]);
    const current = attempt(ids.planningAttempt, ids.planning, ids.planningOperation, f.planInput);
    expectCode(() => transition(snapshot({
      run: { evidenceReadiness: 'ready' },
      stages: fixedStages({ compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
        execute_research: { status: 'completed', outputArtifact: ref(f.research) },
        planning: { status: 'running', inputHash: current.inputHash } }), attempts: [current],
    }), event('ActivityCompleted', { stageId: ids.planning, attemptId: current.id,
      leaseToken: ids.lease, result: { resultType: 'plan_created', artifact, planning: payload },
      nextAttempts: [] })), 'RESERVED_STAGE_KEY');
  });

  it('creates a valid execution DAG and Gate 2 queues only its root', () => {
    const f = fixture({ readiness: 'ready' });
    const current = attempt(ids.planningAttempt, ids.planning, ids.planningOperation, f.planInput);
    const planningPlan = transitionCell('activity-completed-planning', snapshot({
      run: { evidenceReadiness: 'ready' },
      stages: fixedStages({ compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
        execute_research: { status: 'completed', outputArtifact: ref(f.research) },
        planning: { status: 'running', inputHash: current.inputHash }, gate_2: { status: 'pending' } }),
      attempts: [current],
    }), event('ActivityCompleted', { stageId: ids.planning, attemptId: current.id,
      leaseToken: ids.lease, result: { resultType: 'plan_created', artifact: f.plan,
        planning: f.plan.payload }, nextAttempts: [] }));
    expect(planningPlan.createStages).toHaveLength(3);
    expect(planningPlan.runMutation.patch.status).toBe('awaiting_gate_2');

    const executionStages = f.tasks.map((task, index) => stage(task.stageId, task.stageKey,
      'execution', 100 + index, { inputHash: task.inputHash }));
    const gateSnapshot = snapshot({
      run: { status: 'awaiting_gate_2' },
      stages: [...fixedStages({ compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
        execute_research: { status: 'completed', outputArtifact: ref(f.research) },
        planning: { status: 'completed', inputHash: current.inputHash, outputArtifact: ref(f.plan) },
        gate_2: { status: 'awaiting_approval' } }), ...executionStages],
      dependencies: [
        { stageId: ids.executionA, dependsOnStageId: ids.gate2 },
        { stageId: ids.executionB, dependsOnStageId: ids.gate2 },
        { stageId: ids.executionC, dependsOnStageId: ids.gate2 },
        { stageId: ids.executionA, dependsOnStageId: ids.executionB },
        { stageId: ids.executionA, dependsOnStageId: ids.executionC },
      ],
    });
    const rootAttempts = [
      next(ids.executionB, ids.executionAttemptB, ids.executionOperationB, f.executionInputs[1]),
      next(ids.executionC, ids.executionAttemptC, ids.executionOperationC, f.executionInputs[2]),
    ];
    const decisionHash = canonicalHash({ approvalKind: 'plan', artifact: ref(f.plan),
      inputHash: current.inputHash, selectedEvidence: [] });
    const approval = transitionCell('approval-granted-plan', gateSnapshot, event('ApprovalGranted', {
      approvalId: id(500), approvalKind: 'plan', stageId: ids.gate2, artifact: ref(f.plan),
      inputHash: current.inputHash, idempotencyKey: 'plan-approve', decisionHash,
      decidedBy: ids.owner, nextAttempts: rootAttempts,
    }));
    expect(approval.createAttempts.map((value) => value.stageId)).toEqual([
      ids.executionB,
      ids.executionC,
    ]);
    for (const rootAttempt of rootAttempts) {
      expect(approval.stageMutations.find((value) => value.id === rootAttempt.stageId).patch.input_hash)
        .toBe(rootAttempt.inputHash);
    }
  });

  it('cannot alter any approved execution task authority field before dispatch', () => {
    const f = fixture({ readiness: 'ready' });
    const planningInputHash = canonicalHash(f.planInput);
    const executionStage = stage(ids.executionA, 'deliverable-1', 'execution', 100, {
      inputHash: f.tasks[0].inputHash,
    });
    const gateSnapshot = snapshot({
      run: { status: 'awaiting_gate_2' },
      stages: [...fixedStages({
        compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
        execute_research: { status: 'completed', outputArtifact: ref(f.research) },
        planning: {
          status: 'completed', inputHash: planningInputHash, outputArtifact: ref(f.plan),
        },
        gate_2: { status: 'awaiting_approval' },
      }), executionStage],
      dependencies: [{ stageId: ids.executionA, dependsOnStageId: ids.gate2 }],
    });
    const decisionHash = canonicalHash({
      approvalKind: 'plan', artifact: ref(f.plan), inputHash: planningInputHash,
      selectedEvidence: [],
    });
    const mutations = [
      {
        agent: { ...f.tasks[0].agent, id: id(600) },
        agentId: id(600),
      },
      {
        agent: { ...f.tasks[0].agent, toolIds: [id(601)] },
        toolIds: [id(601)],
      },
      {
        agent: {
          ...f.tasks[0].agent,
          costPerRunCents: f.tasks[0].budgetCents + 1,
        },
        budgetCents: f.tasks[0].budgetCents + 1,
      },
      { dataBoundary: ['Credentials allowed'] },
    ];
    for (const [index, mutation] of mutations.entries()) {
      const core = { ...f.tasks[0], ...mutation };
      delete core.inputHash;
      const task = { ...core, inputHash: canonicalHash(core) };
      const inputPayload = { ...f.executionInputs[0], task };
      expectCode(() => transition(gateSnapshot, event('ApprovalGranted', {
        eventId: id(610 + index),
        approvalId: id(620 + index),
        approvalKind: 'plan',
        stageId: ids.gate2,
        artifact: ref(f.plan),
        inputHash: planningInputHash,
        idempotencyKey: `plan-tamper-${index}`,
        decisionHash,
        decidedBy: ids.owner,
        nextAttempts: [next(
          ids.executionA,
          id(630 + index),
          id(640 + index),
          inputPayload
        )],
      })), 'EXECUTION_SUCCESSOR_INPUT_MISMATCH');
    }
  });

  it('adopts duplicate approval clicks only when the full decision hash matches', () => {
    const f = fixture();
    const decisionHash = canonicalHash({
      approvalKind: 'scope',
      artifact: ref(f.scope),
      inputHash: canonicalHash(f.compile),
      selectedEvidence: [],
    });
    const approval = { id: id(500), kind: 'scope', stageId: ids.gate1, artifact: ref(f.scope),
      inputHash: canonicalHash(f.compile), idempotencyKey: 'scope-approve', decisionHash,
      decision: 'approved' };
    const duplicate = event('ApprovalGranted', { approvalId: id(501), approvalKind: 'scope',
      stageId: ids.gate1, artifact: ref(f.scope), inputHash: approval.inputHash,
      idempotencyKey: approval.idempotencyKey, decisionHash, decidedBy: ids.owner, nextAttempts: [] });
    const adopted = transitionCell(
      'approval-granted-duplicate',
      snapshot({ approvals: [approval] }),
      duplicate
    );
    expect(adopted.audit.eventType).toBe('ApprovalDuplicateAdopted');
    const changedEvidence = [{
      artifactId: id(509), artifactHash: 'e'.repeat(64), kind: 'evidence',
    }];
    expectCode(() => transition(snapshot({ approvals: [approval] }), {
      ...duplicate,
      selectedEvidence: changedEvidence,
      decisionHash: canonicalHash({
        approvalKind: 'scope',
        artifact: ref(f.scope),
        inputHash: approval.inputHash,
        selectedEvidence: changedEvidence,
      }),
    }), 'IDEMPOTENCY_CONFLICT');
  });

  it('binds scope approval to the exact selected evidence used by research', () => {
    const f = fixture();
    const inputHash = canonicalHash(f.compile);
    const selectedEvidence = [];
    const decisionHash = canonicalHash({
      approvalKind: 'scope', artifact: ref(f.scope), inputHash, selectedEvidence,
    });
    const gateSnapshot = snapshot({
      run: { status: 'awaiting_gate_1' },
      stages: fixedStages({ compile_scope: { status: 'completed', inputHash,
        outputArtifact: ref(f.scope) }, gate_1: { status: 'awaiting_approval' },
        execute_research: { status: 'pending' } }),
    });
    const approved = transitionCell(
      'approval-granted-scope',
      gateSnapshot,
      event('ApprovalGranted', {
        approvalId: id(524), approvalKind: 'scope', stageId: ids.gate1,
        artifact: ref(f.scope), inputHash, selectedEvidence,
        idempotencyKey: 'scope-evidence-valid', decisionHash, decidedBy: ids.owner,
        nextAttempts: [next(ids.research, id(525), id(526), f.researchInput)],
      })
    );
    expect(approved.createApproval).toMatchObject({
      kind: 'scope', artifact: ref(f.scope), inputHash,
    });
    const wrongEvidence = {
      artifactId: id(520), artifactHash: 'a'.repeat(64), kind: 'evidence',
    };
    const wrongResearchInput = {
      ...f.researchInput,
      selectedEvidence: [wrongEvidence],
    };
    expectCode(() => transition(gateSnapshot, event('ApprovalGranted', {
      approvalId: id(521), approvalKind: 'scope', stageId: ids.gate1,
      artifact: ref(f.scope), inputHash, selectedEvidence, idempotencyKey: 'scope-evidence-bind',
      decisionHash, decidedBy: ids.owner,
      nextAttempts: [next(ids.research, id(522), id(523), wrongResearchInput)],
    })), 'SCOPE_APPROVAL_INPUT_MISMATCH');
  });

  it('waits for parallel queued/running execution stages before evaluation', () => {
    const f = fixture({ taskCount: 2, readiness: 'ready' });
    const current = attempt(ids.executionAttemptA, ids.executionA, ids.executionOperationA,
      f.executionInputs[0]);
    const stages = [...fixedStages({ compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
      execute_research: { status: 'completed', outputArtifact: ref(f.research) },
      planning: { status: 'completed', outputArtifact: ref(f.plan) },
      evaluation: { status: 'pending' } }),
      stage(ids.executionA, 'deliverable-1', 'execution', 100, { status: 'running', inputHash: current.inputHash }),
      stage(ids.executionB, 'deliverable-2', 'execution', 101, { status: 'queued', inputHash: canonicalHash(f.executionInputs[1]) })];
    const plan = transitionCell('activity-completed-execution-successors', snapshot({ run: { evidenceReadiness: 'ready' }, stages,
      attempts: [current], dependencies: [] }), event('ActivityCompleted', {
      stageId: ids.executionA, attemptId: current.id, leaseToken: ids.lease,
      result: {
        resultType: 'task_completed',
        artifact: f.taskArtifacts[0],
        evidenceReadiness: 'ready',
      }, nextAttempts: [],
    }));
    expect(plan.createAttempts).toHaveLength(0);
  });

  it('keeps grounded task provenance structured until the final Markdown artifact', () => {
    const f = groundedExecutionFixture();
    const current = attempt(
      ids.executionAttemptA,
      ids.executionA,
      ids.executionOperationA,
      f.executionInput
    );
    const stages = [
      ...fixedStages({
        compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
        execute_research: { status: 'completed', outputArtifact: ref(f.research) },
        planning: { status: 'completed', outputArtifact: ref(f.plan) },
        evaluation: { status: 'pending' },
      }),
      stage(ids.executionA, 'deliverable-1', 'execution', 100, {
        status: 'running', inputHash: current.inputHash,
      }),
      stage(ids.executionB, 'deliverable-2', 'execution', 101, {
        status: 'queued', inputHash: canonicalHash(f.executionInputs[1]),
      }),
    ];
    const snapshotValue = snapshot({
      run: { evidenceReadiness: 'ready' },
      stages,
      attempts: [current],
      dependencies: [],
    });
    const completion = event('ActivityCompleted', {
      eventId: id(702),
      stageId: ids.executionA,
      attemptId: current.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'task_completed',
        artifact: f.taskResult,
        evidenceReadiness: 'ready',
      },
      nextAttempts: [],
    });

    const plan = transition(snapshotValue, completion);
    expect(plan.createArtifacts).toEqual([
      expect.objectContaining({
        artifactId: f.taskResult.artifactId,
        markdown: f.taskResult.markdown,
        payload: expect.objectContaining({ sourceAppendix: f.taskResult.payload.sourceAppendix }),
      }),
    ]);
    expect(f.taskResult.markdown).not.toContain('\n## Sources\n');

    expectCode(() => transition(snapshotValue, {
      ...completion,
      eventId: id(703),
      result: { ...completion.result, artifact: f.renderedTaskResult },
    }), 'SOURCE_APPENDIX_RENDER_MISMATCH');
  });

  it('queues evaluation after the last accepted execution artifact completes', () => {
    const f = fixture({ readiness: 'ready' });
    const specialists = completedSpecialistTopology(f);
    const current = attempt(ids.executionAttemptA, ids.executionA, ids.executionOperationA,
      f.executionInputs[0]);
    const stages = [...fixedStages({
      compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
      execute_research: { status: 'completed', outputArtifact: ref(f.research) },
      planning: { status: 'completed', outputArtifact: ref(f.plan) },
      evaluation: { status: 'pending' },
    }), stage(ids.executionA, 'deliverable-1', 'execution', 100, {
      status: 'running', inputHash: current.inputHash,
    }), ...specialists.stages];
    const plan = transitionCell(
      'activity-completed-execution-evaluation',
      snapshot({
        run: { evidenceReadiness: 'ready' },
        stages,
        attempts: [completedResearchAttempt(f), ...specialists.attempts, current],
        dependencies: specialists.dependencies,
      }),
      event('ActivityCompleted', {
        stageId: ids.executionA,
        attemptId: current.id,
        leaseToken: ids.lease,
        result: {
          resultType: 'task_completed',
          artifact: f.taskArtifacts[0],
          evidenceReadiness: 'ready',
        },
        nextAttempts: [
          next(ids.evaluation, ids.evaluationAttempt, ids.evaluationOperation, f.evaluationInput),
        ],
      })
    );
    expect(plan.createAttempts).toEqual([
      expect.objectContaining({ stageId: ids.evaluation, attemptNumber: 1 }),
    ]);
  });

  it('rejects caller-authored evaluation successor authority or output contract', () => {
    const f = fixture({ taskCount: 1, readiness: 'ready' });
    const current = attempt(
      ids.executionAttemptA,
      ids.executionA,
      ids.executionOperationA,
      f.executionInputs[0]
    );
    const stages = [...fixedStages({
      compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
      execute_research: { status: 'completed', outputArtifact: ref(f.research) },
      planning: { status: 'completed', outputArtifact: ref(f.plan) },
      evaluation: { status: 'pending' },
    }), stage(ids.executionA, 'deliverable-1', 'execution', 100, {
      status: 'running', inputHash: current.inputHash,
    })];
    const variants = [
      { acceptedScope: { ...ref(f.scope), artifactId: id(650) } },
      { research: { ...ref(f.research), artifactHash: 'a'.repeat(64) } },
      { acceptedPlan: { ...ref(f.plan), artifactId: id(651) } },
      { taskArtifacts: [{ ...ref(f.taskArtifacts[0]), artifactId: id(652) }] },
      {
        outputContract: {
          ...f.evaluationInput.outputContract,
          requiredSections: ['Injected successor directive'],
        },
      },
      {
        outputContract: {
          ...f.evaluationInput.outputContract,
          evidenceReadiness: 'ready_with_gaps',
          launchReadyAllowed: false,
        },
      },
    ];
    for (const [index, mutation] of variants.entries()) {
      const inputPayload = { ...f.evaluationInput, ...mutation };
      expect(() => transition(snapshot({
        run: { evidenceReadiness: 'ready' },
        stages,
        attempts: [completedResearchAttempt(f), current],
      }), event('ActivityCompleted', {
        eventId: id(660 + index),
        stageId: ids.executionA,
        attemptId: current.id,
        leaseToken: ids.lease,
        result: {
          resultType: 'task_completed',
          artifact: f.taskArtifacts[0],
          evidenceReadiness: 'ready',
        },
        nextAttempts: [next(
          ids.evaluation,
          id(670 + index),
          id(680 + index),
          inputPayload
        )],
      }))).toThrow();
    }
  });

  it('directly promotes only an existing accepted final task artifact and enqueues one export', () => {
    const f = fixture({ readiness: 'ready' });
    const specialists = completedSpecialistTopology(f);
    const coverage = f.tasks[0].acceptanceRequirementIds.map((requirementId) => ({
      requirementId, status: 'satisfied', note: 'Exact requirement satisfied.',
    }));
    const receipt = {
      agent: f.tasks[0].agent,
      toolIds: f.tasks[0].toolIds,
      budgetCents: f.tasks[0].budgetCents,
      dataBoundary: f.tasks[0].dataBoundary,
    };
    const finalTaskPayload = {
      schemaVersion: 'axwise.final-markdown.v1', title: 'PRD',
      markdown: '# Product requirements document\n\nComplete.',
      sourceArtifacts: f.executionInputs[0].sourceArtifacts,
      sourceAppendix: [],
      candidateAttestation: {
        task: f.tasks[0], requirementCoverage: coverage, executionReceipt: receipt,
      },
      evidenceReadiness: 'ready', launchReady: false,
    };
    const finalTask = fact(id(708), 'final_markdown', 'text/markdown', finalTaskPayload,
      finalTaskPayload.sourceArtifacts.map((value) => value.artifactId));
    const evaluatedArtifacts = [
      ref(finalTask), ref(f.taskArtifacts[1]), ref(f.taskArtifacts[2]),
    ].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    const evaluationSources = [
      ref(f.scope), ref(f.research), ref(f.plan), ref(finalTask),
      ref(f.taskArtifacts[1]), ref(f.taskArtifacts[2]),
    ]
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    const evaluationRecords = [
      f.scope, f.research, f.plan, finalTask, f.taskArtifacts[1], f.taskArtifacts[2],
    ]
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    const evalInput = {
      ...f.evaluationInput,
      taskArtifacts: evaluatedArtifacts,
      sourceArtifacts: evaluationSources,
      artifactContents: evaluationRecords.map((value) => ({
        artifact: ref(value), contentType: value.contentType,
        payload: value.payload, markdown: value.markdown,
      })),
    };
    const evalPayload = { schemaVersion: 'orqaly.evaluation.v1', taskArtifacts: evaluatedArtifacts,
      sourceArtifacts: evaluationSources,
      evidenceReadiness: 'ready', outputContractHash: canonicalHash(f.plan.payload.outputContract),
      repairPass: 0, outputContractSatisfied: true, promotedArtifact: ref(finalTask),
      unmetRequirementIds: [], unresolvedSourceMarkers: [], unsupportedPrecision: [],
      contradictions: [], staleTopicReferences: [], readinessViolations: [],
      substantiveContentDefects: [], practicalityDefects: [], repairRequired: false,
      repairInstructions: [],
      note: 'Exact contract satisfied.' };
    const evalArtifact = fact(id(108), 'evaluation', 'application/json', evalPayload,
      evaluationSources.map((value) => value.artifactId));
    const current = attempt(ids.evaluationAttempt, ids.evaluation, ids.evaluationOperation, evalInput);
    const stages = [...fixedStages({ evaluation: { status: 'running', inputHash: current.inputHash },
      compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
      execute_research: { status: 'completed', outputArtifact: ref(f.research) },
      planning: { status: 'completed', outputArtifact: ref(f.plan) } }),
      stage(ids.executionA, f.tasks[0].stageKey, 'execution', 100, { status: 'completed',
        inputHash: canonicalHash(f.executionInputs[0]), outputArtifact: ref(finalTask) }),
      ...specialists.stages];
    const completedExecution = attempt(
      ids.executionAttemptA,
      ids.executionA,
      ids.executionOperationA,
      f.executionInputs[0],
      { status: 'succeeded', leaseToken: null, leaseExpiresAt: null }
    );
    const snapshotValue = snapshot({ run: { evidenceReadiness: 'ready' }, stages,
      attempts: [completedResearchAttempt(f), ...specialists.attempts, completedExecution, current],
      dependencies: specialists.dependencies });
    const eventValue = event('ActivityCompleted', { stageId: ids.evaluation,
      attemptId: current.id, leaseToken: ids.lease, result: {
        resultType: 'evaluation_completed', artifact: evalArtifact,
        executionOutputContractSatisfied: true, directPromotionArtifact: ref(finalTask),
      }, nextAttempts: [] });
    const plan = transitionCell(
      'activity-completed-evaluation-promote', snapshotValue, eventValue
    );
    expect(plan.runMutation.patch).toMatchObject({ status: 'completed', final_artifact_id: finalTask.artifactId });
    expect(plan.stageMutations).toContainEqual({
      id: ids.synthesis,
      expectedVersion: 1,
      patch: { status: 'cancelled' },
    });
    expect(plan.createAttempts).toEqual([]);
    expect(plan.outbox[0]).toMatchObject({ commandType: 'export_final_artifact', artifact: ref(finalTask) });
    expectCode(() => transition({
      ...snapshotValue,
      stages: snapshotValue.stages.map((candidate) => candidate.kind === 'synthesis'
        ? { ...candidate, status: 'queued', inputHash: 'f'.repeat(64) }
        : candidate),
    }, { ...eventValue, eventId: id(109) }), 'SYNTHESIS_NOT_SKIPPABLE');
  });

  it('trusts AxWise typed evaluation instead of reparsing direct-promotion prose', () => {
    const f = fixture({ readiness: 'ready_with_gaps' });
    const specialists = completedSpecialistTopology(f);
    const coverage = f.tasks[0].acceptanceRequirementIds.map((requirementId) => ({
      requirementId, status: 'satisfied', note: 'Exact requirement satisfied.',
    }));
    const finalTaskPayload = {
      schemaVersion: 'axwise.final-markdown.v1', title: 'Bounded PRD',
      markdown: '# Product requirements document\n\nThis is a non-launch-ready planning artifact.',
      sourceArtifacts: f.executionInputs[0].sourceArtifacts,
      sourceAppendix: [],
      candidateAttestation: {
        task: f.tasks[0],
        requirementCoverage: coverage,
        executionReceipt: {
          agent: f.tasks[0].agent,
          toolIds: f.tasks[0].toolIds,
          budgetCents: f.tasks[0].budgetCents,
          dataBoundary: f.tasks[0].dataBoundary,
        },
      },
      evidenceReadiness: 'ready_with_gaps', launchReady: false,
    };
    const finalTask = fact(id(550), 'final_markdown', 'text/markdown', finalTaskPayload,
      finalTaskPayload.sourceArtifacts.map((value) => value.artifactId));
    const evaluatedArtifacts = [
      ref(finalTask), ref(f.taskArtifacts[1]), ref(f.taskArtifacts[2]),
    ].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    const evaluationSources = [
      ref(f.scope), ref(f.research), ref(f.plan), ref(finalTask),
      ref(f.taskArtifacts[1]), ref(f.taskArtifacts[2]),
    ]
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    const records = [
      f.scope, f.research, f.plan, finalTask, f.taskArtifacts[1], f.taskArtifacts[2],
    ]
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    const inputPayload = {
      ...f.evaluationInput,
      taskArtifacts: evaluatedArtifacts,
      sourceArtifacts: evaluationSources,
      artifactContents: records.map((value) => ({
        artifact: ref(value), contentType: value.contentType,
        payload: value.payload, markdown: value.markdown,
      })),
    };
    const evaluationPayload = {
      schemaVersion: 'orqaly.evaluation.v1',
      taskArtifacts: evaluatedArtifacts,
      sourceArtifacts: evaluationSources,
      evidenceReadiness: 'ready_with_gaps',
      outputContractHash: canonicalHash(inputPayload.outputContract),
      repairPass: 0,
      outputContractSatisfied: true,
      promotedArtifact: ref(finalTask),
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
      note: 'AxWise typed evaluation accepted the bounded candidate.',
    };
    const evaluation = fact(id(551), 'evaluation', 'application/json', evaluationPayload,
      evaluationSources.map((value) => value.artifactId));
    const current = attempt(
      ids.evaluationAttempt, ids.evaluation, ids.evaluationOperation, inputPayload
    );
    const completedExecution = attempt(
      ids.executionAttemptA, ids.executionA, ids.executionOperationA, f.executionInputs[0],
      { status: 'succeeded', leaseToken: null, leaseExpiresAt: null }
    );
    const stages = [...fixedStages({
      evaluation: { status: 'running', inputHash: current.inputHash },
      compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
      execute_research: { status: 'completed_with_evidence_gaps', outputArtifact: ref(f.research) },
      planning: { status: 'completed', outputArtifact: ref(f.plan) },
    }), stage(ids.executionA, 'deliverable-1', 'execution', 100, {
      status: 'completed', inputHash: canonicalHash(f.executionInputs[0]),
      outputArtifact: ref(finalTask),
    }), ...specialists.stages];
    const plan = transition(snapshot({
      run: { evidenceReadiness: 'ready_with_gaps' },
      stages,
      attempts: [completedResearchAttempt(f), ...specialists.attempts, completedExecution, current],
      dependencies: specialists.dependencies,
    }), event('ActivityCompleted', {
      eventId: id(552),
      stageId: ids.evaluation,
      attemptId: current.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'evaluation_completed',
        artifact: evaluation,
        executionOutputContractSatisfied: true,
        directPromotionArtifact: ref(finalTask),
      },
      nextAttempts: [],
    }));
    expect(plan.runMutation.patch).toMatchObject({
      status: 'completed_with_evidence_gaps',
      final_artifact_id: finalTask.artifactId,
    });
  });

  it('rejects a forged direct-final candidate without exact task attestation', () => {
    const f = fixture({ readiness: 'ready' });
    const specialists = completedSpecialistTopology(f);
    const payload = {
      schemaVersion: 'axwise.final-markdown.v1',
      title: 'Forged candidate',
      markdown: '# Product requirements document\n\nLooks complete.',
      sourceArtifacts: f.executionInputs[0].sourceArtifacts,
      sourceAppendix: [],
      candidateAttestation: null,
      evidenceReadiness: 'ready',
      launchReady: false,
    };
    const forged = fact(
      id(541),
      'final_markdown',
      'text/markdown',
      payload,
      payload.sourceArtifacts.map((artifact) => artifact.artifactId)
    );
    const current = attempt(
      ids.executionAttemptA,
      ids.executionA,
      ids.executionOperationA,
      f.executionInputs[0]
    );
    const stages = [...fixedStages({
      compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
      execute_research: { status: 'completed', outputArtifact: ref(f.research) },
      planning: { status: 'completed', outputArtifact: ref(f.plan) },
      evaluation: { status: 'pending' },
    }), stage(ids.executionA, f.tasks[0].stageKey, 'execution', 100, {
      status: 'running',
      inputHash: current.inputHash,
    }), ...specialists.stages];
    expectCode(() => transition(snapshot({
      run: { evidenceReadiness: 'ready' },
      stages,
      attempts: [...specialists.attempts, current],
      dependencies: specialists.dependencies,
    }), event('ActivityCompleted', {
      stageId: ids.executionA,
      attemptId: current.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'task_completed',
        artifact: forged,
        evidenceReadiness: 'ready',
      },
      nextAttempts: [],
    })), 'FINAL_READINESS_MISMATCH');
  });

  it('rejects launch authority from a ready product-PRD execution candidate', () => {
    const f = fixture({ readiness: 'ready' });
    const specialists = completedSpecialistTopology(f);
    const task = f.tasks[0];
    const payload = {
      schemaVersion: 'axwise.final-markdown.v1',
      title: 'Overclaiming product PRD',
      markdown: '# Product requirements document\n\nComplete product plan.',
      sourceArtifacts: f.executionInputs[0].sourceArtifacts,
      sourceAppendix: [],
      candidateAttestation: {
        task,
        requirementCoverage: task.acceptanceRequirementIds.map((requirementId) => ({
          requirementId,
          status: 'satisfied',
          note: 'Exact requirement satisfied.',
        })),
        executionReceipt: {
          agent: task.agent,
          toolIds: task.toolIds,
          budgetCents: task.budgetCents,
          dataBoundary: task.dataBoundary,
        },
      },
      evidenceReadiness: 'ready',
      launchReady: true,
    };
    const candidate = fact(
      id(742),
      'final_markdown',
      'text/markdown',
      payload,
      payload.sourceArtifacts.map((artifact) => artifact.artifactId)
    );
    const current = attempt(
      ids.executionAttemptA,
      ids.executionA,
      ids.executionOperationA,
      f.executionInputs[0]
    );
    const stages = [...fixedStages({
      compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
      execute_research: { status: 'completed', outputArtifact: ref(f.research) },
      planning: { status: 'completed', outputArtifact: ref(f.plan) },
      evaluation: { status: 'pending' },
    }), stage(ids.executionA, task.stageKey, 'execution', 100, {
      status: 'running',
      inputHash: current.inputHash,
    }), ...specialists.stages];

    expectCode(() => transition(snapshot({
      run: { evidenceReadiness: 'ready' },
      stages,
      attempts: [...specialists.attempts, current],
      dependencies: specialists.dependencies,
    }), event('ActivityCompleted', {
      eventId: id(743),
      stageId: ids.executionA,
      attemptId: current.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'task_completed',
        artifact: candidate,
        evidenceReadiness: 'ready',
      },
      nextAttempts: [],
    })), 'FINAL_READINESS_MISMATCH');
  });

  it('queues synthesis when evaluation proves accepted task output is incomplete', () => {
    const f = fixture({ readiness: 'ready_with_gaps' });
    const specialists = completedSpecialistTopology(f);
    const current = attempt(
      ids.evaluationAttempt,
      ids.evaluation,
      ids.evaluationOperation,
      f.evaluationInput
    );
    const stages = [...fixedStages({
      compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
      execute_research: { status: 'completed_with_evidence_gaps', outputArtifact: ref(f.research) },
      planning: { status: 'completed', outputArtifact: ref(f.plan) },
      evaluation: { status: 'running', inputHash: current.inputHash },
      synthesis: { status: 'pending' },
    }), stage(ids.executionA, 'deliverable-1', 'execution', 100, {
      status: 'completed', outputArtifact: ref(f.taskArtifacts[0]),
    }), ...specialists.stages];
    const plan = transitionCell(
      'activity-completed-evaluation-synthesize',
      snapshot({
        run: { evidenceReadiness: 'ready_with_gaps' },
        stages,
        attempts: [completedResearchAttempt(f), current],
        dependencies: specialists.dependencies,
      }),
      event('ActivityCompleted', {
        stageId: ids.evaluation,
        attemptId: current.id,
        leaseToken: ids.lease,
        result: {
          resultType: 'evaluation_completed',
          artifact: f.evaluation,
          executionOutputContractSatisfied: false,
          directPromotionArtifact: null,
        },
        nextAttempts: [
          next(ids.synthesis, ids.synthesisAttempt, ids.synthesisOperation, f.synthesisInput),
        ],
      })
    );
    expect(plan.createAttempts).toEqual([
      expect.objectContaining({ stageId: ids.synthesis, attemptNumber: 1 }),
    ]);
  });

  it('rejects caller-authored synthesis refs, contents, readiness, or required sections', () => {
    const f = fixture({ taskCount: 1, readiness: 'ready_with_gaps' });
    const current = attempt(
      ids.evaluationAttempt,
      ids.evaluation,
      ids.evaluationOperation,
      f.evaluationInput
    );
    const stages = [...fixedStages({
      compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
      execute_research: { status: 'completed_with_evidence_gaps', outputArtifact: ref(f.research) },
      planning: { status: 'completed', outputArtifact: ref(f.plan) },
      evaluation: { status: 'running', inputHash: current.inputHash },
      synthesis: { status: 'pending' },
    }), stage(ids.executionA, 'deliverable-1', 'execution', 100, {
      status: 'completed', outputArtifact: ref(f.taskArtifacts[0]),
    })];
    const alternatePlanRef = { ...ref(f.plan), artifactId: id(690) };
    const alternateTaskRef = { ...ref(f.taskArtifacts[0]), artifactId: id(691) };
    const alternateEvaluationRef = { ...ref(f.evaluation), artifactId: id(692) };
    const variants = [
      { acceptedScope: { ...ref(f.scope), artifactId: id(693) } },
      { research: { ...ref(f.research), artifactHash: 'b'.repeat(64) } },
      {
        acceptedPlan: alternatePlanRef,
        artifactContents: f.synthesisInput.artifactContents.map((content, index) =>
          index === 0 ? { ...content, artifact: alternatePlanRef } : content
        ),
      },
      {
        taskArtifacts: [alternateTaskRef],
        artifactContents: f.synthesisInput.artifactContents.map((content) =>
          content.artifact.kind === 'task_result'
            ? { ...content, artifact: alternateTaskRef }
            : content
        ),
      },
      {
        evaluation: alternateEvaluationRef,
        artifactContents: f.synthesisInput.artifactContents.map((content) =>
          content.artifact.kind === 'evaluation'
            ? { ...content, artifact: alternateEvaluationRef }
            : content
        ),
      },
      {
        outputContract: {
          ...f.synthesisInput.outputContract,
          requiredSections: ['Injected successor directive'],
        },
      },
      {
        outputContract: { ...f.synthesisInput.outputContract, evidenceReadiness: 'ready' },
      },
    ];
    for (const [index, mutation] of variants.entries()) {
      const inputPayload = { ...f.synthesisInput, ...mutation };
      expect(() => transition(snapshot({
        run: { evidenceReadiness: 'ready_with_gaps' },
        stages,
        attempts: [completedResearchAttempt(f), current],
      }), event('ActivityCompleted', {
        eventId: id(700 + index),
        stageId: ids.evaluation,
        attemptId: current.id,
        leaseToken: ids.lease,
        result: {
          resultType: 'evaluation_completed',
          artifact: f.evaluation,
          executionOutputContractSatisfied: false,
          directPromotionArtifact: null,
        },
        nextAttempts: [next(
          ids.synthesis,
          id(710 + index),
          id(720 + index),
          inputPayload
        )],
      }))).toThrow();
    }
  });

  it('synthesis completes with gaps without launch-ready semantics and atomically queues export', () => {
    const f = fixture({ readiness: 'ready_with_gaps' });
    const current = attempt(ids.synthesisAttempt, ids.synthesis, ids.synthesisOperation,
      f.synthesisInput);
    const stages = fixedStages({ synthesis: { status: 'running', inputHash: current.inputHash } });
    const plan = transitionCell('activity-completed-synthesis', snapshot({ run: { evidenceReadiness: 'ready_with_gaps' }, stages,
      attempts: [current] }), event('ActivityCompleted', { stageId: ids.synthesis,
      attemptId: current.id, leaseToken: ids.lease, result: {
        resultType: 'artifact_synthesized', artifact: f.final,
        evidenceReadiness: 'ready_with_gaps',
      }, nextAttempts: [] }));
    expect(plan.runMutation.patch.status).toBe('completed_with_evidence_gaps');
    expect(plan.outbox).toHaveLength(1);
    expect(plan.outbox[0].idempotencyKey).toContain(f.final.artifactHash);
  });

  it('rejects launch authority from terminal synthesis of a ready product PRD', () => {
    const f = fixture({ readiness: 'ready' });
    const payload = { ...f.final.payload, launchReady: true };
    const overclaimingFinal = fact(
      id(744),
      'final_markdown',
      'text/markdown',
      payload,
      payload.sourceArtifacts.map((artifact) => artifact.artifactId)
    );
    const current = attempt(
      ids.synthesisAttempt,
      ids.synthesis,
      ids.synthesisOperation,
      f.synthesisInput
    );
    const stages = fixedStages({
      synthesis: { status: 'running', inputHash: current.inputHash },
    });
    expectCode(() => transition(snapshot({
      run: { evidenceReadiness: 'ready' },
      stages,
      attempts: [current],
    }), event('ActivityCompleted', {
      eventId: id(745),
      stageId: ids.synthesis,
      attemptId: current.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'artifact_synthesized',
        artifact: overclaimingFinal,
        evidenceReadiness: 'ready',
      },
      nextAttempts: [],
    })), 'FINAL_READINESS_MISMATCH');
  });

  it('exports a grounded blocked report while keeping planning skipped and the run blocked', () => {
    const f = groundedBlockedFixture();
    const final = f.finalWith();
    const current = attempt(
      ids.synthesisAttempt,
      ids.synthesis,
      ids.synthesisOperation,
      f.blockedReportInput
    );
    const stages = fixedStages({
      compile_scope: { status: 'completed', outputArtifact: ref(f.scope) },
      execute_research: { status: 'blocked', outputArtifact: ref(f.research) },
      planning: { status: 'cancelled' },
      gate_2: { status: 'cancelled' },
      evaluation: { status: 'cancelled' },
      synthesis: { status: 'running', inputHash: current.inputHash },
    });
    const plan = transition(snapshot({
      run: { evidenceReadiness: 'blocked' },
      stages,
      attempts: [current],
    }), event('ActivityCompleted', {
      stageId: ids.synthesis,
      attemptId: current.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'artifact_synthesized',
        artifact: final,
        evidenceReadiness: 'blocked',
      },
      nextAttempts: [],
    }));
    expect(plan.runMutation.patch).toMatchObject({
      status: 'blocked',
      final_artifact_id: final.artifactId,
    });
    expect(plan.createStages).toEqual([]);
    expect(plan.createAttempts).toEqual([]);
    expect(plan.outbox).toEqual([
      expect.objectContaining({ commandType: 'export_final_artifact', artifact: ref(final) }),
    ]);
  });

  it('groups rendered source rows while preserving exact per-section evidence bindings', () => {
    const f = groundedBlockedFixture();
    const remediationEntry = {
      ...f.appendixEntry,
      supportedSection: 'Remediation plan',
    };
    const appendix = [f.appendixEntry, remediationEntry];
    const body = [
      '# Evidence decision',
      '',
      `The essential legal evidence is unresolved [evidence:${f.appendixEntry.claimId}].`,
      '',
      '## Remediation plan',
      '',
      `Verify the same authoritative source before launch [evidence:${f.appendixEntry.claimId}].`,
    ].join('\n');
    const groupedRow =
      `- \`[evidence:${f.appendixEntry.claimId}]\` — ${f.appendixEntry.sourceTitle} — ` +
      `${f.appendixEntry.canonicalUrl} — class: \`${f.appendixEntry.sourceClass}\` — ` +
      `retrieved: \`${f.appendixEntry.retrievalDate}\` — ` +
      'section: Evidence decision · Remediation plan — ' +
      `supported claim: ${f.appendixEntry.supportedClaim}`;
    const final = f.finalWith({ appendix, appendixBody: groupedRow, body });
    const current = attempt(
      ids.synthesisAttempt,
      ids.synthesis,
      ids.synthesisOperation,
      f.blockedReportInput
    );
    const stages = fixedStages({
      synthesis: { status: 'running', inputHash: current.inputHash },
    });
    const completion = event('ActivityCompleted', {
      stageId: ids.synthesis,
      attemptId: current.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'artifact_synthesized',
        artifact: final,
        evidenceReadiness: 'blocked',
      },
      nextAttempts: [],
    });

    const plan = transition(snapshot({
      run: { evidenceReadiness: 'blocked' },
      stages,
      attempts: [current],
    }), completion);
    expect(plan.createArtifacts[0].payload.sourceAppendix).toEqual(appendix);
    expect(plan.createArtifacts[0].markdown.match(/^- `\[evidence:/gmu)).toHaveLength(1);
    expect(plan.createArtifacts[0].markdown).toContain(
      'section: Evidence decision · Remediation plan'
    );

    const repeatedRows = f.finalWith({ appendix, body });
    expectCode(() => transition(snapshot({
      run: { evidenceReadiness: 'blocked' },
      stages,
      attempts: [current],
    }), {
      ...completion,
      eventId: id(541),
      result: { ...completion.result, artifact: repeatedRows },
    }), 'SOURCE_APPENDIX_RENDER_MISMATCH');
  });

  it('rejects circular appendix sections and arbitrary model-authored Sources rows', () => {
    const grounded = groundedBlockedFixture();
    const circularEntry = { ...grounded.appendixEntry, supportedSection: 'Sources' };
    const circular = grounded.finalWith({ appendix: [circularEntry] });
    const groundedAttempt = attempt(
      ids.synthesisAttempt,
      ids.synthesis,
      ids.synthesisOperation,
      grounded.blockedReportInput
    );
    const groundedStages = fixedStages({
      synthesis: { status: 'running', inputHash: groundedAttempt.inputHash },
    });
    expectCode(() => transition(snapshot({
      run: { evidenceReadiness: 'blocked' },
      stages: groundedStages,
      attempts: [groundedAttempt],
    }), event('ActivityCompleted', {
      stageId: ids.synthesis,
      attemptId: groundedAttempt.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'artifact_synthesized',
        artifact: circular,
        evidenceReadiness: 'blocked',
      },
      nextAttempts: [],
    })), 'SOURCE_APPENDIX_MISMATCH');

    const validGrounded = grounded.finalWith();
    const preHeadingPayload = {
      ...validGrounded.payload,
      markdown: `[evidence:${grounded.appendixEntry.claimId}]\n\n${validGrounded.markdown}`,
    };
    const preHeading = fact(
      id(544),
      'final_markdown',
      'text/markdown',
      preHeadingPayload,
      preHeadingPayload.sourceArtifacts.map((artifact) => artifact.artifactId)
    );
    expectCode(() => transition(snapshot({
      run: { evidenceReadiness: 'blocked' },
      stages: groundedStages,
      attempts: [groundedAttempt],
    }), event('ActivityCompleted', {
      eventId: id(545),
      stageId: ids.synthesis,
      attemptId: groundedAttempt.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'artifact_synthesized',
        artifact: preHeading,
        evidenceReadiness: 'blocked',
      },
      nextAttempts: [],
    })), 'SOURCE_APPENDIX_MISMATCH');

    const malformedMarkerPayload = {
      ...validGrounded.payload,
      markdown: validGrounded.markdown.replace(
        `[evidence:${grounded.appendixEntry.claimId}]`,
        '[evidence:NOT-A-CLAIM-ID]'
      ),
    };
    const malformedMarker = fact(
      id(546),
      'final_markdown',
      'text/markdown',
      malformedMarkerPayload,
      malformedMarkerPayload.sourceArtifacts.map((artifact) => artifact.artifactId)
    );
    expectCode(() => transition(snapshot({
      run: { evidenceReadiness: 'blocked' },
      stages: groundedStages,
      attempts: [groundedAttempt],
    }), event('ActivityCompleted', {
      eventId: id(547),
      stageId: ids.synthesis,
      attemptId: groundedAttempt.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'artifact_synthesized',
        artifact: malformedMarker,
        evidenceReadiness: 'blocked',
      },
      nextAttempts: [],
    })), 'UNRESOLVED_EVIDENCE_MARKER');

    const modelSourceHeadingPayload = {
      ...validGrounded.payload,
      markdown: validGrounded.markdown.replace(
        '\n\n## Sources',
        '\n\n### References\n\nModel-authored source material.\n\n## Sources'
      ),
    };
    const modelSourceHeading = fact(
      id(548),
      'final_markdown',
      'text/markdown',
      modelSourceHeadingPayload,
      modelSourceHeadingPayload.sourceArtifacts.map((artifact) => artifact.artifactId)
    );
    expectCode(() => transition(snapshot({
      run: { evidenceReadiness: 'blocked' },
      stages: groundedStages,
      attempts: [groundedAttempt],
    }), event('ActivityCompleted', {
      eventId: id(549),
      stageId: ids.synthesis,
      attemptId: groundedAttempt.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'artifact_synthesized',
        artifact: modelSourceHeading,
        evidenceReadiness: 'blocked',
      },
      nextAttempts: [],
    })), 'SOURCE_APPENDIX_RENDER_MISMATCH');

    const empty = fixture({ readiness: 'blocked' });
    const emptySources = empty.blockedReportInput.sourceArtifacts;
    const markdown = [
      '# Evidence decision',
      '',
      'Evidence is blocked.',
      '',
      '## Remediation plan',
      '',
      'Verify the essential evidence.',
      '',
      '## Sources',
      '',
      '- fabricated model-authored row',
      '',
    ].join('\n');
    const arbitraryPayload = {
      schemaVersion: 'axwise.final-markdown.v1',
      title: 'Blocked report',
      markdown,
      sourceArtifacts: emptySources,
      sourceAppendix: [],
      candidateAttestation: null,
      evidenceReadiness: 'blocked',
      launchReady: false,
    };
    const arbitrary = fact(
      id(542),
      'final_markdown',
      'text/markdown',
      arbitraryPayload,
      emptySources.map((artifact) => artifact.artifactId)
    );
    const emptyAttempt = attempt(
      ids.synthesisAttempt,
      ids.synthesis,
      ids.synthesisOperation,
      empty.blockedReportInput
    );
    expectCode(() => transition(snapshot({
      run: { evidenceReadiness: 'blocked' },
      stages: fixedStages({ synthesis: { status: 'running', inputHash: emptyAttempt.inputHash } }),
      attempts: [emptyAttempt],
    }), event('ActivityCompleted', {
      eventId: id(543),
      stageId: ids.synthesis,
      attemptId: emptyAttempt.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'artifact_synthesized',
        artifact: arbitrary,
        evidenceReadiness: 'blocked',
      },
      nextAttempts: [],
    })), 'SOURCE_APPENDIX_RENDER_MISMATCH');
  });

  it.each([
    'This is a non-launch-ready planning artifact.',
    'Launch-ready status: false.',
    'Launch-ready claims are prohibited.',
  ])('trusts an AxWise-validated typed synthesis receipt containing %j', (claim) => {
    const f = fixture({ readiness: 'ready_with_gaps' });
    const unsafePayload = {
      ...f.final.payload,
      markdown: `${f.final.payload.markdown}\n\n${claim}`,
    };
    const unsafeFinal = fact(
      f.final.artifactId,
      'final_markdown',
      'text/markdown',
      unsafePayload,
      unsafePayload.sourceArtifacts.map((value) => value.artifactId)
    );
    const current = attempt(
      ids.synthesisAttempt,
      ids.synthesis,
      ids.synthesisOperation,
      f.synthesisInput
    );
    const stages = fixedStages({
      synthesis: { status: 'running', inputHash: current.inputHash },
    });
    const plan = transition(snapshot({
      run: { evidenceReadiness: 'ready_with_gaps' },
      stages,
      attempts: [current],
    }), event('ActivityCompleted', {
      stageId: ids.synthesis,
      attemptId: current.id,
      leaseToken: ids.lease,
      result: {
        resultType: 'artifact_synthesized',
        artifact: unsafeFinal,
        evidenceReadiness: 'ready_with_gaps',
      },
      nextAttempts: [],
    }));
    expect(plan.runMutation.patch.status).toBe('completed_with_evidence_gaps');
  });
});
