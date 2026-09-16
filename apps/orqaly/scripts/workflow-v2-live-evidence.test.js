import { describe, expect, it } from 'vitest';
import {
  LIVE_EVIDENCE_QUERY,
  LiveEvidenceSchema,
  verifyLiveEvidenceRows,
} from './workflow-v2-live-evidence.mjs';
import { artifactContentHash, canonicalHash } from '../lib/workflow-v2/canonical.js';

const uuid = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const userId = 'user_previewowner';
const tenantId = uuid(1);
const capturedAt = new Date('2026-08-27T12:00:00.000Z');
const markerCommit = 'a'.repeat(40);
const prdSections = [
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
];

function acceptedRequirement(category, description, priority = 'P1') {
  const semantic = { category, description, priority, authority: 'owner' };
  return { id: `req-${canonicalHash(semantic).slice(0, 16)}`, ...semantic };
}

function acceptanceCriterion(requirements) {
  const semantic = {
    given: 'The accepted scope and bounded research evidence are available.',
    when: 'The product requirements document is evaluated.',
    then: 'Every accepted requirement is traceable to a concrete product decision.',
    supports: requirements.map((requirement) => requirement.id).sort(),
  };
  return { id: `acc-${canonicalHash(semantic).slice(0, 16)}`, ...semantic };
}

function artifact(number, kind, payload, markdown = null) {
  const contentType = markdown === null ? 'application/json' : 'text/markdown';
  return {
    id: uuid(number),
    kind,
    payload,
    markdown,
    contentType,
    hash: artifactContentHash({ contentType, payload, markdown }),
  };
}

function additiveMigrations() {
  return [
    {
      migrationNumber: 2,
      migrationPath: 'database/workflow-v2/migrations/002_assistant_goal.sql',
      migrationSha256: canonicalHash('orqaly additive 002'),
      sourceCommit: markerCommit,
    },
    {
      migrationNumber: 3,
      migrationPath: 'database/workflow-v2/migrations/003_personal_tenant_jit.sql',
      migrationSha256: canonicalHash('orqaly additive 003'),
      sourceCommit: markerCommit,
    },
    {
      migrationNumber: 4,
      migrationPath: 'database/workflow-v2/migrations/004_assistant_retry_lineage.sql',
      migrationSha256: canonicalHash('orqaly additive 004'),
      sourceCommit: markerCommit,
    },
    {
      migrationNumber: 5,
      migrationPath: 'database/workflow-v2/migrations/005_assistant_turn_events.sql',
      migrationSha256: canonicalHash('orqaly additive 005'),
      sourceCommit: markerCommit,
    },
    {
      migrationNumber: 6,
      migrationPath: 'database/workflow-v2/migrations/006_assistant_turn_provenance.sql',
      migrationSha256: canonicalHash('orqaly additive 006'),
      sourceCommit: markerCommit,
    },
    {
      migrationNumber: 7,
      migrationPath: 'database/workflow-v2/migrations/007_assistant_grounded_sources_reason.sql',
      migrationSha256: canonicalHash('orqaly additive 007'),
      sourceCommit: markerCommit,
    },
  ];
}

