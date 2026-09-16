import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ActionIntentV1Schema,
  ApprovalPresentationV1Schema,
  ApprovalSubjectV1Schema,
  actionIntentV1HashPayload,
  approvalSubjectV1Hash,
  buildApprovalPresentationV1,
  sealActionIntentV1,
} from '../src/domain/approval-contracts.js';
import { decideApproval, listApprovals } from '../src/repositories/control-plane-repository.js';
import {
  ExecutionPlanV2Schema,
  executionPlanV2HashPayload,
} from '../src/domain/execution-contracts.js';
import { CANONICALIZATION_ALGORITHM, canonicalJsonSha256 } from '../src/domain/canonical.js';
import {
  ExecutionEnvelopeAuthorityError,
  gatewayGrantScopeV1Hash,
  validateExecutionEnvelopeAuthorityV1,
} from '../src/domain/runtime-contracts.js';
import {
  AGENT_WORKER_ID,
  HASH_A,
  HASH_B,
  HASH_C,
  HASH_D,
  RUN_ID,
  materializedPlan,
  persona,
} from './fixtures.js';

const ACTION_INTENT_ID = '66666666-6666-4666-8666-666666666666';
const STEP_ID = '77777777-7777-4777-8777-777777777777';
const EFFECT_ID = '88888888-8888-4888-8888-888888888888';
const PLAN_ID = '99999999-9999-4999-8999-999999999999';
const PLAN_VERSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PERSONA_VERSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DELEGATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function externalActionSpec() {
  return {
    version: 'orqaly_external_action_spec_v1',
    effectId: EFFECT_ID,
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
    idempotency: { scope: 'crm_record_update', key: 'effect/record-42/status' },
    reconciliation: { strategy: 'provider_idempotency', lookupOperation: null },
    compensation: { strategy: 'none', operation: null },
  };
}

function actionIntent() {
  const canonicalParameters = { recordId: '42', status: 'active' };
  const externalAction = externalActionSpec();
  return sealActionIntentV1({
    version: 'orqaly_action_intent_v1',
    contractVersion: '1.0',
    canonicalization: CANONICALIZATION_ALGORITHM,
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    principalId: 'user-1',
    actionIntentId: ACTION_INTENT_ID,
    runId: RUN_ID,
    stepId: STEP_ID,
    stepKind: 'connector_write',
    agentId: AGENT_WORKER_ID,
    personaVersion: {
      contractVersion: '1.0',
      personaVersionId: PERSONA_VERSION_ID,
      personaId: 'worker-persona',
      personaVersion: '1',
      contentHash: persona('worker').contentHash,
    },
    planVersion: {
      planId: PLAN_ID,
      planVersionId: PLAN_VERSION_ID,
      planVersion: 1,
      contentHash: HASH_C,
    },
    delegation: {
      delegationId: DELEGATION_ID,
      version: 1,
      policyHash: HASH_D,
    },
    descriptor: {
      contractVersion: '1.0',
      descriptorKey: 'record_update_v1',
      schemaVersion: '1.0',
      contentHash: HASH_A,
    },
    executorBinding: {
      contractVersion: '1.0',
      bindingKey: 'connector_executor',
      bindingVersion: '1.0',
      contentHash: HASH_B,
    },
    canonicalParameters,
    canonicalInputHash: canonicalJsonSha256(canonicalParameters),
    effectProfile: { externality: 'write', mutation: 'update', flags: [] },
    dataEgressProfile: {
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
    },
    effectId: externalAction.effectId,
    providerOperation: externalAction.providerOperation,
    connection: externalAction.connection,
    targets: externalAction.targets,
    externalPreconditions: externalAction.externalPreconditions,
    idempotency: externalAction.idempotency,
    reconciliation: externalAction.reconciliation,
    compensation: externalAction.compensation,
    policy: {
      policyId: 'agent_delegation_policy',
      policyVersion: '1',
      contentHash: HASH_D,
    },
    createdAt: '2026-09-04T10:00:00.000Z',
  });
}

