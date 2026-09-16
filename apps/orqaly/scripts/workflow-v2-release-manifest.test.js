import { describe, expect, it, vi } from 'vitest';
import {
  AXWISE_BINDINGS_PATH,
  AXWISE_BUILD_CONFIG_PATH,
  AXWISE_MIGRATION_PATH,
  ORQALY_ASSISTANT_EVENTS_MIGRATION_PATH,
  ORQALY_ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH,
  ORQALY_ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH,
  ORQALY_ASSISTANT_RETRY_MIGRATION_PATH,
  ORQALY_ASSISTANT_GOAL_MIGRATION_PATH,
  ORQALY_BINDINGS_PATH,
  ORQALY_MIGRATION_PATH,
  ORQALY_PERSONAL_TENANT_JIT_MIGRATION_PATH,
  ORQALY_RUNTIME_VERIFIER_PATH,
  ORQALY_SERVICE_BUILD_CONFIG_PATH,
  ORQALY_WEB_BUILD_CONFIG_PATH,
  REQUIRED_FAULT_GATES,
  assertCleanReleaseRepositories,
  buildReleaseManifest,
} from './workflow-v2-release-manifest.mjs';
import {
  buildBuildAttestation,
  buildRuntimeAttestation,
} from './workflow-v2-release-attestations.mjs';
import { evidenceCaseContract } from './workflow-v2-evidence-reports.mjs';
import { canonicalHash, sha256Hex } from '../lib/workflow-v2/canonical.js';

const ORQALY_COMMIT = 'b'.repeat(40);
const AXWISE_COMMIT = 'a'.repeat(40);
const ORQALY_SCHEMA = 'orqaly baseline 001';
const ORQALY_ASSISTANT_GOAL_MIGRATION = 'orqaly additive 002';
const ORQALY_PERSONAL_TENANT_JIT_MIGRATION = 'orqaly additive 003';
const ORQALY_ASSISTANT_RETRY_MIGRATION = 'orqaly additive 004';
const ORQALY_ASSISTANT_EVENTS_MIGRATION = 'orqaly additive 005';
const ORQALY_ASSISTANT_TURN_PROVENANCE_MIGRATION = 'orqaly additive 006';
const ORQALY_ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION = 'orqaly additive 007';
const ORQALY_BINDINGS = 'orqaly release roles';
const AXWISE_SCHEMA = 'axwise baseline 001';
const AXWISE_BINDINGS = 'axwise release roles';
const ORQALY_SERVICE_BUILD_CONFIG = 'orqaly service build';
const ORQALY_WEB_BUILD_CONFIG = 'orqaly web build';
const AXWISE_BUILD_CONFIG = 'axwise service build';
const ORQALY_RUNTIME_VERIFIER = 'orqaly runtime verifier';
const uuid = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const image = (name, digest) =>
  `europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview/${name}@sha256:${digest}`;
const images = {
  web: image('orqaly-web', '1'.repeat(64)),
  api: image('orqaly-service', '2'.repeat(64)),
  orqalyWorker: image('orqaly-service', '2'.repeat(64)),
  axwiseApi: image('axwise-service', '3'.repeat(64)),
  axwiseWorker: image('axwise-service', '3'.repeat(64)),
};

