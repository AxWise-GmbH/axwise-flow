// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { failureProbeReceiptMatches } from './solution-failure-probe-service.js';
import { createNativeFailureProbeArtifact } from './native-failure-probe.js';
import { nativeOwnedErrorFixture } from './fixtures/native-owned-error.js';
import { materializeNativeBundle, nativeBundleMembers } from './native-workflow-bundle.js';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';

function fixture() {
  const source = nativeOwnedErrorFixture(randomUUID());
  const id = randomUUID();
  const source_snapshot = { ...source, sourceVersion: 2 };
  const value = {
    id,
    source_snapshot,
    source_version: 2,
    workflow_hash: source.workflowHash,
    bundle_hash: source.bundleHash,
    dependency_id: 'failure-handler',
  };
  const artifact = createNativeFailureProbeArtifact({
    ...source_snapshot,
    probeId: id,
    invocationId: id,
    allowExternalEffects: false,
  });
  const child = nativeBundleMembers(artifact)[1];
  const pin = {
    dependencyId: child.dependencyId,
    workflowId: 'actual-child',
    versionId: 'actual-version',
    workflowHash: hash(child.workflow),
    specHash: hash(child.spec),
  };
  const result = {
    ...artifact.source,
    kind: 'handler_with_synthetic_failure',
    coverage: 'handler_with_synthetic_failure',
    status: 'succeeded',
    externalEffects: false,
    testArtifactHash: artifact.workflowHash,
    testBundleHash: artifact.bundleHash,
    materializedWorkflowHash: materializeNativeBundle(artifact, [pin]).workflowHash,
    mainExecution: { status: 'failed', executionId: '101' },
    ownedDependencies: [
      { ...pin, status: 'succeeded', executionId: '102', parentExecutionId: '101' },
    ],
    cleanup: { status: 'removed' },
  };
  return { value, result };
}

describe('failure probe receipt artifact and execution boundaries', () => {
  it('accepts a complete exact-source, exact-derived-artifact, linked execution proof', () => {
    const { value, result } = fixture();
    expect(failureProbeReceiptMatches(result, value)).toBe(true);
  });
  it.each([
    [
      'minimal fabricated success',
      (r) => {
        delete r.testArtifactHash;
        delete r.testBundleHash;
      },
    ],
    [
      'source child substituted',
      (r) => {
        r.sourceChildWorkflowHash = 'a'.repeat(64);
      },
    ],
    [
      'derived main substituted',
      (r) => {
        r.testArtifactHash = 'a'.repeat(64);
      },
    ],
    [
      'derived child substituted',
      (r) => {
        r.ownedDependencies[0].workflowHash = 'a'.repeat(64);
      },
    ],
    [
      'child requirements substituted',
      (r) => {
        r.ownedDependencies[0].specHash = 'a'.repeat(64);
      },
    ],
    [
      'provider workflow substituted',
      (r) => {
        r.ownedDependencies[0].workflowId = 'different-workflow';
      },
    ],
    [
      'invalid provider version',
      (r) => {
        r.ownedDependencies[0].versionId = '../other';
      },
    ],
    [
      'child execution is parent',
      (r) => {
        r.ownedDependencies[0].executionId = r.mainExecution.executionId;
      },
    ],
    [
      'wrong parent execution',
      (r) => {
        r.ownedDependencies[0].parentExecutionId = '103';
      },
    ],
    [
      'main never failed',
      (r) => {
        r.mainExecution.status = 'succeeded';
      },
    ],
    [
      'handler never completed',
      (r) => {
        r.ownedDependencies[0].status = 'outcome_unknown';
      },
    ],
    [
      'cleanup pending',
      (r) => {
        r.cleanup.status = 'pending';
      },
    ],
    [
      'unapproved effects',
      (r) => {
        r.externalEffects = true;
      },
    ],
    [
      'wiring-only substitution',
      (r) => {
        r.coverage = 'wiring_only';
      },
    ],
  ])('rejects %s', (_name, change) => {
    const { value, result } = fixture();
    change(result);
    expect(failureProbeReceiptMatches(result, value)).toBe(false);
  });
  it('accepts cleanup-only unknown evidence but never promotes it to success', () => {
    const { value, result } = fixture();
    result.status = 'outcome_unknown';
    result.mainExecution = { status: 'outcome_unknown', executionId: null };
    result.ownedDependencies = [];
    delete result.materializedWorkflowHash;
    expect(failureProbeReceiptMatches(result, value)).toBe(true);
    result.status = 'succeeded';
    expect(failureProbeReceiptMatches(result, value)).toBe(false);
    result.status = 'failed';
    expect(failureProbeReceiptMatches(result, value)).toBe(false);
  });
  it('requires an actual terminal handler failure for a failed probe', () => {
    const { value, result } = fixture();
    result.status = 'failed';
    result.ownedDependencies[0].status = 'failed';
    expect(failureProbeReceiptMatches(result, value)).toBe(true);
    result.ownedDependencies[0].status = 'outcome_unknown';
    expect(failureProbeReceiptMatches(result, value)).toBe(false);
    result.ownedDependencies[0].status = 'failed';
    result.cleanup.status = 'pending';
    expect(failureProbeReceiptMatches(result, value)).toBe(false);
  });
  it('accepts verified main success as failed synthetic-failure coverage, not handler success', () => {
    const { value, result } = fixture();
    result.status = 'failed';
    result.mainExecution.status = 'succeeded';
    result.ownedDependencies[0].status = 'not_triggered';
    result.ownedDependencies[0].executionId = null;
    expect(failureProbeReceiptMatches(result, value)).toBe(true);
    result.mainExecution.status = 'outcome_unknown';
    expect(failureProbeReceiptMatches(result, value)).toBe(false);
  });
  it('rejects a stored snapshot inconsistent with its immutable source columns', () => {
    const { value, result } = fixture();
    value.source_snapshot.sourceVersion = 4;
    expect(failureProbeReceiptMatches(result, value)).toBe(false);
  });
});
