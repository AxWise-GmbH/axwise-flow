import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  nativeBundleMembers,
  nativeBundleConnectionRequirements,
  redactNativeBundle,
  replaceNativeBundleMember,
} from './native-workflow-bundle.js';
import { bindNativeConnections } from './native-workflow-connections.js';

// The model's content hash names its redacted projection, not the private saved
// artifact. Input-version CAS separately binds completion to the stored Build.
export function projectNativeBuildDraft(value) {
  if (!value.workflow || !value.spec) return null;
  const clean = redactNativeBundle({ workflow: value.workflow, spec: value.spec });
  return { ...clean, workflowHash: hash(clean.workflow), rowVersion: value.row_version };
}

export function assertNativeModelHasNoCredentialSelectors(workflow, spec) {
  for (const member of nativeBundleMembers({ workflow, spec }))
    if (member.workflow.nodes.some((node) => Object.hasOwn(node, 'credentials')))
      throw new Error('native_model_credential_selector_denied');
}

export function nativeBuildConnectionRecords(value, records) {
  return nativeBundleConnectionRequirements(value).flatMap((entry) =>
    records
      .filter((record) => record.requirement_id === entry.id)
      .map((record) => ({
        ...record,
        dependency_id: entry.dependencyId,
        member_requirement_id: entry.requirement.id,
        requirement_id: entry.requirement.id,
      }))
  );
}

// Only current owner-scoped records with matching frozen node parameters can be
// reattached. Changed destinations/scopes remain unbound; no credential is made.
export function bindNativeBuildBundle(value, records, environmentId) {
  let bound = structuredClone(value);
  const selected = nativeBuildConnectionRecords(value, records);
  for (const member of nativeBundleMembers(value))
    bound = replaceNativeBundleMember(
      bound,
      member.dependencyId,
      bindNativeConnections(
        member.workflow,
        member.spec,
        selected.filter((record) => record.dependency_id === member.dependencyId),
        environmentId
      )
    );
  return bound;
}
