import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import {
  createGatewayAttestation,
  createDispatchReceipt,
} from '../../agentic-tool-gateway/src/signing.js';
import { canonicalJsonSha256 } from '../src/domain/canonical.js';
import {
  N8N_CONNECTOR_REQUEST_FIELDS,
  gatewayGrantScopeV1Hash,
} from '../src/domain/runtime-contracts.js';
import {
  n8nBindingContentHash,
  n8nBindingManifestContentHash,
  parseN8nBindingManifest,
} from '../src/executors/n8n-binding-manifest.js';
import { N8nExecutor, N8nExecutorError } from '../src/executors/n8n-executor.js';
import { AGENT_WORKER_ID, HASH_A, HASH_B, HASH_C, HASH_D, RUN_ID } from './fixtures.js';

const STEP_ID = '66666666-6666-4666-8666-666666666666';
const ATTEMPT_ID = '77777777-7777-4777-8777-777777777777';
const EFFECT_ID = '88888888-8888-4888-8888-888888888888';
const GATEWAY_AUDIENCE = 'https://tool-gateway.agentic.internal';
const descriptor = {
  contractVersion: '1.0',
  descriptorKey: 'record_lookup_v1',
  schemaVersion: '1.0',
  contentHash: HASH_A,
};
function executableBindingManifest({ metadataIdentity = false } = {}) {
  const manifest = {
    version: 'orqaly_n8n_executor_bindings_v1',
    canonicalization: 'rfc8785_v1',
    manifestHash: '0'.repeat(64),
    runtime: {
      image: 'docker.io/n8nio/n8n:2.37.10@sha256:' + '1'.repeat(64),
      mode: 'regular',
      concurrency: 1,
      retriesOwnedBy: 'orqaly_control_plane',
      auditSourceOfTruth: 'orqaly_cloud_sql',
    },
    bindings: [
      {
        contractVersion: '1.0',
        bindingKey: 'tool_gateway_connector_v1',
        bindingVersion: '1.0',
        contentHash: '0'.repeat(64),
        workflowFile: 'workflows/tool-gateway-connector-v1.json',
        workflowContentHash: HASH_D,
        workflowVersionId: 'b74bc65d-a5f5-47ef-b5fa-5f0e7c49d0cd',
        webhookPath: 'orqaly-tool-gateway-connector-v1',
        ...(metadataIdentity
          ? {
              gatewayIdentityMode: 'n8n_gcp_metadata_v1',
              metadataIdentityUrl:
                'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=https%3A%2F%2Ftool-gateway.agentic.internal',
              toolGatewayUrl:
                'https://orqaly-agentic-tool-gateway-preview-161074549006.europe-west4.run.app/v1/effects/execute',
              toolGatewayExpectedSubject:
                'orqaly-n8n-preview@axwise-v2-preview-001.iam.gserviceaccount.com',
            }
          : { toolGatewayUrl: 'http://tool-gateway:8080/v1/effects/execute' }),
        toolGatewayAudience: GATEWAY_AUDIENCE,
        acceptedStepKinds: ['connector_read', 'connector_write', 'notify'],
        providerAccess: 'forbidden',
        credentialAccess: 'opaque_grant_only',
        executionDataRetention: 'none',
      },
    ],
    descriptorBindings: [],
  };
  manifest.bindings[0].contentHash = n8nBindingContentHash(manifest, manifest.bindings[0]);
  const executorBinding = {
    contractVersion: manifest.bindings[0].contractVersion,
    bindingKey: manifest.bindings[0].bindingKey,
    bindingVersion: manifest.bindings[0].bindingVersion,
    contentHash: manifest.bindings[0].contentHash,
  };
  manifest.descriptorBindings = [
    {
      descriptor,
      executorBinding,
      acceptedStepKinds: ['connector_read', 'connector_write'],
    },
  ];
  manifest.manifestHash = n8nBindingManifestContentHash(manifest);
  return parseN8nBindingManifest(manifest);
}

const bindingManifest = executableBindingManifest();
const binding = bindingManifest.descriptorBindings[0].executorBinding;

