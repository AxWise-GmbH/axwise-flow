import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { CANONICALIZATION_ALGORITHM, canonicalJson, canonicalJsonSha256 } from './canonical.js';
import { STEP_KINDS } from './contracts.js';
import {
  DataEgressProfileV2Schema,
  DescriptorVersionRefV2Schema,
  EffectProfileV2Schema,
  ExecutionLimitsV2Schema,
  ExecutorBindingVersionRefV2Schema,
  PersonaVersionRefV2Schema,
} from './execution-contracts.js';
import {
  ActionIntentV1Schema,
  ApprovalSubjectV1Schema,
  approvalSubjectV1Hash,
} from './approval-contracts.js';

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const OpaqueReferenceSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/);
const CanonicalKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
const DateTimeSchema = z.string().datetime({ offset: true });
const JsonObjectSchema = z.record(z.string(), z.unknown());
const HttpsAudienceSchema = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => new URL(value).protocol === 'https:', 'Gateway audience must use HTTPS');
const CONNECTOR_CREDENTIAL_KEYS = new Set([
  'accesstoken',
  'apikey',
  'apitoken',
  'authorization',
  'authtoken',
  'bearertoken',
  'clientsecret',
  'cookie',
  'credential',
  'credentials',
  'idtoken',
  'password',
  'privatekey',
  'refreshtoken',
  'secret',
  'sessiontoken',
]);
const CONNECTOR_PRIVATE_EXECUTION_KEYS = new Set([
  'agent',
  'agentid',
  'agentids',
  'agentidentity',
  'agentprofile',
  'agentreference',
  'agentreferences',
  'agents',
  'agentversion',
  'artifact',
  'artifactid',
  'artifactids',
  'artifactreference',
  'artifactreferences',
  'artifacts',
  'callback',
  'callbackendpoint',
  'callbackid',
  'callbackreference',
  'callbackreferences',
  'callbacks',
  'callbackuri',
  'callbackurl',
  'delegatedagentid',
  'executionenvelope',
  'executionenvelopereference',
  'executionenvelopes',
  'executionlimit',
  'executionlimits',
  'executorpersona',
  'executorpersonas',
  'executorpersonaversion',
  'impersonatedagent',
  'limits',
  'maximumattempts',
  'maximumcostminor',
  'maximumruntime',
  'maximumruntimeseconds',
  'maximumtokens',
  'maximumtoolcalls',
  'maximumturns',
  'parentagentid',
  'persona',
  'personaid',
  'personas',
  'personareference',
  'personaversion',
  'principal',
  'principalid',
  'principals',
  'privateexecutionenvelope',
  'reasoninglimit',
  'reasoninglimits',
  'sealedcontext',
  'sealedcontextid',
  'sealedcontextreference',
  'sealedcontextreferences',
  'sealedcontexts',
]);

export const GATEWAY_GRANT_MAX_LIFETIME_SECONDS = 300;

export const N8N_CONNECTOR_REQUEST_FIELDS = Object.freeze([
  'version',
  'contractVersion',
  'canonicalization',
  'organizationId',
  'workspaceId',
  'runId',
  'stepId',
  'attemptId',
  'stepKind',
  'actionIntentId',
  'actionIntentHash',
  'effectId',
  'descriptor',
  'executorBinding',
  'canonicalInput',
  'canonicalInputHash',
  'effectProfile',
  'dataEgressProfile',
  'deadline',
  'policyDigest',
  'approvalBindingHash',
  'idempotencyScope',
  'idempotencyKey',
  'targets',
  'externalPreconditions',
  'connectionReference',
  'gatewayGrant',
]);

function normalizedConnectorKey(key) {
  return key
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, '');
}

function jsonPointerSegment(key) {
  return key.replaceAll('~', '~0').replaceAll('/', '~1');
}

function connectorForbiddenKeyPaths(value, forbiddenKeys, path = '') {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      connectorForbiddenKeyPaths(item, forbiddenKeys, `${path}/${index}`)
    );
  }
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value)
    .sort()
    .flatMap((key) => {
      const itemPath = `${path}/${jsonPointerSegment(key)}`;
      const ownMatch = forbiddenKeys.has(normalizedConnectorKey(key)) ? [itemPath] : [];
      return [...ownMatch, ...connectorForbiddenKeyPaths(value[key], forbiddenKeys, itemPath)];
    });
}

