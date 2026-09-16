import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { authorizeWorkload } from '../src/auth.js';
import { canonicalJsonSha256 } from '../src/canonical.js';
import { gatewayGrantScopeV1Hash } from '../src/contracts.js';
import { gatewayAttestationHashPayload } from '../src/signing.js';
import { ToolGatewayExecutionService } from '../src/service.js';

const DESCRIPTOR_HASH = 'a'.repeat(64);
const BINDING_HASH = 'b'.repeat(64);
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const PRIVATE_KEY_PEM = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

const config = Object.freeze({
  TOOL_GATEWAY_AUTH_MODE: 'local_token',
  TOOL_GATEWAY_LOCAL_BEARER_TOKEN: 'local-n8n-token-that-is-at-least-32-characters',
  TOOL_GATEWAY_AUDIENCE: 'https://tool-gateway.agentic.internal',
  TOOL_GATEWAY_ATTESTATION_PRIVATE_KEY: PRIVATE_KEY_PEM,
  TOOL_GATEWAY_ATTESTATION_KEY_ID: 'preview_gateway_v1',
  OPERATIONAL_RECORD_DESCRIPTOR_HASH: DESCRIPTOR_HASH,
  N8N_EXECUTOR_BINDING_HASH: BINDING_HASH,
  TOOL_GATEWAY_CONNECTION_REFERENCE: 'orqaly-internal-operational-record-v1',
});

function connectorRequest() {
  const canonicalInput = {
    title: 'Create a customer handoff record',
    details: 'Preview proof only',
  };
  const request = {
    version: 'orqaly_n8n_connector_request_v1',
    contractVersion: '1.0',
    canonicalization: 'rfc8785_v1',
    organizationId: '10000000-0000-4000-8000-000000000001',
    workspaceId: 'workspace-preview',
    runId: '11111111-1111-4111-8111-111111111111',
    stepId: '22222222-2222-4222-8222-222222222222',
    attemptId: '33333333-3333-4333-8333-333333333333',
    stepKind: 'connector_write',
    actionIntentId: '44444444-4444-4444-8444-444444444444',
    actionIntentHash: 'c'.repeat(64),
    effectId: '55555555-5555-4555-8555-555555555555',
    descriptor: {
      contractVersion: '1.0',
      descriptorKey: 'operational_record_create_v1',
      schemaVersion: '1.0',
      contentHash: DESCRIPTOR_HASH,
    },
    executorBinding: {
      contractVersion: '1.0',
      bindingKey: 'tool_gateway_connector_v1',
      bindingVersion: '1.0',
      contentHash: BINDING_HASH,
    },
    canonicalInput,
    canonicalInputHash: canonicalJsonSha256(canonicalInput),
    effectProfile: { externality: 'write', mutation: 'create', flags: [] },
    dataEgressProfile: {
      mode: 'internal_only',
      destinationClasses: ['orqaly_private_tool_gateway'],
      providerClasses: [],
      regionClasses: ['eu'],
      permittedInputClassifications: ['internal'],
      permittedOutputClassifications: ['internal'],
      redactionRequired: false,
      dlpRequired: false,
      providerRetentionPolicyRequired: false,
      providerTrainingPolicyRequired: false,
    },
    deadline: '2026-09-04T20:05:00.000Z',
    policyDigest: 'd'.repeat(64),
    approvalBindingHash: 'e'.repeat(64),
    idempotencyScope: 'logical_effect',
    idempotencyKey: 'operational-record-effect-1',
    targets: [
      {
        targetType: 'operational_record_store',
        targetReference: 'operational-record:55555555-5555-4555-8555-555555555555',
        targetHash: null,
      },
    ],
    externalPreconditions: [],
    connectionReference: 'orqaly-internal-operational-record-v1',
    gatewayGrant: {
      version: 'orqaly_gateway_grant_reference_v1',
      reference: 'grant/operational-record-effect-1',
      scopeHash: '0'.repeat(64),
      audience: 'https://tool-gateway.agentic.internal',
      issuedAt: '2026-09-04T20:00:00.000Z',
      expiresAt: '2026-09-04T20:04:00.000Z',
    },
  };
  request.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(request);
  return request;
}

function verifyAttestation(attestation) {
  assert.equal(
    canonicalJsonSha256(gatewayAttestationHashPayload(attestation)),
    attestation.receiptHash
  );
  assert.equal(
    crypto.verify(
      null,
      Buffer.from(attestation.receiptHash, 'hex'),
      publicKey,
      Buffer.from(attestation.signature, 'base64url')
    ),
    true
  );
}

test('commits a tenant-scoped operational record and returns a verifiable receipt', async () => {
  const calls = [];
  const store = {
    async commitOperationalRecord(input) {
      calls.push(input);
      return {
        state: 'created',
        recordId: input.recordId,
        dispatchReceipt: input.dispatchReceipt,
        receiptHash: input.receiptHash,
        createdAt: input.createdAt,
      };
    },
  };
  const service = new ToolGatewayExecutionService({
    config,
    store,
    now: () => new Date('2026-09-04T20:01:00.000Z'),
    randomUUID: () => '66666666-6666-4666-8666-666666666666',
  });
  const request = connectorRequest();
  const receipt = await service.execute(request, {
    requestId: request.attemptId,
    idempotencyKey: `logical_effect:${request.idempotencyKey}`,
  });

  assert.equal(receipt.status, 'succeeded');
  assert.equal(receipt.executorReference, `gateway-effect:${request.effectId}:created`);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].request.organizationId, '10000000-0000-4000-8000-000000000001');
  assert.equal(calls[0].request.workspaceId, 'workspace-preview');
  assert.deepEqual(receipt.gatewayEffectAttestation.externalReferences, [
    { referenceType: 'idempotency_key', referenceValue: request.idempotencyKey },
    { referenceType: 'idempotency_state', referenceValue: 'created' },
    {
      referenceType: 'operational_record_created_at',
      referenceValue: '2026-09-04T20:01:00.000Z',
    },
    {
      referenceType: 'operational_record_id',
      referenceValue: '66666666-6666-4666-8666-666666666666',
    },
  ]);
  verifyAttestation(receipt.gatewayEffectAttestation);
});

