import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  CommitSchema,
  ImmutableEvidenceReferenceSchema,
  Sha256Schema,
} from './workflow-v2-release-attestations.mjs';
import { ReleaseMarkerSchema } from './workflow-v2-live-evidence.mjs';
import { canonicalJson } from '../lib/workflow-v2/canonical.js';

const FactValueSchema = z.union([
  z.boolean(),
  z.number().int(),
  z.string().min(1).max(1000),
  z.array(z.string().min(1).max(500)).max(100),
  z.array(z.number().int()).max(100),
]);

const UuidSchema = z.string().uuid();
const PositiveInt = z.number().int().positive();
const NonNegativeInt = z.number().int().nonnegative();
const StrictFacts = (shape) => z.object(shape).strict();
const CASE_CONTRACTS = new Map();

function defineCase(caseId, kind, invariant, facts) {
  CASE_CONTRACTS.set(caseId, { kind, invariants: [invariant], facts: StrictFacts(facts) });
}

defineCase(
  'identity.clerk_preview_instance',
  'runtime_observation',
  'authenticated_clerk_instance_observed',
  {
    clerkIssuer: z.string().url(),
    instanceFingerprint: Sha256Schema,
    authenticatedUserId: z.string().regex(/^user_[A-Za-z0-9]+$/),
    authenticatedTenantId: UuidSchema,
  }
);
defineCase(
  'cloudsql.structural_rls',
  'database_verification',
  'rls_and_composite_tenant_boundaries_verified',
  {
    postgresVersion: z.string().min(1).max(100),
    structuralTestCount: PositiveInt,
    rlsEnabledTableCount: PositiveInt,
    tenantCompositeForeignKeyCount: PositiveInt,
    crossTenantReadDenied: z.literal(true),
    crossTenantClaimDenied: z.literal(true),
    crossTenantReferenceDenied: z.literal(true),
  }
);

for (const mode of ['simple', 'advanced']) {
  defineCase(
    `e2e.${mode}.correlated_logs`,
    'runtime_observation',
    'cross_service_trace_correlation_verified',
    {
      runId: UuidSchema,
      traceId: z.string().min(8).max(256),
      orqalyLogEntryCount: PositiveInt,
      axwiseLogEntryCount: PositiveInt,
      terminalEventObserved: z.literal(true),
    }
  );
  defineCase(
    `e2e.${mode}.leases`,
    'runtime_observation',
    'lease_claim_and_finalize_ownership_verified',
    {
      runId: UuidSchema,
      claimedAttemptIds: z.array(UuidSchema).min(1).max(100),
      staleLeaseFinalizeAttemptCount: NonNegativeInt,
      staleLeaseFinalizeRejectedCount: NonNegativeInt,
      activeLeaseFinalizeCount: PositiveInt,
    }
  );
  defineCase(
    `e2e.${mode}.retries`,
    'runtime_observation',
    'runtime_retry_attempts_observed',
    {
      runId: UuidSchema,
      retryCount: NonNegativeInt,
      retriedStageIds: z.array(UuidSchema).max(100),
      retryAttemptIds: z.array(UuidSchema).max(100),
      retryAttemptNumbers: z.array(z.number().int().min(2)).max(100),
    }
  );
  defineCase(
    `e2e.${mode}.tenant_boundary`,
    'runtime_observation',
    'cross_tenant_access_denied',
    {
      runId: UuidSchema,
      tenantAId: UuidSchema,
      tenantBId: UuidSchema,
      readDenied: z.literal(true),
      claimDenied: z.literal(true),
      referenceDenied: z.literal(true),
    }
  );
}

