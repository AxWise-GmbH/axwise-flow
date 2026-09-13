import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { CANONICALIZATION_ALGORITHM, canonicalJsonSha256 } from '../src/domain/canonical.js';
import {
  DispatchReceiptV1Schema,
  ExecutionEnvelopeV1Schema,
  GatewayEffectAttestationV1Schema,
  N8nConnectorRequestV1Schema,
  gatewayAttestationHashPayload,
  gatewayGrantScopeV1Hash,
  projectN8nConnectorRequestV1,
  verifyGatewayAttestationSignature,
} from '../src/domain/runtime-contracts.js';
import { AGENT_WORKER_ID, HASH_A, HASH_B, HASH_C, HASH_D, RUN_ID } from './fixtures.js';

const STEP_ID = '66666666-6666-4666-8666-666666666666';
const ATTEMPT_ID = '77777777-7777-4777-8777-777777777777';
const EFFECT_ID = '88888888-8888-4888-8888-888888888888';
const ACTION_INTENT_ID = '99999999-9999-4999-8999-999999999999';
const GATEWAY_AUDIENCE = 'https://tool-gateway.agentic.internal';
const descriptor = {
  contractVersion: '1.0',
  descriptorKey: 'record_update_v1',
  schemaVersion: '1.0',
  contentHash: HASH_A,
};
const binding = {
  contractVersion: '1.0',
  bindingKey: 'connector_executor',
  bindingVersion: '1.0',
  contentHash: HASH_B,
};

function baseEnvelope() {
  const canonicalInput = { recordId: 'record-1', status: 'active' };
  return {
    version: 'orqaly_execution_envelope_v1',
    contractVersion: '1.0',
    canonicalization: CANONICALIZATION_ALGORITHM,
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    principalId: 'user-1',
    agentId: AGENT_WORKER_ID,
    personaVersion: {
      contractVersion: '1.0',
      personaId: 'worker-persona',
      personaVersion: '1.0',
      contentHash: HASH_C,
    },
    runId: RUN_ID,
    stepId: STEP_ID,
    attemptId: ATTEMPT_ID,
    stepKind: 'reason',
    descriptor,
    executorBinding: binding,
    canonicalInput,
    canonicalInputHash: canonicalJsonSha256(canonicalInput),
    effectProfile: { externality: 'none', mutation: 'none', flags: [] },
    dataEgressProfile: {
      mode: 'deny_all',
      destinationClasses: [],
      providerClasses: [],
      regionClasses: [],
      permittedInputClassifications: [],
      permittedOutputClassifications: [],
      redactionRequired: false,
      dlpRequired: false,
      providerRetentionPolicyRequired: false,
      providerTrainingPolicyRequired: false,
    },
    sealedContextReferences: [],
    artifactReferences: [],
    limits: {
      maximumTurns: 4,
      maximumTokens: 8_000,
      maximumToolCalls: 2,
      maximumRuntimeSeconds: 120,
      maximumAttempts: 1,
      maximumCostMinor: 0,
      currency: 'EUR',
    },
    issuedAt: '2026-09-04T10:00:00.000Z',
    deadline: '2026-09-04T10:02:00.000Z',
    callbackReference: 'callback-1',
    policyDigest: HASH_D,
    actionIntentId: null,
    actionIntentHash: null,
    approvalBindingHash: null,
    idempotencyScope: null,
    idempotencyKey: null,
    effectId: null,
    targets: [],
    externalPreconditions: [],
    connectionReferences: [],
    gatewayGrant: null,
  };
}

function attachGatewayGrant(envelope, overrides = {}) {
  envelope.gatewayGrant = {
    version: 'orqaly_gateway_grant_reference_v1',
    reference: 'grant/external-operation',
    scopeHash: HASH_A,
    audience: GATEWAY_AUDIENCE,
    issuedAt: '2026-09-04T10:00:01.000Z',
    expiresAt: '2026-09-04T10:01:00.000Z',
    ...overrides,
  };
  envelope.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(envelope);
  return envelope;
}

