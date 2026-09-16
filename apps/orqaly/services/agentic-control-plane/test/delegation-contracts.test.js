import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJsonSha256 } from '../src/domain/canonical.js';
import {
  DelegationAuthorityMismatchError,
  assertActionIntentWithinDelegation,
  delegationPolicySnapshotV1Hash,
} from '../src/domain/delegation-contracts.js';
import { delegationPolicies } from '../src/repositories/control-plane-repository.js';
import { AGENT_WORKER_ID, HASH_A, HASH_B, HASH_C, materializedPlan } from './fixtures.js';

const RUN = {
  id: '55555555-5555-4555-8555-555555555555',
  plan_id: '66666666-6666-4666-8666-666666666666',
  planVersionId: '77777777-7777-4777-8777-777777777777',
  source_task_id: 'task/delegation-ceiling',
};
const DELEGATION_ID = '88888888-8888-4888-8888-888888888888';
const PERSONA_VERSION_ID = '99999999-9999-4999-8999-999999999999';

function target(reference, hash) {
  return {
    targetType: 'crm_record',
    targetReference: reference,
    targetHash: hash,
  };
}

function externalAction(effectId, targets, idempotencyKey) {
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
    targets,
    externalPreconditions: targets.map((item) => ({
      preconditionType: 'etag',
      targetReference: item.targetReference,
      expectedStateHash: item.targetHash,
    })),
    idempotency: {
      scope: 'crm_record_update',
      key: idempotencyKey,
    },
    reconciliation: {
      strategy: 'provider_idempotency',
      lookupOperation: null,
    },
    compensation: { strategy: 'none', operation: null },
  };
}

