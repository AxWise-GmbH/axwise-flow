import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AxWiseOperationEnvelopeSchema,
  AxWiseCompletionResultSchema,
  AssistantTurnInputV2Schema,
  AssistantContextEnvelopeV1Schema,
  CompletionResultSchema,
  CompileScopeInputV3Schema,
  EvidenceAcquisitionPassV1Schema,
  EvidenceRequirementSchema,
  EvaluationResultV1Schema,
  ExecutionAgentContractV1Schema,
  ExecutionTaskSchema,
  FinalArtifactV1Schema,
  MarkdownOutputContractSchema,
  MarkdownOutputContractV1Schema,
  MarkdownOutputContractV2Schema,
  AttemptSnapshotSchema,
  PublicAttemptSnapshotSchema,
  PlanningResultSchema,
  ResearchArtifactPayloadV2Schema,
  ResearchResultV2Schema,
  ScopeArtifactV2Schema,
  SynthesizeArtifactInputV1Schema,
  TaskResultV2Schema,
  isCanonicalPublicHttpsUrl,
  executionTaskSemanticHash,
} from './contracts.js';
import {
  assertScopeSourceAuthority,
  canonicalHash,
  canonicalJson,
  sha256Hex,
} from '../../lib/workflow-v2/canonical.js';

const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const hash = (value) => String(value).repeat(64).slice(0, 64);
const request = 'Create an Estonia cat-food launch PRD.';
const compileScopeV3Envelope = JSON.parse(
  readFileSync('shared/workflow-v2/fixtures/compile_scope_envelope_v3.json', 'utf8')
);

function semanticId(prefix, value) {
  const { id: _id, ...semanticValue } = value;
  return `${prefix}-${canonicalHash(semanticValue).slice(0, 16)}`;
}

function acceptedRequirement(category, description, priority = 'P1', authority = 'owner') {
  const core = { category, description, priority, authority };
  return { id: semanticId('req', core), ...core };
}

function span(text) {
  const start = request.indexOf(text);
  return {
    start,
    end: start + text.length,
    text,
    sha256: sha256Hex(text),
    offsetUnit: 'utf16_code_units',
  };
}

