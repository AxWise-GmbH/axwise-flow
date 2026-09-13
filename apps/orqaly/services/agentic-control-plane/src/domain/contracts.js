import { z } from 'zod';
import { canonicalJsonSha256 } from './canonical.js';

export const AGENT_KINDS = ['temporary', 'persistent'];
export const AGENT_STATES = [
  'draft',
  'proposed',
  'active',
  'paused',
  'revoked',
  'expired',
  'archived',
];
export const RUN_STATES = [
  'draft',
  'awaiting_scope_approval',
  'planning',
  'awaiting_plan_approval',
  'queued',
  'running',
  'waiting_for_customer',
  'waiting_for_approval',
  'pause_requested',
  'paused',
  'cancel_requested',
  'cancelled',
  'completed',
  'completed_with_gaps',
  'failed',
  'outcome_unknown',
];
export const STEP_KINDS = [
  'reason',
  'retrieve',
  'produce_artifact',
  'connector_read',
  'connector_write',
  'sandbox_work',
  'human_input',
  'review',
  'wait_or_monitor',
  'notify',
];
export const EFFECT_PROFILES = [
  'none',
  'external_read',
  'reversible_write',
  'irreversible_write',
  'spend',
  'publication',
  'external_communication',
];
export const DATA_EGRESS_PROFILES = [
  'none',
  'tenant_internal',
  'approved_model',
  'approved_search',
  'approved_provider',
  'public_destination',
];

const IdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const JsonObjectSchema = z.record(z.string(), z.unknown());

export const AGENT_PROFILE_ICON_KEYS = [
  'smart_toy',
  'bolt',
  'science',
  'support_agent',
  'campaign',
  'code',
];

export const AgentAvatarV1Schema = z
  .object({
    kind: z.enum(['icon', 'emoji']),
    value: z.string().trim().min(1).max(32),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .transform((value) => value.toUpperCase()),
  })
  .strict()
  .superRefine((avatar, context) => {
    if (avatar.kind === 'icon' && !AGENT_PROFILE_ICON_KEYS.includes(avatar.value)) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'unknown Agent avatar icon',
      });
    }
    if (
      avatar.kind === 'emoji' &&
      (!/\p{So}/u.test(avatar.value) || /[\p{Cc}\p{Cs}]/u.test(avatar.value))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Agent emoji avatar must contain a printable emoji',
      });
    }
  });

export const AgentProfileInputV1Schema = z
  .object({
    version: z.literal('orqaly_agent_profile_input_v1'),
    displayName: z.string().trim().min(1).max(160),
    roleLabel: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2_000).default(''),
    instructions: z.string().trim().max(12_000).default(''),
    avatar: AgentAvatarV1Schema,
  })
  .strict();

export function agentProfileV1HashPayload(value) {
  const profile = AgentProfileInputV1Schema.parse(value);
  return {
    version: profile.version,
    displayName: profile.displayName,
    roleLabel: profile.roleLabel,
    description: profile.description,
    instructions: profile.instructions,
    avatar: profile.avatar,
  };
}

export const AgentProfileV1Schema = z
  .object({
    version: z.literal('orqaly_agent_profile_v1'),
    id: z.string().uuid(),
    agentId: z.string().uuid(),
    versionNumber: z.number().int().positive(),
    contentHash: HashSchema,
    profile: AgentProfileInputV1Schema,
    createdBy: z.string().min(1).max(200),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((record, context) => {
    if (canonicalJsonSha256(agentProfileV1HashPayload(record.profile)) !== record.contentHash) {
      context.addIssue({
        code: 'custom',
        path: ['contentHash'],
        message: 'Agent profile hash does not match its normalized contents',
      });
    }
  });

export function sealAgentProfileV1({ id, agentId, versionNumber, profile, createdBy, createdAt }) {
  const normalizedProfile = AgentProfileInputV1Schema.parse(profile);
  return AgentProfileV1Schema.parse({
    version: 'orqaly_agent_profile_v1',
    id,
    agentId,
    versionNumber,
    contentHash: canonicalJsonSha256(agentProfileV1HashPayload(normalizedProfile)),
    profile: normalizedProfile,
    createdBy,
    createdAt,
  });
}

export const CreateAgentRequestSchema = z
  .object({
    version: z.literal('orqaly_agent_create_request_v1'),
    agentKind: z.enum(AGENT_KINDS).default('persistent'),
    profile: AgentProfileInputV1Schema,
    origin: z
      .object({
        kind: z.literal('assistant_goal'),
        sourceTaskId: IdentifierSchema,
        conversationId: IdentifierSchema,
        workflowRunId: z.string().uuid(),
      })
      .strict()
      .nullable()
      .default(null),
    expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
    idempotencyKey: IdentifierSchema,
  })
  .strict()
  .superRefine((request, context) => {
    if (request.agentKind === 'persistent' && request.expiresAt !== null) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'persistent Agents cannot expire',
      });
    }
    if (request.agentKind === 'temporary' && request.expiresAt === null) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'temporary standalone Agents require an expiry',
      });
    }
  });