function connectorCredentialPaths(value) {
  return connectorForbiddenKeyPaths(value, CONNECTOR_CREDENTIAL_KEYS);
}

function connectorPrivateExecutionPaths(value) {
  return connectorForbiddenKeyPaths(value, CONNECTOR_PRIVATE_EXECUTION_KEYS);
}

function uniqueObjects(schema, maximum, identity, message) {
  return z
    .array(schema)
    .max(maximum)
    .default([])
    .superRefine((items, context) => {
      const values = items.map(identity);
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: 'custom', message });
      }
    });
}

const ContentReferenceSchema = z
  .object({
    referenceId: OpaqueReferenceSchema,
    contentHash: HashSchema,
    mediaType: z.string().min(1).max(255).nullable().default(null),
  })
  .strict();
const EffectTargetSchema = z
  .object({
    targetType: CanonicalKeySchema,
    targetReference: OpaqueReferenceSchema,
    targetHash: HashSchema.nullable().default(null),
  })
  .strict();
const ExternalPreconditionSchema = z
  .object({
    preconditionType: CanonicalKeySchema,
    targetReference: OpaqueReferenceSchema,
    expectedStateHash: HashSchema,
  })
  .strict();
const ExternalObjectReferenceSchema = z
  .object({
    referenceType: CanonicalKeySchema,
    referenceValue: OpaqueReferenceSchema,
  })
  .strict();
const ObservedCostSchema = z
  .object({
    amountMinor: z.number().int().min(0),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();

export const GatewayGrantReferenceV1Schema = z
  .object({
    version: z.literal('orqaly_gateway_grant_reference_v1'),
    reference: OpaqueReferenceSchema,
    scopeHash: HashSchema,
    audience: HttpsAudienceSchema,
    issuedAt: DateTimeSchema,
    expiresAt: DateTimeSchema,
  })
  .strict()
  .superRefine((grant, context) => {
    const lifetimeMilliseconds = new Date(grant.expiresAt) - new Date(grant.issuedAt);
    if (lifetimeMilliseconds <= 0) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'Gateway grant expiry must be after issue time',
      });
    }
    if (lifetimeMilliseconds > GATEWAY_GRANT_MAX_LIFETIME_SECONDS * 1_000) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'Gateway grant lifetime exceeds the five-minute maximum',
      });
    }
  });

/**
 * The broker and Tool Gateway independently hash this exact authority scope.
 * The opaque grant reference is intentionally excluded: it points to the
 * broker-side grant record, while this digest proves what that record may do.
 */
export function gatewayGrantScopeHashPayloadV1(authority) {
  const connectionReference = authority.connectionReference ?? authority.connectionReferences?.[0];
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
    connectionReference,
    gatewayAudience: authority.gatewayGrant?.audience,
    grantIssuedAt: authority.gatewayGrant?.issuedAt,
    grantExpiresAt: authority.gatewayGrant?.expiresAt,
  };
}

export function gatewayGrantScopeV1Hash(authority) {
  return canonicalJsonSha256(gatewayGrantScopeHashPayloadV1(authority));
}

