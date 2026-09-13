import { randomUUID } from 'node:crypto';
import {
  artifactContentHash,
  canonicalHash,
  sha256Hex,
} from '../lib/workflow-v2/canonical.js';
import { CompletionResultSchema } from '../shared/workflow-v2/contracts.js';

const REQUEST = 'Create an Estonia cat-food launch PRD.';
export const LOCAL_E2E_REQUEST = REQUEST;
export const LOCAL_E2E_GAP = 'Optional current market size remains unverified.';
export const LOCAL_E2E_ASSUMPTION = 'Synthetic Preview run';

function acceptedRequirement(category, description, priority = 'P1', authority = 'owner') {
  const semantic = { category, description, priority, authority };
  return { id: `req-${canonicalHash(semantic).slice(0, 16)}`, ...semantic };
}

function sourceSpan(source, text) {
  const start = source.indexOf(text);
  if (start < 0) throw new Error(`source text does not contain ${JSON.stringify(text)}`);
  return {
    start,
    end: start + text.length,
    text,
    sha256: sha256Hex(text),
    offsetUnit: 'utf16_code_units',
  };
}

function artifactFact({ artifactId, kind, contentType, payload, sourceArtifactIds }) {
  const markdown = contentType === 'text/markdown' ? payload.markdown : null;
  const base = {
    artifactId: artifactId || randomUUID(),
    kind,
    contentType,
    payload,
    markdown,
    sourceArtifactIds: [...sourceArtifactIds].sort(),
  };
  return { ...base, artifactHash: artifactContentHash(base) };
}

function artifactRef(artifact) {
  return {
    artifactId: artifact.artifactId,
    artifactHash: artifact.artifactHash,
    kind: artifact.kind,
  };
}

