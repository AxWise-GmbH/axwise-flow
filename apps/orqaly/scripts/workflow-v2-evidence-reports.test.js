import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  buildEvidenceReport,
  evidenceCaseContract,
  loadEvidenceReports,
  loadFinalArtifactExports,
} from './workflow-v2-evidence-reports.mjs';

const uuid = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const commits = { orqalyCommit: 'b'.repeat(40), axwiseCommit: 'a'.repeat(40) };
const marker = (component) => ({
  component,
  migrationNumber: 1,
  migrationPath:
    component === 'orqaly'
      ? 'database/workflow-v2/migrations/001_clean_workflow_v2.sql'
      : 'backend/database/workflow_v2/001_cognitive_operations.sql',
  migrationSha256: hash(`${component} migration`),
  bindingsPath:
    component === 'orqaly'
      ? 'infra/gcp/workflow-v2/preview-role-bindings.sql'
      : 'deploy/workflow-v2/preview-role-bindings.sql',
  bindingsSha256: hash(`${component} bindings`),
  sourceCommit: component === 'orqaly' ? commits.orqalyCommit : commits.axwiseCommit,
  additiveMigrations:
    component === 'orqaly'
      ? [
          {
            migrationNumber: 2,
            migrationPath: 'database/workflow-v2/migrations/002_assistant_goal.sql',
            migrationSha256: hash('orqaly additive 002'),
            sourceCommit: commits.orqalyCommit,
          },
          {
            migrationNumber: 3,
            migrationPath: 'database/workflow-v2/migrations/003_personal_tenant_jit.sql',
            migrationSha256: hash('orqaly additive 003'),
            sourceCommit: commits.orqalyCommit,
          },
          {
            migrationNumber: 4,
            migrationPath: 'database/workflow-v2/migrations/004_assistant_retry_lineage.sql',
            migrationSha256: hash('orqaly additive 004'),
            sourceCommit: commits.orqalyCommit,
          },
        ]
      : [],
});

function structuralReport() {
  return buildEvidenceReport({
    generatedAt: '2026-08-27T12:00:00.000Z',
    code: commits,
    releaseMarkers: { orqaly: marker('orqaly'), axwise: marker('axwise') },
    cases: [
      {
        caseId: 'cloudsql.structural_rls',
        ...evidenceCaseContract('cloudsql.structural_rls'),
        passed: true,
        facts: {
          postgresVersion: '17.6',
          structuralTestCount: 27,
          rlsEnabledTableCount: 9,
          tenantCompositeForeignKeyCount: 14,
          crossTenantReadDenied: true,
          crossTenantClaimDenied: true,
          crossTenantReferenceDenied: true,
        },
      },
    ],
  });
}

