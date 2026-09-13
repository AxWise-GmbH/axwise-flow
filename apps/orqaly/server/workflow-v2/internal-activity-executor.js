import { artifactContentHash, canonicalHash } from '../../lib/workflow-v2/canonical.js';
import {
  OrqalyPlanInputV2Schema,
  PlanningResultSchema,
  ResearchArtifactPayloadV2Schema,
  ScopeArtifactV2Schema,
  executionTaskSemanticHash,
} from '../../shared/workflow-v2/contracts.js';
import { deterministicUuid } from './ids.js';
import { deriveReaderOutputContract } from './reader-output-contract.js';

function artifact(context, reference) {
  const value = context.artifacts.find(
    (candidate) =>
      candidate.artifactId === reference.artifactId &&
      candidate.artifactHash === reference.artifactHash &&
      candidate.kind === reference.kind
  );
  if (!value) throw new Error(`immutable artifact ${reference.artifactId} is required`);
  return value;
}

function fact(context, kind, payload, sourceArtifacts) {
  const sourceArtifactIds = sourceArtifacts
    .map((value) => value.artifactId)
    .sort((left, right) => left.localeCompare(right));
  const base = {
    artifactId: deterministicUuid(context.operationId, 'artifact', kind),
    kind,
    contentType: 'application/json',
    payload,
    markdown: null,
    sourceArtifactIds,
  };
  return { ...base, artifactHash: artifactContentHash(base) };
}

export function workflowWorkShape(scope) {
  return scope.deliverableProfile.artifactType;
}

export function workflowPlanRequirements(scope) {
  return scope.requirements.map((requirement) => ({ ...requirement }));
}

const BASE_RUBRIC = Object.freeze([
  'Evidence, assumptions, and gaps are distinguished.',
  'Metrics and validation steps make outcomes testable.',
  'Prioritization and non-goals bound the work.',
  'Problem, domain, and desired outcome are explicit.',
  'Requirements map to Given/When/Then acceptance criteria.',
  'Risks and next steps are actionable.',
  'Users, jobs, and pains are concrete.',
]);

const RUBRIC_BY_ARTIFACT_TYPE = Object.freeze({
  product_prd: BASE_RUBRIC,
  software_prd: Object.freeze([
    ...BASE_RUBRIC,
    'Technical boundaries, interfaces, data, security, reliability, and failure handling are explicit.',
  ].sort()),
  research_strategy: Object.freeze([
    'Evidence, assumptions, conflicts, and gaps are distinguished.',
    'Metrics and validation steps make the recommendation testable.',
    'Options, priorities, and non-goals make trade-offs explicit.',
    'Problem, domain, audience, and desired outcome are explicit.',
    'Requirements map to Given/When/Then acceptance criteria.',
    'Risks, decisions, and next steps are actionable.',
  ]),
  content_artifact: Object.freeze([
    'Audience needs, purpose, and desired response are explicit.',
    'Evidence, assumptions, and gaps are distinguished.',
    'Required content and acceptance criteria are traceable.',
    'Risks, validation, and next steps are proportionate to the artifact.',
  ]),
  operational_plan: Object.freeze([
    'Evidence, assumptions, dependencies, and gaps are distinguished.',
    'Metrics, milestones, and validation gates are explicit.',
    'Objectives, stakeholders, priorities, and non-goals are explicit.',
    'Requirements map to Given/When/Then acceptance criteria.',
    'Risks, owners, controls, and next steps are actionable.',
  ]),
  launch_authorization: Object.freeze([
    'Decision criteria and the bounded launch authority are explicit.',
    'Evidence, conflicts, assumptions, and gaps are distinguished.',
    'Every unmet gate has an exact remediation or no-go consequence.',
    'Requirements map to Given/When/Then acceptance criteria.',
    'Risks, validation, and next decision steps are explicit.',
  ]),
  general_artifact: Object.freeze([
    'Audience, problem, domain, and desired outcome are explicit.',
    'Evidence, assumptions, and gaps are distinguished.',
    'Priorities, non-goals, and acceptance criteria bound the artifact.',
    'Risks, validation, and next steps are actionable.',
  ]),
});

const CORE_BY_ARTIFACT_TYPE = Object.freeze({
  product_prd: ['product requirements synthesizer', ['prd']],
  software_prd: ['software requirements synthesizer', ['prd']],
  research_strategy: ['research strategy synthesizer', ['product_strategy']],
  content_artifact: ['evidence-grounded content synthesizer', ['evidence_synthesis']],
  operational_plan: ['operational plan synthesizer', ['product_strategy']],
  launch_authorization: ['launch decision synthesizer', ['evidence_synthesis']],
  general_artifact: ['evidence-grounded artifact synthesizer', ['evidence_synthesis']],
});