function readEnvelope() {
  const canonicalInput = { recordId: 'record-1' };
  const envelope = {
    version: 'orqaly_execution_envelope_v1',
    contractVersion: '1.0',
    canonicalization: 'rfc8785_v1',
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
    stepKind: 'connector_read',
    descriptor,
    executorBinding: binding,
    canonicalInput,
    canonicalInputHash: canonicalJsonSha256(canonicalInput),
    effectProfile: { externality: 'read', mutation: 'none', flags: [] },
    dataEgressProfile: {
      mode: 'internal_only',
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
      maximumTurns: 1,
      maximumTokens: 1_000,
      maximumToolCalls: 1,
      maximumRuntimeSeconds: 30,
      maximumAttempts: 1,
      maximumCostMinor: 0,
      currency: 'EUR',
    },
    issuedAt: '2026-09-04T10:00:00.000Z',
    deadline: '2026-09-04T10:00:30.000Z',
    callbackReference: 'callback-1',
    policyDigest: HASH_D,
    actionIntentId: '99999999-9999-4999-8999-999999999999',
    actionIntentHash: HASH_C,
    approvalBindingHash: null,
    idempotencyScope: 'external_operation',
    idempotencyKey: 'read-effect-1',
    effectId: EFFECT_ID,
    targets: [],
    externalPreconditions: [],
    connectionReferences: ['connection-1'],
    gatewayGrant: {
      version: 'orqaly_gateway_grant_reference_v1',
      reference: 'grant/read-effect-1',
      scopeHash: HASH_A,
      audience: GATEWAY_AUDIENCE,
      issuedAt: '2026-09-04T10:00:01.000Z',
      expiresAt: '2026-09-04T10:00:25.000Z',
    },
  };
  envelope.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(envelope);
  return envelope;
}

function writeEnvelope() {
  const envelope = readEnvelope();
  envelope.stepKind = 'connector_write';
  envelope.effectProfile = { externality: 'write', mutation: 'update', flags: [] };
  envelope.effectId = EFFECT_ID;
  envelope.targets = [
    {
      targetType: 'business_record',
      targetReference: 'record-1',
      targetHash: null,
    },
  ];
  envelope.gatewayGrant.reference = 'grant/write-effect-1';
  envelope.approvalBindingHash = HASH_D;
  envelope.idempotencyScope = 'logical_effect';
  envelope.idempotencyKey = 'effect-1';
  envelope.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(envelope);
  return envelope;
}

function successReceipt(overrides = {}) {
  return {
    version: 'orqaly_dispatch_receipt_v1',
    contractVersion: '1.0',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    runId: RUN_ID,
    stepId: STEP_ID,
    attemptId: ATTEMPT_ID,
    descriptor,
    executorBinding: binding,
    status: 'accepted',
    observedAt: '2026-09-04T10:00:10.000Z',
    executorReference: 'n8n-execution-1',
    effectId: EFFECT_ID,
    gatewayEffectAttestation: null,
    errorCode: null,
    sanitizedError: null,
    ...overrides,
  };
}

test('verifies a historical committed receipt without dispatch or a live grant, rejecting tampering', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const request = writeEnvelope();
  const attestation = createGatewayAttestation({
    request,
    outputHash: HASH_C,
    recordId: '12345678-1234-4234-8234-123456789012',
    recordCreatedAt: '2026-09-04T10:00:10.000Z',
    observedAt: '2026-09-04T10:00:10.000Z',
    idempotencyState: 'created',
    privateKey,
    keyId: 'test-gateway',
  });
  const receipt = createDispatchReceipt({
    request,
    attestation,
    observedAt: '2026-09-04T10:00:10.000Z',
  });
  const executor = new N8nExecutor({
    baseUrl: 'http://127.0.0.1:5678',
    bindingManifest: executableBindingManifest({ metadataIdentity: true }),
    now: () => new Date('2026-09-06T00:00:00Z'),
    fetchImpl: async () => {
      throw new Error('recovery_must_not_dispatch');
    },
    gatewayPublicKeyResolver: async () => publicKey,
  });
  assert.deepEqual(await executor.verifyReceipt(receipt, request), receipt);
  const tampered = structuredClone(receipt);
  tampered.gatewayEffectAttestation.signature = crypto
    .sign(
      null,
      Buffer.from(attestation.receiptHash, 'hex'),
      crypto.generateKeyPairSync('ed25519').privateKey
    )
    .toString('base64url');
  await assert.rejects(executor.verifyReceipt(tampered, request), {
    code: 'gateway_attestation_signature_invalid',
  });
  await assert.rejects(executor.verifyReceipt(receipt, { ...request, effectId: RUN_ID }), {
    code: 'n8n_receipt_identity_mismatch',
  });
});

