import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { MaterializeAgentRequestSchema } from '../src/domain/contracts.js';
import {
  PlanVersionSubmissionSchema,
  executionPlanV2HashPayload,
} from '../src/domain/execution-contracts.js';
import { canonicalJsonSha256 } from '../src/domain/canonical.js';
import { withTenantTransaction } from '../src/db/pool.js';
import {
  materializeAgentTeam,
  submitExecutionPlanV2,
} from '../src/repositories/control-plane-repository.js';
import { materializedPlan, principal, proposalRequest } from './fixtures.js';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL;

async function createPlannedRun(
  pool,
  requestPrincipal,
  suffix,
  label,
  { includeSecondStep = false } = {}
) {
  const raw = proposalRequest();
  raw.sourceTask.taskId = `chain-task-${label}-${suffix}`;
  raw.plan.planId = `chain-plan-${label}-${suffix}`;
  raw.plan.sourceDecisionId = `chain-decision-${label}-${suffix}`;
  raw.idempotencyKey = `chain-materialize-${label}-${suffix}`;
  const request = MaterializeAgentRequestSchema.parse(raw);
  const created = await withTenantTransaction(pool, requestPrincipal, (client) =>
    materializeAgentTeam(client, requestPrincipal, request)
  );

  const plan = materializedPlan();
  plan.sourceDecisionId = raw.plan.sourceDecisionId;
  plan.sourcePlanId = raw.plan.planId;
  plan.owningAgentId = created.coordinatorAgentId;
  plan.teamId = created.teamId;
  plan.teamMemberIds = Object.values(created.agentIds).sort();
  plan.nodes[0].assignedAgentId = created.agentIds.worker;
  plan.nodes[0].reviewerAgentId = created.agentIds.reviewer;
  if (includeSecondStep) {
    const secondNode = structuredClone(plan.nodes[0]);
    secondNode.nodeId = 'secondary';
    secondNode.title = 'Second bounded operation';
    secondNode.objective = 'Exercise an independent step in the same run.';
    plan.nodes.push(secondNode);
  }
  plan.contentHash = canonicalJsonSha256(executionPlanV2HashPayload(plan));
  const submission = PlanVersionSubmissionSchema.parse({
    version: 'orqaly_plan_version_submission_v1',
    idempotencyKey: `chain-plan-submission-${label}-${suffix}`,
    plan,
  });
  const planned = await withTenantTransaction(pool, requestPrincipal, (client) =>
    submitExecutionPlanV2(client, requestPrincipal, created.runId, created.runVersion, submission)
  );

  return {
    runId: created.runId,
    stepId: planned.stepIds.research,
    secondStepId: planned.stepIds.secondary ?? null,
  };
}

async function insertAttempt(client, requestPrincipal, runId, stepId) {
  const attemptId = crypto.randomUUID();
  await client.query(
    `insert into agentic.step_attempts (
       id, org_id, workspace_id, user_id, run_id, step_id,
       attempt_number, executor_kind, executor_binding,
       executor_binding_hash, deadline_at
     ) values ($1, $2, $3, $4, $5, $6, 1, 'agent',
               'bounded_agent_executor', $7, now() + interval '5 minutes')`,
    [
      attemptId,
      requestPrincipal.organizationId,
      requestPrincipal.workspaceId,
      requestPrincipal.userId,
      runId,
      stepId,
      'a'.repeat(64),
    ]
  );
  return attemptId;
}

async function insertReceipt(client, requestPrincipal, runId, stepId, attemptId) {
  await client.query(
    `insert into agentic.step_receipts (
       id, org_id, workspace_id, user_id, run_id, step_id, attempt_id,
       receipt_kind, receipt_payload, receipt_hash, actor_type
     ) values ($1, $2, $3, $4, $5, $6, $7,
               'execution_result', '{}'::jsonb, $8, 'executor')`,
    [
      crypto.randomUUID(),
      requestPrincipal.organizationId,
      requestPrincipal.workspaceId,
      requestPrincipal.userId,
      runId,
      stepId,
      attemptId,
      'b'.repeat(64),
    ]
  );
}