export const ExecutionEnvelopeV1Schema = z
  .object({
    version: z.literal('orqaly_execution_envelope_v1'),
    contractVersion: z.literal('1.0').default('1.0'),
    canonicalization: z.literal(CANONICALIZATION_ALGORITHM),
    organizationId: OpaqueReferenceSchema,
    workspaceId: OpaqueReferenceSchema,
    principalId: OpaqueReferenceSchema,
    agentId: z.string().uuid(),
    personaVersion: PersonaVersionRefV2Schema,
    runId: z.string().uuid(),
    stepId: z.string().uuid(),
    attemptId: z.string().uuid(),
    stepKind: z.enum(STEP_KINDS),
    descriptor: DescriptorVersionRefV2Schema,
    executorBinding: ExecutorBindingVersionRefV2Schema,
    canonicalInput: JsonObjectSchema,
    canonicalInputHash: HashSchema,
    effectProfile: EffectProfileV2Schema,
    dataEgressProfile: DataEgressProfileV2Schema,
    sealedContextReferences: uniqueObjects(
      ContentReferenceSchema,
      100,
      (item) => `${item.referenceId}:${item.contentHash}`,
      'sealed context references must be unique'
    ),
    artifactReferences: uniqueObjects(
      ContentReferenceSchema,
      100,
      (item) => `${item.referenceId}:${item.contentHash}`,
      'artifact references must be unique'
    ),
    limits: ExecutionLimitsV2Schema,
    issuedAt: DateTimeSchema,
    deadline: DateTimeSchema,
    callbackReference: OpaqueReferenceSchema,
    policyDigest: HashSchema,
    actionIntentId: z.string().uuid().nullable().default(null),
    actionIntentHash: HashSchema.nullable().default(null),
    approvalBindingHash: HashSchema.nullable().default(null),
    idempotencyScope: CanonicalKeySchema.nullable().default(null),
    idempotencyKey: OpaqueReferenceSchema.nullable().default(null),
    effectId: z.string().uuid().nullable().default(null),
    targets: uniqueObjects(
      EffectTargetSchema,
      100,
      (item) => `${item.targetType}:${item.targetReference}:${item.targetHash || ''}`,
      'effect targets must be unique'
    ),
    externalPreconditions: uniqueObjects(
      ExternalPreconditionSchema,
      100,
      (item) => `${item.preconditionType}:${item.targetReference}:${item.expectedStateHash}`,
      'external preconditions must be unique'
    ),
    connectionReferences: z
      .array(OpaqueReferenceSchema)
      .max(50)
      .default([])
      .superRefine((items, context) => {
        const canonical = [...new Set(items)].sort();
        if (
          canonical.length !== items.length ||
          canonical.some((item, index) => item !== items[index])
        ) {
          context.addIssue({
            code: 'custom',
            message: 'connection references must be sorted and unique',
          });
        }
      }),
    gatewayGrant: GatewayGrantReferenceV1Schema.nullable().default(null),
  })
  .strict()
  .superRefine((envelope, context) => {
    if (canonicalJsonSha256(envelope.canonicalInput) !== envelope.canonicalInputHash) {
      context.addIssue({
        code: 'custom',
        path: ['canonicalInputHash'],
        message: 'canonical input hash does not match RFC 8785 input bytes',
      });
    }
    if (new Date(envelope.deadline) <= new Date(envelope.issuedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['deadline'],
        message: 'execution deadline must be after issue time',
      });
    }
    if ((envelope.idempotencyScope === null) !== (envelope.idempotencyKey === null)) {
      context.addIssue({
        code: 'custom',
        message: 'idempotency scope and key must be supplied together',
      });
    }
    if ((envelope.actionIntentId === null) !== (envelope.actionIntentHash === null)) {
      context.addIssue({
        code: 'custom',
        message: 'action intent ID and hash must be supplied together',
      });
    }
    if (envelope.stepKind === 'connector_read' && envelope.effectProfile.externality !== 'read') {
      context.addIssue({
        code: 'custom',
        path: ['effectProfile', 'externality'],
        message: 'connector_read execution requires read externality',
      });
    }
    if (envelope.stepKind === 'connector_write' && envelope.effectProfile.externality !== 'write') {
      context.addIssue({
        code: 'custom',
        path: ['effectProfile', 'externality'],
        message: 'connector_write execution requires write externality',
      });
    }
    const externalAuthorityPresent =
      envelope.effectId !== null ||
      envelope.targets.length > 0 ||
      envelope.externalPreconditions.length > 0 ||
      envelope.connectionReferences.length > 0 ||
      envelope.gatewayGrant !== null ||
      envelope.idempotencyKey !== null ||
      envelope.actionIntentId !== null ||
      envelope.approvalBindingHash !== null;
    if (envelope.effectProfile.externality === 'none' && externalAuthorityPresent) {
      context.addIssue({
        code: 'custom',
        message: 'a non-external step cannot carry external authority fields',
      });
    }
    const requiresGatewayAuthority = envelope.effectProfile.externality !== 'none';
    if (requiresGatewayAuthority) {
      if (envelope.effectId === null) {
        context.addIssue({
          code: 'custom',
          path: ['effectId'],
          message: 'external execution requires an effect ID',
        });
      }
      if (envelope.connectionReferences.length !== 1) {
        context.addIssue({
          code: 'custom',
          path: ['connectionReferences'],
          message: 'external execution requires exactly one opaque provider connection reference',
        });
      }
      if (envelope.gatewayGrant === null) {
        context.addIssue({
          code: 'custom',
          path: ['gatewayGrant'],
          message: 'external execution requires a scoped short-lived Gateway grant',
        });
      } else {
        if (new Date(envelope.gatewayGrant.issuedAt) < new Date(envelope.issuedAt)) {
          context.addIssue({
            code: 'custom',
            path: ['gatewayGrant', 'issuedAt'],
            message: 'Gateway grant cannot predate the execution envelope',
          });
        }
        if (new Date(envelope.gatewayGrant.expiresAt) > new Date(envelope.deadline)) {
          context.addIssue({
            code: 'custom',
            path: ['gatewayGrant', 'expiresAt'],
            message: 'Gateway grant cannot outlive the execution deadline',
          });
        }
        if (
          envelope.connectionReferences.length === 1 &&
          envelope.gatewayGrant.scopeHash !== gatewayGrantScopeV1Hash(envelope)
        ) {
          context.addIssue({
            code: 'custom',
            path: ['gatewayGrant', 'scopeHash'],
            message: 'Gateway grant scope does not match the exact external authority',
          });
        }
      }
      if (envelope.idempotencyKey === null) {
        context.addIssue({
          code: 'custom',
          path: ['idempotencyKey'],
          message: 'external execution requires an idempotency binding',
        });
      }
    }
    if (envelope.effectProfile.externality === 'write') {
      if (!envelope.targets.length) {
        context.addIssue({ code: 'custom', path: ['targets'], message: 'write requires a target' });
      }
      if (envelope.approvalBindingHash === null) {
        context.addIssue({
          code: 'custom',
          path: ['approvalBindingHash'],
          message: 'write requires an exact approval binding',
        });
      }
    }
    if (envelope.effectProfile.externality !== 'none' && envelope.actionIntentId === null) {
      context.addIssue({
        code: 'custom',
        path: ['actionIntentId'],
        message: 'external execution requires an immutable action intent binding',
      });
    }
    if (envelope.externalPreconditions.length && envelope.effectProfile.externality !== 'write') {
      context.addIssue({
        code: 'custom',
        path: ['externalPreconditions'],
        message: 'external preconditions are valid only for writes',
      });
    }
    if (envelope.stepKind === 'retrieve' && envelope.effectProfile.externality !== 'none') {
      context.addIssue({
        code: 'custom',
        path: ['effectProfile', 'externality'],
        message: 'public evidence retrieval is a non-connector retrieve step',
      });
    }
  });

