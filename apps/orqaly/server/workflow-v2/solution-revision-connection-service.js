import { randomUUID } from 'node:crypto';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  CreateSolutionRevisionConnectionSchema,
  RevokeSolutionRevisionConnectionSchema,
  RevisionConnectionKeySchema,
} from '../../shared/workflow-v2/solution-revision-connection-contracts.js';
import {
  describeNativeConnection,
  validateNativeCredentialInput,
  bindNativeConnections,
} from './native-workflow-connections.js';
import {
  nativeBundleConnectionRequirements,
  nativeBundleMembers,
  replaceNativeBundleMember,
  nativeBundleHash,
} from './native-workflow-bundle.js';
import {
  revisionConnectionRecords,
  matchingRevisionConnections,
  revisionConnectionScopeHash,
} from './solution-revision-connection-store.js';
import { isBoundedHttpPolicy } from './native-outbound-policy.js';
import { SolutionError, DEPLOYMENT_STALE_MS } from './solution-service.js';

const fail = (code, message, status = 409) => {
  throw new SolutionError(code, message, status);
};
const editable = (revision) => ['draft', 'reviewed'].includes(revision.status);
const old = (record) => Date.now() - Date.parse(record.updated_at) > DEPLOYMENT_STALE_MS;
const active = async (client, scope) => {
  if (
    (await client.query('SELECT status FROM orqaly.tenants WHERE id=$1', [scope.tenantId])).rows[0]
      ?.status !== 'active'
  )
    fail('TENANT_SUSPENDED', 'The workspace is not active.', 403);
};

// Only current graph selectors establish inheritance; a provider or requirement
// name never searches for credentials across releases or customers.
export async function describeRevisionConnectionSetup(client, scope, solution, revision, runtime) {
  const value = { workflow: revision.workflow, spec: revision.spec ?? revision.base_spec };
  if (value.spec?.kind !== 'n8n_workflow_v2')
    fail('NATIVE_REVISION_REQUIRED', 'Connection setup requires a native workflow draft.');
  let members;
  try {
    members = nativeBundleConnectionRequirements(value);
  } catch {
    fail(
      'REVISION_CONNECTION_GRAPH_INVALID',
      'Correct the workflow and linked member references before setting up connections.'
    );
  }
  const records = await revisionConnectionRecords(client, solution);
  const inherited = matchingRevisionConnections(solution, revision, records);
  const own = records.filter(
    (entry) => entry.revision_id === revision.id && entry.status !== 'revoked'
  );
  const policy = runtime?.nativePolicy?.(scope, solution.environment_id);
  const capable =
    !!solution.environment_id &&
    isBoundedHttpPolicy(policy) &&
    typeof runtime?.createNativeCredential === 'function';
  const canCleanup = typeof runtime?.reconcileNativeCredential === 'function';
  const requirements = members.map((member) => {
    const record =
      own.find((entry) => entry.requirement_id === member.id) ??
      inherited.find((entry) => entry.requirement_id === member.id);
    const described = describeNativeConnection({
      requirement: member.requirement,
      workflow: member.workflow,
      connection: record,
      environmentId: solution.environment_id,
    });
    const descriptor = {
      ...described,
      id: member.id,
      dependencyId: member.dependencyId,
      inherited: !!record && record.revision_id !== revision.id,
    };
    const memberAllowed =
      member.dependencyId === null ||
      (policy?.ownedErrorHandlers === true &&
        policy?.backgroundExecution === 'instance_cpu_always');
    descriptor.scopeHash = descriptor.scope
      ? revisionConnectionScopeHash(descriptor, solution.environment_id)
      : null;
    descriptor.canConnect =
      !!descriptor.canConnect &&
      editable(revision) &&
      capable &&
      memberAllowed &&
      descriptor.credentialType === 'orqalyBoundedHttp';
    descriptor.canRevoke =
      !!record &&
      !descriptor.inherited &&
      editable(revision) &&
      canCleanup &&
      (!['creating', 'revoking'].includes(record.status) || old(record));
    if (!editable(revision))
      descriptor.reason =
        'This version is immutable. Open an editable draft to change its connections.';
    else if (!capable || !memberAllowed)
      descriptor.reason =
        'This environment does not have the required reviewed connection and linked-workflow capability.';
    else if (
      record &&
      ['creating', 'create_unknown', 'revoking', 'revoke_unknown'].includes(record.status)
    )
      descriptor.reason =
        'Connection setup or cleanup is unfinished or unconfirmed. Do not create another credential; verify cleanup of this exact connection.';
    // A changed graph's old connection is revocable only with its original scope
    // displayed and explicitly acknowledged, not the proposed replacement URL.
    if (record && !descriptor.inherited && descriptor.status === 'stale') {
      descriptor.scope = record.scope;
      descriptor.scopeHash = record.scope_hash;
      descriptor.reason =
        'The draft changed. Revoke this old exact destination first, then authorize the new connection.';
    }
    return descriptor;
  });
  for (const record of own.filter(
    (entry) => !requirements.some((item) => item.id === entry.requirement_id)
  ))
    requirements.push({
      id: record.requirement_id,
      dependencyId: record.member_id || null,
      service: 'Removed service',
      credentialType: record.credential_type,
      nodeIds: record.scope.targets?.map((item) => item.nodeId) ?? [],
      fields: [],
      scope: record.scope,
      scopeHash: record.scope_hash,
      connectionId: record.id,
      inherited: false,
      status: 'stale',
      canConnect: false,
      canRevoke:
        editable(revision) &&
        canCleanup &&
        (!['creating', 'revoking'].includes(record.status) || old(record)),
      reason:
        'This connection no longer belongs to a draft node. Explicitly revoke its saved destination before continuing.',
    });
  const ready =
    (!members.length || capable) &&
    (!value.spec.ownedDependencies?.length ||
      (policy?.ownedErrorHandlers === true &&
        policy?.backgroundExecution === 'instance_cpu_always')) &&
    members.every((member) => inherited.some((entry) => entry.requirement_id === member.id)) &&
    !own.some((entry) => !['saved'].includes(entry.status)) &&
    requirements.every((entry) => ['saved', 'verified'].includes(entry.status));
  return {
    records,
    inherited,
    requirements,
    setup: {
      ready,
      reason: ready
        ? 'All required connections are saved for this exact draft; service delivery is not yet verified.'
        : 'Finish secure setup or cleanup for this draft before continuing.',
    },
  };
}

