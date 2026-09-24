import { z } from 'zod';
import { canonicalJson, sha256Hex } from '../../lib/workflow-v2/canonical.js';
import {
  AssistantCapabilityV2Schema,
  AssistantPresentationV1Schema,
  AxWiseFailureDiagnosticsSchema,
  ClerkOrganizationIdSchema,
  ClerkUserIdSchema,
  ExecutionAgentContractV1Schema,
  UuidSchema,
} from './contracts.js';
import { AssistantRouteSchema } from './assistant-primitives.js';
import {
  ASSISTANT_ROUTE_POLICY_VERSION,
  ASSISTANT_ROUTE_POLICY_VERSIONS,
  ASSISTANT_ROUTE_REASON_CODES,
} from './assistant-routing.js';

export {
  ASSISTANT_ROUTE_POLICY_VERSION,
  ASSISTANT_ROUTE_POLICY_VERSIONS,
  ASSISTANT_ROUTE_REASON_CODES,
  resolveAssistantTurnRoute,
  routeAssistantTurn,
} from './assistant-routing.js';
export { AssistantRouteSchema } from './assistant-primitives.js';

export const ASSISTANT_USER_MESSAGE_MAX_LENGTH = 24_000;
export const START_GOAL_MESSAGE_PREFIX = 'Start a goal: ';
const ASSISTANT_COMMAND_MAX_LENGTH =
  ASSISTANT_USER_MESSAGE_MAX_LENGTH + START_GOAL_MESSAGE_PREFIX.length;

export const AssistantComposerIntentSchema = z.enum(['assistant', 'research', 'goal', 'auto']);

export const AssistantAgentLifetimeSchema = z.enum(['temporary', 'persistent']);

export const AssistantTurnCommandSchema = z
  .object({
    turnId: UuidSchema,
    issuedAt: z.string().datetime({ offset: true }),
    message: z.string().trim().min(1).max(ASSISTANT_COMMAND_MAX_LENGTH),
    intent: AssistantComposerIntentSchema.optional(),
    agentLifetime: AssistantAgentLifetimeSchema.optional(),
    agentId: UuidSchema.optional(),
    capability: AssistantCapabilityV2Schema.optional(),
  })
  .strict()
  .superRefine((command, context) => {
    if (command.agentLifetime !== undefined && command.intent !== 'goal') {
      context.addIssue({
        code: 'custom',
        path: ['agentLifetime'],
        message: 'agentLifetime is available only when intent is goal',
      });
    }
    if (command.agentId !== undefined && command.intent !== 'goal') {
      context.addIssue({
        code: 'custom',
        path: ['agentId'],
        message: 'agentId is available only when intent is goal',
      });
    }
    if (command.message.length <= ASSISTANT_USER_MESSAGE_MAX_LENGTH) return;
    if (
      (!command.intent || command.intent === 'auto') &&
      command.message.startsWith(START_GOAL_MESSAGE_PREFIX) &&
      command.message.slice(START_GOAL_MESSAGE_PREFIX.length).trim().length <=
        ASSISTANT_USER_MESSAGE_MAX_LENGTH
    ) {
      return;
    }
    context.addIssue({
      code: z.ZodIssueCode.too_big,
      maximum: ASSISTANT_USER_MESSAGE_MAX_LENGTH,
      inclusive: true,
      origin: 'string',
      path: ['message'],
      message: `Assistant messages must contain at most ${ASSISTANT_USER_MESSAGE_MAX_LENGTH} characters`,
    });
  });

