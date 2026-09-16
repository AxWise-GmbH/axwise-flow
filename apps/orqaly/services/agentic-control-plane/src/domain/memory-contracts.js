import { z } from 'zod';

export const MEMORY_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'];

export const MEMORY_PURPOSES = [
  'task_planning',
  'task_execution',
  'research',
  'personalization',
  'customer_support',
];

const ScopeIdentifierSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const CanonicalKeySchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
const OpaqueReferenceSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const AwareDateTimeSchema = z.string().datetime({ offset: true });

function sortedUnique(schema, message, { minimum = 0, maximum = 100 } = {}) {
  return z
    .array(schema)
    .min(minimum)
    .max(maximum)
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

const TenantScopeSchema = {
  organizationId: ScopeIdentifierSchema,
  workspaceId: ScopeIdentifierSchema,
  principalId: ScopeIdentifierSchema,
};

export const MEMORY_NAMESPACE_SCOPE_KINDS = [
  'workspace',
  'user',
  'project',
  'conversation',
  'task',
  'agent',
];

// This object is deliberately separate from the model-authored routing request.
// The control plane must construct it from the verified principal and persisted
// Agent/run records; it is never accepted from an Agent or browser payload.
export const TrustedMemoryRetrievalScopeV1Schema = z
  .object({
    version: z.literal('orqaly_trusted_memory_retrieval_scope_v1'),
    ...TenantScopeSchema,
    projectReference: OpaqueReferenceSchema.nullable(),
    conversationReference: OpaqueReferenceSchema.nullable(),
    taskReference: OpaqueReferenceSchema,
    agentId: z.string().uuid(),
    allowedDomains: sortedUnique(
      CanonicalKeySchema,
      'trusted memory domains must be sorted and unique',
      { minimum: 1, maximum: 32 }
    ),
    allowedTopics: sortedUnique(
      CanonicalKeySchema,
      'trusted memory topics must be sorted and unique',
      { minimum: 1, maximum: 128 }
    ),
    purpose: z.enum(MEMORY_PURPOSES),
    maximumClassification: z.enum(MEMORY_CLASSIFICATIONS),
    asOf: AwareDateTimeSchema,
  })
  .strict();

export const MemoryRoutingRequestV1Schema = z
  .object({
    version: z.literal('orqaly_memory_routing_request_v1'),
    domain: CanonicalKeySchema,
    topics: sortedUnique(CanonicalKeySchema, 'task topics must be sorted and unique', {
      minimum: 1,
      maximum: 32,
    }),
    maximumItems: z.number().int().min(1).max(100),
  })
  .strict();

export const MemoryNamespacePolicyV1Schema = z
  .object({
    version: z.literal('orqaly_memory_namespace_policy_v1'),
    ...TenantScopeSchema,
    namespaceId: z.string().uuid(),
    scopeKind: z.enum(MEMORY_NAMESPACE_SCOPE_KINDS),
    projectReference: OpaqueReferenceSchema.nullable(),
    conversationReference: OpaqueReferenceSchema.nullable(),
    taskReference: OpaqueReferenceSchema.nullable(),
    agentId: z.string().uuid().nullable(),
    status: z.enum(['active', 'paused', 'revoked']),
    allowedDomains: sortedUnique(
      CanonicalKeySchema,
      'namespace domains must be sorted and unique',
      { minimum: 1, maximum: 32 }
    ),
    allowedTopics: sortedUnique(CanonicalKeySchema, 'namespace topics must be sorted and unique', {
      minimum: 1,
      maximum: 128,
    }),
    allowedPurposes: sortedUnique(
      z.enum(MEMORY_PURPOSES),
      'namespace purposes must be sorted and unique',
      { minimum: 1, maximum: MEMORY_PURPOSES.length }
    ),
    maximumClassification: z.enum(MEMORY_CLASSIFICATIONS),
    expiresAt: AwareDateTimeSchema.nullable(),
  })
  .strict()
  .superRefine((namespace, context) => {
    const hasProject = namespace.projectReference !== null;
    const hasConversation = namespace.conversationReference !== null;
    const hasTask = namespace.taskReference !== null;
    const hasAgent = namespace.agentId !== null;
    const exactBindingShape =
      ((namespace.scopeKind === 'workspace' || namespace.scopeKind === 'user') &&
        !hasProject &&
        !hasConversation &&
        !hasTask &&
        !hasAgent) ||
      (namespace.scopeKind === 'project' &&
        hasProject &&
        !hasConversation &&
        !hasTask &&
        !hasAgent) ||
      (namespace.scopeKind === 'conversation' &&
        !hasProject &&
        hasConversation &&
        !hasTask &&
        !hasAgent) ||
      (namespace.scopeKind === 'task' && hasTask && !hasAgent) ||
      (namespace.scopeKind === 'agent' && !hasProject && !hasConversation && !hasTask && hasAgent);

    if (!exactBindingShape) {
      context.addIssue({
        code: 'custom',
        message: 'namespace binding fields must exactly match its scope kind',
      });
    }
  });

export const MemoryCandidateV1Schema = z
  .object({
    version: z.literal('orqaly_memory_candidate_v1'),
    ...TenantScopeSchema,
    memoryItemId: z.string().uuid(),
    namespaceId: z.string().uuid(),
    status: z.enum(['active', 'superseded', 'revoked']),
    domain: CanonicalKeySchema,
    topics: sortedUnique(CanonicalKeySchema, 'memory topics must be sorted and unique', {
      minimum: 1,
      maximum: 64,
    }),
    purposes: sortedUnique(z.enum(MEMORY_PURPOSES), 'memory purposes must be sorted and unique', {
      minimum: 1,
      maximum: MEMORY_PURPOSES.length,
    }),
    classification: z.enum(MEMORY_CLASSIFICATIONS),
    contentReference: OpaqueReferenceSchema,
    recordedAt: AwareDateTimeSchema,
    expiresAt: AwareDateTimeSchema.nullable(),
  })
  .strict();

export const MemoryRoutingInputV1Schema = z
  .object({
    request: MemoryRoutingRequestV1Schema,
    namespaces: z.array(MemoryNamespacePolicyV1Schema).max(128),
    candidates: z.array(MemoryCandidateV1Schema).max(1_000),
  })
  .strict()
  .superRefine((input, context) => {
    const namespaceIds = input.namespaces.map((namespace) => namespace.namespaceId);
    if (new Set(namespaceIds).size !== namespaceIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['namespaces'],
        message: 'namespace IDs must be unique',
      });
    }
    const memoryItemIds = input.candidates.map((candidate) => candidate.memoryItemId);
    if (new Set(memoryItemIds).size !== memoryItemIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['candidates'],
        message: 'memory item IDs must be unique',
      });
    }
  });