test('dispatches only the minimal connector projection with separate workload identity', async () => {
  const calls = [];
  const audiences = [];
  const executor = new N8nExecutor({
    baseUrl: 'http://127.0.0.1:5678',
    bindingManifest,
    identityTokenProvider: async () => 'service-token',
    gatewayWorkloadTokenProvider: async (audience) => {
      audiences.push(audience);
      return 'gateway-workload-token';
    },
    now: () => new Date('2026-09-04T10:00:10.000Z'),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(successReceipt()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const result = await executor.dispatch(readEnvelope());
  assert.equal(result.status, 'accepted');
  assert.equal(calls[0].url, 'http://127.0.0.1:5678/webhook/orqaly-tool-gateway-connector-v1');
  assert.equal(calls[0].init.headers['idempotency-key'], `${RUN_ID}:${STEP_ID}:${ATTEMPT_ID}`);
  assert.equal(calls[0].init.headers.authorization, 'Bearer service-token');
  assert.equal(
    calls[0].init.headers['x-orqaly-tool-gateway-authorization'],
    'Bearer gateway-workload-token'
  );
  assert.deepEqual(audiences, [GATEWAY_AUDIENCE]);
  const connectorRequest = JSON.parse(calls[0].init.body);
  assert.deepEqual(Object.keys(connectorRequest), [...N8N_CONNECTOR_REQUEST_FIELDS]);
  assert.equal(connectorRequest.connectionReference, 'connection-1');
  for (const privateField of [
    'principalId',
    'agentId',
    'personaVersion',
    'sealedContextReferences',
    'artifactReferences',
    'limits',
    'callbackReference',
    'issuedAt',
  ]) {
    assert.equal(Object.hasOwn(connectorRequest, privateField), false, privateField);
  }
  assert.equal(calls.length, 1);
});

test('metadata-identity binding never asks the API to mint or forward the n8n credential', async () => {
  const metadataManifest = executableBindingManifest({ metadataIdentity: true });
  const metadataBinding = metadataManifest.descriptorBindings[0].executorBinding;
  let gatewayProviderCalls = 0;
  const executor = new N8nExecutor({
    baseUrl: 'https://n8n.internal.example',
    bindingManifest: metadataManifest,
    identityTokenProvider: async () => 'orqaly-api-to-n8n-token',
    gatewayWorkloadTokenProvider: async () => {
      gatewayProviderCalls += 1;
      throw new Error('must not be called');
    },
    now: () => new Date('2026-09-04T10:00:10.000Z'),
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.authorization, 'Bearer orqaly-api-to-n8n-token');
      assert.equal(Object.hasOwn(init.headers, 'x-orqaly-tool-gateway-authorization'), false);
      return new Response(JSON.stringify(successReceipt({ executorBinding: metadataBinding })), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const envelope = readEnvelope();
  envelope.executorBinding = metadataBinding;
  envelope.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(envelope);

  await assert.doesNotReject(() => executor.dispatch(envelope));
  assert.equal(gatewayProviderCalls, 0);
});

test('rejects unsupported step kinds and mismatched receipts', async () => {
  const executor = new N8nExecutor({
    baseUrl: 'http://localhost:5678',
    bindingManifest,
    gatewayWorkloadTokenProvider: async () => 'gateway-workload-token',
    now: () => new Date('2026-09-04T10:00:10.000Z'),
    fetchImpl: async () =>
      new Response(
        JSON.stringify(successReceipt({ runId: '99999999-9999-4999-8999-999999999999' }))
      ),
  });
  const unsupported = readEnvelope();
  unsupported.stepKind = 'reason';
  unsupported.effectProfile = { externality: 'none', mutation: 'none', flags: [] };
  unsupported.connectionReferences = [];
  unsupported.gatewayGrant = null;
  unsupported.effectId = null;
  unsupported.idempotencyScope = null;
  unsupported.idempotencyKey = null;
  unsupported.actionIntentId = null;
  unsupported.actionIntentHash = null;
  await assert.rejects(
    () => executor.dispatch(unsupported),
    (error) => error instanceof N8nExecutorError && error.code === 'n8n_step_kind_not_supported'
  );
  await assert.rejects(
    () => executor.dispatch(readEnvelope()),
    (error) => error.code === 'n8n_receipt_identity_mismatch'
  );
});

test('rejects unregistered binding and descriptor hashes before contacting n8n', async () => {
  let calls = 0;
  const executor = new N8nExecutor({
    baseUrl: 'http://localhost:5678',
    bindingManifest,
    gatewayWorkloadTokenProvider: async () => 'gateway-workload-token',
    now: () => new Date('2026-09-04T10:00:10.000Z'),
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify(successReceipt()));
    },
  });

  const wrongBinding = readEnvelope();
  wrongBinding.executorBinding = { ...wrongBinding.executorBinding, contentHash: HASH_B };
  wrongBinding.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(wrongBinding);
  await assert.rejects(
    () => executor.dispatch(wrongBinding),
    (error) =>
      error instanceof N8nExecutorError && error.code === 'n8n_executor_binding_not_permitted'
  );

  const wrongDescriptor = readEnvelope();
  wrongDescriptor.descriptor = { ...wrongDescriptor.descriptor, contentHash: HASH_D };
  wrongDescriptor.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(wrongDescriptor);
  await assert.rejects(
    () => executor.dispatch(wrongDescriptor),
    (error) =>
      error instanceof N8nExecutorError && error.code === 'n8n_descriptor_binding_not_permitted'
  );
  assert.equal(calls, 0);
});

test('does not retry and marks a write transport timeout ambiguous for reconciliation', async () => {
  let calls = 0;
  let idempotencyKey;
  const executor = new N8nExecutor({
    baseUrl: 'https://n8n.internal.example',
    bindingManifest,
    gatewayWorkloadTokenProvider: async () => 'gateway-workload-token',
    now: () => new Date('2026-09-04T10:00:10.000Z'),
    fetchImpl: async (_url, init) => {
      calls += 1;
      idempotencyKey = init.headers['idempotency-key'];
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    },
  });
  const write = writeEnvelope();
  await assert.rejects(
    () => executor.dispatch(write),
    (error) => error.code === 'n8n_dispatch_timeout' && error.ambiguous === true
  );
  assert.equal(calls, 1);
  assert.equal(idempotencyKey, 'logical_effect:effect-1');
  assert.notEqual(idempotencyKey, `${RUN_ID}:${STEP_ID}:${ATTEMPT_ID}`);
});

test(
  'bounds a stalled receipt body after headers without retrying the write',
  { timeout: 1_000 },
  async () => {
    let calls = 0;
    let aborted = false;
    const executor = new N8nExecutor({
      baseUrl: 'https://n8n.internal.example',
      bindingManifest,
      timeoutMs: 25,
      gatewayWorkloadTokenProvider: async () => 'gateway-workload-token',
      now: () => new Date('2026-09-04T10:00:10.000Z'),
      fetchImpl: async (_url, { signal }) => {
        calls += 1;
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"version":'));
              signal.addEventListener(
                'abort',
                () => {
                  aborted = true;
                  controller.error(new DOMException('receipt body timed out', 'AbortError'));
                },
                { once: true }
              );
            },
          })
        );
      },
    });
    await assert.rejects(
      () => executor.dispatch(writeEnvelope()),
      (error) => error.code === 'n8n_response_processing_failed' && error.ambiguous === true
    );
    assert.equal(aborted, true);
    assert.equal(calls, 1);
  }
);

