import { CANONICALIZATION_ALGORITHM, canonicalJsonSha256 } from '../src/domain/canonical.js';
import { executionPlanV2HashPayload } from '../src/domain/execution-contracts.js';

export const HASH_A = 'a'.repeat(64);
export const HASH_B = 'b'.repeat(64);
export const HASH_C = 'c'.repeat(64);
export const HASH_D = 'd'.repeat(64);
export const AGENT_COORDINATOR_ID = '11111111-1111-4111-8111-111111111111';
export const AGENT_WORKER_ID = '22222222-2222-4222-8222-222222222222';
export const AGENT_REVIEWER_ID = '33333333-3333-4333-8333-333333333333';
export const TEAM_ID = '44444444-4444-4444-8444-444444444444';
export const RUN_ID = '55555555-5555-4555-8555-555555555555';

export function persona(agentRef, displayName = agentRef) {
  const sourceManifest = {
    profile_type: 'synthetic_professional_profile',
    profile_version: 'axwise_executor_persona_v1',
    identity_disclosure: 'Synthetic non-human professional profile.',
    role: 'universal_task_specialist',
    mission: 'Complete only the assigned and approved part of the task.',
    expertise: ['analysis'],
    domain_knowledge: ['general_operations'],
    capabilities: ['analysis'],
    methods: ['evidence-first'],
    work_style: { planning: 'requirements-first' },
    communication_style: 'Clear and explicit about uncertainty.',
    decision_lens: 'Prefer reversible, evidenced actions',
    output_contract: {},
    risks: [],
    boundaries: ['No authority outside the approved plan'],
    task_fit: {},
    provenance: { source: 'axwise' },
  };
  return {
    version: 'axwise_executor_persona_v1',
    personaId: `${agentRef}-persona`,
    contentHash: canonicalJsonSha256(sourceManifest),
    displayName,
    identityDisclosure: sourceManifest.identity_disclosure,
    role: sourceManifest.role,
    mission: sourceManifest.mission,
    expertise: ['analysis'],
    domainKnowledge: ['general_operations'],
    capabilities: ['analysis'],
    methods: ['evidence-first'],
    workStyle: sourceManifest.work_style,
    communicationStyle: sourceManifest.communication_style,
    decisionLens: 'Prefer reversible, evidenced actions',
    outputContract: {},
    risks: [],
    boundaries: ['No authority outside the approved plan'],
    taskFit: {},
    provenance: { source: 'axwise' },
    sourceManifest,
    sourceMetadata: {
      personaKind: 'required_role',
      requiredRole: sourceManifest.role,
      roleDerivation: 'test_fixture',
      evidenceReferences: [],
    },
  };
}

export function proposalRequest(overrides = {}) {
  const value = {
    version: 'orqaly_materialize_agent_request_v1',
    sourceTask: {
      taskId: 'task-1',
      title: 'Prepare a customer-ready comparison',
      description: 'Research, draft and review a comparison.',
      projectId: 'project-1',
      conversationId: 'conversation-1',
    },
    agentKind: 'temporary',
    coordinatorAgentRef: 'coordinator',
    team: [
      {
        agentRef: 'coordinator',
        parentAgentRef: null,
        role: 'coordinator',
        persona: persona('coordinator', 'Coordinator'),
        allowedDescriptorFamilies: ['reason'],
        allowedEffectProfiles: ['none'],
      },
      {
        agentRef: 'worker',
        parentAgentRef: 'coordinator',
        role: 'worker',
        persona: persona('worker', 'Research worker'),
        allowedDescriptorFamilies: ['reason'],
        allowedEffectProfiles: ['none'],
      },
      {
        agentRef: 'reviewer',
        parentAgentRef: null,
        role: 'reviewer',
        persona: persona('reviewer', 'Independent reviewer'),
        allowedDescriptorFamilies: ['review'],
        allowedEffectProfiles: ['none'],
      },
    ],
    plan: {
      version: 'orqaly_execution_plan_proposal_v1',
      planId: 'axwise-plan-1',
      sourceDecisionId: 'decision-1',
      contentHash: HASH_B,
      steps: [
        {
          nodeId: 'research',
          stepKind: 'reason',
          descriptor: { key: 'reason', version: '1.0', contentHash: HASH_C },
          effectProfile: 'none',
          dataEgressProfile: 'none',
          dependsOn: [],
          assignedAgentRef: 'worker',
          reviewerAgentRef: 'reviewer',
          input: { objective: 'Compare the options' },
          limits: {
            maximumDurationSeconds: 120,
            maximumAttempts: 1,
            maximumCostMinor: 0,
            currency: 'EUR',
          },
        },
      ],
      metadata: {},
    },
    idempotencyKey: 'materialize-task-1',
  };
  return { ...value, ...overrides };
}

