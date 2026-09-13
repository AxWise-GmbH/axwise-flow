// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { nativeOwnedErrorFixture } from './fixtures/native-owned-error.js';
import {
  nativeBundleHash,
  nativeBundleMembers,
  materializeNativeBundle,
  redactNativeBundle,
  normalizeNativeBundle,
} from './native-workflow-bundle.js';
import { NativeWorkflowSpecV2Schema } from '../../shared/workflow-v2/native-workflow-contracts.js';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import { reviewNativeWorkflow, REQUEST_AUTOMATION_POLICY } from './native-workflow-review.js';
const id = '9832038f-98be-466f-a6ae-0c68e0c0958c';
const policy = {
  ...REQUEST_AUTOMATION_POLICY,
  ownedErrorHandlers: true,
  backgroundExecution: 'instance_cpu_always',
};
describe('owned native error-workflow bundle', () => {
  it('keeps old specs unchanged and rejects nested handlers even an empty declaration', () => {
    const value = nativeOwnedErrorFixture(id);
    delete value.spec.ownedDependencies[0].spec.ownedDependencies;
    expect(NativeWorkflowSpecV2Schema.parse(value.spec)).toEqual(value.spec);
    value.spec.ownedDependencies[0].spec.ownedDependencies = [];
    expect(NativeWorkflowSpecV2Schema.safeParse(value.spec).success).toBe(false);
  });
  it('pins child parameters and requirements, not just the primary workflow', () => {
    const value = nativeOwnedErrorFixture(id);
    const original = nativeBundleHash(value);
    value.spec.ownedDependencies[0].spec.requirements[0].description += ' changed';
    expect(nativeBundleHash(value)).not.toBe(original);
    expect(hash(value.workflow)).toBe(value.workflowHash);
  });
  it('requires a logical owned reference and verified background CPU before enabling the native trigger', () => {
    const value = nativeOwnedErrorFixture(id);
    const allowed = reviewNativeWorkflow({ ...value, runtimePolicy: policy });
    expect(allowed.issues).toEqual([]);
    expect(allowed.execution.reasons).toEqual([]);
    expect(allowed.execution.allowed).toBe(true);
    for (const runtimePolicy of [
      REQUEST_AUTOMATION_POLICY,
      { ...REQUEST_AUTOMATION_POLICY, ownedErrorHandlers: true },
    ])
      expect(reviewNativeWorkflow({ ...value, runtimePolicy }).execution.allowed).toBe(false);
    value.workflow.settings.errorWorkflow = 'foreign-provider-id';
    expect(() => nativeBundleMembers(value)).toThrow('reference_mismatch');
  });
  it('materializes only exact owned provider/version pins without changing the approved source', () => {
    const value = nativeOwnedErrorFixture(id);
    const original = structuredClone(value);
    const child = nativeBundleMembers(value)[1];
    const pin = {
      dependencyId: child.dependencyId,
      workflowId: 'OwnedProvider1',
      versionId: 'owned-version-1',
      workflowHash: hash(child.workflow),
      specHash: hash(child.spec),
    };
    expect(materializeNativeBundle(value, [pin]).workflow.settings.errorWorkflow).toBe(
      pin.workflowId
    );
    expect(value).toEqual(original);
    for (const change of [
      { workflowHash: '0'.repeat(64) },
      { dependencyId: 'foreign' },
      { versionId: '../other' },
    ])
      expect(() => materializeNativeBundle(value, [{ ...pin, ...change }])).toThrow('pin_mismatch');
  });
  it('removes credential selectors recursively from model context only', () => {
    const value = nativeOwnedErrorFixture(id);
    value.workflow.nodes[1].credentials = { any: { id: 'private-main' } };
    value.spec.ownedDependencies[0].workflow.nodes[1].credentials = {
      any: { id: 'private-child' },
    };
    const redacted = redactNativeBundle(value);
    expect(JSON.stringify(redacted)).not.toContain('private-');
    expect(value.workflow.nodes[1].credentials).toBeDefined();
  });
  it('retains successful synthetic child evidence only in a separately hashed disposable artifact', () => {
    const value = nativeOwnedErrorFixture(id);
    const test = normalizeNativeBundle({ ...value, id, controlledTest: true });
    expect(test.bundleHash).not.toBe(value.bundleHash);
    expect(test.spec.ownedDependencies[0].workflow.settings.saveDataSuccessExecution).toBe('all');
    expect(value.spec.ownedDependencies[0].workflow.settings.saveDataSuccessExecution).toBe('none');
  });
});
