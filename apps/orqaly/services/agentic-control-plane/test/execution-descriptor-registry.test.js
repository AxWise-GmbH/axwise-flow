import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ExecutionDescriptorManifestV1Schema,
  ExecutionDescriptorRegistry,
  ExecutionDescriptorRegistryError,
  executionDescriptorContentHash,
  executionDescriptorRegistryContentHash,
  parseExecutionDescriptorRegistry,
} from '../src/domain/execution-descriptor-registry.js';
import { HASH_C, HASH_D, materializedPlan } from './fixtures.js';

const GOLDEN_DESCRIPTOR_HASH = '53b2f258fe840fe83506ac3f488c50d1ce9f2fca097e86960f7acc423fb8b8b9';
const GOLDEN_DESCRIPTOR_BYTES_HASH =
  '7a273738fdf4ed33a82b9ddf626973009e96c842832882116452887de146f153';
const GOLDEN_DESCRIPTOR_PATH = new URL(
  './fixtures/axwise_execution_descriptor_manifest_v1_golden.json',
  import.meta.url
);

function descriptorManifest(overrides = {}) {
  const planNode = materializedPlan().nodes[0];
  const descriptor = {
    version: 'orqaly_execution_descriptor_manifest_v1',
    contractVersion: '1.0',
    canonicalization: 'rfc8785_v1',
    reference: {
      contractVersion: '1.0',
      descriptorKey: 'agent_reason_v1',
      schemaVersion: '1.0',
      contentHash: '0'.repeat(64),
    },
    stepKind: 'reason',
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
    inputSchemaHash: HASH_D,
    outputSchemaHash: HASH_C,
    supportedExecutorBindings: [structuredClone(planNode.executorBinding)],
    approvalPolicy: 'policy',
    retryPolicy: 'pre_acceptance_only',
    reconciliationPolicy: null,
    compensationPolicy: null,
    maximumAttempts: 2,
    defaultTimeoutSeconds: 60,
    limitPolicy: {
      maximumTurns: 8,
      maximumTokens: 16_000,
      maximumToolCalls: 4,
      maximumRuntimeSeconds: 120,
      cost: { mode: 'forbidden' },
    },
    ...overrides,
  };
  descriptor.reference = {
    contractVersion: '1.0',
    descriptorKey: 'agent_reason_v1',
    schemaVersion: '1.0',
    contentHash: '0'.repeat(64),
    ...(overrides.reference || {}),
  };
  descriptor.reference.contentHash = executionDescriptorContentHash(descriptor);
  return descriptor;
}

function descriptorRegistry(descriptors = [descriptorManifest()]) {
  const registry = {
    version: 'orqaly_execution_descriptor_registry_v1',
    canonicalization: 'rfc8785_v1',
    registryHash: '0'.repeat(64),
    descriptors: [...descriptors].sort((left, right) => {
      const leftIdentity = `${left.reference.descriptorKey}:${left.reference.schemaVersion}:${left.reference.contentHash}`;
      const rightIdentity = `${right.reference.descriptorKey}:${right.reference.schemaVersion}:${right.reference.contentHash}`;
      return leftIdentity.localeCompare(rightIdentity);
    }),
  };
  registry.registryHash = executionDescriptorRegistryContentHash(registry);
  return registry;
}

function validNode(descriptor = descriptorManifest()) {
  const node = structuredClone(materializedPlan().nodes[0]);
  node.descriptor = structuredClone(descriptor.reference);
  node.executorBinding = structuredClone(descriptor.supportedExecutorBindings[0]);
  node.expectedOutputSchemaHash = descriptor.outputSchemaHash;
  node.effectProfile = structuredClone(descriptor.effectProfile);
  node.dataEgressProfile = structuredClone(descriptor.dataEgressProfile);
  node.limits = {
    maximumTurns: 4,
    maximumTokens: 8_000,
    maximumToolCalls: 2,
    maximumRuntimeSeconds: 60,
    maximumAttempts: 2,
    maximumCostMinor: 0,
    currency: 'EUR',
  };
  return node;
}