export function materializedPlan(overrides = {}) {
  const canonicalInput = { objective: 'Compare the options' };
  const plan = {
    version: 'orqaly_execution_plan_v2',
    contractVersion: '1.0',
    canonicalization: CANONICALIZATION_ALGORITHM,
    sourceDecisionId: 'decision-1',
    sourcePlanId: 'axwise-plan-1',
    sourceContentHash: HASH_B,
    planVersion: 1,
    contentHash: HASH_A,
    owningAgentId: AGENT_COORDINATOR_ID,
    teamId: TEAM_ID,
    teamMemberIds: [AGENT_COORDINATOR_ID, AGENT_WORKER_ID, AGENT_REVIEWER_ID].sort(),
    nodes: [
      {
        nodeId: 'research',
        title: 'Research options',
        objective: 'Compare the options with evidence',
        stepKind: 'reason',
        descriptor: {
          contractVersion: '1.0',
          descriptorKey: 'agent_reason_v1',
          schemaVersion: '1.0',
          contentHash: HASH_A,
        },
        executorBinding: {
          contractVersion: '1.0',
          bindingKey: 'bounded_agent_executor',
          bindingVersion: '1.0',
          contentHash: HASH_B,
        },
        assignedAgentId: AGENT_WORKER_ID,
        personaVersion: {
          contractVersion: '1.0',
          personaId: 'worker-persona',
          personaVersion: '1',
          contentHash: persona('worker').contentHash,
        },
        reviewerAgentId: AGENT_REVIEWER_ID,
        requiresDistinctReviewer: true,
        dependencies: [],
        canonicalInput,
        canonicalInputHash: canonicalJsonSha256(canonicalInput),
        expectedOutputSchemaHash: HASH_C,
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
        limits: {
          maximumTurns: 4,
          maximumTokens: 8_000,
          maximumToolCalls: 2,
          maximumRuntimeSeconds: 120,
          maximumAttempts: 1,
          maximumCostMinor: 0,
          currency: 'EUR',
        },
        deadline: null,
      },
    ],
    createdAt: '2026-09-04T10:00:00.000Z',
    ...overrides,
  };
  plan.contentHash = canonicalJsonSha256(executionPlanV2HashPayload(plan));
  return plan;
}

export function principal(overrides = {}) {
  return {
    version: 'orqaly_request_principal_v1',
    audience: 'orqaly-agentic-control-plane',
    requestId: 'request-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    userId: 'user-1',
    actorType: 'user',
    roles: ['owner'],
    scopes: [
      'agentic:admit',
      'agentic:agent:write',
      'agentic:approval:decide',
      'agentic:materialize',
      'agentic:plan:write',
      'agentic:read',
    ],
    request: {
      method: 'GET',
      path: '/v1/test',
      bodyHash: canonicalJsonSha256(null),
      idempotencyKey: null,
      ifMatch: null,
    },
    issuedAt: '2026-09-04T10:00:00.000Z',
    expiresAt: '2026-09-04T10:05:00.000Z',
    ...overrides,
  };
}

export function appConfig(overrides = {}) {
  return {
    ORQALY_PRINCIPAL_SIGNING_KEY: 'test-key-that-is-at-least-thirty-two-bytes',
    ORQALY_PRINCIPAL_AUDIENCE: 'orqaly-agentic-control-plane',
    ORQALY_PRINCIPAL_MAX_TTL_SECONDS: 300,
    AGENTIC_EXECUTION_ENABLED: false,
    AGENTIC_CAPABILITIES_JSON: JSON.stringify({
      executors: ['agent', 'artifact', 'human', 'review'],
      descriptors: ['agent_reason_v1'],
      connections: [],
    }),
    HTTP_JSON_LIMIT: '256kb',
    RATE_LIMIT_WINDOW_MS: 60_000,
    RATE_LIMIT_MAX_REQUESTS: 120,
    ...overrides,
  };
}
