import { z } from 'zod';
import { CANONICALIZATION_ALGORITHM, canonicalJson, canonicalJsonSha256 } from './canonical.js';
import {
  CompensationPolicyV1Schema,
  DataEgressProfileV2Schema,
  DescriptorVersionRefV2Schema,
  EffectProfileV2Schema,
  ExecutionPlanNodeV2Schema,
  ExecutorBindingVersionRefV2Schema,
  HashSchema,
  ReconciliationPolicyV1Schema,
} from './execution-contracts.js';
import { STEP_KINDS } from './contracts.js';

const ForbiddenCostPolicySchema = z
  .object({
    mode: z.literal('forbidden'),
  })
  .strict();
const BoundedCostPolicySchema = z
  .object({
    mode: z.literal('bounded'),
    maximumCostMinor: z.number().int().safe().min(0),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();

export const DescriptorExecutionLimitPolicyV1Schema = z
  .object({
    maximumTurns: z.number().int().min(1).max(1_000),
    maximumTokens: z.number().int().min(1).max(100_000_000),
    maximumToolCalls: z.number().int().min(0).max(10_000),
    maximumRuntimeSeconds: z.number().int().min(1).max(86_400),
    cost: z.discriminatedUnion('mode', [ForbiddenCostPolicySchema, BoundedCostPolicySchema]),
  })
  .strict();

function bindingIdentity(binding) {
  return `${binding.bindingKey}:${binding.bindingVersion}:${binding.contentHash}`;
}

function descriptorIdentity(reference) {
  return `${reference.descriptorKey}:${reference.schemaVersion}:${reference.contentHash}`;
}

const ExecutionDescriptorManifestV1ShapeSchema = z
  .object({
    version: z.literal('orqaly_execution_descriptor_manifest_v1'),
    contractVersion: z.literal('1.0'),
    canonicalization: z.literal(CANONICALIZATION_ALGORITHM),
    reference: DescriptorVersionRefV2Schema,
    stepKind: z.enum(STEP_KINDS),
    effectProfile: EffectProfileV2Schema,
    dataEgressProfile: DataEgressProfileV2Schema,
    inputSchemaHash: HashSchema,
    outputSchemaHash: HashSchema,
    supportedExecutorBindings: z.array(ExecutorBindingVersionRefV2Schema).min(1).max(50),
    approvalPolicy: z.enum(['never', 'policy', 'always']),
    retryPolicy: z.enum(['never', 'pre_acceptance_only']),
    reconciliationPolicy: ReconciliationPolicyV1Schema.nullable(),
    compensationPolicy: CompensationPolicyV1Schema.nullable(),
    maximumAttempts: z.number().int().min(1).max(10),
    defaultTimeoutSeconds: z.number().int().min(1).max(86_400),
    limitPolicy: DescriptorExecutionLimitPolicyV1Schema,
  })
  .strict()
  .superRefine((descriptor, context) => {
    const bindingIdentities = descriptor.supportedExecutorBindings.map(bindingIdentity);
    const canonicalBindings = [...new Set(bindingIdentities)].sort();
    if (
      canonicalBindings.length !== bindingIdentities.length ||
      canonicalBindings.some((value, index) => value !== bindingIdentities[index])
    ) {
      context.addIssue({
        code: 'custom',
        path: ['supportedExecutorBindings'],
        message: 'supported executor bindings must be sorted and unique',
      });
    }
    if (
      descriptor.stepKind === 'connector_read' &&
      descriptor.effectProfile.externality !== 'read'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['effectProfile', 'externality'],
        message: 'connector_read descriptors require read externality',
      });
    }
    if (
      descriptor.stepKind === 'connector_write' &&
      descriptor.effectProfile.externality !== 'write'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['effectProfile', 'externality'],
        message: 'connector_write descriptors require write externality',
      });
    }
    const isExternal = descriptor.effectProfile.externality !== 'none';
    if (isExternal && descriptor.reconciliationPolicy === null) {
      context.addIssue({
        code: 'custom',
        path: ['reconciliationPolicy'],
        message: 'external descriptors require a reconciliation policy',
      });
    }
    if (isExternal && descriptor.compensationPolicy === null) {
      context.addIssue({
        code: 'custom',
        path: ['compensationPolicy'],
        message: 'external descriptors require a compensation policy',
      });
    }
    if (!isExternal && descriptor.reconciliationPolicy !== null) {
      context.addIssue({
        code: 'custom',
        path: ['reconciliationPolicy'],
        message: 'local descriptors cannot declare external reconciliation',
      });
    }
    if (!isExternal && descriptor.compensationPolicy !== null) {
      context.addIssue({
        code: 'custom',
        path: ['compensationPolicy'],
        message: 'local descriptors cannot declare external compensation',
      });
    }
    if (descriptor.retryPolicy === 'never' && descriptor.maximumAttempts !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['maximumAttempts'],
        message: 'a no-retry descriptor must permit exactly one attempt',
      });
    }
    if (descriptor.defaultTimeoutSeconds > descriptor.limitPolicy.maximumRuntimeSeconds) {
      context.addIssue({
        code: 'custom',
        path: ['defaultTimeoutSeconds'],
        message: 'default timeout cannot exceed the descriptor runtime ceiling',
      });
    }
  });

