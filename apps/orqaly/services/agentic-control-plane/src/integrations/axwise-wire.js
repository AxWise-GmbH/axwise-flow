import { z } from 'zod';
import { CANONICALIZATION_ALGORITHM, canonicalJsonSha256 } from '../domain/canonical.js';
import {
  DataEgressProfileV2Schema,
  EffectProfileV2Schema,
  ExternalActionSpecV1Schema,
  ExecutionLimitsV2Schema,
  ExecutionPlanV2Schema,
  executionPlanV2HashPayload,
} from '../domain/execution-contracts.js';
import { STEP_KINDS } from '../domain/contracts.js';

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const ReferenceSchema = z.string().min(1).max(512);
const DescriptorRefSchema = z
  .object({
    contract_version: z.literal('1.0'),
    descriptor_key: z.string().min(1).max(200),
    schema_version: z.string().min(1).max(64),
    content_hash: HashSchema,
  })
  .strict();
const BindingRefSchema = z
  .object({
    contract_version: z.literal('1.0'),
    binding_key: z.string().min(1).max(200),
    binding_version: z.string().min(1).max(64),
    content_hash: HashSchema,
  })
  .strict();
const PersonaRefSchema = z
  .object({
    contract_version: z.literal('1.0'),
    persona_id: ReferenceSchema,
    persona_version: z.string().regex(/^[1-9][0-9]*$/),
    content_hash: HashSchema,
  })
  .strict();
const AxwiseEffectSchema = z
  .object({
    externality: z.enum(['none', 'read', 'write']).default('none'),
    mutation: z.enum(['none', 'create', 'update', 'delete']).default('none'),
    flags: z.array(z.string()).max(20).default([]),
  })
  .strict();
const AxwiseEgressSchema = z
  .object({
    mode: z.enum(['deny_all', 'internal_only', 'policy_bound_external']).default('deny_all'),
    destination_classes: z.array(z.string()).max(50).default([]),
    provider_classes: z.array(z.string()).max(50).default([]),
    region_classes: z.array(z.string()).max(50).default([]),
    permitted_input_classifications: z.array(z.string()).max(4).default([]),
    permitted_output_classifications: z.array(z.string()).max(4).default([]),
    redaction_required: z.boolean().default(false),
    dlp_required: z.boolean().default(false),
    provider_retention_policy_required: z.boolean().default(false),
    provider_training_policy_required: z.boolean().default(false),
  })
  .strict();
const AxwiseLimitsSchema = z
  .object({
    maximum_turns: z.number().int().min(1).max(1_000),
    maximum_tokens: z.number().int().min(1).max(100_000_000),
    maximum_tool_calls: z.number().int().min(0).max(10_000),
    maximum_runtime_seconds: z.number().int().min(1).max(86_400),
    maximum_attempts: z.number().int().min(1).max(10),
    maximum_cost_minor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    currency: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/),
  })
  .strict();
const AxwiseProviderOperationSchema = z
  .object({
    contract_version: z.literal('1.0'),
    operation_key: z.string().min(1).max(200),
    operation_version: z.string().min(1).max(64),
    content_hash: HashSchema,
  })
  .strict();
const AxwiseConnectionSchema = z
  .object({
    connection_reference: ReferenceSchema,
    provider_key: z.string().min(1).max(200),
    credential_owner_principal_id: ReferenceSchema,
    requested_scopes: z.array(z.string().min(1).max(200)).max(100).default([]),
  })
  .strict();
const AxwiseTargetSchema = z
  .object({
    target_type: z.string().min(1).max(200),
    target_reference: ReferenceSchema,
    target_hash: HashSchema.nullable().default(null),
  })
  .strict();
const AxwisePreconditionSchema = z
  .object({
    precondition_type: z.string().min(1).max(200),
    target_reference: ReferenceSchema,
    expected_state_hash: HashSchema,
  })
  .strict();
const AxwiseReconciliationSchema = z
  .object({
    strategy: z.enum(['provider_idempotency', 'authoritative_lookup', 'manual']),
    lookup_operation: AxwiseProviderOperationSchema.nullable().default(null),
  })
  .strict();
const AxwiseCompensationSchema = z
  .object({
    strategy: z.enum(['none', 'provider_operation', 'manual']),
    operation: AxwiseProviderOperationSchema.nullable().default(null),
  })
  .strict();