function marker(component) {
  if (component === 'orqaly') {
    return {
      component,
      migrationNumber: 1,
      migrationPath: ORQALY_MIGRATION_PATH,
      migrationSha256: sha256Hex(ORQALY_SCHEMA),
      bindingsPath: ORQALY_BINDINGS_PATH,
      bindingsSha256: sha256Hex(ORQALY_BINDINGS),
      sourceCommit: ORQALY_COMMIT,
      additiveMigrations: [
        {
          migrationNumber: 2,
          migrationPath: ORQALY_ASSISTANT_GOAL_MIGRATION_PATH,
          migrationSha256: sha256Hex(ORQALY_ASSISTANT_GOAL_MIGRATION),
          sourceCommit: ORQALY_COMMIT,
        },
        {
          migrationNumber: 3,
          migrationPath: ORQALY_PERSONAL_TENANT_JIT_MIGRATION_PATH,
          migrationSha256: sha256Hex(ORQALY_PERSONAL_TENANT_JIT_MIGRATION),
          sourceCommit: ORQALY_COMMIT,
        },
        {
          migrationNumber: 4,
          migrationPath: ORQALY_ASSISTANT_RETRY_MIGRATION_PATH,
          migrationSha256: sha256Hex(ORQALY_ASSISTANT_RETRY_MIGRATION),
          sourceCommit: ORQALY_COMMIT,
        },
        {
          migrationNumber: 5,
          migrationPath: ORQALY_ASSISTANT_EVENTS_MIGRATION_PATH,
          migrationSha256: sha256Hex(ORQALY_ASSISTANT_EVENTS_MIGRATION),
          sourceCommit: ORQALY_COMMIT,
        },
        {
          migrationNumber: 6,
          migrationPath: ORQALY_ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH,
          migrationSha256: sha256Hex(ORQALY_ASSISTANT_TURN_PROVENANCE_MIGRATION),
          sourceCommit: ORQALY_COMMIT,
        },
        {
          migrationNumber: 7,
          migrationPath: ORQALY_ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH,
          migrationSha256: sha256Hex(ORQALY_ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION),
          sourceCommit: ORQALY_COMMIT,
        },
      ],
    };
  }
  return {
    component,
    migrationNumber: 1,
    migrationPath: AXWISE_MIGRATION_PATH,
    migrationSha256: sha256Hex(AXWISE_SCHEMA),
    bindingsPath: AXWISE_BINDINGS_PATH,
    bindingsSha256: sha256Hex(AXWISE_BINDINGS),
    sourceCommit: AXWISE_COMMIT,
    additiveMigrations: [],
  };
}

function approval(offset, kind) {
  return {
    approvalId: uuid(offset),
    stageId: uuid(offset + 1),
    artifact: {
      artifactId: uuid(offset + 2),
      artifactHash: canonicalHash(`artifact-${offset}`),
      kind,
    },
    inputHash: canonicalHash(`input-${offset}`),
    selectedEvidence: [],
    decisionHash: canonicalHash(`decision-${offset}`),
    decidedBy: 'user_previewowner',
    event: {
      eventId: uuid(offset + 3),
      eventHash: canonicalHash(`event-${offset}`),
      occurredAt: '2026-08-27T11:58:00.000Z',
    },
    consumerAttempts: [
      {
        stageId: uuid(offset + 4),
        attemptId: uuid(offset + 5),
        attemptNumber: 1,
        inputHash: canonicalHash(`consumer-${offset}`),
      },
    ],
  };
}

function liveRun(mode, offset) {
  const markdown = `# ${mode} Preview artifact\n`;
  return {
    tenantId: uuid(1),
    ownerUserId: 'user_previewowner',
    ownerOrganizationId: null,
    mode,
    runId: uuid(offset),
    status: 'completed',
    evidenceReadiness: 'ready',
    launchReady: true,
    finalArtifact: {
      artifactId: uuid(offset + 1),
      artifactHash: canonicalHash(`final-${mode}`),
      kind: 'final_markdown',
      markdown,
    },
    usage: {
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
      searchCalls: 1,
      estimatedCostMicros: 42,
      operationCount: 2,
      models: ['gemini-3.8-flash'],
    },
    latencyMs: 1234,
    approvalBindings: {
      scope: approval(offset + 10, 'scope'),
      plan: approval(offset + 20, 'plan'),
    },
  };
}

function liveEvidence() {
  const core = {
    schemaVersion: 'orqaly.preview-live-database-evidence.v1',
    capturedAt: '2026-08-27T11:59:00.000Z',
    database: {
      name: 'orqaly_v2_preview_001',
      transactionReadOnly: true,
      releaseMarker: marker('orqaly'),
    },
    e2e: {
      simple: liveRun('simple', 100),
      advanced: liveRun('advanced', 200),
    },
  };
  return { ...core, attestationSha256: canonicalHash(core) };
}

