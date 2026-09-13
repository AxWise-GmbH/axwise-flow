import crypto from 'node:crypto';
import {
  ApprovalPresentationV1Schema,
  ApprovalSubjectV1Schema,
  approvalSubjectV1Hash,
  buildApprovalPresentationV1,
  sealActionIntentV1,
} from '../domain/approval-contracts.js';
import {
  CANONICALIZATION_ALGORITHM,
  canonicalJson,
  canonicalJsonSha256,
} from '../domain/canonical.js';
import {
  DelegationPolicySnapshotV1Schema,
  assertActionIntentWithinDelegation,
  canonicalEffectTargetCeiling,
  delegationPolicySnapshotV1Hash,
} from '../domain/delegation-contracts.js';
import {
  AgentProfileV1Schema,
  agentProfileV1HashPayload,
  sealAgentProfileV1,
} from '../domain/contracts.js';
import { LifecycleError, promoteAgent, transitionAgent } from '../domain/lifecycle.js';
import { approvalAuditActorTypeForVerifiedPrincipal } from '../auth/principal.js';
import { HttpError, notFound } from '../http/errors.js';

function rowCount(result) {
  return Number(result.rowCount || 0);
}

function assertHumanAgentMutation(principal) {
  if (approvalAuditActorTypeForVerifiedPrincipal(principal) === null) {
    throw new HttpError(403, 'human_principal_required');
  }
}

const DEFAULT_AGENT_AVATAR = Object.freeze({
  kind: 'icon',
  value: 'smart_toy',
  color: '#6750A4',
});
const MAXIMUM_TEMPORARY_AGENT_TTL_MS = 90 * 86_400_000;

const EFFECTIVE_AGENT_STATE_SQL = `case
  when a.agent_kind = 'temporary'
   and a.expires_at is not null
   and a.expires_at <= now()
   and a.state in ('draft', 'proposed', 'active', 'paused')
    then 'expired'
  else a.state
end`;

const AGENT_PROJECTION_SELECT = `
  select a.id, a.display_name, a.agent_kind,
         ${EFFECTIVE_AGENT_STATE_SQL} as state, a.source_task_id,
         a.source_decision_id, a.project_id, a.conversation_id,
         a.originating_run_id, a.workflow_run_id, a.expires_at, a.version, a.created_from,
         a.activated_at, a.paused_at, a.revoked_at, a.archived_at,
         a.created_at, a.updated_at,
         profile.id as profile_id,
         profile.version_number as profile_version_number,
         profile.display_name as profile_display_name,
         profile.role_label as profile_role_label,
         profile.description as profile_description,
         profile.instructions as profile_instructions,
         profile.avatar_kind as profile_avatar_kind,
         profile.avatar_value as profile_avatar_value,
         profile.avatar_color as profile_avatar_color,
         profile.content_hash as profile_content_hash,
         profile.created_by as profile_created_by,
         profile.created_at as profile_created_at,
         persona.contract_version as persona_contract_version,
         persona.persona_id, persona.content_hash as persona_content_hash,
         latest_run.id as latest_run_id,
         latest_run.source_task_id as latest_run_source_task_id,
         latest_run.state as latest_run_state,
         latest_run.created_at as latest_run_created_at,
         latest_run.updated_at as latest_run_updated_at,
         coalesce(run_count.value, 0)::integer as run_count
    from agentic.agents a
    left join lateral (
      select p.*
        from agentic.agent_profile_versions p
       where p.org_id = a.org_id and p.workspace_id = a.workspace_id
         and p.user_id = a.user_id and p.agent_id = a.id
         and (
           a.current_profile_version_id is null
           or p.id = a.current_profile_version_id
         )
       order by p.version_number desc limit 1
    ) profile on true
    left join lateral (
      select contract_version, persona_id, content_hash
        from agentic.agent_persona_versions p
       where p.org_id = a.org_id and p.workspace_id = a.workspace_id
         and p.user_id = a.user_id and p.agent_id = a.id
       order by version_number desc limit 1
    ) persona on true
    left join lateral (
      select r.id, r.source_task_id, r.state, r.created_at, r.updated_at
        from agentic.execution_runs r
       where r.org_id = a.org_id and r.workspace_id = a.workspace_id
         and r.user_id = a.user_id and r.agent_id = a.id
       order by r.updated_at desc, r.id desc limit 1
    ) latest_run on true
    left join lateral (
      select count(*)::integer as value
        from agentic.execution_runs r
       where r.org_id = a.org_id and r.workspace_id = a.workspace_id
         and r.user_id = a.user_id and r.agent_id = a.id
    ) run_count on true`;

function isoTimestamp(value) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function profileFromRow(row) {
  if (!row.profile_id) return null;
  return AgentProfileV1Schema.parse({
    version: 'orqaly_agent_profile_v1',
    id: row.profile_id,
    agentId: row.id,
    versionNumber: Number(row.profile_version_number),
    contentHash: row.profile_content_hash,
    profile: {
      version: 'orqaly_agent_profile_input_v1',
      displayName: row.profile_display_name,
      roleLabel: row.profile_role_label,
      description: row.profile_description,
      instructions: row.profile_instructions,
      avatar: {
        kind: row.profile_avatar_kind,
        value: row.profile_avatar_value,
        color: row.profile_avatar_color,
      },
    },
    createdBy: row.profile_created_by,
    createdAt: isoTimestamp(row.profile_created_at),
  });
}

function agentFromRow(row) {
  return {
    id: row.id,
    display_name: row.display_name,
    agent_kind: row.agent_kind,
    state: row.state,
    source_task_id: row.source_task_id,
    source_decision_id: row.source_decision_id,
    project_id: row.project_id,
    conversation_id: row.conversation_id,
    originating_run_id: row.originating_run_id,
    workflow_run_id: row.workflow_run_id,
    expires_at: isoTimestamp(row.expires_at),
    version: Number(row.version),
    created_from: row.created_from,
    activated_at: isoTimestamp(row.activated_at),
    paused_at: isoTimestamp(row.paused_at),
    revoked_at: isoTimestamp(row.revoked_at),
    archived_at: isoTimestamp(row.archived_at),
    created_at: isoTimestamp(row.created_at),
    updated_at: isoTimestamp(row.updated_at),
    profile: profileFromRow(row),
    persona_contract_version: row.persona_contract_version || null,
    persona_id: row.persona_id || null,
    persona_content_hash: row.persona_content_hash || null,
    run_count: Number(row.run_count || 0),
    latest_run: row.latest_run_id
      ? {
          id: row.latest_run_id,
          source_task_id: row.latest_run_source_task_id,
          state: row.latest_run_state,
          created_at: isoTimestamp(row.latest_run_created_at),
          updated_at: isoTimestamp(row.latest_run_updated_at),
        }
      : null,
  };
}

function boundedTextPrefix(value, maximumLength) {
  const prefix = value.slice(0, maximumLength);
  return /[\uD800-\uDBFF]$/.test(prefix) ? prefix.slice(0, -1) : prefix;
}

function profileInputFromPersona(persona) {
  return {
    version: 'orqaly_agent_profile_input_v1',
    displayName: persona.displayName,
    roleLabel: boundedTextPrefix(persona.role, 160),
    description: boundedTextPrefix(persona.mission, 2_000),
    instructions: persona.mission,
    avatar: DEFAULT_AGENT_AVATAR,
  };
}

export function boundedAgentExpiry(request, now = new Date()) {
  if (request.agentKind !== 'temporary') return null;
  const requested = new Date(request.expiresAt);
  if (!Number.isFinite(requested.getTime()) || requested.getTime() <= now.getTime()) {
    throw new HttpError(400, 'agent_expiry_must_be_future');
  }
  return new Date(
    Math.min(requested.getTime(), now.getTime() + MAXIMUM_TEMPORARY_AGENT_TTL_MS)
  ).toISOString();
}

async function insertAgentProfile(client, principal, agentId, versionNumber, profile, createdAt) {
  const sealed = sealAgentProfileV1({
    id: crypto.randomUUID(),
    agentId,
    versionNumber,
    profile,
    createdBy: principal.userId,
    createdAt,
  });
  await client.query(
    `insert into agentic.agent_profile_versions (
       id, org_id, workspace_id, user_id, agent_id, version_number,
       display_name, role_label, description, instructions,
       avatar_kind, avatar_value, avatar_color, content_hash, created_by, created_at
     ) values (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
     )`,
    [
      sealed.id,
      principal.organizationId,
      principal.workspaceId,
      principal.userId,
      agentId,
      sealed.versionNumber,
      sealed.profile.displayName,
      sealed.profile.roleLabel,
      sealed.profile.description,
      sealed.profile.instructions,
      sealed.profile.avatar.kind,
      sealed.profile.avatar.value,
      sealed.profile.avatar.color,
      sealed.contentHash,
      sealed.createdBy,
      sealed.createdAt,
    ]
  );
  return sealed;
}

async function claimAgentMutation(
  client,
  principal,
  { operation, agentId = null, idempotencyKey, requestHash }
) {
  const inserted = await client.query(
    `insert into agentic.agent_mutation_requests (
       org_id, workspace_id, user_id, operation, agent_id,
       idempotency_key, request_hash
     ) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (org_id, workspace_id, user_id, idempotency_key) do nothing
     returning id`,
    [
      principal.organizationId,
      principal.workspaceId,
      principal.userId,
      operation,
      agentId,
      idempotencyKey,
      requestHash,
    ]
  );
  if (rowCount(inserted) === 1) {
    return { id: inserted.rows[0].id, replayedResponse: null };
  }
  const existing = await client.query(
    `select id, operation, agent_id, request_hash, state, response_payload
       from agentic.agent_mutation_requests
      where org_id = $1 and workspace_id = $2 and user_id = $3
        and idempotency_key = $4
      for update`,
    [principal.organizationId, principal.workspaceId, principal.userId, idempotencyKey]
  );
  if (rowCount(existing) !== 1) throw new HttpError(409, 'agent_mutation_claim_lost');
  const row = existing.rows[0];
  if (row.operation !== operation || row.agent_id !== agentId || row.request_hash !== requestHash) {
    throw new HttpError(409, 'idempotency_key_reused_with_different_request');
  }
  if (row.state === 'completed') {
    return { id: row.id, replayedResponse: row.response_payload };
  }
  throw new HttpError(409, 'agent_mutation_already_in_progress');
}

