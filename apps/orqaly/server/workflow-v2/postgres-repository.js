import pg from 'pg';
import { canonicalHash, sha256Hex } from '../../lib/workflow-v2/canonical.js';
import {
  PublicWorkflowSnapshotSchema,
  WorkflowSnapshotSchema,
} from '../../shared/workflow-v2/contracts.js';
import {
  AssistantMessageSchema,
  AssistantThreadSchema,
  DelegatedAgentReadProjectionSchema,
  normalizePersistedDelegatedAgentPart,
  parsePersistedAssistantMessage,
} from '../../shared/workflow-v2/assistant.js';
import {
  AssistantTurnEventBatchSchema,
  AssistantTurnEventInputSchema,
  AssistantTurnEventSchema,
} from '../../shared/workflow-v2/assistant-events.js';
import {
  completeExecutableActionWithClient,
  decideExecutableActionWithClient,
  insertExecutableActionWithClient,
  loadExecutableActionRunContextWithClient,
  loadExecutableActionWithClient,
  loadLatestExecutableActionWithClient,
  reconcileExecutableActionWithClient,
} from './executable-action-repository.js';
import { requiredCapabilitySetsForScope } from './internal-activity-executor.js';
import { readGoalWorkflowViewWithClient } from './goal-workflow-view-repository.js';
import { CAPABILITY_ACTIVITY_TYPES } from '../../lib/workflow-v2/capability-state-machine.js';

const { Pool } = pg;
// Pin the attestation itself outside PostgreSQL; it then verifies every boundary
// helper, original ledger guard, ACL, forced-RLS table, and immutable trigger.
const CAPABILITY_SCHEMA_ATTESTATION_SHA256 = 'fc84e1f8a23075fba73e518696836f97369bdeae6ec656f2d3f9817e88c0189c';
const TERMINAL_RUN_STATUSES = new Set([
  'completed', 'completed_with_evidence_gaps', 'blocked', 'failed', 'cancelled',
]);

