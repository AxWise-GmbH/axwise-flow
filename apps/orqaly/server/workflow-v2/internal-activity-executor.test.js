import { describe, expect, it } from 'vitest';
import { artifactContentHash, canonicalHash, sha256Hex } from '../../lib/workflow-v2/canonical.js';
import {
  CompletionResultSchema,
  PlanningResultSchema,
} from '../../shared/workflow-v2/contracts.js';
import {
  createInternalActivityExecutor,
  modelOwnedRequiredSections,
} from './internal-activity-executor.js';

const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

function acceptedRequirement(category, description, priority = 'P0', authority = 'owner') {
  const semantic = { category, description, priority, authority };
  return { id: `req-${canonicalHash(semantic).slice(0, 16)}`, ...semantic };
}

function acceptanceCriterion(requirements) {
  const semantic = {
    given: 'The accepted scope and immutable research are available.',
    when: 'The requested artifact is evaluated.',
    then: 'Every accepted requirement is visibly satisfied or explicitly marked as a gap.',
    supports: requirements.map((requirement) => requirement.id).sort(),
  };
  return { id: `acc-${canonicalHash(semantic).slice(0, 16)}`, ...semantic };
}

function immutableJson(artifactId, kind, payload, sourceArtifactIds = []) {
  const base = {
    artifactId,
    kind,
    contentType: 'application/json',
    payload,
    markdown: null,
    sourceArtifactIds: [...sourceArtifactIds].sort(),
  };
  return { ...base, artifactHash: artifactContentHash(base) };
}

function scope({
  content = false,
  software = false,
  artifactType = null,
  requiredSections = null,
  deliverables: requestedDeliverables = null,
  limits: requestedLimits = null,
  policies: requestedPolicies = null,
} = {}) {
  const request = content
    ? 'Write an evidence-grounded cat-food article for Estonia.'
    : software
      ? 'Create an Estonia cat-food software product requirements document.'
      : 'Create an Estonia cat-food product requirements document.';
  const span = {
    start: 0,
    end: request.length,
    text: request,
    sha256: sha256Hex(request),
    offsetUnit: 'utf16_code_units',
  };
  const evidenceRequirements = [{
    id: 'official-rules',
    claimType: 'legal_requirement',
    description: 'Verify applicable official rules.',
    criticality: 'blocking',
    evidenceRole: 'grounded_claim',
    verificationBasis: 'grounded_claims',
    appliesWhen: 'The artifact discusses market entry.',
    acceptedSourceTypes: ['government'],
    allowedSourceHosts: [],
  }];
  const deliverables = requestedDeliverables ?? [
    content ? 'Evidence-grounded article' : 'Product requirements document',
  ];
  const personas = [content ? 'Estonian cat-food reader' : 'Estonian cat owner'];
  const interviewRequirements = content ? [] : ['Interview five target buyers'];
  const prdRequirements = content ? [] : ['Define measurable acceptance criteria'];
  const limits = requestedLimits ?? ['No credentials'];
  const policies = requestedPolicies ?? ['Do not invent precision'];
  const requirements = [
    ...deliverables.map((value) => acceptedRequirement('deliverable', value)),
    ...evidenceRequirements.map((value) =>
      acceptedRequirement('evidence', value.description, 'P0', 'axwise_derived')
    ),
    ...interviewRequirements.map((value) => acceptedRequirement('interview', value)),
    ...limits.map((value) => acceptedRequirement('limit', value)),
    ...personas.map((value) => acceptedRequirement('persona', value)),
    ...policies.map((value) => acceptedRequirement('policy', value)),
    ...prdRequirements.map((value) => acceptedRequirement('prd', value)),
  ].sort((left, right) => left.id.localeCompare(right.id));
  return immutableJson(id(1), 'scope', {
    schemaVersion: 'axwise.scope.v2',
    objective: request,
    objectiveSourceSpans: [span],
    topicAnchors: [{ value: 'Estonia cat food', sourceSpans: [span] }],
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
      artifactType:
        artifactType || (content ? 'content_artifact' : software ? 'software_prd' : 'product_prd'),
      domain: 'Estonia cat food',
      problem: content
        ? 'Readers need an evidence-grounded explanation.'
        : 'Cat owners need a clearly bounded product solution.',
      desiredOutcome: content
        ? 'A useful evidence-grounded article.'
        : 'A decision-ready product requirements document.',
      audiences: personas,
      nonGoals: ['Do not authorize launch.'],
      requiredSections: requiredSections ?? deliverables,
    },
    requirements,
    acceptanceCriteria: [acceptanceCriterion(requirements)],
    materialClarification: null,
    researchInputHash: canonicalHash({ accepted: request }),
    authority: {
      canonicalInputHash: canonicalHash({ request }),
      seal: 'test-scope-authority-seal-0000000000000000',
    },
  });
}

