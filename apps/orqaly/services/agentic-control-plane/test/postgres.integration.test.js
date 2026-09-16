import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { MaterializeAgentRequestSchema } from '../src/domain/contracts.js';
import { ApprovalDecisionRequestSchema } from '../src/domain/approval-contracts.js';
import {
  PlanVersionSubmissionSchema,
  executionPlanV2HashPayload,
} from '../src/domain/execution-contracts.js';
import { canonicalJsonSha256 } from '../src/domain/canonical.js';
import { withTenantTransaction } from '../src/db/pool.js';
import {
  getRun,
  decideApproval,
  listAgents,
  listApprovals,
  materializeAgentTeam,
  submitExecutionPlanV2,
} from '../src/repositories/control-plane-repository.js';
import { materializedPlan, principal, proposalRequest } from './fixtures.js';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL;

test(
  'real PostgreSQL enforces user scope, idempotency and proposal-to-v2 materialization',
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const suffix = crypto.randomUUID();
    const principalA = principal({ requestId: 'request-a' });
    const principalB = principal({
      requestId: 'request-b',
      workspaceId: 'workspace-b',
      userId: 'user-b',
    });
    const sameWorkspaceOtherUser = principal({
      requestId: 'request-c',
      userId: 'user-c',
    });
    const sameUserOtherWorkspace = principal({
      requestId: 'request-d',
      workspaceId: 'workspace-d',
    });
    try {
      const noContext = await pool.query('select count(*)::integer as count from agentic.agents');
      assert.equal(noContext.rows[0].count, 0);
      await assert.rejects(
        () =>
          pool.query(
            `insert into agentic.materialization_requests (
               org_id, workspace_id, user_id, idempotency_key, request_hash
             ) values ('org-1', 'workspace-1', 'user-1', 'missing-context', $1)`,
            ['0'.repeat(64)]
          ),
        (error) => error.code === '42501'
      );
      const initialAgentCount = (
        await withTenantTransaction(pool, principalA, (client) => listAgents(client))
      ).length;
      const initialPendingApprovalCount = (
        await withTenantTransaction(pool, principalA, (client) => listApprovals(client))
      ).length;

      const rawRequest = proposalRequest();
      rawRequest.sourceTask.taskId = `task-${suffix}`;
      rawRequest.plan.planId = `axwise-plan-${suffix}`;
      rawRequest.plan.sourceDecisionId = `decision-${suffix}`;
      rawRequest.idempotencyKey = `materialize-${suffix}`;
      const request = MaterializeAgentRequestSchema.parse(rawRequest);
      const created = await withTenantTransaction(pool, principalA, (client) =>
        materializeAgentTeam(client, principalA, request)
      );
      assert.equal(created.state, 'planning');
      assert.equal(created.planVersionId, null);
      assert.equal(Object.keys(created.agentIds).length, 3);
      const proposalDelegations = await withTenantTransaction(pool, principalA, (client) =>
        client.query(
          `select count(*)::integer as count
               from agentic.agent_delegations
              where source_task_id = $1`,
          [rawRequest.sourceTask.taskId]
        )
      );
      assert.equal(
        proposalDelegations.rows[0].count,
        0,
        'proposal capabilities must not become executable authority'
      );

      const replayed = await withTenantTransaction(pool, principalA, (client) =>
        materializeAgentTeam(client, principalA, request)
      );
      assert.equal(replayed.replayed, true);
      assert.equal(replayed.runId, created.runId);
      const conflictingRequest = MaterializeAgentRequestSchema.parse({
        ...rawRequest,
        sourceTask: {
          ...rawRequest.sourceTask,
          description: 'A different request using the same key',
        },
      });
      await assert.rejects(
        () =>
          withTenantTransaction(pool, principalA, (client) =>
            materializeAgentTeam(client, principalA, conflictingRequest)
          ),
        (error) => error.code === 'idempotency_key_reused_with_different_request'
      );

      assert.equal(
        (await withTenantTransaction(pool, principalA, (client) => listAgents(client))).length,
        initialAgentCount + 3
      );
      assert.equal(
        (await withTenantTransaction(pool, principalB, (client) => listAgents(client))).length,
        0
      );
      assert.equal(
        (await withTenantTransaction(pool, sameWorkspaceOtherUser, (client) => listAgents(client)))
          .length,
        0
      );
      assert.equal(
        (await withTenantTransaction(pool, sameUserOtherWorkspace, (client) => listAgents(client)))
          .length,
        0
      );
      await assert.rejects(
        () => withTenantTransaction(pool, principalB, (client) => getRun(client, created.runId)),
        (error) => error.status === 404 && error.code === 'run_not_found'
      );

      const plan = materializedPlan();
      plan.sourceDecisionId = rawRequest.plan.sourceDecisionId;
      plan.sourcePlanId = rawRequest.plan.planId;
      plan.owningAgentId = created.coordinatorAgentId;
      plan.teamId = created.teamId;
      plan.teamMemberIds = Object.values(created.agentIds).sort();
      plan.nodes[0].assignedAgentId = created.agentIds.worker;
      plan.nodes[0].reviewerAgentId = created.agentIds.reviewer;
      plan.contentHash = canonicalJsonSha256(executionPlanV2HashPayload(plan));
      const submission = PlanVersionSubmissionSchema.parse({
        version: 'orqaly_plan_version_submission_v1',
        idempotencyKey: `plan-submission-${suffix}`,
        plan,
      });
      const planned = await withTenantTransaction(pool, principalA, (client) =>
        submitExecutionPlanV2(client, principalA, created.runId, created.runVersion, submission)
      );
      assert.equal(planned.state, 'awaiting_plan_approval');
      assert.equal(Object.keys(planned.stepIds).length, 1);
      assert.ok(planned.approval.id);
      const exactAuthority = await withTenantTransaction(pool, principalA, (client) =>
        client.query(
          `select d.id, d.agent_id, d.run_id, d.plan_version_id,
                  d.allowed_effect_profiles, d.allowed_targets,
                  d.policy_snapshot, d.policy_hash,
                  d.granted_at, s.delegation_id,
                  a.subject_snapshot as approval_snapshot
             from agentic.agent_delegations d
             join agentic.execution_steps s
               on s.org_id = d.org_id and s.workspace_id = d.workspace_id
              and s.user_id = d.user_id and s.delegation_id = d.id
             join agentic.approval_requests a
               on a.org_id = d.org_id and a.workspace_id = d.workspace_id
              and a.user_id = d.user_id and a.id = $3
            where d.run_id = $1 and d.plan_version_id = $2`,
          [created.runId, planned.planVersionId, planned.approval.id]
        )
      );
      assert.equal(exactAuthority.rowCount, 1);
      assert.equal(exactAuthority.rows[0].agent_id, created.agentIds.worker);
      assert.equal(exactAuthority.rows[0].run_id, created.runId);
      assert.equal(exactAuthority.rows[0].plan_version_id, planned.planVersionId);
      assert.equal(exactAuthority.rows[0].delegation_id, exactAuthority.rows[0].id);
      assert.deepEqual(exactAuthority.rows[0].allowed_effect_profiles, [
        { externality: 'none', flags: [], mutation: 'none' },
      ]);
      assert.deepEqual(exactAuthority.rows[0].allowed_targets, []);
      assert.deepEqual(exactAuthority.rows[0].policy_snapshot.authorityCeiling.allowedTargets, []);
      assert.equal(exactAuthority.rows[0].policy_snapshot.nodes[0].externalAction, null);
      assert.equal(
        canonicalJsonSha256(exactAuthority.rows[0].policy_snapshot),
        exactAuthority.rows[0].policy_hash
      );
      assert.equal(
        exactAuthority.rows[0].policy_snapshot.nodes[0].canonicalInputHash,
        plan.nodes[0].canonicalInputHash
      );
      assert.equal(
        exactAuthority.rows[0].approval_snapshot.steps[0].delegation.policyHash,
        exactAuthority.rows[0].policy_hash,
        'the human approval must bind the exact delegation policy'
      );
      assert.equal(
        exactAuthority.rows[0].approval_snapshot.steps[0].personaVersion.contentHash,
        plan.nodes[0].personaVersion.contentHash,
        'the human approval must bind the exact persona version'
      );
      assert.equal(exactAuthority.rows[0].granted_at, null);
      const pendingApprovals = await withTenantTransaction(pool, principalA, (client) =>
        listApprovals(client)
      );
      assert.equal(pendingApprovals.length, initialPendingApprovalCount + 1);
      const pendingApproval = pendingApprovals.find((item) => item.id === planned.approval.id);
      assert.deepEqual(pendingApproval.controls, {
        approval: { approve: true, reject: true, reason: null },
      });
      assert.equal(
        (await withTenantTransaction(pool, principalB, (client) => listApprovals(client))).length,
        0
      );

      const replayedPlan = await withTenantTransaction(pool, principalA, (client) =>
        submitExecutionPlanV2(client, principalA, created.runId, created.runVersion, submission)
      );
      assert.equal(replayedPlan.replayed, true);
      assert.equal(replayedPlan.planVersionId, planned.planVersionId);

      const approvalDecision = ApprovalDecisionRequestSchema.parse({
        version: 'orqaly_approval_decision_request_v1',
        idempotencyKey: `approve-plan-${suffix}`,
        decision: 'approve',
        reason: 'The bounded plan and zero external effects are correct.',
      });
      await assert.rejects(
        () =>
          withTenantTransaction(pool, principalB, (client) =>
            decideApproval(
              client,
              principalB,
              planned.approval.id,
              planned.approval.version,
              approvalDecision
            )
          ),
        (error) => error.code === 'approval_not_found'
      );
      const approved = await withTenantTransaction(pool, principalA, (client) =>
        decideApproval(
          client,
          principalA,
          planned.approval.id,
          planned.approval.version,
          approvalDecision
        )
      );
      assert.equal(approved.status, 'approved');
      assert.equal(approved.runState, 'queued');
      const decidedApproval = (
        await withTenantTransaction(pool, principalA, (client) =>
          listApprovals(client, { status: null })
        )
      ).find((item) => item.id === planned.approval.id);
      assert.deepEqual(decidedApproval.controls, {
        approval: { approve: false, reject: false, reason: 'already_decided' },
      });
      const grantedAuthority = await withTenantTransaction(pool, principalA, (client) =>
        client.query(
          `select granted_at
             from agentic.agent_delegations
            where run_id = $1 and plan_version_id = $2`,
          [created.runId, planned.planVersionId]
        )
      );
      assert.ok(grantedAuthority.rows[0].granted_at);
      const approvalReplay = await withTenantTransaction(pool, principalA, (client) =>
        decideApproval(
          client,
          principalA,
          planned.approval.id,
          planned.approval.version,
          approvalDecision
        )
      );
      assert.equal(approvalReplay.replayed, true);

      const run = await withTenantTransaction(pool, principalA, (client) =>
        getRun(client, created.runId)
      );
      assert.equal(run.state, 'queued');
      assert.equal(run.steps.length, 1);
      assert.equal(run.steps[0].executor_binding_key, 'bounded_agent_executor');
      assert.equal(run.steps[0].persona_id, 'worker-persona');
      assert.equal(run.steps[0].persona_content_hash, plan.nodes[0].personaVersion.contentHash);
      await assert.rejects(
        () =>
          withTenantTransaction(pool, principalA, (client) =>
            client.query(
              `update agentic.execution_steps
                  set persona_content_hash = $1
                where id = $2`,
              ['f'.repeat(64), run.steps[0].id]
            )
          ),
        (error) => error.code === '55000'
      );

      const contextWasReset = await pool.query(
        'select count(*)::integer as count from agentic.agents'
      );
      assert.equal(contextWasReset.rows[0].count, 0);
    } finally {
      await pool.end();
    }
  }
);
