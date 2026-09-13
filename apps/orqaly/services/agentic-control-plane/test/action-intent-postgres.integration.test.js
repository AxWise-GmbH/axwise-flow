import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { ApprovalDecisionRequestSchema } from '../src/domain/approval-contracts.js';
import { canonicalJsonSha256 } from '../src/domain/canonical.js';
import { MaterializeAgentRequestSchema } from '../src/domain/contracts.js';
import {
  PlanVersionSubmissionSchema,
  executionPlanV2HashPayload,
} from '../src/domain/execution-contracts.js';
import { withTenantTransaction } from '../src/db/pool.js';
import {
  decideApproval,
  materializeAgentTeam,
  submitExecutionPlanV2,
} from '../src/repositories/control-plane-repository.js';
import {
  HASH_A,
  HASH_B,
  HASH_C,
  HASH_D,
  materializedPlan,
  principal,
  proposalRequest,
} from './fixtures.js';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL;

function externalAction(effectId) {
  return {
    version: 'orqaly_external_action_spec_v1',
    effectId,
    providerOperation: {
      contractVersion: '1.0',
      operationKey: 'crm.record_update',
      operationVersion: '1.0',
      contentHash: HASH_A,
    },
    connection: {
      connectionReference: 'connection/crm-primary',
      providerKey: 'crm',
      credentialOwnerPrincipalId: 'user-1',
      requestedScopes: ['records.write'],
    },
    targets: [
      {
        targetType: 'crm_record',
        targetReference: 'record/42',
        targetHash: HASH_B,
      },
    ],
    externalPreconditions: [
      {
        preconditionType: 'etag',
        targetReference: 'record/42',
        expectedStateHash: HASH_B,
      },
    ],
    idempotency: {
      scope: 'crm_record_update',
      key: `effect/${effectId}`,
    },
    reconciliation: {
      strategy: 'provider_idempotency',
      lookupOperation: null,
    },
    compensation: { strategy: 'none', operation: null },
  };
}

function externalPlan(created, source, effectId) {
  const plan = materializedPlan();
  const input = { recordId: '42', status: 'active' };
  plan.sourceDecisionId = source.plan.sourceDecisionId;
  plan.sourcePlanId = source.plan.planId;
  plan.sourceContentHash = source.plan.contentHash;
  plan.owningAgentId = created.coordinatorAgentId;
  plan.teamId = created.teamId;
  plan.teamMemberIds = Object.values(created.agentIds).sort();
  plan.nodes[0].assignedAgentId = created.agentIds.worker;
  plan.nodes[0].reviewerAgentId = created.agentIds.reviewer;
  plan.nodes[0].nodeId = 'update-record';
  plan.nodes[0].title = 'Update CRM record';
  plan.nodes[0].objective = 'Set record 42 status to active.';
  plan.nodes[0].stepKind = 'connector_write';
  plan.nodes[0].descriptor = {
    contractVersion: '1.0',
    descriptorKey: 'record_update_v1',
    schemaVersion: '1.0',
    contentHash: HASH_A,
  };
  plan.nodes[0].executorBinding = {
    contractVersion: '1.0',
    bindingKey: 'connector_executor',
    bindingVersion: '1.0',
    contentHash: HASH_B,
  };
  plan.nodes[0].canonicalInput = input;
  plan.nodes[0].canonicalInputHash = canonicalJsonSha256(input);
  plan.nodes[0].effectProfile = {
    externality: 'write',
    mutation: 'update',
    flags: [],
  };
  plan.nodes[0].dataEgressProfile = {
    mode: 'policy_bound_external',
    destinationClasses: ['customer_crm'],
    providerClasses: ['crm'],
    regionClasses: ['eu'],
    permittedInputClassifications: ['internal'],
    permittedOutputClassifications: [],
    redactionRequired: false,
    dlpRequired: true,
    providerRetentionPolicyRequired: true,
    providerTrainingPolicyRequired: true,
  };
  plan.nodes[0].externalAction = externalAction(effectId);
  plan.nodes[0].limits.maximumToolCalls = 1;
  plan.contentHash = canonicalJsonSha256(executionPlanV2HashPayload(plan));
  return plan;
}