test('every unverified post-send write failure is ambiguous and requires reconciliation', async () => {
  const scenarios = [
    {
      code: 'n8n_http_error',
      response: () => new Response('rejected', { status: 400 }),
    },
    {
      code: 'n8n_receipt_json_invalid',
      response: () => new Response('{not-json', { status: 200 }),
    },
    {
      code: 'n8n_receipt_contract_invalid',
      response: () => new Response(JSON.stringify({}), { status: 200 }),
    },
    {
      code: 'n8n_receipt_identity_mismatch',
      response: () =>
        new Response(
          JSON.stringify(successReceipt({ runId: '99999999-9999-4999-8999-999999999999' })),
          { status: 200 }
        ),
    },
  ];

  for (const scenario of scenarios) {
    const executor = new N8nExecutor({
      baseUrl: 'https://n8n.internal.example',
      bindingManifest,
      gatewayWorkloadTokenProvider: async () => 'gateway-workload-token',
      now: () => new Date('2026-09-04T10:00:10.000Z'),
      fetchImpl: async () => scenario.response(),
    });
    await assert.rejects(
      () => executor.dispatch(writeEnvelope()),
      (error) =>
        error instanceof N8nExecutorError &&
        error.code === scenario.code &&
        error.ambiguous === true,
      scenario.code
    );
  }
});