defineCase(
  'fault.axwise_500_attempt_n_plus_1_same_stage',
  'fault_gate',
  'terminal_failure_creates_next_attempt_same_stage',
  {
    stageId: UuidSchema,
    failedAttemptId: UuidSchema,
    retryAttemptId: UuidSchema,
    attemptNumbers: z.tuple([z.literal(1), z.literal(2)]),
    operationIdsDistinct: z.literal(true),
  }
);
defineCase(
  'fault.poll_202_no_new_attempt_or_job',
  'fault_gate',
  'polling_preserves_operation_and_attempt_identity',
  {
    operationId: UuidSchema,
    pollCount: PositiveInt,
    attemptRowsBefore: PositiveInt,
    attemptRowsAfter: PositiveInt,
    operationRowsBefore: PositiveInt,
    operationRowsAfter: PositiveInt,
  }
);
defineCase(
  'fault.lost_post_or_completion_adopts_same_result',
  'fault_gate',
  'lost_responses_adopt_one_immutable_result',
  {
    operationId: UuidSchema,
    resultArtifactId: UuidSchema,
    resultArtifactHash: Sha256Schema,
    dispatchCount: z.number().int().min(2),
    immutableResultCount: z.literal(1),
  }
);
defineCase(
  'fault.deployment_rotation_preserves_durable_identity',
  'fault_gate',
  'deployment_rotation_changes_only_trace_metadata',
  {
    runId: UuidSchema,
    stageId: UuidSchema,
    attemptId: UuidSchema,
    operationId: UuidSchema,
    deploymentIds: z.array(z.string().min(2).max(200)).min(2).max(20),
    durableIdentityPreserved: z.literal(true),
  }
);
defineCase(
  'fault.expired_or_stale_lease_cannot_finalize',
  'fault_gate',
  'stale_lease_finalize_is_rejected',
  {
    attemptId: UuidSchema,
    staleLeaseTokenHash: Sha256Schema,
    activeLeaseTokenHash: Sha256Schema,
    finalizeRejected: z.literal(true),
  }
);
defineCase(
  'fault.duplicate_approval_is_idempotent',
  'fault_gate',
  'duplicate_approval_commits_once',
  {
    approvalId: UuidSchema,
    clickCount: z.number().int().min(2),
    approvalRowCount: z.literal(1),
    approvalEventCount: z.literal(1),
    downstreamOutboxCount: z.literal(1),
  }
);
defineCase(
  'fault.cross_tenant_read_claim_reference_denied',
  'fault_gate',
  'cross_tenant_read_claim_reference_all_denied',
  {
    tenantAId: UuidSchema,
    tenantBId: UuidSchema,
    readDenied: z.literal(true),
    claimDenied: z.literal(true),
    referenceDenied: z.literal(true),
  }
);
defineCase(
  'fault.optional_gaps_complete_without_launch_ready_claim',
  'fault_gate',
  'optional_gaps_complete_without_launch_ready',
  {
    runId: UuidSchema,
    terminalStatus: z.literal('completed_with_evidence_gaps'),
    evidenceReadiness: z.literal('ready_with_gaps'),
    launchReady: z.literal(false),
    finalMarkdownHash: Sha256Schema,
  }
);
defineCase(
  'fault.essential_legal_or_safety_gap_blocks',
  'fault_gate',
  'essential_legal_or_safety_gap_blocks_completion',
  {
    runId: UuidSchema,
    evidenceReadiness: z.literal('blocked'),
    terminalStatus: z.literal('blocked'),
    finalArtifactCount: z.literal(0),
    blockingRequirementIds: z.array(z.string().min(1).max(200)).min(1).max(100),
  }
);
defineCase(
  'fault.outbox_replay_does_not_duplicate_downstream_work',
  'fault_gate',
  'outbox_replay_preserves_one_downstream_identity',
  {
    outboxEventId: UuidSchema,
    replayCount: z.number().int().min(2),
    downstreamOperationId: UuidSchema,
    downstreamWorkCount: z.literal(1),
  }
);
defineCase(
  'fault.tenant_agent_filter_precedes_rank_and_limit',
  'fault_gate',
  'tenant_agent_filter_precedes_ranking',
  {
    tenantAId: UuidSchema,
    tenantBId: UuidSchema,
    tenantCandidateCount: PositiveInt,
    rankedCandidateCount: PositiveInt,
    crossTenantCandidateCount: z.literal(0),
    selectedAgentTenantId: UuidSchema,
  }
);