function research(scopeArtifact, readiness = 'ready') {
  return immutableJson(id(2), 'research', {
    schemaVersion: 'axwise.research.v2',
    acceptedScopeArtifactId: scopeArtifact.artifactId,
    acceptedScopeHash: scopeArtifact.artifactHash,
    researchInputHash: scopeArtifact.payload.researchInputHash,
    readiness,
    findings: [{
      requirementId: 'official-rules',
      status: readiness === 'ready' ? 'verified' : 'missing',
      blocking: false,
      sourceArtifactIds: [],
      note: readiness === 'ready' ? 'Verified.' : 'Optional detail unavailable.',
    }],
    boundedRepairPasses: readiness === 'ready' ? 0 : 1,
    assumptions: [],
    gaps: readiness === 'ready' ? [] : ['Optional detail unavailable.'],
    conflicts: [],
    claimLedgerArtifactId: id(99),
    claimLedger: [],
    selectedClaims: [],
    sourceCatalogue: [],
  }, [scopeArtifact.artifactId]);
}

function agent(value, capabilities, qualityScoreMicros = 900_000) {
  return {
    id: id(value),
    name: `Tenant agent ${value}`,
    capabilities: [...capabilities].sort(),
    toolIds: [id(value + 2_000)],
    qualityScoreMicros,
    costPerRunCents: 20,
  };
}

function context(scopeArtifact, researchArtifact, agentCatalogue, operationId = id(50)) {
  return {
    operationId,
    stageKind: 'planning',
    inputPayload: {
      type: 'OrqalyPlanV2',
      acceptedScope: {
        artifactId: scopeArtifact.artifactId,
        artifactHash: scopeArtifact.artifactHash,
        kind: scopeArtifact.kind,
      },
      research: {
        artifactId: researchArtifact.artifactId,
        artifactHash: researchArtifact.artifactHash,
        kind: researchArtifact.kind,
      },
      agentCatalogue: [...agentCatalogue].sort((left, right) => left.id.localeCompare(right.id)),
    },
    artifacts: [scopeArtifact, researchArtifact],
  };
}