function scopePayload(mode, inputHash) {
  const objective = `Create a ${mode} Estonia cat-food launch PRD.`;
  const topic = 'cat-food';
  const start = objective.indexOf(topic);
  const span = {
    start,
    end: start + topic.length,
    text: topic,
    sha256: canonicalHash(topic),
    offsetUnit: 'utf16_code_units',
  };
  const objectiveSpan = {
    start: 0,
    end: objective.length,
    text: objective,
    sha256: canonicalHash(objective),
    offsetUnit: 'utf16_code_units',
  };
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
  const prdRequirements = ['Label evidence gaps'];
  const limits = ['No payment data'];
  const policies = ['Do not claim launch-ready with evidence gaps'];
  const requirements = [
    ...deliverables.map((description) => acceptedRequirement('deliverable', description, 'P0')),
    ...prdRequirements.map((description) => acceptedRequirement('prd', description, 'P0')),
    ...limits.map((description) => acceptedRequirement('limit', description, 'P0')),
    ...policies.map((description) => acceptedRequirement('policy', description)),
    ...evidenceRequirements.map(({ description }) =>
      acceptedRequirement('evidence', description, 'P2')
    ),
  ].sort((left, right) => left.id.localeCompare(right.id));
  return {
    schemaVersion: 'axwise.scope.v2',
    objective,
    objectiveSourceSpans: [objectiveSpan],
    topicAnchors: [{ value: topic, sourceSpans: [span] }],
    geography: ['Estonia'],
    evidenceRequirements,
    deliverables,
    personas: [],
    interviewRequirements: [],
    prdRequirements,
    limits,
    policies,
    assumptions: ['Synthetic Preview run'],
    deliverableProfile: {
      schemaVersion: 'axwise.deliverable-profile.v1',
      artifactType: 'product_prd',
      domain: 'Estonia cat-food product planning',
      problem: 'Define a useful product without inventing market or launch authority.',
      desiredOutcome: 'A decision-ready, evidence-bounded product requirements document.',
      audiences: ['Product and launch team'],
      nonGoals: ['Authorizing launch without verified evidence'],
      requiredSections: prdSections,
    },
    requirements,
    acceptanceCriteria: [acceptanceCriterion(requirements)],
    materialClarification: null,
    researchInputHash: canonicalHash({ objective, geography: ['Estonia'] }),
    authority: {
      canonicalInputHash: inputHash,
      seal: `${mode}-fixture-authority-seal`.padEnd(64, 's'),
    },
  };
}

