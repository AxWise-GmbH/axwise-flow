import { normalizePersistedDelegatedAgentPart } from '../../shared/workflow-v2/assistant.js';

function repositoryError(code, status = 409) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

const STALE_EXECUTION_CODE = 'EXECUTION_DEADLINE_EXCEEDED';
const STALE_EXECUTION_MESSAGE =
  'execution did not produce a verified result before its deadline; manual reconciliation is required';

async function terminalizeStaleExecutableActionsWithClient(
  client,
  { tenantId, ownerUserId, observedAt, runId = null, actionId = null }
) {
  const result = await client.query(
    `UPDATE orqaly.executable_actions
     SET status = 'outcome_unknown', error_code = $6,
         sanitized_error = $7, terminal_at = $3,
         row_version = row_version + 1
     WHERE tenant_id = $1 AND owner_user_id = $2
       AND status = 'running' AND execution_deadline_at <= $3
       AND ($4::uuid IS NULL OR workflow_run_id = $4)
       AND ($5::uuid IS NULL OR id = $5)
     RETURNING *`,
    [
      tenantId,
      ownerUserId,
      observedAt,
      runId,
      actionId,
      STALE_EXECUTION_CODE,
      STALE_EXECUTION_MESSAGE,
    ]
  );
  return result.rows;
}

export async function loadExecutableActionRunContextWithClient(
  client,
  tenantId,
  runId,
  ownerUserId
) {
  const runResult = await client.query(
    `SELECT id, owner_user_id, owner_organization_id, status, request_payload
       FROM orqaly.workflow_runs
       WHERE tenant_id = $1 AND id = $2 AND owner_user_id = $3`,
    [tenantId, runId, ownerUserId]
  );
  const run = runResult.rows[0];
  if (!run) return null;
  const planResult = await client.query(
    `SELECT artifact.id, artifact.content_hash, artifact.input_hash, artifact.payload
       FROM orqaly.approvals AS approval
       JOIN orqaly.artifacts AS artifact
         ON artifact.tenant_id = approval.tenant_id
        AND artifact.run_id = approval.run_id
        AND artifact.id = approval.artifact_id
        AND artifact.content_hash = approval.artifact_hash
        AND artifact.input_hash = approval.input_hash
       WHERE approval.tenant_id = $1 AND approval.run_id = $2
         AND approval.kind = 'plan' AND approval.decision = 'approved'
         AND approval.decided_by = $3 AND artifact.kind = 'plan'
       ORDER BY approval.decided_at DESC, approval.id DESC
       LIMIT 1`,
    [tenantId, runId, ownerUserId]
  );
  const plan = planResult.rows[0] || null;
  const agentResult = await client.query(
    `SELECT part.value AS agent_part
       FROM orqaly.assistant_messages AS message
       JOIN orqaly.assistant_threads AS thread
         ON thread.tenant_id = message.tenant_id AND thread.id = message.thread_id
       CROSS JOIN LATERAL jsonb_array_elements(message.parts) AS part(value)
       WHERE message.tenant_id = $1 AND message.workflow_run_id = $2
         AND thread.owner_user_id = $3 AND message.role = 'assistant'
         AND part.value ->> 'type' = 'delegated_agent'
       ORDER BY message.created_at DESC, message.id DESC LIMIT 1`,
    [tenantId, runId, ownerUserId]
  );
  return {
    delegatedAgent: agentResult.rows[0]
      ? normalizePersistedDelegatedAgentPart(agentResult.rows[0].agent_part)
      : null,
    run: {
      id: run.id,
      ownerUserId: run.owner_user_id,
      ownerOrganizationId: run.owner_organization_id,
      status: run.status,
      request: run.request_payload?.request || '',
    },
    plan: plan
      ? {
          artifactId: plan.id,
          artifactHash: plan.content_hash,
          inputHash: plan.input_hash,
          payload: plan.payload,
        }
      : null,
  };
}

