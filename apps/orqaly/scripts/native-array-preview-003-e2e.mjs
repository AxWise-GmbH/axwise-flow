// Explicitly approved synthetic acceptance on the THIRD private n8n preview.
// No model call, customer database write, application deploy, or provider action.
// Credentials and Google identity tokens exist only in memory. The product
// runtime creates/removes one exact disposable workflow per frozen test case.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createSolutionRuntime } from '../server/workflow-v2/solution-runtime.js';
import { normalizeNativeWorkflow } from '../server/workflow-v2/native-workflow-runtime-contract.js';
import {
  checkNativeWorkflowAcceptance,
  createBoundedHttpPolicy,
  reviewNativeWorkflow,
  REQUEST_AUTOMATION_POLICY,
} from '../server/workflow-v2/native-workflow-review.js';
import { canonicalJsonSha256 } from '../services/agentic-control-plane/src/domain/canonical.js';

export const ARRAY_003 = Object.freeze({
  project: 'axwise-v2-preview-001',
  environmentId: 'orqaly-customer-webhook-preview-003',
  origin: 'https://orqaly-solution-n8n-preview-003-161074549006.europe-west4.run.app',
  secret: 'orqaly-solution-preview-003-environment',
  imageDigest: 'sha256:245aab7912f5fa74547ef832ddc2ed195176260ee16767e25a4769c72812bee2',
  fixture: 'native-model-array-repaired-acceptance-2026-09-06.json',
  fixtureHash: 'f416982377ea3e3e2d8b5dd518614d6d2750563617921bc36e4b5c8452f70296',
  workflowHash: '0dcd10698370b02738d9ea0b92216070cdc6ebeed3bb89eac0a6dd14c9139d52',
});
const hashBytes = (value) => createHash('sha256').update(value).digest('hex');
const cloud = (args) =>
  execFileSync('gcloud', [...args, `--project=${ARRAY_003.project}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 8 * 1024 * 1024,
  }).trim();

export function validateArray003({ binding, text }) {
  assert.equal(binding.id, ARRAY_003.environmentId);
  assert.equal(binding.origin, ARRAY_003.origin);
  assert.equal(binding.useIdToken, true);
  assert.match(binding.tenantId, /^[a-f0-9-]{36}$/);
  assert.match(binding.userId, /^user_[A-Za-z0-9]+$/);
  assert.deepEqual(
    binding.nativePolicy,
    createBoundedHttpPolicy({ imageDigest: ARRAY_003.imageDigest })
  );
  assert.equal(hashBytes(text), ARRAY_003.fixtureHash);
  const artifact = JSON.parse(text);
  const original = normalizeNativeWorkflow({
    workflow: artifact.workflow,
    id: artifact.buildRequestId,
  });
  assert.equal(original.workflowHash, ARRAY_003.workflowHash);
  assert.equal(artifact.workflowHash, ARRAY_003.workflowHash);
  assert.equal(artifact.spec.runtimeProfile, 'request_automation');
  assert.deepEqual(artifact.spec.connections, []);
  assert.deepEqual(
    artifact.spec.acceptanceCases.map((c) => c.id),
    ['case-empty-items-array', 'case-all-nonpositive-array', 'case-mixed-items-array']
  );
  assert.equal(
    artifact.workflow.nodes.every((node) =>
      REQUEST_AUTOMATION_POLICY.allowedNodes.some(
        (allowed) => allowed.type === node.type && allowed.typeVersion === node.typeVersion
      )
    ),
    true
  );
  assert.equal(artifact.workflow.settings.executionTimeout, 30);
  const review = reviewNativeWorkflow({
    workflow: original.workflow,
    spec: artifact.spec,
    runtimePolicy: binding.nativePolicy,
  });
  assert.equal(review.valid, true);
  assert.equal(review.execution.allowed, true);
  return artifact;
}

export async function runArray003(args = process.argv.slice(2)) {
  assert.deepEqual(args, ['run-array'], 'Explicit run-array is required; no scope override exists');
  let stage = 'preflight';
  const receipts = [];
  const requests = [];
  try {
    const text = await readFile(
      new URL(`../server/workflow-v2/fixtures/${ARRAY_003.fixture}`, import.meta.url),
      'utf8'
    );
    const binding = JSON.parse(
      cloud(['secrets', 'versions', 'access', '1', `--secret=${ARRAY_003.secret}`])
    );
    const artifact = validateArray003({ binding, text });
    const scope = { tenantId: binding.tenantId, userId: binding.userId };
    const token = cloud(['auth', 'print-identity-token']);
    assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const unauthenticated = await fetch(`${binding.origin}/rest/settings`, {
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    await unauthenticated.body?.cancel();
    assert.equal(unauthenticated.status, 403);
    const runtime = createSolutionRuntime({
      bindings: [binding],
      getIdentityHeaders: async (origin) => {
        assert.equal(origin, ARRAY_003.origin);
        return { authorization: `Bearer ${token}` };
      },
      fetchImpl: async (url, options) => {
        const target = new URL(url);
        assert.equal(target.origin, ARRAY_003.origin);
        const response = await fetch(url, options);
        // Record only metadata. No token, request body, provider text, or node data.
        requests.push({ method: options.method, path: target.pathname, status: response.status });
        return response;
      },
    });
    for (const acceptance of artifact.spec.acceptanceCases) {
      stage = acceptance.id;
      const testId = randomUUID();
      const invocationId = randomUUID();
      const compiled = normalizeNativeWorkflow({
        workflow: artifact.workflow,
        id: testId,
        controlledTest: true,
      });
      const result = await runtime.testNative(scope, {
        environmentId: binding.id,
        workflow: compiled.workflow,
        spec: artifact.spec,
        testId,
        invocationId,
        input: acceptance.input,
      });
      const checked = checkNativeWorkflowAcceptance({
        spec: artifact.spec,
        input: acceptance.input,
        ...result,
      });
      const receipt = {
        caseId: acceptance.id,
        testId,
        invocationId,
        testArtifactHash: compiled.workflowHash,
        status: result.status,
        executionId: result.executionId ?? null,
        responseStatus: result.responseStatus ?? null,
        cleanup: result.cleanup?.status ?? null,
        passed:
          checked.passed &&
          result.status === 'succeeded' &&
          result.testArtifactHash === compiled.workflowHash &&
          result.cleanup?.status === 'removed',
        diagnostics: (result.diagnostics ?? []).map((d) => ({
          code: d.code,
          nodeId: d.nodeId ?? null,
        })),
        ...(checked.passed
          ? {
              input: acceptance.input,
              output: result.output,
              outputHash: canonicalJsonSha256(result.output),
            }
          : {}),
      };
      receipts.push(receipt);
      console.log(JSON.stringify(receipt));
      assert.equal(receipt.passed, true, 'Frozen array case did not pass; stop without retry');
      assert.match(result.executionId, /^[1-9][0-9]*$/);
    }
    console.log(
      JSON.stringify({
        passed: true,
        scope: 'synthetic_gcp003_runtime',
        environmentId: binding.id,
        imageDigest: ARRAY_003.imageDigest,
        packageHash: binding.nativePolicy.outboundPackageHash,
        workflowHash: artifact.workflowHash,
        fixtureHash: ARRAY_003.fixtureHash,
        cases: receipts.length,
        anonymousStatus: 403,
        configuredExecutionTimeoutSeconds: 30,
        policyCeilingSeconds: binding.nativePolicy.maxExecutionSeconds,
        modelCalls: 0,
        manualGraphEdits: false,
        customerDatabaseWrites: false,
        temporaryWorkflowsRemoved: receipts.length,
        credentialsLogged: false,
      })
    );
    return { receipts, requests };
  } catch {
    console.error(
      JSON.stringify({
        passed: false,
        stage,
        receiptsCompleted: receipts.length,
        requests,
        credentialsLogged: false,
      })
    );
    process.exitCode = 1;
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runArray003();