function buildAttestation() {
  const sourceSnapshots = {
    orqaly: canonicalHash('orqaly git archive'),
    axwise: canonicalHash('axwise git archive'),
  };
  const sourceTrees = {
    orqaly: canonicalHash('orqaly source tree'),
    axwise: canonicalHash('axwise source tree'),
  };
  const webBuildInputs = {
    orqalyApiOrigin: 'https://orqaly-api.example.dev',
    clerkPublishableKeyVersion: '1',
  };
  const record = (buildId, imageUri, commit, configPath, seed) => ({
    buildId,
    status: 'SUCCESS',
    image: imageUri,
    sourceCommit: commit,
    sourceSnapshotSha256:
      commit === ORQALY_COMMIT ? sourceSnapshots.orqaly : sourceSnapshots.axwise,
    sourceTreeSha256: commit === ORQALY_COMMIT ? sourceTrees.orqaly : sourceTrees.axwise,
    configPath,
    configSha256: {
      [ORQALY_SERVICE_BUILD_CONFIG_PATH]: sha256Hex(ORQALY_SERVICE_BUILD_CONFIG),
      [ORQALY_WEB_BUILD_CONFIG_PATH]: sha256Hex(ORQALY_WEB_BUILD_CONFIG),
      [AXWISE_BUILD_CONFIG_PATH]: sha256Hex(AXWISE_BUILD_CONFIG),
    }[configPath],
    cloudBuildRecordSha256: canonicalHash(`build-${seed}`),
    buildExecutionSha256: canonicalHash(`execution-${seed}`),
    artifactRegistryDescriptorSha256: canonicalHash(`image-${seed}`),
    sourceObjectSha256: canonicalHash(`source-object-${seed}`),
    builderImageDigests: [canonicalHash(`builder-${seed}`)].map((digest) => `sha256:${digest}`),
    substitutions:
      configPath === ORQALY_WEB_BUILD_CONFIG_PATH
        ? {
            _IMAGE_NAME: `${imageUri.split('@')[0]}:${commit.slice(0, 12)}-${sha256Hex(
              `${commit}\n${webBuildInputs.orqalyApiOrigin}\n${webBuildInputs.clerkPublishableKeyVersion}\n`
            ).slice(0, 12)}`,
            _ORQALY_API_URL: webBuildInputs.orqalyApiOrigin,
            _CLERK_PUBLISHABLE_KEY_VERSION: webBuildInputs.clerkPublishableKeyVersion,
          }
        : {
            _IMAGE_NAME: `${imageUri.split('@')[0]}:${commit.slice(0, 12)}${
              configPath === AXWISE_BUILD_CONFIG_PATH
                ? `-${ORQALY_COMMIT.slice(0, 12)}`
                : `-${AXWISE_COMMIT.slice(0, 12)}`
            }`,
          },
    sourceArchive: {
      bucket: 'cloud-build-source',
      object: `source-${seed}.tgz`,
      generation: `${seed}`,
    },
  });
  return buildBuildAttestation({
    schemaVersion: 'orqaly.preview-build-attestation.v1',
    generatedAt: '2026-08-27T11:50:00.000Z',
    projectId: 'axwise-v2-preview-001',
    region: 'europe-west4',
    repository: 'workflow-v2-preview',
    code: { orqalyCommit: ORQALY_COMMIT, axwiseCommit: AXWISE_COMMIT },
    webBuildInputs,
    sourceSnapshots: {
      orqaly: {
        format: 'git-archive-tar',
        sourceCommit: ORQALY_COMMIT,
        archiveSha256: sourceSnapshots.orqaly,
        treeSha256: sourceTrees.orqaly,
      },
      axwise: {
        format: 'git-archive-tar',
        sourceCommit: AXWISE_COMMIT,
        archiveSha256: sourceSnapshots.axwise,
        treeSha256: sourceTrees.axwise,
      },
    },
    images,
    builds: {
      orqalyService: record(
        '11111111-1111-4111-8111-111111111111',
        images.api,
        ORQALY_COMMIT,
        'deploy/workflow-v2/cloudbuild.service.yaml',
        1
      ),
      orqalyWeb: record(
        '22222222-2222-4222-8222-222222222222',
        images.web,
        ORQALY_COMMIT,
        'deploy/workflow-v2/cloudbuild.web.yaml',
        2
      ),
      axwiseService: record(
        '33333333-3333-4333-8333-333333333333',
        images.axwiseApi,
        AXWISE_COMMIT,
        'cloudbuild.workflow-v2.yaml',
        3
      ),
    },
  });
}