export async function insertExecutableActionWithClient(client, action) {
  // Serialize proposals for this owned Goal. Replaying the same command is
  // allowed; new authority must not hide an active or ambiguous older action.
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text, 0))`,
    [action.tenantId, action.runId]
  );
  const ownedRun = await client.query(
    `SELECT id FROM orqaly.workflow_runs
     WHERE tenant_id = $1 AND id = $2 AND owner_user_id = $3`,
    [action.tenantId, action.runId, action.ownerUserId]
  );
  if (!ownedRun.rows[0]) throw repositoryError('RUN_NOT_FOUND', 404);
  const prior = await client.query(
    `SELECT * FROM orqaly.executable_actions
     WHERE tenant_id = $1 AND workflow_run_id = $2 AND owner_user_id = $3
       AND (proposal_idempotency_key = $4 OR status IN ('running', 'outcome_unknown')
         OR (status = 'proposed' AND approval_expires_at > clock_timestamp()))
     ORDER BY created_at, id`,
    [action.tenantId, action.runId, action.ownerUserId, action.proposalIdempotencyKey]
  );
  const replay = prior.rows.find(
    (row) => row.proposal_idempotency_key === action.proposalIdempotencyKey
  );
  if (replay) {
    if (replay.proposal_hash !== action.proposalHash) {
      throw repositoryError('EXECUTABLE_ACTION_IDEMPOTENCY_CONFLICT');
    }
    return { row: replay, idempotent: true };
  }
  for (const row of prior.rows) {
    if (row.status !== 'outcome_unknown' || !(await actionNotApplied(client, row))) {
      throw repositoryError('EXECUTABLE_ACTION_REQUIRES_RECONCILIATION');
    }
  }
  const result = await client.query(
    `INSERT INTO orqaly.executable_actions (
       tenant_id, id, workflow_run_id, owner_user_id, agent_id, agent_name, status,
       operation_key, descriptor, executor_binding, persona_version,
       plan_artifact_id, plan_artifact_hash, task_input_hash,
       canonical_input, canonical_input_hash, proposal_idempotency_key, proposal_hash,
       action_intent, action_intent_hash, approval_subject, approval_binding_hash,
       approval_expires_at, step_id, effect_id, target_reference, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, 'proposed', $7, $8::jsonb, $9::jsonb, $10::jsonb,
       $11, $12, $13, $14::jsonb, $15, $16, $17, $18::jsonb, $19, $20::jsonb,
       $21, $22, $23, $24, $25, $26, $26
     )
     ON CONFLICT (tenant_id, workflow_run_id, proposal_idempotency_key) DO NOTHING
     RETURNING *`,
    [
      action.tenantId,
      action.id,
      action.runId,
      action.ownerUserId,
      action.agentId,
      action.agentName,
      action.operationKey,
      JSON.stringify(action.descriptor),
      JSON.stringify(action.executorBinding),
      JSON.stringify(action.personaVersion),
      action.planArtifactId,
      action.planArtifactHash,
      action.taskInputHash,
      JSON.stringify(action.canonicalInput),
      action.canonicalInputHash,
      action.proposalIdempotencyKey,
      action.proposalHash,
      JSON.stringify(action.actionIntent),
      action.actionIntentHash,
      JSON.stringify(action.approvalSubject),
      action.approvalBindingHash,
      action.approvalExpiresAt,
      action.stepId,
      action.effectId,
      action.targetReference,
      action.createdAt,
    ]
  );
  if (result.rows[0]) return { row: result.rows[0], idempotent: false };
  const racedReplay = await client.query(
    `SELECT * FROM orqaly.executable_actions
     WHERE tenant_id = $1 AND workflow_run_id = $2 AND proposal_idempotency_key = $3`,
    [action.tenantId, action.runId, action.proposalIdempotencyKey]
  );
  const row = racedReplay.rows[0];
  if (!row) throw repositoryError('EXECUTABLE_ACTION_IDEMPOTENCY_RACE');
  if (row.proposal_hash !== action.proposalHash) {
    throw repositoryError('EXECUTABLE_ACTION_IDEMPOTENCY_CONFLICT');
  }
  return { row, idempotent: true };
}

async function actionNotApplied(client, row) {
  const result = await client.query(
    `SELECT orqaly.executable_action_not_applied($1::uuid, $2::uuid, $3::text) AS not_applied`,
    [row.tenant_id, row.id, row.owner_user_id]
  );
  return result.rows[0]?.not_applied === true;
}

export async function loadLatestExecutableActionWithClient(
  client,
  tenantId,
  runId,
  ownerUserId,
  observedAt = new Date().toISOString()
) {
  const run = await client.query(
    `SELECT 1 FROM orqaly.workflow_runs
     WHERE tenant_id = $1 AND id = $2 AND owner_user_id = $3`,
    [tenantId, runId, ownerUserId]
  );
  if (!run.rows[0]) return { runFound: false, row: null };
  await terminalizeStaleExecutableActionsWithClient(client, {
    tenantId,
    ownerUserId,
    observedAt,
    runId,
  });
  const result = await client.query(
    `SELECT * FROM orqaly.executable_actions
     WHERE tenant_id = $1 AND workflow_run_id = $2 AND owner_user_id = $3
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [tenantId, runId, ownerUserId]
  );
  const row = result.rows[0] || null;
  if (row?.status === 'outcome_unknown' && (await actionNotApplied(client, row))) {
    row.recovery = 'confirmed_not_applied';
  } else if (row?.status === 'outcome_unknown') {
    const receipt = await client.query(
      'SELECT orqaly.load_committed_action_receipt($1,$2,$3) AS receipt',
      [tenantId, row.id, ownerUserId]
    );
    row.recovery_receipt = receipt.rows[0]?.receipt || null;
  }
  return { runFound: true, row };
}

