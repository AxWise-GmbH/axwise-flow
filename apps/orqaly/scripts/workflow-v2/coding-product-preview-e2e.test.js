// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { CODING_PREVIEW, codingPreviewProposal, codingPreviewScope, validateCodingPreviewSource,
  validateCodingPreviewBinding, validateCodingPreviewDeployment, assertCodingPreviewTransport } from '../coding-product-preview-e2e.mjs';
import { createBoundedHttpPolicy } from '../../server/workflow-v2/native-workflow-review.js';
import { prepareCodingSpec, codingHash } from '../../server/workflow-v2/coding-worker-contracts.js';
import { cloudRunCodingDescriptor } from '../../server/workflow-v2/coding-worker-cloud-run.js';

const fixed = CODING_PREVIEW;
const source = () => ({ tenant_id: fixed.tenantId, owner_user_id: fixed.userId, solution_id: fixed.solutionId,
  build_id: fixed.buildId, agent_id: fixed.agentId, run_id: fixed.runId, build_status: 'completed', build_owner: fixed.userId, run_owner: fixed.userId });
const binding = () => ({ id: fixed.environmentId, tenantId: fixed.tenantId, userId: fixed.userId, origin: fixed.nativeOrigin,
  useIdToken: true, apiKey: 'synthetic-api-key-only', nativePolicy: createBoundedHttpPolicy({ imageDigest: fixed.nativeImage }) });
const googleToken = 'synthetic.google.identity', signer = 'synthetic-signer-not-a-real-secret';
const jobId = 'f192dab6-97bd-4e5a-9485-d9401b0a05e4';
const capability = (scope = codingPreviewScope()) => `${Buffer.from(JSON.stringify({ v: 1, scope, jobId,
  specHash: codingHash(prepareCodingSpec(codingPreviewProposal(), cloudRunCodingDescriptor(fixed.sandboxImage))), expiresAt: Date.now() + 299999 })).toString('base64url')}.syntheticmac`;