function specialistDefinitions(artifactType) {
  const specialists = [
    {
      stageKey: 'product-user-analysis',
      title: 'Product, audience, and user-needs analysis',
      requiredRole: 'product and user-needs specialist',
      lens: 'Analyze the accepted problem, desired outcome, audiences, jobs, pains, journeys, priorities, non-goals, metrics, validation needs, risks, and open product decisions.',
      requiredCapabilities: ['product_strategy'],
      categories: ['deliverable', 'interview', 'persona', 'prd'],
    },
    {
      stageKey: 'domain-evidence-analysis',
      title: 'Domain, evidence, and boundary analysis',
      requiredRole: 'domain and evidence specialist',
      lens: 'Analyze domain constraints, immutable evidence, assumptions, conflicts, gaps, policies, limits, risks, and exact claim boundaries without inventing authority.',
      requiredCapabilities: ['evidence_synthesis'],
      categories: ['deliverable', 'evidence', 'limit', 'policy'],
    },
  ];
  if (artifactType === 'software_prd') {
    specialists.push({
      stageKey: 'software-architecture-analysis',
      title: 'Software architecture and assurance analysis',
      requiredRole: 'software architecture specialist',
      lens: 'Analyze system boundaries, interfaces, data, security, privacy, reliability, failure handling, observability, rollout, and requirement-linked technical verification.',
      requiredCapabilities: ['prd'],
      categories: ['limit', 'policy', 'prd'],
    });
  }
  return specialists;
}

export function requiredCapabilitySetsForScope(scope) {
  const artifactType = workflowWorkShape(scope);
  const sets = [
    CORE_BY_ARTIFACT_TYPE[artifactType][1],
    ...specialistDefinitions(artifactType).map((specialist) => specialist.requiredCapabilities),
  ];
  return [...new Map(sets.map((values) => {
    const canonical = [...new Set(values)].sort();
    return [canonical.join('\0'), canonical];
  })).values()];
}

function selectAgent(agentCatalogue, requiredCapabilities) {
  const eligible = agentCatalogue.filter((agent) =>
    requiredCapabilities.every((capability) => agent.capabilities.includes(capability))
  );
  eligible.sort(
    (left, right) =>
      right.qualityScoreMicros - left.qualityScoreMicros ||
      left.costPerRunCents - right.costPerRunCents ||
      left.id.localeCompare(right.id)
  );
  return eligible[0] || null;
}

function requirementSubset(requirements, categories) {
  const subset = requirements
    .filter((requirement) => categories.includes(requirement.category))
    .map((requirement) => requirement.id);
  return subset.length ? subset : requirements.map((requirement) => requirement.id);
}

const SERVER_OWNED_SOURCE_SECTION = /^(?:sources?|source appendix|references|bibliography)(?:\s*\/\s*(?:sources?|source appendix|references|bibliography))*$/iu;

export function modelOwnedRequiredSections(deliverables) {
  const sections = [...new Set(deliverables.map((deliverable) => deliverable.trim()))]
    .filter((deliverable) => deliverable && !SERVER_OWNED_SOURCE_SECTION.test(deliverable))
    .sort();
  return sections.length ? sections : ['Artifact'];
}

function taskDefinition({
  input,
  scope,
  stageKey,
  title,
  taskKind,
  requiredRole,
  lens,
  requiredCapabilities,
  acceptanceRequirementIds,
  producesFullContract,
  dependsOnStageKeys,
}) {
  const capabilities = [...new Set(requiredCapabilities)].sort();
  // Tenant/status/capability filtering occurs in the repository. Rank only the
  // eligible union returned for the plan's exact capability sets.
  const agent = selectAgent(input.agentCatalogue, capabilities);
  if (!agent) {
    const error = new Error(
      `no active tenant agent satisfies ${requiredRole}: ${capabilities.join(', ')}`
    );
    error.code = 'ORQALY_REQUIRED_AGENT_UNAVAILABLE';
    throw error;
  }
  const taskCore = {
    stageId: deterministicUuid(
      input.acceptedScope.artifactId,
      input.research.artifactHash,
      'execution-stage',
      stageKey
    ),
    stageKey,
    title,
    taskKind,
    requiredRole,
    lens,
    requiredCapabilities: capabilities,
    acceptanceRequirementIds: [...acceptanceRequirementIds].sort(),
    producesFullContract,
    dependsOnStageKeys: [...dependsOnStageKeys].sort(),
    agent,
    agentId: agent.id,
    toolIds: [...agent.toolIds],
    budgetCents: agent.costPerRunCents,
    dataBoundary: [...new Set([...(scope.limits || []), ...(scope.policies || [])])].sort(),
  };
  return { ...taskCore, inputHash: executionTaskSemanticHash(taskCore) };
}