export async function reconcileExecutableActionWithClient(
  client,
  tenantId,
  actionId,
  ownerUserId,
  receiptHash
) {
  const result = await client.query(
    'SELECT * FROM orqaly.reconcile_committed_action_receipt($1,$2,$3,$4)',
    [tenantId, actionId, ownerUserId, receiptHash]
  );
  if (!result.rows[0]) throw repositoryError('EXECUTABLE_ACTION_RECONCILIATION_CONFLICT');
  return result.rows[0];
}

export async function loadExecutableActionWithClient(
  client,
  tenantId,
  actionId,
  ownerUserId,
  observedAt = new Date().toISOString()
) {
  await terminalizeStaleExecutableActionsWithClient(client, {
    tenantId,
    ownerUserId,
    observedAt,
    actionId,
  });
  const result = await client.query(
    `SELECT * FROM orqaly.executable_actions
     WHERE tenant_id = $1 AND id = $2 AND owner_user_id = $3`,
    [tenantId, actionId, ownerUserId]
  );
  return result.rows[0] || null;
}

export async function decideExecutableActionWithClient(client, decision) {
  const locked = await client.query(
    `SELECT * FROM orqaly.executable_actions
     WHERE tenant_id = $1 AND id = $2 AND owner_user_id = $3
     FOR UPDATE`,
    [decision.tenantId, decision.actionId, decision.ownerUserId]
  );
  let action = locked.rows[0];
  if (!action) throw repositoryError('EXECUTABLE_ACTION_NOT_FOUND', 404);

  if (
    action.status === 'running' &&
    new Date(action.execution_deadline_at) <= new Date(decision.decidedAt)
  ) {
    const stale = await terminalizeStaleExecutableActionsWithClient(client, {
      tenantId: decision.tenantId,
      ownerUserId: decision.ownerUserId,
      observedAt: decision.decidedAt,
      actionId: decision.actionId,
    });
    action = stale[0] || action;
  }

  if (action.approval_idempotency_key === decision.idempotencyKey) {
    if (action.approval_decision_hash !== decision.decisionHash) {
      throw repositoryError('EXECUTABLE_ACTION_DECISION_IDEMPOTENCY_CONFLICT');
    }
    return { row: action, idempotent: true, dispatch: null };
  }
  if (Number(action.row_version) !== decision.expectedRowVersion) {
    throw repositoryError('EXECUTABLE_ACTION_VERSION_MISMATCH', 412);
  }
  if (action.status !== 'proposed') {
    throw repositoryError('EXECUTABLE_ACTION_ALREADY_DECIDED');
  }
  if (new Date(action.approval_expires_at) <= new Date(decision.decidedAt)) {
    throw repositoryError('EXECUTABLE_ACTION_APPROVAL_EXPIRED');
  }

  if (decision.decision === 'reject') {
    const rejected = await client.query(
      `UPDATE orqaly.executable_actions
       SET status = 'rejected', approval_decision = 'reject',
           approval_decision_hash = $4, approval_idempotency_key = $5,
           approval_reason = $6, approved_by_user_id = $3, decided_at = $7,
           terminal_at = $7, row_version = row_version + 1
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [
        decision.tenantId,
        decision.actionId,
        decision.ownerUserId,
        decision.decisionHash,
        decision.idempotencyKey,
        decision.reason,
        decision.decidedAt,
      ]
    );
    return { row: rejected.rows[0], idempotent: false, dispatch: null };
  }

  const running = await client.query(
    `UPDATE orqaly.executable_actions
     SET status = 'running', approval_decision = 'approve',
         approval_decision_hash = $4, approval_idempotency_key = $5,
         approval_reason = $6, approved_by_user_id = $3, decided_at = $7,
         attempt_id = $8, started_at = $7, execution_deadline_at = $9,
         row_version = row_version + 1
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [
      decision.tenantId,
      decision.actionId,
      decision.ownerUserId,
      decision.decisionHash,
      decision.idempotencyKey,
      decision.reason,
      decision.decidedAt,
      decision.attemptId,
      decision.executionDeadlineAt,
    ]
  );
  await client.query(
    `INSERT INTO orqaly.agentic_gateway_grants (
       tenant_id, id, action_id, owner_user_id, reference_hash, scope_hash,
       organization_id, workspace_id, run_id, step_id, effect_id,
       state, issued_at, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'issued', $12, $13)`,
    [
      decision.tenantId,
      decision.grantId,
      decision.actionId,
      decision.ownerUserId,
      decision.grantReferenceHash,
      decision.grantScopeHash,
      decision.organizationId,
      decision.workspaceId,
      decision.runId,
      decision.stepId,
      decision.effectId,
      decision.grantIssuedAt,
      decision.grantExpiresAt,
    ]
  );
  return {
    row: running.rows[0],
    idempotent: false,
    dispatch: { envelope: decision.envelope },
  };
}

export async function completeExecutableActionWithClient(client, completion) {
  const result = await client.query(
    `UPDATE orqaly.executable_actions
     SET status = $5, n8n_execution_reference = $6,
         dispatch_receipt = $7::jsonb, receipt_hash = $8,
         error_code = $9, sanitized_error = $10, terminal_at = $11,
         row_version = row_version + 1
     WHERE tenant_id = $1 AND id = $2 AND owner_user_id = $3
       AND attempt_id = $4 AND status = 'running'
     RETURNING *`,
    [
      completion.tenantId,
      completion.actionId,
      completion.ownerUserId,
      completion.attemptId,
      completion.status,
      completion.executionReference,
      completion.receipt ? JSON.stringify(completion.receipt) : null,
      completion.receiptHash,
      completion.errorCode,
      completion.sanitizedError,
      completion.terminalAt,
    ]
  );
  if (!result.rows[0]) throw repositoryError('EXECUTABLE_ACTION_COMPLETION_STATE_CONFLICT');
  return result.rows[0];
}
