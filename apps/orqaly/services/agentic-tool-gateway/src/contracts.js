import { z } from 'zod';
import { canonicalJsonSha256 } from './canonical.js';

const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const DateTime = z.string().datetime({ offset: true });
const TenantId = z.string().uuid();
const Opaque = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/);
const CanonicalKey = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);

const DescriptorReference = z
  .object({
    contractVersion: z.literal('1.0'),
    descriptorKey: z.literal('operational_record_create_v1'),
    schemaVersion: z.literal('1.0'),
    contentHash: Hash,
  })
  .strict();

const ExecutorBindingReference = z
  .object({
    contractVersion: z.literal('1.0'),
    bindingKey: z.literal('tool_gateway_connector_v1'),
    bindingVersion: z.literal('1.0'),
    contentHash: Hash,
  })
  .strict();

const EffectProfile = z
  .object({
    externality: z.literal('write'),
    mutation: z.literal('create'),
    flags: z.array(z.never()).length(0),
  })
  .strict();

const DataEgressProfile = z
  .object({
    mode: z.literal('internal_only'),
    destinationClasses: z.array(z.literal('orqaly_private_tool_gateway')).length(1),
    providerClasses: z.array(z.never()).length(0),
    regionClasses: z.array(z.literal('eu')).length(1),
    permittedInputClassifications: z.array(z.literal('internal')).length(1),
    permittedOutputClassifications: z.array(z.literal('internal')).length(1),
    redactionRequired: z.literal(false),
    dlpRequired: z.literal(false),
    providerRetentionPolicyRequired: z.literal(false),
    providerTrainingPolicyRequired: z.literal(false),
  })
  .strict();

const OperationalRecordInput = z
  .object({
    title: z.string().trim().min(1).max(120),
    details: z.string().trim().min(1).max(2_000).nullable().optional(),
  })
  .strict();

const Target = z
  .object({
    targetType: z.literal('operational_record_store'),
    targetReference: Opaque,
    targetHash: z.null(),
  })
  .strict();

const GatewayGrant = z
  .object({
    version: z.literal('orqaly_gateway_grant_reference_v1'),
    reference: Opaque,
    scopeHash: Hash,
    audience: z.string().url(),
    issuedAt: DateTime,
    expiresAt: DateTime,
  })
  .strict();

export const ConnectorRequestSchema = z
  .object({
    version: z.literal('orqaly_n8n_connector_request_v1'),
    contractVersion: z.literal('1.0'),
    canonicalization: z.literal('rfc8785_v1'),
    organizationId: TenantId,
    workspaceId: Opaque,
    runId: z.string().uuid(),
    stepId: z.string().uuid(),
    attemptId: z.string().uuid(),
    stepKind: z.literal('connector_write'),
    actionIntentId: z.string().uuid(),
    actionIntentHash: Hash,
    effectId: z.string().uuid(),
    descriptor: DescriptorReference,
    executorBinding: ExecutorBindingReference,
    canonicalInput: OperationalRecordInput,
    canonicalInputHash: Hash,
    effectProfile: EffectProfile,
    dataEgressProfile: DataEgressProfile,
    deadline: DateTime,
    policyDigest: Hash,
    approvalBindingHash: Hash,
    idempotencyScope: z.literal('logical_effect'),
    idempotencyKey: Opaque,
    targets: z.array(Target).length(1),
    externalPreconditions: z.array(z.never()).length(0),
    connectionReference: Opaque,
    gatewayGrant: GatewayGrant,
  })
  .strict()
  .superRefine((request, context) => {
    if (canonicalJsonSha256(request.canonicalInput) !== request.canonicalInputHash) {
      context.addIssue({
        code: 'custom',
        path: ['canonicalInputHash'],
        message: 'canonical input hash mismatch',
      });
    }
    if (gatewayGrantScopeV1Hash(request) !== request.gatewayGrant.scopeHash) {
      context.addIssue({
        code: 'custom',
        path: ['gatewayGrant', 'scopeHash'],
        message: 'grant scope hash mismatch',
      });
    }
    const issuedAt = new Date(request.gatewayGrant.issuedAt).valueOf();
    const expiresAt = new Date(request.gatewayGrant.expiresAt).valueOf();
    if (expiresAt <= issuedAt || expiresAt - issuedAt > 300_000) {
      context.addIssue({
        code: 'custom',
        path: ['gatewayGrant', 'expiresAt'],
        message: 'grant lifetime invalid',
      });
    }
    if (expiresAt > new Date(request.deadline).valueOf()) {
      context.addIssue({
        code: 'custom',
        path: ['gatewayGrant', 'expiresAt'],
        message: 'grant outlives execution deadline',
      });
    }
    if (request.targets[0]?.targetReference !== `operational-record:${request.effectId}`) {
      context.addIssue({
        code: 'custom',
        path: ['targets', 0, 'targetReference'],
        message: 'effect target identity mismatch',
      });
    }
  });