describe('workflow v2 immutable release tags', () => {
  it('binds the Orqaly service image tag to both release commits', () => {
    const attestation = buildAttestation();

    expect(attestation.builds.orqalyService.substitutions).toEqual({
      _IMAGE_NAME:
        `europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview/` +
        `orqaly-service:${ORQALY_COMMIT.slice(0, 12)}-${AXWISE_COMMIT.slice(0, 12)}`,
    });

    const { attestationSha256: _attestationSha256, ...commitOnlyCore } = attestation;
    commitOnlyCore.builds.orqalyService.substitutions = {
      _IMAGE_NAME:
        `europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview/` +
        `orqaly-service:${ORQALY_COMMIT.slice(0, 12)}`,
    };
    expect(() => buildBuildAttestation(commitOnlyCore)).toThrow(
      'Cloud Build substitutions do not bind the exact immutable build inputs'
    );
  });
});

function runtimeAttestation() {
  const service = (name, role, imageUri, seed) => ({
    service: name,
    revision: `${name}-00001-${role}`,
    image: imageUri,
    serviceDocumentSha256: canonicalHash(`service-${seed}`),
  });
  return buildRuntimeAttestation({
    schemaVersion: 'orqaly.preview-runtime-attestation.v1',
    verifiedAt: '2026-08-27T11:59:00.000Z',
    projectId: 'axwise-v2-preview-001',
    region: 'europe-west4',
    environment: 'preview',
    verifier: {
      sourceCommit: ORQALY_COMMIT,
      scriptPath: ORQALY_RUNTIME_VERIFIER_PATH,
      scriptSha256: sha256Hex(ORQALY_RUNTIME_VERIFIER),
    },
    latestTrafficRequired: true,
    images,
    verifierInvocation: {
      exitCode: 0,
      stdoutSha256: canonicalHash('runtime verifier stdout'),
      inputs: {
        images,
        origins: {
          orqalyApi: 'https://orqaly-api.example.dev',
          orqalyWeb: 'https://orqaly-web.example.dev',
          axwiseApi: 'https://axwise-api.example.dev',
        },
        secretVersions: {
          orqalyIdentityDatabaseUrl: '3',
          orqalyApiDatabaseUrl: '4',
          orqalyWorkerDatabaseUrl: '5',
          clerkSecretKey: '2',
          axwiseApiDatabaseUrl: '6',
          axwiseWorkerDatabaseUrl: '7',
          axwiseGeminiApiKey: '8',
          axwiseAuthoritySeal: '9',
        },
        requireLatestTraffic: true,
      },
    },
    services: {
      web: service('orqaly-v2-web-preview', 'web', images.web, 1),
      api: service('orqaly-v2-api-preview', 'api', images.api, 2),
      orqalyWorker: service('orqaly-v2-worker-preview', 'ow', images.orqalyWorker, 3),
      axwiseApi: service('axwise-v2-preview', 'aa', images.axwiseApi, 4),
      axwiseWorker: service('axwise-v2-worker-preview', 'aw', images.axwiseWorker, 5),
    },
    boundaryEvidence: {
      projectIamSha256: canonicalHash('project iam'),
      serviceIamSha256: canonicalHash('service iam'),
      secretIamSha256: canonicalHash('secret iam'),
      networkSha256: canonicalHash('network'),
      artifactBucketSha256: canonicalHash('bucket'),
      artifactRegistrySha256: canonicalHash('registry'),
    },
  });
}

function evidence(caseId) {
  return {
    reportUri:
      'gs://axwise-v2-preview-001-orqaly-v2-preview-001-artifacts/release-evidence/preview-gates.json',
    generation: '7',
    reportSha256: canonicalHash('preview gate report'),
    caseId,
  };
}

function supplement(mode, run) {
  const { finalArtifact } = run;
  return {
    observability: {
      traceId: `trace-${mode}-preview`,
      correlatedLogs: evidence(`e2e.${mode}.correlated_logs`),
      leases: evidence(`e2e.${mode}.leases`),
      retries: evidence(`e2e.${mode}.retries`),
      tenantBoundary: evidence(`e2e.${mode}.tenant_boundary`),
    },
    gcsExport: {
      uri:
        `gs://axwise-v2-preview-001-orqaly-v2-preview-001-artifacts/tenants/${run.tenantId}` +
        `/runs/${run.runId}/artifacts/${finalArtifact.artifactId}/${finalArtifact.artifactHash}.md`,
      generation: '7',
      artifactContentHash: finalArtifact.artifactHash,
      rawSha256: sha256Hex(finalArtifact.markdown),
    },
  };
}