export const UpdateAgentProfileRequestSchema = z
  .object({
    version: z.literal('orqaly_agent_profile_update_request_v1'),
    profile: AgentProfileInputV1Schema,
    idempotencyKey: IdentifierSchema,
  })
  .strict();

export const AgentLifecycleRequestSchema = z
  .object({
    version: z.literal('orqaly_agent_lifecycle_request_v1'),
    action: z.enum(['propose', 'activate', 'pause', 'resume', 'revoke', 'archive', 'promote']),
    reason: z.string().trim().max(1_000).default(''),
    idempotencyKey: IdentifierSchema,
  })
  .strict();

export const DescriptorRefSchema = z
  .object({
    key: IdentifierSchema,
    version: IdentifierSchema,
    contentHash: HashSchema,
  })
  .strict();

export const PersonaManifestSchema = z
  .object({
    version: z.literal('axwise_executor_persona_v1'),
    personaId: IdentifierSchema,
    contentHash: HashSchema,
    displayName: z.string().trim().min(1).max(160),
    identityDisclosure: z.string().trim().min(1).max(1_000),
    role: z.string().trim().min(1).max(300),
    mission: z.string().trim().min(1).max(4000),
    expertise: z.array(z.string().trim().min(1).max(300)).max(64).default([]),
    domainKnowledge: z.array(z.string().trim().min(1).max(300)).max(64).default([]),
    capabilities: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
    methods: z.array(z.string().trim().min(1).max(500)).max(64).default([]),
    workStyle: z.union([z.string().trim().max(4000), JsonObjectSchema]),
    communicationStyle: z.string().trim().min(1).max(1_000),
    decisionLens: z.string().trim().max(4000).default(''),
    outputContract: JsonObjectSchema.default({}),
    risks: z.array(z.string().trim().min(1).max(500)).max(64).default([]),
    boundaries: z.array(z.string().trim().min(1).max(500)).max(64).default([]),
    taskFit: JsonObjectSchema.default({}),
    provenance: JsonObjectSchema,
    sourceManifest: JsonObjectSchema,
    sourceMetadata: JsonObjectSchema,
  })
  .strict()
  .superRefine((persona, context) => {
    if (canonicalJsonSha256(persona.sourceManifest) !== persona.contentHash) {
      context.addIssue({
        code: 'custom',
        path: ['contentHash'],
        message: 'persona content hash must match the complete AxWise source manifest',
      });
    }
  });

export const StepLimitsSchema = z
  .object({
    maximumDurationSeconds: z.number().int().min(1).max(86_400),
    maximumAttempts: z.number().int().min(1).max(10).default(1),
    maximumCostMinor: z.number().int().min(0).default(0),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase())
      .default('EUR'),
  })
  .strict();

