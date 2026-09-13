import { z } from 'zod';
import { containsSolutionBuildSecret } from './solution-build-secrets.js';

// Additive V2 contract. No V1 schema or canonicalization behavior is changed.
export const NATIVE_WORKFLOW_VERSION = 'n8n-native-2.37.10-v1';
export const NativeWorkflowHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const Id = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const Text = (max) => z.string().trim().min(1).max(max);
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);

export function isBoundedNativeJson(
  value,
  { maxBytes = 512000, maxDepth = 24, maxEntries = 20000 } = {}
) {
  let entries = 0;
  const seen = new Set();
  const visit = (item, depth) => {
    if (++entries > maxEntries || depth > maxDepth) return false;
    if (item === null || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item === 'string') return item.length <= maxBytes;
    if (!item || typeof item !== 'object' || seen.has(item)) return false;
    if (!Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item)))
      return false;
    seen.add(item);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const valid = Reflect.ownKeys(item).every((key) => {
      if (Array.isArray(item) && key === 'length') return true;
      if (
        typeof key !== 'string' ||
        forbidden.has(key) ||
        descriptors[key].get ||
        descriptors[key].set
      )
        return false;
      return visit(descriptors[key].value, depth + 1);
    });
    seen.delete(item);
    return valid;
  };
  if (!visit(value, 0)) return false;
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length <= maxBytes;
  } catch {
    return false;
  }
}

export const NativeJsonSchema = z
  .unknown()
  .refine((v) => isBoundedNativeJson(v), 'Expected bounded plain finite JSON');
const SafeJson = NativeJsonSchema.refine(
  (v) => !containsSolutionBuildSecret(v),
  'Embedded secrets are not allowed'
);
const JsonObject = SafeJson.refine(
  (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  'Expected JSON object'
);
const boundedBeforeParse = (schema, limits) =>
  z.preprocess((value, ctx) => {
    if (!isBoundedNativeJson(value, limits)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Expected bounded plain JSON before schema traversal',
      });
      return z.NEVER;
    }
    return value;
  }, schema);