test('accepts the byte-identical AxWise descriptor golden and RFC 8785 hash', () => {
  const fixtureBytes = readFileSync(GOLDEN_DESCRIPTOR_PATH);
  const raw = JSON.parse(fixtureBytes.toString('utf8'));

  assert.equal(
    createHash('sha256').update(fixtureBytes).digest('hex'),
    GOLDEN_DESCRIPTOR_BYTES_HASH
  );
  assert.equal(raw.reference.contentHash, GOLDEN_DESCRIPTOR_HASH);
  assert.equal(executionDescriptorContentHash(raw), GOLDEN_DESCRIPTOR_HASH);
  assert.deepEqual(ExecutionDescriptorManifestV1Schema.parse(raw), raw);

  const tampered = structuredClone(raw);
  tampered.defaultTimeoutSeconds = 30;
  assert.equal(ExecutionDescriptorManifestV1Schema.safeParse(tampered).success, false);
});

test('resolves an exact content-addressed descriptor and proves a bounded node', () => {
  const descriptor = descriptorManifest();
  const registry = new ExecutionDescriptorRegistry(descriptorRegistry([descriptor]));
  const resolution = registry.validateMaterializedNode(validNode(descriptor));

  assert.equal(resolution.descriptor.reference.contentHash, descriptor.reference.contentHash);
  assert.equal(resolution.descriptor.approvalPolicy, 'policy');
  assert.equal(resolution.descriptor.retryPolicy, 'pre_acceptance_only');
  assert.equal(resolution.descriptor.defaultTimeoutSeconds, 60);
  assert.equal(resolution.effectivePolicy.timeoutSeconds, 60);
  assert.equal(resolution.effectivePolicy.maximumAttempts, 2);
  assert.equal(Object.isFrozen(resolution), true);
  assert.equal(Object.isFrozen(registry.snapshot), true);

  const tighterRuntime = validNode(descriptor);
  tighterRuntime.limits.maximumRuntimeSeconds = 30;
  assert.equal(
    registry.validateMaterializedNode(tighterRuntime).effectivePolicy.timeoutSeconds,
    30
  );
});

test('rejects descriptor or registry content drift and descriptor version redefinition', () => {
  const descriptor = descriptorManifest();
  const changedPolicy = structuredClone(descriptorRegistry([descriptor]));
  changedPolicy.descriptors[0].approvalPolicy = 'always';
  assert.throws(
    () => parseExecutionDescriptorRegistry(changedPolicy),
    (error) =>
      error instanceof ExecutionDescriptorRegistryError &&
      error.code === 'execution_descriptor_content_hash_mismatch'
  );

  const changedRegistryHash = descriptorRegistry([descriptor]);
  changedRegistryHash.registryHash = 'f'.repeat(64);
  assert.throws(
    () => parseExecutionDescriptorRegistry(changedRegistryHash),
    (error) =>
      error instanceof ExecutionDescriptorRegistryError &&
      error.code === 'execution_descriptor_registry_hash_mismatch'
  );

  const redefined = descriptorManifest({ approvalPolicy: 'always' });
  assert.notEqual(redefined.reference.contentHash, descriptor.reference.contentHash);
  assert.throws(
    () => parseExecutionDescriptorRegistry(descriptorRegistry([descriptor, redefined])),
    (error) =>
      error instanceof ExecutionDescriptorRegistryError &&
      error.code === 'execution_descriptor_version_redefined'
  );
});