export const PlanStepSchema = z
  .object({
    nodeId: IdentifierSchema,
    stepKind: z.enum(STEP_KINDS),
    descriptor: DescriptorRefSchema,
    effectProfile: z.enum(EFFECT_PROFILES),
    dataEgressProfile: z.enum(DATA_EGRESS_PROFILES),
    dependsOn: z.array(IdentifierSchema).max(100).default([]),
    assignedAgentRef: IdentifierSchema,
    reviewerAgentRef: IdentifierSchema.nullable().default(null),
    input: JsonObjectSchema.default({}),
    limits: StepLimitsSchema,
  })
  .strict()
  .superRefine((step, context) => {
    if (step.dependsOn.includes(step.nodeId)) {
      context.addIssue({
        code: 'custom',
        path: ['dependsOn'],
        message: 'step cannot depend on itself',
      });
    }
    if (step.stepKind === 'review' && step.reviewerAgentRef === step.assignedAgentRef) {
      context.addIssue({
        code: 'custom',
        path: ['reviewerAgentRef'],
        message: 'reviewer must be distinct from the assigned Agent',
      });
    }
    if (['connector_write', 'notify'].includes(step.stepKind) && step.effectProfile === 'none') {
      context.addIssue({
        code: 'custom',
        path: ['effectProfile'],
        message: 'external write and notification steps require an effect profile',
      });
    }
    if (
      ['reason', 'produce_artifact', 'sandbox_work', 'review'].includes(step.stepKind) &&
      step.effectProfile !== 'none'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['effectProfile'],
        message: 'local work cannot claim an external effect',
      });
    }
  });

export const ExecutionPlanSchema = z
  .object({
    version: z.literal('orqaly_execution_plan_proposal_v1'),
    planId: IdentifierSchema,
    sourceDecisionId: IdentifierSchema,
    contentHash: HashSchema,
    steps: z.array(PlanStepSchema).min(1).max(200),
    metadata: JsonObjectSchema.default({}),
  })
  .strict()
  .superRefine((plan, context) => {
    const nodes = new Map();
    for (const [index, step] of plan.steps.entries()) {
      if (nodes.has(step.nodeId)) {
        context.addIssue({
          code: 'custom',
          path: ['steps', index, 'nodeId'],
          message: 'nodeId must be unique in a plan',
        });
      }
      nodes.set(step.nodeId, step);
    }
    for (const [index, step] of plan.steps.entries()) {
      for (const dependency of step.dependsOn) {
        if (!nodes.has(dependency)) {
          context.addIssue({
            code: 'custom',
            path: ['steps', index, 'dependsOn'],
            message: `unknown dependency: ${dependency}`,
          });
        }
      }
    }

    const visiting = new Set();
    const visited = new Set();
    const visit = (nodeId) => {
      if (visiting.has(nodeId)) return false;
      if (visited.has(nodeId)) return true;
      visiting.add(nodeId);
      for (const dependency of nodes.get(nodeId)?.dependsOn || []) {
        if (!visit(dependency)) return false;
      }
      visiting.delete(nodeId);
      visited.add(nodeId);
      return true;
    };
    for (const [index, step] of plan.steps.entries()) {
      if (!visit(step.nodeId)) {
        context.addIssue({
          code: 'custom',
          path: ['steps', index, 'dependsOn'],
          message: 'execution plan must be acyclic',
        });
        break;
      }
    }
  });

export const AgentTeamMemberSchema = z
  .object({
    agentRef: IdentifierSchema,
    parentAgentRef: IdentifierSchema.nullable().default(null),
    role: z.enum(['coordinator', 'worker', 'reviewer']),
    persona: PersonaManifestSchema,
    allowedDescriptorFamilies: z.array(IdentifierSchema).max(100).default([]),
    allowedEffectProfiles: z.array(z.enum(EFFECT_PROFILES)).max(EFFECT_PROFILES.length).default([]),
  })
  .strict();