export function executionDescriptorHashPayload(descriptor) {
  const { reference, ...policy } = descriptor;
  const { contentHash: _contentHash, ...referenceIdentity } = reference;
  return { ...policy, reference: referenceIdentity };
}

export function executionDescriptorContentHash(descriptor) {
  return canonicalJsonSha256(executionDescriptorHashPayload(descriptor));
}

export const ExecutionDescriptorManifestV1Schema =
  ExecutionDescriptorManifestV1ShapeSchema.superRefine((descriptor, context) => {
    if (executionDescriptorContentHash(descriptor) !== descriptor.reference.contentHash) {
      context.addIssue({
        code: 'custom',
        path: ['reference', 'contentHash'],
        message: 'descriptor content hash does not match RFC 8785 manifest bytes',
      });
    }
  });

export const ExecutionDescriptorRegistryV1Schema = z
  .object({
    version: z.literal('orqaly_execution_descriptor_registry_v1'),
    canonicalization: z.literal(CANONICALIZATION_ALGORITHM),
    registryHash: HashSchema,
    descriptors: z.array(ExecutionDescriptorManifestV1ShapeSchema).max(10_000),
  })
  .strict();

export function executionDescriptorRegistryHashPayload(registry) {
  const { registryHash: _registryHash, ...payload } = registry;
  return payload;
}

export function executionDescriptorRegistryContentHash(registry) {
  return canonicalJsonSha256(executionDescriptorRegistryHashPayload(registry));
}

