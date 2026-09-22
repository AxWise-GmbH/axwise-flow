import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { canonicalHash, canonicalJson, sha256Hex } from '../lib/workflow-v2/canonical.js';
import {
  BuildAttestationSchema,
  CommitSchema,
  ImageSetSchema,
  ImmutableEvidenceReferenceSchema,
  RuntimeAttestationSchema,
  Sha256Schema,
} from './workflow-v2-release-attestations.mjs';
import { LiveEvidenceSchema, ReleaseMarkerSchema } from './workflow-v2-live-evidence.mjs';
import {
  archiveGitSource,
  assertCleanGitSource,
  assertExternalGitOutput,
  gitSourceRoot,
  readGitSourceFile,
} from './workflow-v2-git-source.mjs';
import {
  assertEvidenceCase,
  assertFinalArtifactExport,
  collectEvidenceReferences,
  evidenceReportSummaries,
  FinalArtifactExportReferenceSchema,
  loadEvidenceReports,
  loadFinalArtifactExports,
} from './workflow-v2-evidence-reports.mjs';

export const ORQALY_MIGRATION_PATH = 'database/workflow-v2/migrations/001_clean_workflow_v2.sql';
export const ORQALY_ASSISTANT_GOAL_MIGRATION_PATH =
  'database/workflow-v2/migrations/002_assistant_goal.sql';
export const ORQALY_PERSONAL_TENANT_JIT_MIGRATION_PATH =
  'database/workflow-v2/migrations/003_personal_tenant_jit.sql';
export const ORQALY_ASSISTANT_RETRY_MIGRATION_PATH =
  'database/workflow-v2/migrations/004_assistant_retry_lineage.sql';
export const ORQALY_ASSISTANT_EVENTS_MIGRATION_PATH =
  'database/workflow-v2/migrations/005_assistant_turn_events.sql';
export const ORQALY_ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH =
  'database/workflow-v2/migrations/006_assistant_turn_provenance.sql';
export const ORQALY_ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH =
  'database/workflow-v2/migrations/007_assistant_grounded_sources_reason.sql';
export const ORQALY_BINDINGS_PATH = 'infra/gcp/workflow-v2/preview-role-bindings.sql';
export const AXWISE_MIGRATION_PATH = 'backend/database/workflow_v2/001_cognitive_operations.sql';
export const AXWISE_BINDINGS_PATH = 'deploy/workflow-v2/preview-role-bindings.sql';
export const ORQALY_SERVICE_BUILD_CONFIG_PATH = 'deploy/workflow-v2/cloudbuild.service.yaml';
export const ORQALY_WEB_BUILD_CONFIG_PATH = 'deploy/workflow-v2/cloudbuild.web.yaml';
export const AXWISE_BUILD_CONFIG_PATH = 'cloudbuild.workflow-v2.yaml';
export const ORQALY_RUNTIME_VERIFIER_PATH = 'infra/gcp/workflow-v2/verify-preview-runtime.sh';

export const REQUIRED_FAULT_GATES = [
  'axwise_500_attempt_n_plus_1_same_stage',
  'poll_202_no_new_attempt_or_job',
  'lost_post_or_completion_adopts_same_result',
  'deployment_rotation_preserves_durable_identity',
  'expired_or_stale_lease_cannot_finalize',
  'duplicate_approval_is_idempotent',
  'cross_tenant_read_claim_reference_denied',
  'optional_gaps_complete_without_launch_ready_claim',
  'essential_legal_or_safety_gap_blocks',
  'outbox_replay_does_not_duplicate_downstream_work',
  'tenant_agent_filter_precedes_rank_and_limit',
];

const SecretVersion = z.string().regex(/^[1-9][0-9]*$/);

const E2eSupplementSchema = z
  .object({
    observability: z
      .object({
        traceId: z.string().min(8).max(256),
        correlatedLogs: ImmutableEvidenceReferenceSchema,
        leases: ImmutableEvidenceReferenceSchema,
        retries: ImmutableEvidenceReferenceSchema,
        tenantBoundary: ImmutableEvidenceReferenceSchema,
      })
      .strict(),
    gcsExport: FinalArtifactExportReferenceSchema,
  })
  .strict();

const FaultResult = z
  .object({
    passed: z.literal(true),
    evidence: ImmutableEvidenceReferenceSchema,
  })
  .strict();

