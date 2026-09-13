import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { canonicalHash, canonicalJson, sha256Hex } from '../lib/workflow-v2/canonical.js';
import { transition } from '../lib/workflow-v2/state-machine.js';
import { createWorkflowCommandService } from '../server/workflow-v2/command-service.js';
import { createPostgresRepositories } from '../server/workflow-v2/postgres-repository.js';
import { createScopeCompletion } from './workflow-v2-local-e2e-fixtures.mjs';

const { Client } = pg;
const databaseUrl = process.env.WORKFLOW_V2_API_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('WORKFLOW_V2_API_TEST_DATABASE_URL is required');

function assert(value, message) {
  if (!value) throw new Error(message);
}

function roleUrl(role) {
  const value = new URL(databaseUrl);
  value.searchParams.set('options', `-c role=${role}`);
  return value.href;
}

function ref(artifact) {
  return {
    artifactId: artifact.artifactId,
    artifactHash: artifact.artifactHash,
    kind: artifact.kind,
  };
}

function scopeResult({ request, attempt, artifactId }) {
  return createScopeCompletion({
    request,
    inputHash: attempt.inputHash,
    artifactId,
  });
}

function eventBase(tenantId, runId) {
  return {
    eventId: randomUUID(),
    tenantId,
    runId,
    occurredAt: new Date().toISOString(),
  };
}

async function expectDatabaseCode(callback, expectedCode) {
  try {
    await callback();
  } catch (error) {
    assert(error.code === expectedCode, `expected SQLSTATE ${expectedCode}, got ${error.code}`);
    return;
  }
  throw new Error(`expected SQLSTATE ${expectedCode}`);
}

async function claimOutboxEventually(repositories, workerId, leaseSeconds) {
  const leaseToken = randomUUID();
  const deadline = Date.now() + 2_000;
  do {
    const claim = await repositories.claimOutbox(workerId, leaseToken, leaseSeconds);
    if (claim) return claim;
    await new Promise((resolve) => setTimeout(resolve, 10));
  } while (Date.now() < deadline);
  return null;
}

async function verifyConcurrentPersonalTenantJit(admin) {
  const userId = `user_jitpg${Date.now()}c`;
  const identityClients = [
    new Client({ connectionString: roleUrl('orqaly_identity') }),
    new Client({ connectionString: roleUrl('orqaly_identity') }),
  ];
  try {
    await Promise.all(identityClients.map((client) => client.connect()));
    const results = await Promise.all(
      identityClients.map((client) =>
        client.query('SELECT tenant_id, created FROM orqaly.ensure_personal_tenant($1, $2)', [
          'preview',
          userId,
        ])
      )
    );
    assert(
      results.every((result) => result.rowCount === 1),
      'JIT provisioning returned no row'
    );
    const rows = results.map((result) => result.rows[0]);
    const tenantId = rows[0].tenant_id;
    assert(
      rows.every((row) => row.tenant_id === tenantId),
      'concurrent JIT provisioning produced different tenants'
    );
    assert(
      rows.filter((row) => row.created).length === 1,
      'concurrent JIT provisioning did not elect exactly one creator'
    );

    const counts = await admin.query(
      `SELECT
         (SELECT count(*)::integer FROM orqaly.tenants
           WHERE id = $1) AS tenants,
         (SELECT count(*)::integer FROM orqaly.tenant_identity_bindings
           WHERE tenant_id = $1 AND provider = 'clerk' AND environment = 'preview'
             AND subject_type = 'user' AND subject_id = $2) AS bindings,
         (SELECT count(*)::integer FROM orqaly.tenant_agents
           WHERE tenant_id = $1 AND status = 'active'
             AND name = 'Personal Research and Product Agent'
             AND capabilities @> ARRAY[
               'research', 'evidence_synthesis', 'prd', 'product_strategy'
             ]::text[]
             AND cardinality(capabilities) = 4
             AND tool_ids = '{}'::uuid[]
             AND quality_score = 0.95000
             AND cost_per_run_cents = 25) AS default_agents`,
      [tenantId, userId]
    );
    const observed = counts.rows[0];
    assert(
      observed.tenants === 1 && observed.bindings === 1 && observed.default_agents === 1,
      `JIT provisioning did not commit one complete tenant: ${JSON.stringify(observed)}`
    );
    return observed;
  } finally {
    await Promise.allSettled(identityClients.map((client) => client.end()));
  }
}