function submission(plan, idempotencyKey) {
  return PlanVersionSubmissionSchema.parse({
    version: 'orqaly_plan_version_submission_v1',
    idempotencyKey,
    plan,
  });
}

test(
  'real PostgreSQL persists immutable action intent before an exact approval subject',
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const suffix = crypto.randomUUID();
    const actionWorkspaceId = `workspace-action-${suffix}`;
    const principalA = principal({
      requestId: `action-request-${suffix}`,
      workspaceId: actionWorkspaceId,
    });
    const principalB = principal({
      requestId: `other-request-${suffix}`,
      workspaceId: actionWorkspaceId,
      userId: 'user-b',
    });
    try {
      const raw = proposalRequest();
      raw.sourceTask.taskId = `action-task-${suffix}`;
      raw.plan.planId = `action-plan-${suffix}`;
      raw.plan.sourceDecisionId = `action-decision-${suffix}`;
      raw.idempotencyKey = `action-materialize-${suffix}`;
      const worker = raw.team.find((member) => member.agentRef === 'worker');
      worker.allowedDescriptorFamilies = ['record_update_v1'];
      worker.allowedEffectProfiles = ['reversible_write'];
      raw.plan.steps[0].stepKind = 'connector_write';
      raw.plan.steps[0].descriptor.key = 'record_update_v1';
      raw.plan.steps[0].effectProfile = 'reversible_write';
      raw.plan.steps[0].dataEgressProfile = 'approved_provider';
      const request = MaterializeAgentRequestSchema.parse(raw);
      const created = await withTenantTransaction(pool, principalA, (client) =>
        materializeAgentTeam(client, principalA, request)
      );

      const effectId = crypto.randomUUID();
      const plan = externalPlan(created, raw, effectId);
      const wrongLineage = structuredClone(plan);
      wrongLineage.sourceContentHash = HASH_D;
      wrongLineage.contentHash = canonicalJsonSha256(executionPlanV2HashPayload(wrongLineage));
      await assert.rejects(
        () =>
          withTenantTransaction(pool, principalA, (client) =>
            submitExecutionPlanV2(
              client,
              principalA,
              created.runId,
              created.runVersion,
              submission(wrongLineage, `wrong-lineage-${suffix}`)
            )
          ),
        (error) => error.code === 'source_content_hash_mismatch'
      );

      const excessiveDescriptor = structuredClone(plan);
      excessiveDescriptor.nodes[0].descriptor.descriptorKey = 'record_delete_v1';
      excessiveDescriptor.contentHash = canonicalJsonSha256(
        executionPlanV2HashPayload(excessiveDescriptor)
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, principalA, (client) =>
            submitExecutionPlanV2(
              client,
              principalA,
              created.runId,
              created.runVersion,
              submission(excessiveDescriptor, `wrong-descriptor-${suffix}`)
            )
          ),
        (error) => error.code === 'proposal_descriptor_boundary_exceeded'
      );

      const excessiveEffect = structuredClone(plan);
      excessiveEffect.nodes[0].effectProfile.flags = ['financial'];
      excessiveEffect.contentHash = canonicalJsonSha256(
        executionPlanV2HashPayload(excessiveEffect)
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, principalA, (client) =>
            submitExecutionPlanV2(
              client,
              principalA,
              created.runId,
              created.runVersion,
              submission(excessiveEffect, `wrong-effect-${suffix}`)
            )
          ),
        (error) => error.code === 'proposal_effect_boundary_exceeded'
      );

      const planned = await withTenantTransaction(pool, principalA, (client) =>
        submitExecutionPlanV2(
          client,
          principalA,
          created.runId,
          created.runVersion,
          submission(plan, `action-plan-submission-${suffix}`)
        )
      );
      assert.equal(planned.state, 'awaiting_plan_approval');
      assert.ok(planned.actionIntentIds['update-record']);
      assert.ok(planned.approval.subjectId);

      const persisted = await withTenantTransaction(pool, principalA, (client) =>
        client.query(
          `select ai.id, ai.effect_id, ai.intent_hash, ai.provider_operation_key,
                  ai.connection_reference, ai.credential_owner_principal_id,
                  ai.external_preconditions, ai.delegation_version,
                  ai.delegation_policy_hash, ai.intent_snapshot,
                  d.allowed_targets as delegation_allowed_targets,
                  d.policy_snapshot as delegation_policy_snapshot,
                  d.policy_hash as persisted_delegation_policy_hash,
                  ar.status, ar.approval_subject_id, ar.presentation,
                  subject.hash_domain, subject.nonce, subject.issued_at,
                  subject.expires_at, subject.subject_payload,
                  link.action_intent_id
             from agentic.action_intents ai
             join agentic.approval_subject_action_intents link
               on link.org_id = ai.org_id and link.workspace_id = ai.workspace_id
              and link.user_id = ai.user_id and link.action_intent_id = ai.id
             join agentic.approval_subjects subject
               on subject.org_id = link.org_id
              and subject.workspace_id = link.workspace_id
              and subject.user_id = link.user_id
              and subject.id = link.approval_subject_id
             join agentic.agent_delegations d
               on d.org_id = ai.org_id and d.workspace_id = ai.workspace_id
              and d.user_id = ai.user_id and d.id = ai.delegation_id
             join agentic.approval_requests ar
               on ar.org_id = subject.org_id and ar.workspace_id = subject.workspace_id
              and ar.user_id = subject.user_id
              and ar.approval_subject_id = subject.id
            where ai.run_id = $1 and ai.step_id = $2`,
          [created.runId, planned.stepIds['update-record']]
        )
      );
      assert.equal(persisted.rowCount, 1);
      const row = persisted.rows[0];
      assert.equal(row.id, planned.actionIntentIds['update-record']);
      assert.equal(row.effect_id, effectId);
      assert.equal(row.action_intent_id, row.id);
      assert.equal(row.status, 'pending');
      assert.equal(row.approval_subject_id, planned.approval.subjectId);
      assert.equal(row.hash_domain, 'orqaly.approval.v1');
      assert.equal(row.provider_operation_key, 'crm.record_update');
      assert.equal(row.connection_reference, 'connection/crm-primary');
      assert.equal(row.credential_owner_principal_id, principalA.userId);
      assert.equal(row.external_preconditions[0].preconditionType, 'etag');
      assert.equal(row.delegation_version, '1');
      assert.deepEqual(row.delegation_allowed_targets, plan.nodes[0].externalAction.targets);
      assert.deepEqual(
        row.delegation_policy_snapshot.authorityCeiling.allowedTargets,
        plan.nodes[0].externalAction.targets
      );
      assert.deepEqual(
        row.delegation_policy_snapshot.nodes[0].externalAction,
        plan.nodes[0].externalAction
      );
      assert.equal(
        canonicalJsonSha256(row.delegation_policy_snapshot),
        row.persisted_delegation_policy_hash
      );
      assert.equal(row.delegation_policy_hash, row.persisted_delegation_policy_hash);
      assert.equal(row.presentation.version, 'orqaly_approval_presentation_v1');
      assert.equal(row.presentation.steps[0].action.effectId, effectId);
      assert.equal(row.presentation.steps[0].operation.key, 'crm.record_update');
      assert.deepEqual(row.presentation.steps[0].canonicalParameters, {
        recordId: '42',
        status: 'active',
      });
      assert.deepEqual(row.presentation.steps[0].action.targets, [
        {
          targetType: 'crm_record',
          targetReference: 'record/42',
          targetHash: HASH_B,
        },
      ]);
      assert.equal(
        row.presentation.steps[0].action.providerOperation.operationKey,
        'crm.record_update'
      );
      assert.equal(
        row.presentation.steps[0].action.connection.connectionReference,
        'connection/crm-primary'
      );
      assert.deepEqual(row.presentation.steps[0].action.connection.requestedScopes, [
        'records.write',
      ]);
      assert.equal(
        row.presentation.steps[0].action.externalPreconditions[0].preconditionType,
        'etag'
      );
      assert.equal(row.presentation.steps[0].action.idempotency.key, `effect/${effectId}`);
      assert.equal(
        'credentialOwnerPrincipalId' in row.presentation.steps[0].action.connection,
        false
      );
      assert.equal('principalId' in row.presentation.steps[0], false);
      assert.equal('nonce' in row.presentation, false);
      assert.equal(row.subject_payload.steps[0].actionIntent.contentHash, row.intent_hash);
      assert.equal(row.intent_snapshot.connection.requestedScopes[0], 'records.write');
      assert.ok(row.nonce);
      assert.ok(new Date(row.expires_at) > new Date(row.issued_at));

      await assert.rejects(
        () =>
          withTenantTransaction(pool, principalA, (client) =>
            client.query(
              `update agentic.agent_delegations
                  set allowed_targets = '[]'::jsonb
                where id = $1`,
              [row.intent_snapshot.delegation.delegationId]
            )
          ),
        (error) => error.code === '55000'
      );

      const hidden = await withTenantTransaction(pool, principalB, (client) =>
        client.query(
          'select count(*)::integer as count from agentic.action_intents where run_id = $1',
          [created.runId]
        )
      );
      assert.equal(hidden.rows[0].count, 0);

      await assert.rejects(
        () =>
          withTenantTransaction(pool, principalA, (client) =>
            client.query(
              `insert into agentic.approval_requests (
                 org_id, workspace_id, user_id, run_id, subject_kind,
                 subject_hash, subject_snapshot, presentation,
                 required_approver_id, expires_at
               ) values ($1, $2, $3, $4, 'plan', $5, '{}'::jsonb,
                         '{}'::jsonb, $6, now() + interval '5 minutes')`,
              [
                principalA.organizationId,
                principalA.workspaceId,
                principalA.userId,
                created.runId,
                'f'.repeat(64),
                principalA.userId,
              ]
            )
          ),
        (error) => error.code === '23514'
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, principalA, (client) =>
            client.query(
              'update agentic.action_intents set provider_operation_key = $1 where id = $2',
              ['crm.record_delete', row.id]
            )
          ),
        (error) => error.code === '55000'
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, principalA, (client) =>
            client.query(
              `update agentic.approval_subjects
                  set subject_payload = '{}'::jsonb where id = $1`,
              [planned.approval.subjectId]
            )
          ),
        (error) => error.code === '55000'
      );
      await assert.rejects(
        () =>
          withTenantTransaction(pool, principalA, (client) =>
            client.query(
              `update agentic.approval_requests
                  set subject_hash = $1 where id = $2`,
              ['e'.repeat(64), planned.approval.id]
            )
          ),
        (error) => error.code === '55000'
      );

      const decision = ApprovalDecisionRequestSchema.parse({
        version: 'orqaly_approval_decision_request_v1',
        idempotencyKey: `approve-action-${suffix}`,
        decision: 'approve',
        reason: 'The exact target, precondition and provider operation are approved.',
      });
      const approved = await withTenantTransaction(pool, principalA, (client) =>
        decideApproval(client, principalA, planned.approval.id, planned.approval.version, decision)
      );
      assert.equal(approved.status, 'approved');
      assert.equal(approved.runState, 'queued');
    } finally {
      await pool.end();
    }
  }
);