function scope(overrides = {}) {
  const evidenceRequirements = overrides.evidenceRequirements ?? [
    {
      id: 'feed-safety-law',
      claimType: 'legal_requirement',
      description: 'Verify applicable feed safety rules.',
      criticality: 'blocking',
      evidenceRole: 'grounded_claim',
      verificationBasis: 'grounded_claims',
      appliesWhen: 'commercial pet-food launch in Estonia',
      acceptedSourceTypes: ['government'],
    },
    {
      id: 'market-statistic',
      claimType: 'market_statistic',
      description: 'Find a useful market-size statistic if available.',
      criticality: 'nonblocking',
      evidenceRole: 'grounded_claim',
      verificationBasis: 'grounded_claims',
      appliesWhen: 'reliable current data is available',
      acceptedSourceTypes: ['industry', 'official_statistics'],
    },
  ];
  const deliverables = overrides.deliverables ?? ['Product requirements document in Markdown'];
  const personas = overrides.personas ?? ['Estonian cat owner'];
  const interviewRequirements = overrides.interviewRequirements ?? [];
  const prdRequirements = overrides.prdRequirements ?? ['Label evidence gaps explicitly'];
  const limits = overrides.limits ?? ['No fabricated prices'];
  const policies = overrides.policies ?? ['Claim-level source binding'];
  const requirements =
    overrides.requirements ??
    [
      ...deliverables.map((description) => acceptedRequirement('deliverable', description, 'P0')),
      ...personas.map((description) => acceptedRequirement('persona', description)),
      ...interviewRequirements.map((description) => acceptedRequirement('interview', description)),
      ...prdRequirements.map((description) => acceptedRequirement('prd', description, 'P0')),
      ...limits.map((description) => acceptedRequirement('limit', description, 'P0')),
      ...policies.map((description) => acceptedRequirement('policy', description)),
      ...evidenceRequirements.map(({ description, criticality }) =>
        acceptedRequirement('evidence', description, criticality === 'blocking' ? 'P0' : 'P2')
      ),
    ].sort((left, right) => left.id.localeCompare(right.id));
  const criterionCore = {
    given: 'The accepted scope and bounded research evidence are available.',
    when: 'The product requirements document is evaluated.',
    then: 'Every accepted requirement is traceable to a concrete product decision.',
    supports: requirements.map((requirement) => requirement.id),
  };
  return {
    schemaVersion: 'axwise.scope.v2',
    objective: request,
    objectiveSourceSpans: [span(request)],
    topicAnchors: [{ value: 'cat-food', sourceSpans: [span('cat-food')] }],
    geography: ['Estonia'],
    evidenceRequirements,
    deliverables,
    personas,
    interviewRequirements,
    prdRequirements,
    limits,
    policies,
    assumptions: [],
    deliverableProfile: overrides.deliverableProfile ?? {
      schemaVersion: 'axwise.deliverable-profile.v1',
      artifactType: 'launch_authorization',
      domain: 'Commercial cat-food launch in Estonia',
      problem: 'Define an evidence-bounded cat-food product for Estonian cat owners.',
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
    acceptanceCriteria: overrides.acceptanceCriteria ?? [
      { id: semanticId('acc', criterionCore), ...criterionCore },
    ],
    materialClarification: null,
    researchInputHash: hash('a'),
    authority: { canonicalInputHash: hash('b'), seal: 's'.repeat(64) },
    ...overrides,
  };
}

const artifactRef = {
  artifactId: id(20),
  artifactHash: hash('c'),
  kind: 'scope',
};

describe('workflow v2 contracts', () => {
  it('keeps V1 assistant input bytes stable while adding generation-only V2 image presentations', () => {
    const v1 = {
      type: 'AssistantTurnV1',
      responseMode: 'one_shot',
      message: 'Compare two bounded options.',
      conversation: [{ role: 'user', content: 'I care most about reliability.' }],
    };
    expect(canonicalHash(v1)).toBe(
      '3befecdade2f3b709368595b6062b3dad9259c5ab2e90aba6f3072773090dbd3'
    );

    const data = 'iVBORw0KGgpmaXh0dXJl';
    const input = AssistantTurnInputV2Schema.parse({
      type: 'AssistantTurnV2',
      responseMode: 'direct_answer',
      message: 'Generate this image.',
      conversation: [],
      capability: {
        kind: 'image_generate',
        aspectRatio: '16:9',
        imageSize: '1K',
      },
    });
    const envelope = {
      operationId: id(931),
      operationType: 'AssistantTurnV2',
      owner: { tenantId: id(932), organizationId: null, userId: 'user_assistantcontract123' },
      workflow: { runId: id(933), stageId: id(934), stageAttemptId: id(935) },
      contractVersion: 'axwise.operation.v2',
      canonicalInputHash: canonicalHash(input),
      input,
    };
    expect(AxWiseOperationEnvelopeSchema.parse(envelope)).toEqual(envelope);

    const completed = {
      resultType: 'assistant_turn_completed',
      response: {
        schemaVersion: 'axwise.assistant-turn.v2',
        markdown: 'Here is the generated image.',
        sources: [],
        facts: [],
        recommendations: [],
        presentations: [{
          schemaVersion: 'axwise.presentation.generated-image.v1',
          kind: 'generated_image',
          mimeType: 'image/png',
          data,
          sha256: 'bd54b02fae14b6b9ed73887ded339b8ef846fbcba0d4e5f9d95470ac23ade242',
          alt: 'A generated image',
          model: 'gemini-3.1-flash-image',
        }],
      },
    };
    expect(AxWiseCompletionResultSchema.parse(completed)).toEqual(completed);
    expect(() => AxWiseCompletionResultSchema.parse({
      ...completed,
      response: {
        ...completed.response,
        presentations: [{ ...completed.response.presentations[0], sha256: '0'.repeat(64) }],
      },
    })).toThrow(/sha256/);
    expect(() => AssistantTurnInputV2Schema.parse({
      ...input,
      capability: {
        kind: 'image_edit',
        imageSize: '1K',
        media: [{ mimeType: 'image/png', data }],
      },
    })).toThrow();
  });

  it('keeps attempt lease credentials out of the public snapshot contract', () => {
    const inputPayload = {
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
    const attempt = {
      id: id(1),
      stageId: id(2),
      attemptNumber: 1,
      status: 'running',
      operationId: id(3),
      inputHash: canonicalHash(inputPayload),
      inputPayload,
      rowVersion: 2,
      leaseToken: id(4),
      leaseExpiresAt: '2026-08-27T12:05:00.000Z',
    };

    expect(AttemptSnapshotSchema.parse(attempt).leaseToken).toBe(id(4));
    const publicAttempt = PublicAttemptSnapshotSchema.parse(attempt);
    expect(publicAttempt).not.toHaveProperty('leaseToken');
    expect(publicAttempt.leaseExpiresAt).toBe(attempt.leaseExpiresAt);
  });

  it('parses the byte-shared AxWise terminal scope fixture', () => {
    const fixture = JSON.parse(
      readFileSync('shared/workflow-v2/fixtures/scope_completion_result_v2.json', 'utf8')
    );
    expect(CompletionResultSchema.parse(fixture)).toEqual(fixture);
  });

  it('accepts independently reported model and model-version completion provenance', () => {
    const fixture = JSON.parse(
      readFileSync('shared/workflow-v2/fixtures/scope_completion_result_v2.json', 'utf8')
    );
    fixture.metrics = {
      latencyMs: 42,
      provider: 'google',
      model: 'models/gemini-3.8-flash',
      modelVersion: 'gemini-3.8-flash',
    };

    expect(CompletionResultSchema.parse(fixture).metrics).toEqual(fixture.metrics);
  });

  it('parses the byte-shared four-purpose synthesis inputs and terminal results', () => {
    const fixture = JSON.parse(
      readFileSync('shared/workflow-v2/fixtures/synthesize-artifact-v1-golden.json', 'utf8')
    );
    expect(fixture.cases.map((golden) => golden.name)).toEqual([
      'execute_task',
      'evaluate_output_repair',
      'evaluate_output_direct_promotion',
      'final_synthesis',
      'blocked_report',
    ]);
    for (const golden of fixture.cases) {
      expect(SynthesizeArtifactInputV1Schema.parse(golden.input)).toEqual(golden.input);
      expect(CompletionResultSchema.parse(golden.result)).toEqual(golden.result);
      expect(canonicalHash(golden.input)).toBe(golden.canonicalInputHash);
      expect(golden.input.purpose).toBe(golden.purpose);
    }
    expect(
      fixture.cases.find((golden) => golden.name === 'evaluate_output_repair').result
        .directPromotionArtifact
    ).toBeNull();
    expect(
      fixture.cases.find((golden) => golden.name === 'evaluate_output_direct_promotion').result
        .directPromotionArtifact.kind
    ).toBe('final_markdown');
  });

  it('rejects golden-result lineage/readiness drift and omitted nullable promotion facts', () => {
    const fixture = JSON.parse(
      readFileSync('shared/workflow-v2/fixtures/synthesize-artifact-v1-golden.json', 'utf8')
    );
    const task = structuredClone(
      fixture.cases.find((golden) => golden.name === 'execute_task').result
    );
    task.evidenceReadiness = 'ready_with_gaps';
    expect(() => CompletionResultSchema.parse(task)).toThrow(/task completion readiness/);

    const evaluation = structuredClone(
      fixture.cases.find((golden) => golden.name === 'evaluate_output_repair').result
    );
    delete evaluation.directPromotionArtifact;
    expect(() => CompletionResultSchema.parse(evaluation)).toThrow();
    evaluation.directPromotionArtifact = null;
    evaluation.artifact.payload.sourceArtifacts =
      evaluation.artifact.payload.sourceArtifacts.slice(1);
    expect(() => CompletionResultSchema.parse(evaluation)).toThrow(
      /evaluation lineage|artifact hash/
    );

    const finalInput = structuredClone(
      fixture.cases.find((golden) => golden.name === 'final_synthesis').input
    );
    finalInput.taskArtifacts.push(finalInput.taskArtifacts[0]);
    expect(() => SynthesizeArtifactInputV1Schema.parse(finalInput)).toThrow(
      /task artifacts must be sorted unique/
    );
  });

  it('requires selected immutable evidence claims to be sorted and unique', () => {
    const fixture = JSON.parse(
      readFileSync('shared/workflow-v2/fixtures/synthesize-artifact-v1-golden.json', 'utf8')
    );
    const research = structuredClone(
      fixture.cases[0].input.artifactContents.find(
        (content) => content.artifact.kind === 'research'
      ).payload
    );
    const text = 'Estonian feed rules apply to this product.';
    const canonicalUrl = 'https://example.com/feed-rules';
    const claim = {
      claimId: canonicalHash({
        text,
        sourceTypes: ['government'],
        sourceUrls: [canonicalUrl],
      }),
      text,
      textSha256: sha256Hex(text),
      sourceUrls: [canonicalUrl],
      sourceTypes: ['government'],
      providerResponseHash: null,
      segmentStart: null,
      segmentEnd: null,
      offsetUnit: null,
    };
    const sourceCore = {
      sourceTitle: 'Estonian feed rules',
      canonicalUrl,
      sourceClasses: ['government'],
      retrievalDate: '2026-08-28T08:00:00Z',
    };
    research.selectedClaims = [claim, claim];
    research.sourceCatalogue = [
      {
        sourceId: canonicalHash(sourceCore),
        ...sourceCore,
        supportedClaimIds: [claim.claimId],
      },
    ];

    expect(() => ResearchArtifactPayloadV2Schema.parse(research)).toThrow(
      /selected claims must be sorted by unique immutable claim ID/
    );
  });

  it('binds every acquired claim to one exact provider span and claim-ledger finding', () => {
    const providerResponseText = 'Feed law verified.';
    const providerResponseHash = sha256Hex(providerResponseText);
    const canonicalUrl = 'https://example.com/feed-law';
    const claim = {
      claimId: canonicalHash({
        text: providerResponseText,
        sourceTypes: ['government'],
        sourceUrls: [canonicalUrl],
      }),
      text: providerResponseText,
      textSha256: providerResponseHash,
      sourceUrls: [canonicalUrl],
      sourceTypes: ['government'],
      providerResponseHash,
      segmentStart: 0,
      segmentEnd: new TextEncoder().encode(providerResponseText).length,
      offsetUnit: 'utf8_bytes',
    };
    const acquisitionPass = {
      requirementId: 'feed-law',
      passNumber: 0,
      queryHash: hash('f'),
      providerResponseHash,
      providerResponseText,
      claims: [claim],
      sourceTypesSeen: ['government'],
    };
    expect(EvidenceAcquisitionPassV1Schema.parse(acquisitionPass).claims).toHaveLength(1);
    expect(() =>
      EvidenceAcquisitionPassV1Schema.parse({
        ...acquisitionPass,
        claims: [claim, claim],
      })
    ).toThrow(/unique immutable claim IDs/);
    expect(() =>
      EvidenceAcquisitionPassV1Schema.parse({
        ...acquisitionPass,
        claims: [
          {
            ...claim,
            providerResponseHash: null,
            segmentStart: null,
            segmentEnd: null,
            offsetUnit: null,
          },
        ],
      })
    ).toThrow(/exact UTF-8 span/);

    const fixture = JSON.parse(
      readFileSync('shared/workflow-v2/fixtures/synthesize-artifact-v1-golden.json', 'utf8')
    );
    const research = structuredClone(
      fixture.cases[0].input.artifactContents.find(
        (content) => content.artifact.kind === 'research'
      ).payload
    );
    const sourceCore = {
      sourceTitle: 'Feed law',
      canonicalUrl,
      sourceClasses: ['government'],
      retrievalDate: '2026-08-28T08:00:00Z',
    };
    research.claimLedger = [acquisitionPass];
    research.sourceCatalogue = [
      {
        sourceId: canonicalHash(sourceCore),
        ...sourceCore,
        supportedClaimIds: [claim.claimId],
      },
    ];
    expect(() => ResearchArtifactPayloadV2Schema.parse(research)).toThrow(
      /must cite the immutable claim-ledger artifact/
    );
    research.findings[0].sourceArtifactIds = [research.claimLedgerArtifactId];
    expect(ResearchArtifactPayloadV2Schema.parse(research).claimLedger).toHaveLength(1);
    research.claimLedger.push(structuredClone(acquisitionPass));
    expect(() => ResearchArtifactPayloadV2Schema.parse(research)).toThrow(
      /unique requirement\/pass identities/
    );

    const duplicateFinding = structuredClone(research);
    duplicateFinding.claimLedger = [acquisitionPass];
    duplicateFinding.findings.push(structuredClone(duplicateFinding.findings[0]));
    expect(() => ResearchArtifactPayloadV2Schema.parse(duplicateFinding)).toThrow(
      /findings must have unique requirement IDs/
    );
  });

  it('derives research readiness, gaps, and conflicts exactly from findings', () => {
    const fixture = JSON.parse(
      readFileSync('shared/workflow-v2/fixtures/synthesize-artifact-v1-golden.json', 'utf8')
    );
    const researchPayload = (caseName) =>
      structuredClone(
        fixture.cases
          .find((entry) => entry.name === caseName)
          .input.artifactContents.find((content) => content.artifact.kind === 'research').payload
      );
    expect(ResearchArtifactPayloadV2Schema.parse(researchPayload('execute_task')).readiness).toBe(
      'ready'
    );
    expect(ResearchArtifactPayloadV2Schema.parse(researchPayload('blocked_report')).gaps).toEqual(
      []
    );

    const gapped = researchPayload('execute_task');
    gapped.findings.push({
      requirementId: 'market-statistic',
      status: 'conflicting',
      blocking: false,
      sourceArtifactIds: [],
      note: 'Two current market estimates conflict.',
    });
    gapped.readiness = 'blocked';
    gapped.gaps = [];
    gapped.conflicts = ['Two current market estimates conflict.'];
    expect(ResearchArtifactPayloadV2Schema.parse(gapped).readiness).toBe('blocked');
    gapped.gaps = ['Two current market estimates conflict.'];
    expect(() => ResearchArtifactPayloadV2Schema.parse(gapped)).toThrow(
      /gaps and conflicts must exactly project|research gaps and conflicts/
    );
  });

  it('rejects duplicate task identities and cyclic immutable plan DAGs', () => {
    const fixture = JSON.parse(
      readFileSync('shared/workflow-v2/fixtures/synthesize-artifact-v1-golden.json', 'utf8')
    );
    const plan = structuredClone(
      fixture.cases[0].input.artifactContents.find((content) => content.artifact.kind === 'plan')
        .payload
    );
    expect(PlanningResultSchema.parse(plan).tasks).toHaveLength(3);

    const duplicate = structuredClone(plan);
    duplicate.tasks[1].stageId = duplicate.tasks[0].stageId;
    duplicate.tasks[1].inputHash = executionTaskSemanticHash(duplicate.tasks[1]);
    duplicate.planHash = canonicalHash((({ planHash: _hash, ...value }) => value)(duplicate));
    expect(() => PlanningResultSchema.parse(duplicate)).toThrow(/unique stable stage IDs/);

    const cycle = structuredClone(plan);
    cycle.tasks[1].dependsOnStageKeys = [cycle.tasks[0].stageKey];
    cycle.tasks[1].inputHash = executionTaskSemanticHash(cycle.tasks[1]);
    cycle.planHash = canonicalHash((({ planHash: _hash, ...value }) => value)(cycle));
    expect(() => PlanningResultSchema.parse(cycle)).toThrow(
      /parallel specialist roots|must be acyclic/
    );

    const self = structuredClone(plan);
    self.tasks[1].dependsOnStageKeys = [self.tasks[1].stageKey];
    self.tasks[1].inputHash = executionTaskSemanticHash(self.tasks[1]);
    self.planHash = canonicalHash((({ planHash: _hash, ...value }) => value)(self));
    expect(() => PlanningResultSchema.parse(self)).toThrow(/non-self dependency/);
  });

  it('derives evaluation satisfaction, promotion, and bounded repair facts exactly', () => {
    const fixture = JSON.parse(
      readFileSync('shared/workflow-v2/fixtures/synthesize-artifact-v1-golden.json', 'utf8')
    );
    const direct = structuredClone(
      fixture.cases.find((entry) => entry.name === 'evaluate_output_direct_promotion').result
        .artifact.payload
    );
    expect(EvaluationResultV1Schema.parse(direct).outputContractSatisfied).toBe(true);

    const forgedRepair = structuredClone(direct);
    forgedRepair.outputContractSatisfied = false;
    forgedRepair.promotedArtifact = null;
    forgedRepair.repairRequired = true;
    forgedRepair.repairInstructions = ['Consolidate the already-complete artifact.'];
    expect(() => EvaluationResultV1Schema.parse(forgedRepair)).toThrow(
      /requires one final candidate among all task artifacts and no defects/
    );

    const duplicated = structuredClone(direct);
    duplicated.taskArtifacts.push(duplicated.taskArtifacts[0]);
    expect(() => EvaluationResultV1Schema.parse(duplicated)).toThrow(
      /task artifacts must be sorted and unique/
    );
  });

  it('canonicalizes object keys deterministically for immutable input hashing', () => {
    expect(canonicalJson({ z: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"z":1}');
    expect(canonicalHash({ z: 1, a: 2 })).toBe(canonicalHash({ a: 2, z: 1 }));
  });

  it('uses UTF-16 ordinal ordering for non-ASCII output-contract sections', () => {
    const requirementCore = {
      category: 'deliverable',
      description: 'Produce the requested artifact.',
      priority: 'P0',
      authority: 'owner',
    };
    const requirementId = semanticId('req', requirementCore);
    const criterionCore = {
      given: 'The accepted request is available.',
      when: 'The artifact is evaluated.',
      then: 'The requested artifact is complete.',
      supports: [requirementId],
    };
    const contract = {
      format: 'text/markdown',
      artifactType: 'launch_authorization',
      requiredSections: ['Zeta', 'Ärianalüüs'],
      requirementIds: [requirementId],
      rubric: ['Complete and traceable.'],
      acceptanceCriteria: [{ id: semanticId('acc', criterionCore), ...criterionCore }],
      evidenceReadiness: 'ready',
      launchReadyAllowed: true,
      sourceAppendixRequired: false,
    };
    expect(MarkdownOutputContractSchema.parse(contract)).toEqual(contract);
    expect(MarkdownOutputContractV1Schema.parse(contract)).not.toHaveProperty('schemaVersion');
    expect(() =>
      MarkdownOutputContractSchema.parse({
        ...contract,
        requiredSections: [...contract.requiredSections].reverse(),
      })
    ).toThrow(/sorted and unique/);

    const readerContract = {
      schemaVersion: 'orqaly.markdown-output-contract.v2',
      ...contract,
      artifactType: 'content_artifact',
      launchReadyAllowed: false,
      readerOutput: {
        schemaVersion: 'orqaly.reader-output.v1',
        readerFormat: { value: 'checklist', requirementId },
        wordLimit: {
          maximumWords: 250,
          basis: 'bounded_content_default_v1',
          requirementId,
        },
        itemLimit: { exactItems: 5, itemKind: 'checklist_item', requirementId },
        measurement: {
          scope: 'reader_markdown_before_server_disclosures',
          wordCounter: 'unicode_words_v1',
          itemCounter: 'top_level_markdown_items_v1',
        },
      },
    };
    expect(MarkdownOutputContractSchema.parse(readerContract)).toEqual(readerContract);
    expect(MarkdownOutputContractV2Schema.parse(readerContract)).toEqual(readerContract);

    const invalidDefault = structuredClone(readerContract);
    invalidDefault.readerOutput.wordLimit.maximumWords = 251;
    expect(() => MarkdownOutputContractV2Schema.parse(invalidDefault)).toThrow(
      /bounded content default v1 is exactly 250 reader words/
    );
  });

  it('recomputes complete ExecutionTask semantics wherever a standalone task is accepted', () => {
    const requirementId = acceptedRequirement(
      'deliverable',
      'Product requirements document',
      'P0'
    ).id;
    const agent = {
      id: id(41),
      name: 'Preview Product Researcher',
      capabilities: ['prd'],
      toolIds: [id(42)],
      qualityScoreMicros: 950000,
      costPerRunCents: 125,
    };
    const taskCore = {
      stageId: id(40),
      stageKey: 'core-product-requirements',
      title: 'Product requirements document',
      taskKind: 'core_draft',
      requiredRole: 'Product requirements lead',
      lens: 'Coherent full-contract product draft',
      requiredCapabilities: ['prd'],
      acceptanceRequirementIds: [requirementId],
      producesFullContract: true,
      dependsOnStageKeys: [],
      agent,
      agentId: agent.id,
      toolIds: [id(42)],
      budgetCents: 125,
      dataBoundary: ['No payment data'],
    };
    const task = { ...taskCore, inputHash: executionTaskSemanticHash(taskCore) };
    expect(ExecutionTaskSchema.parse(task)).toEqual(task);
    for (const patch of [
      { agentId: id(46) },
      { toolIds: [id(47)] },
      { budgetCents: 126 },
      { dataBoundary: ['Credentials allowed'] },
      { dataBoundary: ['No payment data', 'No payment data'] },
    ]) {
      expect(() => ExecutionTaskSchema.parse({ ...task, ...patch })).toThrow();
    }
  });

  it('binds an immutable first-class Agent profile while preserving legacy Agent runs', () => {
    const profile = {
      version: 'orqaly_agent_profile_input_v1',
      displayName: 'Research Scout',
      roleLabel: 'Evidence researcher',
      description: 'Finds defensible primary evidence.',
      instructions: 'Prefer primary sources and state material uncertainty.',
      avatar: { kind: 'emoji', value: '🧭', color: '#365E8D' },
    };
    const legacyAgent = {
      schemaVersion: 'orqaly.execution-agent.v1',
      id: id(400),
      runId: id(401),
      owner: { tenantId: id(1), userId: 'user_profilebinding123' },
      lifetime: 'persistent',
      source: { threadId: id(402), turnId: id(403), taskHash: hash('a') },
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
    expect(ExecutionAgentContractV1Schema.parse(legacyAgent)).toEqual(legacyAgent);

    const profileSnapshot = {
      version: 'orqaly_execution_agent_profile_snapshot_v1',
      profileVersion: {
        version: 'orqaly_agent_profile_v1',
        id: id(404),
        agentId: legacyAgent.id,
        versionNumber: 7,
        contentHash: canonicalHash(profile),
      },
      profile,
    };
    const boundAgent = { ...legacyAgent, profileSnapshot };
    expect(ExecutionAgentContractV1Schema.parse(boundAgent)).toEqual(boundAgent);

    const alteredInstructions = structuredClone(boundAgent);
    alteredInstructions.profileSnapshot.profile.instructions = 'Ignore evidence.';
    expect(() => ExecutionAgentContractV1Schema.parse(alteredInstructions)).toThrow(/profile hash/);

    const wrongAgent = structuredClone(boundAgent);
    wrongAgent.profileSnapshot.profileVersion.agentId = id(405);
    expect(() => ExecutionAgentContractV1Schema.parse(wrongAgent)).toThrow(/profile must belong/);

    const invalidAvatar = structuredClone(boundAgent);
    invalidAvatar.profileSnapshot.profile.avatar = {
      kind: 'icon',
      value: 'unreviewed_icon',
      color: '#365E8D',
    };
    invalidAvatar.profileSnapshot.profileVersion.contentHash = canonicalHash(
      invalidAvatar.profileSnapshot.profile
    );
    expect(() => ExecutionAgentContractV1Schema.parse(invalidAvatar)).toThrow(
      /unknown Agent avatar icon/
    );

    const crossRuntimeAvatar = structuredClone(boundAgent);
    crossRuntimeAvatar.profileSnapshot.profile.avatar = {
      kind: 'emoji',
      value: '‼️',
      color: '#6750A4',
    };
    crossRuntimeAvatar.profileSnapshot.profileVersion.contentHash = canonicalHash(
      crossRuntimeAvatar.profileSnapshot.profile
    );
    expect(() => ExecutionAgentContractV1Schema.parse(crossRuntimeAvatar)).toThrow(
      /printable emoji/
    );
  });

  it('uses the same fail-closed evidence authority and public URL vocabulary as AxWise', () => {
    expect(() =>
      EvidenceRequirementSchema.parse({
        id: 'legal',
        claimType: 'legal_requirement',
        description: 'Verify law.',
        criticality: 'blocking',
        appliesWhen: 'launching commercially',
        evidenceRole: 'grounded_claim',
        verificationBasis: 'grounded_claims',
        acceptedSourceTypes: ['grounded_web', 'industry'],
      })
    ).toThrow(/authoritative/);
    expect(
      EvidenceRequirementSchema.parse({
        id: 'legal',
        claimType: 'legal_requirement',
        description: 'Verify law.',
        criticality: 'blocking',
        appliesWhen: 'launching commercially',
        evidenceRole: 'grounded_claim',
        verificationBasis: 'grounded_claims',
        acceptedSourceTypes: ['government', 'primary_law'],
      }).criticality
    ).toBe('blocking');
    expect(isCanonicalPublicHttpsUrl('https://example.com/path?q=1')).toBe(true);
    for (const rejected of [
      'HTTPs://example.com',
      'https://Example.com',
      'https://example.com:443/',
      'https://user@example.com/',
      'https://127.0.0.1/',
      'https://service.internal/',
      'https://example.com/#fragment',
    ]) {
      expect(isCanonicalPublicHttpsUrl(rejected), rejected).toBe(false);
    }
  });

  it('requires a typed evidence verification basis throughout scope artifacts', () => {
    const proofRequirement = {
      id: 'exact-product-proof',
      claimType: 'product_certificate',
      description: 'Verify an exact product certificate.',
      criticality: 'blocking',
      evidenceRole: 'selected_artifact_proof',
      appliesWhen: 'before launch',
      acceptedSourceTypes: ['government', 'standard'],
    };
    expect(() => EvidenceRequirementSchema.parse(proofRequirement)).toThrow(/verificationBasis/);
    expect(() =>
      EvidenceRequirementSchema.parse({
        ...proofRequirement,
        verificationBasis: 'grounded_claims',
      })
    ).toThrow(/evidenceRole/);

    const selectedEvidenceRequirement = {
      ...proofRequirement,
      verificationBasis: 'selected_evidence',
    };
    expect(EvidenceRequirementSchema.parse(selectedEvidenceRequirement).verificationBasis).toBe(
      'selected_evidence'
    );
    expect(
      ScopeArtifactV2Schema.parse(scope({ evidenceRequirements: [selectedEvidenceRequirement] }))
        .evidenceRequirements[0].verificationBasis
    ).toBe('selected_evidence');

    expect(
      EvidenceRequirementSchema.parse({
        ...selectedEvidenceRequirement,
        evidenceRole: 'future_authorization_proof',
      }).evidenceRole
    ).toBe('future_authorization_proof');
    expect(() =>
      EvidenceRequirementSchema.parse({
        ...selectedEvidenceRequirement,
        evidenceRole: 'grounded_claim',
      })
    ).toThrow(/evidenceRole/);
    expect(() =>
      EvidenceRequirementSchema.parse({
        ...scope().evidenceRequirements[0],
        verificationBasis: 'selected_evidence',
      })
    ).toThrow(/evidenceRole/);
  });

  it('requires unique evidence requirement IDs in accepted scope', () => {
    const accepted = scope();
    expect(() =>
      ScopeArtifactV2Schema.parse({
        ...accepted,
        evidenceRequirements: [
          ...accepted.evidenceRequirements,
          structuredClone(accepted.evidenceRequirements[0]),
        ],
      })
    ).toThrow(/evidence requirements must have unique requirement IDs/);
  });

  it('requires topic anchors to bind exact source offsets and hashes without fallback', () => {
    const accepted = ScopeArtifactV2Schema.parse(scope());
    expect(assertScopeSourceAuthority(request, accepted)).toBe(true);
    const shifted = scope({
      topicAnchors: [
        {
          value: 'cat-food',
          sourceSpans: [{ ...span('cat-food'), start: span('cat-food').start + 1 }],
        },
      ],
    });
    expect(() => assertScopeSourceAuthority(request, ScopeArtifactV2Schema.parse(shifted))).toThrow(
      /shifted/
    );
    expect(() => ScopeArtifactV2Schema.parse(scope({ topicAnchors: [] }))).toThrow();
  });

  it('rejects split scope authority even when duplicate legacy descriptions collapse semantically', () => {
    const accepted = scope();
    expect(() =>
      ScopeArtifactV2Schema.parse({
        ...accepted,
        deliverables: [...accepted.deliverables, accepted.deliverables[0]],
      })
    ).toThrow(/typed deliverable requirements must exactly project/);
  });

  it('keeps launch authority out of research results', () => {
    const result = {
      schemaVersion: 'axwise.research.v2',
      acceptedScopeArtifactId: artifactRef.artifactId,
      acceptedScopeHash: artifactRef.artifactHash,
      researchInputHash: hash('d'),
      readiness: 'ready_with_gaps',
      findings: [
        {
          requirementId: 'market-statistic',
          status: 'missing',
          blocking: false,
          sourceArtifactIds: [],
          note: 'No reliable current statistic found.',
        },
      ],
      boundedRepairPasses: 1,
      assumptions: [],
      gaps: ['No reliable current statistic found.'],
      conflicts: [],
      claimLedgerArtifactId: id(21),
    };
    expect(ResearchResultV2Schema.parse(result).readiness).toBe('ready_with_gaps');
    expect(() => ResearchResultV2Schema.parse({ ...result, launchReady: true })).toThrow(
      /Unrecognized key/
    );
  });

  it('forces unresolved blocking legal or safety evidence to blocked', () => {
    const result = {
      schemaVersion: 'axwise.research.v2',
      acceptedScopeArtifactId: artifactRef.artifactId,
      acceptedScopeHash: artifactRef.artifactHash,
      researchInputHash: hash('d'),
      readiness: 'ready_with_gaps',
      findings: [
        {
          requirementId: 'feed-safety-law',
          status: 'missing',
          blocking: true,
          sourceArtifactIds: [],
          note: 'Applicable safety rule is unresolved.',
        },
      ],
      boundedRepairPasses: 1,
      assumptions: [],
      gaps: [],
      conflicts: [],
      claimLedgerArtifactId: id(21),
    };
    expect(() => ResearchResultV2Schema.parse(result)).toThrow(/missing blocking evidence/);
    expect(ResearchResultV2Schema.parse({ ...result, readiness: 'blocked' }).readiness).toBe(
      'blocked'
    );
  });

  it('prevents final Markdown with evidence gaps from claiming launch-ready', () => {
    const final = {
      schemaVersion: 'axwise.final-markdown.v1',
      title: 'Estonia cat-food launch PRD',
      markdown: '# Product requirements\n\nEvidence gaps are labeled.',
      sourceArtifacts: [artifactRef],
      sourceAppendix: [],
      candidateAttestation: null,
      evidenceReadiness: 'ready_with_gaps',
      launchReady: true,
    };
    expect(() => FinalArtifactV1Schema.parse(final)).toThrow(/cannot claim launch-ready/);
    expect(FinalArtifactV1Schema.parse({ ...final, launchReady: false }).launchReady).toBe(false);
  });

  it('parses exact candidate gap coverage for contextual evaluation', () => {
    const fixture = JSON.parse(
      readFileSync('shared/workflow-v2/fixtures/synthesize-artifact-v1-golden.json', 'utf8')
    );
    const evaluationInput = fixture.cases.find(
      (golden) => golden.name === 'evaluate_output_direct_promotion'
    ).input;
    const candidate = structuredClone(
      evaluationInput.artifactContents.find((content) => content.artifact.kind === 'final_markdown')
        .payload
    );
    candidate.candidateAttestation.requirementCoverage[0].status = 'gap';

    expect(FinalArtifactV1Schema.parse(candidate)).toEqual(candidate);
  });

  it('requires immutable source artifact lineage to be sorted and unique in task and final results', () => {
    const fixture = JSON.parse(
      readFileSync('shared/workflow-v2/fixtures/synthesize-artifact-v1-golden.json', 'utf8')
    );
    const taskResult = structuredClone(
      fixture.cases.find((golden) => golden.name === 'execute_task').result.artifact.payload
    );
    expect(TaskResultV2Schema.parse(taskResult)).toEqual(taskResult);
    expect(() =>
      TaskResultV2Schema.parse({
        ...taskResult,
        sourceArtifacts: [...taskResult.sourceArtifacts].reverse(),
      })
    ).toThrow(/sourceArtifacts must be sorted and unique/);
    expect(() =>
      TaskResultV2Schema.parse({
        ...taskResult,
        sourceArtifacts: [...taskResult.sourceArtifacts, taskResult.sourceArtifacts[0]],
      })
    ).toThrow(/sourceArtifacts must be sorted and unique/);

    const finalResult = structuredClone(
      fixture.cases.find((golden) => golden.name === 'final_synthesis').result.artifact.payload
    );
    expect(FinalArtifactV1Schema.parse(finalResult)).toEqual(finalResult);
    expect(() =>
      FinalArtifactV1Schema.parse({
        ...finalResult,
        sourceArtifacts: [...finalResult.sourceArtifacts].reverse(),
      })
    ).toThrow(/sourceArtifacts must be sorted and unique/);
  });

  it('keeps Clerk subjects external while binding the internal tenant and workflow identity', () => {
    const input = {
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
    const envelope = {
      operationId: id(30),
      operationType: 'CompileScopeV2',
      owner: {
        tenantId: id(1),
        organizationId: 'org_axwise123',
        userId: 'user_owner123',
      },
      workflow: { runId: id(2), stageId: id(3), stageAttemptId: id(4) },
      contractVersion: 'axwise.operation.v2',
      canonicalInputHash: canonicalHash(input),
      input,
    };
    expect(AxWiseOperationEnvelopeSchema.parse(envelope).owner.userId).toBe('user_owner123');
    expect(() =>
      AxWiseOperationEnvelopeSchema.parse({ ...envelope, operationType: 'ExecuteResearchV2' })
    ).toThrow(/must match typed input/);
  });

  it('binds CompileScopeV3 authority, provenance, hashes, and spans to one canonical request', () => {
    const input = structuredClone(compileScopeV3Envelope.input);
    expect(CompileScopeInputV3Schema.parse(input)).toEqual(input);
    expect(AssistantContextEnvelopeV1Schema.parse(input.assistantContext)).toEqual(
      input.assistantContext
    );

    const changedRequest = structuredClone(input);
    changedRequest.request += ' changed';
    expect(() => CompileScopeInputV3Schema.parse(changedRequest)).toThrow(/canonical/);

    const forgedAuthority = structuredClone(input);
    forgedAuthority.assistantContext.turns[0].user.authority = 'assistant_reference';
    expect(() => CompileScopeInputV3Schema.parse(forgedAuthority)).toThrow();

    const forgedContentHash = structuredClone(input);
    forgedContentHash.assistantContext.turns[0].assistant.contentSha256 = '0'.repeat(64);
    expect(() => CompileScopeInputV3Schema.parse(forgedContentHash)).toThrow(/content hash/);

    const forgedEnvelopeHash = structuredClone(input.assistantContext);
    forgedEnvelopeHash.envelopeHash = '0'.repeat(64);
    expect(() => AssistantContextEnvelopeV1Schema.parse(forgedEnvelopeHash)).toThrow(
      /envelope hash/
    );

    const forgedTruncation = structuredClone(input.assistantContext);
    forgedTruncation.turns[0].assistant.truncated = true;
    forgedTruncation.truncatedMessageCount = 1;
    const { envelopeHash: _hash, ...forgedTruncationCore } = forgedTruncation;
    forgedTruncation.envelopeHash = canonicalHash(forgedTruncationCore);
    expect(() => AssistantContextEnvelopeV1Schema.parse(forgedTruncation)).toThrow(
      /canonical marker/
    );

    const overlappingTurn = structuredClone(input.assistantContext);
    overlappingTurn.currentTurnId = overlappingTurn.turns[0].assistant.turnId;
    const { envelopeHash: _overlapHash, ...overlappingTurnCore } = overlappingTurn;
    overlappingTurn.envelopeHash = canonicalHash(overlappingTurnCore);
    expect(() => AssistantContextEnvelopeV1Schema.parse(overlappingTurn)).toThrow(
      /turn identities must not overlap/
    );
  });
});