async function insertEvent(client, requestPrincipal, runId, stepId, attemptId, label) {
  await client.query(
    `insert into agentic.run_events (
       id, org_id, workspace_id, user_id, run_id, step_id, attempt_id,
       event_type, actor_type, correlation_id
     ) values ($1, $2, $3, $4, $5, $6, $7,
               'chain_test', 'system', $8)`,
    [
      crypto.randomUUID(),
      requestPrincipal.organizationId,
      requestPrincipal.workspaceId,
      requestPrincipal.userId,
      runId,
      stepId,
      attemptId,
      label,
    ]
  );
}

function violates(constraint) {
  return (error) => error.code === '23503' && error.constraint === constraint;
}

test(
  'real PostgreSQL rejects cross-run execution chains and preserves nullable events',
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const suffix = crypto.randomUUID();
    const requestPrincipal = principal({
      requestId: `chain-request-${suffix}`,
      workspaceId: `chain-workspace-${suffix}`,
    });
    try {
      const runA = await createPlannedRun(pool, requestPrincipal, suffix, 'a', {
        includeSecondStep: true,
      });
      const runB = await createPlannedRun(pool, requestPrincipal, suffix, 'b');

      await assert.rejects(
        () =>
          withTenantTransaction(pool, requestPrincipal, (client) =>
            insertAttempt(client, requestPrincipal, runA.runId, runB.stepId)
          ),
        violates('fk_agentic_attempt_step_run_chain')
      );

      const attemptA = await withTenantTransaction(pool, requestPrincipal, (client) =>
        insertAttempt(client, requestPrincipal, runA.runId, runA.stepId)
      );
      const attemptASecondStep = await withTenantTransaction(pool, requestPrincipal, (client) =>
        insertAttempt(client, requestPrincipal, runA.runId, runA.secondStepId)
      );
      const attemptB = await withTenantTransaction(pool, requestPrincipal, (client) =>
        insertAttempt(client, requestPrincipal, runB.runId, runB.stepId)
      );

      await assert.rejects(
        () =>
          withTenantTransaction(pool, requestPrincipal, (client) =>
            insertReceipt(client, requestPrincipal, runA.runId, runA.stepId, attemptB)
          ),
        violates('fk_agentic_receipt_attempt_run_chain')
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, requestPrincipal, (client) =>
            insertReceipt(client, requestPrincipal, runA.runId, runA.stepId, attemptASecondStep)
          ),
        violates('fk_agentic_receipt_attempt_run_chain')
      );
      await withTenantTransaction(pool, requestPrincipal, (client) =>
        insertReceipt(client, requestPrincipal, runA.runId, runA.stepId, attemptA)
      );

      await assert.rejects(
        () =>
          withTenantTransaction(pool, requestPrincipal, (client) =>
            insertEvent(
              client,
              requestPrincipal,
              runA.runId,
              runB.stepId,
              null,
              `cross-run-step-${suffix}`
            )
          ),
        violates('fk_agentic_event_step_run_chain')
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, requestPrincipal, (client) =>
            insertEvent(
              client,
              requestPrincipal,
              runA.runId,
              null,
              attemptB,
              `cross-run-attempt-${suffix}`
            )
          ),
        violates('fk_agentic_event_attempt_run_chain')
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, requestPrincipal, (client) =>
            insertEvent(
              client,
              requestPrincipal,
              runA.runId,
              runA.stepId,
              attemptASecondStep,
              `cross-step-attempt-${suffix}`
            )
          ),
        violates('fk_agentic_event_attempt_step_run_chain')
      );

      await withTenantTransaction(pool, requestPrincipal, async (client) => {
        await insertEvent(client, requestPrincipal, runA.runId, null, null, `run-only-${suffix}`);
        await insertEvent(
          client,
          requestPrincipal,
          runA.runId,
          runA.stepId,
          null,
          `step-only-${suffix}`
        );
        await insertEvent(
          client,
          requestPrincipal,
          runA.runId,
          null,
          attemptA,
          `attempt-only-${suffix}`
        );
        await insertEvent(
          client,
          requestPrincipal,
          runA.runId,
          runA.stepId,
          attemptA,
          `full-chain-${suffix}`
        );
      });
    } finally {
      await pool.end();
    }
  }
);