describe('single approved real coding preview operator guards', () => {
  it('requires the exact existing Solution/Build/Agent/completed task owner relationship', () => {
    expect(() => validateCodingPreviewSource(source())).not.toThrow();
    for (const field of ['tenant_id', 'owner_user_id', 'solution_id', 'build_id', 'agent_id', 'run_id', 'build_owner', 'run_owner', 'build_status'])
      expect(() => validateCodingPreviewSource({ ...source(), [field]: 'substitution' })).toThrow();
  });
  it('permits only scoped003 private native execution at the pinned profile', () => {
    expect(() => validateCodingPreviewBinding(binding())).not.toThrow();
    for (const change of [{ id: 'orqaly-customer-webhook-preview-002' }, { userId: 'user_another' }, { origin: 'https://other.example' }, { useIdToken: false },
      { nativePolicy: createBoundedHttpPolicy({ imageDigest: `sha256:${'b'.repeat(64)}` }) }])
      expect(() => validateCodingPreviewBinding({ ...binding(), ...change })).toThrow();
  });
  it('allows the five-minute purpose capability but never a Google JWT or signer in native data', () => {
    const url = `${fixed.nativeOrigin}/api/v1/credentials`;
    const options = headerValue => ({ method: 'POST', body: JSON.stringify({ type: 'orqalyBoundedHttp', data: { headerValue,
      scope: JSON.stringify({ targets: [{ destination: `${fixed.apiOrigin}/coding/v1/jobs/${jobId}/dispatch` }] }) } }) });
    expect(() => assertCodingPreviewTransport(url, options(`Bearer ${capability()}`), googleToken, signer, jobId)).not.toThrow();
    expect(() => assertCodingPreviewTransport(url, options(`Bearer ${capability()}`), googleToken, signer, fixed.solutionId)).toThrow();
    expect(() => assertCodingPreviewTransport(url, options(`Bearer ${googleToken}`), googleToken, signer)).toThrow();
    expect(() => assertCodingPreviewTransport(url, options(`Bearer ${signer}`), googleToken, signer)).toThrow();
    expect(() => assertCodingPreviewTransport(url, options(`Bearer ${capability({ ...codingPreviewScope(), solutionId: fixed.oldSolutionId })}`), googleToken, signer)).toThrow();
    expect(() => assertCodingPreviewTransport(`${fixed.nativeOrigin}/api/v1/workflows`, { method: 'POST', body: JSON.stringify({ header: googleToken }) }, googleToken, signer)).toThrow();
    expect(() => assertCodingPreviewTransport('https://other.example/api/v1/workflows', { method: 'GET' }, googleToken, signer)).toThrow();
  });
  it('requires deployed API and worker to share the exact final sandbox and signing version', () => {
    const values = { ORQALY_CODING_WORKER_URL: fixed.sandboxOrigin, ORQALY_CODING_WORKER_IMAGE_SHA256: fixed.sandboxImage,
      ORQALY_CODING_N8N_ENVIRONMENT_ID: fixed.environmentId, ORQALY_PUBLIC_API_ORIGIN: fixed.apiOrigin };
    const service = { metadata: { name: 'orqaly-v2-api-preview' }, status: { traffic: [{ revisionName: 'orqaly-v2-api-preview-exec-7b330159', percent: 100 }], conditions: [{ type: 'Ready', status: 'True' }] }, spec: { template: { spec: { containers: [{ image: `gcp/image@${fixed.applicationImage}`, env: [
      ...Object.entries(values).map(([name, value]) => ({ name, value })), { name: 'ORQALY_CODING_DISPATCH_SIGNING_KEY', valueFrom: { secretKeyRef: { name: 'orqaly-coding-preview-dispatch-signing-key', key: '1' } } },
      { name: 'ORQALY_SOLUTION_ENVIRONMENTS', valueFrom: { secretKeyRef: { name: 'orqaly-solution-preview-001-002-003-environments', key: '2' } } },
    ] }] } } } };
    expect(() => validateCodingPreviewDeployment(service)).not.toThrow();
    service.spec.template.spec.containers[0].env[1].value = `sha256:${'b'.repeat(64)}`;
    expect(() => validateCodingPreviewDeployment(service)).toThrow();
  });
  it('has deterministic one-job idempotency keys and a real bounded file/test proposal', () => {
    const first = prepareCodingSpec(codingPreviewProposal(), cloudRunCodingDescriptor(fixed.sandboxImage));
    const second = prepareCodingSpec(codingPreviewProposal(), cloudRunCodingDescriptor(fixed.sandboxImage));
    expect(codingHash(first)).toBe(codingHash(second)); expect(first.sourceHash).not.toBe(first.preparedHash);
    expect(first.outputs).toEqual(['src/total.mjs', 'result.json']); expect(first.limits.timeoutMs).toBe(30000);
    expect(new Set([fixed.createKey, fixed.approveKey, fixed.runKey]).size).toBe(3);
    expect(first).toMatchObject({ network: 'none', credentials: 'none', repositoryEffects: 'artifact_only' });
  });
  it('does not run code locally, switch DB roles or change old customer rows', async () => {
    const script = await readFile(new URL('../coding-product-preview-e2e.mjs', import.meta.url), 'utf8');
    expect(script).not.toMatch(/\.advanceOne\(/); expect(script).not.toMatch(/sandbox\.run\(/);
    expect(script).not.toContain('db-admin-password'); expect(script).not.toMatch(/SET (?:LOCAL )?ROLE/i);
    expect(script).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) orqaly\./);
    expect(script).toContain("assert.deepEqual(args, ['run-approved-coding']");
    expect(script).toContain('native_dispatch_unconfirmed_no_retry'); expect(script).toContain('old_solutions_revisions_history_or_runtime_changed');
    expect(script).toContain("{ flag: 'wx', mode: 0o600 }");
  });
});