function approvalSubject() {
  const intent = actionIntent();
  return ApprovalSubjectV1Schema.parse({
    version: 'orqaly_approval_subject_v1',
    contractVersion: '1.0',
    canonicalization: CANONICALIZATION_ALGORITHM,
    subjectKind: 'plan',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    approverPrincipalId: 'user-1',
    runId: RUN_ID,
    sourceDecisionId: 'decision-1',
    owningAgentId: AGENT_WORKER_ID,
    teamId: '44444444-4444-4444-8444-444444444444',
    planVersion: intent.planVersion,
    steps: [
      {
        stepId: STEP_ID,
        nodeId: 'update-record',
        title: 'Update CRM record',
        objective: 'Set the approved CRM status.',
        stepKind: intent.stepKind,
        agentId: AGENT_WORKER_ID,
        personaVersion: intent.personaVersion,
        delegation: intent.delegation,
        descriptor: intent.descriptor,
        executorBinding: intent.executorBinding,
        canonicalParameters: intent.canonicalParameters,
        canonicalInputHash: intent.canonicalInputHash,
        effectProfile: intent.effectProfile,
        dataEgressProfile: intent.dataEgressProfile,
        limits: {
          maximumTurns: 1,
          maximumTokens: 1_000,
          maximumToolCalls: 1,
          maximumRuntimeSeconds: 120,
          maximumAttempts: 1,
          maximumCostMinor: 0,
          currency: 'EUR',
        },
        deadline: null,
        humanReadableEffect: {
          summary: 'Set record 42 status to active.',
          risks: ['external update operation'],
        },
        actionIntent: intent,
      },
    ],
    budget: { amountMinor: 0, currency: 'EUR' },
    issuedAt: '2026-09-04T10:00:00.000Z',
    expiresAt: '2026-09-04T10:15:00.000Z',
    nonce: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  });
}

function executionEnvelope(subject = approvalSubject()) {
  const step = subject.steps[0];
  const intent = step.actionIntent;
  const envelope = {
    version: 'orqaly_execution_envelope_v1',
    contractVersion: '1.0',
    canonicalization: CANONICALIZATION_ALGORITHM,
    organizationId: intent.organizationId,
    workspaceId: intent.workspaceId,
    principalId: intent.principalId,
    agentId: intent.agentId,
    personaVersion: {
      contractVersion: intent.personaVersion.contractVersion,
      personaId: intent.personaVersion.personaId,
      personaVersion: intent.personaVersion.personaVersion,
      contentHash: intent.personaVersion.contentHash,
    },
    runId: intent.runId,
    stepId: intent.stepId,
    attemptId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    stepKind: intent.stepKind,
    descriptor: intent.descriptor,
    executorBinding: intent.executorBinding,
    canonicalInput: intent.canonicalParameters,
    canonicalInputHash: intent.canonicalInputHash,
    effectProfile: intent.effectProfile,
    dataEgressProfile: intent.dataEgressProfile,
    sealedContextReferences: [],
    artifactReferences: [],
    limits: step.limits,
    issuedAt: '2026-09-04T10:01:00.000Z',
    deadline: '2026-09-04T10:03:00.000Z',
    callbackReference: 'callback/action-intent',
    policyDigest: intent.policy.contentHash,
    actionIntentId: intent.actionIntentId,
    actionIntentHash: intent.contentHash,
    approvalBindingHash: approvalSubjectV1Hash(subject),
    idempotencyScope: intent.idempotency.scope,
    idempotencyKey: intent.idempotency.key,
    effectId: intent.effectId,
    targets: intent.targets,
    externalPreconditions: intent.externalPreconditions,
    connectionReferences: [intent.connection.connectionReference],
    gatewayGrant: {
      version: 'orqaly_gateway_grant_reference_v1',
      reference: 'grant/action-intent',
      scopeHash: HASH_A,
      audience: 'https://tool-gateway.agentic.internal',
      issuedAt: '2026-09-04T10:01:01.000Z',
      expiresAt: '2026-09-04T10:02:59.000Z',
    },
  };
  envelope.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(envelope);
  return envelope;
}

test('external plan nodes require a complete action specification and local nodes reject one', () => {
  const missing = materializedPlan();
  missing.nodes[0].stepKind = 'connector_write';
  missing.nodes[0].effectProfile = {
    externality: 'write',
    mutation: 'update',
    flags: [],
  };
  missing.contentHash = canonicalJsonSha256(executionPlanV2HashPayload(missing));
  assert.equal(ExecutionPlanV2Schema.safeParse(missing).success, false);

  const external = structuredClone(missing);
  external.nodes[0].canonicalInput = { recordId: '42', status: 'active' };
  external.nodes[0].canonicalInputHash = canonicalJsonSha256(external.nodes[0].canonicalInput);
  external.nodes[0].externalAction = externalActionSpec();
  external.contentHash = canonicalJsonSha256(executionPlanV2HashPayload(external));
  assert.equal(ExecutionPlanV2Schema.safeParse(external).success, true);

  const smuggled = materializedPlan();
  smuggled.nodes[0].externalAction = externalActionSpec();
  smuggled.contentHash = canonicalJsonSha256(executionPlanV2HashPayload(smuggled));
  assert.equal(ExecutionPlanV2Schema.safeParse(smuggled).success, false);
});

