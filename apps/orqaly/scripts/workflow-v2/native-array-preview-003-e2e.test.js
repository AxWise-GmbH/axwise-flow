// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ARRAY_003, validateArray003 } from '../native-array-preview-003-e2e.mjs';
import { createBoundedHttpPolicy } from '../../server/workflow-v2/native-workflow-review.js';
import { normalizeNativeWorkflow } from '../../server/workflow-v2/native-workflow-runtime-contract.js';
import { canonicalJsonSha256 } from '../../services/agentic-control-plane/src/domain/canonical.js';

describe('fixed synthetic array acceptance on003', () => {
  const binding = () => ({
    id: ARRAY_003.environmentId,
    origin: ARRAY_003.origin,
    useIdToken: true,
    tenantId: '00000000-0000-4000-8000-000000000001',
    userId: 'user_syntheticOwner',
    nativePolicy: createBoundedHttpPolicy({ imageDigest: ARRAY_003.imageDigest }),
  });
  const fixture = () =>
    readFile(
      new URL(`../../server/workflow-v2/fixtures/${ARRAY_003.fixture}`, import.meta.url),
      'utf8'
    );
  it('accepts only the exact recorded graph and frozen three cases', async () => {
    const artifact = validateArray003({ binding: binding(), text: await fixture() });
    expect(artifact.spec.acceptanceCases).toHaveLength(3);
    expect(artifact.workflowHash).toBe(ARRAY_003.workflowHash);
  });
  it('rejects substituted environment, origin, identity mode, image, or modified fixture bytes', async () => {
    const text = await fixture();
    for (const mutation of [
      { id: 'orqaly-customer-webhook-preview-002' },
      { origin: 'https://other.example.test' },
      { useIdToken: false },
      { nativePolicy: createBoundedHttpPolicy({ imageDigest: `sha256:${'a'.repeat(64)}` }) },
    ])
      expect(() => validateArray003({ binding: { ...binding(), ...mutation }, text })).toThrow();
    expect(() => validateArray003({ binding: binding(), text: `${text}\n` })).toThrow();
  });
  it('keeps recorded GCP receipts consistent with the unchanged graph and original cases', async () => {
    const artifact = validateArray003({ binding: binding(), text: await fixture() });
    const evidence = JSON.parse(
      await readFile(
        new URL(
          '../../server/workflow-v2/fixtures/native-model-array-repaired-gcp003-runtime-2026-09-06.json',
          import.meta.url
        ),
        'utf8'
      )
    );
    expect(evidence.sourceWorkflowHash).toBe(ARRAY_003.workflowHash);
    expect(evidence.sourceFixtureHash).toBe(ARRAY_003.fixtureHash);
    expect(evidence.imageDigest).toBe(ARRAY_003.imageDigest);
    expect(evidence.receipts).toHaveLength(3);
    for (const [index, receipt] of evidence.receipts.entries()) {
      const acceptance = artifact.spec.acceptanceCases[index];
      expect(receipt.caseId).toBe(acceptance.id);
      expect(receipt.input).toEqual(acceptance.input);
      expect(receipt.output).toEqual(acceptance.expectedOutput);
      expect(receipt.outputHash).toBe(canonicalJsonSha256(receipt.output));
      expect(receipt.testArtifactHash).toBe(
        normalizeNativeWorkflow({
          workflow: artifact.workflow,
          id: receipt.testId,
          controlledTest: true,
        }).workflowHash
      );
      expect(receipt).toMatchObject({
        status: 'succeeded',
        cleanup: 'removed',
        passed: true,
        responseStatus: 200,
        executionId: String(index + 1),
      });
    }
  });
});