const admin = new Client({ connectionString: databaseUrl });
await admin.connect();
if (process.env.WORKFLOW_V2_APPLY_BASELINE === '1') {
  for (const migration of [
    '001_clean_workflow_v2.sql',
    '002_assistant_goal.sql',
    '003_personal_tenant_jit.sql',
    '004_assistant_retry_lineage.sql',
    '005_assistant_turn_events.sql',
    '006_assistant_turn_provenance.sql',
    '007_assistant_grounded_sources_reason.sql',
    '008_agentic_execution_preview.sql',
  ]) {
    await admin.query(
      await readFile(
        new URL(`../database/workflow-v2/migrations/${migration}`, import.meta.url),
        'utf8'
      )
    );
  }
}
const tenantId = randomUUID();
const otherTenantId = randomUUID();
const userId = `user_apipg${Date.now()}a`;
const otherUserId = `user_apipg${Date.now()}b`;
const agentId = randomUUID();
await admin.query(
  `INSERT INTO orqaly.tenants (id, display_name) VALUES
     ($1, 'API PostgreSQL test'), ($2, 'Tenant isolation test')`,
  [tenantId, otherTenantId]
);
await admin.query(
  `INSERT INTO orqaly.tenant_identity_bindings (
     tenant_id, environment, subject_type, subject_id
   ) VALUES ($1, 'preview', 'user', $2), ($3, 'preview', 'user', $4)`,
  [tenantId, userId, otherTenantId, otherUserId]
);
await admin.query(
  `INSERT INTO orqaly.tenant_agents (
     tenant_id, id, name, capabilities, tool_ids, quality_score, cost_per_run_cents
   ) VALUES ($1, $2, 'PostgreSQL test agent', ARRAY['research'], '{}', 0.90000, 25)`,
  [tenantId, agentId]
);

const repositories = createPostgresRepositories({
  environment: 'preview',
  identityDatabaseUrl: roleUrl('orqaly_identity'),
  apiDatabaseUrl: roleUrl('orqaly_api'),
  workerDatabaseUrl: roleUrl('orqaly_worker'),
});
const appliedApiPlans = [];
const repositoryForService = {
  ...repositories,
  async applyTransition(tenantId, runId, plan) {
    appliedApiPlans.push(plan);
    return repositories.applyTransition(tenantId, runId, plan);
  },
};
const service = createWorkflowCommandService({ repository: repositoryForService });
const request = 'Create an Estonia cat-food launch PRD.';
const command = {
  commandId: randomUUID(),
  issuedAt: new Date().toISOString(),
  mode: 'simple',
  request,
};