export const N8nConnectorRequestV1Schema = z
  .object({
    version: z.literal('orqaly_n8n_connector_request_v1'),
    contractVersion: z.literal('1.0').default('1.0'),
    canonicalization: z.literal(CANONICALIZATION_ALGORITHM),
    organizationId: OpaqueReferenceSchema,
    workspaceId: OpaqueReferenceSchema,
    runId: z.string().uuid(),
    stepId: z.string().uuid(),
    attemptId: z.string().uuid(),
    stepKind: z.enum(['connector_read', 'connector_write', 'notify']),
    actionIntentId: z.string().uuid(),
    actionIntentHash: HashSchema,
    effectId: z.string().uuid(),
    descriptor: DescriptorVersionRefV2Schema,
    executorBinding: ExecutorBindingVersionRefV2Schema,
    canonicalInput: JsonObjectSchema,
    canonicalInputHash: HashSchema,
    effectProfile: EffectProfileV2Schema,
    dataEgressProfile: DataEgressProfileV2Schema,
    deadline: DateTimeSchema,
    policyDigest: HashSchema,
    approvalBindingHash: HashSchema.nullable(),
    idempotencyScope: CanonicalKeySchema,
    idempotencyKey: OpaqueReferenceSchema,
    targets: uniqueObjects(
      EffectTargetSchema,
      100,
      (item) => `${item.targetType}:${item.targetReference}:${item.targetHash || ''}`,
      'effect targets must be unique'
    ),
    externalPreconditions: uniqueObjects(
      ExternalPreconditionSchema,
      100,
      (item) => `${item.preconditionType}:${item.targetReference}:${item.expectedStateHash}`,
      'external preconditions must be unique'
    ),
    connectionReference: OpaqueReferenceSchema,
    gatewayGrant: GatewayGrantReferenceV1Schema,
  })
  .strict()
  .superRefine((request, context) => {
    const credentialPaths = connectorCredentialPaths(request.canonicalInput);
    if (credentialPaths.length) {
      context.addIssue({
        code: 'custom',
        path: ['canonicalInput'],
        message: `provider credential fields are forbidden in connector input: ${credentialPaths.join(', ')}`,
      });
    }
    const privateExecutionPaths = connectorPrivateExecutionPaths(request.canonicalInput);
    if (privateExecutionPaths.length) {
      context.addIssue({
        code: 'custom',
        path: ['canonicalInput'],
        message: `private execution fields are forbidden in connector input: ${privateExecutionPaths.join(', ')}`,
      });
    }
    if (canonicalJsonSha256(request.canonicalInput) !== request.canonicalInputHash) {
      context.addIssue({
        code: 'custom',
        path: ['canonicalInputHash'],
        message: 'canonical input hash does not match RFC 8785 input bytes',
      });
    }
    if (request.stepKind === 'connector_read' && request.effectProfile.externality !== 'read') {
      context.addIssue({
        code: 'custom',
        path: ['effectProfile', 'externality'],
        message: 'connector_read request requires read externality',
      });
    }
    if (
      ['connector_write', 'notify'].includes(request.stepKind) &&
      request.effectProfile.externality !== 'write'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['effectProfile', 'externality'],
        message: 'connector_write and external notify requests require write externality',
      });
    }
    if (request.effectProfile.externality === 'write' && request.approvalBindingHash === null) {
      context.addIssue({
        code: 'custom',
        path: ['approvalBindingHash'],
        message: 'external write request requires an exact approval binding',
      });
    }
    if (new Date(request.gatewayGrant.expiresAt) > new Date(request.deadline)) {
      context.addIssue({
        code: 'custom',
        path: ['gatewayGrant', 'expiresAt'],
        message: 'Gateway grant cannot outlive the execution deadline',
      });
    }
    if (request.gatewayGrant.scopeHash !== gatewayGrantScopeV1Hash(request)) {
      context.addIssue({
        code: 'custom',
        path: ['gatewayGrant', 'scopeHash'],
        message: 'Gateway grant scope does not match the projected connector authority',
      });
    }
  });