const AxwiseExternalActionSchema = z
  .object({
    version: z.literal('orqaly_external_action_spec_v1'),
    effect_id: z.string().uuid(),
    provider_operation: AxwiseProviderOperationSchema,
    connection: AxwiseConnectionSchema,
    targets: z.array(AxwiseTargetSchema).min(1).max(100),
    external_preconditions: z.array(AxwisePreconditionSchema).max(100).default([]),
    idempotency: z
      .object({
        scope: z.string().min(1).max(200),
        key: ReferenceSchema,
      })
      .strict(),
    reconciliation: AxwiseReconciliationSchema,
    compensation: AxwiseCompensationSchema,
  })
  .strict();
const AxwiseNodeSchema = z
  .object({
    node_id: ReferenceSchema,
    title: z.string().min(1).max(500),
    objective: z.string().min(1).max(4_000),
    step_kind: z.enum(STEP_KINDS),
    descriptor: DescriptorRefSchema,
    executor_binding: BindingRefSchema,
    assigned_agent_id: z.string().uuid(),
    persona_version: PersonaRefSchema,
    reviewer_agent_id: z.string().uuid().nullable().default(null),
    requires_distinct_reviewer: z.boolean().default(false),
    dependencies: z.array(ReferenceSchema).max(100).default([]),
    canonical_input_hash: HashSchema,
    expected_output_schema_hash: HashSchema,
    effect_profile: AxwiseEffectSchema,
    data_egress_profile: AxwiseEgressSchema,
    external_action: AxwiseExternalActionSchema.optional(),
    limits: AxwiseLimitsSchema,
    deadline: z.string().datetime({ offset: true }).nullable().default(null),
  })
  .strict();
