import { z } from 'zod';
import { CANONICALIZATION_ALGORITHM, canonicalJson, canonicalJsonSha256 } from './canonical.js';
import { STEP_KINDS } from './contracts.js';

export const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const VersionSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
export const CanonicalKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
const DescriptorKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
export const OpaqueReferenceSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/);
export const JsonObjectSchema = z.record(z.string(), z.unknown());
export const AwareDateTimeSchema = z.string().datetime({ offset: true });

function sortedUnique(schema, message, maximum = 100) {
  return z
    .array(schema)
    .max(maximum)
    .default([])
    .superRefine((items, context) => {
      const canonical = [...new Set(items)].sort();
      if (
        canonical.length !== items.length ||
        canonical.some((item, index) => item !== items[index])
      ) {
        context.addIssue({ code: 'custom', message });
      }
    });
}

function sortedUniqueObjects(schema, identity, message, maximum = 100, minimum = 0) {
  return z
    .array(schema)
    .min(minimum)
    .max(maximum)
    .superRefine((items, context) => {
      const identities = items.map(identity);
      const canonical = [...new Set(identities)].sort();
      if (
        canonical.length !== identities.length ||
        canonical.some((item, index) => item !== identities[index])
      ) {
        context.addIssue({ code: 'custom', message });
      }
    });
}

export const DescriptorVersionRefV2Schema = z
  .object({
    contractVersion: z.literal('1.0').default('1.0'),
    descriptorKey: DescriptorKeySchema,
    schemaVersion: VersionSchema,
    contentHash: HashSchema,
  })
  .strict();

export const ExecutorBindingVersionRefV2Schema = z
  .object({
    contractVersion: z.literal('1.0').default('1.0'),
    bindingKey: CanonicalKeySchema,
    bindingVersion: VersionSchema,
    contentHash: HashSchema,
  })
  .strict();

export const ProviderOperationVersionRefV1Schema = z
  .object({
    contractVersion: z.literal('1.0').default('1.0'),
    operationKey: CanonicalKeySchema,
    operationVersion: VersionSchema,
    contentHash: HashSchema,
  })
  .strict();

export const PersonaVersionRefV2Schema = z
  .object({
    contractVersion: z.literal('1.0').default('1.0'),
    personaId: OpaqueReferenceSchema,
    personaVersion: VersionSchema,
    contentHash: HashSchema,
  })
  .strict();

export const EffectTargetV1Schema = z
  .object({
    targetType: CanonicalKeySchema,
    targetReference: OpaqueReferenceSchema,
    targetHash: HashSchema.nullable().default(null),
  })
  .strict();

export const ExternalPreconditionV1Schema = z
  .object({
    preconditionType: CanonicalKeySchema,
    targetReference: OpaqueReferenceSchema,
    expectedStateHash: HashSchema,
  })
  .strict();

export const ConnectionReferenceV1Schema = z
  .object({
    connectionReference: OpaqueReferenceSchema,
    providerKey: CanonicalKeySchema,
    credentialOwnerPrincipalId: OpaqueReferenceSchema,
    requestedScopes: sortedUnique(
      CanonicalKeySchema,
      'requested connection scopes must be sorted and unique',
      100
    ),
  })
  .strict();

export const IdempotencyBindingV1Schema = z
  .object({
    scope: CanonicalKeySchema,
    key: OpaqueReferenceSchema,
  })
  .strict();

export const ReconciliationPolicyV1Schema = z
  .object({
    strategy: z.enum(['provider_idempotency', 'authoritative_lookup', 'manual']),
    lookupOperation: ProviderOperationVersionRefV1Schema.nullable().default(null),
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.strategy === 'authoritative_lookup' && policy.lookupOperation === null) {
      context.addIssue({
        code: 'custom',
        path: ['lookupOperation'],
        message: 'authoritative lookup reconciliation requires a pinned lookup operation',
      });
    }
    if (policy.strategy !== 'authoritative_lookup' && policy.lookupOperation !== null) {
      context.addIssue({
        code: 'custom',
        path: ['lookupOperation'],
        message: 'only authoritative lookup reconciliation may name a lookup operation',
      });
    }
  });