test('replay returns the original effect with a newly signed replay observation', async () => {
  let stored;
  const store = {
    async commitOperationalRecord(input) {
      if (!stored) {
        stored = input;
        return {
          state: 'created',
          recordId: input.recordId,
          dispatchReceipt: input.dispatchReceipt,
          receiptHash: input.receiptHash,
          createdAt: input.createdAt,
        };
      }
      return {
        state: 'replayed',
        recordId: stored.recordId,
        dispatchReceipt: stored.dispatchReceipt,
        receiptHash: stored.receiptHash,
        createdAt: stored.createdAt,
      };
    },
  };
  let clock = 0;
  const service = new ToolGatewayExecutionService({
    config,
    store,
    now: () => new Date(clock++ === 0 ? '2026-09-04T20:01:00.000Z' : '2026-09-04T20:01:30.000Z'),
    randomUUID: () =>
      clock < 2 ? '66666666-6666-4666-8666-666666666666' : '77777777-7777-4777-8777-777777777777',
  });
  const request = connectorRequest();
  const headers = {
    requestId: request.attemptId,
    idempotencyKey: `logical_effect:${request.idempotencyKey}`,
  };
  const created = await service.execute(request, headers);
  const replayed = await service.execute(request, headers);

  assert.equal(replayed.executorReference, `gateway-effect:${request.effectId}:replayed`);
  assert.equal(
    replayed.gatewayEffectAttestation.externalReferences.find(
      (item) => item.referenceType === 'operational_record_id'
    ).referenceValue,
    created.gatewayEffectAttestation.externalReferences.find(
      (item) => item.referenceType === 'operational_record_id'
    ).referenceValue
  );
  assert.equal(
    replayed.gatewayEffectAttestation.externalReferences.find(
      (item) => item.referenceType === 'idempotency_state'
    ).referenceValue,
    'replayed'
  );
  assert.equal(
    replayed.gatewayEffectAttestation.outputHash,
    created.gatewayEffectAttestation.outputHash
  );
  verifyAttestation(replayed.gatewayEffectAttestation);
});

test('rejects changed scope, identity headers, descriptor and connection before storage', async () => {
  let calls = 0;
  const service = new ToolGatewayExecutionService({
    config,
    store: {
      commitOperationalRecord: async () => {
        calls += 1;
      },
    },
    now: () => new Date('2026-09-04T20:01:00.000Z'),
  });
  const scenarios = [
    (request) => {
      request.organizationId = '90000000-0000-4000-8000-000000000009';
    },
    (request) => {
      request.descriptor.contentHash = 'f'.repeat(64);
      request.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(request);
    },
    (request) => {
      request.connectionReference = 'other-connection';
      request.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(request);
    },
  ];
  for (const mutate of scenarios) {
    const request = connectorRequest();
    mutate(request);
    await assert.rejects(() =>
      service.execute(request, {
        requestId: request.attemptId,
        idempotencyKey: `logical_effect:${request.idempotencyKey}`,
      })
    );
  }
  const request = connectorRequest();
  await assert.rejects(
    () =>
      service.execute(request, {
        requestId: '77777777-7777-4777-8777-777777777777',
        idempotencyKey: `logical_effect:${request.idempotencyKey}`,
      }),
    /request_id_mismatch/
  );
  assert.equal(calls, 0);
});

test('authorizes local token and exact Cloud Run workload claims only', () => {
  assert.equal(
    authorizeWorkload(`Bearer ${config.TOOL_GATEWAY_LOCAL_BEARER_TOKEN}`, config).subject,
    'local-n8n'
  );
  assert.throws(() => authorizeWorkload('Bearer wrong-but-long-enough-token-value', config));

  const cloudConfig = {
    TOOL_GATEWAY_AUTH_MODE: 'cloud_run_iam',
    TOOL_GATEWAY_AUDIENCE: config.TOOL_GATEWAY_AUDIENCE,
    EXPECTED_N8N_SERVICE_ACCOUNT:
      'orqaly-n8n-preview@axwise-v2-preview-001.iam.gserviceaccount.com',
  };
  const claims = {
    iss: 'https://accounts.google.com',
    aud: cloudConfig.TOOL_GATEWAY_AUDIENCE,
    email: cloudConfig.EXPECTED_N8N_SERVICE_ACCOUNT,
    email_verified: true,
    iat: 1_788_550_000,
    exp: 1_788_553_600,
  };
  const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
  assert.equal(
    authorizeWorkload(`Bearer ${token}`, cloudConfig, new Date('2026-09-04T20:01:00.000Z')).subject,
    cloudConfig.EXPECTED_N8N_SERVICE_ACCOUNT
  );
  claims.email = 'other@axwise-v2-preview-001.iam.gserviceaccount.com';
  const wrong = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
  assert.throws(() =>
    authorizeWorkload(`Bearer ${wrong}`, cloudConfig, new Date('2026-09-04T20:01:00.000Z'))
  );
});