function validInput(live = liveEvidence()) {
  return {
    environment: 'preview',
    secretVersions: {
      adminDatabasePassword: '10',
      clerkPublishableKey: '1',
      clerkSecretKey: '2',
      orqalyIdentityDatabaseUrl: '3',
      orqalyApiDatabaseUrl: '4',
      orqalyWorkerDatabaseUrl: '5',
      axwiseApiDatabaseUrl: '6',
      axwiseWorkerDatabaseUrl: '7',
      axwiseGeminiApiKey: '8',
      axwiseAuthoritySeal: '9',
    },
    clerk: {
      issuer: 'https://example.clerk.accounts.dev',
      instanceFingerprint: canonicalHash('clerk preview instance'),
      verification: evidence('identity.clerk_preview_instance'),
    },
    model: { name: 'models/gemini-3.8-flash', reasoningLevel: 'high' },
    cloudSql: {
      connectionName: 'axwise-v2-preview-001:europe-west4:orqaly-v2-preview-001-pg',
      orqalyDatabase: 'orqaly_v2_preview_001',
      axwiseDatabase: 'axwise_v2_preview_001',
      freshBaseline: true,
      releaseMarkers: { orqaly: marker('orqaly'), axwise: marker('axwise') },
      structuralVerification: evidence('cloudsql.structural_rls'),
    },
    e2e: {
      simple: supplement('simple', live.e2e.simple),
      advanced: supplement('advanced', live.e2e.advanced),
    },
    faultGates: Object.fromEntries(
      REQUIRED_FAULT_GATES.map((name) => [
        name,
        { passed: true, evidence: evidence(`fault.${name}`) },
      ])
    ),
  };
}

