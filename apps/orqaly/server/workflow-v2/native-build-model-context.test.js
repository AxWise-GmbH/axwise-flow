// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { nativeOrderWorkflow, nativeOrderSpec } from './fixtures/native-order-routing.js';
import { nativeOutboundFixture } from '../../scripts/fixtures/native-outbound-workflow.mjs';
import { describeNativeConnection } from './native-workflow-connections.js';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  projectNativeBuildDraft,
  assertNativeModelHasNoCredentialSelectors,
  bindNativeBuildBundle,
} from './native-build-model-context.js';
import { assertNativePreparationContract } from './solution-build-service.js';

function bundle() {
  const workflow = nativeOrderWorkflow();
  const spec = nativeOrderSpec();
  const child = nativeOutboundFixture();
  child.workflow.nodes = child.workflow.nodes.slice(0, 2);
  Object.assign(child.workflow.nodes[0], {
    type: 'n8n-nodes-base.errorTrigger',
    typeVersion: 1,
    parameters: {},
  });
  delete child.workflow.connections['Deliver event'];
  workflow.settings.errorWorkflow = 'orqaly:error:alerts';
  spec.ownedDependencies = [{ id: 'alerts', kind: 'error_handler', ...child }];
  const record = {
    id: randomUUID(),
    requirement_id: 'owned:alerts:receiver',
    status: 'saved',
    credential_type: 'orqalyBoundedHttp',
    provider_credential_id: 'opaque-child-id',
    environment_id: 'owned-runtime',
    scope: describeNativeConnection({
      requirement: child.spec.connections[0],
      workflow: child.workflow,
      environmentId: 'owned-runtime',
    }).scope,
  };
  return { workflow, spec, record };
}
describe('native Build private model projection and exact binding restoration', () => {
  it('restores a child reference only from matching owner-scoped records, never model selectors or changed destinations', () => {
    const { workflow, spec, record } = bundle();
    const bound = bindNativeBuildBundle({ workflow, spec }, [record], 'owned-runtime');
    expect(bound.spec.ownedDependencies[0].workflow.nodes[1].credentials.orqalyBoundedHttp.id).toBe(
      'opaque-child-id'
    );
    const clean = projectNativeBuildDraft({ ...bound, row_version: 4 });
    expect(JSON.stringify(clean)).not.toContain('opaque-child-id');
    expect(clean.workflowHash).toBe(hash(clean.workflow));
    expect(() => assertNativeModelHasNoCredentialSelectors(bound.workflow, bound.spec)).toThrow(
      'native_model_credential_selector_denied'
    );
    expect(() =>
      assertNativeModelHasNoCredentialSelectors(clean.workflow, clean.spec)
    ).not.toThrow();
    expect(bindNativeBuildBundle(clean, [record], 'owned-runtime').spec).toEqual(bound.spec);
    const changed = structuredClone(clean);
    changed.spec.ownedDependencies[0].workflow.nodes[1].parameters.url =
      'https://new.example/alerts';
    expect(
      bindNativeBuildBundle(changed, [record], 'owned-runtime').spec.ownedDependencies[0].workflow
        .nodes[1]
    ).not.toHaveProperty('credentials');
    expect(
      bindNativeBuildBundle(clean, [{ ...record, status: 'revoked' }], 'owned-runtime').spec
        .ownedDependencies[0].workflow.nodes[1]
    ).not.toHaveProperty('credentials');
    expect(
      bindNativeBuildBundle(clean, [record], 'another-runtime').spec.ownedDependencies[0].workflow
        .nodes[1]
    ).not.toHaveProperty('credentials');
    expect(
      bindNativeBuildBundle(clean, [{ ...record, requirement_id: 'receiver' }], 'owned-runtime')
        .spec.ownedDependencies[0].workflow.nodes[1]
    ).not.toHaveProperty('credentials');
  });
  it.each(['requirements', 'inputSchema', 'outputSchema', 'acceptanceCases', 'runtimeProfile'])(
    'repair cannot change the owned handler %s contract',
    (field) => {
      const source = bundle();
      const draft = projectNativeBuildDraft({ ...source, row_version: 0 });
      const changed = structuredClone(draft.spec);
      changed.ownedDependencies[0].spec[field] =
        field === 'runtimeProfile' ? 'software_development' : [];
      expect(() =>
        assertNativePreparationContract(
          { phase: 'repair', draft },
          { baseWorkflowHash: draft.workflowHash, spec: changed }
        )
      ).toThrow('native_repair_changed_acceptance_contract');
      expect(() =>
        assertNativePreparationContract(
          { phase: 'design', draft },
          { baseWorkflowHash: draft.workflowHash, spec: changed }
        )
      ).not.toThrow();
    }
  );
});