describe('workflow v2 internal planning and binding', () => {
  it('keeps deterministic source appendix rendering outside model-owned sections', () => {
    expect(modelOwnedRequiredSections(['Product brief', 'Sources/Source appendix'])).toEqual([
      'Product brief',
    ]);
    expect(modelOwnedRequiredSections(['Source appendix'])).toEqual(['Artifact']);
    expect(modelOwnedRequiredSections(['  Ärianalüüs  ', 'Product brief'])).toEqual([
      'Product brief',
      'Ärianalüüs',
    ]);
  });
  it('creates a stable coherent-core DAG with material specialist lenses and per-task agents', async () => {
    const acceptedScope = scope();
    const acceptedResearch = research(acceptedScope);
    const broad = agent(10, ['evidence_synthesis', 'prd', 'product_strategy', 'research']);
    const executor = createInternalActivityExecutor();
    const first = await executor.execute({
      context: context(acceptedScope, acceptedResearch, [broad], id(50)),
    });
    const second = await executor.execute({
      context: context(acceptedScope, acceptedResearch, [broad], id(51)),
    });
    const result = CompletionResultSchema.parse(first.result);
    const tasks = result.planning.tasks;

    expect(first.kind).toBe('completed');
    expect(tasks.map((task) => task.stageKey)).toEqual([
      'product-user-analysis', 'domain-evidence-analysis', 'core-draft',
    ]);
    expect(tasks.slice(0, 2).every((task) =>
      task.taskKind === 'specialist_analysis' &&
      task.producesFullContract === false &&
      task.dependsOnStageKeys.length === 0 &&
      task.agent.id === broad.id
    )).toBe(true);
    expect(tasks[2]).toMatchObject({
      taskKind: 'core_draft',
      producesFullContract: true,
      dependsOnStageKeys: ['domain-evidence-analysis', 'product-user-analysis'],
      requiredCapabilities: ['prd'],
      agent: broad,
    });
    expect(result.planning.workShape).toBe('product_prd');
    expect(result.planning.outputContract.requiredSections).toEqual([
      'Product requirements document',
    ]);
    expect(result.planning.outputContract.rubric).toContain(
      'Users, jobs, and pains are concrete.'
    );
    expect(result.planning.outputContract.launchReadyAllowed).toBe(false);
    expect(tasks.map((task) => task.stageId)).toEqual(
      second.result.planning.tasks.map((task) => task.stageId)
    );
    expect(result.planning).not.toHaveProperty('selectedAgent');
  });

  it('filters by required capabilities before ranking unrelated agents', async () => {
    const acceptedScope = scope();
    const acceptedResearch = research(acceptedScope);
    const unrelated = Array.from({ length: 150 }, (_, index) =>
      agent(100 + index, ['research'], 1_000_000 - index)
    );
    const matching = agent(900, ['evidence_synthesis', 'prd', 'product_strategy'], 100_000);
    const outcome = await createInternalActivityExecutor().execute({
      context: context(acceptedScope, acceptedResearch, [...unrelated, matching]),
    });
    expect(outcome.kind).toBe('completed');
    expect(outcome.result.planning.tasks.every((task) => task.agent.id === matching.id)).toBe(true);
  });

  it('uses accepted profile sections only while retaining PRD quality rubric checks', async () => {
    const tailoredSections = [
      'Acceptance criteria and validation',
      'Assumptions, constraints, and evidence gaps',
      'Evidence-backed market context',
      'Next decisions and actions',
      'Personas and user needs',
      'Prioritized product requirements',
      'Problem, scope, and non-goals',
      'Risks and mitigations',
      'Success metrics',
    ].sort();
    const acceptedScope = scope({
      requiredSections: [...tailoredSections, 'Sources'].sort(),
    });
    const acceptedResearch = research(acceptedScope);
    const broad = agent(10, ['evidence_synthesis', 'prd', 'product_strategy']);
    const outcome = await createInternalActivityExecutor().execute({
      context: context(acceptedScope, acceptedResearch, [broad]),
    });
    const contract = outcome.result.planning.outputContract;

    expect(contract.requiredSections).toEqual(tailoredSections);
    expect(contract.requiredSections).not.toContain('Users, jobs, and pains');
    expect(contract.rubric).toContain('Users, jobs, and pains are concrete.');
  });

  it('fails closed when any required role lacks a matching tenant agent', async () => {
    const acceptedScope = scope();
    const acceptedResearch = research(acceptedScope);
    const outcome = await createInternalActivityExecutor().execute({
      context: context(acceptedScope, acceptedResearch, [agent(10, ['research'])]),
    });
    expect(outcome).toEqual({
      kind: 'failed',
      retryable: false,
      errorClass: 'ORQALY_REQUIRED_AGENT_UNAVAILABLE',
    });
  });

  it('fails a contradictory reader-output contract without retrying', async () => {
    const acceptedScope = scope({
      content: true,
      deliverables: ['Create both a checklist and an email.'],
    });
    const acceptedResearch = research(acceptedScope);
    const outcome = await createInternalActivityExecutor().execute({
      context: context(
        acceptedScope,
        acceptedResearch,
        [agent(10, ['evidence_synthesis', 'product_strategy'])]
      ),
    });

    expect(outcome).toEqual({
      kind: 'failed',
      retryable: false,
      errorClass: 'ORQALY_AMBIGUOUS_READER_OUTPUT_CONSTRAINT',
    });
  });

  it('keeps parallel content analyses internal and one dependent core promotable', async () => {
    const acceptedScope = scope({ content: true });
    const acceptedResearch = research(acceptedScope, 'ready_with_gaps');
    const author = agent(10, ['evidence_synthesis', 'product_strategy']);
    const outcome = await createInternalActivityExecutor().execute({
      context: context(acceptedScope, acceptedResearch, [author]),
    });
    const tasks = outcome.result.planning.tasks;
    expect(tasks).toHaveLength(3);
    expect(tasks.slice(0, 2).every((task) =>
      task.taskKind === 'specialist_analysis' && task.dependsOnStageKeys.length === 0
    )).toBe(true);
    expect(tasks[2]).toMatchObject({
      taskKind: 'core_draft',
      producesFullContract: true,
      agent: author,
    });
    expect(tasks[2].acceptanceRequirementIds).toEqual(
      outcome.result.planning.outputContract.requirementIds
    );
    expect(outcome.result.planning.outputContract).toMatchObject({
      schemaVersion: 'orqaly.markdown-output-contract.v2',
      evidenceReadiness: 'ready_with_gaps',
      launchReadyAllowed: false,
      readerOutput: null,
    });
  });

  it('propagates owner reader constraints into the immutable plan hash', async () => {
    const acceptedScope = scope({
      content: true,
      deliverables: ['Create a concise 5-item checklist for cat-food buyers.'],
      limits: ['Use at most 300 words.'],
    });
    const acceptedResearch = research(acceptedScope);
    const author = agent(10, ['evidence_synthesis', 'product_strategy']);
    const outcome = await createInternalActivityExecutor().execute({
      context: context(acceptedScope, acceptedResearch, [author]),
    });
    const plan = outcome.result.planning;

    expect(plan.outputContract).toMatchObject({
      schemaVersion: 'orqaly.markdown-output-contract.v2',
      readerOutput: {
        schemaVersion: 'orqaly.reader-output.v1',
        readerFormat: { value: 'checklist' },
        wordLimit: { maximumWords: 300, basis: 'owner_explicit' },
        itemLimit: { exactItems: 5, itemKind: 'checklist_item' },
      },
    });
    const { planHash: _planHash, ...planCore } = plan;
    expect(plan.planHash).toBe(canonicalHash(planCore));

    const tampered = structuredClone(plan);
    tampered.outputContract.readerOutput.wordLimit.maximumWords = 301;
    expect(() => PlanningResultSchema.parse(tampered)).toThrow(/plan hash does not match plan/);

    const forgedProvenance = structuredClone(plan);
    forgedProvenance.outputContract.readerOutput.readerFormat.requirementId =
      acceptedScope.payload.requirements.find(
        (requirement) => requirement.authority === 'axwise_derived'
      ).id;
    const { planHash: _forgedHash, ...forgedCore } = forgedProvenance;
    forgedProvenance.planHash = canonicalHash(forgedCore);
    expect(() => PlanningResultSchema.parse(forgedProvenance)).toThrow(
      /reader-output provenance must reference an owner-authored/
    );
  });

  it('adds an independent architecture analysis only for software PRDs', async () => {
    const acceptedScope = scope({ software: true });
    const acceptedResearch = research(acceptedScope);
    const broad = agent(10, ['evidence_synthesis', 'prd', 'product_strategy']);
    const outcome = await createInternalActivityExecutor().execute({
      context: context(acceptedScope, acceptedResearch, [broad]),
    });
    expect(outcome.result.planning.workShape).toBe('software_prd');
    expect(outcome.result.planning.tasks.map((task) => task.stageKey)).toEqual([
      'product-user-analysis',
      'domain-evidence-analysis',
      'software-architecture-analysis',
      'core-draft',
    ]);
    expect(outcome.result.planning.tasks.at(-1).dependsOnStageKeys).toEqual([
      'domain-evidence-analysis',
      'product-user-analysis',
      'software-architecture-analysis',
    ]);
    expect(outcome.result.planning.outputContract.requiredSections).toEqual([
      'Product requirements document',
    ]);
    expect(outcome.result.planning.outputContract.rubric).toContain(
      'Technical boundaries, interfaces, data, security, reliability, and failure handling are explicit.'
    );
  });

  it('permits launch authority only for a ready launch-authorization artifact', async () => {
    const acceptedScope = scope({ artifactType: 'launch_authorization' });
    const acceptedResearch = research(acceptedScope);
    const broad = agent(10, ['evidence_synthesis', 'prd', 'product_strategy']);
    const outcome = await createInternalActivityExecutor().execute({
      context: context(acceptedScope, acceptedResearch, [broad]),
    });

    expect(outcome.result.planning.outputContract).toMatchObject({
      artifactType: 'launch_authorization',
      evidenceReadiness: 'ready',
      launchReadyAllowed: true,
    });
  });
});