export const EvidenceCaseSchema = z
  .object({
    caseId: z.string().regex(/^[a-z0-9][a-z0-9_.:-]{2,199}$/),
    kind: z.enum(['fault_gate', 'runtime_observation', 'database_verification']),
    passed: z.literal(true),
    invariants: z
      .array(z.string().regex(/^[a-z0-9][a-z0-9_.:-]{2,199}$/))
      .min(1)
      .max(100),
    facts: z.record(z.string().regex(/^[a-z][a-zA-Z0-9]{1,99}$/), FactValueSchema),
  })
  .strict()
  .superRefine((evidenceCase, context) => {
    if (
      new Set(evidenceCase.invariants).size !== evidenceCase.invariants.length ||
      canonicalJson(evidenceCase.invariants) !== canonicalJson([...evidenceCase.invariants].sort())
    ) {
      context.addIssue({
        code: 'custom',
        path: ['invariants'],
        message: 'evidence invariants must be sorted and unique',
      });
    }
    if (Object.keys(evidenceCase.facts).length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['facts'],
        message: 'evidence cases require typed observed facts',
      });
    }
    const contract = CASE_CONTRACTS.get(evidenceCase.caseId);
    if (!contract) {
      context.addIssue({
        code: 'custom',
        path: ['caseId'],
        message: 'unknown Preview release evidence case',
      });
      return;
    }
    if (evidenceCase.kind !== contract.kind) {
      context.addIssue({ code: 'custom', path: ['kind'], message: 'wrong evidence case kind' });
    }
    if (canonicalJson(evidenceCase.invariants) !== canonicalJson(contract.invariants)) {
      context.addIssue({
        code: 'custom',
        path: ['invariants'],
        message: 'evidence case does not declare its exact required invariant',
      });
    }
    const facts = contract.facts.safeParse(evidenceCase.facts);
    if (!facts.success) {
      context.addIssue({
        code: 'custom',
        path: ['facts'],
        message: `evidence facts do not satisfy ${evidenceCase.caseId}: ${facts.error.message}`,
      });
      return;
    }
    const observed = facts.data;
    const semanticFailure = (() => {
      if (evidenceCase.caseId.endsWith('.leases')) {
        return new Set(observed.claimedAttemptIds).size !== observed.claimedAttemptIds.length ||
          observed.staleLeaseFinalizeRejectedCount !== observed.staleLeaseFinalizeAttemptCount;
      }
      if (evidenceCase.caseId.endsWith('.retries')) {
        return observed.retriedStageIds.length !== observed.retryCount ||
          observed.retryAttemptIds.length !== observed.retryCount ||
          observed.retryAttemptNumbers.length !== observed.retryCount ||
          new Set(observed.retryAttemptIds).size !== observed.retryAttemptIds.length;
      }
      if (evidenceCase.caseId === 'fault.axwise_500_attempt_n_plus_1_same_stage') {
        return observed.failedAttemptId === observed.retryAttemptId;
      }
      if (evidenceCase.caseId === 'fault.poll_202_no_new_attempt_or_job') {
        return observed.attemptRowsBefore !== observed.attemptRowsAfter ||
          observed.operationRowsBefore !== observed.operationRowsAfter;
      }
      if (evidenceCase.caseId === 'fault.deployment_rotation_preserves_durable_identity') {
        return new Set(observed.deploymentIds).size < 2;
      }
      if (evidenceCase.caseId === 'fault.expired_or_stale_lease_cannot_finalize') {
        return observed.staleLeaseTokenHash === observed.activeLeaseTokenHash;
      }
      if (
        evidenceCase.caseId.endsWith('.tenant_boundary') ||
        evidenceCase.caseId === 'fault.cross_tenant_read_claim_reference_denied'
      ) {
        return observed.tenantAId === observed.tenantBId;
      }
      if (evidenceCase.caseId === 'fault.tenant_agent_filter_precedes_rank_and_limit') {
        return observed.tenantAId === observed.tenantBId ||
          observed.selectedAgentTenantId !== observed.tenantAId ||
          observed.rankedCandidateCount > observed.tenantCandidateCount;
      }
      return false;
    })();
    if (semanticFailure) {
      context.addIssue({
        code: 'custom',
        path: ['facts'],
        message: `evidence facts contradict ${evidenceCase.caseId}`,
      });
    }
  });