function evidenceFacts(caseId, input, live) {
  if (caseId === 'identity.clerk_preview_instance') {
    return {
      clerkIssuer: input.clerk.issuer,
      instanceFingerprint: input.clerk.instanceFingerprint,
      authenticatedUserId: live.e2e.simple.ownerUserId,
      authenticatedTenantId: live.e2e.simple.tenantId,
    };
  }
  if (caseId === 'cloudsql.structural_rls') {
    return {
      postgresVersion: '17.6',
      structuralTestCount: 27,
      rlsEnabledTableCount: 9,
      tenantCompositeForeignKeyCount: 14,
      crossTenantReadDenied: true,
      crossTenantClaimDenied: true,
      crossTenantReferenceDenied: true,
    };
  }
  const e2eMatch = caseId.match(/^e2e\.(simple|advanced)\.(.+)$/);
  if (e2eMatch) {
    const [, mode, kind] = e2eMatch;
    const run = live.e2e[mode];
    const attempt = run.approvalBindings.plan.consumerAttempts[0];
    if (kind === 'correlated_logs') {
      return {
        runId: run.runId,
        traceId: input.e2e[mode].observability.traceId,
        orqalyLogEntryCount: 9,
        axwiseLogEntryCount: 4,
        terminalEventObserved: true,
      };
    }
    if (kind === 'leases') {
      return {
        runId: run.runId,
        claimedAttemptIds: [attempt.attemptId],
        staleLeaseFinalizeAttemptCount: 0,
        staleLeaseFinalizeRejectedCount: 0,
        activeLeaseFinalizeCount: 1,
      };
    }
    if (kind === 'retries') {
      return {
        runId: run.runId,
        retryCount: 0,
        retriedStageIds: [],
        retryAttemptIds: [],
        retryAttemptNumbers: [],
      };
    }
    return {
      runId: run.runId,
      tenantAId: run.tenantId,
      tenantBId: uuid(999),
      readDenied: true,
      claimDenied: true,
      referenceDenied: true,
    };
  }
  const common = { tenantAId: uuid(1), tenantBId: uuid(999) };
  const faultFacts = {
    'fault.axwise_500_attempt_n_plus_1_same_stage': {
      stageId: uuid(501),
      failedAttemptId: uuid(502),
      retryAttemptId: uuid(503),
      attemptNumbers: [1, 2],
      operationIdsDistinct: true,
    },
    'fault.poll_202_no_new_attempt_or_job': {
      operationId: uuid(504),
      pollCount: 3,
      attemptRowsBefore: 1,
      attemptRowsAfter: 1,
      operationRowsBefore: 1,
      operationRowsAfter: 1,
    },
    'fault.lost_post_or_completion_adopts_same_result': {
      operationId: uuid(505),
      resultArtifactId: uuid(506),
      resultArtifactHash: canonicalHash('adopted result'),
      dispatchCount: 2,
      immutableResultCount: 1,
    },
    'fault.deployment_rotation_preserves_durable_identity': {
      runId: uuid(507),
      stageId: uuid(508),
      attemptId: uuid(509),
      operationId: uuid(510),
      deploymentIds: ['revision-a', 'revision-b'],
      durableIdentityPreserved: true,
    },
    'fault.expired_or_stale_lease_cannot_finalize': {
      attemptId: uuid(511),
      staleLeaseTokenHash: canonicalHash('stale lease'),
      activeLeaseTokenHash: canonicalHash('active lease'),
      finalizeRejected: true,
    },
    'fault.duplicate_approval_is_idempotent': {
      approvalId: uuid(512),
      clickCount: 2,
      approvalRowCount: 1,
      approvalEventCount: 1,
      downstreamOutboxCount: 1,
    },
    'fault.cross_tenant_read_claim_reference_denied': {
      ...common,
      readDenied: true,
      claimDenied: true,
      referenceDenied: true,
    },
    'fault.optional_gaps_complete_without_launch_ready_claim': {
      runId: uuid(513),
      terminalStatus: 'completed_with_evidence_gaps',
      evidenceReadiness: 'ready_with_gaps',
      launchReady: false,
      finalMarkdownHash: canonicalHash('gapped markdown'),
    },
    'fault.essential_legal_or_safety_gap_blocks': {
      runId: uuid(514),
      evidenceReadiness: 'blocked',
      terminalStatus: 'blocked',
      finalArtifactCount: 0,
      blockingRequirementIds: ['legal-safety-source'],
    },
    'fault.outbox_replay_does_not_duplicate_downstream_work': {
      outboxEventId: uuid(515),
      replayCount: 2,
      downstreamOperationId: uuid(516),
      downstreamWorkCount: 1,
    },
    'fault.tenant_agent_filter_precedes_rank_and_limit': {
      ...common,
      tenantCandidateCount: 3,
      rankedCandidateCount: 2,
      crossTenantCandidateCount: 0,
      selectedAgentTenantId: common.tenantAId,
    },
  };
  return faultFacts[caseId];
}

function verifiedReports(input = validInput(), live = liveEvidence()) {
  const references = [
    input.clerk.verification,
    input.cloudSql.structuralVerification,
    ...['simple', 'advanced'].flatMap((mode) =>
      Object.values(input.e2e[mode].observability).filter((value) => typeof value === 'object')
    ),
    ...Object.values(input.faultGates).map((fault) => fault.evidence),
  ];
  const cases = references
    .map((reference) => ({
      caseId: reference.caseId,
      ...evidenceCaseContract(reference.caseId),
      passed: true,
      facts: evidenceFacts(reference.caseId, input, live),
    }))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  const reference = references[0];
  return new Map([
    [
      `${reference.reportUri}#${reference.generation}`,
      {
        reportUri: reference.reportUri,
        generation: reference.generation,
        rawSha256: reference.reportSha256,
        document: {
          schemaVersion: 'orqaly.preview-gate-report.v1',
          environment: 'preview',
          generatedAt: '2026-08-27T11:57:00.000Z',
          code: { orqalyCommit: ORQALY_COMMIT, axwiseCommit: AXWISE_COMMIT },
          releaseMarkers: { orqaly: marker('orqaly'), axwise: marker('axwise') },
          cases,
        },
      },
    ],
  ]);
}

function verifiedExports(input, live) {
  return new Map(
    ['simple', 'advanced'].map((mode) => {
      const reference = input.e2e[mode].gcsExport;
      return [
        mode,
        {
          ...reference,
          rawSha256: reference.rawSha256,
          byteLength: Buffer.byteLength(live.e2e[mode].finalArtifact.markdown),
          exactDatabaseMarkdown: true,
        },
      ];
    })
  );
}