export function projectN8nConnectorRequestV1(rawEnvelope) {
  const envelope = ExecutionEnvelopeV1Schema.parse(rawEnvelope);
  if (!['connector_read', 'connector_write', 'notify'].includes(envelope.stepKind)) {
    throw new Error('n8n_step_kind_not_supported');
  }
  if (envelope.stepKind === 'notify' && envelope.effectProfile.externality !== 'write') {
    throw new Error('internal_notification_does_not_use_n8n');
  }
  return N8nConnectorRequestV1Schema.parse({
    version: 'orqaly_n8n_connector_request_v1',
    contractVersion: envelope.contractVersion,
    canonicalization: envelope.canonicalization,
    organizationId: envelope.organizationId,
    workspaceId: envelope.workspaceId,
    runId: envelope.runId,
    stepId: envelope.stepId,
    attemptId: envelope.attemptId,
    stepKind: envelope.stepKind,
    actionIntentId: envelope.actionIntentId,
    actionIntentHash: envelope.actionIntentHash,
    effectId: envelope.effectId,
    descriptor: envelope.descriptor,
    executorBinding: envelope.executorBinding,
    canonicalInput: envelope.canonicalInput,
    canonicalInputHash: envelope.canonicalInputHash,
    effectProfile: envelope.effectProfile,
    dataEgressProfile: envelope.dataEgressProfile,
    deadline: envelope.deadline,
    policyDigest: envelope.policyDigest,
    approvalBindingHash: envelope.approvalBindingHash,
    idempotencyScope: envelope.idempotencyScope,
    idempotencyKey: envelope.idempotencyKey,
    targets: envelope.targets,
    externalPreconditions: envelope.externalPreconditions,
    connectionReference: envelope.connectionReferences[0],
    gatewayGrant: envelope.gatewayGrant,
  });
}