try {
  const ready = await service.ready();
  assert(ready.database === 'ok', 'repository readiness did not query all configured pools');
  const jitProvisioning = await verifyConcurrentPersonalTenantJit(admin);

  const first = await service.start({ userId }, command);
  assert(first.receipt.idempotent === false, 'first command was not new');
  const initialPlan = appliedApiPlans[0];
  assert(initialPlan, 'start did not apply a transition plan');
  assert(
    initialPlan.eventCanonical === canonicalJson(initialPlan.event) &&
      initialPlan.eventHash === canonicalHash(initialPlan.event),
    'state machine did not bind exact canonical event bytes and hash'
  );
  const storedInitialEvent = await admin.query(
    `SELECT event_payload, event_hash FROM orqaly.workflow_events
     WHERE tenant_id = $1 AND run_id = $2 AND id = $3`,
    [tenantId, first.workflow.run.id, initialPlan.event.eventId]
  );
  assert(
    storedInitialEvent.rowCount === 1 &&
      storedInitialEvent.rows[0].event_hash ===
        canonicalHash(storedInitialEvent.rows[0].event_payload),
    'PostgreSQL did not persist the canonical application event hash'
  );
  const exactSqlReplay = await repositories.applyTransition(
    tenantId,
    first.workflow.run.id,
    initialPlan
  );
  assert(exactSqlReplay.idempotent === true, 'exact SQL event replay was not idempotent');

  const mismatchedEvent = { ...initialPlan.event, request: `${request} Mismatched.` };
  const mismatchedCanonical = canonicalJson(mismatchedEvent);
  await expectDatabaseCode(
    () =>
      repositories.applyTransition(tenantId, first.workflow.run.id, {
        ...initialPlan,
        eventCanonical: mismatchedCanonical,
        eventHash: sha256Hex(mismatchedCanonical),
      }),
    '22023'
  );
  await expectDatabaseCode(
    () =>
      repositories.applyTransition(tenantId, first.workflow.run.id, {
        ...initialPlan,
        eventHash: 'f'.repeat(64),
      }),
    '22023'
  );
  const conflictingEvent = {
    ...mismatchedEvent,
    requestHash: sha256Hex(mismatchedEvent.request),
  };
  const conflictingCanonical = canonicalJson(conflictingEvent);
  await expectDatabaseCode(
    () =>
      repositories.applyTransition(tenantId, first.workflow.run.id, {
        ...initialPlan,
        event: conflictingEvent,
        eventCanonical: conflictingCanonical,
        eventHash: sha256Hex(conflictingCanonical),
      }),
    '23505'
  );
  const exactReplay = await service.start({ userId }, command);
  assert(exactReplay.receipt.idempotent === true, 'lost start response was not adopted');
  await service
    .start({ userId }, { ...command, request: `${request} Changed.` })
    .then(() => {
      throw new Error('changed start command ID was accepted');
    })
    .catch((error) => assert(error.code === 'IDEMPOTENCY_CONFLICT', 'changed start was not 409'));

  const runId = first.workflow.run.id;
  const firstClaim = await claimOutboxEventually(repositories, 'pg-worker-a', 10);
  assert(firstClaim?.runId === runId, 'compile dispatch was not claimed');
  const staleSnapshot = await repositories.loadWorkerSnapshot(tenantId, runId);
  const staleAttempt = staleSnapshot.attempts.find(
    (attempt) => attempt.id === firstClaim.attemptId
  );
  assert(
    staleAttempt.leaseToken === firstClaim.leaseToken,
    'worker snapshot did not retain the claimed attempt lease credential'
  );
  const publicSnapshot = await repositories.loadSnapshot(tenantId, runId);
  const publicAttempt = publicSnapshot.attempts.find(
    (attempt) => attempt.id === firstClaim.attemptId
  );
  assert(
    !Object.prototype.hasOwnProperty.call(publicAttempt, 'leaseToken'),
    'API snapshot exposed the claimed attempt lease credential'
  );
  const staleOccurredAt = new Date(Date.parse(staleAttempt.leaseExpiresAt) - 1).toISOString();
  const staleStartedPlan = transition(staleSnapshot, {
    type: 'ActivityStarted',
    ...eventBase(tenantId, runId),
    occurredAt: staleOccurredAt,
    stageId: firstClaim.stageId,
    attemptId: firstClaim.attemptId,
    leaseToken: firstClaim.leaseToken,
    deploymentId: 'pg-worker-revision-old',
  });
  await admin.query(
    `WITH boundary AS (SELECT clock_timestamp() AS expired_at),
     changed_outbox AS (
       UPDATE orqaly.outbox_events SET lease_expires_at = boundary.expired_at
       FROM boundary WHERE tenant_id = $1 AND id = $2 RETURNING lease_expires_at
     )
     UPDATE orqaly.stage_attempts SET lease_expires_at = boundary.expired_at
     FROM boundary, changed_outbox WHERE tenant_id = $1 AND id = $3`,
    [tenantId, firstClaim.outboxId, firstClaim.attemptId]
  );
  await expectDatabaseCode(
    () => repositories.applyWorkerTransition(tenantId, runId, staleStartedPlan),
    '40001'
  );

  const reclaimed = await claimOutboxEventually(repositories, 'pg-worker-b', 120);
  assert(
    reclaimed.outboxId === firstClaim.outboxId,
    'crash window created/replaced outbox identity'
  );
  assert(reclaimed.attemptId === firstClaim.attemptId, 'crash window changed attempt identity');
  assert(
    reclaimed.operationId === firstClaim.operationId,
    'crash window changed operation identity'
  );
  assert(reclaimed.deliveryCount === 2, 'expired queued claim was not atomically reclaimed');
  let snapshot = await repositories.loadWorkerSnapshot(tenantId, runId);
  await repositories.applyWorkerTransition(
    tenantId,
    runId,
    transition(snapshot, {
      type: 'ActivityStarted',
      ...eventBase(tenantId, runId),
      stageId: reclaimed.stageId,
      attemptId: reclaimed.attemptId,
      leaseToken: reclaimed.leaseToken,
      deploymentId: 'pg-worker-revision-new',
    })
  );
  snapshot = await repositories.loadWorkerSnapshot(tenantId, runId);
  const compileAttempt = snapshot.attempts.find((attempt) => attempt.id === reclaimed.attemptId);
  const completedScope = scopeResult({
    request,
    attempt: compileAttempt,
    artifactId: randomUUID(),
  });
  await repositories.applyWorkerTransition(
    tenantId,
    runId,
    transition(snapshot, {
      type: 'ActivityCompleted',
      ...eventBase(tenantId, runId),
      stageId: reclaimed.stageId,
      attemptId: reclaimed.attemptId,
      leaseToken: reclaimed.leaseToken,
      result: completedScope,
      nextAttempts: [],
    })
  );

  const ambiguityCommand = {
    commandId: randomUUID(),
    issuedAt: new Date().toISOString(),
    mode: 'advanced',
    request,
  };
  const ambiguityRun = await service.start({ userId }, ambiguityCommand);
  const ambiguityRunId = ambiguityRun.workflow.run.id;
  const dispatchClaim = await claimOutboxEventually(repositories, 'pg-worker-c', 120);
  assert(dispatchClaim.runId === ambiguityRunId, 'ambiguous dispatch test claimed wrong run');
  snapshot = await repositories.loadWorkerSnapshot(tenantId, ambiguityRunId);
  await repositories.applyWorkerTransition(
    tenantId,
    ambiguityRunId,
    transition(snapshot, {
      type: 'ActivityStarted',
      ...eventBase(tenantId, ambiguityRunId),
      stageId: dispatchClaim.stageId,
      attemptId: dispatchClaim.attemptId,
      leaseToken: dispatchClaim.leaseToken,
      deploymentId: 'pg-worker-revision-c',
    })
  );
  snapshot = await repositories.loadWorkerSnapshot(tenantId, ambiguityRunId);
  const statusUrl = `https://axwise.test/v2/operations/${dispatchClaim.operationId}?tenantId=${tenantId}`;
  await repositories.applyWorkerTransition(
    tenantId,
    ambiguityRunId,
    transition(snapshot, {
      type: 'ActivityDispatchAmbiguous',
      ...eventBase(tenantId, ambiguityRunId),
      stageId: dispatchClaim.stageId,
      attemptId: dispatchClaim.attemptId,
      leaseToken: dispatchClaim.leaseToken,
      statusUrl,
      nextPollAt: new Date().toISOString(),
    })
  );
  const pollClaim = await claimOutboxEventually(repositories, 'pg-worker-d', 120);
  assert(pollClaim.commandType === 'poll_activity', 'ambiguous dispatch did not queue polling');
  assert(pollClaim.attemptId === dispatchClaim.attemptId, 'polling created a new attempt');
  assert(pollClaim.operationId === dispatchClaim.operationId, 'polling created a new operation');
  snapshot = await repositories.loadWorkerSnapshot(tenantId, ambiguityRunId);
  await repositories.applyWorkerTransition(
    tenantId,
    ambiguityRunId,
    transition(snapshot, {
      type: 'ActivityDeferred',
      ...eventBase(tenantId, ambiguityRunId),
      stageId: pollClaim.stageId,
      attemptId: pollClaim.attemptId,
      leaseToken: pollClaim.leaseToken,
      statusUrl,
      nextPollAt: new Date().toISOString(),
    })
  );

  const pollRows = await admin.query(
    `SELECT count(*)::integer AS count, min(status) AS status
     FROM orqaly.outbox_events WHERE tenant_id = $1 AND run_id = $2
       AND idempotency_key = $3`,
    [tenantId, ambiguityRunId, `poll:${pollClaim.operationId}`]
  );
  assert(
    pollRows.rows[0].count === 1 && pollRows.rows[0].status === 'pending',
    'repeated 202 did not recycle the one stable poll row'
  );

  const scopeReference = ref(completedScope.artifact);
  const approvalCommand = {
    type: 'approve_artifact',
    commandId: randomUUID(),
    issuedAt: new Date().toISOString(),
    approvalKind: 'scope',
    artifact: scopeReference,
    selectedEvidence: [],
    idempotencyKey: `approve-scope:${scopeReference.artifactId}`,
  };
  const approvals = await Promise.all([
    service.approve({ userId }, runId, approvalCommand),
    service.approve({ userId }, runId, approvalCommand),
  ]);
  assert(approvals.length === 2, 'concurrent approvals did not both adopt the exact decision');
  const storedApprovalEvent = await admin.query(
    `SELECT event_payload, event_hash FROM orqaly.workflow_events
     WHERE tenant_id = $1 AND run_id = $2 AND event_type = 'ApprovalGranted'`,
    [tenantId, runId]
  );
  assert(
    storedApprovalEvent.rowCount === 1 &&
      storedApprovalEvent.rows[0].event_hash ===
        canonicalHash(storedApprovalEvent.rows[0].event_payload),
    'PostgreSQL persisted a noncanonical scope approval event hash'
  );
  const counts = await admin.query(
    `SELECT
       (SELECT count(*)::integer FROM orqaly.workflow_runs WHERE tenant_id = $1 AND id = $2) AS runs,
       (SELECT count(*)::integer FROM orqaly.approvals WHERE tenant_id = $1 AND run_id = $2) AS approvals,
       (SELECT count(*)::integer FROM orqaly.stage_attempts AS attempt
          JOIN orqaly.workflow_stages AS stage
            ON stage.tenant_id = attempt.tenant_id AND stage.run_id = attempt.run_id
           AND stage.id = attempt.stage_id
         WHERE attempt.tenant_id = $1 AND attempt.run_id = $2
           AND stage.kind = 'execute_research') AS research_attempts,
       (SELECT count(*)::integer FROM orqaly.outbox_events
         WHERE tenant_id = $1 AND run_id = $2 AND command_type = 'dispatch_activity'
           AND attempt_id <> $3) AS downstream_dispatches`,
    [tenantId, runId, reclaimed.attemptId]
  );
  const observed = counts.rows[0];
  assert(
    observed.runs === 1 &&
      observed.approvals === 1 &&
      observed.research_attempts === 1 &&
      observed.downstream_dispatches === 1,
    `concurrent approval duplicated durable work: ${JSON.stringify(observed)}`
  );
  assert(
    (await repositories.loadSnapshot(otherTenantId, runId)) === null,
    'tenant B read tenant A workflow through the repository'
  );
  console.log('workflow-v2-api-postgres-tests-passed', {
    staleLeaseRejected: true,
    queuedClaimReclaimedInPlace: true,
    pollRowCount: pollRows.rows[0].count,
    concurrentApprovalRows: observed,
    concurrentJitRows: jitProvisioning,
    tenantBoundary: 'isolated',
  });
} finally {
  await repositories.close();
  await admin.end();
}