export const MaterializeAgentRequestSchema = z
  .object({
    version: z.literal('orqaly_materialize_agent_request_v1'),
    sourceTask: z
      .object({
        taskId: IdentifierSchema,
        title: z.string().trim().min(1).max(500),
        description: z.string().trim().max(20_000).default(''),
        projectId: IdentifierSchema.nullable().default(null),
        conversationId: IdentifierSchema.nullable().default(null),
      })
      .strict(),
    agentKind: z.enum(AGENT_KINDS).default('temporary'),
    coordinatorAgentRef: IdentifierSchema,
    team: z.array(AgentTeamMemberSchema).min(1).max(5),
    plan: ExecutionPlanSchema,
    idempotencyKey: IdentifierSchema,
  })
  .strict()
  .superRefine((request, context) => {
    const memberRefs = request.team.map((member) => member.agentRef);
    const refs = new Set(memberRefs);
    if (refs.size !== memberRefs.length) {
      context.addIssue({
        code: 'custom',
        path: ['team'],
        message: 'team Agent references must be unique',
      });
    }
    if (!refs.has(request.coordinatorAgentRef)) {
      context.addIssue({
        code: 'custom',
        path: ['coordinatorAgentRef'],
        message: 'coordinator must be a member of the proposed team',
      });
    }
    const coordinators = request.team.filter((member) => member.role === 'coordinator');
    if (coordinators.length !== 1 || coordinators[0].agentRef !== request.coordinatorAgentRef) {
      context.addIssue({
        code: 'custom',
        path: ['team'],
        message: 'the team requires exactly one matching coordinator',
      });
    }
    if (coordinators[0]?.parentAgentRef) {
      context.addIssue({
        code: 'custom',
        path: ['team'],
        message: 'the coordinator cannot have a parent Agent',
      });
    }
    const parentByRef = new Map(
      request.team.map((member) => [member.agentRef, member.parentAgentRef])
    );
    for (const [index, member] of request.team.entries()) {
      if (member.parentAgentRef && !refs.has(member.parentAgentRef)) {
        context.addIssue({
          code: 'custom',
          path: ['team', index, 'parentAgentRef'],
          message: 'parent Agent must belong to the same team',
        });
      }
      if (member.parentAgentRef === member.agentRef) {
        context.addIssue({
          code: 'custom',
          path: ['team', index, 'parentAgentRef'],
          message: 'an Agent cannot parent itself',
        });
      }
      const visited = new Set();
      let cursor = member.agentRef;
      let depth = 0;
      while (cursor) {
        if (visited.has(cursor)) {
          context.addIssue({
            code: 'custom',
            path: ['team', index, 'parentAgentRef'],
            message: 'team parent relationships must be acyclic',
          });
          break;
        }
        visited.add(cursor);
        cursor = parentByRef.get(cursor);
        if (cursor) depth += 1;
      }
      if (depth > 2) {
        context.addIssue({
          code: 'custom',
          path: ['team', index, 'parentAgentRef'],
          message: 'team parent relationships cannot exceed depth two',
        });
      }
    }
    for (const [index, step] of request.plan.steps.entries()) {
      if (!refs.has(step.assignedAgentRef)) {
        context.addIssue({
          code: 'custom',
          path: ['plan', 'steps', index, 'assignedAgentRef'],
          message: 'assigned Agent must belong to the materialized team',
        });
      }
      if (step.reviewerAgentRef && !refs.has(step.reviewerAgentRef)) {
        context.addIssue({
          code: 'custom',
          path: ['plan', 'steps', index, 'reviewerAgentRef'],
          message: 'reviewer Agent must belong to the materialized team',
        });
      }
      if (step.reviewerAgentRef === step.assignedAgentRef) {
        context.addIssue({
          code: 'custom',
          path: ['plan', 'steps', index, 'reviewerAgentRef'],
          message: 'reviewer must be distinct from the assigned Agent',
        });
      }
      if (step.reviewerAgentRef) {
        const ancestors = (agentRef) => {
          const result = new Set();
          let cursor = parentByRef.get(agentRef);
          while (cursor && !result.has(cursor)) {
            result.add(cursor);
            cursor = parentByRef.get(cursor);
          }
          return result;
        };
        if (
          ancestors(step.assignedAgentRef).has(step.reviewerAgentRef) ||
          ancestors(step.reviewerAgentRef).has(step.assignedAgentRef)
        ) {
          context.addIssue({
            code: 'custom',
            path: ['plan', 'steps', index, 'reviewerAgentRef'],
            message: 'reviewer cannot be a parent or child of the assigned Agent',
          });
        }
      }
    }
  });

export const TaskAdmissionRequestSchema = z
  .object({
    version: z.literal('orqaly_task_admission_request_v1'),
    task: z
      .object({
        title: z.string().trim().min(1).max(500),
        description: z.string().trim().max(20_000).default(''),
      })
      .strict(),
    requestedSteps: z
      .array(
        z
          .object({
            stepKind: z.enum(STEP_KINDS),
            descriptorKey: IdentifierSchema.nullable().default(null),
            connectionKey: IdentifierSchema.nullable().default(null),
          })
          .strict()
      )
      .min(1)
      .max(200),
  })
  .strict();

export { HashSchema, IdentifierSchema, JsonObjectSchema };