export class ExecutionEnvelopeAuthorityError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ExecutionEnvelopeAuthorityError';
    this.code = code;
  }
}

function requireExactAuthority(expected, observed, code) {
  if (canonicalJson(expected) !== canonicalJson(observed)) {
    throw new ExecutionEnvelopeAuthorityError(code);
  }
}

/**
 * Resolve the hashes carried by an external envelope and prove that its
 * executable authority is exactly the immutable intent the user approved.
 * Callers must load the snapshots by their tenant-scoped IDs before dispatch.
 */
export function validateExecutionEnvelopeAuthorityV1({
  envelope: rawEnvelope,
  actionIntent: rawActionIntent = null,
  approvalSubject: rawApprovalSubject = null,
}) {
  const envelope = ExecutionEnvelopeV1Schema.parse(rawEnvelope);
  if (envelope.effectProfile.externality === 'none') {
    if (rawActionIntent !== null || rawApprovalSubject !== null) {
      throw new ExecutionEnvelopeAuthorityError('unexpected_external_authority');
    }
    return { envelope, actionIntent: null, approvalSubject: null };
  }
  if (rawActionIntent === null) {
    throw new ExecutionEnvelopeAuthorityError('action_intent_snapshot_missing');
  }

  const intent = ActionIntentV1Schema.parse(rawActionIntent);
  const intentPersona = {
    contractVersion: intent.personaVersion.contractVersion,
    personaId: intent.personaVersion.personaId,
    personaVersion: intent.personaVersion.personaVersion,
    contentHash: intent.personaVersion.contentHash,
  };
  const bindings = [
    [envelope.organizationId, intent.organizationId, 'action_intent_organization_mismatch'],
    [envelope.workspaceId, intent.workspaceId, 'action_intent_workspace_mismatch'],
    [envelope.principalId, intent.principalId, 'action_intent_principal_mismatch'],
    [envelope.actionIntentId, intent.actionIntentId, 'action_intent_id_mismatch'],
    [envelope.actionIntentHash, intent.contentHash, 'action_intent_hash_mismatch'],
    [envelope.runId, intent.runId, 'action_intent_run_mismatch'],
    [envelope.stepId, intent.stepId, 'action_intent_step_mismatch'],
    [envelope.stepKind, intent.stepKind, 'action_intent_step_kind_mismatch'],
    [envelope.agentId, intent.agentId, 'action_intent_agent_mismatch'],
    [envelope.personaVersion, intentPersona, 'action_intent_persona_mismatch'],
    [envelope.descriptor, intent.descriptor, 'action_intent_descriptor_mismatch'],
    [envelope.executorBinding, intent.executorBinding, 'action_intent_executor_binding_mismatch'],
    [envelope.canonicalInput, intent.canonicalParameters, 'action_intent_input_mismatch'],
    [envelope.canonicalInputHash, intent.canonicalInputHash, 'action_intent_input_hash_mismatch'],
    [envelope.effectProfile, intent.effectProfile, 'action_intent_effect_profile_mismatch'],
    [
      envelope.dataEgressProfile,
      intent.dataEgressProfile,
      'action_intent_data_egress_profile_mismatch',
    ],
    [envelope.effectId, intent.effectId, 'action_intent_effect_id_mismatch'],
    [envelope.targets, intent.targets, 'action_intent_targets_mismatch'],
    [
      envelope.externalPreconditions,
      intent.externalPreconditions,
      'action_intent_preconditions_mismatch',
    ],
    [
      envelope.connectionReferences,
      [intent.connection.connectionReference],
      'action_intent_connection_mismatch',
    ],
    [envelope.idempotencyScope, intent.idempotency.scope, 'action_intent_idempotency_mismatch'],
    [envelope.idempotencyKey, intent.idempotency.key, 'action_intent_idempotency_mismatch'],
    [envelope.policyDigest, intent.policy.contentHash, 'action_intent_policy_mismatch'],
  ];
  for (const [expected, observed, code] of bindings) {
    requireExactAuthority(expected, observed, code);
  }

  if (envelope.approvalBindingHash === null) {
    if (rawApprovalSubject !== null) {
      throw new ExecutionEnvelopeAuthorityError('unexpected_approval_subject');
    }
    if (envelope.effectProfile.externality === 'write') {
      throw new ExecutionEnvelopeAuthorityError('approval_subject_snapshot_missing');
    }
    return { envelope, actionIntent: intent, approvalSubject: null };
  }
  if (rawApprovalSubject === null) {
    throw new ExecutionEnvelopeAuthorityError('approval_subject_snapshot_missing');
  }

  const approvalSubject = ApprovalSubjectV1Schema.parse(rawApprovalSubject);
  requireExactAuthority(
    envelope.approvalBindingHash,
    approvalSubjectV1Hash(approvalSubject),
    'approval_binding_hash_mismatch'
  );
  const approvedStep = approvalSubject.steps.find((step) => step.stepId === envelope.stepId);
  if (!approvedStep || approvedStep.actionIntent === null) {
    throw new ExecutionEnvelopeAuthorityError('approval_step_action_intent_missing');
  }
  requireExactAuthority(intent, approvedStep.actionIntent, 'approval_action_intent_mismatch');
  for (const field of [
    'maximumTurns',
    'maximumTokens',
    'maximumToolCalls',
    'maximumRuntimeSeconds',
    'maximumAttempts',
    'maximumCostMinor',
  ]) {
    if (envelope.limits[field] > approvedStep.limits[field]) {
      throw new ExecutionEnvelopeAuthorityError('approval_limits_exceeded');
    }
  }
  requireExactAuthority(
    envelope.limits.currency,
    approvedStep.limits.currency,
    'approval_currency_mismatch'
  );
  if (
    approvedStep.deadline !== null &&
    new Date(envelope.deadline) > new Date(approvedStep.deadline)
  ) {
    throw new ExecutionEnvelopeAuthorityError('approval_deadline_exceeded');
  }
  return { envelope, actionIntent: intent, approvalSubject };
}

