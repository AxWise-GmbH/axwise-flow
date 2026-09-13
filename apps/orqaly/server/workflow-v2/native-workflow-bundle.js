import { z } from 'zod';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  NativeWorkflowSpecV2Schema,
  isBoundedNativeJson,
} from '../../shared/workflow-v2/native-workflow-contracts.js';
import { normalizeNativeWorkflow } from './native-workflow-runtime-contract.js';

export const NATIVE_ERROR_HANDLER_TYPE = 'n8n-nodes-base.errorTrigger';
export const NATIVE_ERROR_HANDLER_VERSION = 1;
export const NATIVE_BUNDLE_CONTRACT = 'orqaly.owned-workflow-bundle.v1';
export const ownedErrorWorkflowReference = (id) => `orqaly:error:${id}`;

// Logical references can be proposed by the Agent; provider identities cannot.
// A bundle approval pins requirements and every member's bytes together.
export function nativeBundleMembers({ workflow, spec }) {
  if (!isBoundedNativeJson(workflow)) throw new Error('native_bundle_workflow_invalid');
  const checked = NativeWorkflowSpecV2Schema.parse(spec);
  const { ownedDependencies, ...mainSpec } = checked;
  const members = [
    { dependencyId: null, role: 'main', workflow: structuredClone(workflow), spec: mainSpec },
  ];
  for (const dependency of ownedDependencies ?? []) {
    if (workflow.settings?.errorWorkflow !== ownedErrorWorkflowReference(dependency.id))
      throw new Error('native_bundle_error_reference_mismatch');
    if (dependency.workflow.settings?.errorWorkflow)
      throw new Error('native_bundle_nested_error_handler_denied');
    members.push({
      dependencyId: dependency.id,
      role: dependency.kind,
      workflow: structuredClone(dependency.workflow),
      spec: dependency.spec,
    });
  }
  if (!ownedDependencies?.length && workflow.settings?.errorWorkflow)
    throw new Error('native_bundle_unowned_error_reference');
  return members;
}

export function nativeBundleHash({ workflow, spec }) {
  if (!spec?.ownedDependencies?.length) return null;
  return hash({
    contract: NATIVE_BUNDLE_CONTRACT,
    members: nativeBundleMembers({ workflow, spec }),
  });
}

export function nativeBundleConnectionRequirements(value) {
  const result = nativeBundleMembers(value).flatMap((member) =>
    member.spec.connections.map((requirement) => ({
      id:
        member.dependencyId === null
          ? requirement.id
          : `owned:${member.dependencyId}:${requirement.id}`,
      dependencyId: member.dependencyId,
      requirement,
      workflow: member.workflow,
      spec: member.spec,
    }))
  );
  if (new Set(result.map((item) => item.id)).size !== result.length)
    throw new Error('native_bundle_connection_id_ambiguous');
  return result;
}

export function replaceNativeBundleMember(value, dependencyId, workflow) {
  if (!isBoundedNativeJson(workflow)) throw new Error('native_bundle_workflow_invalid');
  const next = structuredClone(value);
  if (dependencyId === null) next.workflow = structuredClone(workflow);
  else {
    const dependency = next.spec?.ownedDependencies?.find((item) => item.id === dependencyId);
    if (!dependency) throw new Error('native_bundle_member_not_found');
    dependency.workflow = structuredClone(workflow);
  }
  nativeBundleMembers(next);
  return next;
}

// This projection is exclusively for model context. It removes private provider
// credential selectors from child workflows as well as the primary graph.
export function redactNativeBundle(value) {
  const copy = structuredClone(value);
  for (const workflow of [
    copy.workflow,
    ...(copy.spec?.ownedDependencies ?? []).map((item) => item.workflow),
  ])
    for (const node of workflow?.nodes ?? []) delete node.credentials;
  return copy;
}

export function normalizeNativeBundle({ workflow, spec, id, controlledTest = false }) {
  z.uuid().parse(id);
  const normalized = normalizeNativeWorkflow({ workflow, id, controlledTest }).workflow;
  const checked = NativeWorkflowSpecV2Schema.parse(spec);
  for (const dependency of checked.ownedDependencies ?? []) {
    // No webhook is added to the handler. The actual native Error Trigger stays
    // the only entry point and receives n8n's own failure payload.
    dependency.workflow = normalizeNativeWorkflow({
      workflow: dependency.workflow,
      id,
      controlledTest,
    }).workflow;
    dependency.workflow.name = `Orqaly ${controlledTest ? 'test error' : 'error'} ${id}`;
    // Only synthetic, no-connector disposable handlers retain successful data
    // long enough to prove n8n's actual parent→error-workflow execution link.
    // Provider-connected and production handlers retain no raw execution data.
    if (
      controlledTest &&
      !dependency.workflow.nodes.some((node) => node.type === 'CUSTOM.boundedHttp')
    )
      dependency.workflow.settings.saveDataSuccessExecution = 'all';
  }
  const value = { workflow: normalized, spec: checked };
  nativeBundleMembers(value);
  return { ...value, workflowHash: hash(normalized), bundleHash: nativeBundleHash(value) };
}

// A provider deployment is materialized only after owned child IDs/version IDs
// have been durably recorded. Foreign IDs, duplicate dependencies and hash drift
// are rejected; the logical source artifact itself is never overwritten.
export function materializeNativeBundle(value, pins) {
  const members = nativeBundleMembers(value);
  const children = members.filter((member) => member.dependencyId !== null);
  if (!Array.isArray(pins) || pins.length !== children.length)
    throw new Error('native_bundle_pin_count_mismatch');
  const ids = new Set();
  for (const member of children) {
    const pin = pins.find((entry) => entry.dependencyId === member.dependencyId);
    if (
      !pin ||
      pin.workflowHash !== hash(member.workflow) ||
      pin.specHash !== hash(member.spec) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(pin.workflowId ?? '') ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(pin.versionId ?? '') ||
      ids.has(pin.workflowId)
    )
      throw new Error('native_bundle_pin_mismatch');
    ids.add(pin.workflowId);
  }
  const workflow = structuredClone(value.workflow);
  if (children.length) workflow.settings.errorWorkflow = pins[0].workflowId;
  return { workflow, bundleHash: nativeBundleHash(value), workflowHash: hash(workflow) };
}