export const CompensationPolicyV1Schema = z
  .object({
    strategy: z.enum(['none', 'provider_operation', 'manual']).default('none'),
    operation: ProviderOperationVersionRefV1Schema.nullable().default(null),
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.strategy === 'provider_operation' && policy.operation === null) {
      context.addIssue({
        code: 'custom',
        path: ['operation'],
        message: 'provider compensation requires a pinned operation',
      });
    }
    if (policy.strategy !== 'provider_operation' && policy.operation !== null) {
      context.addIssue({
        code: 'custom',
        path: ['operation'],
        message: 'only provider compensation may name an operation',
      });
    }
  });

export const ExternalActionSpecV1Schema = z
  .object({
    version: z.literal('orqaly_external_action_spec_v1'),
    effectId: z.string().uuid(),
    providerOperation: ProviderOperationVersionRefV1Schema,
    connection: ConnectionReferenceV1Schema,
    targets: sortedUniqueObjects(
      EffectTargetV1Schema,
      (target) =>
        canonicalJson([target.targetType, target.targetReference, target.targetHash || '']),
      'external targets must be sorted and unique',
      100,
      1
    ),
    externalPreconditions: sortedUniqueObjects(
      ExternalPreconditionV1Schema,
      (item) =>
        canonicalJson([item.preconditionType, item.targetReference, item.expectedStateHash]),
      'external preconditions must be sorted and unique'
    ).default([]),
    idempotency: IdempotencyBindingV1Schema,
    reconciliation: ReconciliationPolicyV1Schema,
    compensation: CompensationPolicyV1Schema.default({
      strategy: 'none',
      operation: null,
    }),
  })
  .strict();

export const EffectProfileV2Schema = z
  .object({
    externality: z.enum(['none', 'read', 'write']).default('none'),
    mutation: z.enum(['none', 'create', 'update', 'delete']).default('none'),
    flags: sortedUnique(
      z.enum([
        'financial',
        'recurring_commitment',
        'communication',
        'publication',
        'production',
        'destructive',
        'sensitive_data',
        'external_disclosure',
        'irreversible',
      ]),
      'effect flags must be sorted and unique',
      20
    ),
  })
  .strict()
  .superRefine((profile, context) => {
    if (profile.mutation !== 'none' && profile.externality !== 'write') {
      context.addIssue({
        code: 'custom',
        path: ['mutation'],
        message: 'a mutation requires write externality',
      });
    }
    const writeOnly = ['destructive', 'external_disclosure', 'recurring_commitment'];
    if (profile.externality !== 'write' && profile.flags.some((flag) => writeOnly.includes(flag))) {
      context.addIssue({
        code: 'custom',
        path: ['flags'],
        message: 'write-only effect flags require write externality',
      });
    }
  });

const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'];
function sortedClassifications() {
  return z
    .array(z.enum(CLASSIFICATIONS))
    .max(4)
    .default([])
    .superRefine((items, context) => {
      const canonical = [...new Set(items)].sort(
        (left, right) => CLASSIFICATIONS.indexOf(left) - CLASSIFICATIONS.indexOf(right)
      );
      if (
        canonical.length !== items.length ||
        canonical.some((item, index) => item !== items[index])
      ) {
        context.addIssue({
          code: 'custom',
          message: 'egress classifications must be sorted and unique',
        });
      }
    });
}

export const DataEgressProfileV2Schema = z
  .object({
    mode: z.enum(['deny_all', 'internal_only', 'policy_bound_external']).default('deny_all'),
    destinationClasses: sortedUnique(
      CanonicalKeySchema,
      'egress destination classes must be sorted and unique',
      50
    ),
    providerClasses: sortedUnique(
      CanonicalKeySchema,
      'egress provider classes must be sorted and unique',
      50
    ),
    regionClasses: sortedUnique(
      CanonicalKeySchema,
      'egress region classes must be sorted and unique',
      50
    ),
    permittedInputClassifications: sortedClassifications(),
    permittedOutputClassifications: sortedClassifications(),
    redactionRequired: z.boolean().default(false),
    dlpRequired: z.boolean().default(false),
    providerRetentionPolicyRequired: z.boolean().default(false),
    providerTrainingPolicyRequired: z.boolean().default(false),
  })
  .strict()
  .superRefine((profile, context) => {
    const releasePolicyPresent = [
      profile.destinationClasses,
      profile.providerClasses,
      profile.regionClasses,
      profile.permittedInputClassifications,
      profile.permittedOutputClassifications,
    ].some((values) => values.length > 0);
    if (profile.mode === 'deny_all' && releasePolicyPresent) {
      context.addIssue({
        code: 'custom',
        message: 'deny-all egress cannot declare release policy',
      });
    }
    if (profile.mode === 'policy_bound_external') {
      if (!profile.destinationClasses.length) {
        context.addIssue({
          code: 'custom',
          path: ['destinationClasses'],
          message: 'external egress requires a destination class',
        });
      }
      if (!profile.regionClasses.length) {
        context.addIssue({
          code: 'custom',
          path: ['regionClasses'],
          message: 'external egress requires a region class',
        });
      }
      if (!profile.permittedInputClassifications.length) {
        context.addIssue({
          code: 'custom',
          path: ['permittedInputClassifications'],
          message: 'external egress requires permitted input classifications',
        });
      }
    }
  });