export function evidenceCaseContract(caseId) {
  const contract = CASE_CONTRACTS.get(caseId);
  if (!contract) throw new Error(`unknown Preview release evidence case ${caseId}`);
  return { kind: contract.kind, invariants: [...contract.invariants] };
}

export const EvidenceReportSchema = z
  .object({
    schemaVersion: z.literal('orqaly.preview-gate-report.v1'),
    environment: z.literal('preview'),
    generatedAt: z.string().datetime(),
    code: z
      .object({ orqalyCommit: CommitSchema, axwiseCommit: CommitSchema })
      .strict(),
    releaseMarkers: z
      .object({
        orqaly: ReleaseMarkerSchema.extend({ component: z.literal('orqaly') }),
        axwise: ReleaseMarkerSchema.extend({ component: z.literal('axwise') }),
      })
      .strict(),
    cases: z.array(EvidenceCaseSchema).min(1).max(200),
  })
  .strict()
  .superRefine((report, context) => {
    const caseIds = report.cases.map((item) => item.caseId);
    if (
      new Set(caseIds).size !== caseIds.length ||
      canonicalJson(caseIds) !== canonicalJson([...caseIds].sort())
    ) {
      context.addIssue({
        code: 'custom',
        path: ['cases'],
        message: 'report cases must be sorted and unique by caseId',
      });
    }
  });

export const FinalArtifactExportReferenceSchema = z
  .object({
    uri: z
      .string()
      .regex(
        /^gs:\/\/axwise-v2-preview-001-orqaly-v2-preview-001-artifacts\/tenants\/[a-f0-9-]{36}\/runs\/[a-f0-9-]{36}\/artifacts\/[a-f0-9-]{36}\/[a-f0-9]{64}\.md$/
      ),
    generation: z.string().regex(/^[1-9][0-9]*$/),
    artifactContentHash: Sha256Schema,
    rawSha256: Sha256Schema,
  })
  .strict();

function referenceKey(reference) {
  return `${reference.reportUri}#${reference.generation}`;
}

export function collectEvidenceReferences(input) {
  const references = [input.clerk.verification, input.cloudSql.structuralVerification];
  for (const mode of ['simple', 'advanced']) {
    references.push(...Object.values(input.e2e[mode].observability));
  }
  for (const fault of Object.values(input.faultGates)) references.push(fault.evidence);
  return references.filter((reference) => typeof reference === 'object' && reference?.reportUri);
}

export function loadEvidenceReports(references, { run = execFileSync } = {}) {
  const reports = new Map();
  for (const rawReference of references) {
    const reference = ImmutableEvidenceReferenceSchema.parse(rawReference);
    const key = referenceKey(reference);
    if (reports.has(key)) {
      if (reports.get(key).rawSha256 !== reference.reportSha256) {
        throw new Error(`evidence report ${key} is referenced with conflicting hashes`);
      }
      continue;
    }
    const versionedUri = `${reference.reportUri}#${reference.generation}`;
    const metadataGeneration = run(
      'gcloud',
      [
        'storage', 'objects', 'describe', versionedUri,
        '--project=axwise-v2-preview-001', '--format=value(generation)',
      ],
      { encoding: 'utf8' }
    ).trim();
    if (metadataGeneration !== reference.generation) {
      throw new Error(`GCS returned the wrong generation for ${reference.reportUri}`);
    }
    const bytes = run(
      'gcloud',
      ['storage', 'cat', versionedUri, '--project=axwise-v2-preview-001'],
      { encoding: null, maxBuffer: 32 * 1024 * 1024 }
    );
    const rawSha256 = createHash('sha256').update(bytes).digest('hex');
    if (rawSha256 !== reference.reportSha256) {
      throw new Error(`GCS evidence bytes do not match ${reference.reportSha256}`);
    }
    let document;
    try {
      document = EvidenceReportSchema.parse(JSON.parse(bytes.toString('utf8')));
    } catch (error) {
      throw new Error(`invalid typed evidence report ${key}: ${error.message}`);
    }
    reports.set(key, {
      reportUri: reference.reportUri,
      generation: reference.generation,
      rawSha256,
      document,
    });
  }
  return reports;
}