async function completeAgentMutation(client, mutationId, response) {
  const completed = await client.query(
    `update agentic.agent_mutation_requests
        set state = 'completed', response_payload = $1::jsonb, completed_at = now()
      where id = $2 and state = 'in_progress'`,
    [JSON.stringify(response), mutationId]
  );
  if (rowCount(completed) !== 1) throw new HttpError(409, 'agent_mutation_completion_lost');
}

async function appendAgentEvent(client, principal, agentId, eventType, safePayload) {
  await client.query(
    `insert into agentic.agent_events (
       org_id, workspace_id, user_id, agent_id, event_type,
       actor_type, safe_payload, correlation_id
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      principal.organizationId,
      principal.workspaceId,
      principal.userId,
      agentId,
      eventType,
      approvalAuditActorTypeForVerifiedPrincipal(principal) || principal.actorType,
      JSON.stringify(safePayload),
      principal.requestId,
    ]
  );
}

async function claimMaterialization(client, principal, request, requestHash) {
  const inserted = await client.query(
    `insert into agentic.materialization_requests (
       org_id, workspace_id, user_id, idempotency_key, request_hash
     ) values ($1, $2, $3, $4, $5)
     on conflict (org_id, workspace_id, user_id, idempotency_key) do nothing
     returning id`,
    [
      principal.organizationId,
      principal.workspaceId,
      principal.userId,
      request.idempotencyKey,
      requestHash,
    ]
  );
  if (rowCount(inserted) === 1) {
    return { id: inserted.rows[0].id, replayedResponse: null };
  }

  const existing = await client.query(
    `select id, request_hash, state, response_payload
       from agentic.materialization_requests
      where org_id = $1 and workspace_id = $2 and user_id = $3 and idempotency_key = $4
      for update`,
    [principal.organizationId, principal.workspaceId, principal.userId, request.idempotencyKey]
  );
  if (rowCount(existing) !== 1) throw new HttpError(409, 'materialization_claim_lost');
  const row = existing.rows[0];
  if (row.request_hash !== requestHash) {
    throw new HttpError(409, 'idempotency_key_reused_with_different_request');
  }
  if (row.state === 'completed') {
    return { id: row.id, replayedResponse: row.response_payload };
  }
  throw new HttpError(409, 'materialization_already_in_progress');
}

async function loadAgentProjection(client, agentId) {
  const result = await client.query(`${AGENT_PROJECTION_SELECT}\nwhere a.id = $1`, [agentId]);
  if (rowCount(result) !== 1) throw notFound('agent_not_found');
  return agentFromRow(result.rows[0]);
}

export async function createAgent(client, principal, request) {
  assertHumanAgentMutation(principal);
  const requestHash = canonicalJsonSha256(request);
  const claim = await claimAgentMutation(client, principal, {
    operation: 'create',
    idempotencyKey: request.idempotencyKey,
    requestHash,
  });
  if (claim.replayedResponse) {
    return { ...claim.replayedResponse, replayed: true };
  }

  const agentId = crypto.randomUUID();
  const createdAtDate = new Date();
  const createdAt = createdAtDate.toISOString();
  const expiresAt = boundedAgentExpiry(request, createdAtDate);
  await client.query(
    `insert into agentic.agents (
       id, org_id, workspace_id, user_id, display_name, agent_kind, state,
       source_task_id, conversation_id, workflow_run_id,
       expires_at, created_from, created_at, updated_at
     ) values ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9, $10, $11, $12, $12)`,
    [
      agentId,
      principal.organizationId,
      principal.workspaceId,
      principal.userId,
      request.profile.displayName,
      request.agentKind,
      request.origin?.sourceTaskId || null,
      request.origin?.conversationId || null,
      request.origin?.workflowRunId || null,
      expiresAt,
      request.origin ? 'task' : 'manual',
      createdAt,
    ]
  );
  const profile = await insertAgentProfile(
    client,
    principal,
    agentId,
    1,
    request.profile,
    createdAt
  );
  const linked = await client.query(
    `update agentic.agents
        set current_profile_version_id = $1
      where id = $2 and version = 1 and current_profile_version_id is null`,
    [profile.id, agentId]
  );
  if (rowCount(linked) !== 1) throw new HttpError(409, 'agent_profile_link_conflict');
  await appendAgentEvent(client, principal, agentId, 'agent.created', {
    agentKind: request.agentKind,
    createdFrom: request.origin ? 'task' : 'manual',
    sourceTaskId: request.origin?.sourceTaskId || null,
    conversationId: request.origin?.conversationId || null,
    workflowRunId: request.origin?.workflowRunId || null,
    profileVersionId: profile.id,
    profileHash: profile.contentHash,
  });
  const response = {
    version: 'orqaly_agent_create_result_v1',
    agent: await loadAgentProjection(client, agentId),
    replayed: false,
  };
  await completeAgentMutation(client, claim.id, response);
  return response;
}

export async function getAgent(client, agentId) {
  return loadAgentProjection(client, agentId);
}

export async function updateAgentProfile(
  client,
  principal,
  agentId,
  expectedAgentVersion,
  request
) {
  assertHumanAgentMutation(principal);
  const requestHash = canonicalJsonSha256({
    request,
    expectedAgentVersion,
  });
  // Resolve the target through tenant RLS before inserting an idempotency row whose
  // composite FK names that Agent. Otherwise a missing or foreign-tenant ID raises a
  // raw PostgreSQL 23503 and turns the intentionally non-leaking 404 into a 500.
  const locked = await client.query(
    `select a.id, ${EFFECTIVE_AGENT_STATE_SQL} as state,
            a.version::integer as version,
            profile.version_number as profile_version_number,
            profile.content_hash as profile_content_hash
       from agentic.agents a
       left join agentic.agent_profile_versions profile
         on profile.org_id = a.org_id and profile.workspace_id = a.workspace_id
        and profile.user_id = a.user_id and profile.id = a.current_profile_version_id
      where a.id = $1
      for update of a`,
    [agentId]
  );
  if (rowCount(locked) !== 1) throw notFound('agent_not_found');
  const claim = await claimAgentMutation(client, principal, {
    operation: 'profile_update',
    agentId,
    idempotencyKey: request.idempotencyKey,
    requestHash,
  });
  if (claim.replayedResponse) {
    return { ...claim.replayedResponse, replayed: true };
  }
  const agent = locked.rows[0];
  if (agent.version !== expectedAgentVersion) {
    throw new HttpError(409, 'agent_version_conflict', {
      expected: expectedAgentVersion,
      actual: agent.version,
    });
  }
  if (['revoked', 'expired', 'archived'].includes(agent.state)) {
    throw new HttpError(409, 'agent_profile_not_editable', { state: agent.state });
  }

  const nextHash = canonicalJsonSha256(agentProfileV1HashPayload(request.profile));
  if (agent.profile_content_hash === nextHash) {
    const response = {
      version: 'orqaly_agent_profile_update_result_v1',
      agent: await loadAgentProjection(client, agentId),
      unchanged: true,
      replayed: false,
    };
    await completeAgentMutation(client, claim.id, response);
    return response;
  }

  const profile = await insertAgentProfile(
    client,
    principal,
    agentId,
    Number(agent.profile_version_number || 0) + 1,
    request.profile,
    new Date().toISOString()
  );
  const updated = await client.query(
    `update agentic.agents
        set display_name = $1, current_profile_version_id = $2,
            version = version + 1, updated_at = now()
      where id = $3 and version = $4
      returning version::integer as version`,
    [profile.profile.displayName, profile.id, agentId, expectedAgentVersion]
  );
  if (rowCount(updated) !== 1) throw new HttpError(409, 'agent_version_conflict');
  await appendAgentEvent(client, principal, agentId, 'agent.profile_updated', {
    previousProfileHash: agent.profile_content_hash || null,
    profileVersionId: profile.id,
    profileVersion: profile.versionNumber,
    profileHash: profile.contentHash,
  });
  const response = {
    version: 'orqaly_agent_profile_update_result_v1',
    agent: await loadAgentProjection(client, agentId),
    unchanged: false,
    replayed: false,
  };
  await completeAgentMutation(client, claim.id, response);
  return response;
}

function lifecycleTarget(agent, action) {
  try {
    if (action === 'promote') {
      const promoted = promoteAgent({ kind: agent.agent_kind, state: agent.state });
      return {
        kind: promoted.kind,
        state: promoted.state,
        expiresAt: promoted.expiresAt,
      };
    }
    const stateByAction = {
      propose: 'proposed',
      activate: 'active',
      pause: 'paused',
      resume: 'active',
      revoke: 'revoked',
      archive: 'archived',
    };
    const state = transitionAgent(agent.state, stateByAction[action]);
    return { kind: agent.agent_kind, state, expiresAt: agent.expires_at };
  } catch (error) {
    if (!(error instanceof LifecycleError)) throw error;
    throw new HttpError(409, error.code, error.details);
  }
}

export async function changeAgentLifecycle(
  client,
  principal,
  agentId,
  expectedAgentVersion,
  request
) {
  assertHumanAgentMutation(principal);
  const requestHash = canonicalJsonSha256({ request, expectedAgentVersion });
  // Keep target discovery before the mutation-request FK for the same reason as
  // profile updates: RLS must collapse missing and out-of-scope IDs to one 404.
  const locked = await client.query(
    `select a.id, a.agent_kind, ${EFFECTIVE_AGENT_STATE_SQL} as state,
            a.expires_at, a.version::integer as version
       from agentic.agents a where a.id = $1 for update`,
    [agentId]
  );
  if (rowCount(locked) !== 1) throw notFound('agent_not_found');
  const claim = await claimAgentMutation(client, principal, {
    operation: 'lifecycle',
    agentId,
    idempotencyKey: request.idempotencyKey,
    requestHash,
  });
  if (claim.replayedResponse) {
    return { ...claim.replayedResponse, replayed: true };
  }
  const agent = locked.rows[0];
  if (agent.version !== expectedAgentVersion) {
    throw new HttpError(409, 'agent_version_conflict', {
      expected: expectedAgentVersion,
      actual: agent.version,
    });
  }
  const target = lifecycleTarget(agent, request.action);
  const updated = await client.query(
    `update agentic.agents
        set agent_kind = $1,
            state = $2,
            expires_at = $3,
            activated_at = case
              when $2 = 'active' then coalesce(activated_at, now())
              else activated_at
            end,
            paused_at = case
              when $2 = 'paused' then now()
              when $2 = 'active' then null
              else paused_at
            end,
            revoked_at = case when $2 = 'revoked' then now() else revoked_at end,
            archived_at = case when $2 = 'archived' then now() else archived_at end,
            version = version + 1,
            updated_at = now()
      where id = $4 and version = $5
      returning version::integer as version`,
    [target.kind, target.state, target.expiresAt, agentId, expectedAgentVersion]
  );
  if (rowCount(updated) !== 1) throw new HttpError(409, 'agent_version_conflict');
  await appendAgentEvent(client, principal, agentId, 'agent.lifecycle_changed', {
    action: request.action,
    fromKind: agent.agent_kind,
    toKind: target.kind,
    fromState: agent.state,
    toState: target.state,
    reasonProvided: Boolean(request.reason),
  });
  const response = {
    version: 'orqaly_agent_lifecycle_result_v1',
    agent: await loadAgentProjection(client, agentId),
    replayed: false,
  };
  await completeAgentMutation(client, claim.id, response);
  return response;
}

export async function listAgentRuns(client, agentId, { limit = 50 } = {}) {
  const exists = await client.query('select id from agentic.agents where id = $1', [agentId]);
  if (rowCount(exists) !== 1) throw notFound('agent_not_found');
  const result = await client.query(
    `select id, source_task_id, team_id, plan_id, plan_version_id, state,
            requested_by, budget_minor, reserved_minor, spent_minor, currency,
            deadline_at, started_at, terminal_at, version, created_at, updated_at
       from agentic.execution_runs
      where agent_id = $1
      order by updated_at desc, id desc
      limit $2`,
    [agentId, limit]
  );
  return result.rows.map((run) => ({
    ...run,
    budget_minor: run.budget_minor === null ? null : Number(run.budget_minor),
    reserved_minor: Number(run.reserved_minor),
    spent_minor: Number(run.spent_minor),
    version: Number(run.version),
    deadline_at: isoTimestamp(run.deadline_at),
    started_at: isoTimestamp(run.started_at),
    terminal_at: isoTimestamp(run.terminal_at),
    created_at: isoTimestamp(run.created_at),
    updated_at: isoTimestamp(run.updated_at),
  }));
}

function descriptorSetHash(plan) {
  const descriptors = plan.nodes
    .map((step) => step.descriptor)
    .sort((left, right) =>
      `${left.descriptorKey}:${left.schemaVersion}:${left.contentHash}`.localeCompare(
        `${right.descriptorKey}:${right.schemaVersion}:${right.contentHash}`
      )
    );
  return canonicalJsonSha256(descriptors);
}

function planBudget(plan) {
  const amounts = plan.nodes.map((node) => node.limits.maximumCostMinor);
  const currencies = new Set(plan.nodes.map((node) => node.limits.currency));
  if (currencies.size !== 1) throw new HttpError(400, 'mixed_plan_currencies_not_supported');
  return {
    amount: amounts.reduce((total, amount) => total + amount, 0),
    currency: [...currencies][0],
  };
}

function uniqueCanonical(values) {
  const byCanonicalValue = new Map();
  for (const value of values) byCanonicalValue.set(canonicalJson(value), value);
  return [...byCanonicalValue.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

export function delegationPolicies(plan, run) {
  const nodesByAgent = new Map();
  for (const node of plan.nodes) {
    const nodes = nodesByAgent.get(node.assignedAgentId) || [];
    nodes.push(node);
    nodesByAgent.set(node.assignedAgentId, nodes);
  }

  return [...nodesByAgent.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([agentId, nodes]) => {
      const currencies = new Set(nodes.map((node) => node.limits.currency));
      if (currencies.size !== 1) {
        throw new HttpError(400, 'delegation_currency_invalid', { agentId });
      }
      const allowedDataClasses = [
        ...new Set(
          nodes.flatMap((node) => [
            ...node.dataEgressProfile.permittedInputClassifications,
            ...node.dataEgressProfile.permittedOutputClassifications,
          ])
        ),
      ].sort();
      const allowedDescriptorFamilies = [
        ...new Set(nodes.map((node) => node.descriptor.descriptorKey)),
      ].sort();
      const allowedEffectProfiles = uniqueCanonical(nodes.map((node) => node.effectProfile));
      const allowedTargets = canonicalEffectTargetCeiling(
        nodes.flatMap((node) => node.externalAction?.targets || [])
      );
      const maximumCostMinor = nodes.reduce(
        (total, node) => total + node.limits.maximumCostMinor,
        0
      );
      const currency = [...currencies][0];
      const policySnapshot = DelegationPolicySnapshotV1Schema.parse({
        version: 'orqaly_agent_delegation_policy_v1',
        contractVersion: '1.0',
        canonicalization: CANONICALIZATION_ALGORITHM,
        runId: run.id,
        planId: run.plan_id,
        planVersionId: run.planVersionId,
        agentId,
        sourceTaskId: run.source_task_id,
        authorityCeiling: {
          allowedDescriptorFamilies,
          allowedEffectProfiles,
          allowedTargets,
          allowedDataClasses,
          maximumCostMinor,
          currency,
        },
        nodes: nodes
          .map((node) => ({
            nodeId: node.nodeId,
            stepKind: node.stepKind,
            descriptor: node.descriptor,
            executorBinding: node.executorBinding,
            personaVersion: node.personaVersion,
            canonicalInputHash: node.canonicalInputHash,
            expectedOutputSchemaHash: node.expectedOutputSchemaHash,
            effectProfile: node.effectProfile,
            dataEgressProfile: node.dataEgressProfile,
            externalAction: node.externalAction || null,
            limits: node.limits,
            deadline: node.deadline,
          }))
          .sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
      });
      const authorityCeiling = policySnapshot.authorityCeiling;
      return {
        agentId,
        nodes,
        allowedDescriptorFamilies: authorityCeiling.allowedDescriptorFamilies,
        allowedEffectProfiles: authorityCeiling.allowedEffectProfiles,
        allowedTargets: authorityCeiling.allowedTargets,
        allowedDataClasses: authorityCeiling.allowedDataClasses,
        maximumCostMinor: authorityCeiling.maximumCostMinor,
        currency: authorityCeiling.currency,
        policySnapshot,
        policyHash: delegationPolicySnapshotV1Hash(policySnapshot),
      };
    });
}

function effectRisks(effectProfile) {
  const risks = effectProfile.flags.map((flag) => flag.replaceAll('_', ' '));
  if (effectProfile.externality === 'write') {
    risks.unshift(`external ${effectProfile.mutation} operation`);
  } else if (effectProfile.externality === 'read') {
    risks.unshift('external provider read');
  }
  return [...new Set(risks)];
}

async function persistActionIntent(
  client,
  principal,
  run,
  plan,
  planVersionId,
  stepId,
  node,
  persona,
  delegation,
  createdAt
) {
  if (!node.externalAction) return null;
  if (node.externalAction.connection.credentialOwnerPrincipalId !== principal.userId) {
    throw new HttpError(400, 'connection_owner_mismatch', {
      nodeId: node.nodeId,
    });
  }

  const intent = sealActionIntentV1({
    version: 'orqaly_action_intent_v1',
    contractVersion: '1.0',
    canonicalization: CANONICALIZATION_ALGORITHM,
    organizationId: principal.organizationId,
    workspaceId: principal.workspaceId,
    principalId: principal.userId,
    actionIntentId: crypto.randomUUID(),
    effectId: node.externalAction.effectId,
    runId: run.id,
    stepId,
    stepKind: node.stepKind,
    agentId: node.assignedAgentId,
    personaVersion: {
      contractVersion: node.personaVersion.contractVersion,
      personaVersionId: persona.id,
      personaId: node.personaVersion.personaId,
      personaVersion: node.personaVersion.personaVersion,
      contentHash: node.personaVersion.contentHash,
    },
    planVersion: {
      planId: run.plan_id,
      planVersionId,
      planVersion: plan.planVersion,
      contentHash: plan.contentHash,
    },
    delegation: {
      delegationId: delegation.id,
      version: delegation.version,
      policyHash: delegation.policyHash,
    },
    descriptor: node.descriptor,
    executorBinding: node.executorBinding,
    canonicalParameters: node.canonicalInput,
    canonicalInputHash: node.canonicalInputHash,
    effectProfile: node.effectProfile,
    dataEgressProfile: node.dataEgressProfile,
    targets: node.externalAction.targets,
    externalPreconditions: node.externalAction.externalPreconditions,
    connection: node.externalAction.connection,
    providerOperation: node.externalAction.providerOperation,
    idempotency: node.externalAction.idempotency,
    policy: {
      policyId: 'agent_delegation_policy',
      policyVersion: '1',
      contentHash: delegation.policyHash,
    },
    reconciliation: node.externalAction.reconciliation,
    compensation: node.externalAction.compensation,
    createdAt,
  });
  try {
    assertActionIntentWithinDelegation(intent, node.nodeId, delegation);
  } catch (error) {
    if (error?.code !== 'action_intent_outside_delegation') throw error;
    throw new HttpError(400, error.code, {
      nodeId: node.nodeId,
      reason: error.reason,
    });
  }

  const columns = [
    'id',
    'org_id',
    'workspace_id',
    'user_id',
    'principal_id',
    'effect_id',
    'run_id',
    'step_id',
    'step_kind',
    'plan_id',
    'plan_version_id',
    'plan_version_number',
    'plan_content_hash',
    'agent_id',
    'persona_version_id',
    'persona_contract_version',
    'persona_id',
    'persona_version_number',
    'persona_content_hash',
    'delegation_id',
    'delegation_version',
    'delegation_policy_hash',
    'descriptor_key',
    'descriptor_version',
    'descriptor_hash',
    'executor_binding_key',
    'executor_binding_version',
    'executor_binding_hash',
    'canonical_parameters',
    'canonical_input_hash',
    'effect_profile',
    'data_egress_profile',
    'targets',
    'external_preconditions',
    'connection_reference',
    'provider_key',
    'credential_owner_principal_id',
    'requested_scopes',
    'provider_operation_key',
    'provider_operation_version',
    'provider_operation_hash',
    'idempotency_scope',
    'idempotency_key',
    'policy_id',
    'policy_version',
    'policy_hash',
    'reconciliation_policy',
    'compensation_policy',
    'contract_version',
    'canonicalization',
    'hash_domain',
    'intent_snapshot',
    'intent_hash',
    'created_at',
  ];
  const values = [
    intent.actionIntentId,
    principal.organizationId,
    principal.workspaceId,
    principal.userId,
    principal.userId,
    intent.effectId,
    run.id,
    stepId,
    node.stepKind,
    run.plan_id,
    planVersionId,
    plan.planVersion,
    plan.contentHash,
    node.assignedAgentId,
    persona.id,
    intent.personaVersion.contractVersion,
    intent.personaVersion.personaId,
    Number(intent.personaVersion.personaVersion),
    intent.personaVersion.contentHash,
    delegation.id,
    delegation.version,
    delegation.policyHash,
    node.descriptor.descriptorKey,
    node.descriptor.schemaVersion,
    node.descriptor.contentHash,
    node.executorBinding.bindingKey,
    node.executorBinding.bindingVersion,
    node.executorBinding.contentHash,
    JSON.stringify(intent.canonicalParameters),
    intent.canonicalInputHash,
    JSON.stringify(intent.effectProfile),
    JSON.stringify(intent.dataEgressProfile),
    JSON.stringify(intent.targets),
    JSON.stringify(intent.externalPreconditions),
    intent.connection.connectionReference,
    intent.connection.providerKey,
    intent.connection.credentialOwnerPrincipalId,
    JSON.stringify(intent.connection.requestedScopes),
    intent.providerOperation.operationKey,
    intent.providerOperation.operationVersion,
    intent.providerOperation.contentHash,
    intent.idempotency.scope,
    intent.idempotency.key,
    intent.policy.policyId,
    intent.policy.policyVersion,
    intent.policy.contentHash,
    JSON.stringify(intent.reconciliation),
    JSON.stringify(intent.compensation),
    intent.contractVersion,
    intent.canonicalization,
    'orqaly.action-intent.v1',
    JSON.stringify(intent),
    intent.contentHash,
    intent.createdAt,
  ];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
  await client.query(
    `insert into agentic.action_intents (${columns.join(', ')})
     values (${placeholders})`,
    values
  );
  return intent;
}

export async function materializeAgentTeam(client, principal, request) {
  const requestHash = canonicalJsonSha256(request);
  const claim = await claimMaterialization(client, principal, request, requestHash);
  if (claim.replayedResponse) {
    return { ...claim.replayedResponse, replayed: true };
  }

  const tenant = [principal.organizationId, principal.workspaceId, principal.userId];
  const materializedAt = new Date();
  const materializedExpiry =
    request.agentKind === 'temporary'
      ? new Date(materializedAt.getTime() + MAXIMUM_TEMPORARY_AGENT_TTL_MS).toISOString()
      : null;
  const agentIds = new Map();
  for (const member of request.team) {
    const inserted = await client.query(
      `insert into agentic.agents (
         org_id, workspace_id, user_id, display_name, agent_kind, state,
         source_task_id, source_decision_id, project_id, conversation_id, expires_at
       ) values ($1, $2, $3, $4, $5, 'proposed', $6, $7, $8, $9, $10)
       returning id`,
      [
        ...tenant,
        member.persona.displayName,
        request.agentKind,
        request.sourceTask.taskId,
        request.plan.sourceDecisionId,
        request.sourceTask.projectId,
        request.sourceTask.conversationId,
        materializedExpiry,
      ]
    );
    const agentId = inserted.rows[0].id;
    agentIds.set(member.agentRef, agentId);
    await client.query(
      `insert into agentic.agent_persona_versions (
         org_id, workspace_id, user_id, agent_id, version_number,
         contract_version, persona_id, content_hash, manifest, source_decision_id
       ) values ($1, $2, $3, $4, 1, $5, $6, $7, $8::jsonb, $9)`,
      [
        ...tenant,
        agentId,
        member.persona.version,
        member.persona.personaId,
        member.persona.contentHash,
        JSON.stringify(member.persona),
        request.plan.sourceDecisionId,
      ]
    );
    const profile = await insertAgentProfile(
      client,
      principal,
      agentId,
      1,
      profileInputFromPersona(member.persona),
      materializedAt.toISOString()
    );
    const linkedProfile = await client.query(
      `update agentic.agents
          set current_profile_version_id = $1
        where id = $2 and current_profile_version_id is null`,
      [profile.id, agentId]
    );
    if (rowCount(linkedProfile) !== 1) {
      throw new HttpError(409, 'agent_profile_link_conflict');
    }
    await appendAgentEvent(client, principal, agentId, 'agent.created', {
      agentKind: request.agentKind,
      profileVersionId: profile.id,
      profileHash: profile.contentHash,
    });
  }

  const coordinatorAgentId = agentIds.get(request.coordinatorAgentRef);
  const teamInsert = await client.query(
    `insert into agentic.agent_teams (
       org_id, workspace_id, user_id, source_task_id, display_name,
       state, coordinator_agent_id, maximum_members, maximum_depth
     ) values ($1, $2, $3, $4, $5, 'proposed', $6, $7, 2)
     returning id`,
    [
      ...tenant,
      request.sourceTask.taskId,
      `${request.sourceTask.title} Agent team`,
      coordinatorAgentId,
      request.team.length,
    ]
  );
  const teamId = teamInsert.rows[0].id;

  for (const member of request.team) {
    const agentId = agentIds.get(member.agentRef);
    await client.query(
      `insert into agentic.agent_team_memberships (
         org_id, workspace_id, user_id, team_id, agent_id, parent_agent_id,
         member_role, allowed_descriptor_families, allowed_effect_profiles
       ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
      [
        ...tenant,
        teamId,
        agentId,
        member.parentAgentRef ? agentIds.get(member.parentAgentRef) : null,
        member.role,
        JSON.stringify(member.allowedDescriptorFamilies),
        JSON.stringify(member.allowedEffectProfiles),
      ]
    );
  }

  const planInsert = await client.query(
    `insert into agentic.execution_plans (
       org_id, workspace_id, user_id, source_task_id, source_decision_id,
       owner_agent_id, team_id, state, current_version_number
     ) values ($1, $2, $3, $4, $5, $6, $7, 'draft', 0)
     returning id`,
    [
      ...tenant,
      request.sourceTask.taskId,
      request.plan.sourceDecisionId,
      coordinatorAgentId,
      teamId,
    ]
  );
  const planId = planInsert.rows[0].id;
  const proposalInsert = await client.query(
    `insert into agentic.execution_plan_proposals (
       org_id, workspace_id, user_id, plan_id, source_contract_version,
       content_hash, proposal
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)
     returning id`,
    [
      ...tenant,
      planId,
      request.plan.version,
      request.plan.contentHash,
      JSON.stringify(request.plan),
    ]
  );
  const proposalId = proposalInsert.rows[0].id;
  const runInsert = await client.query(
    `insert into agentic.execution_runs (
       org_id, workspace_id, user_id, source_task_id, agent_id, team_id,
       plan_id, plan_version_id, state, requested_by, budget_minor, currency
     ) values ($1, $2, $3, $4, $5, $6, $7, null,
               'planning', $8, null, null)
     returning id, state, version::integer as version`,
    [...tenant, request.sourceTask.taskId, coordinatorAgentId, teamId, planId, principal.userId]
  );
  const runId = runInsert.rows[0].id;

  await client.query(
    `update agentic.agents
        set originating_run_id = $1, updated_at = now()
      where org_id = $2 and workspace_id = $3 and user_id = $4
        and id = any($5::uuid[])`,
    [runId, ...tenant, [...agentIds.values()]]
  );

  const response = {
    version: 'orqaly_materialization_result_v1',
    agentIds: Object.fromEntries(agentIds),
    coordinatorAgentId,
    teamId,
    planId,
    proposalId,
    planVersionId: null,
    runId,
    stepIds: {},
    state: runInsert.rows[0].state,
    runVersion: runInsert.rows[0].version,
    replayed: false,
  };
  await client.query(
    `update agentic.materialization_requests
        set state = 'completed', response_payload = $1::jsonb, completed_at = now()
      where org_id = $2 and workspace_id = $3 and user_id = $4 and id = $5`,
    [JSON.stringify(response), ...tenant, claim.id]
  );
  return response;
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertIndependentReviewers(plan, memberships) {
  const parentByAgent = new Map(
    memberships.map((member) => [member.agent_id, member.parent_agent_id])
  );
  const ancestors = (agentId) => {
    const values = new Set();
    let cursor = parentByAgent.get(agentId);
    while (cursor && !values.has(cursor)) {
      values.add(cursor);
      cursor = parentByAgent.get(cursor);
    }
    return values;
  };
  for (const node of plan.nodes) {
    if (
      node.reviewerAgentId &&
      (ancestors(node.assignedAgentId).has(node.reviewerAgentId) ||
        ancestors(node.reviewerAgentId).has(node.assignedAgentId))
    ) {
      throw new HttpError(400, 'reviewer_not_independent', { nodeId: node.nodeId });
    }
  }
}