test('rejects an unregistered descriptor, unsupported binding and step-kind drift', () => {
  const descriptor = descriptorManifest();
  const registry = new ExecutionDescriptorRegistry(descriptorRegistry([descriptor]));

  const unknownDescriptor = validNode(descriptor);
  unknownDescriptor.descriptor.contentHash = 'f'.repeat(64);
  assert.throws(
    () => registry.validateMaterializedNode(unknownDescriptor),
    (error) => error.code === 'execution_descriptor_not_registered'
  );

  const unsupportedBinding = validNode(descriptor);
  unsupportedBinding.executorBinding.contentHash = 'f'.repeat(64);
  assert.throws(
    () => registry.validateMaterializedNode(unsupportedBinding),
    (error) => error.code === 'execution_descriptor_executor_binding_not_supported'
  );

  const wrongStepKind = validNode(descriptor);
  wrongStepKind.stepKind = 'review';
  assert.throws(
    () => registry.validateMaterializedNode(wrongStepKind),
    (error) => error.code === 'execution_descriptor_step_kind_mismatch'
  );
});

test('rejects effect, egress and output-contract drift', () => {
  const descriptor = descriptorManifest();
  const registry = new ExecutionDescriptorRegistry(descriptorRegistry([descriptor]));

  const changedEffect = validNode(descriptor);
  changedEffect.effectProfile.flags = ['sensitive_data'];
  assert.throws(
    () => registry.validateMaterializedNode(changedEffect),
    (error) => error.code === 'execution_descriptor_effect_profile_mismatch'
  );

  const changedEgress = validNode(descriptor);
  changedEgress.dataEgressProfile.mode = 'internal_only';
  assert.throws(
    () => registry.validateMaterializedNode(changedEgress),
    (error) => error.code === 'execution_descriptor_data_egress_profile_mismatch'
  );

  const changedOutput = validNode(descriptor);
  changedOutput.expectedOutputSchemaHash = 'f'.repeat(64);
  assert.throws(
    () => registry.validateMaterializedNode(changedOutput),
    (error) => error.code === 'execution_descriptor_output_schema_mismatch'
  );
});

test('rejects every effective limit that exceeds descriptor authority', () => {
  const descriptor = descriptorManifest();
  const registry = new ExecutionDescriptorRegistry(descriptorRegistry([descriptor]));
  const cases = [
    ['maximumTurns', 9],
    ['maximumTokens', 16_001],
    ['maximumToolCalls', 5],
    ['maximumRuntimeSeconds', 121],
    ['maximumAttempts', 3],
  ];
  for (const [field, value] of cases) {
    const node = validNode(descriptor);
    node.limits[field] = value;
    assert.throws(
      () => registry.validateMaterializedNode(node),
      (error) =>
        error.code === 'execution_descriptor_limit_exceeded' && error.details.dimension === field
    );
  }

  const forbiddenCost = validNode(descriptor);
  forbiddenCost.limits.maximumCostMinor = 1;
  assert.throws(
    () => registry.validateMaterializedNode(forbiddenCost),
    (error) => error.code === 'execution_descriptor_cost_forbidden'
  );
});

test('bounded cost policy requires matching currency and amount ceiling', () => {
  const descriptor = descriptorManifest({
    limitPolicy: {
      maximumTurns: 8,
      maximumTokens: 16_000,
      maximumToolCalls: 4,
      maximumRuntimeSeconds: 120,
      cost: { mode: 'bounded', maximumCostMinor: 500, currency: 'EUR' },
    },
  });
  const registry = new ExecutionDescriptorRegistry(descriptorRegistry([descriptor]));
  const allowed = validNode(descriptor);
  allowed.limits.maximumCostMinor = 500;
  assert.equal(registry.validateMaterializedNode(allowed).node.limits.maximumCostMinor, 500);

  const wrongCurrency = validNode(descriptor);
  wrongCurrency.limits.maximumCostMinor = 100;
  wrongCurrency.limits.currency = 'USD';
  assert.throws(
    () => registry.validateMaterializedNode(wrongCurrency),
    (error) => error.code === 'execution_descriptor_cost_currency_mismatch'
  );

  const overBudget = validNode(descriptor);
  overBudget.limits.maximumCostMinor = 501;
  assert.throws(
    () => registry.validateMaterializedNode(overBudget),
    (error) =>
      error.code === 'execution_descriptor_limit_exceeded' &&
      error.details.dimension === 'maximumCostMinor'
  );
});