function manifestArguments(overrides = {}) {
  const live = overrides.liveEvidence || liveEvidence();
  const input = overrides.input || validInput(live);
  return {
    input,
    liveEvidence: live,
    buildAttestation: overrides.buildAttestation || buildAttestation(),
    runtimeAttestation: overrides.runtimeAttestation || runtimeAttestation(),
    orqalyCommit: ORQALY_COMMIT,
    axwiseCommit: AXWISE_COMMIT,
    orqalySchema: ORQALY_SCHEMA,
    orqalyAssistantGoalMigration: ORQALY_ASSISTANT_GOAL_MIGRATION,
    orqalyPersonalTenantJitMigration: ORQALY_PERSONAL_TENANT_JIT_MIGRATION,
    orqalyAssistantRetryMigration: ORQALY_ASSISTANT_RETRY_MIGRATION,
    orqalyAssistantEventsMigration: ORQALY_ASSISTANT_EVENTS_MIGRATION,
    orqalyAssistantTurnProvenanceMigration: ORQALY_ASSISTANT_TURN_PROVENANCE_MIGRATION,
    orqalyAssistantGroundedSourcesReasonMigration:
      ORQALY_ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION,
    orqalyBindings: ORQALY_BINDINGS,
    axwiseSchema: AXWISE_SCHEMA,
    axwiseBindings: AXWISE_BINDINGS,
    orqalyServiceBuildConfig: ORQALY_SERVICE_BUILD_CONFIG,
    orqalyWebBuildConfig: ORQALY_WEB_BUILD_CONFIG,
    axwiseBuildConfig: AXWISE_BUILD_CONFIG,
    orqalyRuntimeVerifier: ORQALY_RUNTIME_VERIFIER,
    orqalySourceSnapshotSha256: canonicalHash('orqaly git archive'),
    axwiseSourceSnapshotSha256: canonicalHash('axwise git archive'),
    evidenceReports: overrides.evidenceReports || verifiedReports(input, live),
    finalArtifactExports: overrides.finalArtifactExports || verifiedExports(input, live),
    generatedAt: '2026-08-27T12:00:00.000Z',
  };
}