export function gatewayAttestationHashPayload(attestation) {
  const { receiptHash: _receiptHash, signature: _signature, ...payload } = attestation;
  return payload;
}

export const GatewayEffectAttestationV1Schema = z
  .object({
    version: z.literal('orqaly_gateway_effect_attestation_v1'),
    contractVersion: z.literal('1.0').default('1.0'),
    canonicalization: z.literal(CANONICALIZATION_ALGORITHM),
    organizationId: OpaqueReferenceSchema,
    workspaceId: OpaqueReferenceSchema,
    runId: z.string().uuid(),
    stepId: z.string().uuid(),
    effectId: z.string().uuid(),
    attemptId: z.string().uuid(),
    descriptor: DescriptorVersionRefV2Schema,
    canonicalInputHash: HashSchema,
    preconditionHash: HashSchema.nullable().default(null),
    outcome: z.enum(['succeeded', 'failed', 'outcome_unknown', 'not_applied']),
    externalReferences: uniqueObjects(
      ExternalObjectReferenceSchema,
      100,
      (item) => `${item.referenceType}:${item.referenceValue}`,
      'external object references must be unique'
    ),
    outputHash: HashSchema.nullable().default(null),
    observedCost: ObservedCostSchema.nullable().default(null),
    observedAt: DateTimeSchema,
    receiptHash: HashSchema,
    signatureAlgorithm: z.literal('ed25519_v1'),
    signatureKeyId: CanonicalKeySchema,
    signature: z
      .string()
      .min(16)
      .max(8_192)
      .regex(/^[A-Za-z0-9_-]+={0,2}$/),
  })
  .strict()
  .superRefine((attestation, context) => {
    if (
      canonicalJsonSha256(gatewayAttestationHashPayload(attestation)) !== attestation.receiptHash
    ) {
      context.addIssue({
        code: 'custom',
        path: ['receiptHash'],
        message: 'Gateway receipt hash does not match RFC 8785 attestation bytes',
      });
    }
  });