function externalReadEnvelope() {
  const envelope = baseEnvelope();
  envelope.stepKind = 'connector_read';
  envelope.effectProfile = { externality: 'read', mutation: 'none', flags: [] };
  envelope.actionIntentId = ACTION_INTENT_ID;
  envelope.actionIntentHash = HASH_C;
  envelope.idempotencyScope = 'external_operation';
  envelope.idempotencyKey = 'read-effect-1';
  envelope.effectId = EFFECT_ID;
  envelope.connectionReferences = ['connection-1'];
  return attachGatewayGrant(envelope);
}

test('private envelope is hash-bound and cannot smuggle external authority', () => {
  assert.equal(ExecutionEnvelopeV1Schema.parse(baseEnvelope()).effectId, null);
  const smuggled = baseEnvelope();
  attachGatewayGrant(smuggled);
  assert.equal(ExecutionEnvelopeV1Schema.safeParse(smuggled).success, false);
});

test('write envelope requires exact effect, target, connection and scoped grant', () => {
  const envelope = externalReadEnvelope();
  envelope.stepKind = 'connector_write';
  envelope.effectProfile = { externality: 'write', mutation: 'update', flags: [] };
  envelope.targets = [
    { targetType: 'business_record', targetReference: 'record-1', targetHash: null },
  ];
  envelope.approvalBindingHash = HASH_D;
  envelope.idempotencyScope = 'logical_effect';
  envelope.idempotencyKey = 'effect-1';
  envelope.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(envelope);
  assert.equal(ExecutionEnvelopeV1Schema.safeParse(envelope).success, true);
  envelope.targets = [];
  assert.equal(ExecutionEnvelopeV1Schema.safeParse(envelope).success, false);
});

test('connector reads require immutable intent, provider connection and short-lived grant', () => {
  const read = baseEnvelope();
  read.stepKind = 'connector_read';
  read.effectProfile = { externality: 'read', mutation: 'none', flags: [] };
  assert.equal(ExecutionEnvelopeV1Schema.safeParse(read).success, false);
  read.actionIntentId = ACTION_INTENT_ID;
  read.actionIntentHash = HASH_C;
  read.effectId = EFFECT_ID;
  read.idempotencyScope = 'external_operation';
  read.idempotencyKey = 'read-effect-1';
  read.connectionReferences = ['connection-1'];
  assert.equal(ExecutionEnvelopeV1Schema.safeParse(read).success, false);
  attachGatewayGrant(read);
  assert.equal(ExecutionEnvelopeV1Schema.safeParse(read).success, true);

  const noConnection = structuredClone(read);
  noConnection.connectionReferences = [];
  assert.equal(ExecutionEnvelopeV1Schema.safeParse(noConnection).success, false);

  const broadGrant = structuredClone(read);
  broadGrant.gatewayGrant.scopeHash = HASH_D;
  assert.equal(ExecutionEnvelopeV1Schema.safeParse(broadGrant).success, false);

  const longLivedGrant = structuredClone(read);
  longLivedGrant.gatewayGrant.expiresAt = '2026-09-04T10:06:00.000Z';
  longLivedGrant.deadline = '2026-09-04T10:10:00.000Z';
  longLivedGrant.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(longLivedGrant);
  assert.equal(ExecutionEnvelopeV1Schema.safeParse(longLivedGrant).success, false);
});

