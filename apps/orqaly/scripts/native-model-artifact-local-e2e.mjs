import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { startNativeLocalRuntime } from './native-local-runtime.mjs';
import { normalizeNativeWorkflow } from '../server/workflow-v2/native-workflow-runtime-contract.js';
import {
  checkNativeWorkflowAcceptance,
  reviewNativeWorkflow,
  REQUEST_AUTOMATION_POLICY,
} from '../server/workflow-v2/native-workflow-review.js';

// Execute the recorded real-model graph without another model call or manual
// business-graph correction. The runtime only derives its normal test transport.
const fixtureName = process.argv[2] ?? 'native-model-order-acceptance-2026-09-05.json';
assert.match(fixtureName, /^native-model-[a-z-]+-acceptance-\d{4}-\d{2}-\d{2}\.json$/);
assert.equal(process.argv.length <= 3, true, 'Provide at most one recorded fixture basename');
const artifact = JSON.parse(
  await readFile(new URL(`../server/workflow-v2/fixtures/${fixtureName}`, import.meta.url), 'utf8')
);
const original = normalizeNativeWorkflow({
  workflow: artifact.workflow,
  id: artifact.buildRequestId,
});
assert.equal(original.workflowHash, artifact.workflowHash);
const review = reviewNativeWorkflow({
  workflow: original.workflow,
  spec: artifact.spec,
  runtimePolicy: REQUEST_AUTOMATION_POLICY,
});
assert.equal(review.valid, true);
assert.equal(review.execution.allowed, true);
const scope = { tenantId: randomUUID(), userId: 'user_recordedModelAcceptance' };
let local;
try {
  local = await startNativeLocalRuntime(scope);
  for (const acceptance of artifact.spec.acceptanceCases) {
    const testId = randomUUID();
    const compiled = normalizeNativeWorkflow({
      workflow: artifact.workflow,
      id: testId,
      controlledTest: true,
    });
    const result = await local.runtime.testNative(scope, {
      environmentId: local.environmentId,
      workflow: compiled.workflow,
      spec: artifact.spec,
      testId,
      invocationId: randomUUID(),
      input: acceptance.input,
    });
    assert.equal(result.status, 'succeeded', `Runtime did not succeed for ${acceptance.id}`);
    assert.equal(result.testArtifactHash, compiled.workflowHash);
    assert.equal(result.cleanup.status, 'removed');
    assert.match(result.executionId, /^[0-9]+$/);
    const checked = checkNativeWorkflowAcceptance({
      spec: artifact.spec,
      input: acceptance.input,
      ...result,
    });
    assert.equal(
      checked.passed,
      true,
      `Acceptance failed for ${acceptance.id}: ${JSON.stringify(checked)}`
    );
    console.log(
      JSON.stringify({
        caseId: acceptance.id,
        executionId: result.executionId,
        responseStatus: result.responseStatus,
        output: result.output,
        cleanup: result.cleanup.status,
        passed: true,
      })
    );
  }
  console.log(
    JSON.stringify({
      model: artifact.modelVersion,
      nodes: artifact.workflow.nodes.length,
      workflowHash: artifact.workflowHash,
      actualExecutions: artifact.spec.acceptanceCases.length,
      manuallyCorrected: false,
      additionalModelCalls: 0,
      cloudResourcesChanged: false,
    })
  );
} finally {
  await local?.close();
}