export function verifyGatewayAttestationSignature(attestation, publicKey) {
  const parsed = GatewayEffectAttestationV1Schema.parse(attestation);
  const signature = Buffer.from(parsed.signature, 'base64url');
  const signedBytes = Buffer.from(parsed.receiptHash, 'hex');
  if (!crypto.verify(null, signedBytes, publicKey, signature)) {
    throw new Error('gateway_attestation_signature_invalid');
  }
  return parsed;
}

export const DispatchReceiptV1Schema = z
  .object({
    version: z.literal('orqaly_dispatch_receipt_v1'),
    contractVersion: z.literal('1.0').default('1.0'),
    organizationId: OpaqueReferenceSchema,
    workspaceId: OpaqueReferenceSchema,
    runId: z.string().uuid(),
    stepId: z.string().uuid(),
    attemptId: z.string().uuid(),
    descriptor: DescriptorVersionRefV2Schema,
    executorBinding: ExecutorBindingVersionRefV2Schema,
    status: z.enum([
      'accepted',
      'running',
      'succeeded',
      'failed',
      'outcome_unknown',
      'rejected',
      'cancelled',
    ]),
    observedAt: DateTimeSchema,
    executorReference: OpaqueReferenceSchema.nullable().default(null),
    effectId: z.string().uuid().nullable().default(null),
    gatewayEffectAttestation: GatewayEffectAttestationV1Schema.nullable().default(null),
    errorCode: CanonicalKeySchema.nullable().default(null),
    sanitizedError: z.string().max(2_000).nullable().default(null),
  })
  .strict()
  .superRefine((receipt, context) => {
    if (['accepted', 'running'].includes(receipt.status) && !receipt.executorReference) {
      context.addIssue({
        code: 'custom',
        path: ['executorReference'],
        message: 'accepted or running dispatch requires executor reference',
      });
    }
    if (['failed', 'rejected'].includes(receipt.status)) {
      if (!receipt.errorCode) {
        context.addIssue({
          code: 'custom',
          path: ['errorCode'],
          message: 'failed or rejected dispatch requires error code',
        });
      }
    } else if (receipt.errorCode || receipt.sanitizedError) {
      context.addIssue({
        code: 'custom',
        path: ['errorCode'],
        message: 'error fields are valid only for failed or rejected dispatch',
      });
    }

    const terminalEffectStatuses = ['succeeded', 'failed', 'outcome_unknown'];
    const attestation = receipt.gatewayEffectAttestation;
    if (receipt.effectId && terminalEffectStatuses.includes(receipt.status) && !attestation) {
      context.addIssue({
        code: 'custom',
        path: ['gatewayEffectAttestation'],
        message: 'terminal external effect requires Gateway attestation',
      });
    }
    if (!attestation) return;
    if (!receipt.effectId || !terminalEffectStatuses.includes(receipt.status)) {
      context.addIssue({
        code: 'custom',
        path: ['gatewayEffectAttestation'],
        message: 'Gateway attestation is valid only for a terminal external effect',
      });
      return;
    }
    const expected = [
      receipt.organizationId,
      receipt.workspaceId,
      receipt.runId,
      receipt.stepId,
      receipt.effectId,
      receipt.attemptId,
      canonicalJson(receipt.descriptor),
    ];
    const observed = [
      attestation.organizationId,
      attestation.workspaceId,
      attestation.runId,
      attestation.stepId,
      attestation.effectId,
      attestation.attemptId,
      canonicalJson(attestation.descriptor),
    ];
    if (expected.some((value, index) => value !== observed[index])) {
      context.addIssue({
        code: 'custom',
        path: ['gatewayEffectAttestation'],
        message: 'Gateway attestation does not match dispatch identity',
      });
    }
    const matchingOutcomes = {
      succeeded: ['succeeded'],
      failed: ['failed', 'not_applied'],
      outcome_unknown: ['outcome_unknown'],
    };
    if (!matchingOutcomes[receipt.status]?.includes(attestation.outcome)) {
      context.addIssue({
        code: 'custom',
        path: ['gatewayEffectAttestation', 'outcome'],
        message: 'Gateway outcome does not match dispatch status',
      });
    }
  });