export const ExecutionLimitsV2Schema = z
  .object({
    maximumTurns: z.number().int().min(1).max(1_000).default(1),
    maximumTokens: z.number().int().min(1).max(100_000_000).default(1_000),
    maximumToolCalls: z.number().int().min(0).max(10_000).default(0),
    maximumRuntimeSeconds: z.number().int().min(1).max(86_400),
    maximumAttempts: z.number().int().min(1).max(10).default(1),
    maximumCostMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    currency: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/),
  })
  .strict();

export const ExecutionPlanNodeV2Schema = z
  .object({
    nodeId: OpaqueReferenceSchema,
    title: z.string().trim().min(1).max(500),
    objective: z.string().trim().min(1).max(4_000),
    stepKind: z.enum(STEP_KINDS),
    descriptor: DescriptorVersionRefV2Schema,
    executorBinding: ExecutorBindingVersionRefV2Schema,
    assignedAgentId: z.string().uuid(),
    personaVersion: PersonaVersionRefV2Schema,
    reviewerAgentId: z.string().uuid().nullable().default(null),
    requiresDistinctReviewer: z.boolean().default(false),
    dependencies: sortedUnique(
      OpaqueReferenceSchema,
      'node dependencies must be sorted and unique',
      100
    ),
    canonicalInput: JsonObjectSchema,
    canonicalInputHash: HashSchema,
    expectedOutputSchemaHash: HashSchema,
    effectProfile: EffectProfileV2Schema,
    dataEgressProfile: DataEgressProfileV2Schema,
    externalAction: ExternalActionSpecV1Schema.optional(),
    limits: ExecutionLimitsV2Schema,
    deadline: AwareDateTimeSchema.nullable().default(null),
  })
  .strict()
  .superRefine((node, context) => {
    if (node.dependencies.includes(node.nodeId)) {
      context.addIssue({
        code: 'custom',
        path: ['dependencies'],
        message: 'a plan node cannot depend on itself',
      });
    }
    if (node.reviewerAgentId === node.assignedAgentId) {
      context.addIssue({
        code: 'custom',
        path: ['reviewerAgentId'],
        message: 'a plan node reviewer must differ from its executor',
      });
    }
    if (node.requiresDistinctReviewer && node.reviewerAgentId === null) {
      context.addIssue({
        code: 'custom',
        path: ['reviewerAgentId'],
        message: 'a distinct reviewer is required but was not assigned',
      });
    }
    if (node.stepKind === 'connector_read' && node.effectProfile.externality !== 'read') {
      context.addIssue({
        code: 'custom',
        path: ['effectProfile', 'externality'],
        message: 'connector_read requires read externality',
      });
    }
    if (node.stepKind === 'connector_write' && node.effectProfile.externality !== 'write') {
      context.addIssue({
        code: 'custom',
        path: ['effectProfile', 'externality'],
        message: 'connector_write requires write externality',
      });
    }
    if (node.effectProfile.externality === 'none' && node.externalAction !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['externalAction'],
        message: 'a non-external step cannot declare an external action',
      });
    }
    if (node.effectProfile.externality !== 'none' && node.externalAction === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['externalAction'],
        message: 'an external step requires a complete external action specification',
      });
    }
    if (
      node.effectProfile.externality === 'read' &&
      node.externalAction?.externalPreconditions.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['externalAction', 'externalPreconditions'],
        message: 'external preconditions are valid only for writes',
      });
    }
    if (
      node.effectProfile.externality === 'write' &&
      ['update', 'delete'].includes(node.effectProfile.mutation) &&
      !node.externalAction?.externalPreconditions.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['externalAction', 'externalPreconditions'],
        message: 'update and delete actions require an exact external precondition',
      });
    }
    if (canonicalJsonSha256(node.canonicalInput) !== node.canonicalInputHash) {
      context.addIssue({
        code: 'custom',
        path: ['canonicalInputHash'],
        message: 'canonical input hash does not match RFC 8785 input bytes',
      });
    }
  });