const AxwisePlanSchema = z
  .object({
    contract_version: z.literal('1.0'),
    canonicalization: z.literal(CANONICALIZATION_ALGORITHM),
    plan_id: ReferenceSchema,
    plan_version: z.number().int().min(1),
    content_hash: HashSchema,
    owning_agent_id: z.string().uuid(),
    team_id: z.string().uuid(),
    team_member_ids: z.array(z.string().uuid()).min(1).max(5),
    nodes: z.array(AxwiseNodeSchema).min(1).max(200),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((plan, context) => {
    if (canonicalJsonSha256(axwisePlanHashPayload(plan)) !== plan.content_hash) {
      context.addIssue({
        code: 'custom',
        path: ['content_hash'],
        message: 'AxWise plan content hash does not match its RFC 8785 bytes',
      });
    }
  });

function omitNullObjectFields(value) {
  if (Array.isArray(value)) return value.map(omitNullObjectFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== null)
      .map(([key, child]) => [key, omitNullObjectFields(child)])
  );
}

export function axwisePlanHashPayload(plan) {
  const { content_hash: _contentHash, ...payload } = plan;
  return omitNullObjectFields(payload);
}

function descriptor(reference) {
  return {
    contractVersion: reference.contract_version,
    descriptorKey: reference.descriptor_key,
    schemaVersion: reference.schema_version,
    contentHash: reference.content_hash,
  };
}

function binding(reference) {
  return {
    contractVersion: reference.contract_version,
    bindingKey: reference.binding_key,
    bindingVersion: reference.binding_version,
    contentHash: reference.content_hash,
  };
}

function persona(reference) {
  return {
    contractVersion: reference.contract_version,
    personaId: reference.persona_id,
    personaVersion: reference.persona_version,
    contentHash: reference.content_hash,
  };
}

function effect(profile) {
  return EffectProfileV2Schema.parse({
    externality: profile.externality,
    mutation: profile.mutation,
    flags: profile.flags,
  });
}

function egress(profile) {
  return DataEgressProfileV2Schema.parse({
    mode: profile.mode,
    destinationClasses: profile.destination_classes,
    providerClasses: profile.provider_classes,
    regionClasses: profile.region_classes,
    permittedInputClassifications: profile.permitted_input_classifications,
    permittedOutputClassifications: profile.permitted_output_classifications,
    redactionRequired: profile.redaction_required,
    dlpRequired: profile.dlp_required,
    providerRetentionPolicyRequired: profile.provider_retention_policy_required,
    providerTrainingPolicyRequired: profile.provider_training_policy_required,
  });
}

function providerOperation(reference) {
  return {
    contractVersion: reference.contract_version,
    operationKey: reference.operation_key,
    operationVersion: reference.operation_version,
    contentHash: reference.content_hash,
  };
}

function externalAction(action) {
  return ExternalActionSpecV1Schema.parse({
    version: action.version,
    effectId: action.effect_id,
    providerOperation: providerOperation(action.provider_operation),
    connection: {
      connectionReference: action.connection.connection_reference,
      providerKey: action.connection.provider_key,
      credentialOwnerPrincipalId: action.connection.credential_owner_principal_id,
      requestedScopes: action.connection.requested_scopes,
    },
    targets: action.targets.map((target) => ({
      targetType: target.target_type,
      targetReference: target.target_reference,
      targetHash: target.target_hash,
    })),
    externalPreconditions: action.external_preconditions.map((item) => ({
      preconditionType: item.precondition_type,
      targetReference: item.target_reference,
      expectedStateHash: item.expected_state_hash,
    })),
    idempotency: action.idempotency,
    reconciliation: {
      strategy: action.reconciliation.strategy,
      lookupOperation: action.reconciliation.lookup_operation
        ? providerOperation(action.reconciliation.lookup_operation)
        : null,
    },
    compensation: {
      strategy: action.compensation.strategy,
      operation: action.compensation.operation
        ? providerOperation(action.compensation.operation)
        : null,
    },
  });
}

export function materializeAxwisePlan({
  sourceDecisionId,
  axwisePlan: rawPlan,
  canonicalInputsByNode,
}) {
  const source = AxwisePlanSchema.parse(rawPlan);
  const nodes = source.nodes.map((node) => {
    if (!Object.hasOwn(canonicalInputsByNode, node.node_id)) {
      throw new Error(`canonical_input_missing:${node.node_id}`);
    }
    const canonicalInput = canonicalInputsByNode[node.node_id];
    if (canonicalJsonSha256(canonicalInput) !== node.canonical_input_hash) {
      throw new Error(`canonical_input_hash_mismatch:${node.node_id}`);
    }
    const limits = ExecutionLimitsV2Schema.parse({
      maximumTurns: node.limits.maximum_turns,
      maximumTokens: node.limits.maximum_tokens,
      maximumToolCalls: node.limits.maximum_tool_calls,
      maximumRuntimeSeconds: node.limits.maximum_runtime_seconds,
      maximumAttempts: node.limits.maximum_attempts,
      maximumCostMinor: node.limits.maximum_cost_minor,
      currency: node.limits.currency,
    });
    return {
      nodeId: node.node_id,
      title: node.title,
      objective: node.objective,
      stepKind: node.step_kind,
      descriptor: descriptor(node.descriptor),
      executorBinding: binding(node.executor_binding),
      assignedAgentId: node.assigned_agent_id,
      personaVersion: persona(node.persona_version),
      reviewerAgentId: node.reviewer_agent_id,
      requiresDistinctReviewer: node.requires_distinct_reviewer,
      dependencies: node.dependencies,
      canonicalInput,
      canonicalInputHash: node.canonical_input_hash,
      expectedOutputSchemaHash: node.expected_output_schema_hash,
      effectProfile: effect(node.effect_profile),
      dataEgressProfile: egress(node.data_egress_profile),
      ...(node.external_action ? { externalAction: externalAction(node.external_action) } : {}),
      limits,
      deadline: node.deadline,
    };
  });

  const materialized = {
    version: 'orqaly_execution_plan_v2',
    contractVersion: source.contract_version,
    canonicalization: CANONICALIZATION_ALGORITHM,
    sourceDecisionId,
    sourcePlanId: source.plan_id,
    sourceContentHash: source.content_hash,
    planVersion: source.plan_version,
    contentHash: '0'.repeat(64),
    owningAgentId: source.owning_agent_id,
    teamId: source.team_id,
    teamMemberIds: source.team_member_ids,
    nodes,
    createdAt: source.created_at,
  };
  materialized.contentHash = canonicalJsonSha256(executionPlanV2HashPayload(materialized));
  return ExecutionPlanV2Schema.parse(materialized);
}