function externalPlan() {
  const plan = materializedPlan();
  const record42 = target('record/42', HASH_B);
  const first = plan.nodes[0];
  first.nodeId = 'update-record';
  first.title = 'Update record 42';
  first.objective = 'Update record 42 exactly once.';
  first.stepKind = 'connector_write';
  first.descriptor = {
    contractVersion: '1.0',
    descriptorKey: 'crm_record_update_v1',
    schemaVersion: '1.0',
    contentHash: HASH_A,
  };
  first.executorBinding = {
    contractVersion: '1.0',
    bindingKey: 'connector_executor',
    bindingVersion: '1.0',
    contentHash: HASH_B,
  };
  first.effectProfile = { externality: 'write', mutation: 'update', flags: [] };
  first.dataEgressProfile = {
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
  first.externalAction = externalAction(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    [record42],
    'effect/update-record-42'
  );

  const second = structuredClone(first);
  second.nodeId = 'archive-records';
  second.title = 'Archive records 41 and 42';
  second.objective = 'Archive the exact approved records.';
  second.canonicalInput = { recordIds: ['41', '42'] };
  second.canonicalInputHash = canonicalJsonSha256(second.canonicalInput);
  second.externalAction = externalAction(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    [target('record/41', HASH_A), record42],
    'effect/archive-records'
  );
  plan.nodes = [second, first];
  return plan;
}

function actionIntent(node, policy) {
  return {
    stepKind: node.stepKind,
    agentId: node.assignedAgentId,
    personaVersion: {
      ...node.personaVersion,
      personaVersionId: PERSONA_VERSION_ID,
    },
    delegation: {
      delegationId: DELEGATION_ID,
      version: 1,
      policyHash: policy.policyHash,
    },
    descriptor: node.descriptor,
    executorBinding: node.executorBinding,
    canonicalInputHash: node.canonicalInputHash,
    effectProfile: node.effectProfile,
    dataEgressProfile: node.dataEgressProfile,
    effectId: node.externalAction.effectId,
    providerOperation: node.externalAction.providerOperation,
    connection: node.externalAction.connection,
    targets: node.externalAction.targets,
    externalPreconditions: node.externalAction.externalPreconditions,
    idempotency: node.externalAction.idempotency,
    policy: {
      policyId: 'agent_delegation_policy',
      policyVersion: '1',
      contentHash: policy.policyHash,
    },
    reconciliation: node.externalAction.reconciliation,
    compensation: node.externalAction.compensation,
  };
}

function storedDelegation(policy) {
  return {
    id: DELEGATION_ID,
    version: 1,
    agentId: policy.agentId,
    policyHash: policy.policyHash,
    allowedTargets: policy.allowedTargets,
    policySnapshot: policy.policySnapshot,
  };
}

function assertOutsideDelegation(callback, reason) {
  assert.throws(
    callback,
    (error) =>
      error instanceof DelegationAuthorityMismatchError &&
      error.code === 'action_intent_outside_delegation' &&
      error.reason === reason
  );
}

test('internal delegation is explicit deny-all for external targets and actions', () => {
  const [policy] = delegationPolicies(materializedPlan(), RUN);

  assert.deepEqual(policy.allowedTargets, []);
  assert.deepEqual(policy.policySnapshot.authorityCeiling.allowedTargets, []);
  assert.equal(policy.policySnapshot.nodes[0].externalAction, null);
  assert.equal(policy.policyHash, delegationPolicySnapshotV1Hash(policy.policySnapshot));
});

test('external delegation canonically deduplicates exact target triples and seals action identity', () => {
  const plan = externalPlan();
  const [policy] = delegationPolicies(plan, RUN);

  assert.equal(policy.agentId, AGENT_WORKER_ID);
  assert.deepEqual(policy.allowedTargets, [
    target('record/41', HASH_A),
    target('record/42', HASH_B),
  ]);
  assert.deepEqual(policy.policySnapshot.authorityCeiling.allowedTargets, policy.allowedTargets);
  assert.deepEqual(
    policy.policySnapshot.nodes.map((node) => node.nodeId),
    ['archive-records', 'update-record']
  );
  const updateNode = policy.policySnapshot.nodes.find((node) => node.nodeId === 'update-record');
  assert.deepEqual(updateNode.externalAction, plan.nodes[1].externalAction);
  assert.equal(updateNode.externalAction.providerOperation.operationKey, 'crm.record_update');
  assert.equal(updateNode.externalAction.connection.connectionReference, 'connection/crm-primary');
  assert.equal(updateNode.externalAction.idempotency.key, 'effect/update-record-42');
  assert.equal(updateNode.externalAction.externalPreconditions[0].preconditionType, 'etag');
  assert.equal(policy.policyHash, delegationPolicySnapshotV1Hash(policy.policySnapshot));
});

test('ActionIntent must equal its plan-node authority and remain inside the Agent target ceiling', () => {
  const plan = externalPlan();
  const [policy] = delegationPolicies(plan, RUN);
  const node = plan.nodes.find((item) => item.nodeId === 'update-record');
  const delegation = storedDelegation(policy);
  const intent = actionIntent(node, policy);

  assert.deepEqual(
    assertActionIntentWithinDelegation(intent, node.nodeId, delegation),
    policy.policySnapshot
  );

  const outsideTarget = structuredClone(intent);
  outsideTarget.targets = [target('record/99', HASH_C)];
  assertOutsideDelegation(
    () => assertActionIntentWithinDelegation(outsideTarget, node.nodeId, delegation),
    'action_target_outside_ceiling'
  );

  const mismatches = [
    (candidate) => {
      candidate.providerOperation.operationKey = 'crm.record_delete';
    },
    (candidate) => {
      candidate.connection.connectionReference = 'connection/crm-secondary';
    },
    (candidate) => {
      candidate.idempotency.key = 'effect/different';
    },
    (candidate) => {
      candidate.externalPreconditions[0].expectedStateHash = HASH_C;
    },
  ];
  for (const mutate of mismatches) {
    const candidate = structuredClone(intent);
    mutate(candidate);
    assertOutsideDelegation(
      () => assertActionIntentWithinDelegation(candidate, node.nodeId, delegation),
      'action_external_authority_mismatch'
    );
  }

  const driftedColumn = structuredClone(delegation);
  driftedColumn.allowedTargets = [];
  assertOutsideDelegation(
    () => assertActionIntentWithinDelegation(intent, node.nodeId, driftedColumn),
    'stored_target_ceiling_mismatch'
  );
});