test('ActionIntentV1 is immutable-content-addressed with its own hash domain', () => {
  const intent = actionIntent();
  assert.equal(ActionIntentV1Schema.safeParse(intent).success, true);
  assert.notEqual(intent.contentHash, canonicalJsonSha256(actionIntentV1HashPayload(intent)));

  const changedTarget = structuredClone(intent);
  changedTarget.targets[0].targetReference = 'record/43';
  assert.equal(ActionIntentV1Schema.safeParse(changedTarget).success, false);

  const changedPersona = structuredClone(intent);
  changedPersona.personaVersion.contentHash = HASH_A;
  assert.equal(ActionIntentV1Schema.safeParse(changedPersona).success, false);
});

test('ApprovalSubjectV1 binds expiry, nonce and every exact action authority field', () => {
  const subject = approvalSubject();
  const bindingHash = approvalSubjectV1Hash(subject);
  assert.notEqual(bindingHash, canonicalJsonSha256(subject));

  const changedNonce = structuredClone(subject);
  changedNonce.nonce = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  assert.notEqual(approvalSubjectV1Hash(changedNonce), bindingHash);

  const changedConnection = structuredClone(subject);
  changedConnection.steps[0].actionIntent.connection.connectionReference =
    'connection/crm-secondary';
  assert.equal(ApprovalSubjectV1Schema.safeParse(changedConnection).success, false);

  const expired = structuredClone(subject);
  expired.expiresAt = expired.issuedAt;
  assert.equal(ApprovalSubjectV1Schema.safeParse(expired).success, false);
});

test('ApprovalSubjectV1 rejects an ActionIntent effect profile that differs from the shown step', () => {
  const subject = approvalSubject();
  subject.steps[0].effectProfile = {
    externality: 'write',
    mutation: 'create',
    flags: [],
  };

  assert.equal(ApprovalSubjectV1Schema.safeParse(subject).success, false);
});

test('ApprovalSubjectV1 rejects an ActionIntent egress profile that differs from the shown step', () => {
  const subject = approvalSubject();
  subject.steps[0].dataEgressProfile = {
    ...subject.steps[0].dataEgressProfile,
    destinationClasses: ['different_destination'],
  };

  assert.equal(ApprovalSubjectV1Schema.safeParse(subject).success, false);
});

test('approval rejects a validly re-sealed intent when exact step identity drifts', () => {
  const mutations = [
    (intent) => {
      intent.stepKind = 'reason';
    },
    (intent) => {
      intent.personaVersion.personaId = 'other-persona';
    },
    (intent) => {
      intent.descriptor.descriptorKey = 'other_update_v1';
    },
    (intent) => {
      intent.executorBinding.bindingKey = 'other_connector_executor';
    },
  ];

  for (const mutate of mutations) {
    const subject = approvalSubject();
    const intentPayload = actionIntentV1HashPayload(subject.steps[0].actionIntent);
    mutate(intentPayload);
    subject.steps[0].actionIntent = sealActionIntentV1(intentPayload);
    assert.equal(ApprovalSubjectV1Schema.safeParse(subject).success, false);
  }
});

test('runtime envelope resolves exact action-intent, approval and idempotency authority', () => {
  const subject = approvalSubject();
  const intent = subject.steps[0].actionIntent;
  const envelope = executionEnvelope(subject);
  const validated = validateExecutionEnvelopeAuthorityV1({
    envelope,
    actionIntent: intent,
    approvalSubject: subject,
  });
  assert.equal(validated.actionIntent.contentHash, envelope.actionIntentHash);

  const changedIdempotency = structuredClone(envelope);
  changedIdempotency.idempotencyKey = 'effect/other';
  changedIdempotency.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(changedIdempotency);
  assert.throws(
    () =>
      validateExecutionEnvelopeAuthorityV1({
        envelope: changedIdempotency,
        actionIntent: intent,
        approvalSubject: subject,
      }),
    (error) =>
      error instanceof ExecutionEnvelopeAuthorityError &&
      error.code === 'action_intent_idempotency_mismatch'
  );

  const changedApproval = structuredClone(envelope);
  changedApproval.approvalBindingHash = HASH_A;
  changedApproval.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(changedApproval);
  assert.throws(
    () =>
      validateExecutionEnvelopeAuthorityV1({
        envelope: changedApproval,
        actionIntent: intent,
        approvalSubject: subject,
      }),
    (error) =>
      error instanceof ExecutionEnvelopeAuthorityError &&
      error.code === 'approval_binding_hash_mismatch'
  );
});