function planning(context) {
  const input = OrqalyPlanInputV2Schema.parse(context.inputPayload);
  const scopeArtifact = artifact(context, input.acceptedScope);
  const researchArtifact = artifact(context, input.research);
  const scope = ScopeArtifactV2Schema.parse(scopeArtifact.payload);
  const research = ResearchArtifactPayloadV2Schema.parse(researchArtifact.payload);
  const artifactType = workflowWorkShape(scope);
  const requirements = workflowPlanRequirements(scope);
  const allRequirementIds = requirements.map((requirement) => requirement.id);
  const specialists = specialistDefinitions(artifactType);
  const tasks = specialists.map((specialist) =>
    taskDefinition({
      input,
      scope,
      stageKey: specialist.stageKey,
      title: specialist.title,
      taskKind: 'specialist_analysis',
      requiredRole: specialist.requiredRole,
      lens: specialist.lens,
      requiredCapabilities: specialist.requiredCapabilities,
      acceptanceRequirementIds: requirementSubset(requirements, specialist.categories),
      producesFullContract: false,
      dependsOnStageKeys: [],
    })
  );
  const [coreRole, coreCapabilities] = CORE_BY_ARTIFACT_TYPE[artifactType];
  tasks.push(taskDefinition({
    input,
    scope,
    stageKey: 'core-draft',
    title: 'Coherent full-contract synthesis',
    taskKind: 'core_draft',
    requiredRole: coreRole,
    lens: 'Synthesize the exact specialist analyses into one coherent artifact that satisfies every accepted requirement, acceptance criterion, required section, rubric dimension, and evidence boundary.',
    requiredCapabilities: coreCapabilities,
    acceptanceRequirementIds: allRequirementIds,
    producesFullContract: true,
    dependsOnStageKeys: specialists.map((specialist) => specialist.stageKey),
  }));

  const requiredSections = modelOwnedRequiredSections(
    scope.deliverableProfile.requiredSections
  );

  const outputContract = {
    schemaVersion: 'orqaly.markdown-output-contract.v2',
    format: 'text/markdown',
    artifactType,
    requiredSections,
    requirementIds: allRequirementIds,
    rubric: [...RUBRIC_BY_ARTIFACT_TYPE[artifactType]].sort(),
    acceptanceCriteria: scope.acceptanceCriteria.map((criterion) => ({
      ...criterion,
      supports: [...criterion.supports],
    })),
    evidenceReadiness: research.readiness,
    launchReadyAllowed:
      research.readiness === 'ready' && artifactType === 'launch_authorization',
    sourceAppendixRequired: (research.sourceCatalogue || []).length > 0,
    readerOutput: deriveReaderOutputContract(scope),
  };
  const planCore = {
    schemaVersion: 'orqaly.plan.v2',
    acceptedScopeArtifact: input.acceptedScope,
    researchArtifact: input.research,
    workShape: artifactType,
    requirements,
    outputContract,
    tasks,
  };
  const plan = PlanningResultSchema.parse({ ...planCore, planHash: canonicalHash(planCore) });
  return {
    resultType: 'plan_created',
    artifact: fact(context, 'plan', plan, [scopeArtifact, researchArtifact]),
    planning: plan,
  };
}

export function createInternalActivityExecutor() {
  return {
    async execute({ context }) {
      if (context.stageKind !== 'planning') {
        return {
          kind: 'failed',
          retryable: false,
          errorClass: 'ORQALY_ACTIVITY_NOT_IMPLEMENTED',
        };
      }
      try {
        return { kind: 'completed', result: planning(context) };
      } catch (error) {
        if (
          [
            'ORQALY_AMBIGUOUS_READER_OUTPUT_CONSTRAINT',
            'ORQALY_INVALID_READER_OUTPUT_CONSTRAINT',
            'ORQALY_REQUIRED_AGENT_UNAVAILABLE',
          ].includes(error?.code)
        ) {
          return {
            kind: 'failed',
            retryable: false,
            errorClass: error.code,
          };
        }
        throw error;
      }
    },
  };
}