function positiveInteger(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function poolFor(connectionString, applicationName, maxEnvironment, defaultMax) {
  if (!connectionString) throw new Error(`${applicationName} database URL is required`);
  return new Pool({
    connectionString,
    application_name: applicationName,
    max: positiveInteger(maxEnvironment, defaultMax),
    connectionTimeoutMillis: positiveInteger('ORQALY_DATABASE_CONNECT_TIMEOUT_MS', 5_000),
    statement_timeout: positiveInteger('ORQALY_DATABASE_STATEMENT_TIMEOUT_MS', 15_000),
    query_timeout: positiveInteger('ORQALY_DATABASE_QUERY_TIMEOUT_MS', 20_000),
    idleTimeoutMillis: positiveInteger('ORQALY_DATABASE_IDLE_TIMEOUT_MS', 30_000),
  });
}

async function withTenantClient(pool, tenantId, callback, { readOnlySnapshot = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query(
      readOnlySnapshot ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN'
    );
    await client.query("SELECT set_config('orqaly.tenant_id', $1, true)", [tenantId]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function loadPlanningAgentRows(client, tenantId, scope) {
  const byId = new Map();
  for (const capabilities of requiredCapabilitySetsForScope(scope)) {
    const result = await client.query(
      `SELECT id, name, capabilities, tool_ids, quality_score, cost_per_run_cents
       FROM orqaly.list_tenant_agents($1, $2::text[], 1000)`,
      [tenantId, capabilities]
    );
    for (const row of result.rows) byId.set(row.id, row);
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function isoTimestamp(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function readWorkspaceProjectionWithClient(client, tenantId) {
  const agentResult = await client.query(
    `SELECT id, name, status, capabilities, tool_ids, updated_at
       FROM orqaly.tenant_agents
       WHERE tenant_id = $1
       ORDER BY lower(name), id`,
    [tenantId]
  );
  return {
    // Successful personal identity resolution already proves an active tenant.
    // The API role has no general tenant metadata grant. Migration 014 grants
    // only id/status under tenant RLS for application-key suspension checks.
    displayName: 'Personal workspace',
    status: 'active',
    agents: agentResult.rows.map((agent) => ({
      id: agent.id,
      name: agent.name,
      status: agent.status,
      capabilities: agent.capabilities || [],
      toolIds: agent.tool_ids || [],
      updatedAt: isoTimestamp(agent.updated_at),
    })),
  };
}

export async function readOverviewProjectionWithClient(client, tenantId, limit, { capabilityOwnerUserId } = {}) {
  const countResult = await client.query(
    `SELECT count(*)::integer AS total,
            (count(*) FILTER (WHERE status IN ('requested', 'running')))::integer AS active,
            (count(*) FILTER (
              WHERE status IN ('awaiting_gate_1', 'awaiting_gate_2')
            ))::integer AS awaiting_approval,
            (count(*) FILTER (
              WHERE status IN ('completed', 'completed_with_evidence_gaps')
            ))::integer AS completed,
            (count(*) FILTER (
              WHERE status IN (
                'awaiting_gate_1', 'awaiting_gate_2', 'completed_with_evidence_gaps',
                'blocked', 'failed'
              )
            ))::integer AS attention
       FROM orqaly.workflow_runs
       WHERE tenant_id = $1
       ${capabilityOwnerUserId === undefined ? '' : `AND (request_payload #>> '{workProfile,type}' IS DISTINCT FROM 'capability_work_v1'
         OR (owner_user_id = $2 AND owner_organization_id IS NULL))`}`,
    capabilityOwnerUserId === undefined ? [tenantId] : [tenantId, capabilityOwnerUserId]
  );
  const workflowResult = await client.query(
    `SELECT run.id, run.mode, run.status, run.request_payload ->> 'request' AS request,
            run.request_payload -> 'workProfile' AS work_profile,
            run.evidence_readiness, run.created_at, run.updated_at,
            final.id AS artifact_id, final.content_hash AS artifact_hash,
            final.kind AS artifact_kind,
            progress.total_stages, progress.completed_stages
       FROM orqaly.workflow_runs AS run
       LEFT JOIN orqaly.artifacts AS final
         ON final.tenant_id = run.tenant_id AND final.run_id = run.id
        AND final.id = run.final_artifact_id
       LEFT JOIN LATERAL (
         SELECT count(*)::integer AS total_stages,
                (count(*) FILTER (
                  WHERE stage.status IN ('completed', 'completed_with_evidence_gaps')
                ))::integer AS completed_stages
           FROM orqaly.workflow_stages AS stage
           WHERE stage.tenant_id = run.tenant_id AND stage.run_id = run.id
       ) AS progress ON true
       WHERE run.tenant_id = $1
       ${capabilityOwnerUserId === undefined ? '' : `AND (run.request_payload #>> '{workProfile,type}' IS DISTINCT FROM 'capability_work_v1'
         OR (run.owner_user_id = $3 AND run.owner_organization_id IS NULL))`}
       ORDER BY run.updated_at DESC, run.id DESC
       LIMIT $2`,
    capabilityOwnerUserId === undefined ? [tenantId, limit] : [tenantId, limit, capabilityOwnerUserId]
  );
  const counts = countResult.rows[0] || {};
  return {
    counts: {
      total: Number(counts.total || 0),
      active: Number(counts.active || 0),
      awaitingApproval: Number(counts.awaiting_approval || 0),
      completed: Number(counts.completed || 0),
      attention: Number(counts.attention || 0),
    },
    workflows: workflowResult.rows.map((workflow) => ({
      id: workflow.id,
      request: workflow.request,
      mode: workflow.mode,
      ...(workflow.work_profile ? { workProfile: workflow.work_profile } : {}),
      status: workflow.status,
      createdAt: isoTimestamp(workflow.created_at),
      updatedAt: isoTimestamp(workflow.updated_at),
      evidenceReadiness: workflow.evidence_readiness,
      totalStages: Number(workflow.total_stages || 0),
      completedStages: Number(workflow.completed_stages || 0),
      finalArtifact: artifactRef(workflow),
    })),
  };
}

export async function readActivityProjectionWithClient(client, tenantId, limit, { capabilityOwnerUserId } = {}) {
  const result = await client.query(
    `SELECT event.id, event.run_id, event.event_type, event.occurred_at,
            run.request_payload ->> 'request' AS request,
            stage.kind AS stage_kind
       FROM orqaly.workflow_events AS event
       JOIN orqaly.workflow_runs AS run
         ON run.tenant_id = event.tenant_id AND run.id = event.run_id
       LEFT JOIN orqaly.workflow_stages AS stage
         ON stage.tenant_id = event.tenant_id AND stage.run_id = event.run_id
        AND stage.id = event.stage_id
       WHERE event.tenant_id = $1
       ${capabilityOwnerUserId === undefined ? '' : `AND (run.request_payload #>> '{workProfile,type}' IS DISTINCT FROM 'capability_work_v1'
         OR (run.owner_user_id = $3 AND run.owner_organization_id IS NULL))`}
       ORDER BY event.occurred_at DESC, event.id DESC
       LIMIT $2`,
    capabilityOwnerUserId === undefined ? [tenantId, limit] : [tenantId, limit, capabilityOwnerUserId]
  );
  return result.rows.map((event) => ({
    id: event.id,
    runId: event.run_id,
    request: event.request,
    eventType: event.event_type,
    stageKind: event.stage_kind,
    occurredAt: isoTimestamp(event.occurred_at),
  }));
}

function artifactRef(row, prefix = '') {
  const id = row[`${prefix}artifact_id`];
  if (!id) return null;
  return {
    artifactId: id,
    artifactHash: row[`${prefix}artifact_hash`],
    kind: row[`${prefix}artifact_kind`],
  };
}

function assistantThread(row) {
  if (!row) return null;
  return AssistantThreadSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    ownerUserId: row.owner_user_id,
    ownerOrganizationId: row.owner_organization_id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function assistantMessage(row) {
  if (!row) return null;
  return parsePersistedAssistantMessage({
    id: row.id,
    threadId: row.thread_id,
    turnId: row.turn_id,
    role: row.role,
    route: row.route,
    parts: row.parts,
    axwiseOperationId: row.axwise_operation_id,
    workflowRunId: row.workflow_run_id,
    retryOfTurnId: row.retry_of_turn_id,
    ...(row.requested_intent == null ? {} : { requestedIntent: row.requested_intent }),
    ...(row.resolved_route == null ? {} : { resolvedRoute: row.resolved_route }),
    ...(row.route_policy_version == null ? {} : { routePolicyVersion: row.route_policy_version }),
    ...(row.route_reason_code == null ? {} : { routeReasonCode: row.route_reason_code }),
    ...(row.model == null ? {} : { model: row.model }),
    ...(row.model_version == null ? {} : { modelVersion: row.model_version }),
    createdAt: row.created_at.toISOString(),
  });
}

function assistantTurnEvent(row) {
  if (!row) return null;
  const event = AssistantTurnEventSchema.parse({
    id: row.id,
    threadId: row.thread_id,
    turnId: row.turn_id,
    sequence: Number(row.sequence),
    type: row.event_type,
    route: row.route,
    operationId: row.axwise_operation_id,
    retryOfTurnId: row.retry_of_turn_id,
    taskId: row.task_id,
    attemptId: row.attempt_id,
    payload: row.event_payload,
    occurredAt: isoTimestamp(row.occurred_at),
  });
  return { ...event, contentHash: row.event_hash };
}

export async function readAssistantThreadWithClient(client, tenantId, threadId, ownerUserId) {
  const threadResult = await client.query(
    `SELECT * FROM orqaly.assistant_threads
     WHERE tenant_id = $1 AND id = $2 AND owner_user_id = $3`,
    [tenantId, threadId, ownerUserId]
  );
  if (!threadResult.rows[0]) return null;
  const messageResult = await client.query(
    `SELECT * FROM orqaly.assistant_messages
     WHERE tenant_id = $1 AND thread_id = $2
     ORDER BY created_at, turn_id,
              CASE role WHEN 'user' THEN 0 WHEN 'assistant' THEN 1 ELSE 2 END,
              id`,
    [tenantId, threadId]
  );
  return {
    thread: assistantThread(threadResult.rows[0]),
    messages: messageResult.rows.map(assistantMessage),
  };
}

function delegatedAgentProjection(row) {
  const { type: _type, ...persisted } = normalizePersistedDelegatedAgentPart(row.agent_part);
  return DelegatedAgentReadProjectionSchema.parse({
    ...persisted,
    runId: row.workflow_run_id,
    threadId: row.thread_id,
    status: row.current_status,
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.current_updated_at),
  });
}

async function readDelegatedAgentRowsWithClient(
  client,
  tenantId,
  ownerUserId,
  limit,
  { directoryVisibleOnly }
) {
  const directoryVisibility = directoryVisibleOnly
    ? `AND (
           agent_part.value ->> 'lifetime' = 'persistent'
           OR run.status IN ('requested', 'running', 'awaiting_gate_1', 'awaiting_gate_2')
         )`
    : '';
  const result = await client.query(
    `SELECT message.thread_id, message.workflow_run_id, message.created_at,
            agent_part.value AS agent_part,
            COALESCE(run.status, agent_part.value ->> 'status') AS current_status,
            COALESCE(run.updated_at, message.created_at) AS current_updated_at
       FROM orqaly.assistant_messages AS message
       JOIN orqaly.assistant_threads AS thread
         ON thread.tenant_id = message.tenant_id AND thread.id = message.thread_id
       CROSS JOIN LATERAL jsonb_array_elements(message.parts) AS agent_part(value)
       LEFT JOIN orqaly.workflow_runs AS run
         ON run.tenant_id = message.tenant_id
        AND run.id = message.workflow_run_id
        AND run.owner_user_id = $2
       WHERE message.tenant_id = $1
         AND thread.owner_user_id = $2
         AND message.role = 'assistant'
         AND agent_part.value ->> 'type' = 'delegated_agent'
         ${directoryVisibility}
       ORDER BY COALESCE(run.updated_at, message.created_at) DESC, message.id DESC
       LIMIT $3`,
    [tenantId, ownerUserId, limit]
  );
  return result.rows.map(delegatedAgentProjection);
}

export async function readDelegatedAgentsWithClient(client, tenantId, ownerUserId, limit = 100) {
  return readDelegatedAgentRowsWithClient(client, tenantId, ownerUserId, limit, {
    directoryVisibleOnly: true,
  });
}

export async function readAgentAssignmentsForAgentWithClient(
  client,
  tenantId,
  ownerUserId,
  agentId,
  limit = 100
) {
  const result = await client.query(
    `SELECT message.thread_id, message.workflow_run_id, message.created_at,
            agent_part.value AS agent_part,
            COALESCE(run.status, agent_part.value ->> 'status') AS current_status,
            COALESCE(run.updated_at, message.created_at) AS current_updated_at
       FROM orqaly.assistant_messages AS message
       JOIN orqaly.assistant_threads AS thread
         ON thread.tenant_id = message.tenant_id AND thread.id = message.thread_id
       CROSS JOIN LATERAL jsonb_array_elements(message.parts) AS agent_part(value)
       JOIN orqaly.workflow_runs AS run
         ON run.tenant_id = message.tenant_id
        AND run.id = message.workflow_run_id
        AND run.owner_user_id = $2
       WHERE message.tenant_id = $1
         AND thread.owner_user_id = $2
         AND message.role = 'assistant'
         AND agent_part.value ->> 'type' = 'delegated_agent'
         AND agent_part.value ->> 'id' = $3
         AND agent_part.value #>>
               '{executionAgent,profileSnapshot,profileVersion,agentId}' = $3
       ORDER BY COALESCE(run.updated_at, message.created_at) DESC, message.id DESC
       LIMIT $4`,
    [tenantId, ownerUserId, agentId, limit]
  );
  return result.rows.map(delegatedAgentProjection);
}

export async function readAgentAssignmentStatsWithClient(client, tenantId, ownerUserId, agentIds) {
  const scopedAgentIds = [...new Set(agentIds || [])];
  if (!scopedAgentIds.length) return [];
  const result = await client.query(
    `WITH scoped_assignments AS (
       SELECT message.id AS message_id,
              message.thread_id,
              message.workflow_run_id,
              message.created_at,
              agent_part.value ->> 'id' AS agent_id,
              agent_part.value AS agent_part,
              COALESCE(run.status, agent_part.value ->> 'status') AS current_status,
              COALESCE(run.updated_at, message.created_at) AS current_updated_at
         FROM orqaly.assistant_messages AS message
         JOIN orqaly.assistant_threads AS thread
           ON thread.tenant_id = message.tenant_id AND thread.id = message.thread_id
         CROSS JOIN LATERAL jsonb_array_elements(message.parts) AS agent_part(value)
         JOIN orqaly.workflow_runs AS run
           ON run.tenant_id = message.tenant_id
          AND run.id = message.workflow_run_id
          AND run.owner_user_id = $2
        WHERE message.tenant_id = $1
          AND thread.owner_user_id = $2
          AND message.role = 'assistant'
          AND agent_part.value ->> 'type' = 'delegated_agent'
          AND agent_part.value ->> 'id' = ANY($3::text[])
          AND agent_part.value #>>
                '{executionAgent,profileSnapshot,profileVersion,agentId}' =
                agent_part.value ->> 'id'
     ), deduplicated AS (
       SELECT DISTINCT ON (agent_id, workflow_run_id) *
         FROM scoped_assignments
        ORDER BY agent_id, workflow_run_id, current_updated_at DESC, message_id DESC
     ), ranked AS (
       SELECT deduplicated.*,
              count(*) OVER (PARTITION BY agent_id)::integer AS run_count,
              row_number() OVER (
                PARTITION BY agent_id
                ORDER BY current_updated_at DESC, workflow_run_id DESC
              ) AS recency_rank
         FROM deduplicated
     )
     SELECT thread_id, workflow_run_id, created_at, agent_id, agent_part,
            current_status, current_updated_at, run_count
       FROM ranked
      WHERE recency_rank = 1
      ORDER BY agent_id`,
    [tenantId, ownerUserId, scopedAgentIds]
  );
  return result.rows.map((row) => ({
    agentId: row.agent_id,
    runCount: Number(row.run_count || 0),
    latestAssignment: delegatedAgentProjection(row),
  }));
}

export async function createAssistantTurnWithClient(client, tenantId, owner, thread, message) {
  await client.query(
    `INSERT INTO orqaly.assistant_threads (
       tenant_id, id, owner_user_id, owner_organization_id, title, status, created_at
     ) VALUES ($1, $2, $3, $4, $5, 'active', $6)
     ON CONFLICT (tenant_id, id) DO NOTHING`,
    [tenantId, thread.id, owner.userId, null, thread.title, thread.createdAt]
  );
  const threadResult = await client.query(
    `SELECT * FROM orqaly.assistant_threads
     WHERE tenant_id = $1 AND id = $2 AND owner_user_id = $3
     FOR UPDATE`,
    [tenantId, thread.id, owner.userId]
  );
  if (!threadResult.rows[0]) {
    const error = new Error('assistant thread is not owned by authenticated user');
    error.code = '42501';
    throw error;
  }
  const existing = await client.query(
    `SELECT * FROM orqaly.assistant_messages
     WHERE tenant_id = $1 AND thread_id = $2 AND turn_id = $3 AND role = 'user'`,
    [tenantId, thread.id, message.turnId]
  );
  if (existing.rows[0]) {
    return {
      thread: assistantThread(threadResult.rows[0]),
      message: assistantMessage(existing.rows[0]),
    };
  }
  const sequence = await client.query(
    `SELECT max(created_at) AS latest_created_at,
            EXISTS (
              SELECT 1
              FROM orqaly.assistant_messages AS pending_user
              WHERE pending_user.tenant_id = $1
                AND pending_user.thread_id = $2
                AND pending_user.role = 'user'
                AND NOT EXISTS (
                  SELECT 1
                  FROM orqaly.assistant_messages AS pending_assistant
                  WHERE pending_assistant.tenant_id = pending_user.tenant_id
                    AND pending_assistant.thread_id = pending_user.thread_id
                    AND pending_assistant.turn_id = pending_user.turn_id
                    AND pending_assistant.role = 'assistant'
                )
            ) AS has_pending_turn
       FROM orqaly.assistant_messages
       WHERE tenant_id = $1 AND thread_id = $2`,
    [tenantId, thread.id]
  );
  const boundary = sequence.rows[0] || {};
  if (boundary.has_pending_turn) {
    const error = new Error('the previous assistant turn is still pending');
    error.code = 'ASSISTANT_TURN_PENDING';
    throw error;
  }
  if (
    boundary.latest_created_at &&
    new Date(message.createdAt).getTime() <= new Date(boundary.latest_created_at).getTime()
  ) {
    const error = new Error('assistant turn timestamps must increase monotonically');
    error.code = 'ASSISTANT_TURN_TIMESTAMP_CONFLICT';
    throw error;
  }
  await client.query(
    `INSERT INTO orqaly.assistant_messages (
       tenant_id, thread_id, id, turn_id, role, route, parts, content_hash,
       axwise_operation_id, workflow_run_id, retry_of_turn_id, requested_intent,
       resolved_route, route_policy_version, route_reason_code, model, model_version, created_at
     ) VALUES (
       $1, $2, $3, $4, 'user', $5, $6::jsonb, $7, $8, $9, $10,
       $11, $12, $13, $14, $15, $16, $17
     )`,
    [
      tenantId,
      thread.id,
      message.id,
      message.turnId,
      message.route,
      JSON.stringify(message.parts),
      message.contentHash,
      message.axwiseOperationId,
      message.workflowRunId,
      message.retryOfTurnId,
      message.requestedIntent ?? null,
      message.resolvedRoute ?? null,
      message.routePolicyVersion ?? null,
      message.routeReasonCode ?? null,
      message.model ?? null,
      message.modelVersion ?? null,
      message.createdAt,
    ]
  );
  const messageResult = await client.query(
    `SELECT * FROM orqaly.assistant_messages
     WHERE tenant_id = $1 AND thread_id = $2 AND turn_id = $3 AND role = 'user'`,
    [tenantId, thread.id, message.turnId]
  );
  return {
    thread: assistantThread(threadResult.rows[0]),
    message: assistantMessage(messageResult.rows[0]),
  };
}

export async function createAssistantRetryTurnWithClient(client, tenantId, ownerUserId, message) {
  const threadResult = await client.query(
    `SELECT id FROM orqaly.assistant_threads
     WHERE tenant_id = $1 AND id = $2 AND owner_user_id = $3
     FOR UPDATE`,
    [tenantId, message.threadId, ownerUserId]
  );
  if (!threadResult.rows[0]) {
    const error = new Error('assistant thread is not owned by authenticated user');
    error.code = '42501';
    throw error;
  }
  const exact = await client.query(
    `SELECT * FROM orqaly.assistant_messages
     WHERE tenant_id = $1 AND thread_id = $2 AND turn_id = $3 AND role = 'user'`,
    [tenantId, message.threadId, message.turnId]
  );
  if (exact.rows[0]) {
    return { message: assistantMessage(exact.rows[0]), conflictingChild: false };
  }
  const child = await client.query(
    `SELECT * FROM orqaly.assistant_messages
     WHERE tenant_id = $1 AND thread_id = $2
       AND retry_of_turn_id = $3 AND role = 'user'`,
    [tenantId, message.threadId, message.retryOfTurnId]
  );
  if (child.rows[0]) {
    return { message: assistantMessage(child.rows[0]), conflictingChild: true };
  }
  const sequence = await client.query(
    `SELECT max(created_at) AS latest_created_at,
            EXISTS (
              SELECT 1
              FROM orqaly.assistant_messages AS pending_user
              WHERE pending_user.tenant_id = $1
                AND pending_user.thread_id = $2
                AND pending_user.role = 'user'
                AND NOT EXISTS (
                  SELECT 1
                  FROM orqaly.assistant_messages AS pending_assistant
                  WHERE pending_assistant.tenant_id = pending_user.tenant_id
                    AND pending_assistant.thread_id = pending_user.thread_id
                    AND pending_assistant.turn_id = pending_user.turn_id
                    AND pending_assistant.role = 'assistant'
                )
            ) AS has_pending_turn
       FROM orqaly.assistant_messages
       WHERE tenant_id = $1 AND thread_id = $2`,
    [tenantId, message.threadId]
  );
  const boundary = sequence.rows[0] || {};
  if (boundary.has_pending_turn) {
    const error = new Error('the previous assistant turn is still pending');
    error.code = 'ASSISTANT_TURN_PENDING';
    throw error;
  }
  if (
    boundary.latest_created_at &&
    new Date(message.createdAt).getTime() <= new Date(boundary.latest_created_at).getTime()
  ) {
    const error = new Error('assistant turn timestamps must increase monotonically');
    error.code = 'ASSISTANT_TURN_TIMESTAMP_CONFLICT';
    throw error;
  }
  await client.query(
    `INSERT INTO orqaly.assistant_messages (
       tenant_id, thread_id, id, turn_id, role, route, parts, content_hash,
       axwise_operation_id, workflow_run_id, retry_of_turn_id, requested_intent,
       resolved_route, route_policy_version, route_reason_code, model, model_version, created_at
     ) VALUES (
       $1, $2, $3, $4, 'user', $5, $6::jsonb, $7, $8, $9, $10,
       $11, $12, $13, $14, $15, $16, $17
     )`,
    [
      tenantId,
      message.threadId,
      message.id,
      message.turnId,
      message.route,
      JSON.stringify(message.parts),
      message.contentHash,
      message.axwiseOperationId,
      message.workflowRunId,
      message.retryOfTurnId,
      message.requestedIntent ?? null,
      message.resolvedRoute ?? null,
      message.routePolicyVersion ?? null,
      message.routeReasonCode ?? null,
      message.model ?? null,
      message.modelVersion ?? null,
      message.createdAt,
    ]
  );
  const inserted = await client.query(
    `SELECT * FROM orqaly.assistant_messages
     WHERE tenant_id = $1 AND thread_id = $2 AND turn_id = $3 AND role = 'user'`,
    [tenantId, message.threadId, message.turnId]
  );
  return { message: assistantMessage(inserted.rows[0]), conflictingChild: false };
}

export async function appendAssistantTurnEventWithClient(client, tenantId, ownerUserId, event) {
  const { contentHash, ...rawInput } = event;
  const input = AssistantTurnEventInputSchema.parse(rawInput);
  const threadResult = await client.query(
    `SELECT id FROM orqaly.assistant_threads
     WHERE tenant_id = $1 AND id = $2 AND owner_user_id = $3`,
    [tenantId, input.threadId, ownerUserId]
  );
  if (!threadResult.rows[0]) {
    const error = new Error('assistant thread is not owned by authenticated user');
    error.code = '42501';
    throw error;
  }
  await client.query(
    `INSERT INTO orqaly.assistant_turn_events (
       tenant_id, thread_id, id, sequence, turn_id, event_type, route,
       axwise_operation_id, retry_of_turn_id, task_id, attempt_id, event_payload,
       event_hash, occurred_at
     ) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
     ON CONFLICT (tenant_id, id) DO NOTHING`,
    [
      tenantId,
      input.threadId,
      input.id,
      input.turnId,
      input.type,
      input.route,
      input.operationId,
      input.retryOfTurnId,
      input.taskId,
      input.attemptId,
      JSON.stringify(input.payload),
      contentHash,
      input.occurredAt,
    ]
  );
  const result = await client.query(
    `SELECT * FROM orqaly.assistant_turn_events
     WHERE tenant_id = $1 AND thread_id = $2 AND id = $3`,
    [tenantId, input.threadId, input.id]
  );
  return assistantTurnEvent(result.rows[0]);
}

export async function readAssistantTurnEventsWithClient(
  client,
  tenantId,
  ownerUserId,
  threadId,
  afterSequence,
  limit
) {
  const result = await client.query(
    `SELECT event.*
     FROM orqaly.assistant_turn_events AS event
     JOIN orqaly.assistant_threads AS thread
       ON thread.tenant_id = event.tenant_id AND thread.id = event.thread_id
     WHERE event.tenant_id = $1 AND event.thread_id = $2
       AND thread.owner_user_id = $3 AND event.sequence > $4
     ORDER BY event.sequence
     LIMIT $5`,
    [tenantId, threadId, ownerUserId, afterSequence, limit]
  );
  const events = result.rows
    .map(assistantTurnEvent)
    .map(({ contentHash: _contentHash, ...event }) => event);
  return AssistantTurnEventBatchSchema.parse({
    events,
    cursor: events.at(-1)?.sequence || afterSequence,
  });
}

export async function hasAssistantTurnEventWithClient(
  client,
  tenantId,
  ownerUserId,
  threadId,
  turnId,
  type
) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM orqaly.assistant_turn_events AS event
       JOIN orqaly.assistant_threads AS thread
         ON thread.tenant_id = event.tenant_id AND thread.id = event.thread_id
       WHERE event.tenant_id = $1 AND event.thread_id = $2 AND event.turn_id = $3
         AND event.event_type = $4 AND thread.owner_user_id = $5
     ) AS present`,
    [tenantId, threadId, turnId, type, ownerUserId]
  );
  return result.rows[0]?.present === true;
}

export async function loadSnapshotWithClient(
  client,
  tenantId,
  runId,
  { includeLeaseToken = false, skipTerminal = false } = {}
) {
  const runResult = await client.query(
    `SELECT run.id, run.tenant_id, run.owner_user_id, run.owner_organization_id,
                run.mode, run.status,
                run.request_payload ->> 'request' AS request,
                run.request_payload -> 'workProfile' AS work_profile,
                run.request_hash, run.row_version, run.evidence_readiness,
                final.id AS artifact_id, final.content_hash AS artifact_hash,
                final.kind AS artifact_kind
         FROM orqaly.workflow_runs AS run
         LEFT JOIN orqaly.artifacts AS final
           ON final.tenant_id = run.tenant_id AND final.run_id = run.id
          AND final.id = run.final_artifact_id
         WHERE run.tenant_id = $1 AND run.id = $2`,
    [tenantId, runId]
  );
  const run = runResult.rows[0];
  // Recovery can race completion, or briefly run against the pre-024 RPC.
  // Check metadata before fetching potentially large immutable attempt inputs.
  if (!run || (skipTerminal && TERMINAL_RUN_STATUSES.has(run.status))) return null;
  const stageResult = await client.query(
    `SELECT stage.id, stage.stage_key, stage.kind, stage.status, stage.row_version,
                stage.ordinal, stage.input_hash, output.id AS artifact_id,
                output.content_hash AS artifact_hash, output.kind AS artifact_kind
         FROM orqaly.workflow_stages AS stage
         LEFT JOIN orqaly.artifacts AS output
           ON output.tenant_id = stage.tenant_id AND output.run_id = stage.run_id
          AND output.id = stage.output_artifact_id
         WHERE stage.tenant_id = $1 AND stage.run_id = $2
         ORDER BY stage.ordinal`,
    [tenantId, runId]
  );
  const leaseTokenProjection = includeLeaseToken ? ', lease_token' : '';
  const attemptResult = await client.query(
    `SELECT id, stage_id, attempt_number, status, operation_id, input_hash,
                input_payload, row_version${leaseTokenProjection}, lease_expires_at
         FROM orqaly.stage_attempts
         WHERE tenant_id = $1 AND run_id = $2
         ORDER BY created_at, attempt_number`,
    [tenantId, runId]
  );
  const dependencyResult = await client.query(
    `SELECT stage_id, depends_on_stage_id
         FROM orqaly.workflow_stage_dependencies
         WHERE tenant_id = $1 AND run_id = $2`,
    [tenantId, runId]
  );
  const approvalResult = await client.query(
    `SELECT approval.id, approval.kind, approval.stage_id, approval.input_hash,
                approval.idempotency_key, approval.decision_hash, approval.decision,
                artifact.id AS artifact_id, artifact.content_hash AS artifact_hash,
                artifact.kind AS artifact_kind
         FROM orqaly.approvals AS approval
         JOIN orqaly.artifacts AS artifact
           ON artifact.tenant_id = approval.tenant_id
          AND artifact.run_id = approval.run_id AND artifact.id = approval.artifact_id
         WHERE approval.tenant_id = $1 AND approval.run_id = $2
         ORDER BY approval.created_at`,
    [tenantId, runId]
  );

  const SnapshotSchema = includeLeaseToken ? WorkflowSnapshotSchema : PublicWorkflowSnapshotSchema;
  return SnapshotSchema.parse({
    run: {
      id: run.id,
      tenantId: run.tenant_id,
      ownerUserId: run.owner_user_id,
      ownerOrganizationId: run.owner_organization_id,
      mode: run.mode,
      ...(run.work_profile ? { workProfile: run.work_profile } : {}),
      status: run.status,
      request: run.request,
      requestHash: run.request_hash,
      rowVersion: Number(run.row_version),
      evidenceReadiness: run.evidence_readiness,
      finalArtifact: artifactRef(run),
    },
    stages: stageResult.rows.map((stage) => ({
      id: stage.id,
      stageKey: stage.stage_key,
      kind: stage.kind,
      status: stage.status,
      rowVersion: Number(stage.row_version),
      ordinal: stage.ordinal,
      inputHash: stage.input_hash,
      outputArtifact: artifactRef(stage),
    })),
    attempts: attemptResult.rows.map((attempt) => ({
      id: attempt.id,
      stageId: attempt.stage_id,
      attemptNumber: attempt.attempt_number,
      status: attempt.status,
      operationId: attempt.operation_id,
      inputHash: attempt.input_hash,
      inputPayload: attempt.input_payload,
      rowVersion: Number(attempt.row_version),
      ...(includeLeaseToken ? { leaseToken: attempt.lease_token } : {}),
      leaseExpiresAt: attempt.lease_expires_at?.toISOString() || null,
    })),
    dependencies: dependencyResult.rows.map((dependency) => ({
      stageId: dependency.stage_id,
      dependsOnStageId: dependency.depends_on_stage_id,
    })),
    approvals: approvalResult.rows.map((approval) => ({
      id: approval.id,
      kind: approval.kind,
      stageId: approval.stage_id,
      artifact: artifactRef(approval),
      inputHash: approval.input_hash,
      idempotencyKey: approval.idempotency_key,
      decisionHash: approval.decision_hash,
      decision: approval.decision,
    })),
  });
}

export async function ensurePersonalTenant(identityPool, environment, userId) {
  const result = await identityPool.query(
    'SELECT tenant_id, created FROM orqaly.ensure_personal_tenant($1, $2)',
    [environment, userId]
  );
  const row = result.rows?.[0];
  if (
    result.rows?.length !== 1 ||
    typeof row?.tenant_id !== 'string' ||
    typeof row?.created !== 'boolean'
  ) {
    throw new Error('ensure_personal_tenant returned an invalid result');
  }
  return { tenantId: row.tenant_id, created: row.created };
}

export async function resolvePersonalTenant(identityPool, environment, userId) {
  try {
    return (await ensurePersonalTenant(identityPool, environment, userId)).tenantId;
  } catch (error) {
    if (error?.code === '42501') return null;
    throw error;
  }
}

// The metadata-only view must not perform first-login provisioning. The
// identity role exposes only the existing JIT resolver, not direct table
// SELECTs. PostgreSQL READ ONLY permits its existing-binding SELECT path and
// rejects any attempted first-login INSERT; rollback leaves no new tenant.
export async function resolveExistingPersonalTenant(identityPool, environment, userId) {
  const client = await identityPool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const result = await ensurePersonalTenant(client, environment, userId);
    if (result.created) throw new Error('read-only identity resolution attempted provisioning');
    await client.query('COMMIT');
    return result.tenantId;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (['42501', '25006'].includes(error?.code)) return null;
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyNativeWorkflowReadiness(pool, { api = false } = {}) {
  // LIMIT 0 verifies the additive migration and SELECT grants without reading a
  // customer's rows, credential references or execution outputs.
  await pool.query(
    'SELECT id,preparation_version,native_metadata,environment_id,native_test_lease_token,native_test_lease_expires_at FROM orqaly.solution_build_requests LIMIT 0'
  );
  await pool.query(
    'SELECT id,candidate_fingerprint,test_artifact_hash,status,evidence FROM orqaly.solution_build_tests LIMIT 0'
  );
  await pool.query(
    'SELECT id,requirement_id,credential_type,status,scope FROM orqaly.solution_connections LIMIT 0'
  );
  if (api) await pool.query('SELECT id,evidence FROM orqaly.solution_invocations LIMIT 0');
  const result = await pool.query(
    `SELECT
    (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='orqaly' AND c.relname IN ('solution_build_requests','solution_build_tests','solution_connections')
        AND c.relrowsecurity AND c.relforcerowsecurity) AS isolated_tables,
    has_table_privilege(current_user,'orqaly.solution_build_tests','INSERT') AND
    has_table_privilege(current_user,'orqaly.solution_connections','INSERT') AND
    has_column_privilege(current_user,'orqaly.solution_build_requests','native_metadata','UPDATE') AND
    has_column_privilege(current_user,'orqaly.solution_build_requests','environment_id','UPDATE') AND
    has_column_privilege(current_user,'orqaly.solution_build_tests','evidence','UPDATE') AS build_grants,
    CASE WHEN $1::boolean THEN
      has_column_privilege(current_user,'orqaly.solution_connections','provider_credential_id','UPDATE') AND
      has_column_privilege(current_user,'orqaly.solution_invocations','evidence','UPDATE')
    ELSE true END AS api_grants,
    CASE WHEN $1::boolean THEN true ELSE
      has_function_privilege(current_user,'orqaly.claim_native_workflow_retest(uuid)','EXECUTE')
    END AS retest_grants,
    CASE WHEN $1::boolean THEN
      NOT has_function_privilege(current_user,'orqaly.verify_native_outbound_connection(uuid,uuid)','EXECUTE')
    ELSE has_function_privilege(current_user,'orqaly.verify_native_outbound_connection(uuid,uuid)','EXECUTE') AND
      NOT has_column_privilege(current_user,'orqaly.solution_connections','status','UPDATE')
    END AS verification_grants`,
    [api]
  );
  const row = result.rows[0];
  if (
    Number(row?.isolated_tables) !== 3 ||
    row?.build_grants !== true ||
    row?.api_grants !== true ||
    row?.retest_grants !== true ||
    row?.verification_grants !== true
  )
    throw new Error('Native workflow migration/role isolation is incomplete');
}

export async function verifySolutionRevisionForkReadiness(pool, { api = false } = {}) {
  if (api)
    await pool.query(
      'SELECT source_revision_id,target_revision_id,request_hash FROM orqaly.solution_revision_forks LIMIT 0'
    );
  const result = await pool.query(`SELECT
    (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='orqaly.solution_revision_forks'::regclass) AS rls,
    has_table_privilege(current_user,'orqaly.solution_revision_forks','SELECT') AS can_read,
    has_table_privilege(current_user,'orqaly.solution_revision_forks','INSERT') AS can_insert,
    has_table_privilege(current_user,'orqaly.solution_revision_forks','UPDATE,DELETE,TRUNCATE') AS can_mutate,
    has_table_privilege('orqaly_worker','orqaly.solution_revision_forks','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS worker_access,
    (SELECT count(*)::integer FROM pg_constraint c
      WHERE c.contype='f' AND c.conrelid='orqaly.solution_revision_forks'::regclass
        AND c.confrelid='orqaly.solution_revisions'::regclass
        AND (SELECT array_agg(a.attname::text ORDER BY k.n) FROM unnest(c.confkey) WITH ORDINALITY k(attnum,n)
          JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum)=ARRAY['tenant_id','solution_id','id','owner_user_id']
        AND (SELECT array_agg(a.attname::text ORDER BY k.n) FROM unnest(c.conkey) WITH ORDINALITY k(attnum,n)
          JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum) IN
          (ARRAY['tenant_id','solution_id','source_revision_id','owner_user_id'],ARRAY['tenant_id','solution_id','target_revision_id','owner_user_id'])) AS owner_fks,
    EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conname='solution_revisions_solution_owner' AND c.contype='f'
      AND c.conrelid='orqaly.solution_revisions'::regclass AND c.confrelid='orqaly.customer_solutions'::regclass
      AND (SELECT array_agg(a.attname::text ORDER BY k.n) FROM unnest(c.conkey) WITH ORDINALITY k(attnum,n)
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum)=ARRAY['tenant_id','solution_id','owner_user_id']) AS revision_owner_fk,
    (SELECT count(*)::integer FROM pg_policy p WHERE p.polrelid='orqaly.solution_revision_forks'::regclass) AS policies,
    EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid='orqaly.solution_revision_forks'::regclass
      AND p.polname='solution_revision_forks_owner' AND p.polroles=ARRAY['orqaly_api'::regrole::oid]
      AND pg_get_expr(p.polqual,p.polrelid)=pg_get_expr(p.polwithcheck,p.polrelid)
      AND pg_get_expr(p.polqual,p.polrelid) LIKE '%owner_user_id%orqaly.build_owner_user_id%'
      AND pg_get_expr(p.polqual,p.polrelid) LIKE '%tenant_id%orqaly.current_tenant_id()%') AS owner_policy`);
  const row = result.rows[0];
  if (
    !row?.rls ||
    row.can_read !== api ||
    row.can_insert !== api ||
    row.can_mutate ||
    row.worker_access ||
    Number(row.owner_fks) !== 2 ||
    !row.revision_owner_fk ||
    Number(row.policies) !== 1 ||
    !row.owner_policy
  )
    throw new Error('solution_revision_fork_isolation_invalid');
}

export function createPostgresRepositories({
  environment,
  identityDatabaseUrl,
  apiDatabaseUrl,
  workerDatabaseUrl,
  requireSolutionBuilds = false,
  requireSolutionApplicationKeys = false,
  requireNativeWorkflowBuilds = false,
  requireRevisionConnections = false,
  requireFailureProbes = false,
  requireSolutionConversations = false,
  requireSolutionSchedules = false,
  requireCoding = false,
  requireCapabilityWork = false,
}) {
  if (!['preview', 'production'].includes(environment)) {
    throw new Error('ORQALY_ENVIRONMENT must be preview or production');
  }
  const identityPool = identityDatabaseUrl
    ? poolFor(identityDatabaseUrl, `orqaly-${environment}-identity`, 'ORQALY_IDENTITY_POOL_MAX', 2)
    : null;
  const apiPool = apiDatabaseUrl
    ? poolFor(apiDatabaseUrl, `orqaly-${environment}-api`, 'ORQALY_API_POOL_MAX', 4)
    : null;
  const workerPool = workerDatabaseUrl
    ? poolFor(workerDatabaseUrl, `orqaly-${environment}-worker`, 'ORQALY_WORKER_POOL_MAX', 4)
    : null;

  return {
    apiPool,
    revisionConnectionsEnabled: requireRevisionConnections,
    solutionBuildTransaction(scope, callback) {
      const pool = apiPool || workerPool;
      if (!pool) throw new Error('Solution build database URL is not configured');
      if (!scope?.tenantId || !scope?.userId) throw new Error('Solution build scope is required');
      return withTenantClient(pool, scope.tenantId, async (client) => {
        await client.query("SELECT set_config('orqaly.build_owner_user_id', $1, true)", [
          scope.userId,
        ]);
        return callback(client);
      });
    },
    async claimSolutionBuildAttempt(workerId, leaseToken, leaseSeconds = 180) {
      if (!workerPool) throw new Error('Worker database URL is not configured');
      const result = await workerPool.query(
        'SELECT orqaly.claim_solution_build_attempt($1,$2,$3) AS claim',
        [workerId, leaseToken, leaseSeconds]
      );
      return result.rows[0]?.claim || null;
    },
    async claimNativeWorkflowRetest(leaseToken) {
      if (!workerPool) throw new Error('Worker database URL is not configured');
      const result = await workerPool.query(
        'SELECT orqaly.claim_native_workflow_retest($1::uuid) AS claim',
        [leaseToken]
      );
      return result.rows[0]?.claim || null;
    },
    async claimSolutionSchedule(leaseToken) {
      if (!workerPool) throw new Error('Worker database URL is not configured');
      const result = await workerPool.query(
        'SELECT orqaly.claim_solution_schedule($1::uuid) AS claim',
        [leaseToken]
      );
      return result.rows[0]?.claim || null;
    },
    async claimSolutionConversationTurn(leaseToken) {
      if (!workerPool) throw new Error('Worker database URL is not configured');
      const result = await workerPool.query(
        'SELECT orqaly.claim_solution_conversation_turn($1::uuid) AS claim',
        [leaseToken]
      );
      return result.rows[0]?.claim || null;
    },
    async claimSolutionConversationTurnV2(leaseToken) {
      if (!workerPool) throw new Error('Worker database URL is not configured');
      const result = await workerPool.query(
        'SELECT orqaly.claim_solution_conversation_turn_v2($1::uuid) AS claim',
        [leaseToken]
      );
      return result.rows[0]?.claim || null;
    },
    async claimCodingJob(executionId) {
      if (!workerPool) throw new Error('Worker database URL is not configured');
      const result = await workerPool.query(
        'SELECT orqaly.claim_solution_coding_job($1::uuid) AS claim',
        [executionId]
      );
      return result.rows[0]?.claim || null;
    },
    solutionTransaction(tenantId, callback) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, callback);
    },
    async resolveTenant({ userId }) {
      if (!identityPool) throw new Error('identity database URL is not configured');
      return resolvePersonalTenant(identityPool, environment, userId);
    },

    async resolveExistingTenant({ userId }) {
      if (!identityPool) throw new Error('identity database URL is not configured');
      return resolveExistingPersonalTenant(identityPool, environment, userId);
    },

    loadWorkspaceProjection(tenantId) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        readWorkspaceProjectionWithClient(client, tenantId)
      );
    },

    loadOverviewProjection(tenantId, limit = 25, options = {}) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        readOverviewProjectionWithClient(client, tenantId, limit, options)
      );
    },

    loadActivityProjection(tenantId, limit = 50, options = {}) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        readActivityProjectionWithClient(client, tenantId, limit, options)
      );
    },

    loadSnapshot(tenantId, runId) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        loadSnapshotWithClient(client, tenantId, runId)
      );
    },

    loadGoalWorkflowView(tenantId, ownerUserId, runId) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(
        apiPool,
        tenantId,
        (client) => readGoalWorkflowViewWithClient(client, tenantId, ownerUserId, runId),
        { readOnlySnapshot: true }
      );
    },

    loadArtifact(tenantId, runId, artifactId, { capabilityOwnerUserId } = {}) {
      if (!apiPool && !workerPool) throw new Error('database URL is not configured');
      const pool = apiPool || workerPool;
      return withTenantClient(pool, tenantId, async (client) => {
        const result = await client.query(
          `SELECT id AS artifact_id, content_hash AS artifact_hash, kind AS artifact_kind,
                  content_type, payload, markdown, input_hash,
                  ARRAY(SELECT lineage.source_artifact_id
                        FROM orqaly.artifact_lineage AS lineage
                        WHERE lineage.tenant_id = artifact.tenant_id
                          AND lineage.run_id = artifact.run_id
                          AND lineage.artifact_id = artifact.id
                        ORDER BY lineage.source_artifact_id) AS source_artifact_ids
           FROM orqaly.artifacts AS artifact
           WHERE artifact.tenant_id = $1 AND artifact.run_id = $2 AND artifact.id = $3
           ${capabilityOwnerUserId === undefined ? '' : `AND EXISTS (
             SELECT 1 FROM orqaly.workflow_runs AS owned_run
             WHERE owned_run.tenant_id = artifact.tenant_id AND owned_run.id = artifact.run_id
               AND (owned_run.request_payload #>> '{workProfile,type}' IS DISTINCT FROM 'capability_work_v1'
                 OR (owned_run.owner_user_id = $4 AND owned_run.owner_organization_id IS NULL))
           )`}`,
          capabilityOwnerUserId === undefined ? [tenantId, runId, artifactId] : [tenantId, runId, artifactId, capabilityOwnerUserId]
        );
        const artifact = result.rows[0];
        if (!artifact) return null;
        return {
          ...artifactRef(artifact),
          contentType: artifact.content_type,
          payload: artifact.payload,
          markdown: artifact.markdown,
          inputHash: artifact.input_hash,
          sourceArtifactIds: artifact.source_artifact_ids,
        };
      });
    },

    loadTenantArtifact(tenantId, artifactId) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, async (client) => {
        const result = await client.query(
          `SELECT artifact.run_id, artifact.id AS artifact_id,
                  artifact.content_hash AS artifact_hash, artifact.kind AS artifact_kind,
                  artifact.content_type, artifact.payload, artifact.markdown,
                  artifact.input_hash,
                  ARRAY(SELECT lineage.source_artifact_id
                        FROM orqaly.artifact_lineage AS lineage
                        WHERE lineage.tenant_id = artifact.tenant_id
                          AND lineage.run_id = artifact.run_id
                          AND lineage.artifact_id = artifact.id
                        ORDER BY lineage.source_artifact_id) AS source_artifact_ids
           FROM orqaly.artifacts AS artifact
           WHERE artifact.tenant_id = $1 AND artifact.id = $2`,
          [tenantId, artifactId]
        );
        const artifact = result.rows[0];
        if (!artifact) return null;
        return {
          ...artifactRef(artifact),
          runId: artifact.run_id,
          contentType: artifact.content_type,
          payload: artifact.payload,
          markdown: artifact.markdown,
          inputHash: artifact.input_hash,
          sourceArtifactIds: artifact.source_artifact_ids,
        };
      });
    },

    applyTransition(tenantId, runId, plan) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, async (client) => {
        const result = await client.query(
          'SELECT orqaly.apply_transition($1, $2, $3::jsonb) AS receipt',
          [tenantId, runId, JSON.stringify(plan)]
        );
        return result.rows[0].receipt;
      });
    },

    applyCapabilityTransition(tenantId, runId, plan) {
      if (!apiPool) throw new Error('API database URL is not configured');
      if (!requireCapabilityWork) throw new Error('Capability work is not enabled');
      return withTenantClient(apiPool, tenantId, async (client) => {
        const result = await client.query(
          'SELECT orqaly.apply_capability_transition($1, $2, $3::jsonb) AS receipt',
          [tenantId, runId, JSON.stringify(plan)]
        );
        return result.rows[0].receipt;
      });
    },

    async listSnapshots(tenantId, limit = 25) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, async (client) => {
        const result = await client.query(
          `SELECT id FROM orqaly.workflow_runs
           WHERE tenant_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
          [tenantId, limit]
        );
        const workflows = [];
        for (const row of result.rows) {
          workflows.push(await loadSnapshotWithClient(client, tenantId, row.id));
        }
        return workflows;
      });
    },

    createAssistantTurn(tenantId, owner, thread, message) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        createAssistantTurnWithClient(client, tenantId, owner, thread, message)
      );
    },

    createAssistantRetryTurn(tenantId, ownerUserId, message) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        createAssistantRetryTurnWithClient(client, tenantId, ownerUserId, message)
      );
    },

    appendAssistantMessage(tenantId, ownerUserId, message) {
      if (!apiPool) throw new Error('API database URL is not configured');
      const { contentHash, ...rawMessage } = message;
      const writeMessage = { ...AssistantMessageSchema.parse(rawMessage), contentHash };
      return withTenantClient(apiPool, tenantId, async (client) => {
        const threadResult = await client.query(
          `SELECT id FROM orqaly.assistant_threads
           WHERE tenant_id = $1 AND id = $2 AND owner_user_id = $3`,
          [tenantId, writeMessage.threadId, ownerUserId]
        );
        if (!threadResult.rows[0]) {
          const error = new Error('assistant thread is not owned by authenticated user');
          error.code = '42501';
          throw error;
        }
        await client.query(
          `INSERT INTO orqaly.assistant_messages (
             tenant_id, thread_id, id, turn_id, role, route, parts, content_hash,
             axwise_operation_id, workflow_run_id, retry_of_turn_id, requested_intent,
             resolved_route, route_policy_version, route_reason_code, model, model_version,
             created_at
           ) VALUES (
             $1, $2, $3, $4, 'assistant', $5, $6::jsonb, $7, $8, $9, $10,
             $11, $12, $13, $14, $15, $16, $17
           )
           ON CONFLICT (tenant_id, thread_id, turn_id, role) DO NOTHING`,
          [
            tenantId,
            writeMessage.threadId,
            writeMessage.id,
            writeMessage.turnId,
            writeMessage.route,
            JSON.stringify(writeMessage.parts),
            writeMessage.contentHash,
            writeMessage.axwiseOperationId,
            writeMessage.workflowRunId,
            writeMessage.retryOfTurnId,
            writeMessage.requestedIntent ?? null,
            writeMessage.resolvedRoute ?? null,
            writeMessage.routePolicyVersion ?? null,
            writeMessage.routeReasonCode ?? null,
            writeMessage.model ?? null,
            writeMessage.modelVersion ?? null,
            writeMessage.createdAt,
          ]
        );
        await client.query(
          `UPDATE orqaly.assistant_threads SET updated_at = clock_timestamp()
           WHERE tenant_id = $1 AND id = $2 AND owner_user_id = $3`,
          [tenantId, writeMessage.threadId, ownerUserId]
        );
        const result = await client.query(
          `SELECT * FROM orqaly.assistant_messages
           WHERE tenant_id = $1 AND thread_id = $2 AND turn_id = $3 AND role = 'assistant'`,
          [tenantId, writeMessage.threadId, writeMessage.turnId]
        );
        return assistantMessage(result.rows[0]);
      });
    },

    appendAssistantTurnEvent(tenantId, ownerUserId, event) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        appendAssistantTurnEventWithClient(client, tenantId, ownerUserId, event)
      );
    },

    readAssistantTurnEvents(tenantId, ownerUserId, threadId, afterSequence = 0, limit = 100) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        readAssistantTurnEventsWithClient(
          client,
          tenantId,
          ownerUserId,
          threadId,
          afterSequence,
          limit
        )
      );
    },

    hasAssistantTurnEvent(tenantId, ownerUserId, threadId, turnId, type) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        hasAssistantTurnEventWithClient(client, tenantId, ownerUserId, threadId, turnId, type)
      );
    },

    loadAssistantThread(tenantId, threadId, ownerUserId) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        readAssistantThreadWithClient(client, tenantId, threadId, ownerUserId)
      );
    },

    listAssistantThreads(tenantId, ownerUserId, limit = 25) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, async (client) => {
        const result = await client.query(
          `SELECT * FROM orqaly.assistant_threads
           WHERE tenant_id = $1 AND owner_user_id = $2
           ORDER BY updated_at DESC, id DESC LIMIT $3`,
          [tenantId, ownerUserId, limit]
        );
        return result.rows.map(assistantThread);
      });
    },

    listDelegatedAgents(tenantId, ownerUserId, limit = 100) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        readDelegatedAgentsWithClient(client, tenantId, ownerUserId, limit)
      );
    },

    listAgentAssignmentsForAgent(tenantId, ownerUserId, agentId, limit = 100) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        readAgentAssignmentsForAgentWithClient(client, tenantId, ownerUserId, agentId, limit)
      );
    },

    readAgentAssignmentStats(tenantId, ownerUserId, agentIds) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        readAgentAssignmentStatsWithClient(client, tenantId, ownerUserId, agentIds)
      );
    },

    findLatestAssistantGoalRunId(tenantId, threadId, ownerUserId) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, async (client) => {
        const result = await client.query(
          `SELECT message.workflow_run_id
           FROM orqaly.assistant_messages AS message
           JOIN orqaly.assistant_threads AS thread
             ON thread.tenant_id = message.tenant_id AND thread.id = message.thread_id
           WHERE message.tenant_id = $1 AND message.thread_id = $2
             AND thread.owner_user_id = $3 AND message.workflow_run_id IS NOT NULL
           ORDER BY message.created_at DESC, message.id DESC LIMIT 1`,
          [tenantId, threadId, ownerUserId]
        );
        return result.rows[0]?.workflow_run_id || null;
      });
    },

    loadExecutableActionRunContext(tenantId, runId, ownerUserId) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        loadExecutableActionRunContextWithClient(client, tenantId, runId, ownerUserId)
      );
    },

    insertExecutableAction(tenantId, action) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        insertExecutableActionWithClient(client, action)
      );
    },

    loadLatestExecutableAction(tenantId, runId, ownerUserId, observedAt) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        loadLatestExecutableActionWithClient(client, tenantId, runId, ownerUserId, observedAt)
      );
    },

    reconcileExecutableAction(tenantId, actionId, ownerUserId, receiptHash) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        reconcileExecutableActionWithClient(client, tenantId, actionId, ownerUserId, receiptHash)
      );
    },

    loadExecutableAction(tenantId, actionId, ownerUserId, observedAt) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        loadExecutableActionWithClient(client, tenantId, actionId, ownerUserId, observedAt)
      );
    },

    decideExecutableAction(tenantId, decision) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        decideExecutableActionWithClient(client, decision)
      );
    },

    completeExecutableAction(tenantId, completion) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, (client) =>
        completeExecutableActionWithClient(client, completion)
      );
    },

    loadWorkflowEvent(tenantId, runId, eventId) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, async (client) => {
        const result = await client.query(
          `SELECT event_payload, transition_receipt
           FROM orqaly.workflow_events
           WHERE tenant_id = $1 AND run_id = $2 AND id = $3`,
          [tenantId, runId, eventId]
        );
        const row = result.rows[0];
        return row ? { event: row.event_payload, receipt: row.transition_receipt } : null;
      });
    },

    findScopeRevisionByIdempotency(tenantId, runId, idempotencyKey) {
      if (!apiPool) throw new Error('API database URL is not configured');
      return withTenantClient(apiPool, tenantId, async (client) => {
        const result = await client.query(
          `SELECT event_payload, transition_receipt
           FROM orqaly.workflow_events
           WHERE tenant_id = $1 AND run_id = $2
             AND event_type = 'ScopeRevisionRequested'
             AND event_payload ->> 'idempotencyKey' = $3
           ORDER BY created_at, id LIMIT 1`,
          [tenantId, runId, idempotencyKey]
        );
        const row = result.rows[0];
        return row ? { event: row.event_payload, receipt: row.transition_receipt } : null;
      });
    },

    async readiness() {
      const pools = [identityPool, apiPool, workerPool].filter(Boolean);
      if (!pools.length) throw new Error('no database pools are configured');
      await Promise.all(pools.map((pool) => pool.query('SELECT 1')));
      if (requireCapabilityWork) {
        const pool = apiPool || workerPool;
        const result = await pool.query(`SELECT
          to_regprocedure('orqaly.apply_capability_transition(uuid,uuid,jsonb)') IS NOT NULL AS wrapper_exists,
          to_regprocedure('orqaly.capability_work_schema_ready_025()') IS NOT NULL AS attestation_exists,
          (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('orqaly.capability_work_schema_ready_025()')) AS attestation_source,
          (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'orqaly.workflow_runs'::regclass) AS forced_rls,
          EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'orqaly.workflow_runs'::regclass
            AND conname = 'workflow_runs_status_check' AND convalidated AND NOT connoinherit
            AND pg_get_constraintdef(oid) LIKE '%awaiting_capability_input%') AS idle_status,
          has_table_privilege(current_user,'orqaly.workflow_runs','INSERT') OR
            has_table_privilege(current_user,'orqaly.workflow_runs','UPDATE') OR
            has_table_privilege(current_user,'orqaly.workflow_runs','DELETE') AS broad_write`);
        if (
          !result.rows[0]?.wrapper_exists ||
          !result.rows[0]?.attestation_exists ||
          typeof result.rows[0]?.attestation_source !== 'string' ||
          sha256Hex(result.rows[0].attestation_source) !== CAPABILITY_SCHEMA_ATTESTATION_SHA256 ||
          !result.rows[0]?.forced_rls ||
          !result.rows[0]?.idle_status ||
          result.rows[0]?.broad_write
        ) {
          throw new Error('capability_work_migration_025_required');
        }
        const attestation = await pool.query(
          'SELECT orqaly.capability_work_schema_ready_025() AS ready'
        );
        if (attestation.rows[0]?.ready !== true)
          throw new Error('capability_work_migration_025_required');
        const permissions = await pool.query(
          "SELECT has_function_privilege(current_user,'orqaly.apply_capability_transition(uuid,uuid,jsonb)','EXECUTE') AS can_command"
        );
        if (permissions.rows[0]?.can_command !== Boolean(apiPool))
          throw new Error('capability_work_privileges_invalid');
      }
      if (requireSolutionBuilds) {
        const pool = apiPool || workerPool;
        if (!pool) throw new Error('Solution build database URL is not configured');
        // LIMIT 0 verifies migration 013 and role grants without reading another
        // owner's data or requiring a fabricated tenant during readiness.
        await pool.query(
          'SELECT id,input_version,workflow_hash FROM orqaly.solution_build_requests LIMIT 0'
        );
        await pool.query(
          'SELECT id,envelope,lease_token FROM orqaly.solution_build_attempts LIMIT 0'
        );
        await pool.query('SELECT id,request_key FROM orqaly.solution_build_events LIMIT 0');
      }
      if (requireSolutionApplicationKeys) {
        if (!apiPool) throw new Error('Application access database URL is not configured');
        await apiPool.query(
          'SELECT id,token_hash,revoked_at FROM orqaly.solution_application_keys LIMIT 0'
        );
        await apiPool.query(
          'SELECT solution_id,minute_count,day_count FROM orqaly.solution_application_usage LIMIT 0'
        );
        await apiPool.query(
          'SELECT application_key_id,application_key_label FROM orqaly.solution_invocations LIMIT 0'
        );
        await apiPool.query('SELECT id,status FROM orqaly.tenants LIMIT 0');
      }
      if (requireNativeWorkflowBuilds) {
        const pool = apiPool || workerPool;
        if (!pool) throw new Error('Native workflow database URL is not configured');
        await verifyNativeWorkflowReadiness(pool, { api: Boolean(apiPool) });
      }
      if (requireRevisionConnections) {
        const { verifyRevisionConnectionsReadiness } = await import('./solution-revision-storage-readiness.js');
        await verifyRevisionConnectionsReadiness(apiPool || workerPool, { api: Boolean(apiPool) });
      }
      if (requireFailureProbes) {
        if (!apiPool) throw new Error('Failure probes require API authority');
        const { verifyFailureProbeReadiness } = await import('./solution-revision-storage-readiness.js');
        await verifyFailureProbeReadiness(apiPool);
      }
      if (requireSolutionConversations) {
        const pool = apiPool || workerPool;
        await verifySolutionRevisionForkReadiness(pool, { api: Boolean(apiPool) });
        await pool.query(
          'SELECT id,context_hash,operation_id,lease_token,lifecycle FROM orqaly.solution_conversation_turns LIMIT 0'
        );
        const checks = (
          await pool.query(`SELECT
          (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='orqaly.solution_conversation_turns'::regclass) AS rls,
          has_function_privilege(current_user,'orqaly.claim_solution_conversation_turn(uuid)','EXECUTE') AS claim,
          has_function_privilege(current_user,'orqaly.claim_solution_conversation_turn_v2(uuid)','EXECUTE') AS claim_v2,
          has_function_privilege(current_user,'orqaly.complete_solution_conversation_turn(uuid,uuid,jsonb)','EXECUTE') AS complete,
          has_function_privilege(current_user,'orqaly.advance_solution_conversation_turn(uuid,uuid,jsonb)','EXECUTE') AS advance,
          has_table_privilege(current_user,'orqaly.solution_conversation_turns','UPDATE') OR has_table_privilege(current_user,'orqaly.solution_conversation_turns','DELETE') AS broad_write,
          has_table_privilege('orqaly_worker','orqaly.solution_revisions','UPDATE') OR has_table_privilege('orqaly_worker','orqaly.solution_revisions','INSERT') AS worker_revision_write`)
        ).rows[0];
        const isWorker = Boolean(workerPool && !apiPool);
        if (
          !checks?.rls ||
          checks.claim !== isWorker ||
          checks.claim_v2 !== isWorker ||
          checks.complete !== isWorker ||
          checks.advance !== isWorker ||
          checks.broad_write ||
          checks.worker_revision_write
        )
          throw new Error('solution_conversation_isolation_invalid');
      }
      if (requireSolutionSchedules) {
        const pool = apiPool || workerPool;
        await pool.query(
          'SELECT id,workflow_hash,lease_token,next_run_at FROM orqaly.solution_schedules LIMIT 0'
        );
        await pool.query(
          'SELECT id,invocation_id,status FROM orqaly.solution_schedule_ticks LIMIT 0'
        );
        const permissions = await pool.query(
          "SELECT has_function_privilege(current_user,'orqaly.claim_solution_schedule(uuid)','EXECUTE') AS can_claim"
        );
        if (permissions.rows[0]?.can_claim !== Boolean(workerPool && !apiPool))
          throw new Error('schedule_claim_privileges_invalid');
      }
      if (requireCoding) {
        const pool = apiPool || workerPool;
        await pool.query(
          'SELECT id,spec_hash,status,execution_id FROM orqaly.solution_coding_jobs LIMIT 0'
        );
        await pool.query('SELECT job_id FROM orqaly.solution_coding_dispatches LIMIT 0');
        const permissions = await pool.query(
          "SELECT has_function_privilege(current_user,'orqaly.claim_solution_coding_job(uuid)','EXECUTE') AS can_claim"
        );
        if (permissions.rows[0]?.can_claim !== Boolean(workerPool && !apiPool))
          throw new Error('coding_claim_privileges_invalid');
      }
      return { database: 'ok', environment };
    },

    async claimOutbox(workerId, leaseToken, leaseSeconds = 120) {
      if (!workerPool) throw new Error('worker database URL is not configured');
      const result = await workerPool.query('SELECT orqaly.claim_outbox($1, $2, $3) AS claim', [
        workerId,
        leaseToken,
        leaseSeconds,
      ]);
      return result.rows[0]?.claim || null;
    },

    async claimExportOutbox(workerId, leaseToken, leaseSeconds = 120) {
      if (!workerPool) throw new Error('worker database URL is not configured');
      const result = await workerPool.query(
        'SELECT orqaly.claim_export_outbox($1, $2, $3) AS claim',
        [workerId, leaseToken, leaseSeconds]
      );
      return result.rows[0]?.claim || null;
    },

    async acknowledgeExport({ tenantId, outboxId, leaseToken, succeeded, retryAt, errorClass }) {
      if (!workerPool) throw new Error('worker database URL is not configured');
      const result = await workerPool.query(
        'SELECT orqaly.ack_export_outbox($1, $2, $3, $4, $5, $6) AS receipt',
        [tenantId, outboxId, leaseToken, succeeded, retryAt || null, errorClass || null]
      );
      return result.rows[0].receipt;
    },

    async listExpiredAttemptLeases(limit = 100) {
      if (!workerPool) throw new Error('worker database URL is not configured');
      const result = await workerPool.query(
        'SELECT value FROM orqaly.list_expired_attempt_leases($1) AS value',
        [limit]
      );
      return result.rows.map((row) => row.value);
    },

    loadWorkerSnapshot(tenantId, runId, { skipTerminal = false } = {}) {
      if (!workerPool) throw new Error('worker database URL is not configured');
      return withTenantClient(workerPool, tenantId, (client) =>
        loadSnapshotWithClient(client, tenantId, runId, { includeLeaseToken: true, skipTerminal })
      );
    },

    applyWorkerTransition(tenantId, runId, plan) {
      if (!workerPool) throw new Error('worker database URL is not configured');
      return withTenantClient(workerPool, tenantId, async (client) => {
        if (plan.event.type === 'LeaseExpired') {
          const result = await client.query(
            'SELECT orqaly.recover_attempt_lease($1, $2, $3::jsonb) AS receipt',
            [tenantId, runId, JSON.stringify(plan)]
          );
          return result.rows[0].receipt;
        }
        const result = await client.query(
          'SELECT orqaly.apply_transition($1, $2, $3::jsonb) AS receipt',
          [tenantId, runId, JSON.stringify(plan)]
        );
        return result.rows[0].receipt;
      });
    },

    loadActivityContext(tenantId, runId, attemptId, { includeArtifacts = true, inputPayload } = {}) {
      if (!workerPool) throw new Error('worker database URL is not configured');
      return withTenantClient(workerPool, tenantId, async (client) => {
        const activityResult = await client.query(
          `SELECT run.owner_user_id, run.owner_organization_id, run.mode,
                    run.request_payload ->> 'request' AS request,
                    stage.id AS stage_id, stage.kind AS stage_kind,
                    attempt.id AS attempt_id, attempt.attempt_number, attempt.operation_id,
                    attempt.input_hash, attempt.operation_status_url
                    ${inputPayload === undefined ? ', attempt.input_payload' : ''}
             FROM orqaly.stage_attempts AS attempt
             JOIN orqaly.workflow_runs AS run
               ON run.tenant_id = attempt.tenant_id AND run.id = attempt.run_id
             JOIN orqaly.workflow_stages AS stage
               ON stage.tenant_id = attempt.tenant_id AND stage.run_id = attempt.run_id
              AND stage.id = attempt.stage_id
             WHERE attempt.tenant_id = $1 AND attempt.run_id = $2 AND attempt.id = $3`,
          [tenantId, runId, attemptId]
        );
        const activity = activityResult.rows[0];
        if (!activity) return null;
        if (inputPayload !== undefined) {
          // Reuse only the hash-bound input already validated in the worker
          // snapshot. A stale or mismatched snapshot must never be substituted.
          if (canonicalHash(inputPayload) !== activity.input_hash)
            throw new Error('activity context input hash mismatch');
          activity.input_payload = inputPayload;
        }
        const capabilityArtifactIds = CAPABILITY_ACTIVITY_TYPES.includes(activity.input_payload?.type)
          ? [...new Set((activity.input_payload.selectedGrounding || []).map((item) => item.artifact.artifactId))]
          : null;
        const artifactResult = includeArtifacts && capabilityArtifactIds?.length !== 0 ? await client.query(
          `SELECT artifact.id AS artifact_id, artifact.kind AS artifact_kind,
                    artifact.content_hash AS artifact_hash, artifact.content_type,
                    artifact.payload, artifact.markdown, artifact.input_hash,
                    artifact.stage_id,
                    ARRAY(SELECT lineage.source_artifact_id
                          FROM orqaly.artifact_lineage AS lineage
                          WHERE lineage.tenant_id = artifact.tenant_id
                            AND lineage.run_id = artifact.run_id
                            AND lineage.artifact_id = artifact.id
                          ORDER BY lineage.source_artifact_id) AS source_artifact_ids
             FROM orqaly.artifacts AS artifact
             WHERE artifact.tenant_id = $1 AND artifact.run_id = $2
             ${capabilityArtifactIds ? 'AND artifact.id = ANY($3::uuid[])' : ''}
             ORDER BY artifact.created_at, artifact.id`,
          capabilityArtifactIds ? [tenantId, runId, capabilityArtifactIds] : [tenantId, runId]
        ) : { rows: [] };
        let agentRows = [];
        // The live, capability-filtered snapshot is needed only when research
        // completion constructs the immutable planning successor input. It is
        // never included in the AxWise research operation envelope.
        if (includeArtifacts && activity.stage_kind === 'execute_research') {
          const acceptedScope = activity.input_payload?.acceptedScope;
          const scopeArtifact = artifactResult.rows.find(
            (candidate) =>
              candidate.artifact_id === acceptedScope?.artifactId &&
              candidate.artifact_hash === acceptedScope?.artifactHash &&
              candidate.artifact_kind === 'scope'
          );
          if (!scopeArtifact)
            throw new Error('planning requires the exact accepted scope artifact');
          agentRows = await loadPlanningAgentRows(client, tenantId, scopeArtifact.payload);
        }
        return {
          ownerUserId: activity.owner_user_id,
          ownerOrganizationId: activity.owner_organization_id,
          mode: activity.mode,
          request: activity.request,
          stageId: activity.stage_id,
          stageKind: activity.stage_kind,
          attemptId: activity.attempt_id,
          attemptNumber: activity.attempt_number,
          operationId: activity.operation_id,
          inputHash: activity.input_hash,
          inputPayload: activity.input_payload,
          operationStatusUrl: activity.operation_status_url,
          artifacts: artifactResult.rows.map((artifact) => ({
            ...artifactRef(artifact),
            contentType: artifact.content_type,
            payload: artifact.payload,
            markdown: artifact.markdown,
            inputHash: artifact.input_hash,
            stageId: artifact.stage_id,
            sourceArtifactIds: artifact.source_artifact_ids || [],
          })),
          agents: agentRows.map((agent) => ({
            id: agent.id,
            name: agent.name,
            capabilities: [...agent.capabilities].sort(),
            toolIds: [...agent.tool_ids].sort(),
            qualityScoreMicros: Math.round(Number(agent.quality_score) * 1_000_000),
            costPerRunCents: agent.cost_per_run_cents,
          })),
        };
      });
    },

    async close() {
      await Promise.all(
        [identityPool, apiPool, workerPool].filter(Boolean).map((pool) => pool.end())
      );
    },

    workerPool,
  };
}