export const AssistantRetryCommandSchema = z
  .object({
    turnId: UuidSchema,
    issuedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const AssistantTextPartSchema = z
  .object({ type: z.literal('text'), markdown: z.string().min(1).max(120_000) })
  .strict();

export const AssistantSourcePartSchema = z
  .object({
    type: z.literal('source'),
    title: z.string().min(1).max(500),
    url: z.string().url().max(4000),
    sourceTypes: z.array(z.string().min(1).max(100)).min(1).max(7),
  })
  .strict();

export const AssistantArtifactPartSchema = z
  .object({
    type: z.literal('artifact'),
    title: z.string().min(1).max(500),
    contentType: z.string().min(1).max(200),
    markdown: z.string().min(1).max(120_000),
  })
  .strict();

export const AssistantOperationStatusPartSchema = z
  .object({
    type: z.literal('operation_status'),
    operationId: UuidSchema,
    status: z.enum(['accepted', 'running', 'cancel_requested', 'cancelled', 'failed']),
    retryAfterSeconds: z.number().int().min(1).max(900).optional(),
    retryable: z.boolean().optional(),
    retryMode: z.enum(['none', 'new_attempt']).optional(),
    errorClass: z.string().min(1).max(200).optional(),
    retryAt: z.string().datetime({ offset: true }).optional(),
    diagnostics: AxWiseFailureDiagnosticsSchema.optional(),
  })
  .strict();

export const AssistantFactPartSchema = z
  .object({
    type: z.literal('fact'),
    statement: z.string().min(1).max(4000),
    sourceUrls: z.array(z.string().url().max(4000)).max(10).default([]),
  })
  .strict();

export const AssistantRecommendationPartSchema = z
  .object({
    type: z.literal('recommendation'),
    kind: z.enum(['continue_conversation', 'consider_goal']),
    summary: z.string().min(1).max(1000),
  })
  .strict();

export const AssistantGoalLinkPartSchema = z
  .object({
    type: z.literal('goal_link'),
    runId: UuidSchema,
    label: z.string().min(1).max(500),
    status: z.string().min(1).max(100),
  })
  .strict();

// This small, immutable user-side part makes the selected Agent lifetime part of
// the turn's canonical hash. Replaying a turn ID with a different lifetime is
// therefore rejected instead of silently changing the delegated Agent contract.
export const AssistantDelegationRequestPartSchema = z
  .object({
    type: z.literal('delegation_request'),
    lifetime: AssistantAgentLifetimeSchema,
    agentId: UuidSchema.optional(),
  })
  .strict();

export const AssistantCapabilityRequestPartSchema = z
  .object({
    type: z.literal('capability_request'),
    capability: AssistantCapabilityV2Schema,
  })
  .strict();

export const AssistantPresentationPartSchema = z
  .object({
    type: z.literal('presentation'),
    presentation: AssistantPresentationV1Schema,
  })
  .strict();

export const AssistantExecutorPersonaSchema = z
  .object({
    role: z.literal('task_executor'),
    version: z.literal('axwise_executor_persona_v1'),
    provider: z.literal('axwise'),
    status: z.literal('contract_bound'),
  })
  .strict();

const LegacyPersistedAssistantExecutorPersonaSchema = z
  .object({
    role: z.literal('task_executor'),
    version: z.literal('axwise_executor_persona_v1'),
    provider: z.literal('axwise'),
    status: z.literal('formed_during_goal'),
  })
  .strict();

export const LegacyUnverifiedAssistantExecutorPersonaSchema = z
  .object({
    role: z.literal('task_executor'),
    version: z.literal('axwise_executor_persona_v1'),
    provider: z.literal('axwise'),
    status: z.literal('legacy_unverified'),
  })
  .strict();

export const AssistantAgentMemoryScopeSchema = z
  .object({
    kind: z.literal('thread_and_goal'),
    label: z.literal('This chat and Goal only'),
  })
  .strict();

export const AssistantAgentRuntimeSchema = z
  .object({
    provider: z.literal('orqaly_workflow_v2'),
    label: z.literal('Orqaly GCP + AxWise'),
    isolation: z.literal('tenant_user'),
  })
  .strict();

export const AssistantAgentCapabilitiesSchema = z
  .object({
    research: z.literal(true),
    planning: z.literal(true),
    artifactProduction: z.literal(true),
    approvalGates: z.literal(true),
    externalActions: z.literal(false),
  })
  .strict();

export const AssistantAgentToolExecutionSchema = z
  .object({
    status: z.literal('not_configured'),
    provider: z.null(),
  })
  .strict();

export function executionAgentPresentation(rawExecutionAgent) {
  const executionAgent = ExecutionAgentContractV1Schema.parse(rawExecutionAgent);
  return {
    executorPersona: {
      role: executionAgent.executorPersona.role,
      version: executionAgent.executorPersona.profileVersion,
      provider: executionAgent.executorPersona.provider,
      status: 'contract_bound',
    },
    memoryScope: {
      kind: executionAgent.memory.scope,
      label: 'This chat and Goal only',
    },
    runtime: {
      provider: executionAgent.runtime.provider,
      label: 'Orqaly GCP + AxWise',
      isolation: executionAgent.runtime.isolation,
    },
    capabilities: {
      ...executionAgent.capabilities,
      externalActions: executionAgent.tools.externalActions,
    },
    toolExecution: {
      status: 'not_configured',
      provider: executionAgent.tools.executionProvider,
    },
  };
}

function validateDelegatedAgentClaims(agent, context) {
  const presentation = executionAgentPresentation(agent.executionAgent);
  if (
    agent.id !== agent.executionAgent.id ||
    agent.runId !== agent.executionAgent.runId ||
    agent.threadId !== agent.executionAgent.source.threadId ||
    agent.lifetime !== agent.executionAgent.lifetime ||
    agent.executionAgent.source.taskHash !== sha256Hex(agent.task) ||
    ['executorPersona', 'memoryScope', 'runtime', 'capabilities', 'toolExecution'].some(
      (field) => canonicalJson(agent[field]) !== canonicalJson(presentation[field])
    )
  ) {
    context.addIssue({
      code: 'custom',
      path: ['executionAgent'],
      message: 'delegated Agent claims must be derived from its runtime execution contract',
    });
  }
}

const delegatedAgentCommonFields = {
  id: UuidSchema,
  runId: UuidSchema,
  threadId: UuidSchema,
  name: z.string().min(1).max(500),
  task: z.string().min(1).max(ASSISTANT_USER_MESSAGE_MAX_LENGTH),
  lifetime: AssistantAgentLifetimeSchema,
  status: z.string().min(1).max(100),
  memoryScope: AssistantAgentMemoryScopeSchema,
  runtime: AssistantAgentRuntimeSchema,
  capabilities: AssistantAgentCapabilitiesSchema,
  toolExecution: AssistantAgentToolExecutionSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
};

const delegatedAgentFields = {
  ...delegatedAgentCommonFields,
  executorPersona: AssistantExecutorPersonaSchema,
  executionAgent: ExecutionAgentContractV1Schema,
};

const legacyPersistedDelegatedAgentFields = {
  ...delegatedAgentCommonFields,
  executorPersona: LegacyPersistedAssistantExecutorPersonaSchema,
};

const legacyUnverifiedDelegatedAgentFields = {
  ...delegatedAgentCommonFields,
  executorPersona: LegacyUnverifiedAssistantExecutorPersonaSchema,
};

export const DelegatedAgentSchema = z
  .object(delegatedAgentFields)
  .strict()
  .superRefine(validateDelegatedAgentClaims);

export const AssistantDelegatedAgentPartSchema = z
  .object({ type: z.literal('delegated_agent'), ...delegatedAgentFields })
  .strict()
  .superRefine(validateDelegatedAgentClaims);

const LegacyPersistedAssistantDelegatedAgentPartSchema = z
  .object({ type: z.literal('delegated_agent'), ...legacyPersistedDelegatedAgentFields })
  .strict();

export const LegacyUnverifiedDelegatedAgentSchema = z
  .object(legacyUnverifiedDelegatedAgentFields)
  .strict();

export const LegacyUnverifiedAssistantDelegatedAgentPartSchema = z
  .object({ type: z.literal('delegated_agent'), ...legacyUnverifiedDelegatedAgentFields })
  .strict();

export const DelegatedAgentReadProjectionSchema = z.union([
  DelegatedAgentSchema,
  LegacyUnverifiedDelegatedAgentSchema,
]);

export function normalizePersistedDelegatedAgentPart(rawPart) {
  const current = AssistantDelegatedAgentPartSchema.safeParse(rawPart);
  if (current.success) return current.data;
  const legacy = LegacyPersistedAssistantDelegatedAgentPartSchema.parse(rawPart);
  return LegacyUnverifiedAssistantDelegatedAgentPartSchema.parse({
    ...legacy,
    executorPersona: {
      ...legacy.executorPersona,
      status: 'legacy_unverified',
    },
  });
}

export const AssistantApprovalPartSchema = z
  .object({
    type: z.literal('approval'),
    action: z.literal('start_goal'),
    prompt: z.string().min(1).max(1000),
    request: z.string().min(1).max(24_000),
  })
  .strict();

export const AssistantMessagePartSchema = z.discriminatedUnion('type', [
  AssistantTextPartSchema,
  AssistantSourcePartSchema,
  AssistantArtifactPartSchema,
  AssistantOperationStatusPartSchema,
  AssistantFactPartSchema,
  AssistantRecommendationPartSchema,
  AssistantCapabilityRequestPartSchema,
  AssistantPresentationPartSchema,
  AssistantDelegationRequestPartSchema,
  AssistantDelegatedAgentPartSchema,
  AssistantGoalLinkPartSchema,
  AssistantApprovalPartSchema,
]);

const AssistantReadMessagePartSchema = z.union([
  AssistantTextPartSchema,
  AssistantSourcePartSchema,
  AssistantArtifactPartSchema,
  AssistantOperationStatusPartSchema,
  AssistantFactPartSchema,
  AssistantRecommendationPartSchema,
  AssistantCapabilityRequestPartSchema,
  AssistantPresentationPartSchema,
  AssistantDelegationRequestPartSchema,
  AssistantDelegatedAgentPartSchema,
  LegacyUnverifiedAssistantDelegatedAgentPartSchema,
  AssistantGoalLinkPartSchema,
  AssistantApprovalPartSchema,
]);

export const AssistantMessageSchema = z
  .object({
    id: UuidSchema,
    threadId: UuidSchema,
    turnId: UuidSchema,
    role: z.enum(['user', 'assistant']),
    route: AssistantRouteSchema,
    parts: z.array(AssistantMessagePartSchema).min(1).max(100),
    axwiseOperationId: UuidSchema.nullable(),
    workflowRunId: UuidSchema.nullable(),
    retryOfTurnId: UuidSchema.nullable().default(null),
    requestedIntent: AssistantComposerIntentSchema.optional(),
    resolvedRoute: AssistantRouteSchema.optional(),
    routePolicyVersion: z.enum(ASSISTANT_ROUTE_POLICY_VERSIONS).optional(),
    routeReasonCode: z.enum(ASSISTANT_ROUTE_REASON_CODES).optional(),
    model: z.string().min(1).max(200).optional(),
    modelVersion: z.string().min(1).max(200).optional(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((message, context) => {
    const routeProvenance = [
      message.requestedIntent,
      message.resolvedRoute,
      message.routePolicyVersion,
      message.routeReasonCode,
    ];
    const presentRouteFields = routeProvenance.filter((value) => value !== undefined).length;
    if (presentRouteFields !== 0 && presentRouteFields !== routeProvenance.length) {
      context.addIssue({
        code: 'custom',
        path: ['requestedIntent'],
        message: 'assistant route provenance must be complete or absent for legacy messages',
      });
    }
    if (presentRouteFields && message.role !== 'user') {
      context.addIssue({
        code: 'custom',
        path: ['requestedIntent'],
        message: 'assistant route provenance belongs to the user message for the turn',
      });
    }
    if (message.resolvedRoute !== undefined && message.resolvedRoute !== message.route) {
      context.addIssue({
        code: 'custom',
        path: ['resolvedRoute'],
        message: 'resolvedRoute must match the immutable route',
      });
    }
    if (
      (message.model !== undefined || message.modelVersion !== undefined) &&
      message.role !== 'assistant'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['model'],
        message: 'model provenance belongs to an assistant response',
      });
    }
    const delegationRequests = message.parts.filter((part) => part.type === 'delegation_request');
    const delegatedAgents = message.parts.filter((part) => part.type === 'delegated_agent');
    const capabilityRequests = message.parts.filter((part) => part.type === 'capability_request');
    const presentations = message.parts.filter((part) => part.type === 'presentation');
    if (capabilityRequests.length > 1 || (capabilityRequests.length && message.role !== 'user')) {
      context.addIssue({
        code: 'custom',
        path: ['parts'],
        message: 'one capability request may be persisted only on a user message',
      });
    }
    if (presentations.length && message.role !== 'assistant') {
      context.addIssue({
        code: 'custom',
        path: ['parts'],
        message: 'presentations may be persisted only on an assistant message',
      });
    }
    if (delegationRequests.length && (message.role !== 'user' || message.route !== 'START_GOAL')) {
      context.addIssue({
        code: 'custom',
        path: ['parts'],
        message: 'delegation requests belong to a user START_GOAL turn',
      });
    }
    if (
      delegatedAgents.length &&
      (message.role !== 'assistant' || message.route !== 'START_GOAL')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['parts'],
        message: 'delegated Agents belong to an assistant START_GOAL response',
      });
    }
    for (const agent of delegatedAgents) {
      if (
        agent.threadId !== message.threadId ||
        agent.runId !== message.workflowRunId ||
        (agent.executionAgent && agent.executionAgent.source.turnId !== message.turnId)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['parts'],
          message: 'delegated Agent identity must match its persisted thread and Goal run',
        });
      }
    }
  });

const AssistantMessageReadProjectionSchema = AssistantMessageSchema.safeExtend({
  parts: z.array(AssistantReadMessagePartSchema).min(1).max(100),
});

export function parsePersistedAssistantMessage(rawMessage) {
  return AssistantMessageReadProjectionSchema.parse({
    ...rawMessage,
    parts: rawMessage.parts.map((part) =>
      part?.type === 'delegated_agent' ? normalizePersistedDelegatedAgentPart(part) : part
    ),
  });
}

export const AssistantThreadSchema = z
  .object({
    id: UuidSchema,
    tenantId: UuidSchema,
    ownerUserId: ClerkUserIdSchema,
    ownerOrganizationId: ClerkOrganizationIdSchema.nullable(),
    title: z.string().min(1).max(240),
    status: z.enum(['active', 'archived']),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export function responseModeForRoute(route) {
  return (
    {
      DIRECT_ANSWER: 'direct_answer',
      DISCOVER: 'discover',
      AXWISE_ONE_SHOT: 'one_shot',
    }[route] || null
  );
}

export function assistantThreadTitle(message) {
  const compact = String(message).replace(/\s+/gu, ' ').trim();
  return compact.length <= 80 ? compact : `${compact.slice(0, 79).trimEnd()}…`;
}