function approvalRow({ mode, offset, kind, status = 'completed', readiness = 'ready' }) {
  const runId = uuid(offset);
  const producerKind = kind === 'scope' ? 'compile_scope' : 'planning';
  const gateKind = kind === 'scope' ? 'gate_1' : 'gate_2';
  const inputHash = canonicalHash({ producerKind, mode });
  const scope = artifact(
    offset + 10,
    'scope',
    scopePayload(mode, canonicalHash({ producerKind: 'compile_scope', mode }))
  );
  const research = artifact(offset + 41, 'research', {
    fixture: `${mode} immutable research`,
  });
  const researchRef = { artifactId: research.id, artifactHash: research.hash, kind: 'research' };
  const agent = {
    id: uuid(offset + 145),
    name: 'Preview Product Researcher',
    capabilities: ['evidence_synthesis', 'prd', 'product_strategy'],
    toolIds: [],
    qualityScoreMicros: 950000,
    costPerRunCents: 20,
  };
  const requirements = scope.payload.requirements;
  const requirementIds = requirements.map((requirement) => requirement.id);
  const makeTask = ({
    stageId,
    stageKey,
    title,
    taskKind,
    requiredRole,
    lens,
    requiredCapabilities,
    dependsOnStageKeys = [],
  }) => {
    const core = {
      stageId,
      stageKey,
      title,
      taskKind,
      requiredRole,
      lens,
      requiredCapabilities,
      acceptanceRequirementIds: requirementIds,
      producesFullContract: taskKind === 'core_draft',
      dependsOnStageKeys,
      agent,
      agentId: agent.id,
      toolIds: [],
      budgetCents: 20,
      dataBoundary: ['tenant-only'],
    };
    return { ...core, inputHash: canonicalHash(core) };
  };
  const productTask = makeTask({
    stageId: uuid(offset + 141),
    stageKey: `product-user-${mode}`,
    title: 'Product and user analysis',
    taskKind: 'specialist_analysis',
    requiredRole: 'Product strategy specialist',
    lens: 'Product thesis, users, jobs, pains, journeys, and prioritization.',
    requiredCapabilities: ['product_strategy'],
  });
  const evidenceTask = makeTask({
    stageId: uuid(offset + 142),
    stageKey: `domain-evidence-${mode}`,
    title: 'Domain and evidence analysis',
    taskKind: 'specialist_analysis',
    requiredRole: 'Domain evidence specialist',
    lens: 'Domain evidence, assumptions, gaps, metrics, risks, and validation.',
    requiredCapabilities: ['evidence_synthesis'],
  });
  const specialistKeys = [evidenceTask.stageKey, productTask.stageKey].sort();
  const task = makeTask({
    stageId: uuid(offset + 140),
    stageKey: `core-${mode}-prd`,
    title: 'Product requirements document',
    taskKind: 'core_draft',
    requiredRole: 'Product requirements lead',
    lens: 'Coherent full-contract product draft using every specialist result.',
    requiredCapabilities: ['prd'],
    dependsOnStageKeys: specialistKeys,
  });
  const outputContract = {
    format: 'text/markdown',
    artifactType: 'product_prd',
    requiredSections: prdSections,
    requirementIds,
    rubric: [
      'Evidence, assumptions, and gaps are distinguished.',
      'Metrics and validation steps make outcomes testable.',
      'Prioritization and non-goals bound the work.',
      'Problem, domain, and desired outcome are explicit.',
      'Requirements map to Given/When/Then acceptance criteria.',
      'Risks and next steps are actionable.',
      'Users, jobs, and pains are concrete.',
    ],
    acceptanceCriteria: scope.payload.acceptanceCriteria,
    evidenceReadiness: readiness,
    launchReadyAllowed: false,
    sourceAppendixRequired: false,
  };
  const planCore = {
    schemaVersion: 'orqaly.plan.v2',
    acceptedScopeArtifact: { artifactId: scope.id, artifactHash: scope.hash, kind: 'scope' },
    researchArtifact: researchRef,
    workShape: 'product_prd',
    requirements,
    outputContract,
    tasks: [productTask, evidenceTask, task],
  };
  const planPayload = { ...planCore, planHash: canonicalHash(planCore) };
  const plan = artifact(offset + 20, 'plan', planPayload);
  const planRef = { artifactId: plan.id, artifactHash: plan.hash, kind: 'plan' };
  const scopeRef = { artifactId: scope.id, artifactHash: scope.hash, kind: 'scope' };
  const specialistSources = [scopeRef, researchRef, planRef].sort((left, right) =>
    left.artifactId.localeCompare(right.artifactId)
  );
  const taskResult = (number, specialistTask) => {
    const markdown = `# ${specialistTask.title}\n\nBounded specialist analysis.`;
    return artifact(
      number,
      'task_result',
      {
        schemaVersion: 'orqaly.task-result.v2',
        task: specialistTask,
        acceptedScope: scopeRef,
        research: researchRef,
        acceptedPlan: planRef,
        title: specialistTask.title,
        markdown,
        evidenceReadiness: readiness,
        sourceArtifacts: specialistSources,
        requirementCoverage: requirementIds.map((requirementId) => ({
          requirementId,
          status: 'satisfied',
          note: 'Covered by the bounded specialist analysis.',
        })),
        sourceAppendix: [],
        executionReceipt: {
          agent,
          toolIds: [],
          budgetCents: 20,
          dataBoundary: ['tenant-only'],
        },
        conclusions: ['Prepared the bounded specialist analysis.'],
        unknowns: [],
      },
      markdown
    );
  };
  const productArtifact = taskResult(offset + 42, productTask);
  const domainArtifact = taskResult(offset + 43, evidenceTask);
  const productRef = {
    artifactId: productArtifact.id,
    artifactHash: productArtifact.hash,
    kind: 'task_result',
  };
  const domainRef = {
    artifactId: domainArtifact.id,
    artifactHash: domainArtifact.hash,
    kind: 'task_result',
  };
  const approved = kind === 'scope' ? scope : plan;
  const approvalPayload = approved.payload;
  const source = { artifactId: approved.id, artifactHash: approved.hash, kind };
  const finalSourceArtifacts = [scopeRef, planRef, researchRef, productRef, domainRef].sort(
    (left, right) => left.artifactId.localeCompare(right.artifactId)
  );
  const finalPayload = {
    schemaVersion: 'axwise.final-markdown.v1',
    title: `${mode} result`,
    markdown: `# ${mode} result`,
    sourceArtifacts: finalSourceArtifacts,
    sourceAppendix: [],
    candidateAttestation: {
      task,
      requirementCoverage: requirementIds.map((requirementId) => ({
        requirementId,
        status: 'satisfied',
        note: 'The full contract is covered by the coherent core draft.',
      })),
      executionReceipt: {
        agent,
        toolIds: [],
        budgetCents: 20,
        dataBoundary: ['tenant-only'],
      },
    },
    evidenceReadiness: readiness,
    launchReady: false,
  };
  const final = artifact(offset + 30, 'final_markdown', finalPayload, finalPayload.markdown);
  const evidenceArtifact = artifact(offset + 40, 'evidence', { source: `${mode} evidence` });
  const selectedEvidence =
    kind === 'scope'
      ? [{ artifactId: evidenceArtifact.id, artifactHash: evidenceArtifact.hash, kind: 'evidence' }]
      : [];
  const approvalId = uuid(offset + (kind === 'scope' ? 50 : 60));
  const stageId = uuid(offset + (kind === 'scope' ? 70 : 80));
  const event = {
    type: 'ApprovalGranted',
    eventId: uuid(offset + (kind === 'scope' ? 90 : 100)),
    tenantId,
    runId,
    occurredAt: '2026-08-27T11:59:00.000Z',
    approvalId,
    approvalKind: kind,
    stageId,
    artifact: source,
    inputHash,
    selectedEvidence,
    idempotencyKey: `${mode}-${kind}-approval`,
    decisionHash: canonicalHash({
      approvalKind: kind,
      artifact: source,
      inputHash,
      selectedEvidence,
    }),
    decidedBy: userId,
    nextAttempts: [],
  };
  const artifactsById = new Map([
    [scope.id, scope],
    [research.id, research],
    [plan.id, plan],
    [productArtifact.id, productArtifact],
    [domainArtifact.id, domainArtifact],
  ]);
  const artifactContents = (references) =>
    references.map((reference) => {
      const resolved = artifactsById.get(reference.artifactId);
      return {
        artifact: reference,
        contentType: resolved.contentType,
        payload: resolved.payload,
        markdown: resolved.markdown,
      };
    });
  const executeInput = (plannedTask, sources) => ({
    type: 'SynthesizeArtifactV1',
    purpose: 'execute_task',
    task: plannedTask,
    acceptedScope: scopeRef,
    research: researchRef,
    acceptedPlan: planRef,
    sourceArtifacts: sources,
    artifactContents: artifactContents(sources),
    outputContract,
    repairPass: 0,
  });
  const planConsumers = [
    { task: productTask, input: executeInput(productTask, specialistSources), attemptOffset: 161 },
    {
      task: evidenceTask,
      input: executeInput(evidenceTask, specialistSources),
      attemptOffset: 162,
    },
    { task, input: executeInput(task, finalSourceArtifacts), attemptOffset: 160 },
  ];
  const scopeConsumerInput = {
    type: 'ExecuteResearchV2',
    acceptedScope: { ...source },
    scope: approvalPayload,
    selectedEvidence: selectedEvidence.map((item) => ({ ...item })),
  };
  const consumerAttempts =
    kind === 'scope'
      ? [
          {
            stageId: uuid(offset + 130),
            stageKey: 'execute-research',
            stageStatus: 'completed',
            attemptId: uuid(offset + 150),
            attemptNumber: 1,
            inputHash: canonicalHash(scopeConsumerInput),
            inputPayload: scopeConsumerInput,
          },
        ]
      : planConsumers.map((consumer) => ({
          stageId: consumer.task.stageId,
          stageKey: consumer.task.stageKey,
          stageStatus: 'completed',
          attemptId: uuid(offset + consumer.attemptOffset),
          attemptNumber: 1,
          inputHash: canonicalHash(consumer.input),
          inputPayload: consumer.input,
        }));
  return {
    expected_mode: mode,
    tenant_id: tenantId,
    run_id: runId,
    owner_user_id: userId,
    owner_organization_id: null,
    mode,
    run_status: status,
    evidence_readiness: readiness,
    final_artifact_id: final.id,
    final_artifact_hash: final.hash,
    final_artifact_kind: final.kind,
    final_content_type: final.contentType,
    final_payload: final.payload,
    final_markdown: final.markdown,
    final_stage_id: uuid(offset + 140),
    final_attempt_id: uuid(offset + 160),
    final_producer_kind: 'execution',
    final_producer_status: 'completed',
    final_producer_output_artifact_id: final.id,
    final_sources: finalSourceArtifacts.map((reference) => ({
      reference,
      resolvedArtifactId: reference.artifactId,
      resolvedArtifactHash: reference.artifactHash,
      resolvedArtifactKind: reference.kind,
      resolvedTenantId: tenantId,
      resolvedRunId: runId,
    })),
    final_lineage_source_ids: finalSourceArtifacts.map((reference) => reference.artifactId).sort(),
    input_tokens: '120',
    output_tokens: '80',
    total_tokens: '200',
    search_calls: '1',
    estimated_cost_micros: '42',
    operation_count: 2,
    models: ['gemini-3.8-flash'],
    run_latency_ms: '1234',
    approval_id: approvalId,
    approval_kind: kind,
    approval_stage_id: stageId,
    approval_input_hash: inputHash,
    approval_artifact_hash: approved.hash,
    decision_hash: event.decisionHash,
    decision: 'approved',
    decided_by: userId,
    approval_artifact_id: approved.id,
    approval_artifact_kind: approved.kind,
    approval_content_hash: approved.hash,
    approval_content_type: approved.contentType,
    approval_payload: approved.payload,
    approval_markdown: approved.markdown,
    approval_artifact_stage_id: uuid(offset + (kind === 'scope' ? 110 : 120)),
    gate_kind: gateKind,
    gate_status: 'completed',
    producer_stage_id: uuid(offset + (kind === 'scope' ? 110 : 120)),
    producer_input_hash: inputHash,
    producer_output_artifact_id: approved.id,
    approval_event_id: event.eventId,
    approval_event_hash: canonicalHash(event),
    approval_event_payload: event,
    approval_event_occurred_at: new Date(event.occurredAt),
    selected_evidence: selectedEvidence.map((reference) => ({
      reference,
      resolvedArtifactId: reference.artifactId,
      resolvedArtifactHash: reference.artifactHash,
      resolvedArtifactKind: reference.kind,
      resolvedTenantId: tenantId,
    })),
    consumer_attempts: consumerAttempts,
    captured_at: capturedAt,
    database_name: 'orqaly_v2_preview_001',
    transaction_read_only: 'on',
    marker_component: 'orqaly',
    marker_migration_number: 1,
    marker_migration_path: 'database/workflow-v2/migrations/001_clean_workflow_v2.sql',
    marker_migration_sha256: canonicalHash('orqaly migration'),
    marker_bindings_path: 'infra/gcp/workflow-v2/preview-role-bindings.sql',
    marker_bindings_sha256: canonicalHash('orqaly bindings'),
    marker_source_commit: markerCommit,
    marker_additive_migrations: additiveMigrations(),
  };
}