describe('workflow v2 Preview release manifest', () => {
  it('binds repository HEADs, schema and bindings markers, provenance, runtime and live E2Es', () => {
    const manifest = buildReleaseManifest(manifestArguments());

    expect(manifest.schemaVersion).toBe('orqaly.preview-release-evidence.v2');
    expect(manifest.code).toEqual({ orqalyCommit: ORQALY_COMMIT, axwiseCommit: AXWISE_COMMIT });
    expect(manifest.baselines.orqaly).toEqual(marker('orqaly'));
    expect(manifest.baselines.axwise).toEqual(marker('axwise'));
    expect(manifest.images).toEqual(images);
    expect(manifest.e2e.simple.mode).toBe('simple');
    expect(manifest.e2e.advanced.mode).toBe('advanced');
    expect(manifest.e2e.simple.runId).not.toBe(manifest.e2e.advanced.runId);
    expect(Object.keys(manifest.faultGates)).toEqual(REQUIRED_FAULT_GATES);
    expect(manifest.productionPromotionAllowed).toBe(false);
    expect(manifest.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('accepts clean E2Es with zero retries and zero stale-lease probes while keeping fault gates mandatory', () => {
    const args = manifestArguments();
    const report = [...args.evidenceReports.values()][0].document;
    expect(
      report.cases.find(({ caseId }) => caseId === 'e2e.simple.retries').facts.retryCount
    ).toBe(0);
    expect(
      report.cases.find(({ caseId }) => caseId === 'e2e.advanced.leases').facts
        .staleLeaseFinalizeAttemptCount
    ).toBe(0);
    expect(() => buildReleaseManifest(args)).not.toThrow();

    const missingFault = validInput();
    delete missingFault.faultGates.axwise_500_attempt_n_plus_1_same_stage;
    expect(() => buildReleaseManifest(manifestArguments({ input: missingFault }))).toThrow();
  });

  it('rejects a runtime verifier or build record from another source commit', () => {
    const runtime = runtimeAttestation();
    const runtimeCore = {
      ...runtime,
      verifier: { ...runtime.verifier, sourceCommit: 'c'.repeat(40) },
    };
    delete runtimeCore.attestationSha256;
    const changedRuntime = buildRuntimeAttestation(runtimeCore);
    expect(() =>
      buildReleaseManifest(manifestArguments({ runtimeAttestation: changedRuntime }))
    ).toThrow(/exact Orqaly verifier commit/);

    const build = buildAttestation();
    build.code.axwiseCommit = 'c'.repeat(40);
    expect(() => buildReleaseManifest(manifestArguments({ buildAttestation: build }))).toThrow();
  });

  it('rejects changed role bindings and arbitrary baseline markers', () => {
    const input = validInput();
    input.cloudSql.releaseMarkers.orqaly.bindingsSha256 = canonicalHash('not deployed bindings');
    expect(() => buildReleaseManifest(manifestArguments({ input }))).toThrow(/repository-bound/);
  });

  it('requires the exact ordered Orqaly additive migrations and no AxWise additives', () => {
    const wrongHash = validInput();
    wrongHash.cloudSql.releaseMarkers.orqaly.additiveMigrations[3].migrationSha256 = canonicalHash(
      'not the tracked 005 migration'
    );
    expect(() => buildReleaseManifest(manifestArguments({ input: wrongHash }))).toThrow(
      /repository-bound/
    );

    const missing = validInput();
    missing.cloudSql.releaseMarkers.orqaly.additiveMigrations.pop();
    expect(() => buildReleaseManifest(manifestArguments({ input: missing }))).toThrow(
      /repository-bound/
    );

    const axwiseAdditive = validInput();
    axwiseAdditive.cloudSql.releaseMarkers.axwise.additiveMigrations = [
      { ...marker('orqaly').additiveMigrations[0] },
    ];
    expect(() => buildReleaseManifest(manifestArguments({ input: axwiseAdditive }))).toThrow(
      /repository-bound/
    );
  });

  it('rejects a GCS export that does not bind the read-only DB final artifact', () => {
    const input = validInput();
    input.e2e.simple.gcsExport.artifactContentHash = canonicalHash('different final');
    expect(() => buildReleaseManifest(manifestArguments({ input }))).toThrow(/DB-authoritative/);
  });

  it('requires immutable structured fault and operational reports, not bare assertions', () => {
    const input = validInput();
    input.faultGates.duplicate_approval_is_idempotent.evidence = 'passed locally';
    expect(() => buildReleaseManifest(manifestArguments({ input }))).toThrow();

    const placeholder = validInput();
    placeholder.e2e.simple.observability.leases.reportSha256 = '0'.repeat(64);
    expect(() => buildReleaseManifest(manifestArguments({ input: placeholder }))).toThrow(
      /placeholder SHA-256/
    );
  });

  it('requires both source worktrees to be clean', () => {
    const run = vi.fn((command, args) => {
      expect(command).toBe('git');
      const repository = args[1];
      if (args.includes('status')) return repository === '/axwise' ? '?? local.secret\n' : '';
      if (args.includes('--show-toplevel')) return repository;
      if (args.includes('--verify')) return 'a'.repeat(40);
      throw new Error('unexpected git invocation');
    });
    expect(() =>
      assertCleanReleaseRepositories({
        orqalyRepository: '/orqaly',
        axwiseRepository: '/axwise',
        run,
      })
    ).toThrow(/AxWise release evidence requires a clean worktree/);
  });

  it('accepts two component directories in one clean root and rejects dirty siblings', () => {
    let dirty = false;
    const run = vi.fn((command, args) => {
      expect(command).toBe('git');
      if (args.includes('--show-toplevel')) return '/monorepo';
      if (args.includes('status')) {
        expect(args[1]).toBe('/monorepo');
        expect(args).toContain('--untracked-files=all');
        return dirty ? ' M unrelated-user-file.md\n' : '';
      }
      if (args.includes('--verify')) return 'a'.repeat(40);
      throw new Error('unexpected git invocation');
    });
    const sources = { orqalyRepository: '/monorepo/apps/orqaly', axwiseRepository: '/monorepo', run };
    expect(() => assertCleanReleaseRepositories(sources)).not.toThrow();
    dirty = true;
    expect(() => assertCleanReleaseRepositories(sources)).toThrow(/clean worktree/);
  });
});
