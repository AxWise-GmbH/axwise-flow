import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import { nativeBundleConnectionRequirements } from './native-workflow-bundle.js';
import { describeNativeConnection } from './native-workflow-connections.js';

export async function revisionConnectionRecords(client, solution) {
  return (
    await client.query(
      `SELECT * FROM orqaly.solution_revision_connections
    WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 ORDER BY created_at DESC,id`,
      [solution.tenant_id, solution.owner_user_id, solution.solution_id ?? solution.id]
    )
  ).rows;
}

// A record is inherited only through an exact credential selector already in
// the trusted selected graph, with unchanged node scope. Never select a key by
// provider name, a model-supplied reference, or requirement name alone.
export function matchingRevisionConnections(solution, revision, records) {
  const value = { workflow: revision.workflow, spec: revision.spec ?? revision.base_spec };
  const available = [...records, ...(solution.nativeConnections ?? [])];
  return nativeBundleConnectionRequirements(value).flatMap((member) => {
    const requirement = member.requirement;
    const selected = requirement.nodeIds.map(
      (nodeId) =>
        member.workflow.nodes.find((node) => node.id === nodeId)?.credentials?.[
          requirement.credentialType
        ]?.id
    );
    const found = available.find(
      (entry) =>
        ['saved', 'verified'].includes(entry.status) &&
        selected.length &&
        selected.every((id) => !!id && id === entry.provider_credential_id) &&
        describeNativeConnection({
          requirement,
          workflow: member.workflow,
          connection: entry,
          environmentId: solution.environment_id,
        }).status === entry.status
    );
    return found
      ? [
          {
            ...found,
            requirement_id: member.id,
            dependency_id: member.dependencyId,
            member_requirement_id: requirement.id,
          },
        ]
      : [];
  });
}

export async function loadRevisionNativeConnections(client, solution, revision) {
  if ((revision.spec ?? revision.base_spec)?.kind !== 'n8n_workflow_v2') return [];
  if (
    !nativeBundleConnectionRequirements({
      workflow: revision.workflow,
      spec: revision.spec ?? revision.base_spec,
    }).length
  )
    return [];
  return matchingRevisionConnections(
    solution,
    revision,
    await revisionConnectionRecords(client, solution)
  );
}

export const revisionConnectionScopeHash = (descriptor, environmentId) =>
  hash({
    environmentId,
    requirementId: descriptor.id,
    dependencyId: descriptor.dependencyId ?? null,
    credentialType: descriptor.credentialType,
    scope: descriptor.scope,
  });