describe('workflow v2 immutable evidence loaders', () => {
  it('fetches and hashes the exact immutable report generation', () => {
    const bytes = Buffer.from(JSON.stringify(structuralReport()));
    const reference = {
      reportUri:
        'gs://axwise-v2-preview-001-orqaly-v2-preview-001-artifacts/release-evidence/structural.json',
      generation: '7',
      reportSha256: hash(bytes),
      caseId: 'cloudsql.structural_rls',
    };
    const run = vi.fn((_program, args) => (args.includes('describe') ? '7\n' : bytes));
    const reports = loadEvidenceReports([reference], { run });
    expect(reports.get(`${reference.reportUri}#7`).rawSha256).toBe(reference.reportSha256);
    expect(run.mock.calls[1][1]).toContain(`${reference.reportUri}#7`);
  });

  it('rejects a named gate carrying semantically opaque facts', () => {
    expect(() =>
      buildEvidenceReport({
        generatedAt: '2026-08-27T12:00:00.000Z',
        code: commits,
        releaseMarkers: { orqaly: marker('orqaly'), axwise: marker('axwise') },
        cases: [
          {
            caseId: 'fault.expired_or_stale_lease_cannot_finalize',
            ...evidenceCaseContract('fault.expired_or_stale_lease_cannot_finalize'),
            passed: true,
            facts: { foo: 'bar' },
          },
        ],
      })
    ).toThrow(/evidence facts do not satisfy/);
  });

  it('accepts healthy E2E observations with no retries or stale-lease injection', () => {
    expect(() =>
      buildEvidenceReport({
        generatedAt: '2026-08-27T12:00:00.000Z',
        code: commits,
        releaseMarkers: { orqaly: marker('orqaly'), axwise: marker('axwise') },
        cases: [
          {
            caseId: 'e2e.simple.leases',
            ...evidenceCaseContract('e2e.simple.leases'),
            passed: true,
            facts: {
              runId: uuid(1),
              claimedAttemptIds: [uuid(2)],
              staleLeaseFinalizeAttemptCount: 0,
              staleLeaseFinalizeRejectedCount: 0,
              activeLeaseFinalizeCount: 1,
            },
          },
          {
            caseId: 'e2e.simple.retries',
            ...evidenceCaseContract('e2e.simple.retries'),
            passed: true,
            facts: {
              runId: uuid(1),
              retryCount: 0,
              retriedStageIds: [],
              retryAttemptIds: [],
              retryAttemptNumbers: [],
            },
          },
        ],
      })
    ).not.toThrow();
  });

  it('keeps runtime observation counts internally consistent', () => {
    expect(() =>
      buildEvidenceReport({
        generatedAt: '2026-08-27T12:00:00.000Z',
        code: commits,
        releaseMarkers: { orqaly: marker('orqaly'), axwise: marker('axwise') },
        cases: [
          {
            caseId: 'e2e.advanced.retries',
            ...evidenceCaseContract('e2e.advanced.retries'),
            passed: true,
            facts: {
              runId: uuid(1),
              retryCount: 0,
              retriedStageIds: [uuid(2)],
              retryAttemptIds: [],
              retryAttemptNumbers: [],
            },
          },
        ],
      })
    ).toThrow(/evidence facts contradict/);

    expect(() =>
      buildEvidenceReport({
        generatedAt: '2026-08-27T12:00:00.000Z',
        code: commits,
        releaseMarkers: { orqaly: marker('orqaly'), axwise: marker('axwise') },
        cases: [
          {
            caseId: 'e2e.advanced.leases',
            ...evidenceCaseContract('e2e.advanced.leases'),
            passed: true,
            facts: {
              runId: uuid(1),
              claimedAttemptIds: [uuid(2)],
              staleLeaseFinalizeAttemptCount: 1,
              staleLeaseFinalizeRejectedCount: 0,
              activeLeaseFinalizeCount: 1,
            },
          },
        ],
      })
    ).toThrow(/evidence facts contradict/);
  });

  it('still requires typed retry and stale-lease fault outcomes', () => {
    expect(() =>
      buildEvidenceReport({
        generatedAt: '2026-08-27T12:00:00.000Z',
        code: commits,
        releaseMarkers: { orqaly: marker('orqaly'), axwise: marker('axwise') },
        cases: [
          {
            caseId: 'fault.axwise_500_attempt_n_plus_1_same_stage',
            ...evidenceCaseContract('fault.axwise_500_attempt_n_plus_1_same_stage'),
            passed: true,
            facts: {
              stageId: uuid(10),
              failedAttemptId: uuid(11),
              retryAttemptId: uuid(12),
              attemptNumbers: [1, 2],
              operationIdsDistinct: true,
            },
          },
          {
            caseId: 'fault.expired_or_stale_lease_cannot_finalize',
            ...evidenceCaseContract('fault.expired_or_stale_lease_cannot_finalize'),
            passed: true,
            facts: {
              attemptId: uuid(13),
              staleLeaseTokenHash: hash('stale'),
              activeLeaseTokenHash: hash('active'),
              finalizeRejected: true,
            },
          },
        ],
      })
    ).not.toThrow();
  });

  it('requires the canonical object path and exact DB Markdown bytes', () => {
    const markdown = '# Verified final\n';
    const tenantId = uuid(1);
    const runId = uuid(2);
    const artifactId = uuid(3);
    const artifactHash = hash('artifact content identity');
    const uri =
      `gs://axwise-v2-preview-001-orqaly-v2-preview-001-artifacts/tenants/${tenantId}` +
      `/runs/${runId}/artifacts/${artifactId}/${artifactHash}.md`;
    const input = {
      e2e: {
        simple: {
          gcsExport: {
            uri,
            generation: '9',
            artifactContentHash: artifactHash,
            rawSha256: hash(markdown),
          },
        },
        advanced: {
          gcsExport: {
            uri: uri.replace(runId, uuid(4)),
            generation: '10',
            artifactContentHash: artifactHash,
            rawSha256: hash(markdown),
          },
        },
      },
    };
    const liveEvidence = {
      e2e: {
        simple: { tenantId, runId, finalArtifact: { artifactId, artifactHash, markdown } },
        advanced: {
          tenantId,
          runId: uuid(4),
          finalArtifact: { artifactId, artifactHash, markdown },
        },
      },
    };
    const run = vi.fn((_program, args) => {
      if (args.includes('describe'))
        return args.some((arg) => String(arg).endsWith('#9')) ? '9\n' : '10\n';
      return Buffer.from(markdown);
    });
    expect(loadFinalArtifactExports({ input, liveEvidence, run }).size).toBe(2);

    const wrongBytes = vi.fn((_program, args) =>
      args.includes('describe') ? '9\n' : Buffer.from('# Other\n')
    );
    expect(() =>
      loadFinalArtifactExports({
        input: { e2e: { simple: input.e2e.simple, advanced: input.e2e.simple } },
        liveEvidence: {
          e2e: { simple: liveEvidence.e2e.simple, advanced: liveEvidence.e2e.simple },
        },
        run: wrongBytes,
      })
    ).toThrow(/raw SHA-256/);
  });
});