test('external notifications and writes require approval-bound Gateway authority', () => {
  const read = externalReadEnvelope();

  const write = structuredClone(read);
  write.stepKind = 'connector_write';
  write.effectProfile = { externality: 'write', mutation: 'create', flags: [] };
  write.targets = [
    { targetType: 'business_record', targetReference: 'record-1', targetHash: null },
  ];
  write.idempotencyScope = 'logical_effect';
  write.idempotencyKey = 'effect-1';
  write.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(write);
  assert.equal(ExecutionEnvelopeV1Schema.safeParse(write).success, false);
  write.approvalBindingHash = HASH_D;
  write.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(write);
  assert.equal(ExecutionEnvelopeV1Schema.safeParse(write).success, true);

  const notify = structuredClone(write);
  notify.stepKind = 'notify';
  notify.effectProfile = {
    externality: 'write',
    mutation: 'create',
    flags: ['communication', 'external_disclosure'],
  };
  notify.targets = [
    { targetType: 'notification_recipient', targetReference: 'recipient-1', targetHash: null },
  ];
  notify.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(notify);
  assert.equal(ExecutionEnvelopeV1Schema.safeParse(notify).success, true);
  notify.gatewayGrant = null;
  assert.equal(ExecutionEnvelopeV1Schema.safeParse(notify).success, false);
});

test('public evidence remains a retrieve step and never requires connector authority', () => {
  const retrieve = baseEnvelope();
  retrieve.stepKind = 'retrieve';
  retrieve.canonicalInput = { query: 'public weather evidence' };
  retrieve.canonicalInputHash = canonicalJsonSha256(retrieve.canonicalInput);
  assert.equal(ExecutionEnvelopeV1Schema.safeParse(retrieve).success, true);

  const connectorProjection = projectN8nConnectorRequestV1(externalReadEnvelope());
  assert.equal(connectorProjection.stepKind, 'connector_read');
  assert.throws(() => projectN8nConnectorRequestV1(retrieve));
});

test('connector projection rejects provider credentials hidden in canonical input', () => {
  const envelope = externalReadEnvelope();
  envelope.canonicalInput = {
    recordId: 'record-1',
    auth: { api_key: 'must-never-enter-n8n' },
  };
  envelope.canonicalInputHash = canonicalJsonSha256(envelope.canonicalInput);
  envelope.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(envelope);
  assert.equal(ExecutionEnvelopeV1Schema.safeParse(envelope).success, true);
  assert.throws(() => projectN8nConnectorRequestV1(envelope), /provider credential fields/);
});

test('connector projection recursively rejects private execution concepts after hash rebinding', () => {
  const adversarialInputs = [
    {
      providerRequest: {
        metadata: { private_execution_envelope: { version: 'orqaly_execution_envelope_v1' } },
      },
    },
    { operations: [{ routing: { agent_id: AGENT_WORKER_ID } }] },
    { providerRequest: { options: { personaVersion: 'persona-v1' } } },
    { batches: [{ items: [{ sealedContextReferences: ['context-1'] }] }] },
    { providerRequest: { upload: { artifact_reference: 'artifact-1' } } },
    { providerRequest: { policy: { reasoning_limits: { maximumTokens: 1 } } } },
    { providerRequest: { completion: { callback_url: 'https://example.test/callback' } } },
  ];

  for (const canonicalInput of adversarialInputs) {
    const envelope = externalReadEnvelope();
    envelope.canonicalInput = canonicalInput;
    envelope.canonicalInputHash = canonicalJsonSha256(canonicalInput);
    envelope.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(envelope);

    assert.equal(ExecutionEnvelopeV1Schema.safeParse(envelope).success, true);
    assert.throws(
      () => projectN8nConnectorRequestV1(envelope),
      /private execution fields are forbidden/
    );
  }
});

test('connector projection permits similarly named provider-neutral parameters', () => {
  const envelope = externalReadEnvelope();
  envelope.canonicalInput = {
    assignedAgentName: 'External support queue',
    callbackStatus: 'pending',
    paginationLimit: 25,
    providerArtifactType: 'invoice',
    userAgent: 'orqaly-connector/1.0',
  };
  envelope.canonicalInputHash = canonicalJsonSha256(envelope.canonicalInput);
  envelope.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(envelope);

  assert.equal(ExecutionEnvelopeV1Schema.safeParse(envelope).success, true);
  assert.deepEqual(projectN8nConnectorRequestV1(envelope).canonicalInput, envelope.canonicalInput);
});