export function gatewayGrantScopeHashPayloadV1(authority) {
  return {
    version: 'orqaly_gateway_grant_scope_v1',
    canonicalization: authority.canonicalization,
    organizationId: authority.organizationId,
    workspaceId: authority.workspaceId,
    runId: authority.runId,
    stepId: authority.stepId,
    stepKind: authority.stepKind,
    actionIntentId: authority.actionIntentId,
    actionIntentHash: authority.actionIntentHash,
    effectId: authority.effectId,
    descriptor: authority.descriptor,
    executorBinding: authority.executorBinding,
    canonicalInputHash: authority.canonicalInputHash,
    effectProfile: authority.effectProfile,
    dataEgressProfile: authority.dataEgressProfile,
    deadline: authority.deadline,
    policyDigest: authority.policyDigest,
    approvalBindingHash: authority.approvalBindingHash,
    idempotencyScope: authority.idempotencyScope,
    idempotencyKey: authority.idempotencyKey,
    targets: authority.targets,
    externalPreconditions: authority.externalPreconditions,
    connectionReference: authority.connectionReference,
    gatewayAudience: authority.gatewayGrant?.audience,
    grantIssuedAt: authority.gatewayGrant?.issuedAt,
    grantExpiresAt: authority.gatewayGrant?.expiresAt,
  };
}

export function gatewayGrantScopeV1Hash(authority) {
  return canonicalJsonSha256(gatewayGrantScopeHashPayloadV1(authority));
}

export function parseConnectorRequest(raw, config, now = new Date()) {
  const request = ConnectorRequestSchema.parse(raw);
  if (request.descriptor.contentHash !== config.OPERATIONAL_RECORD_DESCRIPTOR_HASH) {
    throw new Error('descriptor_hash_not_allowlisted');
  }
  if (request.executorBinding.contentHash !== config.N8N_EXECUTOR_BINDING_HASH) {
    throw new Error('executor_binding_hash_not_allowlisted');
  }
  if (request.connectionReference !== config.TOOL_GATEWAY_CONNECTION_REFERENCE) {
    throw new Error('connection_reference_not_allowlisted');
  }
  if (request.gatewayGrant.audience !== config.TOOL_GATEWAY_AUDIENCE) {
    throw new Error('gateway_audience_mismatch');
  }
  const observed = new Date(now).valueOf();
  if (
    !Number.isFinite(observed) ||
    new Date(request.gatewayGrant.issuedAt).valueOf() > observed + 30_000 ||
    new Date(request.gatewayGrant.expiresAt).valueOf() <= observed ||
    new Date(request.deadline).valueOf() <= observed
  ) {
    throw new Error('request_authority_expired_or_not_yet_valid');
  }
  return request;
}

export const DispatchReceiptSchema = z
  .object({
    version: z.literal('orqaly_dispatch_receipt_v1'),
    contractVersion: z.literal('1.0'),
    organizationId: Opaque,
    workspaceId: Opaque,
    runId: z.string().uuid(),
    stepId: z.string().uuid(),
    attemptId: z.string().uuid(),
    descriptor: DescriptorReference,
    executorBinding: ExecutorBindingReference,
    status: z.literal('succeeded'),
    observedAt: DateTime,
    executorReference: Opaque,
    effectId: z.string().uuid(),
    gatewayEffectAttestation: z.record(z.string(), z.unknown()),
    errorCode: z.null(),
    sanitizedError: z.null(),
  })
  .strict();

export { Hash, CanonicalKey };