function proposalEffectFamily(effectProfile) {
  if (effectProfile.externality === 'none') return 'none';
  if (effectProfile.externality === 'read') return 'external_read';
  if (effectProfile.flags.includes('financial')) return 'spend';
  if (effectProfile.flags.includes('publication')) return 'publication';
  if (
    effectProfile.flags.includes('communication') ||
    effectProfile.flags.includes('external_disclosure')
  ) {
    return 'external_communication';
  }
  if (
    effectProfile.mutation === 'delete' ||
    effectProfile.flags.includes('destructive') ||
    effectProfile.flags.includes('irreversible')
  ) {
    return 'irreversible_write';
  }
  return 'reversible_write';
}

function assertProposalBounds(plan, memberships) {
  const membershipByAgent = new Map(
    memberships.map((membership) => [membership.agent_id, membership])
  );
  for (const node of plan.nodes) {
    const membership = membershipByAgent.get(node.assignedAgentId);
    if (!membership) {
      throw new HttpError(400, 'assigned_agent_outside_proposal_team', {
        nodeId: node.nodeId,
      });
    }
    const descriptorFamilies = new Set(membership.allowed_descriptor_families || []);
    if (
      !descriptorFamilies.has(node.stepKind) &&
      !descriptorFamilies.has(node.descriptor.descriptorKey)
    ) {
      throw new HttpError(400, 'proposal_descriptor_boundary_exceeded', {
        nodeId: node.nodeId,
        agentId: node.assignedAgentId,
        stepKind: node.stepKind,
        descriptorKey: node.descriptor.descriptorKey,
      });
    }
    const effectFamily = proposalEffectFamily(node.effectProfile);
    if (!(membership.allowed_effect_profiles || []).includes(effectFamily)) {
      throw new HttpError(400, 'proposal_effect_boundary_exceeded', {
        nodeId: node.nodeId,
        agentId: node.assignedAgentId,
        effectFamily,
      });
    }
  }
}