export function assertEvidenceCase({
  reference: rawReference,
  reports,
  expectedCaseId,
  expectedKind,
  code,
  releaseMarkers,
}) {
  const reference = ImmutableEvidenceReferenceSchema.parse(rawReference);
  if (reference.caseId !== expectedCaseId) {
    throw new Error(`evidence case ${reference.caseId} does not match ${expectedCaseId}`);
  }
  const report = reports.get(referenceKey(reference));
  if (!report || report.rawSha256 !== reference.reportSha256) {
    throw new Error(`evidence report ${referenceKey(reference)} was not fetched and hash-verified`);
  }
  const document = EvidenceReportSchema.parse(report.document);
  if (
    canonicalJson(document.code) !== canonicalJson(code) ||
    canonicalJson(document.releaseMarkers) !== canonicalJson(releaseMarkers)
  ) {
    throw new Error(`evidence report ${referenceKey(reference)} targets another release`);
  }
  const evidenceCase = document.cases.find((item) => item.caseId === expectedCaseId);
  if (!evidenceCase || evidenceCase.kind !== expectedKind || evidenceCase.passed !== true) {
    throw new Error(`evidence report does not contain passing typed case ${expectedCaseId}`);
  }
  return evidenceCase;
}

export function evidenceReportSummaries(reports) {
  return [...reports.values()]
    .map((report) => ({
      reportUri: report.reportUri,
      generation: report.generation,
      rawSha256: Sha256Schema.parse(report.rawSha256),
      schemaVersion: report.document.schemaVersion,
      caseIds: report.document.cases.map((item) => item.caseId),
    }))
    .sort((left, right) => referenceKey(left).localeCompare(referenceKey(right)));
}

export function loadFinalArtifactExports({ input, liveEvidence, run = execFileSync }) {
  const exportsByMode = new Map();
  for (const mode of ['simple', 'advanced']) {
    const reference = FinalArtifactExportReferenceSchema.parse(input.e2e[mode].gcsExport);
    const databaseArtifact = liveEvidence.e2e[mode].finalArtifact;
    const expectedUri =
      `gs://axwise-v2-preview-001-orqaly-v2-preview-001-artifacts/tenants/${liveEvidence.e2e[mode].tenantId}` +
      `/runs/${liveEvidence.e2e[mode].runId}/artifacts/${databaseArtifact.artifactId}` +
      `/${databaseArtifact.artifactHash}.md`;
    if (reference.uri !== expectedUri) {
      throw new Error(`${mode} GCS export URI is not the canonical tenant/run/artifact object name`);
    }
    if (reference.artifactContentHash !== databaseArtifact.artifactHash) {
      throw new Error(`${mode} GCS export does not bind the DB-authoritative artifact hash`);
    }
    const versionedUri = `${reference.uri}#${reference.generation}`;
    const metadataGeneration = run(
      'gcloud',
      [
        'storage', 'objects', 'describe', versionedUri,
        '--project=axwise-v2-preview-001', '--format=value(generation)',
      ],
      { encoding: 'utf8' }
    ).trim();
    if (metadataGeneration !== reference.generation) {
      throw new Error(`GCS returned the wrong generation for the ${mode} final artifact`);
    }
    const bytes = run(
      'gcloud',
      ['storage', 'cat', versionedUri, '--project=axwise-v2-preview-001'],
      { encoding: null, maxBuffer: 128 * 1024 * 1024 }
    );
    const rawSha256 = createHash('sha256').update(bytes).digest('hex');
    if (rawSha256 !== reference.rawSha256) {
      throw new Error(`${mode} GCS final artifact bytes do not match the declared raw SHA-256`);
    }
    const expectedBytes = Buffer.from(databaseArtifact.markdown, 'utf8');
    if (!Buffer.isBuffer(bytes) || !bytes.equals(expectedBytes)) {
      throw new Error(`${mode} GCS final artifact bytes differ from the immutable DB Markdown`);
    }
    exportsByMode.set(mode, {
      ...reference,
      rawSha256,
      byteLength: bytes.length,
      exactDatabaseMarkdown: true,
    });
  }
  return exportsByMode;
}