test('connector private-field diagnostics use deterministic escaped JSON-pointer paths', () => {
  const request = projectN8nConnectorRequestV1(externalReadEnvelope());
  request.canonicalInput = {
    z: [{ 'callback/reference': 'callback-1' }],
    a: { 'persona~version': 'persona-v1', agent_id: AGENT_WORKER_ID },
  };
  request.canonicalInputHash = canonicalJsonSha256(request.canonicalInput);
  request.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(request);

  const result = N8nConnectorRequestV1Schema.safeParse(request);
  assert.equal(result.success, false);
  assert.equal(
    result.error.issues.find((issue) => issue.message.startsWith('private execution fields'))
      ?.message,
    'private execution fields are forbidden in connector input: /a/agent_id, /a/persona~0version, /z/0/callback~1reference'
  );
});

test('connector request contract rejects private execution-envelope fields', () => {
  const request = projectN8nConnectorRequestV1(externalReadEnvelope());
  const contaminated = {
    ...request,
    personaVersion: {
      contractVersion: '1.0',
      personaId: 'worker-persona',
      personaVersion: '1.0',
      contentHash: HASH_C,
    },
    sealedContextReferences: [{ referenceId: 'context-1', contentHash: HASH_D }],
    artifactReferences: [{ referenceId: 'artifact-1', contentHash: HASH_A }],
  };
  assert.equal(N8nConnectorRequestV1Schema.safeParse(contaminated).success, false);
});

function signedAttestation(privateKey, overrides = {}) {
  const value = {
    version: 'orqaly_gateway_effect_attestation_v1',
    contractVersion: '1.0',
    canonicalization: CANONICALIZATION_ALGORITHM,
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    runId: RUN_ID,
    stepId: STEP_ID,
    effectId: EFFECT_ID,
    attemptId: ATTEMPT_ID,
    descriptor,
    canonicalInputHash: HASH_C,
    preconditionHash: null,
    outcome: 'succeeded',
    externalReferences: [{ referenceType: 'business_record', referenceValue: 'record-1' }],
    outputHash: HASH_D,
    observedCost: null,
    observedAt: '2026-09-04T10:01:00.000Z',
    receiptHash: HASH_A,
    signatureAlgorithm: 'ed25519_v1',
    signatureKeyId: 'gateway_key_1',
    signature: 'placeholder_signature',
    ...overrides,
  };
  value.receiptHash = canonicalJsonSha256(gatewayAttestationHashPayload(value));
  value.signature = crypto
    .sign(null, Buffer.from(value.receiptHash, 'hex'), privateKey)
    .toString('base64url');
  return value;
}

test('Gateway attestation is content-addressed and Ed25519 verified', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const attestation = signedAttestation(privateKey);
  assert.equal(GatewayEffectAttestationV1Schema.safeParse(attestation).success, true);
  assert.equal(verifyGatewayAttestationSignature(attestation, publicKey).effectId, EFFECT_ID);
  const forged = { ...attestation, signature: attestation.signature.replace(/^./, 'A') };
  assert.throws(() => verifyGatewayAttestationSignature(forged, publicKey));
});

test('external completion is rejected without matching Gateway proof', () => {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const receipt = {
    version: 'orqaly_dispatch_receipt_v1',
    contractVersion: '1.0',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    runId: RUN_ID,
    stepId: STEP_ID,
    attemptId: ATTEMPT_ID,
    descriptor,
    executorBinding: binding,
    status: 'succeeded',
    observedAt: '2026-09-04T10:01:01.000Z',
    executorReference: 'execution-1',
    effectId: EFFECT_ID,
    gatewayEffectAttestation: null,
    errorCode: null,
    sanitizedError: null,
  };
  assert.equal(DispatchReceiptV1Schema.safeParse(receipt).success, false);
  receipt.gatewayEffectAttestation = signedAttestation(privateKey);
  assert.equal(DispatchReceiptV1Schema.safeParse(receipt).success, true);
  receipt.gatewayEffectAttestation = signedAttestation(privateKey, { workspaceId: 'other' });
  assert.equal(DispatchReceiptV1Schema.safeParse(receipt).success, false);
});