const ReleaseInputSchema = z
  .object({
    environment: z.literal('preview'),
    secretVersions: z
      .object({
        adminDatabasePassword: SecretVersion,
        clerkPublishableKey: SecretVersion,
        clerkSecretKey: SecretVersion,
        typesafeApiKey: SecretVersion,
        orqalyIdentityDatabaseUrl: SecretVersion,
        orqalyApiDatabaseUrl: SecretVersion,
        orqalyWorkerDatabaseUrl: SecretVersion,
        axwiseApiDatabaseUrl: SecretVersion,
        axwiseWorkerDatabaseUrl: SecretVersion,
        axwiseGeminiApiKey: SecretVersion,
        axwiseAuthoritySeal: SecretVersion,
      })
      .strict(),
    clerk: z
      .object({
        issuer: z.string().url().max(500),
        instanceFingerprint: Sha256Schema,
        verification: ImmutableEvidenceReferenceSchema,
      })
      .strict(),
    model: z
      .object({
        name: z.literal('models/gemini-3.8-flash'),
        reasoningLevel: z.literal('high'),
      })
      .strict(),
    cloudSql: z
      .object({
        connectionName: z.literal('axwise-v2-preview-001:europe-west4:orqaly-v2-preview-001-pg'),
        orqalyDatabase: z.literal('orqaly_v2_preview_001'),
        axwiseDatabase: z.literal('axwise_v2_preview_001'),
        freshBaseline: z.literal(true),
        releaseMarkers: z
          .object({
            orqaly: ReleaseMarkerSchema.extend({ component: z.literal('orqaly') }),
            axwise: ReleaseMarkerSchema.extend({ component: z.literal('axwise') }),
          })
          .strict(),
        structuralVerification: ImmutableEvidenceReferenceSchema,
      })
      .strict(),
    e2e: z.object({ simple: E2eSupplementSchema, advanced: E2eSupplementSchema }).strict(),
    faultGates: z
      .object(Object.fromEntries(REQUIRED_FAULT_GATES.map((name) => [name, FaultResult])))
      .strict(),
  })
  .strict();