async function replayedPlanSubmission(client, planId, submission) {
  const existing = await client.query(
    `select id, content_hash, version_number
       from agentic.execution_plan_versions
      where plan_id = $1 and submission_key = $2`,
    [planId, submission.idempotencyKey]
  );
  if (!rowCount(existing)) return null;
  if (existing.rows[0].content_hash !== submission.plan.contentHash) {
    throw new HttpError(409, 'idempotency_key_reused_with_different_plan');
  }
  return existing.rows[0];
}

export async function submitExecutionPlanV2(
  client,
  principal,
  runId,
  expectedRunVersion,
  submission,
  { approvalTtlSeconds = 86_400 } = {}
) {
  const locked = await client.query(
    `select r.id, r.source_task_id, r.agent_id, r.team_id, r.plan_id, r.state,
            r.version::integer as version,
            p.source_decision_id, p.current_version_number,
            proposal.proposal ->> 'planId' as source_plan_id,
            proposal.content_hash as source_content_hash
       from agentic.execution_runs r
       join agentic.execution_plans p
         on p.org_id = r.org_id and p.workspace_id = r.workspace_id
        and p.user_id = r.user_id and p.id = r.plan_id
       join lateral (
         select ep.proposal, ep.content_hash
           from agentic.execution_plan_proposals ep
          where ep.org_id = p.org_id and ep.workspace_id = p.workspace_id
            and ep.user_id = p.user_id and ep.plan_id = p.id
          order by ep.created_at desc limit 1
       ) proposal on true
      where r.id = $1
      for update of r, p`,
    [runId]
  );
  if (rowCount(locked) !== 1) throw notFound('run_not_found');
  const run = locked.rows[0];

  const replay = await replayedPlanSubmission(client, run.plan_id, submission);
  if (replay) {
    const [steps, approvalResult] = await Promise.all([
      client.query(
        `select s.node_id, s.id, ai.id as action_intent_id
           from agentic.execution_steps s
           left join agentic.action_intents ai
             on ai.org_id = s.org_id and ai.workspace_id = s.workspace_id
            and ai.user_id = s.user_id and ai.run_id = s.run_id
            and ai.step_id = s.id
          where s.run_id = $1 and s.plan_version_id = $2
          order by s.node_id`,
        [runId, replay.id]
      ),
      client.query(
        `select id, approval_subject_id, subject_hash, expires_at,
                version::integer as version
           from agentic.approval_requests
          where run_id = $1 and subject_kind = 'plan'
            and subject_snapshot -> 'planVersion' ->> 'planVersionId' = $2
          order by created_at desc limit 1`,
        [runId, replay.id]
      ),
    ]);
    const approval = approvalResult.rows[0] || null;
    return {
      version: 'orqaly_plan_version_result_v1',
      planId: run.plan_id,
      planVersionId: replay.id,
      planVersion: replay.version_number,
      runId,
      runVersion: run.version,
      state: run.state,
      approval: approval
        ? {
            id: approval.id,
            subjectId: approval.approval_subject_id,
            bindingHash: approval.subject_hash,
            expiresAt: approval.expires_at,
            version: approval.version,
          }
        : null,
      stepIds: Object.fromEntries(steps.rows.map((row) => [row.node_id, row.id])),
      actionIntentIds: Object.fromEntries(
        steps.rows
          .filter((row) => row.action_intent_id)
          .map((row) => [row.node_id, row.action_intent_id])
      ),
      replayed: true,
    };
  }

  if (run.version !== expectedRunVersion) {
    throw new HttpError(409, 'run_version_conflict', {
      expected: expectedRunVersion,
      actual: run.version,
    });
  }
  if (run.state !== 'planning') {
    throw new HttpError(409, 'run_not_accepting_materialized_plan', { state: run.state });
  }

  const plan = submission.plan;
  if (plan.sourceDecisionId !== run.source_decision_id) {
    throw new HttpError(400, 'source_decision_mismatch');
  }
  if (plan.sourcePlanId !== run.source_plan_id) {
    throw new HttpError(400, 'source_plan_mismatch');
  }
  if (plan.sourceContentHash !== run.source_content_hash) {
    throw new HttpError(400, 'source_content_hash_mismatch');
  }
  if (plan.planVersion !== run.current_version_number + 1) {
    throw new HttpError(409, 'plan_version_sequence_invalid', {
      expected: run.current_version_number + 1,
      actual: plan.planVersion,
    });
  }
  if (plan.owningAgentId !== run.agent_id || plan.teamId !== run.team_id) {
    throw new HttpError(400, 'plan_ownership_mismatch');
  }

  const membershipsResult = await client.query(
    `select agent_id, parent_agent_id,
            allowed_descriptor_families, allowed_effect_profiles
       from agentic.agent_team_memberships
      where team_id = $1 and left_at is null order by agent_id::text`,
    [run.team_id]
  );
  const membershipIds = membershipsResult.rows.map((row) => row.agent_id);
  if (!sameValues(plan.teamMemberIds, membershipIds)) {
    throw new HttpError(400, 'plan_team_membership_mismatch');
  }
  assertIndependentReviewers(plan, membershipsResult.rows);
  assertProposalBounds(plan, membershipsResult.rows);

  const personaResult = await client.query(
    `select distinct on (agent_id)
            id, agent_id, version_number, persona_id, content_hash
       from agentic.agent_persona_versions
      where agent_id = any($1::uuid[])
      order by agent_id, version_number desc`,
    [plan.teamMemberIds]
  );
  const personaByAgent = new Map(personaResult.rows.map((row) => [row.agent_id, row]));
  for (const node of plan.nodes) {
    const stored = personaByAgent.get(node.assignedAgentId);
    if (!stored) {
      throw new HttpError(400, 'assigned_agent_persona_missing', {
        nodeId: node.nodeId,
      });
    }
    if (
      stored.persona_id !== node.personaVersion.personaId ||
      String(stored.version_number) !== node.personaVersion.personaVersion ||
      stored.content_hash !== node.personaVersion.contentHash
    ) {
      throw new HttpError(400, 'assigned_agent_persona_mismatch', {
        nodeId: node.nodeId,
      });
    }
  }

  const tenant = [principal.organizationId, principal.workspaceId, principal.userId];
  const planVersionInsert = await client.query(
    `insert into agentic.execution_plan_versions (
       org_id, workspace_id, user_id, plan_id, submission_key, version_number,
       contract_version, canonicalization, content_hash, descriptor_set_hash, dag
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     returning id`,
    [
      ...tenant,
      run.plan_id,
      submission.idempotencyKey,
      plan.planVersion,
      plan.version,
      plan.canonicalization,
      plan.contentHash,
      descriptorSetHash(plan),
      JSON.stringify(plan),
    ]
  );
  const planVersionId = planVersionInsert.rows[0].id;
  const delegationIds = new Map();
  for (const policy of delegationPolicies(plan, {
    ...run,
    planVersionId,
  })) {
    const delegationInsert = await client.query(
      `insert into agentic.agent_delegations (
         org_id, workspace_id, user_id, agent_id, source_task_id,
         plan_version_id, run_id, allowed_descriptor_families,
         allowed_effect_profiles, allowed_targets, allowed_data_classes,
         maximum_cost_minor, currency, policy_snapshot, policy_hash
       ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb,
                 $10::jsonb, $11::jsonb, $12, $13, $14::jsonb, $15)
       returning id, authority_version::integer as authority_version`,
      [
        ...tenant,
        policy.agentId,
        run.source_task_id,
        planVersionId,
        runId,
        JSON.stringify(policy.allowedDescriptorFamilies),
        JSON.stringify(policy.allowedEffectProfiles),
        JSON.stringify(policy.allowedTargets),
        JSON.stringify(policy.allowedDataClasses),
        policy.maximumCostMinor,
        policy.currency,
        JSON.stringify(policy.policySnapshot),
        policy.policyHash,
      ]
    );
    const delegation = {
      id: delegationInsert.rows[0].id,
      version: delegationInsert.rows[0].authority_version,
      policyHash: policy.policyHash,
      agentId: policy.agentId,
      allowedTargets: policy.allowedTargets,
      policySnapshot: policy.policySnapshot,
    };
    delegationIds.set(policy.agentId, delegation);
  }
  const stepIds = {};
  const stepBindings = [];
  for (const node of plan.nodes) {
    const inserted = await client.query(
      `insert into agentic.execution_steps (
         org_id, workspace_id, user_id, run_id, plan_version_id, node_id,
         step_kind, descriptor_key, descriptor_version, descriptor_hash,
         executor_binding_key, executor_binding_version, executor_binding_hash,
         effect_profile, data_egress_profile, dependencies, assigned_agent_id,
         persona_version_id, persona_contract_version, persona_id,
         persona_version_number, persona_content_hash, reviewer_agent_id,
         input_payload, input_hash, expected_output_schema_hash,
         delegation_id, requires_distinct_reviewer, maximum_turns, maximum_tokens,
         maximum_tool_calls, maximum_duration_seconds, maximum_attempts,
         maximum_cost_minor, currency, deadline_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 $14::jsonb, $15::jsonb, $16::jsonb, $17, $18, $19, $20,
                 $21, $22, $23, $24::jsonb, $25, $26, $27, $28, $29, $30,
                 $31, $32, $33, $34, $35, $36)
       returning id`,
      [
        ...tenant,
        runId,
        planVersionId,
        node.nodeId,
        node.stepKind,
        node.descriptor.descriptorKey,
        node.descriptor.schemaVersion,
        node.descriptor.contentHash,
        node.executorBinding.bindingKey,
        node.executorBinding.bindingVersion,
        node.executorBinding.contentHash,
        JSON.stringify(node.effectProfile),
        JSON.stringify(node.dataEgressProfile),
        JSON.stringify(node.dependencies),
        node.assignedAgentId,
        personaByAgent.get(node.assignedAgentId).id,
        node.personaVersion.contractVersion,
        node.personaVersion.personaId,
        Number(node.personaVersion.personaVersion),
        node.personaVersion.contentHash,
        node.reviewerAgentId,
        JSON.stringify(node.canonicalInput),
        node.canonicalInputHash,
        node.expectedOutputSchemaHash,
        delegationIds.get(node.assignedAgentId).id,
        node.requiresDistinctReviewer,
        node.limits.maximumTurns,
        node.limits.maximumTokens,
        node.limits.maximumToolCalls,
        node.limits.maximumRuntimeSeconds,
        node.limits.maximumAttempts,
        node.limits.maximumCostMinor,
        node.limits.currency,
        node.deadline,
      ]
    );
    const stepId = inserted.rows[0].id;
    stepIds[node.nodeId] = stepId;
    stepBindings.push({
      node,
      stepId,
      persona: personaByAgent.get(node.assignedAgentId),
      delegation: delegationIds.get(node.assignedAgentId),
    });
  }

  const budget = planBudget(plan);
  const updatedRun = await client.query(
    `update agentic.execution_runs
        set plan_version_id = $1, state = 'awaiting_plan_approval',
            budget_minor = $2, currency = $3, version = version + 1,
            updated_at = now()
      where id = $4 and version = $5
      returning state, version::integer as version`,
    [planVersionId, budget.amount, budget.currency, runId, expectedRunVersion]
  );
  if (rowCount(updatedRun) !== 1) throw new HttpError(409, 'run_version_conflict');
  await client.query(
    `update agentic.execution_plans
        set state = 'proposed', current_version_number = $1,
            version = version + 1, updated_at = now()
      where id = $2`,
    [plan.planVersion, run.plan_id]
  );
  const approvalIssuedAt = new Date();
  const approvalExpiresAt = new Date(approvalIssuedAt.getTime() + approvalTtlSeconds * 1_000);
  const actionIntentIds = {};
  const approvalSteps = [];
  for (const binding of stepBindings) {
    const { node, stepId, persona, delegation } = binding;
    const actionIntent = await persistActionIntent(
      client,
      principal,
      run,
      plan,
      planVersionId,
      stepId,
      node,
      persona,
      delegation,
      approvalIssuedAt.toISOString()
    );
    if (actionIntent) actionIntentIds[node.nodeId] = actionIntent.actionIntentId;
    approvalSteps.push({
      stepId,
      nodeId: node.nodeId,
      title: node.title,
      objective: node.objective,
      stepKind: node.stepKind,
      agentId: node.assignedAgentId,
      personaVersion: {
        contractVersion: node.personaVersion.contractVersion,
        personaVersionId: persona.id,
        personaId: node.personaVersion.personaId,
        personaVersion: node.personaVersion.personaVersion,
        contentHash: node.personaVersion.contentHash,
      },
      delegation: {
        delegationId: delegation.id,
        version: delegation.version,
        policyHash: delegation.policyHash,
      },
      descriptor: node.descriptor,
      executorBinding: node.executorBinding,
      canonicalParameters: node.canonicalInput,
      canonicalInputHash: node.canonicalInputHash,
      effectProfile: node.effectProfile,
      dataEgressProfile: node.dataEgressProfile,
      limits: node.limits,
      deadline: node.deadline,
      humanReadableEffect: {
        summary: node.objective,
        risks: effectRisks(node.effectProfile),
      },
      actionIntent,
    });
  }

  const approvalSubject = ApprovalSubjectV1Schema.parse({
    version: 'orqaly_approval_subject_v1',
    contractVersion: '1.0',
    canonicalization: CANONICALIZATION_ALGORITHM,
    subjectKind: 'plan',
    organizationId: principal.organizationId,
    workspaceId: principal.workspaceId,
    approverPrincipalId: principal.userId,
    runId,
    sourceDecisionId: plan.sourceDecisionId,
    owningAgentId: plan.owningAgentId,
    teamId: plan.teamId,
    planVersion: {
      planId: run.plan_id,
      planVersionId,
      planVersion: plan.planVersion,
      contentHash: plan.contentHash,
    },
    steps: approvalSteps.sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
    budget: {
      amountMinor: budget.amount,
      currency: budget.currency,
    },
    issuedAt: approvalIssuedAt.toISOString(),
    expiresAt: approvalExpiresAt.toISOString(),
    nonce: crypto.randomUUID(),
  });
  const approvalBindingHash = approvalSubjectV1Hash(approvalSubject);
  const approvalPresentation = buildApprovalPresentationV1(approvalSubject);
  const approvalSubjectId = crypto.randomUUID();
  await client.query(
    `insert into agentic.approval_subjects (
       id, org_id, workspace_id, user_id, run_id, plan_id, plan_version_id,
       plan_version_number, plan_content_hash, subject_kind, subject_version,
       contract_version, canonicalization, hash_domain, approver_principal_id,
       nonce, issued_at, expires_at, subject_payload, subject_hash
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'plan',
               'orqaly_approval_subject_v1', '1.0', $10,
               'orqaly.approval.v1', $11, $12, $13, $14, $15::jsonb, $16)`,
    [
      approvalSubjectId,
      ...tenant,
      runId,
      run.plan_id,
      planVersionId,
      plan.planVersion,
      plan.contentHash,
      CANONICALIZATION_ALGORITHM,
      principal.userId,
      approvalSubject.nonce,
      approvalSubject.issuedAt,
      approvalSubject.expiresAt,
      JSON.stringify(approvalSubject),
      approvalBindingHash,
    ]
  );
  for (const step of approvalSubject.steps) {
    if (!step.actionIntent) continue;
    await client.query(
      `insert into agentic.approval_subject_action_intents (
         org_id, workspace_id, user_id, run_id, step_id,
         approval_subject_id, approval_subject_hash,
         action_intent_id, action_intent_hash
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        ...tenant,
        runId,
        step.stepId,
        approvalSubjectId,
        approvalBindingHash,
        step.actionIntent.actionIntentId,
        step.actionIntent.contentHash,
      ]
    );
  }
  const approvalInsert = await client.query(
    `insert into agentic.approval_requests (
       org_id, workspace_id, user_id, run_id, approval_subject_id,
       subject_kind, subject_hash, subject_snapshot, presentation,
       required_approver_id, expires_at
     ) values ($1, $2, $3, $4, $5, 'plan', $6, $7::jsonb, $8::jsonb,
               $9, $10)
     returning id, approval_subject_id, subject_hash, expires_at,
               version::integer as version`,
    [
      ...tenant,
      runId,
      approvalSubjectId,
      approvalBindingHash,
      JSON.stringify(approvalSubject),
      JSON.stringify(approvalPresentation),
      principal.userId,
      approvalSubject.expiresAt,
    ]
  );
  const approval = approvalInsert.rows[0];
  await client.query(
    `insert into agentic.outbox_events (
       org_id, workspace_id, user_id, run_id, event_type, destination,
       dedupe_key, safe_payload
     ) values ($1, $2, $3, $4, 'approval.requested', 'orqaly_inbox',
               $5, $6::jsonb)`,
    [
      ...tenant,
      runId,
      `approval:${approval.id}`,
      JSON.stringify({
        approvalId: approval.id,
        runId,
        subjectHash: approval.subject_hash,
      }),
    ]
  );
  await client.query(
    `insert into agentic.run_events (
       org_id, workspace_id, user_id, run_id, event_type, actor_type,
       safe_payload, correlation_id
     ) values ($1, $2, $3, $4, 'plan.materialized', 'system', $5::jsonb, $6)`,
    [
      ...tenant,
      runId,
      JSON.stringify({
        planVersionId,
        planVersion: plan.planVersion,
        approvalId: approval.id,
      }),
      principal.requestId,
    ]
  );

  return {
    version: 'orqaly_plan_version_result_v1',
    planId: run.plan_id,
    planVersionId,
    planVersion: plan.planVersion,
    runId,
    runVersion: updatedRun.rows[0].version,
    state: updatedRun.rows[0].state,
    approval: {
      id: approval.id,
      subjectId: approval.approval_subject_id,
      bindingHash: approval.subject_hash,
      expiresAt: approval.expires_at,
      version: approval.version,
    },
    stepIds,
    actionIntentIds,
    replayed: false,
  };
}

export async function listAgents(client, { limit = 50, state = null } = {}) {
  const result = await client.query(
    `${AGENT_PROJECTION_SELECT}
      where ($1::text is null or (${EFFECTIVE_AGENT_STATE_SQL}) = $1)
      order by a.updated_at desc, a.id
      limit $2`,
    [state, limit]
  );
  return result.rows.map(agentFromRow);
}

export async function listApprovals(client, { limit = 50, status = 'pending' } = {}) {
  const result = await client.query(
    `select a.id, a.run_id, a.step_id, a.approval_subject_id, a.subject_kind,
            a.subject_hash, a.presentation, a.status, a.expires_at, a.decided_at,
            a.decision_reason, a.version::integer as version, a.created_at,
            case
              when a.status <> 'pending' then 'already_decided'
              when a.expires_at <= now() then 'expired'
              when a.required_approver_id <> nullif(
                current_setting('app.user_id', true), ''
              ) then 'not_authorized'
              when a.subject_kind <> 'plan' then 'unsupported_subject'
              when r.state <> 'awaiting_plan_approval' then 'run_not_awaiting_approval'
              when subject.id is null then 'immutable_subject_unavailable'
              else null
            end as cannot_decide_reason
       from agentic.approval_requests a
       join agentic.execution_runs r
         on r.org_id = a.org_id and r.workspace_id = a.workspace_id
        and r.user_id = a.user_id and r.id = a.run_id
       left join agentic.approval_subjects subject
         on subject.org_id = a.org_id and subject.workspace_id = a.workspace_id
        and subject.user_id = a.user_id and subject.id = a.approval_subject_id
        and subject.run_id = a.run_id and subject.subject_hash = a.subject_hash
      where ($1::text is null or a.status = $1)
      order by a.created_at desc, a.id
      limit $2`,
    [status, limit]
  );
  return result.rows.map((row) => {
    const presentation = ApprovalPresentationV1Schema.parse(row.presentation);
    const cannotDecideReason = row.cannot_decide_reason;
    const canDecide = cannotDecideReason === null;
    return {
      id: row.id,
      run_id: row.run_id,
      step_id: row.step_id,
      approval_subject_id: row.approval_subject_id,
      subject_kind: row.subject_kind,
      subject_hash: row.subject_hash,
      presentation,
      status: row.status,
      expires_at: row.expires_at,
      decided_at: row.decided_at,
      decision_reason: row.decision_reason,
      version: row.version,
      created_at: row.created_at,
      controls: {
        approval: {
          approve: canDecide,
          reject: canDecide,
          reason: cannotDecideReason,
        },
      },
    };
  });
}

function integrityError(reason) {
  return new HttpError(409, 'approval_subject_integrity_invalid', { reason });
}

async function assertApprovalSubjectIntegrity(client, principal, approval) {
  if (!approval.approval_subject_id || !approval.persisted_subject) {
    throw integrityError('immutable_subject_missing');
  }
  let subject;
  try {
    subject = ApprovalSubjectV1Schema.parse(approval.subject_snapshot);
  } catch {
    throw integrityError('subject_contract_invalid');
  }
  if (canonicalJson(subject) !== canonicalJson(approval.persisted_subject)) {
    throw integrityError('subject_snapshot_mismatch');
  }
  if (
    approvalSubjectV1Hash(subject) !== approval.subject_hash ||
    approval.persisted_subject_hash !== approval.subject_hash
  ) {
    throw integrityError('subject_hash_mismatch');
  }
  const identity = [
    [subject.organizationId, principal.organizationId],
    [subject.workspaceId, principal.workspaceId],
    [subject.approverPrincipalId, principal.userId],
    [subject.runId, approval.run_id],
    [subject.planVersion.planId, approval.plan_id],
    [subject.planVersion.planVersionId, approval.plan_version_id],
    [subject.planVersion.contentHash, approval.plan_content_hash],
  ];
  if (identity.some(([expected, observed]) => expected !== observed)) {
    throw integrityError('subject_identity_mismatch');
  }
  if (new Date(subject.expiresAt).getTime() !== new Date(approval.expires_at).getTime()) {
    throw integrityError('subject_expiry_mismatch');
  }

  const storedSteps = await client.query(
    `select s.id, s.node_id, s.step_kind, s.assigned_agent_id, s.persona_version_id,
            s.persona_contract_version, s.persona_id, s.persona_version_number,
            s.persona_content_hash, s.delegation_id, d.authority_version,
            d.policy_hash, s.descriptor_key, s.descriptor_version,
            s.descriptor_hash, s.executor_binding_key,
            s.executor_binding_version, s.executor_binding_hash,
            s.input_payload, s.input_hash, s.effect_profile, s.data_egress_profile,
            s.maximum_turns, s.maximum_tokens, s.maximum_tool_calls,
            s.maximum_duration_seconds, s.maximum_attempts,
            s.maximum_cost_minor, s.currency, s.deadline_at
       from agentic.execution_steps s
       join agentic.agent_delegations d
         on d.org_id = s.org_id and d.workspace_id = s.workspace_id
        and d.user_id = s.user_id and d.id = s.delegation_id
      where s.run_id = $1 and s.plan_version_id = $2
      order by s.node_id`,
    [approval.run_id, approval.plan_version_id]
  );
  if (storedSteps.rows.length !== subject.steps.length) {
    throw integrityError('subject_step_count_mismatch');
  }
  const subjectStepById = new Map(subject.steps.map((step) => [step.stepId, step]));
  for (const row of storedSteps.rows) {
    const step = subjectStepById.get(row.id);
    if (!step) throw integrityError('subject_step_missing');
    const storedDeadline = row.deadline_at ? new Date(row.deadline_at).getTime() : null;
    const approvedDeadline = step.deadline ? new Date(step.deadline).getTime() : null;
    if (storedDeadline !== approvedDeadline) {
      throw integrityError('subject_step_deadline_mismatch');
    }
    const expected = {
      stepId: step.stepId,
      nodeId: step.nodeId,
      stepKind: step.stepKind,
      agentId: step.agentId,
      personaVersion: step.personaVersion,
      delegation: step.delegation,
      descriptor: step.descriptor,
      executorBinding: step.executorBinding,
      canonicalParameters: step.canonicalParameters,
      canonicalInputHash: step.canonicalInputHash,
      effectProfile: step.effectProfile,
      dataEgressProfile: step.dataEgressProfile,
      limits: step.limits,
      deadline: step.deadline,
    };
    const observed = {
      stepId: row.id,
      nodeId: row.node_id,
      stepKind: row.step_kind,
      agentId: row.assigned_agent_id,
      personaVersion: {
        contractVersion: row.persona_contract_version,
        personaVersionId: row.persona_version_id,
        personaId: row.persona_id,
        personaVersion: String(row.persona_version_number),
        contentHash: row.persona_content_hash,
      },
      delegation: {
        delegationId: row.delegation_id,
        version: Number(row.authority_version),
        policyHash: row.policy_hash,
      },
      descriptor: {
        contractVersion: '1.0',
        descriptorKey: row.descriptor_key,
        schemaVersion: row.descriptor_version,
        contentHash: row.descriptor_hash,
      },
      executorBinding: {
        contractVersion: '1.0',
        bindingKey: row.executor_binding_key,
        bindingVersion: row.executor_binding_version,
        contentHash: row.executor_binding_hash,
      },
      canonicalParameters: row.input_payload,
      canonicalInputHash: row.input_hash,
      effectProfile: row.effect_profile,
      dataEgressProfile: row.data_egress_profile,
      limits: {
        maximumTurns: row.maximum_turns,
        maximumTokens: row.maximum_tokens,
        maximumToolCalls: row.maximum_tool_calls,
        maximumRuntimeSeconds: row.maximum_duration_seconds,
        maximumAttempts: row.maximum_attempts,
        maximumCostMinor: Number(row.maximum_cost_minor),
        currency: row.currency,
      },
      deadline: step.deadline,
    };
    if (canonicalJson(expected) !== canonicalJson(observed)) {
      throw integrityError('subject_step_authority_mismatch');
    }
  }

  const expectedActions = subject.steps
    .filter((step) => step.actionIntent)
    .map((step) => ({
      stepId: step.stepId,
      actionIntentId: step.actionIntent.actionIntentId,
      contentHash: step.actionIntent.contentHash,
      snapshot: step.actionIntent,
    }))
    .sort((left, right) => left.stepId.localeCompare(right.stepId));
  const storedActions = await client.query(
    `select link.step_id, ai.id, ai.intent_hash, ai.intent_snapshot
       from agentic.approval_subject_action_intents link
       join agentic.action_intents ai
         on ai.org_id = link.org_id and ai.workspace_id = link.workspace_id
        and ai.user_id = link.user_id and ai.id = link.action_intent_id
        and ai.intent_hash = link.action_intent_hash
      where link.approval_subject_id = $1
        and link.approval_subject_hash = $2
      order by link.step_id`,
    [approval.approval_subject_id, approval.subject_hash]
  );
  if (storedActions.rows.length !== expectedActions.length) {
    throw integrityError('subject_action_count_mismatch');
  }
  for (const [index, expected] of expectedActions.entries()) {
    const observed = storedActions.rows[index];
    if (
      observed.step_id !== expected.stepId ||
      observed.id !== expected.actionIntentId ||
      observed.intent_hash !== expected.contentHash ||
      canonicalJson(observed.intent_snapshot) !== canonicalJson(expected.snapshot)
    ) {
      throw integrityError('subject_action_binding_mismatch');
    }
  }
  return subject;
}

export async function decideApproval(
  client,
  principal,
  approvalId,
  expectedApprovalVersion,
  request
) {
  const auditActorType = approvalAuditActorTypeForVerifiedPrincipal(principal);
  if (auditActorType === null) {
    throw new HttpError(403, 'human_principal_required');
  }

  const decisionHash = canonicalJsonSha256(request);
  const locked = await client.query(
    `select a.id, a.run_id, a.approval_subject_id, a.subject_kind,
            a.subject_hash, a.subject_snapshot, a.status,
            a.required_approver_id, a.expires_at,
            a.version::integer as version, a.decision_key, a.decision_payload_hash,
            r.plan_id, r.plan_version_id, r.team_id, r.state as run_state,
            r.version::integer as run_version,
            pv.content_hash as plan_content_hash,
            subject.subject_payload as persisted_subject,
            subject.subject_hash as persisted_subject_hash
       from agentic.approval_requests a
       join agentic.execution_runs r
         on r.org_id = a.org_id and r.workspace_id = a.workspace_id
        and r.user_id = a.user_id and r.id = a.run_id
       left join agentic.execution_plan_versions pv
         on pv.org_id = r.org_id and pv.workspace_id = r.workspace_id
        and pv.user_id = r.user_id and pv.id = r.plan_version_id
       left join agentic.approval_subjects subject
         on subject.org_id = a.org_id and subject.workspace_id = a.workspace_id
        and subject.user_id = a.user_id and subject.id = a.approval_subject_id
        and subject.run_id = a.run_id and subject.subject_hash = a.subject_hash
      where a.id = $1
      for update of a, r`,
    [approvalId]
  );
  if (rowCount(locked) !== 1) throw notFound('approval_not_found');
  const approval = locked.rows[0];
  if (approval.status !== 'pending') {
    if (
      approval.decision_key === request.idempotencyKey &&
      approval.decision_payload_hash === decisionHash
    ) {
      return {
        version: 'orqaly_approval_decision_result_v1',
        approvalId,
        approvalVersion: approval.version,
        status: approval.status,
        runId: approval.run_id,
        runVersion: approval.run_version,
        runState: approval.run_state,
        replayed: true,
      };
    }
    throw new HttpError(409, 'approval_already_decided', { status: approval.status });
  }
  if (approval.version !== expectedApprovalVersion) {
    throw new HttpError(409, 'approval_version_conflict', {
      expected: expectedApprovalVersion,
      actual: approval.version,
    });
  }
  if (approval.required_approver_id !== principal.userId) {
    throw notFound('approval_not_found');
  }
  if (new Date(approval.expires_at).getTime() <= Date.now()) {
    throw new HttpError(409, 'approval_expired');
  }
  if (approval.subject_kind !== 'plan') {
    throw new HttpError(409, 'approval_subject_not_supported');
  }
  if (approval.run_state !== 'awaiting_plan_approval') {
    throw new HttpError(409, 'run_not_awaiting_plan_approval', {
      state: approval.run_state,
    });
  }
  await assertApprovalSubjectIntegrity(client, principal, approval);

  const tenant = [principal.organizationId, principal.workspaceId, principal.userId];
  const status = request.decision === 'approve' ? 'approved' : 'rejected';
  const updatedApproval = await client.query(
    `update agentic.approval_requests
        set status = $1, decision_key = $2, decision_payload_hash = $3,
            decided_by = $4, decided_at = now(), decision_reason = $5,
            version = version + 1
      where id = $6 and version = $7 and status = 'pending'
      returning version::integer as version`,
    [
      status,
      request.idempotencyKey,
      decisionHash,
      principal.userId,
      request.reason,
      approvalId,
      expectedApprovalVersion,
    ]
  );
  if (rowCount(updatedApproval) !== 1) throw new HttpError(409, 'approval_version_conflict');

  let updatedRun;
  if (request.decision === 'approve') {
    await client.query(
      `update agentic.execution_plans
          set state = 'approved', version = version + 1, updated_at = now()
        where id = $1 and state = 'proposed'`,
      [approval.plan_id]
    );
    await client.query(
      `update agentic.agent_teams
          set state = 'active', activated_at = coalesce(activated_at, now()),
              updated_at = now(), version = version + 1
        where id = $1 and state = 'proposed'`,
      [approval.team_id]
    );
    await client.query(
      `update agentic.agents a
          set state = 'active', activated_at = coalesce(a.activated_at, now()),
              updated_at = now(), version = a.version + 1
         from agentic.agent_team_memberships m
        where m.team_id = $1 and m.left_at is null
          and m.org_id = a.org_id and m.workspace_id = a.workspace_id
          and m.user_id = a.user_id and m.agent_id = a.id
          and a.state = 'proposed'`,
      [approval.team_id]
    );
    await client.query(
      `update agentic.agent_delegations d
          set granted_at = coalesce(d.granted_at, now()), version = d.version + 1
        where d.run_id = $1 and d.plan_version_id = $2
          and d.granted_at is null and d.revoked_at is null`,
      [approval.run_id, approval.plan_version_id]
    );
    updatedRun = await client.query(
      `update agentic.execution_runs
          set state = 'queued', version = version + 1, updated_at = now()
        where id = $1 and version = $2 and state = 'awaiting_plan_approval'
        returning state, version::integer as version`,
      [approval.run_id, approval.run_version]
    );
  } else {
    await client.query(
      `update agentic.agent_delegations
          set revoked_at = coalesce(revoked_at, now()), version = version + 1
        where run_id = $1 and plan_version_id = $2
          and granted_at is null and revoked_at is null`,
      [approval.run_id, approval.plan_version_id]
    );
    await client.query(
      `update agentic.execution_steps
          set state = 'skipped', version = version + 1, updated_at = now()
        where run_id = $1 and plan_version_id = $2 and state = 'pending'`,
      [approval.run_id, approval.plan_version_id]
    );
    await client.query(
      `update agentic.execution_plans
          set state = 'draft', version = version + 1, updated_at = now()
        where id = $1 and state = 'proposed'`,
      [approval.plan_id]
    );
    updatedRun = await client.query(
      `update agentic.execution_runs
          set state = 'planning', plan_version_id = null, budget_minor = null,
              currency = null, version = version + 1, updated_at = now()
        where id = $1 and version = $2 and state = 'awaiting_plan_approval'
        returning state, version::integer as version`,
      [approval.run_id, approval.run_version]
    );
  }
  if (rowCount(updatedRun) !== 1) throw new HttpError(409, 'run_version_conflict');

  await client.query(
    `insert into agentic.run_events (
       org_id, workspace_id, user_id, run_id, event_type, actor_type,
       safe_payload, correlation_id
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      ...tenant,
      approval.run_id,
      `approval.${status}`,
      auditActorType,
      JSON.stringify({ approvalId, subjectHash: approval.subject_hash }),
      principal.requestId,
    ]
  );
  await client.query(
    `insert into agentic.outbox_events (
       org_id, workspace_id, user_id, run_id, event_type, destination,
       dedupe_key, safe_payload
     ) values ($1, $2, $3, $4, $5, 'orqaly_inbox', $6, $7::jsonb)`,
    [
      ...tenant,
      approval.run_id,
      `approval.${status}`,
      `approval-decision:${approvalId}:${status}`,
      JSON.stringify({ approvalId, runId: approval.run_id, status }),
    ]
  );

  return {
    version: 'orqaly_approval_decision_result_v1',
    approvalId,
    approvalVersion: updatedApproval.rows[0].version,
    status,
    runId: approval.run_id,
    runVersion: updatedRun.rows[0].version,
    runState: updatedRun.rows[0].state,
    replayed: false,
  };
}

export async function getRun(client, runId) {
  const run = await client.query(
    `select id, source_task_id, agent_id, team_id, plan_id, plan_version_id,
            state, requested_by, budget_minor, reserved_minor, spent_minor,
            currency, deadline_at, started_at, terminal_at, version,
            created_at, updated_at
       from agentic.execution_runs where id = $1`,
    [runId]
  );
  if (rowCount(run) !== 1) throw notFound('run_not_found');
  const steps = await client.query(
    `select id, node_id, step_kind, descriptor_key, descriptor_version,
            descriptor_hash, executor_binding_key, executor_binding_version,
            executor_binding_hash, effect_profile, data_egress_profile, dependencies,
            delegation_id, persona_version_id, persona_contract_version,
            persona_id, persona_version_number, persona_content_hash,
            assigned_agent_id, reviewer_agent_id, maximum_duration_seconds,
            maximum_turns, maximum_tokens, maximum_tool_calls, maximum_attempts,
            maximum_cost_minor, currency, deadline_at, state, attempt_count,
            version, created_at, updated_at
       from agentic.execution_steps
      where run_id = $1 order by created_at, node_id`,
    [runId]
  );
  return { ...run.rows[0], steps: steps.rows };
}