function validRows() {
  return [
    approvalRow({ mode: 'simple', offset: 1_000, kind: 'scope' }),
    approvalRow({ mode: 'simple', offset: 1_000, kind: 'plan' }),
    approvalRow({ mode: 'advanced', offset: 2_000, kind: 'scope' }),
    approvalRow({ mode: 'advanced', offset: 2_000, kind: 'plan' }),
  ];
}

describe('workflow v2 read-only live evidence', () => {
  it('joins exact owner, modes, approvals, events, selected evidence, consumers and final artifacts', () => {
    const evidence = verifyLiveEvidenceRows(validRows(), { tenantId, ownerUserId: userId });

    expect(evidence.database.transactionReadOnly).toBe(true);
    expect(evidence.database.releaseMarker.additiveMigrations).toEqual(additiveMigrations());
    expect(evidence.e2e.simple.mode).toBe('simple');
    expect(evidence.e2e.advanced.mode).toBe('advanced');
    expect(evidence.e2e.simple.approvalBindings.scope.selectedEvidence).toHaveLength(1);
    expect(evidence.e2e.simple.approvalBindings.plan.selectedEvidence).toEqual([]);
    expect(evidence.e2e.advanced.runId).not.toBe(evidence.e2e.simple.runId);
    expect(LiveEvidenceSchema.parse(evidence).attestationSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('fails closed on invalid terminal/readiness pairings and reused cross-mode identities', () => {
    const badPair = validRows();
    badPair[0].run_status = 'completed_with_evidence_gaps';
    badPair[1].run_status = 'completed_with_evidence_gaps';
    expect(() => verifyLiveEvidenceRows(badPair, { tenantId, ownerUserId: userId })).toThrow(
      /terminal status/
    );

    const reused = validRows();
    for (const row of reused.filter((candidate) => candidate.expected_mode === 'advanced')) {
      row.final_artifact_id = reused[0].final_artifact_id;
      row.final_producer_output_artifact_id = reused[0].final_artifact_id;
    }
    expect(() => verifyLiveEvidenceRows(reused, { tenantId, ownerUserId: userId })).toThrow(
      /distinct run, stage, approval, and artifact rows/
    );
  });

  it('requires one consistently ordered additive-migration ledger in the snapshot', () => {
    const changed = validRows();
    changed[1].marker_additive_migrations[2].migrationSha256 = canonicalHash('changed 004');
    expect(() => verifyLiveEvidenceRows(changed, { tenantId, ownerUserId: userId })).toThrow(
      /additive migrations changed within the capture/
    );

    const reversed = validRows();
    for (const row of reversed) row.marker_additive_migrations.reverse();
    expect(() => verifyLiveEvidenceRows(reversed, { tenantId, ownerUserId: userId })).toThrow(
      /ordered by strictly increasing migration number/
    );
  });

  it('rejects unresolved selected evidence and unbound Gate 1 consumer inputs', () => {
    const unresolved = validRows();
    unresolved[0].selected_evidence[0].resolvedArtifactId = null;
    expect(() => verifyLiveEvidenceRows(unresolved, { tenantId, ownerUserId: userId })).toThrow(
      /not resolved exactly/
    );

    const changedConsumer = validRows();
    changedConsumer[0].consumer_attempts[0].inputPayload.acceptedScope.artifactHash =
      canonicalHash('changed');
    changedConsumer[0].consumer_attempts[0].inputHash = canonicalHash(
      changedConsumer[0].consumer_attempts[0].inputPayload
    );
    expect(() =>
      verifyLiveEvidenceRows(changedConsumer, { tenantId, ownerUserId: userId })
    ).toThrow(/accepted scope/);
  });

  it('uses an ownership-filtered join over all gate evidence tables', () => {
    for (const fragment of [
      'JOIN orqaly.workflow_runs',
      'JOIN orqaly.workflow_stages AS gate',
      'JOIN orqaly.approvals',
      'JOIN orqaly.artifacts AS approval_artifact',
      "approval_event.event_type = 'ApprovalGranted'",
      "approval_event.event_payload -> 'selectedEvidence'",
      'JOIN orqaly.stage_attempts AS attempt',
      'workflow_v2_release.applied_additive_migrations',
      'ORDER BY additive.migration_number',
      'run.tenant_id = $1::uuid',
      'run.owner_user_id = $4::text',
    ]) {
      expect(LIVE_EVIDENCE_QUERY).toContain(fragment);
    }
  });
});