function exact(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function expectedMarker({
  component,
  commit,
  migrationPath,
  migration,
  bindingsPath,
  bindings,
  additiveMigrations = [],
}) {
  return {
    component,
    migrationNumber: 1,
    migrationPath,
    migrationSha256: sha256Hex(migration),
    bindingsPath,
    bindingsSha256: sha256Hex(bindings),
    sourceCommit: commit,
    additiveMigrations: additiveMigrations.map((additive) => ({
      migrationNumber: additive.migrationNumber,
      migrationPath: additive.migrationPath,
      migrationSha256: sha256Hex(additive.migration),
      sourceCommit: commit,
    })),
  };
}

export function buildReleaseManifest({
  input: rawInput,
  liveEvidence: rawLiveEvidence,
  buildAttestation: rawBuildAttestation,
  runtimeAttestation: rawRuntimeAttestation,
  orqalyCommit,
  axwiseCommit,
  orqalySchema,
  orqalyAssistantGoalMigration,
  orqalyPersonalTenantJitMigration,
  orqalyAssistantRetryMigration,
  orqalyAssistantEventsMigration,
  orqalyAssistantTurnProvenanceMigration,
  orqalyAssistantGroundedSourcesReasonMigration,
  orqalyBindings,
  axwiseSchema,
  axwiseBindings,
  orqalyServiceBuildConfig,
  orqalyWebBuildConfig,
  axwiseBuildConfig,
  orqalyRuntimeVerifier,
  orqalySourceSnapshotSha256,
  axwiseSourceSnapshotSha256,
  evidenceReports,
  finalArtifactExports,
  generatedAt = new Date().toISOString(),
}) {
  const input = ReleaseInputSchema.parse(rawInput);
  const liveEvidence = LiveEvidenceSchema.parse(rawLiveEvidence);
  const buildAttestation = BuildAttestationSchema.parse(rawBuildAttestation);
  const runtimeAttestation = RuntimeAttestationSchema.parse(rawRuntimeAttestation);
  const commits = {
    orqalyCommit: CommitSchema.parse(orqalyCommit),
    axwiseCommit: CommitSchema.parse(axwiseCommit),
  };
  const baselines = {
    orqaly: expectedMarker({
      component: 'orqaly',
      commit: commits.orqalyCommit,
      migrationPath: ORQALY_MIGRATION_PATH,
      migration: orqalySchema,
      bindingsPath: ORQALY_BINDINGS_PATH,
      bindings: orqalyBindings,
      additiveMigrations: [
        {
          migrationNumber: 2,
          migrationPath: ORQALY_ASSISTANT_GOAL_MIGRATION_PATH,
          migration: orqalyAssistantGoalMigration,
        },
        {
          migrationNumber: 3,
          migrationPath: ORQALY_PERSONAL_TENANT_JIT_MIGRATION_PATH,
          migration: orqalyPersonalTenantJitMigration,
        },
        {
          migrationNumber: 4,
          migrationPath: ORQALY_ASSISTANT_RETRY_MIGRATION_PATH,
          migration: orqalyAssistantRetryMigration,
        },
        {
          migrationNumber: 5,
          migrationPath: ORQALY_ASSISTANT_EVENTS_MIGRATION_PATH,
          migration: orqalyAssistantEventsMigration,
        },
        {
          migrationNumber: 6,
          migrationPath: ORQALY_ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH,
          migration: orqalyAssistantTurnProvenanceMigration,
        },
        {
          migrationNumber: 7,
          migrationPath: ORQALY_ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH,
          migration: orqalyAssistantGroundedSourcesReasonMigration,
        },
      ],
    }),
    axwise: expectedMarker({
      component: 'axwise',
      commit: commits.axwiseCommit,
      migrationPath: AXWISE_MIGRATION_PATH,
      migration: axwiseSchema,
      bindingsPath: AXWISE_BINDINGS_PATH,
      bindings: axwiseBindings,
    }),
  };

  if (!exact(input.cloudSql.releaseMarkers, baselines)) {
    throw new Error('live release markers do not match the exact repository-bound baselines');
  }
  if (!exact(liveEvidence.database.releaseMarker, baselines.orqaly)) {
    throw new Error('read-only live evidence does not match the exact Orqaly release marker');
  }
  if (!exact(buildAttestation.code, commits)) {
    throw new Error('build provenance does not match both exact repository HEADs');
  }
  const expectedSnapshots = {
    orqaly: { sourceCommit: commits.orqalyCommit, archiveSha256: orqalySourceSnapshotSha256 },
    axwise: { sourceCommit: commits.axwiseCommit, archiveSha256: axwiseSourceSnapshotSha256 },
  };
  for (const [name, expected] of Object.entries(expectedSnapshots)) {
    const observed = buildAttestation.sourceSnapshots[name];
    if (
      observed.format !== 'git-archive-tar' ||
      observed.sourceCommit !== expected.sourceCommit ||
      observed.archiveSha256 !== expected.archiveSha256
    ) {
      throw new Error(`${name} build provenance does not match the exact tracked HEAD archive`);
    }
  }
  const expectedBuildConfigs = {
    orqalyService: [ORQALY_SERVICE_BUILD_CONFIG_PATH, sha256Hex(orqalyServiceBuildConfig)],
    orqalyWeb: [ORQALY_WEB_BUILD_CONFIG_PATH, sha256Hex(orqalyWebBuildConfig)],
    axwiseService: [AXWISE_BUILD_CONFIG_PATH, sha256Hex(axwiseBuildConfig)],
  };
  for (const [name, [path, checksum]] of Object.entries(expectedBuildConfigs)) {
    const build = buildAttestation.builds[name];
    if (build.configPath !== path || build.configSha256 !== checksum) {
      throw new Error(`${name} provenance does not match its exact tracked build configuration`);
    }
  }
  if (runtimeAttestation.verifier.sourceCommit !== commits.orqalyCommit) {
    throw new Error('runtime attestation was not produced by the exact Orqaly verifier commit');
  }
  if (
    runtimeAttestation.verifier.scriptPath !== ORQALY_RUNTIME_VERIFIER_PATH ||
    runtimeAttestation.verifier.scriptSha256 !== sha256Hex(orqalyRuntimeVerifier)
  ) {
    throw new Error('runtime attestation does not match the exact tracked verifier');
  }
  if (!exact(buildAttestation.images, runtimeAttestation.images)) {
    throw new Error('built image provenance differs from the verified runtime images');
  }
  if (
    buildAttestation.webBuildInputs.orqalyApiOrigin !==
      runtimeAttestation.verifierInvocation.inputs.origins.orqalyApi ||
    buildAttestation.webBuildInputs.clerkPublishableKeyVersion !==
      input.secretVersions.clerkPublishableKey
  ) {
    throw new Error(
      'web image build inputs differ from the verified API origin or Clerk key version'
    );
  }
  const expectedRuntimeSecretVersions = {
    orqalyIdentityDatabaseUrl: input.secretVersions.orqalyIdentityDatabaseUrl,
    orqalyApiDatabaseUrl: input.secretVersions.orqalyApiDatabaseUrl,
    orqalyWorkerDatabaseUrl: input.secretVersions.orqalyWorkerDatabaseUrl,
    clerkSecretKey: input.secretVersions.clerkSecretKey,
    typesafeApiKey: input.secretVersions.typesafeApiKey,
    axwiseApiDatabaseUrl: input.secretVersions.axwiseApiDatabaseUrl,
    axwiseWorkerDatabaseUrl: input.secretVersions.axwiseWorkerDatabaseUrl,
    axwiseGeminiApiKey: input.secretVersions.axwiseGeminiApiKey,
    axwiseAuthoritySeal: input.secretVersions.axwiseAuthoritySeal,
  };
  if (
    !exact(
      runtimeAttestation.verifierInvocation.inputs.secretVersions,
      expectedRuntimeSecretVersions
    )
  ) {
    throw new Error('runtime verifier invocation used different secret versions from the release');
  }

  assertEvidenceCase({
    reference: input.cloudSql.structuralVerification,
    reports: evidenceReports,
    expectedCaseId: 'cloudsql.structural_rls',
    expectedKind: 'database_verification',
    code: commits,
    releaseMarkers: baselines,
  });
  const clerkEvidence = assertEvidenceCase({
    reference: input.clerk.verification,
    reports: evidenceReports,
    expectedCaseId: 'identity.clerk_preview_instance',
    expectedKind: 'runtime_observation',
    code: commits,
    releaseMarkers: baselines,
  });
  if (
    clerkEvidence.facts.clerkIssuer !== input.clerk.issuer ||
    clerkEvidence.facts.instanceFingerprint !== input.clerk.instanceFingerprint ||
    clerkEvidence.facts.authenticatedUserId !== liveEvidence.e2e.simple.ownerUserId ||
    clerkEvidence.facts.authenticatedTenantId !== liveEvidence.e2e.simple.tenantId
  ) {
    throw new Error('Clerk identity metadata does not match authenticated live Preview evidence');
  }
  for (const mode of ['simple', 'advanced']) {
    for (const [field, suffix] of [
      ['correlatedLogs', 'correlated_logs'],
      ['leases', 'leases'],
      ['retries', 'retries'],
      ['tenantBoundary', 'tenant_boundary'],
    ]) {
      const observedCase = assertEvidenceCase({
        reference: input.e2e[mode].observability[field],
        reports: evidenceReports,
        expectedCaseId: `e2e.${mode}.${suffix}`,
        expectedKind: 'runtime_observation',
        code: commits,
        releaseMarkers: baselines,
      });
      const databaseRun = liveEvidence.e2e[mode];
      if (observedCase.facts.runId !== databaseRun.runId) {
        throw new Error(`${mode} ${field} evidence belongs to another run`);
      }
      if (
        field === 'correlatedLogs' &&
        observedCase.facts.traceId !== input.e2e[mode].observability.traceId
      ) {
        throw new Error(`${mode} correlated logs do not bind the declared trace`);
      }
      if (field === 'leases') {
        const durableAttemptIds = new Set(
          Object.values(databaseRun.approvalBindings)
            .flatMap((approval) => approval.consumerAttempts)
            .map((attempt) => attempt.attemptId)
        );
        if (
          !observedCase.facts.claimedAttemptIds.every((attemptId) =>
            durableAttemptIds.has(attemptId)
          )
        ) {
          throw new Error(`${mode} lease evidence does not bind durable DB attempts`);
        }
      }
      if (field === 'retries') {
        const durableStageIds = new Set(
          Object.values(databaseRun.approvalBindings)
            .flatMap((approval) => approval.consumerAttempts)
            .map((attempt) => attempt.stageId)
        );
        if (!observedCase.facts.retriedStageIds.every((stageId) => durableStageIds.has(stageId))) {
          throw new Error(`${mode} retry evidence does not bind a durable DB stage`);
        }
      }
      if (
        field === 'tenantBoundary' &&
        (observedCase.facts.tenantAId !== databaseRun.tenantId ||
          observedCase.facts.tenantBId === databaseRun.tenantId)
      ) {
        throw new Error(`${mode} tenant-boundary evidence does not bind the authenticated tenant`);
      }
    }
  }
  for (const name of REQUIRED_FAULT_GATES) {
    assertEvidenceCase({
      reference: input.faultGates[name].evidence,
      reports: evidenceReports,
      expectedCaseId: `fault.${name}`,
      expectedKind: 'fault_gate',
      code: commits,
      releaseMarkers: baselines,
    });
  }

  const e2e = {};
  for (const mode of ['simple', 'advanced']) {
    const databaseRun = liveEvidence.e2e[mode];
    const supplement = input.e2e[mode];
    if (supplement.gcsExport.artifactContentHash !== databaseRun.finalArtifact.artifactHash) {
      throw new Error(
        `${mode} GCS metadata does not bind the DB-authoritative final artifact hash`
      );
    }
    const expectedExportUri =
      `gs://axwise-v2-preview-001-orqaly-v2-preview-001-artifacts/tenants/${databaseRun.tenantId}` +
      `/runs/${databaseRun.runId}/artifacts/${databaseRun.finalArtifact.artifactId}` +
      `/${databaseRun.finalArtifact.artifactHash}.md`;
    if (supplement.gcsExport.uri !== expectedExportUri) {
      throw new Error(
        `${mode} GCS metadata does not use the canonical tenant/run/artifact object name`
      );
    }
    const verifiedExport = assertFinalArtifactExport({
      mode,
      reference: supplement.gcsExport,
      exportsByMode: finalArtifactExports,
    });
    e2e[mode] = {
      ...databaseRun,
      ...supplement,
      gcsExport: { ...supplement.gcsExport, verifiedByteLength: verifiedExport.byteLength },
    };
  }

  const manifestCore = {
    schemaVersion: 'orqaly.preview-release-evidence.v2',
    generatedAt,
    environment: input.environment,
    code: commits,
    baselines,
    images: ImageSetSchema.parse(buildAttestation.images),
    buildProvenance: buildAttestation,
    runtimeVerification: runtimeAttestation,
    liveDatabaseEvidence: liveEvidence,
    evidenceReports: evidenceReportSummaries(evidenceReports),
    secretVersions: input.secretVersions,
    clerk: input.clerk,
    model: input.model,
    cloudSql: input.cloudSql,
    e2e,
    faultGates: input.faultGates,
    productionPromotionAllowed: false,
  };
  return {
    ...manifestCore,
    manifestSha256: canonicalHash(manifestCore),
  };
}

function git(repository, arguments_, run) {
  return run('git', ['-C', repository, ...arguments_], { encoding: 'utf8' }).trim();
}

export function assertCleanReleaseRepositories({
  orqalyRepository,
  axwiseRepository,
  run = execFileSync,
}) {
  for (const [label, repository] of [
    ['Orqaly', orqalyRepository],
    ['AxWise', axwiseRepository],
  ]) {
    assertCleanGitSource(repository, { label, run });
  }
}

export function assertCleanReleaseWorktree({ run = execFileSync } = {}) {
  const status = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    encoding: 'utf8',
  });
  if (status.trim()) {
    throw new Error(
      'release evidence requires a clean worktree with no tracked or untracked files'
    );
  }
}