test('approval presentation exposes exact consent fields without credentials or raw tokens', () => {
  const subject = approvalSubject();
  const intentPayload = actionIntentV1HashPayload(subject.steps[0].actionIntent);
  intentPayload.canonicalParameters = {
    recordId: '42',
    status: 'active',
    apiToken: 'sk-live-abcdefghijklmno',
    nested: { Authorization: 'Bearer abcdefghijklmnop' },
  };
  intentPayload.canonicalInputHash = canonicalJsonSha256(intentPayload.canonicalParameters);
  const intent = sealActionIntentV1(intentPayload);
  subject.steps[0].canonicalInputHash = intent.canonicalInputHash;
  subject.steps[0].canonicalParameters = intent.canonicalParameters;
  subject.steps[0].actionIntent = intent;

  const presentation = buildApprovalPresentationV1(subject);
  const step = presentation.steps[0];
  assert.equal(presentation.version, 'orqaly_approval_presentation_v1');
  assert.equal(presentation.owningAgentId, AGENT_WORKER_ID);
  assert.deepEqual(presentation.budget, { amountMinor: 0, currency: 'EUR' });
  assert.equal(step.operation.key, 'crm.record_update');
  assert.equal(step.agent.personaVersion.personaId, 'worker-persona');
  assert.equal(step.agent.delegation.delegationId, DELEGATION_ID);
  assert.equal(step.descriptor.descriptorKey, 'record_update_v1');
  assert.equal(step.executorBinding.bindingKey, 'connector_executor');
  assert.equal(step.canonicalParameters.recordId, '42');
  assert.equal(step.canonicalParameters.apiToken, '[REDACTED]');
  assert.equal(step.canonicalParameters.nested.Authorization, '[REDACTED]');
  assert.deepEqual(step.redactedParameterPaths, ['/apiToken', '/nested/Authorization']);
  assert.equal(step.canonicalInputHash, intent.canonicalInputHash);
  assert.equal(step.action.targets[0].targetReference, 'record/42');
  assert.equal(step.action.externalPreconditions[0].preconditionType, 'etag');
  assert.equal(step.action.connection.connectionReference, 'connection/crm-primary');
  assert.deepEqual(step.action.connection.requestedScopes, ['records.write']);
  assert.equal(step.action.providerOperation.operationKey, 'crm.record_update');
  assert.equal(step.action.idempotency.scope, 'crm_record_update');

  const serialized = JSON.stringify(presentation);
  assert.equal(serialized.includes('sk-live-abcdefghijklmno'), false);
  assert.equal(serialized.includes('Bearer abcdefghijklmnop'), false);
  assert.equal(serialized.includes('credentialOwnerPrincipalId'), false);
  assert.equal(serialized.includes('approverPrincipalId'), false);
  assert.equal(serialized.includes('organizationId'), false);
  assert.equal(serialized.includes('workspaceId'), false);
  assert.equal(serialized.includes('nonce'), false);

  const unsafe = structuredClone(presentation);
  unsafe.steps[0].canonicalParameters.apiToken = 'sk-live-abcdefghijklmno';
  assert.equal(ApprovalPresentationV1Schema.safeParse(unsafe).success, false);
});

test('approval listing returns only safe presentation fields and authoritative controls', async () => {
  const presentation = buildApprovalPresentationV1(approvalSubject());
  const common = {
    run_id: RUN_ID,
    step_id: null,
    approval_subject_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    subject_kind: 'plan',
    subject_hash: HASH_A,
    presentation,
    status: 'pending',
    expires_at: presentation.expiresAt,
    decided_at: null,
    decision_reason: null,
    version: 1,
    created_at: presentation.issuedAt,
    required_approver_id: 'must-not-leak',
    subject_snapshot: { raw: 'must-not-leak' },
  };
  const client = {
    query: async () => ({
      rows: [
        {
          ...common,
          id: '11111111-1111-4111-8111-111111111111',
          cannot_decide_reason: null,
        },
        {
          ...common,
          id: '22222222-2222-4222-8222-222222222222',
          cannot_decide_reason: 'expired',
        },
      ],
    }),
  };

  const listed = await listApprovals(client, { status: null });
  assert.deepEqual(listed[0].controls, {
    approval: { approve: true, reject: true, reason: null },
  });
  assert.deepEqual(listed[1].controls, {
    approval: { approve: false, reject: false, reason: 'expired' },
  });
  assert.equal('required_approver_id' in listed[0], false);
  assert.equal('subject_snapshot' in listed[0], false);
  assert.equal(JSON.stringify(listed).includes('must-not-leak'), false);
});

test('approval repository rejects a service principal before its first database query', async () => {
  let queryCount = 0;
  const client = {
    async query() {
      queryCount += 1;
      throw new Error('database must not be reached');
    },
  };

  await assert.rejects(
    () =>
      decideApproval(
        client,
        {
          organizationId: 'org-1',
          workspaceId: 'workspace-1',
          userId: 'service-1',
          actorType: 'service',
          requestId: 'request-service',
        },
        '11111111-1111-4111-8111-111111111111',
        1,
        {
          version: 'orqaly_approval_decision_request_v1',
          idempotencyKey: 'service-decision',
          decision: 'approve',
          reason: 'must be rejected',
        }
      ),
    (error) => error.code === 'human_principal_required' && error.status === 403
  );
  assert.equal(queryCount, 0);
});