test('an external descriptor pins the exact reconciliation and compensation policies', () => {
  const reconciliationPolicy = { strategy: 'manual', lookupOperation: null };
  const compensationPolicy = { strategy: 'none', operation: null };
  const descriptor = descriptorManifest({
    stepKind: 'connector_write',
    effectProfile: { externality: 'write', mutation: 'create', flags: [] },
    dataEgressProfile: {
      mode: 'policy_bound_external',
      destinationClasses: ['messaging_provider'],
      providerClasses: ['approved_provider'],
      regionClasses: ['eu'],
      permittedInputClassifications: ['internal'],
      permittedOutputClassifications: ['internal'],
      redactionRequired: true,
      dlpRequired: true,
      providerRetentionPolicyRequired: true,
      providerTrainingPolicyRequired: true,
    },
    reconciliationPolicy,
    compensationPolicy,
  });
  const registry = new ExecutionDescriptorRegistry(descriptorRegistry([descriptor]));
  const node = validNode(descriptor);
  node.stepKind = descriptor.stepKind;
  node.externalAction = {
    version: 'orqaly_external_action_spec_v1',
    effectId: '88888888-8888-4888-8888-888888888888',
    providerOperation: {
      contractVersion: '1.0',
      operationKey: 'send_message',
      operationVersion: '1.0',
      contentHash: '1'.repeat(64),
    },
    connection: {
      connectionReference: 'connection-1',
      providerKey: 'messaging_provider',
      credentialOwnerPrincipalId: 'principal-1',
      requestedScopes: ['messages.write'],
    },
    targets: [
      {
        targetType: 'phone_number',
        targetReference: 'phone:recipient-1',
        targetHash: null,
      },
    ],
    externalPreconditions: [],
    idempotency: { scope: 'message_send', key: 'effect-1' },
    reconciliation: structuredClone(reconciliationPolicy),
    compensation: structuredClone(compensationPolicy),
  };

  const resolution = registry.validateMaterializedNode(node);
  assert.deepEqual(resolution.effectivePolicy.reconciliationPolicy, reconciliationPolicy);
  assert.deepEqual(resolution.effectivePolicy.compensationPolicy, compensationPolicy);

  const changedReconciliation = structuredClone(node);
  changedReconciliation.externalAction.reconciliation.strategy = 'provider_idempotency';
  assert.throws(
    () => registry.validateMaterializedNode(changedReconciliation),
    (error) => error.code === 'execution_descriptor_reconciliation_policy_mismatch'
  );

  const changedCompensation = structuredClone(node);
  changedCompensation.externalAction.compensation.strategy = 'manual';
  assert.throws(
    () => registry.validateMaterializedNode(changedCompensation),
    (error) => error.code === 'execution_descriptor_compensation_policy_mismatch'
  );
});

test('descriptor policy invariants reject unsafe retry, recovery and timeout combinations', () => {
  const writeDescriptor = descriptorManifest({
    stepKind: 'connector_write',
    effectProfile: { externality: 'write', mutation: 'update', flags: [] },
    reconciliationPolicy: null,
  });
  assert.equal(ExecutionDescriptorManifestV1Schema.safeParse(writeDescriptor).success, false);

  const impossibleTimeout = descriptorManifest({
    defaultTimeoutSeconds: 121,
  });
  assert.equal(ExecutionDescriptorManifestV1Schema.safeParse(impossibleTimeout).success, false);

  const impossibleRetry = descriptorManifest({
    retryPolicy: 'never',
    maximumAttempts: 2,
  });
  assert.equal(ExecutionDescriptorManifestV1Schema.safeParse(impossibleRetry).success, false);

  const oversizedTimeout = descriptorManifest({
    defaultTimeoutSeconds: 86_401,
    limitPolicy: {
      maximumTurns: 8,
      maximumTokens: 16_000,
      maximumToolCalls: 4,
      maximumRuntimeSeconds: 86_400,
      cost: { mode: 'forbidden' },
    },
  });
  assert.equal(ExecutionDescriptorManifestV1Schema.safeParse(oversizedTimeout).success, false);
});