export function createScopeCompletion({
  request = REQUEST,
  inputHash,
  artifactId,
  latencyMs = 12,
}) {
  const evidenceRequirements = [
    {
      id: 'market-statistics',
      claimType: 'market_statistic',
      description: 'Current market size evidence.',
      criticality: 'nonblocking',
      evidenceRole: 'grounded_claim',
      verificationBasis: 'grounded_claims',
      appliesWhen: 'Market sizing is discussed.',
      acceptedSourceTypes: ['official_statistics'],
      allowedSourceHosts: [],
    },
  ];
  const deliverables = ['Product requirements document'];
  const personas = [];
  const interviewRequirements = [];
  const prdRequirements = ['Label evidence gaps'];
  const limits = ['No payment data'];
  const policies = ['Do not claim launch-ready with evidence gaps'];
  const requirements = [
    ...deliverables.map((description) => acceptedRequirement('deliverable', description, 'P0')),
    ...evidenceRequirements.map(({ description }) =>
      acceptedRequirement('evidence', description, 'P2', 'axwise_derived')
    ),
    ...prdRequirements.map((description) => acceptedRequirement('prd', description, 'P0')),
    ...limits.map((description) => acceptedRequirement('limit', description, 'P0')),
    ...policies.map((description) => acceptedRequirement('policy', description, 'P0')),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const criterionSemantic = {
    given: 'The accepted scope and immutable evidence boundary are available.',
    when: 'The product requirements document is evaluated.',
    then: 'Every accepted requirement is visibly satisfied or explicitly retained as a gap.',
    supports: requirements.map((requirement) => requirement.id),
  };
  const researchInput = {
    objective: request,
    geography: ['Estonia'],
    evidenceRequirements: ['market-statistics'],
    deliverables: ['Product requirements document'],
    assumptions: [LOCAL_E2E_ASSUMPTION],
  };
  const payload = {
    schemaVersion: 'axwise.scope.v2',
    objective: request,
    objectiveSourceSpans: [sourceSpan(request, request)],
    topicAnchors: [{ value: 'cat-food', sourceSpans: [sourceSpan(request, 'cat-food')] }],
    geography: ['Estonia'],
    evidenceRequirements,
    deliverables,
    personas,
    interviewRequirements,
    prdRequirements,
    limits,
    policies,
    assumptions: [LOCAL_E2E_ASSUMPTION],
    deliverableProfile: {
      schemaVersion: 'axwise.deliverable-profile.v1',
      artifactType: 'product_prd',
      domain: 'Estonia cat-food product planning',
      problem: 'Define a useful product without inventing market or launch authority.',
      desiredOutcome: 'A decision-ready, evidence-bounded product requirements document.',
      audiences: ['Product and launch team'],
      nonGoals: ['Authorizing launch without verified evidence'],
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
    acceptanceCriteria: [{
      id: `acc-${canonicalHash(criterionSemantic).slice(0, 16)}`,
      ...criterionSemantic,
    }],
    materialClarification: null,
    researchInputHash: canonicalHash(researchInput),
    authority: {
      canonicalInputHash: inputHash,
      seal: 'local-e2e-scope-authority-seal'.padEnd(64, 's'),
    },
  };
  return CompletionResultSchema.parse({
    resultType: 'scope_compiled',
    artifact: artifactFact({
      artifactId,
      kind: 'scope',
      contentType: 'application/json',
      payload,
      sourceArtifactIds: [],
    }),
    metrics: { latencyMs, provider: 'google', model: 'gemini-3.8-flash' },
  });
}

export function createResearchCompletion({
  input,
  artifactId,
  claimLedgerArtifactId,
  latencyMs = 24,
}) {
  if (input?.type !== 'ExecuteResearchV2') {
    throw new Error('research fixture requires the exact ExecuteResearchV2 input');
  }
  const payload = {
    schemaVersion: 'axwise.research.v2',
    acceptedScopeArtifactId: input.acceptedScope.artifactId,
    acceptedScopeHash: input.acceptedScope.artifactHash,
    researchInputHash: input.scope.researchInputHash,
    readiness: 'ready_with_gaps',
    findings: [
      {
        requirementId: 'market-statistics',
        status: 'missing',
        blocking: false,
        sourceArtifactIds: [],
        note: LOCAL_E2E_GAP,
      },
    ],
    boundedRepairPasses: 1,
    assumptions: [LOCAL_E2E_ASSUMPTION],
    gaps: [LOCAL_E2E_GAP],
    conflicts: [],
    claimLedgerArtifactId: claimLedgerArtifactId || randomUUID(),
    claimLedger: [],
    selectedClaims: [],
    sourceCatalogue: [],
  };
  return CompletionResultSchema.parse({
    resultType: 'research_completed',
    artifact: artifactFact({
      artifactId,
      kind: 'research',
      contentType: 'application/json',
      payload,
      sourceArtifactIds: [input.acceptedScope.artifactId],
    }),
    evidenceReadiness: 'ready_with_gaps',
    metrics: { latencyMs, provider: 'google', model: 'gemini-3.8-flash', searchCalls: 1 },
  });
}

export function createTaskCompletion({ input, artifactId, latencyMs = 16 }) {
  if (input?.type !== 'SynthesizeArtifactV1' || input.purpose !== 'execute_task') {
    throw new Error('task fixture requires the exact execute_task input');
  }
  const markdown = [
    `# ${input.task.title}`,
    '',
    input.task.taskKind === 'core_draft'
      ? 'A coherent bounded draft covering the complete accepted output contract.'
      : `A material ${input.task.lens.toLocaleLowerCase('en-US')} review packet.`,
    '',
    `Evidence readiness remains ${input.outputContract.evidenceReadiness}.`,
  ].join('\n');
  const payload = {
    schemaVersion: 'orqaly.task-result.v2',
    task: input.task,
    acceptedScope: input.acceptedScope,
    research: input.research,
    acceptedPlan: input.acceptedPlan,
    title: input.task.title,
    markdown,
    evidenceReadiness: input.outputContract.evidenceReadiness,
    sourceArtifacts: input.sourceArtifacts,
    requirementCoverage: input.task.acceptanceRequirementIds.map((requirementId) => ({
      requirementId,
      status: 'satisfied',
      note: 'Covered by this bounded task output.',
    })),
    sourceAppendix: [],
    executionReceipt: {
      agent: input.task.agent,
      toolIds: input.task.toolIds,
      budgetCents: input.task.budgetCents,
      dataBoundary: input.task.dataBoundary,
    },
    conclusions: [`Prepared ${input.task.title}.`],
    unknowns: input.outputContract.evidenceReadiness === 'ready_with_gaps'
      ? [LOCAL_E2E_GAP]
      : [],
  };
  return CompletionResultSchema.parse({
    resultType: 'task_completed',
    artifact: artifactFact({
      artifactId,
      kind: 'task_result',
      contentType: 'text/markdown',
      payload,
      sourceArtifactIds: input.sourceArtifacts.map((artifact) => artifact.artifactId),
    }),
    evidenceReadiness: input.outputContract.evidenceReadiness,
    metrics: { latencyMs, provider: 'google', model: 'gemini-3.8-flash' },
  });
}

export function createEvaluationCompletion({ input, artifactId, latencyMs = 10 }) {
  if (input?.type !== 'SynthesizeArtifactV1' || input.purpose !== 'evaluate_output') {
    throw new Error('evaluation fixture requires the exact evaluate_output input');
  }
  const payload = {
    schemaVersion: 'orqaly.evaluation.v1',
    taskArtifacts: input.taskArtifacts,
    sourceArtifacts: input.sourceArtifacts,
    evidenceReadiness: input.outputContract.evidenceReadiness,
    outputContractHash: canonicalHash(input.outputContract),
    repairPass: 0,
    outputContractSatisfied: false,
    promotedArtifact: null,
    unmetRequirementIds: [],
    unresolvedSourceMarkers: [],
    unsupportedPrecision: [],
    contradictions: [],
    staleTopicReferences: [],
    readinessViolations: [],
    substantiveContentDefects: [],
    practicalityDefects: [],
    repairRequired: true,
    repairInstructions: ['Consolidate the bounded task packets into one coherent final artifact.'],
    note: 'The task packets require the single authorized consolidation pass.',
  };
  return CompletionResultSchema.parse({
    resultType: 'evaluation_completed',
    artifact: artifactFact({
      artifactId,
      kind: 'evaluation',
      contentType: 'application/json',
      payload,
      sourceArtifactIds: input.sourceArtifacts.map((artifact) => artifact.artifactId),
    }),
    executionOutputContractSatisfied: false,
    directPromotionArtifact: null,
    metrics: { latencyMs, provider: 'google', model: 'gemini-3.8-flash' },
  });
}

export function createSynthesisCompletion({ input, artifactId, latencyMs = 18 }) {
  if (
    input?.type !== 'SynthesizeArtifactV1' ||
    !['final_synthesis', 'blocked_report'].includes(input.purpose)
  ) {
    throw new Error('synthesis fixture requires an exact terminal synthesis input');
  }
  const sourceArtifacts = [...input.sourceArtifacts];
  const blocked = input.purpose === 'blocked_report';
  const markdown = blocked
    ? [
        '# Evidence decision',
        '',
        'Decision: blocked / no-go because essential evidence is unresolved.',
        '',
        '## Remediation plan',
        '',
        'Verify the essential evidence before planning or execution.',
      ].join('\n')
    : [
        '# Product requirements document',
        '',
        'A synthetic Estonia cat-food PRD compiled from the accepted scope, research, and task output.',
        '',
        '## Evidence gaps and assumptions',
        '',
        `- ${LOCAL_E2E_GAP}`,
        `- ${LOCAL_E2E_ASSUMPTION}`,
        '',
        'This useful artifact does not claim launch readiness.',
        '',
      ].join('\n');
  const payload = {
    schemaVersion: 'axwise.final-markdown.v1',
    title: blocked
      ? 'Blocked evidence report'
      : 'Estonia Cat-Food Product Requirements Document',
    markdown,
    sourceArtifacts,
    sourceAppendix: [],
    candidateAttestation: null,
    evidenceReadiness: input.outputContract.evidenceReadiness,
    launchReady: false,
  };
  return CompletionResultSchema.parse({
    resultType: 'artifact_synthesized',
    artifact: artifactFact({
      artifactId,
      kind: 'final_markdown',
      contentType: 'text/markdown',
      payload,
      sourceArtifactIds: sourceArtifacts.map((artifact) => artifact.artifactId),
    }),
    evidenceReadiness: input.outputContract.evidenceReadiness,
    metrics: { latencyMs, provider: 'google', model: 'gemini-3.8-flash' },
  });
}

export function configuredModes(value) {
  if (value === undefined || value === '') return ['simple', 'advanced'];
  if (!['simple', 'advanced'].includes(value)) {
    throw new Error('WORKFLOW_V2_E2E_MODE must be simple or advanced');
  }
  return [value];
}

export function refOf(artifact) {
  return artifactRef(artifact);
}