// Deliberately documented JSON Schema subset: no remote refs, executable formats,
// regex evaluation, coercion or unbounded schema combinators.
const NativeDataNodeSchema = z.lazy(() =>
  z
    .object({
      type: z.enum(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']),
      description: z.string().max(1000).optional(),
      properties: z
        .record(
          z
            .string()
            .max(120)
            .refine((v) => !forbidden.has(v)),
          NativeDataNodeSchema
        )
        .optional(),
      required: z.array(z.string().max(120)).max(100).optional(),
      additionalProperties: z.boolean().optional(),
      items: NativeDataNodeSchema.optional(),
      enum: z.array(NativeJsonSchema).min(1).max(100).optional(),
      const: NativeJsonSchema.optional(),
      minItems: z.number().int().min(0).max(10000).optional(),
      maxItems: z.number().int().min(0).max(10000).optional(),
      minLength: z.number().int().min(0).max(64000).optional(),
      maxLength: z.number().int().min(0).max(64000).optional(),
      minimum: z.number().finite().optional(),
      maximum: z.number().finite().optional(),
    })
    .strict()
    .superRefine((v, ctx) => {
      for (const [min, max] of [
        ['minItems', 'maxItems'],
        ['minLength', 'maxLength'],
        ['minimum', 'maximum'],
      ]) {
        if (v[min] !== undefined && v[max] !== undefined && v[min] > v[max])
          ctx.addIssue({ code: 'custom', message: `${min} exceeds ${max}` });
      }
      if (v.type === 'array' && !v.items)
        ctx.addIssue({ code: 'custom', message: 'Array contracts require an item schema' });
      if (v.required?.some((key) => !Object.hasOwn(v.properties ?? {}, key)))
        ctx.addIssue({ code: 'custom', message: 'Required keys must have property schemas' });
    })
);
export const NativeDataSchema = boundedBeforeParse(NativeDataNodeSchema, {
  maxBytes: 32000,
  maxDepth: 20,
});

export const NativeWorkflowAssertionSchema = z
  .object({
    path: z
      .string()
      .max(1000)
      .regex(/^(?:\/(?:[^~]|~[01])*)*$/),
    operator: z.enum(['equals', 'exists', 'type', 'contains', 'length_gte', 'length_lte']),
    value: SafeJson.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.operator !== 'exists' && !Object.hasOwn(v, 'value'))
      ctx.addIssue({ code: 'custom', message: 'Assertion requires a value' });
    if (
      v.operator === 'type' &&
      !['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(v.value)
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid asserted type' });
    if (v.operator.startsWith('length_') && (!Number.isInteger(v.value) || v.value < 0))
      ctx.addIssue({ code: 'custom', message: 'Length assertions require a nonnegative integer' });
  });
export const NativeWorkflowAcceptanceCaseSchema = z
  .object({
    id: Id,
    description: Text(1000),
    requirementIds: z.array(Id).min(1).max(40),
    input: SafeJson,
    expectedOutput: SafeJson.optional(),
    assertions: z.array(NativeWorkflowAssertionSchema).max(30),
    expectedStatus: z.number().int().min(100).max(599).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!Object.hasOwn(v, 'expectedOutput') && !v.assertions.length)
      ctx.addIssue({ code: 'custom', message: 'A case needs an expected output or assertion' });
  });
const nativeSpecShape = {
  kind: z.literal('n8n_workflow_v2'),
  requirements: z
    .array(z.object({ id: Id, description: Text(2000) }).strict())
    .min(1)
    .max(40),
  inputSchema: NativeDataSchema,
  outputSchema: NativeDataSchema,
  acceptanceCases: z.array(NativeWorkflowAcceptanceCaseSchema).min(1).max(20),
  connections: z
    .array(
      z
        .object({
          id: Id,
          provider: Text(120),
          operation: Text(120),
          purpose: Text(1000),
          credentialType: Text(120).nullable(),
          nodeIds: z.array(Id).min(1).max(100),
        })
        .strict()
    )
    .max(30),
  runtimeProfile: z.enum([
    'request_automation',
    'durable_automation',
    'code_processing',
    'software_development',
  ]),
};
const refineNativeSpec = (v, ctx) => {
  for (const key of ['requirements', 'acceptanceCases', 'connections'])
    if (new Set(v[key].map((i) => i.id)).size !== v[key].length)
      ctx.addIssue({ code: 'custom', message: `Duplicate ${key} IDs` });
  const ids = new Set(v.requirements.map((r) => r.id));
  if (v.acceptanceCases.some((c) => c.requirementIds.some((id) => !ids.has(id))))
    ctx.addIssue({
      code: 'custom',
      message: 'Acceptance case references an unknown requirement',
    });
  if (
    !isBoundedNativeJson(v, {
      maxBytes: v.ownedDependencies?.length ? 192000 : 64000,
      maxDepth: 24,
    }) ||
    containsSolutionBuildSecret(v)
  )
    ctx.addIssue({ code: 'custom', message: 'Spec is oversized or contains a secret' });
};
// A child has the existing data contract, not recursive dependency authority.
// The first owned dependency role is a single native global error handler.
export const NativeWorkflowChildSpecV2Schema = z
  .object(nativeSpecShape)
  .strict()
  .superRefine(refineNativeSpec)
  .refine(
    (value) => value.runtimeProfile === 'request_automation',
    'Owned error handlers use the bounded request profile'
  );
export const NativeOwnedWorkflowDependencySchema = z
  .object({
    id: Id,
    kind: z.literal('error_handler'),
    workflow: JsonObject,
    spec: NativeWorkflowChildSpecV2Schema,
  })
  .strict();
export const NativeWorkflowSpecV2Schema = boundedBeforeParse(
  z
    .object({
      ...nativeSpecShape,
      ownedDependencies: z.array(NativeOwnedWorkflowDependencySchema).min(1).max(1).optional(),
    })
    .strict()
    .superRefine(refineNativeSpec),
  { maxBytes: 192000, maxDepth: 28 }
);
export const NativeWorkflowQuestionV2Schema = z
  .object({
    id: Id,
    kind: z.enum(['information', 'connection', 'setup']),
    prompt: Text(1000),
    reason: Text(1000),
    nodeId: Id.optional(),
    connectionId: Id.optional(),
  })
  .strict();
export const NativeWorkflowDependencyV2Schema = z
  .object({
    id: Id,
    kind: z.enum(['node', 'connection', 'runtime']),
    description: Text(2000),
    nodeId: Id.optional(),
  })
  .strict();
export const NativeWorkflowKnowledgeSchema = z
  .object({
    version: Text(120),
    skills: z
      .array(
        z
          .object({
            id: Id,
            sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
            contentHash: NativeWorkflowHashSchema,
            // Pinned content is hashed byte-for-byte. Trimming here would make
            // the wire payload disagree with its reviewed source hash.
            content: z.string().min(1).max(12000),
          })
          .strict()
      )
      .max(8),
    nodes: z
      .array(
        z
          .object({
            type: Text(200),
            typeVersion: z.number().finite().positive(),
            definition: JsonObject,
          })
          .strict()
      )
      .max(40),
    catalogHash: NativeWorkflowHashSchema,
  })
  .strict();
export const PrepareSolutionInputV2Schema = boundedBeforeParse(
  z
    .object({
      type: z.literal('PrepareSolutionV2'),
      buildRequestId: z.uuid(),
      inputVersion: z.number().int().positive(),
      instruction: Text(24000),
      agent: z
        .object({
          id: z.uuid(),
          name: Text(120),
          profileVersion: z.number().int().positive(),
          roleLabel: Text(120),
          description: z.string().max(2000),
          instructions: z.string().max(12000),
          profileHash: NativeWorkflowHashSchema,
        })
        .strict(),
      source: z
        .object({
          runId: z.uuid(),
          taskHash: NativeWorkflowHashSchema,
          title: Text(500),
          taskText: Text(24000),
          contextHash: NativeWorkflowHashSchema,
        })
        .strict(),
      answers: z.array(z.object({ questionId: Id, value: Text(2000) }).strict()).max(32),
      knowledge: NativeWorkflowKnowledgeSchema,
      draft: z
        .object({
          workflow: JsonObject,
          spec: NativeWorkflowSpecV2Schema,
          workflowHash: NativeWorkflowHashSchema,
          rowVersion: z.number().int().nonnegative(),
        })
        .strict()
        .nullable(),
      diagnostics: z
        .array(z.object({ code: Id, message: Text(2000), nodeId: Id.optional() }).strict())
        .max(40),
      phase: z.enum(['design', 'repair']),
      frozenAcceptanceCases: z.array(NativeWorkflowAcceptanceCaseSchema).max(20),
    })
    .strict()
    .superRefine((v, ctx) => {
      if (
        !isBoundedNativeJson(v, { maxBytes: 192000, maxEntries: 30000 }) ||
        containsSolutionBuildSecret(v)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Preparation input is oversized or contains secrets',
        });
      if (v.phase === 'repair' && (!v.draft || !v.frozenAcceptanceCases.length))
        ctx.addIssue({
          code: 'custom',
          message: 'Repair requires the exact draft and frozen acceptance criteria',
        });
      if (new Set(v.answers.map((a) => a.questionId)).size !== v.answers.length)
        ctx.addIssue({ code: 'custom', message: 'Duplicate answer question IDs' });
      if (
        new Set(v.knowledge.skills.map((s) => s.id)).size !== v.knowledge.skills.length ||
        new Set(v.knowledge.nodes.map((n) => `${n.type}@${n.typeVersion}`)).size !==
          v.knowledge.nodes.length
      )
        ctx.addIssue({ code: 'custom', message: 'Duplicate knowledge identity' });
    }),
  { maxBytes: 192000, maxEntries: 30000 }
);
export const PrepareSolutionResponseV2Schema = boundedBeforeParse(
  z
    .object({
      schemaVersion: z.literal('axwise.solution-preparation.v2'),
      buildRequestId: z.uuid(),
      inputVersion: z.number().int().positive(),
      outcome: z.enum(['candidate', 'needs_input', 'dependencies']),
      name: Text(120),
      purpose: Text(2000),
      explanation: Text(4000),
      workflow: JsonObject.nullable(),
      spec: NativeWorkflowSpecV2Schema.nullable(),
      questions: z.array(NativeWorkflowQuestionV2Schema).max(8),
      dependencies: z.array(NativeWorkflowDependencyV2Schema).max(40),
      baseWorkflowHash: NativeWorkflowHashSchema.nullable(),
      semanticReview: z
        .object({
          advisory: z.literal(true),
          summary: Text(4000),
          concerns: z.array(Text(2000)).max(20),
        })
        .strict(),
    })
    .strict()
    .superRefine((v, ctx) => {
      if (!isBoundedNativeJson(v, { maxBytes: 192000 }) || containsSolutionBuildSecret(v))
        ctx.addIssue({
          code: 'custom',
          message: 'Preparation response is oversized or contains secrets',
        });
      if (
        v.outcome === 'candidate' &&
        (!v.workflow || !v.spec || v.questions.length || v.dependencies.length)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Candidate requires a graph/spec and no unresolved questions/dependencies',
        });
      if (v.outcome === 'needs_input' && !v.questions.length)
        ctx.addIssue({ code: 'custom', message: 'Needs-input requires a question' });
      if (v.outcome === 'dependencies' && !v.dependencies.length)
        ctx.addIssue({ code: 'custom', message: 'Dependencies requires an explicit dependency' });
      if ((v.workflow === null) !== (v.spec === null))
        ctx.addIssue({ code: 'custom', message: 'Workflow and spec must be present together' });
      if (
        new Set(v.questions.map((q) => q.id)).size !== v.questions.length ||
        new Set(v.dependencies.map((d) => d.id)).size !== v.dependencies.length
      )
        ctx.addIssue({ code: 'custom', message: 'Duplicate question or dependency IDs' });
    }),
  { maxBytes: 192000 }
);