function trackedHeadFile(repository, relativePath, run = execFileSync) {
  return readGitSourceFile(repository, relativePath, { run });
}

function trackedHeadArchiveSha256(repository, run = execFileSync) {
  const archive = archiveGitSource(repository, { run });
  return createHash('sha256').update(archive).digest('hex');
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  const inputPath = argument('--input');
  const liveEvidencePath = argument('--live-evidence');
  const buildAttestationPath = argument('--build-attestation');
  const runtimeAttestationPath = argument('--runtime-attestation');
  const outputPath = argument('--output');
  const axwiseRepositoryInput = argument('--axwise-repository') || process.env.AXWISE_REPOSITORY;
  if (
    !inputPath ||
    !liveEvidencePath ||
    !buildAttestationPath ||
    !runtimeAttestationPath ||
    !outputPath
  ) {
    throw new Error(
      'usage: node scripts/workflow-v2-release-manifest.mjs --input supplemental.json --live-evidence live.json --build-attestation build.json --runtime-attestation runtime.json --output manifest.json [--axwise-repository /absolute/axwise]'
    );
  }
  const orqalyRepository = await realpath(dirname(dirname(fileURLToPath(import.meta.url))));
  const axwiseRepository = await realpath(axwiseRepositoryInput || gitSourceRoot(orqalyRepository));
  assertCleanReleaseRepositories({ orqalyRepository, axwiseRepository });
  const manifestOutput = resolve(outputPath);
  assertExternalGitOutput(manifestOutput, [orqalyRepository, axwiseRepository]);

  const [inputText, liveText, buildText, runtimeText] = await Promise.all([
    readFile(inputPath, 'utf8'),
    readFile(liveEvidencePath, 'utf8'),
    readFile(buildAttestationPath, 'utf8'),
    readFile(runtimeAttestationPath, 'utf8'),
  ]);
  const input = JSON.parse(inputText);
  const evidenceReports = loadEvidenceReports(collectEvidenceReferences(input));
  const liveEvidence = JSON.parse(liveText);
  const finalArtifactExports = loadFinalArtifactExports({ input, liveEvidence });
  const manifest = buildReleaseManifest({
    input,
    liveEvidence,
    buildAttestation: JSON.parse(buildText),
    runtimeAttestation: JSON.parse(runtimeText),
    orqalyCommit: git(orqalyRepository, ['rev-parse', '--verify', 'HEAD'], execFileSync),
    axwiseCommit: git(axwiseRepository, ['rev-parse', '--verify', 'HEAD'], execFileSync),
    orqalySchema: trackedHeadFile(orqalyRepository, ORQALY_MIGRATION_PATH),
    orqalyAssistantGoalMigration: trackedHeadFile(
      orqalyRepository,
      ORQALY_ASSISTANT_GOAL_MIGRATION_PATH
    ),
    orqalyPersonalTenantJitMigration: trackedHeadFile(
      orqalyRepository,
      ORQALY_PERSONAL_TENANT_JIT_MIGRATION_PATH
    ),
    orqalyAssistantRetryMigration: trackedHeadFile(
      orqalyRepository,
      ORQALY_ASSISTANT_RETRY_MIGRATION_PATH
    ),
    orqalyAssistantEventsMigration: trackedHeadFile(
      orqalyRepository,
      ORQALY_ASSISTANT_EVENTS_MIGRATION_PATH
    ),
    orqalyAssistantTurnProvenanceMigration: trackedHeadFile(
      orqalyRepository,
      ORQALY_ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH
    ),
    orqalyAssistantGroundedSourcesReasonMigration: trackedHeadFile(
      orqalyRepository,
      ORQALY_ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH
    ),
    orqalyBindings: trackedHeadFile(orqalyRepository, ORQALY_BINDINGS_PATH),
    axwiseSchema: trackedHeadFile(axwiseRepository, AXWISE_MIGRATION_PATH),
    axwiseBindings: trackedHeadFile(axwiseRepository, AXWISE_BINDINGS_PATH),
    orqalyServiceBuildConfig: trackedHeadFile(orqalyRepository, ORQALY_SERVICE_BUILD_CONFIG_PATH),
    orqalyWebBuildConfig: trackedHeadFile(orqalyRepository, ORQALY_WEB_BUILD_CONFIG_PATH),
    axwiseBuildConfig: trackedHeadFile(axwiseRepository, AXWISE_BUILD_CONFIG_PATH),
    orqalyRuntimeVerifier: trackedHeadFile(orqalyRepository, ORQALY_RUNTIME_VERIFIER_PATH),
    orqalySourceSnapshotSha256: trackedHeadArchiveSha256(orqalyRepository),
    axwiseSourceSnapshotSha256: trackedHeadArchiveSha256(axwiseRepository),
    evidenceReports,
    finalArtifactExports,
  });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`Wrote create-only Preview release evidence ${manifest.manifestSha256}.\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
