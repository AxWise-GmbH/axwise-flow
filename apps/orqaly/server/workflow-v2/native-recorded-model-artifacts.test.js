// @vitest-environment node
import { describe, expect, it } from 'vitest';
import order from './fixtures/native-model-order-acceptance-2026-09-05.json';
import array from './fixtures/native-model-array-acceptance-2026-09-06.json';
import { normalizeNativeWorkflow } from './native-workflow-runtime-contract.js';
import { reviewNativeWorkflow, REQUEST_AUTOMATION_POLICY } from './native-workflow-review.js';

describe('recorded real-model evidence remains distinct from runtime proof', () => {
  it('preserves the exact statically valid order graph, without labeling this check an execution', () => {
    const normalized = normalizeNativeWorkflow({
      workflow: order.workflow,
      id: order.buildRequestId,
    });
    expect(normalized.workflowHash).toBe(order.workflowHash);
    const review = reviewNativeWorkflow({
      workflow: normalized.workflow,
      spec: order.spec,
      runtimePolicy: REQUEST_AUTOMATION_POLICY,
    });
    expect(review.valid).toBe(true);
    expect(review.execution.allowed).toBe(true);
    expect(order.runtimeExecuted).toBe(false);
  });
  it('keeps the failed held-out design blocked instead of substituting a passing example', () => {
    const normalized = normalizeNativeWorkflow({
      workflow: array.workflow,
      id: array.buildRequestId,
    });
    expect(normalized.workflowHash).toBe(array.workflowHash);
    const review = reviewNativeWorkflow({
      workflow: normalized.workflow,
      spec: array.spec,
      runtimePolicy: REQUEST_AUTOMATION_POLICY,
    });
    expect(review.valid).toBe(false);
    expect(review.execution.allowed).toBe(false);
    expect(review.issues.some((issue) => issue.code === 'NODE_FIELD')).toBe(true);
    expect(array.runtimeExecuted).toBe(false);
  });
});