export function assertFinalArtifactExport({ mode, reference: rawReference, exportsByMode }) {
  const reference = FinalArtifactExportReferenceSchema.parse(rawReference);
  const verified = exportsByMode?.get(mode);
  if (
    !verified ||
    canonicalJson(reference) !== canonicalJson({
      uri: verified.uri,
      generation: verified.generation,
      artifactContentHash: verified.artifactContentHash,
      rawSha256: verified.rawSha256,
    }) ||
    verified.exactDatabaseMarkdown !== true ||
    !Number.isInteger(verified.byteLength) ||
    verified.byteLength < 1
  ) {
    throw new Error(`${mode} GCS final artifact was not exact-generation byte-verified`);
  }
  return verified;
}

export function buildEvidenceReport({ code, releaseMarkers, cases, generatedAt = new Date().toISOString() }) {
  return EvidenceReportSchema.parse({
    schemaVersion: 'orqaly.preview-gate-report.v1',
    environment: 'preview',
    generatedAt,
    code,
    releaseMarkers,
    cases: [...cases].sort((left, right) => left.caseId.localeCompare(right.caseId)),
  });
}

export function uploadEvidenceReport({ reportPath, destination, run = execFileSync }) {
  if (
    !/^gs:\/\/axwise-v2-preview-001-orqaly-v2-preview-001-artifacts\/release-evidence\/[A-Za-z0-9._/-]+\.json$/.test(
      destination
    )
  ) {
    throw new Error('evidence report destination is outside the immutable Preview evidence prefix');
  }
  const bytes = readFileSync(reportPath);
  const report = EvidenceReportSchema.parse(JSON.parse(bytes.toString('utf8')));
  run(
    'gcloud',
    [
      'storage', 'cp', reportPath, destination,
      '--if-generation-match=0', '--content-type=application/json', '--project=axwise-v2-preview-001',
    ],
    { encoding: 'utf8' }
  );
  const generation = run(
    'gcloud',
    ['storage', 'objects', 'describe', destination, '--format=value(generation)', '--project=axwise-v2-preview-001'],
    { encoding: 'utf8' }
  ).trim();
  if (!/^[1-9][0-9]*$/.test(generation)) throw new Error('GCS did not return an immutable generation');
  const uploaded = run(
    'gcloud',
    ['storage', 'cat', `${destination}#${generation}`, '--project=axwise-v2-preview-001'],
    { encoding: null, maxBuffer: 32 * 1024 * 1024 }
  );
  if (!Buffer.isBuffer(uploaded) || !uploaded.equals(bytes)) {
    throw new Error('uploaded evidence report bytes differ from the create-only local report');
  }
  const reportSha256 = createHash('sha256').update(uploaded).digest('hex');
  return {
    schemaVersion: 'orqaly.preview-gate-report-reference.v1',
    reportUri: destination,
    generation,
    reportSha256,
    references: report.cases.map(({ caseId }) => ({
      reportUri: destination,
      generation,
      reportSha256,
      caseId,
    })),
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  const mode = process.argv[2];
  const inputPath = argument('--input');
  const outputPath = argument('--output');
  if (mode === 'create') {
    if (!inputPath || !outputPath) {
      throw new Error('usage: workflow-v2-evidence-reports.mjs create --input cases.json --output report.json');
    }
    const input = JSON.parse(await readFile(inputPath, 'utf8'));
    const report = buildEvidenceReport(input);
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`Wrote create-only typed evidence report with ${report.cases.length} cases.\n`);
    return;
  }
  if (mode === 'upload') {
    const destination = argument('--destination');
    if (!inputPath || !outputPath || !destination) {
      throw new Error(
        'usage: workflow-v2-evidence-reports.mjs upload --input report.json --destination gs://.../report.json --output references.json'
      );
    }
    const reference = uploadEvidenceReport({ reportPath: inputPath, destination });
    await writeFile(outputPath, `${JSON.stringify(reference, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`Uploaded and byte-verified create-only generation ${reference.generation}.\n`);
    return;
  }
  throw new Error('usage: workflow-v2-evidence-reports.mjs <create|upload> ...');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