export const MEMORY_EXCLUSION_REASONS = [
  'tenant_scope_mismatch',
  'namespace_scope_mismatch',
  'namespace_unknown',
  'namespace_inactive',
  'namespace_expired',
  'namespace_domain_mismatch',
  'namespace_topic_mismatch',
  'namespace_purpose_mismatch',
  'memory_inactive',
  'memory_not_yet_valid',
  'memory_expired',
  'memory_domain_mismatch',
  'memory_topic_mismatch',
  'memory_purpose_mismatch',
  'classification_not_permitted',
  'result_limit',
];

const RoutedMemorySchema = z
  .object({
    memoryItemId: z.string().uuid(),
    namespaceId: z.string().uuid(),
    namespaceScopeKind: z.enum(MEMORY_NAMESPACE_SCOPE_KINDS),
    contentReference: OpaqueReferenceSchema,
    classification: z.enum(MEMORY_CLASSIFICATIONS),
    matchedTopics: sortedUnique(CanonicalKeySchema, 'matched topics must be sorted and unique', {
      minimum: 1,
      maximum: 32,
    }),
  })
  .strict();

export const MemoryRoutingResultV1Schema = z
  .object({
    version: z.literal('orqaly_memory_routing_result_v1'),
    projectReference: OpaqueReferenceSchema.nullable(),
    conversationReference: OpaqueReferenceSchema.nullable(),
    taskReference: OpaqueReferenceSchema,
    agentId: z.string().uuid(),
    selected: z.array(RoutedMemorySchema).max(100),
    excluded: z
      .array(
        z
          .object({
            memoryItemId: z.string().uuid(),
            reason: z.enum(MEMORY_EXCLUSION_REASONS),
          })
          .strict()
      )
      .max(1_000),
    zeroMemoryReason: z.enum(['no_accessible_namespaces', 'no_matching_memory']).nullable(),
  })
  .strict();