export function executionPlanV2HashPayload(plan) {
  const { contentHash: _ignored, ...payload } = plan;
  return payload;
}

export const ExecutionPlanV2Schema = z
  .object({
    version: z.literal('orqaly_execution_plan_v2'),
    contractVersion: z.literal('1.0').default('1.0'),
    canonicalization: z.literal(CANONICALIZATION_ALGORITHM),
    sourceDecisionId: OpaqueReferenceSchema,
    sourcePlanId: OpaqueReferenceSchema,
    sourceContentHash: HashSchema,
    planVersion: z.number().int().min(1),
    contentHash: HashSchema,
    owningAgentId: z.string().uuid(),
    teamId: z.string().uuid(),
    teamMemberIds: sortedUnique(
      z.string().uuid(),
      'plan team member IDs must be sorted and unique',
      5
    ),
    nodes: z.array(ExecutionPlanNodeV2Schema).min(1).max(200),
    createdAt: AwareDateTimeSchema,
  })
  .strict()
  .superRefine((plan, context) => {
    if (!plan.teamMemberIds.includes(plan.owningAgentId)) {
      context.addIssue({
        code: 'custom',
        path: ['owningAgentId'],
        message: 'owning Agent must belong to the plan team',
      });
    }
    const nodeIds = plan.nodes.map((node) => node.nodeId);
    const known = new Set(nodeIds);
    if (known.size !== nodeIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['nodes'],
        message: 'execution plan node IDs must be unique',
      });
    }
    for (const [index, node] of plan.nodes.entries()) {
      for (const dependency of node.dependencies) {
        if (!known.has(dependency)) {
          context.addIssue({
            code: 'custom',
            path: ['nodes', index, 'dependencies'],
            message: `unknown dependency: ${dependency}`,
          });
        }
      }
      if (!plan.teamMemberIds.includes(node.assignedAgentId)) {
        context.addIssue({
          code: 'custom',
          path: ['nodes', index, 'assignedAgentId'],
          message: 'assigned Agent is outside the plan team',
        });
      }
      if (node.reviewerAgentId && !plan.teamMemberIds.includes(node.reviewerAgentId)) {
        context.addIssue({
          code: 'custom',
          path: ['nodes', index, 'reviewerAgentId'],
          message: 'reviewer Agent is outside the plan team',
        });
      }
    }

    const visiting = new Set();
    const visited = new Set();
    const dependencies = new Map(plan.nodes.map((node) => [node.nodeId, node.dependencies]));
    const visit = (nodeId) => {
      if (visiting.has(nodeId)) return false;
      if (visited.has(nodeId)) return true;
      visiting.add(nodeId);
      for (const dependency of dependencies.get(nodeId) || []) {
        if (!visit(dependency)) return false;
      }
      visiting.delete(nodeId);
      visited.add(nodeId);
      return true;
    };
    if (nodeIds.some((nodeId) => !visit(nodeId))) {
      context.addIssue({
        code: 'custom',
        path: ['nodes'],
        message: 'execution plan must be acyclic',
      });
    }

    if (canonicalJsonSha256(executionPlanV2HashPayload(plan)) !== plan.contentHash) {
      context.addIssue({
        code: 'custom',
        path: ['contentHash'],
        message: 'plan content hash does not match RFC 8785 plan bytes',
      });
    }
  });

export const PlanVersionSubmissionSchema = z
  .object({
    version: z.literal('orqaly_plan_version_submission_v1'),
    idempotencyKey: OpaqueReferenceSchema,
    plan: ExecutionPlanV2Schema,
  })
  .strict();