export class ExecutionDescriptorRegistryError extends Error {
  constructor(code, details = undefined) {
    super(code);
    this.name = 'ExecutionDescriptorRegistryError';
    this.code = code;
    this.details = details;
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function parseExecutionDescriptorRegistry(rawRegistry) {
  const registry = ExecutionDescriptorRegistryV1Schema.parse(rawRegistry);
  const identities = registry.descriptors.map((descriptor) =>
    descriptorIdentity(descriptor.reference)
  );
  if (new Set(identities).size !== identities.length) {
    throw new ExecutionDescriptorRegistryError('execution_descriptor_identity_duplicate');
  }
  const versionIdentities = registry.descriptors.map(
    (descriptor) => `${descriptor.reference.descriptorKey}:${descriptor.reference.schemaVersion}`
  );
  if (new Set(versionIdentities).size !== versionIdentities.length) {
    throw new ExecutionDescriptorRegistryError('execution_descriptor_version_redefined');
  }
  const canonicalIdentities = [...identities].sort();
  if (canonicalIdentities.some((value, index) => value !== identities[index])) {
    throw new ExecutionDescriptorRegistryError('execution_descriptors_not_canonical');
  }
  for (const descriptor of registry.descriptors) {
    if (executionDescriptorContentHash(descriptor) !== descriptor.reference.contentHash) {
      throw new ExecutionDescriptorRegistryError('execution_descriptor_content_hash_mismatch', {
        descriptorKey: descriptor.reference.descriptorKey,
        schemaVersion: descriptor.reference.schemaVersion,
      });
    }
  }
  if (executionDescriptorRegistryContentHash(registry) !== registry.registryHash) {
    throw new ExecutionDescriptorRegistryError('execution_descriptor_registry_hash_mismatch');
  }
  return deepFreeze(registry);
}

function exactMatch(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function limitExceeded(dimension, actual, maximum) {
  if (actual > maximum) {
    throw new ExecutionDescriptorRegistryError('execution_descriptor_limit_exceeded', {
      dimension,
      actual,
      maximum,
    });
  }
}

function validateLimits(node, descriptor) {
  const limits = node.limits;
  const policy = descriptor.limitPolicy;
  limitExceeded('maximumTurns', limits.maximumTurns, policy.maximumTurns);
  limitExceeded('maximumTokens', limits.maximumTokens, policy.maximumTokens);
  limitExceeded('maximumToolCalls', limits.maximumToolCalls, policy.maximumToolCalls);
  limitExceeded(
    'maximumRuntimeSeconds',
    limits.maximumRuntimeSeconds,
    policy.maximumRuntimeSeconds
  );
  limitExceeded('maximumAttempts', limits.maximumAttempts, descriptor.maximumAttempts);

  if (limits.maximumCostMinor === null || limits.currency === null) {
    throw new ExecutionDescriptorRegistryError('execution_descriptor_cost_limit_missing');
  }
  if (!Number.isSafeInteger(limits.maximumCostMinor)) {
    throw new ExecutionDescriptorRegistryError('execution_descriptor_cost_limit_unsafe');
  }
  if (policy.cost.mode === 'forbidden') {
    if (limits.maximumCostMinor !== 0) {
      throw new ExecutionDescriptorRegistryError('execution_descriptor_cost_forbidden');
    }
    return;
  }
  if (limits.currency !== policy.cost.currency) {
    throw new ExecutionDescriptorRegistryError('execution_descriptor_cost_currency_mismatch', {
      actual: limits.currency,
      expected: policy.cost.currency,
    });
  }
  limitExceeded('maximumCostMinor', limits.maximumCostMinor, policy.cost.maximumCostMinor);
}

export class ExecutionDescriptorRegistry {
  #byIdentity;

  constructor(rawRegistry) {
    this.snapshot = parseExecutionDescriptorRegistry(rawRegistry);
    this.#byIdentity = new Map(
      this.snapshot.descriptors.map((descriptor) => [
        descriptorIdentity(descriptor.reference),
        descriptor,
      ])
    );
    Object.defineProperty(this, 'snapshot', { writable: false, configurable: false });
  }

  resolve(rawReference) {
    const reference = DescriptorVersionRefV2Schema.parse(rawReference);
    const descriptor = this.#byIdentity.get(descriptorIdentity(reference));
    if (!descriptor) {
      throw new ExecutionDescriptorRegistryError('execution_descriptor_not_registered', {
        descriptorKey: reference.descriptorKey,
        schemaVersion: reference.schemaVersion,
        contentHash: reference.contentHash,
      });
    }
    return descriptor;
  }

  validateMaterializedNode(rawNode) {
    const node = ExecutionPlanNodeV2Schema.parse(rawNode);
    const descriptor = this.resolve(node.descriptor);
    if (node.stepKind !== descriptor.stepKind) {
      throw new ExecutionDescriptorRegistryError('execution_descriptor_step_kind_mismatch');
    }
    if (
      !descriptor.supportedExecutorBindings.some((binding) =>
        exactMatch(binding, node.executorBinding)
      )
    ) {
      throw new ExecutionDescriptorRegistryError(
        'execution_descriptor_executor_binding_not_supported'
      );
    }
    if (!exactMatch(node.effectProfile, descriptor.effectProfile)) {
      throw new ExecutionDescriptorRegistryError('execution_descriptor_effect_profile_mismatch');
    }
    if (!exactMatch(node.dataEgressProfile, descriptor.dataEgressProfile)) {
      throw new ExecutionDescriptorRegistryError(
        'execution_descriptor_data_egress_profile_mismatch'
      );
    }
    if (node.expectedOutputSchemaHash !== descriptor.outputSchemaHash) {
      throw new ExecutionDescriptorRegistryError('execution_descriptor_output_schema_mismatch');
    }
    if (
      node.externalAction !== undefined &&
      !exactMatch(node.externalAction.reconciliation, descriptor.reconciliationPolicy)
    ) {
      throw new ExecutionDescriptorRegistryError(
        'execution_descriptor_reconciliation_policy_mismatch'
      );
    }
    if (
      node.externalAction !== undefined &&
      !exactMatch(node.externalAction.compensation, descriptor.compensationPolicy)
    ) {
      throw new ExecutionDescriptorRegistryError(
        'execution_descriptor_compensation_policy_mismatch'
      );
    }
    validateLimits(node, descriptor);
    return deepFreeze({
      node,
      descriptor,
      effectivePolicy: {
        approvalPolicy: descriptor.approvalPolicy,
        retryPolicy: descriptor.retryPolicy,
        reconciliationPolicy: descriptor.reconciliationPolicy,
        compensationPolicy: descriptor.compensationPolicy,
        timeoutSeconds: Math.min(
          descriptor.defaultTimeoutSeconds,
          node.limits.maximumRuntimeSeconds
        ),
        maximumAttempts: node.limits.maximumAttempts,
      },
    });
  }
}

export function validateMaterializedPlanNodeAgainstDescriptorRegistry(rawRegistry, rawNode) {
  return new ExecutionDescriptorRegistry(rawRegistry).validateMaterializedNode(rawNode);
}