test('post-send read parsing failures remain non-effecting', async () => {
  const executor = new N8nExecutor({
    baseUrl: 'https://n8n.internal.example',
    bindingManifest,
    gatewayWorkloadTokenProvider: async () => 'gateway-workload-token',
    now: () => new Date('2026-09-04T10:00:10.000Z'),
    fetchImpl: async () => new Response('{not-json', { status: 200 }),
  });

  await assert.rejects(
    () => executor.dispatch(readEnvelope()),
    (error) =>
      error instanceof N8nExecutorError &&
      error.code === 'n8n_receipt_json_invalid' &&
      error.ambiguous === false
  );
});

test('a post-send write body-stream failure is ambiguous and requires reconciliation', async () => {
  const executor = new N8nExecutor({
    baseUrl: 'https://n8n.internal.example',
    bindingManifest,
    gatewayWorkloadTokenProvider: async () => 'gateway-workload-token',
    now: () => new Date('2026-09-04T10:00:10.000Z'),
    fetchImpl: async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('response stream interrupted'));
          },
        }),
        { status: 200 }
      ),
  });

  await assert.rejects(
    () => executor.dispatch(writeEnvelope()),
    (error) =>
      error instanceof N8nExecutorError &&
      error.code === 'n8n_response_processing_failed' &&
      error.ambiguous === true
  );
});

test('fails closed before n8n when Gateway workload authorization is unavailable', async () => {
  let calls = 0;
  const executor = new N8nExecutor({
    baseUrl: 'https://n8n.internal.example',
    bindingManifest,
    now: () => new Date('2026-09-04T10:00:10.000Z'),
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify(successReceipt()));
    },
  });

  await assert.rejects(
    () => executor.dispatch(readEnvelope()),
    (error) =>
      error instanceof N8nExecutorError &&
      error.code === 'gateway_workload_authorization_missing' &&
      error.ambiguous === false
  );
  assert.equal(calls, 0);
});

test('rejects expired, future and wrong-audience grants before n8n', async () => {
  const scenarios = [
    {
      code: 'gateway_grant_expired',
      now: '2026-09-04T10:00:25.000Z',
      mutate: () => {},
    },
    {
      code: 'gateway_grant_not_yet_valid',
      now: '2026-09-04T10:00:00.000Z',
      mutate: () => {},
    },
    {
      code: 'gateway_grant_audience_mismatch',
      now: '2026-09-04T10:00:10.000Z',
      mutate: (envelope) => {
        envelope.gatewayGrant.audience = 'https://other-gateway.agentic.internal';
        envelope.gatewayGrant.scopeHash = gatewayGrantScopeV1Hash(envelope);
      },
    },
  ];

  for (const scenario of scenarios) {
    let calls = 0;
    const envelope = readEnvelope();
    scenario.mutate(envelope);
    const executor = new N8nExecutor({
      baseUrl: 'https://n8n.internal.example',
      bindingManifest,
      gatewayWorkloadTokenProvider: async () => 'gateway-workload-token',
      now: () => new Date(scenario.now),
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify(successReceipt()));
      },
    });
    await assert.rejects(
      () => executor.dispatch(envelope),
      (error) => error instanceof N8nExecutorError && error.code === scenario.code,
      scenario.code
    );
    assert.equal(calls, 0, scenario.code);
  }
});