function rebound(solution, revision, records) {
  let value = { workflow: revision.workflow, spec: revision.spec ?? revision.base_spec };
  const inherited = matchingRevisionConnections(solution, revision, records);
  // New saved records are eligible only within this exact draft/member/scope.
  const owned = records.filter(
    (entry) => entry.revision_id === revision.id && entry.status === 'saved'
  );
  for (const member of nativeBundleMembers(value)) {
    const available = [...owned, ...inherited]
      .filter(
        (entry) =>
          (entry.member_id ?? entry.dependency_id ?? null) === (member.dependencyId ?? '') ||
          (member.dependencyId === null && entry.member_id == null && entry.dependency_id == null)
      )
      .map((entry) => ({
        ...entry,
        requirement_id: entry.member_requirement_id ?? entry.requirement_id,
      }));
    value = replaceNativeBundleMember(
      value,
      member.dependencyId,
      bindNativeConnections(member.workflow, member.spec, available, solution.environment_id)
    );
  }
  return value;
}

export function createSolutionRevisionConnectionService({
  runtime,
  owner,
  tx,
  findSolution,
  findRevision,
  checkVersion,
  checkBundle,
  publicRevision,
  event,
}) {
  async function readFor(scope, id, revisionId) {
    return tx(scope, async (client) => {
      await active(client, scope);
      const solution = await findSolution(client, scope, id);
      const revision = await findRevision(client, scope, id, revisionId);
      const current = await describeRevisionConnectionSetup(
        client,
        scope,
        solution,
        revision,
        runtime
      );
      return {
        revision: publicRevision(revision),
        connectionRequirements: current.requirements,
        setup: current.setup,
      };
    });
  }
  async function selected(client, scope, id, revisionId, command) {
    await active(client, scope);
    const solution = await findSolution(client, scope, id, true);
    const revision = await findRevision(client, scope, id, revisionId, true);
    checkVersion(revision, command.expectedVersion, command.workflowHash);
    checkBundle(revision, command.bundleHash);
    if (!editable(revision))
      fail('SOLUTION_REVISION_IMMUTABLE', 'Only an editable draft can change its connections.');
    const pending = await client.query(
      `SELECT id FROM orqaly.solution_invocations WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND status IN ('running','outcome_unknown') LIMIT 1`,
      [scope.tenantId, scope.userId, id]
    );
    if (pending.rows.length)
      fail(
        'REVISION_CONNECTION_EXECUTION_PENDING',
        'Resolve the running or uncertain workflow request before changing credentials.'
      );
    return { solution, revision };
  }
  async function saveDraft(client, scope, solution, revision, details) {
    const next = rebound(solution, revision, await revisionConnectionRecords(client, solution));
    const saved = (
      await client.query(
        `UPDATE orqaly.solution_revisions SET workflow=$5,workflow_hash=$6,spec=$7,status='draft',
      review=NULL,approved_workflow_hash=NULL,approved_at=NULL,tested_at=NULL,last_error=NULL,row_version=row_version+1,updated_at=clock_timestamp()
      WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4 RETURNING *`,
        [
          scope.tenantId,
          scope.userId,
          solution.id,
          revision.id,
          next.workflow,
          hash(next.workflow),
          next.spec,
        ]
      )
    ).rows[0];
    await event(client, scope, saved, 'saved', {
      connectionSetup: details,
      ...(nativeBundleHash(next) ? { bundleHash: nativeBundleHash(next) } : {}),
    });
  }
  return {
    revisionSetup: async (auth, id, revisionId) => readFor(await owner(auth), id, revisionId),
    async createRevisionConnection(auth, id, revisionId, body, key) {
      const command = CreateSolutionRevisionConnectionSchema.parse(body);
      RevisionConnectionKeySchema.parse(key);
      const scope = await owner(auth);
      let claim;
      try {
        claim = await tx(scope, async (client) => {
          await active(client, scope);
          const solution = await findSolution(client, scope, id, true);
          const revision = await findRevision(client, scope, id, revisionId, true);
          const prior = (await revisionConnectionRecords(client, solution)).find(
            (entry) => entry.revision_id === revisionId && entry.request_key === key
          );
          if (prior) {
            if (prior.request_hash !== hash({ salt: prior.id, command }))
              fail(
                'IDEMPOTENCY_CONFLICT',
                'This request key belongs to a different connection command.'
              );
            return { replayed: true };
          }
          await selected(client, scope, id, revisionId, command);
          const current = await describeRevisionConnectionSetup(
            client,
            scope,
            solution,
            revision,
            runtime
          );
          if (
            current.records.some(
              (entry) =>
                entry.revision_id === revisionId && ['creating', 'revoking'].includes(entry.status)
            )
          )
            fail(
              'REVISION_CONNECTION_PENDING',
              'Finish or reconcile the pending connection request before adding another.'
            );
          const requirement = current.requirements.find(
            (entry) => entry.id === command.requirementId
          );
          if (!requirement?.canConnect || requirement.scopeHash !== command.confirmedScopeHash)
            fail(
              'REVISION_CONNECTION_SCOPE_CHANGED',
              'Refresh and explicitly confirm the current connection destination.'
            );
          try {
            validateNativeCredentialInput(requirement.credentialType, command.credentials);
          } catch {
            fail('REVISION_CONNECTION_FIELDS_INVALID', 'Check the secure credential fields.', 400);
          }
          const connectionId = randomUUID();
          const memberId = requirement.dependencyId ?? '';
          const member = nativeBundleConnectionRequirements({
            workflow: revision.workflow,
            spec: revision.spec ?? revision.base_spec,
          }).find((entry) => entry.id === requirement.id);
          await client.query(
            `INSERT INTO orqaly.solution_revision_connection_members (tenant_id,solution_id,revision_id,owner_user_id,member_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
            [scope.tenantId, id, revisionId, scope.userId, memberId]
          );
          await client.query(
            `INSERT INTO orqaly.solution_revision_connections
            (tenant_id,solution_id,revision_id,owner_user_id,id,member_id,requirement_id,member_requirement_id,environment_id,credential_type,scope,scope_hash,request_key,request_hash,status)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'creating')`,
            [
              scope.tenantId,
              id,
              revisionId,
              scope.userId,
              connectionId,
              memberId,
              requirement.id,
              member.requirement.id,
              solution.environment_id,
              requirement.credentialType,
              requirement.scope,
              requirement.scopeHash,
              key,
              hash({ salt: connectionId, command }),
            ]
          );
          return { solution, revision, connectionId, requirement };
        });
        if (claim.replayed) return await readFor(scope, id, revisionId);
        let providerId = null;
        try {
          const response = await runtime.createNativeCredential(scope, {
            environmentId: claim.solution.environment_id,
            connectionId: claim.connectionId,
            type: claim.requirement.credentialType,
            data: validateNativeCredentialInput(
              claim.requirement.credentialType,
              command.credentials
            ),
            scope: claim.requirement.scope,
          });
          if (response?.status === 'saved' && /^[A-Za-z0-9_-]{1,200}$/.test(response.id || ''))
            providerId = response.id;
        } catch {
          /* A lost creation response never authorizes a second POST. */
        }
        await tx(scope, async (client) => {
          const solution = await findSolution(client, scope, id, true);
          const revision = await findRevision(client, scope, id, revisionId, true);
          const updated = (
            await client.query(
              `UPDATE orqaly.solution_revision_connections SET status=$5,provider_credential_id=$6,row_version=row_version+1,updated_at=clock_timestamp()
            WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4 AND status='creating' RETURNING *`,
              [
                scope.tenantId,
                scope.userId,
                id,
                claim.connectionId,
                providerId ? 'saved' : 'create_unknown',
                providerId,
              ]
            )
          ).rows[0];
          if (!updated) return;
          // The pending-record database guard prevents native/model edits during
          // creation; still recheck before binding a newly confirmed selector.
          if (
            !editable(revision) ||
            revision.row_version !== claim.revision.row_version ||
            revision.workflow_hash !== claim.revision.workflow_hash ||
            (nativeBundleHash({
              workflow: revision.workflow,
              spec: revision.spec ?? revision.base_spec,
            }) || null) !== (command.bundleHash || null)
          )
            return;
          const isActive =
            (await client.query('SELECT status FROM orqaly.tenants WHERE id=$1', [scope.tenantId]))
              .rows[0]?.status === 'active';
          if (isActive)
            await saveDraft(client, scope, solution, revision, {
              connectionId: claim.connectionId,
              status: providerId ? 'saved' : 'create_unknown',
            });
        });
        return await readFor(scope, id, revisionId);
      } finally {
        for (const field of Object.keys(command.credentials)) delete command.credentials[field];
      }
    },
    async revokeRevisionConnection(auth, id, revisionId, body, key) {
      const command = RevokeSolutionRevisionConnectionSchema.parse(body);
      RevisionConnectionKeySchema.parse(key);
      const scope = await owner(auth);
      const requestHash = hash(command);
      const claim = await tx(scope, async (client) => {
        await active(client, scope);
        const solution = await findSolution(client, scope, id, true);
        const revision = await findRevision(client, scope, id, revisionId, true);
        const operation = (
          await client.query(
            `SELECT * FROM orqaly.solution_revision_connection_operations WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND revision_id=$4 AND request_key=$5 FOR UPDATE`,
            [scope.tenantId, scope.userId, id, revisionId, key]
          )
        ).rows[0];
        if (operation && operation.request_hash !== requestHash)
          fail('IDEMPOTENCY_CONFLICT', 'This request key belongs to a different cleanup command.');
        if (['done', 'unknown'].includes(operation?.status) || (operation?.status === 'pending' && !old(operation)))
          return { replayed: true };
        await selected(client, scope, id, revisionId, command);
        const current = await describeRevisionConnectionSetup(
          client,
          scope,
          solution,
          revision,
          runtime
        );
        const record = current.records.find(
          (entry) => entry.id === command.connectionId && entry.revision_id === revisionId
        );
        const descriptor = current.requirements.find(
          (entry) => entry.connectionId === command.connectionId
        );
        if (
          current.records.some(
            (entry) =>
              entry.revision_id === revisionId &&
              entry.id !== command.connectionId &&
              ['creating', 'revoking'].includes(entry.status)
          )
        )
          fail(
            'REVISION_CONNECTION_PENDING',
            'Reconcile the other pending connection request first.'
          );
        if (
          !record ||
          !descriptor?.canRevoke ||
          descriptor.inherited ||
          descriptor.scopeHash !== command.confirmedScopeHash ||
          record.scope_hash !== command.confirmedScopeHash
        )
          fail(
            'REVISION_CONNECTION_REVOKE_DENIED',
            'Only this editable draft’s exact owned connection can be revoked.'
          );
        const attempts =
          (
            await client.query(
              `SELECT COALESCE(SUM(attempts),0) AS attempts FROM orqaly.solution_revision_connection_operations WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND revision_id=$4 AND connection_id=$5`,
              [scope.tenantId, scope.userId, id, revisionId, record.id]
            )
          ).rows[0]?.attempts ?? 0;
        if (Number(attempts) >= 5)
          fail(
            'REVISION_CONNECTION_CLEANUP_LIMIT',
            'Cleanup needs operator review; no more provider requests were sent.'
          );
        if (!operation)
          await client.query(
            `INSERT INTO orqaly.solution_revision_connection_operations (tenant_id,solution_id,revision_id,owner_user_id,connection_id,request_key,request_hash,status) VALUES($1,$2,$3,$4,$5,$6,$7,'pending')`,
            [scope.tenantId, id, revisionId, scope.userId, record.id, key, requestHash]
          );
        else
          await client.query(
            `UPDATE orqaly.solution_revision_connection_operations SET status='pending',attempts=attempts+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND revision_id=$4 AND request_key=$5`,
            [scope.tenantId, scope.userId, id, revisionId, key]
          );
        await client.query(
          `UPDATE orqaly.solution_revision_connections SET status='revoking',row_version=row_version+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4`,
          [scope.tenantId, scope.userId, id, record.id]
        );
        return { solution, revision, record };
      });
      if (claim.replayed) return readFor(scope, id, revisionId);
      let removed = false;
      try {
        const result = await runtime.reconcileNativeCredential(scope, {
          environmentId: claim.record.environment_id,
          connectionId: claim.record.id,
          credentialId: claim.record.provider_credential_id ?? null,
        });
        removed =
          result?.status === 'removed' &&
          (!claim.record.provider_credential_id ||
            result.credentialId === claim.record.provider_credential_id);
      } catch {
        /* Cleanup remains unknown until exact metadata absence is proved. */
      }
      await tx(scope, async (client) => {
        const solution = await findSolution(client, scope, id, true);
        const revision = await findRevision(client, scope, id, revisionId, true);
        await client.query(
          `UPDATE orqaly.solution_revision_connections SET status=$5,revoked_at=CASE WHEN $6 THEN clock_timestamp() ELSE NULL END,row_version=row_version+1,updated_at=clock_timestamp()
          WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4 AND status='revoking'`,
          [
            scope.tenantId,
            scope.userId,
            id,
            claim.record.id,
            removed ? 'revoked' : 'revoke_unknown',
            removed,
          ]
        );
        await client.query(
          `UPDATE orqaly.solution_revision_connection_operations SET status=$6,updated_at=clock_timestamp() WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND revision_id=$4 AND request_key=$5`,
          [scope.tenantId, scope.userId, id, revisionId, key, removed ? 'done' : 'unknown']
        );
        if (editable(revision))
          await saveDraft(client, scope, solution, revision, {
            connectionId: claim.record.id,
            status: removed ? 'revoked' : 'revoke_unknown',
          });
      });
      return readFor(scope, id, revisionId);
    },
  };
}
