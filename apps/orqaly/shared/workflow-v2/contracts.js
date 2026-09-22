import { z } from 'zod';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import canonicalizeNativeJson from 'canonicalize';
import {
  PrepareSolutionInputV2Schema,
  PrepareSolutionResponseV2Schema,
} from './native-workflow-contracts.js';
export {
  PrepareSolutionInputV2Schema,
  PrepareSolutionResponseV2Schema,
} from './native-workflow-contracts.js';
import {
  artifactContentHash,
  canonicalHash,
  canonicalJson,
  sha256Hex,
} from '../../lib/workflow-v2/canonical.js';
import { AssistantRouteSchema } from './assistant-primitives.js';
import { SolutionSpecSchema } from './solution-contracts.js';
import {
  ASSISTANT_CONTEXT_AUTHORITY_POLICY,
  ASSISTANT_CONTEXT_ENVELOPE_TYPE,
  ASSISTANT_CONTEXT_MAX_EXCERPT_UTF16,
  ASSISTANT_CONTEXT_MAX_PAIRS,
  ASSISTANT_CONTEXT_MAX_SOURCE_UTF16,
  ASSISTANT_CONTEXT_PURPOSE,
  ASSISTANT_CONTEXT_SELECTION_POLICY,
  ASSISTANT_CONTEXT_SOURCE,
  ASSISTANT_CONTEXT_TRUNCATION_MARKER,
  renderAssistantContextSourceV1,
  utf16Length,
} from './assistant-context-envelope.js';
import { isCanonicalPublicHttpsUrl } from './public-https-url.js';
import {
  createCapabilityOperationSchemas, validateCapabilityEnvelopeConsent,
  TranscriptCorpusArtifactFactSchema, QualitativeAnalysisArtifactFactSchema, SimulationArtifactFactSchema,
  TranscriptCorpusAdmittedResultSchema, EvidenceAnalyzedResultSchema, SimulationCompletedResultSchema,
} from './capability-contracts.js';
import { CapabilityWorkProfileSchema, createCapabilityWorkEventSchemas } from './capability-work-contracts.js';
import { capabilityAwareSchema } from './capability-public-preflight.js';

export { isCanonicalPublicHttpsUrl } from './public-https-url.js';

export const WORKFLOW_CONTRACT_VERSION = 'orqaly.workflow.v2';
export const AXWISE_OPERATION_CONTRACT_VERSION = 'axwise.operation.v2';
export const GEMINI_MODEL = 'models/gemini-3.8-flash';
export const GEMINI_REASONING_LEVEL = 'high';

export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const UuidSchema = z.string().uuid();
export const ClerkUserIdSchema = z.string().regex(/^user_[A-Za-z0-9]+$/);
export const ClerkOrganizationIdSchema = z.string().regex(/^org_[A-Za-z0-9]+$/);

export const ChatModeSchema = z.enum(['simple', 'advanced']);
export const RunStatusSchema = z.enum([
  'requested',
  'running',
  'awaiting_gate_1',
  'awaiting_gate_2',
  'awaiting_capability_input',
  'completed',
  'completed_with_evidence_gaps',
  'blocked',
  'failed',
  'cancelled',
]);
export const StageStatusSchema = z.enum([
  'pending',
  'ready',
  'queued',
  'running',
  'polling',
  'awaiting_approval',
  'completed',
  'completed_with_evidence_gaps',
  'blocked',
  'failed',
  'cancelled',
]);
export const AttemptStatusSchema = z.enum([
  'queued',
  'running',
  'polling',
  'succeeded',
  'failed',
  'abandoned',
]);
export const StageKindSchema = z.enum([
  'compile_scope',
  'gate_1',
  'execute_research',
  'planning',
  'gate_2',
  'execution',
  'evaluation',
  'synthesis',
]);
export const EvidenceReadinessSchema = z.enum(['ready', 'ready_with_gaps', 'blocked']);
export const EvidenceCriticalitySchema = z.enum(['blocking', 'nonblocking']);
export const EvidenceVerificationBasisSchema = z.enum(['grounded_claims', 'selected_evidence']);
export const ApprovalKindSchema = z.enum(['scope', 'plan']);
export const EvidenceSourceTypeSchema = z.enum([
  'grounded_web',
  'government',
  'primary_law',
  'official_statistics',
  'academic',
  'standard',
  'industry',
]);

export const DeliverableArtifactTypeSchema = z.enum([
  'product_prd',
  'software_prd',
  'research_strategy',
  'content_artifact',
  'operational_plan',
  'launch_authorization',
  'general_artifact',
]);

export const RequirementCategorySchema = z.enum([
  'deliverable',
  'persona',
  'interview',
  'prd',
  'limit',
  'policy',
  'evidence',
]);

function semanticContractId(prefix, value) {
  const { id: _id, ...semanticValue } = value;
  return `${prefix}-${canonicalHash(semanticValue).slice(0, 16)}`;
}

function canonicalStringList(values) {
  return [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function addCanonicalStringListIssue(ctx, value, field) {
  if (canonicalJson(value[field]) !== canonicalJson(canonicalStringList(value[field]))) {
    ctx.addIssue({
      code: 'custom',
      path: [field],
      message: `${field} must be sorted and unique`,
    });
  }
}

function utf16String(maximum) {
  return z
    .string()
    .min(1)
    .superRefine((value, ctx) => {
      if (utf16Length(value) > maximum) {
        ctx.addIssue({
          code: 'too_big',
          maximum,
          inclusive: true,
          origin: 'string',
          message: `string must contain at most ${maximum} UTF-16 code units`,
        });
      }
    });
}

export const DeliverableProfileV1Schema = z
  .object({
    schemaVersion: z.literal('axwise.deliverable-profile.v1'),
    artifactType: DeliverableArtifactTypeSchema,
    domain: z.string().min(1).max(500),
    problem: z.string().min(1).max(2000),
    desiredOutcome: z.string().min(1).max(2000),
    audiences: z.array(z.string().min(1).max(500)).min(1).max(24),
    nonGoals: z.array(z.string().min(1).max(1000)).max(40),
    requiredSections: z.array(z.string().min(1).max(300)).min(1).max(80),
  })
  .strict()
  .superRefine((profile, ctx) => {
    for (const field of ['audiences', 'nonGoals', 'requiredSections']) {
      addCanonicalStringListIssue(ctx, profile, field);
    }
  });

export const AcceptedRequirementV1Schema = z
  .object({
    id: z.string().regex(/^req-[a-f0-9]{16}$/u),
    category: RequirementCategorySchema,
    description: z.string().min(1).max(2000),
    priority: z.enum(['P0', 'P1', 'P2']),
    authority: z.enum(['owner', 'safe_default', 'axwise_derived']),
  })
  .strict()
  .superRefine((requirement, ctx) => {
    if (requirement.id !== semanticContractId('req', requirement)) {
      ctx.addIssue({
        code: 'custom',
        path: ['id'],
        message: 'requirement ID must equal the canonical semantic requirement hash',
      });
    }
  });

export const AcceptanceCriterionV1Schema = z
  .object({
    id: z.string().regex(/^acc-[a-f0-9]{16}$/u),
    given: z.string().min(1).max(2000),
    when: z.string().min(1).max(2000),
    then: z.string().min(1).max(2000),
    supports: z
      .array(z.string().regex(/^req-[a-f0-9]{16}$/u))
      .min(1)
      .max(120),
  })
  .strict()
  .superRefine((criterion, ctx) => {
    addCanonicalStringListIssue(ctx, criterion, 'supports');
    if (criterion.id !== semanticContractId('acc', criterion)) {
      ctx.addIssue({
        code: 'custom',
        path: ['id'],
        message: 'acceptance ID must equal the canonical semantic acceptance hash',
      });
    }
  });

const PublicHttpsUrlSchema = z
  .string()
  .min(1)
  .max(4000)
  .refine(isCanonicalPublicHttpsUrl, 'source URL must be canonical public HTTPS');

const UtcRfc3339Schema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u)
  .datetime({ offset: false });

function sourceTypesSchema({ min = 0 } = {}) {
  return z
    .array(EvidenceSourceTypeSchema)
    .min(min)
    .max(7)
    .superRefine((values, ctx) => {
      const canonical = [...new Set(values)].sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0
      );
      if (canonicalJson(values) !== canonicalJson(canonical)) {
        ctx.addIssue({
          code: 'custom',
          message: 'source types must be sorted and unique',
        });
      }
    });
}

export const SourceSpanSchema = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    text: z.string().min(1),
    sha256: Sha256Schema,
    offsetUnit: z.literal('utf16_code_units'),
  })
  .strict()
  .refine((span) => span.end > span.start, 'source span end must be greater than start');

export const EvidenceRequirementSchema = z
  .object({
    id: z.string().min(1).max(120),
    claimType: z.string().min(1).max(120),
    description: z.string().min(1).max(1000),
    criticality: EvidenceCriticalitySchema,
    evidenceRole: z.enum([
      'grounded_claim',
      'selected_artifact_proof',
      'future_authorization_proof',
    ]),
    verificationBasis: EvidenceVerificationBasisSchema,
    appliesWhen: z.string().min(1).max(1000),
    acceptedSourceTypes: sourceTypesSchema({ min: 1 }),
    allowedSourceHosts: z
      .array(
        z
          .string()
          .min(1)
          .max(120)
          .refine(
            (value) => isCanonicalPublicHttpsUrl(`https://${value}`),
            'allowed source host must be a canonical public hostname'
          )
      )
      .max(20)
      .default([]),
  })
  .strict()
  .superRefine((requirement, ctx) => {
    const expectedVerificationBasis =
      requirement.evidenceRole === 'grounded_claim' ? 'grounded_claims' : 'selected_evidence';
    if (requirement.verificationBasis !== expectedVerificationBasis) {
      ctx.addIssue({
        code: 'custom',
        path: ['verificationBasis'],
        message: 'evidenceRole must bind its exact verificationBasis authority',
      });
    }
    if (
      canonicalJson(requirement.allowedSourceHosts) !==
      canonicalJson([...new Set(requirement.allowedSourceHosts)].sort())
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['allowedSourceHosts'],
        message: 'allowed source hosts must be sorted and unique',
      });
    }
    const authoritative = new Set(['government', 'primary_law', 'standard', 'academic']);
    if (
      requirement.criticality === 'blocking' &&
      !requirement.acceptedSourceTypes.some((sourceType) => authoritative.has(sourceType))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['acceptedSourceTypes'],
        message: 'blocking evidence requires an authoritative source type',
      });
    }
  });

export const ScopeArtifactV2Schema = z
  .object({
    schemaVersion: z.literal('axwise.scope.v2'),
    objective: z.string().min(1).max(6000),
    objectiveSourceSpans: z.array(SourceSpanSchema).min(1).max(24),
    topicAnchors: z
      .array(
        z
          .object({
            value: z.string().min(1).max(300),
            sourceSpans: z.array(SourceSpanSchema).min(1).max(12),
          })
          .strict()
      )
      .min(1)
      .max(24),
    geography: z.array(z.string().min(1).max(160)).max(24).default([]),
    evidenceRequirements: z.array(EvidenceRequirementSchema).max(12),
    deliverables: z.array(z.string().min(1).max(500)).min(1).max(24),
    personas: z.array(z.string().min(1).max(500)).max(24).default([]),
    interviewRequirements: z.array(z.string().min(1).max(1000)).max(24).default([]),
    prdRequirements: z.array(z.string().min(1).max(1000)).max(40).default([]),
    limits: z.array(z.string().min(1).max(1000)).max(40).default([]),
    policies: z.array(z.string().min(1).max(1000)).max(40).default([]),
    assumptions: z.array(z.string().min(1).max(1000)).max(24).default([]),
    deliverableProfile: DeliverableProfileV1Schema,
    requirements: z.array(AcceptedRequirementV1Schema).min(1).max(120),
    acceptanceCriteria: z.array(AcceptanceCriterionV1Schema).min(1).max(120),
    materialClarification: z.string().min(1).max(1000).nullable().default(null),
    researchInputHash: Sha256Schema,
    authority: z
      .object({
        canonicalInputHash: Sha256Schema,
        seal: z.string().min(32).max(512),
      })
      .strict(),
  })
  .strict()
  .superRefine((scope, ctx) => {
    const evidenceRequirementIds = scope.evidenceRequirements.map((requirement) => requirement.id);
    const requirementIds = scope.requirements.map((requirement) => requirement.id);
    const acceptanceIds = scope.acceptanceCriteria.map((criterion) => criterion.id);
    if (new Set(evidenceRequirementIds).size !== evidenceRequirementIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['evidenceRequirements'],
        message: 'evidence requirements must have unique requirement IDs',
      });
    }
    if (canonicalJson(requirementIds) !== canonicalJson(canonicalStringList(requirementIds))) {
      ctx.addIssue({
        code: 'custom',
        path: ['requirements'],
        message: 'accepted requirements must be sorted by unique semantic ID',
      });
    }
    if (canonicalJson(acceptanceIds) !== canonicalJson(canonicalStringList(acceptanceIds))) {
      ctx.addIssue({
        code: 'custom',
        path: ['acceptanceCriteria'],
        message: 'acceptance criteria must be sorted by unique semantic ID',
      });
    }
    const knownRequirements = new Set(requirementIds);
    const supportedRequirements = new Set(
      scope.acceptanceCriteria.flatMap((criterion) => criterion.supports)
    );
    if (
      [...supportedRequirements].some((id) => !knownRequirements.has(id)) ||
      requirementIds.some((id) => !supportedRequirements.has(id))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['acceptanceCriteria'],
        message: 'acceptance criteria must reference and cover every accepted requirement exactly',
      });
    }
    const expectedDescriptions = {
      deliverable: scope.deliverables,
      persona: scope.personas,
      interview: scope.interviewRequirements,
      prd: scope.prdRequirements,
      limit: scope.limits,
      policy: scope.policies,
      evidence: scope.evidenceRequirements.map((requirement) => requirement.description),
    };
    for (const [category, expected] of Object.entries(expectedDescriptions)) {
      const observed = scope.requirements
        .filter((requirement) => requirement.category === category)
        .map((requirement) => requirement.description);
      if (canonicalJson([...observed].sort()) !== canonicalJson([...expected].sort())) {
        ctx.addIssue({
          code: 'custom',
          path: ['requirements'],
          message: `typed ${category} requirements must exactly project accepted scope fields`,
        });
      }
    }
  });

export const EvidenceFindingSchema = z
  .object({
    requirementId: z.string().min(1).max(120),
    status: z.enum(['verified', 'missing', 'conflicting', 'not_applicable']),
    blocking: z.boolean(),
    sourceArtifactIds: z.array(UuidSchema).max(100).default([]),
    note: z.string().min(1).max(4000),
  })
  .strict();

export const ResearchResultV2Schema = z
  .object({
    schemaVersion: z.literal('axwise.research.v2'),
    acceptedScopeArtifactId: UuidSchema,
    acceptedScopeHash: Sha256Schema,
    researchInputHash: Sha256Schema,
    readiness: EvidenceReadinessSchema,
    findings: z.array(EvidenceFindingSchema).max(200),
    boundedRepairPasses: z.number().int().min(0).max(1),
    assumptions: z.array(z.string().min(1).max(2000)).max(80),
    gaps: z.array(z.string().min(1).max(2000)).max(80),
    conflicts: z.array(z.string().min(1).max(2000)).max(80),
    claimLedgerArtifactId: UuidSchema,
  })
  .strict()
  .superRefine((result, ctx) => {
    const findingRequirementIds = result.findings.map((finding) => finding.requirementId);
    if (new Set(findingRequirementIds).size !== findingRequirementIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['findings'],
        message: 'research findings must have unique requirement IDs',
      });
    }
    const unresolvedConflict = result.findings.some((finding) => finding.status === 'conflicting');
    const missingBlocking = result.findings.some(
      (finding) => finding.blocking && finding.status === 'missing'
    );
    const missingNonblocking = result.findings.some(
      (finding) => !finding.blocking && finding.status === 'missing'
    );
    const expectedReadiness =
      unresolvedConflict || missingBlocking
        ? 'blocked'
        : missingNonblocking || result.assumptions.length
          ? 'ready_with_gaps'
          : 'ready';
    const expectedGaps = result.findings
      .filter((finding) => !finding.blocking && finding.status === 'missing')
      .map((finding) => finding.note);
    const expectedConflicts = result.findings
      .filter((finding) => finding.status === 'conflicting')
      .map((finding) => finding.note);
    if (result.readiness !== expectedReadiness) {
      ctx.addIssue({
        code: 'custom',
        path: ['readiness'],
        message: 'research readiness must block conflicts and missing blocking evidence exactly',
      });
    }
    if (
      canonicalJson(result.gaps) !== canonicalJson(expectedGaps) ||
      canonicalJson(result.conflicts) !== canonicalJson(expectedConflicts)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['gaps'],
        message: 'research gaps and conflicts must exactly project immutable finding notes',
      });
    }
  });

export const ArtifactRefSchema = z
  .object({
    artifactId: UuidSchema,
    artifactHash: Sha256Schema,
    kind: z.string().min(1).max(120),
  })
  .strict();

function addCanonicalArtifactRefListIssue(ctx, values, field = 'sourceArtifacts') {
  const artifactIds = values.map((artifact) => artifact.artifactId);
  if (canonicalJson(artifactIds) !== canonicalJson([...new Set(artifactIds)].sort())) {
    ctx.addIssue({
      code: 'custom',
      path: [field],
      message: `${field} must be sorted and unique by artifactId`,
    });
  }
}

export const ArtifactContentSchema = z
  .object({
    artifact: ArtifactRefSchema,
    contentType: z.enum(['application/json', 'text/markdown']),
    payload: z.record(z.string(), z.unknown()).nullable(),
    markdown: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((content, ctx) => {
    if (content.contentType === 'application/json' && (!content.payload || content.markdown)) {
      ctx.addIssue({
        code: 'custom',
        path: ['contentType'],
        message: 'JSON artifact content requires payload and no Markdown',
      });
    }
    if (content.contentType === 'text/markdown') {
      if (!content.payload || !content.markdown || content.payload.markdown !== content.markdown) {
        ctx.addIssue({
          code: 'custom',
          path: ['markdown'],
          message: 'Markdown content and payload.markdown must match exactly',
        });
      }
    }
    if (artifactContentHash(content) !== content.artifact.artifactHash) {
      ctx.addIssue({
        code: 'custom',
        path: ['artifact', 'artifactHash'],
        message: 'artifact reference hash does not match canonical content envelope',
      });
    }
  });

export function executionTaskSemanticInput(task) {
  return {
    stageId: task.stageId,
    stageKey: task.stageKey,
    title: task.title,
    taskKind: task.taskKind,
    requiredRole: task.requiredRole,
    lens: task.lens,
    requiredCapabilities: task.requiredCapabilities,
    acceptanceRequirementIds: task.acceptanceRequirementIds,
    producesFullContract: task.producesFullContract,
    dependsOnStageKeys: task.dependsOnStageKeys,
    agent: task.agent,
    agentId: task.agentId,
    toolIds: task.toolIds,
    budgetCents: task.budgetCents,
    dataBoundary: task.dataBoundary,
  };
}

export function executionTaskSemanticHash(task) {
  return canonicalHash(executionTaskSemanticInput(task));
}

export const ExecutionTaskSchema = z
  .object({
    stageId: UuidSchema,
    stageKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,119}$/),
    title: z.string().min(1).max(500),
    taskKind: z.enum(['core_draft', 'specialist_analysis']),
    requiredRole: z.string().min(1).max(160),
    lens: z.string().min(1).max(500),
    requiredCapabilities: z.array(z.string().min(1).max(120)).min(1).max(20),
    acceptanceRequirementIds: z
      .array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,119}$/))
      .min(1)
      .max(120),
    producesFullContract: z.boolean(),
    inputHash: Sha256Schema,
    dependsOnStageKeys: z.array(z.string().min(1).max(120)).max(40),
    agent: z.lazy(() => SelectedAgentSchema),
    agentId: UuidSchema,
    toolIds: z.array(UuidSchema).max(40),
    budgetCents: z.number().int().nonnegative(),
    dataBoundary: z.array(z.string().min(1).max(500)).max(40),
  })
  .strict()
  .superRefine((task, ctx) => {
    for (const field of [
      'requiredCapabilities',
      'acceptanceRequirementIds',
      'dependsOnStageKeys',
      'dataBoundary',
    ]) {
      const values = task[field];
      const canonical = [...new Set(values)].sort();
      if (canonicalJson(values) !== canonicalJson(canonical)) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} must be sorted and unique`,
        });
      }
    }
    if (
      task.agentId !== task.agent.id ||
      canonicalJson(task.toolIds) !== canonicalJson(task.agent.toolIds) ||
      task.budgetCents !== task.agent.costPerRunCents ||
      task.requiredCapabilities.some((capability) => !task.agent.capabilities.includes(capability))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['agent'],
        message: 'task must bind an exact agent snapshot satisfying every required capability',
      });
    }
    if (task.producesFullContract !== (task.taskKind === 'core_draft')) {
      ctx.addIssue({
        code: 'custom',
        path: ['producesFullContract'],
        message: 'only the coherent core draft may target the complete output contract',
      });
    }
    if (executionTaskSemanticHash(task) !== task.inputHash) {
      ctx.addIssue({
        code: 'custom',
        path: ['inputHash'],
        message: 'task semantic hash does not match its immutable task definition',
      });
    }
  });

export const WorkShapeSchema = z.enum([
  'product_prd',
  'software_prd',
  'research_strategy',
  'content_artifact',
  'operational_plan',
  'launch_authorization',
  'general_artifact',
]);

export const PlanRequirementSchema = AcceptedRequirementV1Schema;

const MarkdownOutputContractShape = {
  format: z.literal('text/markdown'),
  artifactType: DeliverableArtifactTypeSchema,
  requiredSections: z.array(z.string().min(1).max(300)).min(1).max(80),
  requirementIds: z
    .array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,119}$/))
    .min(1)
    .max(120),
  rubric: z.array(z.string().min(1).max(1000)).min(1).max(20),
  acceptanceCriteria: z.array(AcceptanceCriterionV1Schema).min(1).max(120),
  evidenceReadiness: EvidenceReadinessSchema,
  launchReadyAllowed: z.boolean(),
  sourceAppendixRequired: z.boolean(),
};

function validateMarkdownOutputContract(contract, ctx) {
  for (const field of ['requiredSections', 'requirementIds', 'rubric']) {
    const values = contract[field];
    const canonical = [...new Set(values)].sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0
    );
    if (canonicalJson(values) !== canonicalJson(canonical)) {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: `${field} must be sorted and unique`,
      });
    }
  }
  const expectedLaunchAuthority =
    contract.evidenceReadiness === 'ready' && contract.artifactType === 'launch_authorization';
  if (contract.launchReadyAllowed !== expectedLaunchAuthority) {
    ctx.addIssue({
      code: 'custom',
      path: ['launchReadyAllowed'],
      message: 'launch-ready authority requires ready evidence and a launch-authorization artifact',
    });
  }
  const acceptanceIds = contract.acceptanceCriteria.map((criterion) => criterion.id);
  const supportedIds = canonicalStringList(
    contract.acceptanceCriteria.flatMap((criterion) => criterion.supports)
  );
  if (
    canonicalJson(acceptanceIds) !== canonicalJson(canonicalStringList(acceptanceIds)) ||
    canonicalJson(supportedIds) !== canonicalJson(contract.requirementIds)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['acceptanceCriteria'],
      message: 'output acceptance criteria must be sorted and cover every requirement ID',
    });
  }
}

const ReaderFormatSchema = z.enum([
  'agenda',
  'checklist',
  'email',
  'faq',
  'message',
  'post',
  'script',
  'template',
]);

const ReaderItemKindSchema = z.enum([
  'agenda_item',
  'checklist_item',
  'email_section',
  'faq_item',
  'message_section',
  'post_section',
  'script_step',
  'template_section',
]);

const READER_ITEM_KIND_BY_FORMAT = Object.freeze({
  agenda: 'agenda_item',
  checklist: 'checklist_item',
  email: 'email_section',
  faq: 'faq_item',
  message: 'message_section',
  post: 'post_section',
  script: 'script_step',
  template: 'template_section',
});

export const ReaderOutputV1Schema = z
  .object({
    schemaVersion: z.literal('orqaly.reader-output.v1'),
    readerFormat: z
      .object({
        value: ReaderFormatSchema,
        requirementId: z.string().regex(/^req-[a-f0-9]{16}$/u),
      })
      .strict(),
    wordLimit: z
      .object({
        maximumWords: z.number().int().positive().max(120_000),
        basis: z.enum(['owner_explicit', 'bounded_content_default_v1']),
        requirementId: z.string().regex(/^req-[a-f0-9]{16}$/u),
      })
      .strict()
      .nullable(),
    itemLimit: z
      .object({
        exactItems: z.number().int().positive().max(500),
        itemKind: ReaderItemKindSchema,
        requirementId: z.string().regex(/^req-[a-f0-9]{16}$/u),
      })
      .strict()
      .nullable(),
    measurement: z
      .object({
        scope: z.literal('reader_markdown_before_server_disclosures'),
        wordCounter: z.literal('unicode_words_v1'),
        itemCounter: z.literal('top_level_markdown_items_v1'),
      })
      .strict(),
  })
  .strict()
  .superRefine((readerOutput, ctx) => {
    if (
      readerOutput.wordLimit?.basis === 'bounded_content_default_v1' &&
      readerOutput.wordLimit.maximumWords !== 250
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['wordLimit', 'maximumWords'],
        message: 'bounded content default v1 is exactly 250 reader words',
      });
    }
    if (
      readerOutput.itemLimit &&
      readerOutput.itemLimit.itemKind !==
        READER_ITEM_KIND_BY_FORMAT[readerOutput.readerFormat.value]
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['itemLimit', 'itemKind'],
        message: 'reader item kind must match the selected reader format',
      });
    }
  });

// V1 is intentionally untagged. Keeping this branch exact preserves hashes and
// replay validation for plans created before reader-output constraints existed.
export const MarkdownOutputContractV1Schema = z
  .object(MarkdownOutputContractShape)
  .strict()
  .superRefine(validateMarkdownOutputContract);

export const MarkdownOutputContractV2Schema = z
  .object({
    schemaVersion: z.literal('orqaly.markdown-output-contract.v2'),
    ...MarkdownOutputContractShape,
    readerOutput: ReaderOutputV1Schema.nullable(),
  })
  .strict()
  .superRefine((contract, ctx) => {
    validateMarkdownOutputContract(contract, ctx);
    if (
      contract.readerOutput &&
      !['content_artifact', 'general_artifact'].includes(contract.artifactType)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['readerOutput'],
        message: 'reader-output constraints are only valid for content or general artifacts',
      });
    }
  });

export const MarkdownOutputContractSchema = z.union([
  MarkdownOutputContractV2Schema,
  MarkdownOutputContractV1Schema,
]);

export function blockedReportOutputContract(research) {
  const decisionRequirement = {
    category: 'evidence',
    description: 'State the exact blocked evidence decision.',
    priority: 'P0',
    authority: 'axwise_derived',
  };
  const remediationRequirement = {
    category: 'evidence',
    description: 'Provide bounded remediation for every blocking finding.',
    priority: 'P0',
    authority: 'axwise_derived',
  };
  const requirementIds = [
    semanticContractId('req', decisionRequirement),
    semanticContractId('req', remediationRequirement),
  ].sort();
  const criterionCore = {
    given: 'Immutable research evidence is blocked.',
    when: 'The workflow produces the terminal evidence decision.',
    then: 'The report states the no-go decision and exact remediation for every blocking finding.',
    supports: requirementIds,
  };
  return {
    format: 'text/markdown',
    artifactType: 'launch_authorization',
    requiredSections: ['Evidence decision', 'Remediation plan'],
    requirementIds,
    rubric: [
      'Blocking evidence and uncertainty are explicit.',
      'Every blocking finding has a bounded remediation step.',
      'The launch decision cannot overclaim authority.',
    ],
    acceptanceCriteria: [
      {
        id: semanticContractId('acc', criterionCore),
        ...criterionCore,
      },
    ],
    evidenceReadiness: 'blocked',
    launchReadyAllowed: false,
    sourceAppendixRequired: (research.sourceCatalogue || []).length > 0,
  };
}

export const PlanningResultSchema = z
  .object({
    schemaVersion: z.literal('orqaly.plan.v2'),
    acceptedScopeArtifact: ArtifactRefSchema,
    researchArtifact: ArtifactRefSchema,
    workShape: WorkShapeSchema,
    requirements: z.array(PlanRequirementSchema).min(1).max(120),
    outputContract: MarkdownOutputContractSchema,
    tasks: z.array(ExecutionTaskSchema).min(1).max(100),
    planHash: Sha256Schema,
  })
  .strict()
  .superRefine((plan, ctx) => {
    const { planHash: _planHash, ...planCore } = plan;
    if (canonicalHash(planCore) !== plan.planHash) {
      ctx.addIssue({
        code: 'custom',
        path: ['planHash'],
        message: 'plan hash does not match plan',
      });
    }
    const requirementIds = plan.requirements.map((requirement) => requirement.id);
    if (
      new Set(requirementIds).size !== requirementIds.length ||
      canonicalJson(requirementIds) !== canonicalJson([...requirementIds].sort()) ||
      canonicalJson(requirementIds) !== canonicalJson(plan.outputContract.requirementIds)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['requirements'],
        message: 'plan requirements must be sorted, unique, and equal the output contract',
      });
    }
    if (plan.outputContract.artifactType !== plan.workShape) {
      ctx.addIssue({
        code: 'custom',
        path: ['outputContract', 'artifactType'],
        message: 'output artifact type must equal the accepted plan work shape',
      });
    }
    if (
      plan.outputContract.schemaVersion === 'orqaly.markdown-output-contract.v2' &&
      plan.outputContract.readerOutput
    ) {
      const requirementsById = new Map(
        plan.requirements.map((requirement) => [requirement.id, requirement])
      );
      const readerOutput = plan.outputContract.readerOutput;
      const references = [
        ['readerFormat', readerOutput.readerFormat.requirementId],
        ...(readerOutput.wordLimit ? [['wordLimit', readerOutput.wordLimit.requirementId]] : []),
        ...(readerOutput.itemLimit ? [['itemLimit', readerOutput.itemLimit.requirementId]] : []),
      ];
      for (const [field, requirementId] of references) {
        const requirement = requirementsById.get(requirementId);
        if (
          requirement?.authority !== 'owner' ||
          !['deliverable', 'limit', 'policy'].includes(requirement.category)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['outputContract', 'readerOutput', field, 'requirementId'],
            message:
              'reader-output provenance must reference an owner-authored deliverable, limit, or policy requirement',
          });
        }
      }
    }
    const cores = plan.tasks.filter((task) => task.taskKind === 'core_draft');
    const specialists = plan.tasks.filter((task) => task.taskKind === 'specialist_analysis');
    const expectedSpecialistCount = plan.workShape === 'software_prd' ? 3 : 2;
    const specialistKeys = specialists.map((task) => task.stageKey).sort();
    if (
      cores.length !== 1 ||
      canonicalJson(cores[0]?.acceptanceRequirementIds || []) !== canonicalJson(requirementIds) ||
      specialists.length !== expectedSpecialistCount ||
      specialists.some((task) => task.producesFullContract || task.dependsOnStageKeys.length) ||
      canonicalJson(cores[0]?.dependsOnStageKeys || []) !== canonicalJson(specialistKeys)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['tasks'],
        message: 'parallel specialist roots must feed one full-contract core synthesis task',
      });
    }
    const taskStageIds = plan.tasks.map((task) => task.stageId);
    const taskStageKeys = plan.tasks.map((task) => task.stageKey);
    const taskKeys = new Set(taskStageKeys);
    if (
      new Set(taskStageIds).size !== taskStageIds.length ||
      taskKeys.size !== taskStageKeys.length
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['tasks'],
        message: 'plan tasks must have unique stable stage IDs and stage keys',
      });
    }
    for (const [index, task] of plan.tasks.entries()) {
      if (
        task.acceptanceRequirementIds.some((id) => !requirementIds.includes(id)) ||
        task.dependsOnStageKeys.some((key) => !taskKeys.has(key)) ||
        task.dependsOnStageKeys.includes(task.stageKey)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['tasks', index],
          message:
            'task acceptance and non-self dependency references must exist in this immutable plan',
        });
      }
    }
    const dependenciesByTask = new Map(
      plan.tasks.map((task) => [task.stageKey, task.dependsOnStageKeys])
    );
    const visiting = new Set();
    const visited = new Set();
    function hasDependencyCycle(stageKey) {
      if (visiting.has(stageKey)) return true;
      if (visited.has(stageKey)) return false;
      visiting.add(stageKey);
      for (const dependencyKey of dependenciesByTask.get(stageKey) || []) {
        if (dependenciesByTask.has(dependencyKey) && hasDependencyCycle(dependencyKey)) {
          return true;
        }
      }
      visiting.delete(stageKey);
      visited.add(stageKey);
      return false;
    }
    if ([...dependenciesByTask.keys()].some((stageKey) => hasDependencyCycle(stageKey))) {
      ctx.addIssue({
        code: 'custom',
        path: ['tasks'],
        message: 'plan task dependency graph must be acyclic',
      });
    }
  });

export const RequirementCoverageEntrySchema = z
  .object({
    requirementId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,119}$/),
    status: z.enum(['satisfied', 'gap', 'not_applicable']),
    note: z.string().min(1).max(4000),
  })
  .strict();

export const ExecutionReceiptSchema = z
  .object({
    agent: z.lazy(() => SelectedAgentSchema),
    toolIds: z.array(UuidSchema).max(40),
    budgetCents: z.number().int().nonnegative(),
    dataBoundary: z.array(z.string().min(1).max(500)).max(40),
  })
  .strict();

export const FinalArtifactV1Schema = z
  .object({
    schemaVersion: z.literal('axwise.final-markdown.v1'),
    title: z.string().min(1).max(500),
    markdown: z.string().min(1),
    sourceArtifacts: z.array(ArtifactRefSchema).min(1).max(200),
    sourceAppendix: z.array(z.lazy(() => SourceAppendixEntrySchema)).max(400),
    candidateAttestation: z
      .object({
        task: ExecutionTaskSchema,
        requirementCoverage: z.array(RequirementCoverageEntrySchema).min(1).max(120),
        executionReceipt: ExecutionReceiptSchema,
      })
      .strict()
      .nullable()
      .default(null),
    evidenceReadiness: EvidenceReadinessSchema,
    launchReady: z.boolean(),
  })
  .strict()
  .superRefine((artifact, ctx) => {
    addCanonicalArtifactRefListIssue(ctx, artifact.sourceArtifacts);
    if (artifact.evidenceReadiness !== 'ready' && artifact.launchReady) {
      ctx.addIssue({
        code: 'custom',
        path: ['launchReady'],
        message: 'an artifact with evidence gaps or blocks cannot claim launch-ready',
      });
    }
    validateSourceAppendixOrdering(artifact.sourceAppendix, ctx);
    const attestation = artifact.candidateAttestation;
    if (attestation) {
      const coverageIds = attestation.requirementCoverage.map((item) => item.requirementId);
      if (
        canonicalJson(coverageIds) !== canonicalJson(attestation.task.acceptanceRequirementIds) ||
        canonicalJson(attestation.executionReceipt.agent) !==
          canonicalJson(attestation.task.agent) ||
        canonicalJson(attestation.executionReceipt.toolIds) !==
          canonicalJson(attestation.task.toolIds) ||
        attestation.executionReceipt.budgetCents !== attestation.task.budgetCents ||
        canonicalJson(attestation.executionReceipt.dataBoundary) !==
          canonicalJson(attestation.task.dataBoundary)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['candidateAttestation'],
          message: 'direct candidate attestation must prove exact full-contract task execution',
        });
      }
    }
  });

export const TaskResultV2Schema = z
  .object({
    schemaVersion: z.literal('orqaly.task-result.v2'),
    task: ExecutionTaskSchema,
    acceptedScope: ArtifactRefSchema,
    research: ArtifactRefSchema,
    acceptedPlan: ArtifactRefSchema,
    title: z.string().min(1).max(500),
    markdown: z.string().min(1),
    evidenceReadiness: EvidenceReadinessSchema,
    sourceArtifacts: z.array(ArtifactRefSchema).min(3).max(200),
    requirementCoverage: z.array(RequirementCoverageEntrySchema).min(1).max(120),
    sourceAppendix: z.array(z.lazy(() => SourceAppendixEntrySchema)).max(400),
    executionReceipt: ExecutionReceiptSchema,
    conclusions: z.array(z.string().min(1).max(4000)).min(1).max(100),
    unknowns: z.array(z.string().min(1).max(4000)).max(100),
  })
  .strict()
  .superRefine((result, ctx) => {
    addCanonicalArtifactRefListIssue(ctx, result.sourceArtifacts);
    validateSourceAppendixOrdering(result.sourceAppendix, ctx);
    const coverageIds = result.requirementCoverage.map((item) => item.requirementId);
    if (
      canonicalJson(coverageIds) !== canonicalJson([...new Set(coverageIds)].sort()) ||
      canonicalJson(coverageIds) !== canonicalJson(result.task.acceptanceRequirementIds) ||
      canonicalJson(result.executionReceipt.agent) !== canonicalJson(result.task.agent) ||
      canonicalJson(result.executionReceipt.toolIds) !== canonicalJson(result.task.toolIds) ||
      result.executionReceipt.budgetCents !== result.task.budgetCents ||
      canonicalJson(result.executionReceipt.dataBoundary) !==
        canonicalJson(result.task.dataBoundary)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['requirementCoverage'],
        message: 'task result must cover its exact acceptance set and immutable execution receipt',
      });
    }
  });

export const EvaluationResultV1Schema = z
  .object({
    schemaVersion: z.literal('orqaly.evaluation.v1'),
    taskArtifacts: z.array(ArtifactRefSchema).min(1).max(200),
    sourceArtifacts: z.array(ArtifactRefSchema).min(4).max(203),
    evidenceReadiness: EvidenceReadinessSchema,
    outputContractHash: Sha256Schema,
    repairPass: z.literal(0),
    outputContractSatisfied: z.boolean(),
    promotedArtifact: ArtifactRefSchema.nullable(),
    unmetRequirementIds: z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,119}$/)).max(120),
    unresolvedSourceMarkers: z.array(z.string().min(1).max(500)).max(400),
    unsupportedPrecision: z.array(z.string().min(1).max(2000)).max(40),
    contradictions: z.array(z.string().min(1).max(2000)).max(40),
    staleTopicReferences: z.array(z.string().min(1).max(2000)).max(40),
    readinessViolations: z.array(z.string().min(1).max(2000)).max(40),
    substantiveContentDefects: z.array(z.string().min(1).max(2000)).max(40),
    practicalityDefects: z.array(z.string().min(1).max(2000)).max(40),
    repairRequired: z.boolean(),
    repairInstructions: z.array(z.string().min(1).max(2000)).max(40),
    note: z.string().min(1).max(2000),
  })
  .strict()
  .superRefine((evaluation, ctx) => {
    const taskArtifactIds = evaluation.taskArtifacts.map((artifact) => artifact.artifactId);
    if (canonicalJson(taskArtifactIds) !== canonicalJson([...new Set(taskArtifactIds)].sort())) {
      ctx.addIssue({
        code: 'custom',
        path: ['taskArtifacts'],
        message: 'evaluated task artifacts must be sorted and unique',
      });
    }
    const sortedSources = [
      ...new Map(
        evaluation.sourceArtifacts.map((artifact) => [artifact.artifactId, artifact])
      ).values(),
    ].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    const expectedSources = [
      ...evaluation.taskArtifacts,
      ...evaluation.sourceArtifacts.filter((artifact) =>
        ['scope', 'research', 'plan'].includes(artifact.kind)
      ),
    ].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    if (
      canonicalJson(evaluation.sourceArtifacts) !== canonicalJson(sortedSources) ||
      evaluation.sourceArtifacts.filter((artifact) => artifact.kind === 'scope').length !== 1 ||
      evaluation.sourceArtifacts.filter((artifact) => artifact.kind === 'research').length !== 1 ||
      evaluation.sourceArtifacts.filter((artifact) => artifact.kind === 'plan').length !== 1 ||
      canonicalJson(evaluation.sourceArtifacts) !== canonicalJson(expectedSources)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceArtifacts'],
        message:
          'evaluation lineage must be exact sorted scope, research, plan, and task artifacts',
      });
    }
    const issueFields = [
      'unmetRequirementIds',
      'unresolvedSourceMarkers',
      'unsupportedPrecision',
      'contradictions',
      'staleTopicReferences',
      'readinessViolations',
      'substantiveContentDefects',
      'practicalityDefects',
    ];
    for (const field of [...issueFields, 'repairInstructions']) {
      const values = evaluation[field];
      if (canonicalJson(values) !== canonicalJson([...new Set(values)].sort())) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} must be sorted and unique`,
        });
      }
    }
    const finalCandidates = evaluation.taskArtifacts.filter(
      (artifact) => artifact.kind === 'final_markdown'
    );
    const soleCandidate = finalCandidates.length === 1 ? finalCandidates[0] : null;
    const expectedSatisfied = Boolean(
      soleCandidate && issueFields.every((field) => evaluation[field].length === 0)
    );
    if (evaluation.outputContractSatisfied !== expectedSatisfied) {
      ctx.addIssue({
        code: 'custom',
        path: ['outputContractSatisfied'],
        message:
          'output satisfaction requires one final candidate among all task artifacts and no defects',
      });
    }
    if (
      canonicalJson(evaluation.promotedArtifact) !==
      canonicalJson(expectedSatisfied ? soleCandidate : null)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['promotedArtifact'],
        message: 'promotion must be the exact sole satisfying final candidate',
      });
    }
    if (
      evaluation.repairRequired !== !expectedSatisfied ||
      (evaluation.repairRequired
        ? evaluation.repairInstructions.length === 0
        : evaluation.repairInstructions.length !== 0)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['repairRequired'],
        message: 'exactly one bounded repair instruction set is required iff output is unsatisfied',
      });
    }
  });

export const EvidenceClaimV1Schema = z
  .object({
    claimId: Sha256Schema,
    text: z.string().min(1).max(12_000),
    textSha256: Sha256Schema,
    sourceUrls: z
      .array(PublicHttpsUrlSchema)
      .min(1)
      .max(20)
      .superRefine((values, ctx) => {
        const canonical = [...new Set(values)].sort();
        if (canonicalJson(values) !== canonicalJson(canonical)) {
          ctx.addIssue({ code: 'custom', message: 'source URLs must be sorted and unique' });
        }
      }),
    sourceTypes: sourceTypesSchema({ min: 1 }),
    providerResponseHash: Sha256Schema.nullable().default(null),
    segmentStart: z.number().int().nonnegative().nullable().default(null),
    segmentEnd: z.number().int().positive().nullable().default(null),
    offsetUnit: z.literal('utf8_bytes').nullable().default(null),
  })
  .strict()
  .superRefine((claim, ctx) => {
    if (sha256Hex(claim.text) !== claim.textSha256) {
      ctx.addIssue({ code: 'custom', path: ['textSha256'], message: 'claim text hash is invalid' });
    }
    const expectedId = canonicalHash({
      text: claim.text,
      sourceTypes: [...claim.sourceTypes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      sourceUrls: [...claim.sourceUrls].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    });
    if (claim.claimId !== expectedId) {
      ctx.addIssue({ code: 'custom', path: ['claimId'], message: 'claim identity is invalid' });
    }
    const span = [claim.segmentStart, claim.segmentEnd, claim.offsetUnit];
    if (span.some((value) => value !== null)) {
      if (span.some((value) => value === null) || claim.segmentEnd <= claim.segmentStart) {
        ctx.addIssue({
          code: 'custom',
          path: ['segmentStart'],
          message: 'claim span must be complete and ordered',
        });
      }
      if (!claim.providerResponseHash) {
        ctx.addIssue({
          code: 'custom',
          path: ['providerResponseHash'],
          message: 'claim span requires provider response hash',
        });
      }
    }
  });

export const ResearchSourceCatalogueEntrySchema = z
  .object({
    sourceId: Sha256Schema,
    sourceTitle: z.string().min(1).max(1000),
    canonicalUrl: PublicHttpsUrlSchema,
    sourceClasses: sourceTypesSchema({ min: 1 }),
    retrievalDate: UtcRfc3339Schema,
    supportedClaimIds: z.array(Sha256Schema).min(1).max(400),
  })
  .strict()
  .superRefine((source, ctx) => {
    if (
      source.sourceId !==
      canonicalHash({
        canonicalUrl: source.canonicalUrl,
        retrievalDate: source.retrievalDate,
        sourceClasses: source.sourceClasses,
        sourceTitle: source.sourceTitle,
      })
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceId'],
        message: 'source catalogue identity is invalid',
      });
    }
    if (
      canonicalJson(source.supportedClaimIds) !==
      canonicalJson([...new Set(source.supportedClaimIds)].sort())
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['supportedClaimIds'],
        message: 'supported claim IDs must be sorted and unique',
      });
    }
  });

export const SourceAppendixEntrySchema = z
  .object({
    claimId: Sha256Schema,
    sourceTitle: z.string().min(1).max(1000),
    canonicalUrl: PublicHttpsUrlSchema,
    sourceClass: EvidenceSourceTypeSchema,
    retrievalDate: UtcRfc3339Schema,
    supportedClaim: z.string().min(1).max(12_000),
    supportedSection: z.string().min(1).max(500),
  })
  .strict();

function validateSourceAppendixOrdering(appendix, ctx) {
  const keys = appendix.map((entry) =>
    [
      entry.claimId,
      entry.canonicalUrl,
      entry.retrievalDate,
      entry.sourceClass,
      entry.sourceTitle,
      entry.supportedSection,
    ].join('\u0000')
  );
  if (canonicalJson(keys) !== canonicalJson([...new Set(keys)].sort())) {
    ctx.addIssue({
      code: 'custom',
      path: ['sourceAppendix'],
      message: 'source appendix entries must be sorted and unique by exact source snapshot',
    });
  }
}

export const EvidenceAcquisitionPassV1Schema = z
  .object({
    requirementId: z.string().min(1).max(120),
    passNumber: z.union([z.literal(0), z.literal(1)]),
    queryHash: Sha256Schema,
    providerResponseHash: Sha256Schema,
    providerResponseText: z.string().max(200_000),
    claims: z.array(EvidenceClaimV1Schema).max(50).default([]),
    sourceTypesSeen: sourceTypesSchema().default([]),
  })
  .strict()
  .superRefine((pass, ctx) => {
    if (sha256Hex(pass.providerResponseText) !== pass.providerResponseHash) {
      ctx.addIssue({
        code: 'custom',
        path: ['providerResponseHash'],
        message: 'provider response hash is invalid',
      });
    }
    const claimIds = pass.claims.map((claim) => claim.claimId);
    if (new Set(claimIds).size !== claimIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['claims'],
        message: 'an acquisition pass must contain unique immutable claim IDs',
      });
    }
    const bytes = new TextEncoder().encode(pass.providerResponseText);
    for (const [index, claim] of pass.claims.entries()) {
      if (
        claim.providerResponseHash !== pass.providerResponseHash ||
        claim.segmentStart === null ||
        claim.segmentEnd === null ||
        claim.offsetUnit !== 'utf8_bytes'
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['claims', index],
          message: 'acquired claims require an exact UTF-8 span in this provider response',
        });
        continue;
      }
      if (claim.segmentEnd > bytes.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['claims', index, 'segmentEnd'],
          message: 'claim span exceeds provider response bytes',
        });
        continue;
      }
      try {
        const exact = new TextDecoder('utf-8', { fatal: true }).decode(
          bytes.subarray(claim.segmentStart, claim.segmentEnd)
        );
        if (exact !== claim.text) {
          ctx.addIssue({
            code: 'custom',
            path: ['claims', index],
            message: 'claim span does not equal claim text',
          });
        }
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: ['claims', index],
          message: 'claim span splits an UTF-8 code point',
        });
      }
    }
  });

export const SelectedEvidenceArtifactV1Schema = z
  .object({
    schemaVersion: z.literal('axwise.evidence.v1'),
    requirementId: z.string().min(1).max(120),
    applicability: z.enum(['applicable', 'not_applicable']),
    claims: z.array(EvidenceClaimV1Schema).max(100).default([]),
    sourceCatalogue: z.array(ResearchSourceCatalogueEntrySchema).max(400),
    conflicts: z.array(z.string().min(1).max(2000)).max(40).default([]),
  })
  .strict()
  .superRefine((evidence, ctx) => {
    if (
      evidence.applicability === 'not_applicable' &&
      (evidence.claims.length || evidence.sourceCatalogue.length)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['applicability'],
        message: 'not-applicable evidence cannot carry claims or source metadata',
      });
    }
    validateClaimSourceCatalogue(evidence.claims, evidence.sourceCatalogue, ctx);
  });

function validateClaimSourceCatalogue(claims, sources, ctx) {
  const sourceIds = sources.map((source) => source.sourceId);
  if (canonicalJson(sourceIds) !== canonicalJson([...new Set(sourceIds)].sort())) {
    ctx.addIssue({
      code: 'custom',
      path: ['sourceCatalogue'],
      message: 'source catalogue must be sorted by unique immutable source ID',
    });
  }
  const claimsById = new Map();
  for (const [index, claim] of claims.entries()) {
    const prior = claimsById.get(claim.claimId);
    if (prior && canonicalJson(prior) !== canonicalJson(claim)) {
      ctx.addIssue({
        code: 'custom',
        path: ['claims', index, 'claimId'],
        message: 'duplicate claim IDs must carry identical immutable claim facts',
      });
    }
    claimsById.set(claim.claimId, claim);
  }
  for (const [index, source] of sources.entries()) {
    for (const claimId of source.supportedClaimIds) {
      const claim = claimsById.get(claimId);
      if (!claim || !claim.sourceUrls.includes(source.canonicalUrl)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sourceCatalogue', index, 'supportedClaimIds'],
          message: 'catalogued claims must exist and cite the exact URL',
        });
      }
    }
  }
  for (const [claimIndex, claim] of claims.entries()) {
    for (const sourceUrl of claim.sourceUrls) {
      if (
        !sources.some(
          (source) =>
            source.canonicalUrl === sourceUrl && source.supportedClaimIds.includes(claim.claimId)
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['claims', claimIndex, 'sourceUrls'],
          message: 'every claim/source pair requires exact human-readable source metadata',
        });
      }
    }
  }
}

export const ResearchArtifactPayloadV2Schema = ResearchResultV2Schema.safeExtend({
  claimLedger: z.array(EvidenceAcquisitionPassV1Schema).max(160).default([]),
  selectedClaims: z.array(EvidenceClaimV1Schema).max(400),
  sourceCatalogue: z.array(ResearchSourceCatalogueEntrySchema).max(400),
})
  .strict()
  .superRefine((research, ctx) => {
    const selectedClaimIds = research.selectedClaims.map((claim) => claim.claimId);
    if (canonicalJson(selectedClaimIds) !== canonicalJson([...new Set(selectedClaimIds)].sort())) {
      ctx.addIssue({
        code: 'custom',
        path: ['selectedClaims'],
        message: 'selected claims must be sorted by unique immutable claim ID',
      });
    }
    const passKeys = research.claimLedger.map(
      (pass) => `${pass.requirementId}\u0000${pass.passNumber}`
    );
    if (new Set(passKeys).size !== passKeys.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['claimLedger'],
        message: 'claim-ledger acquisition passes must have unique requirement/pass identities',
      });
    }
    const acquiredRequirementIds = new Set(research.claimLedger.map((pass) => pass.requirementId));
    for (const [index, finding] of research.findings.entries()) {
      if (
        acquiredRequirementIds.has(finding.requirementId) &&
        !finding.sourceArtifactIds.includes(research.claimLedgerArtifactId)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['findings', index, 'sourceArtifactIds'],
          message: 'dynamically acquired findings must cite the immutable claim-ledger artifact',
        });
      }
    }
    validateClaimSourceCatalogue(
      [...research.selectedClaims, ...research.claimLedger.flatMap((pass) => pass.claims)],
      research.sourceCatalogue,
      ctx
    );
  });

function typedArtifactFact(kind, contentType, payloadSchema) {
  return z
    .object({
      artifactId: UuidSchema,
      artifactHash: Sha256Schema,
      kind: z.literal(kind),
      contentType: z.literal(contentType),
      payload: payloadSchema,
      markdown: contentType === 'text/markdown' ? z.string().min(1) : z.null(),
      sourceArtifactIds: z.array(UuidSchema).max(204).default([]),
    })
    .strict()
    .superRefine((artifact, ctx) => {
      if (
        contentType === 'text/markdown' &&
        typeof artifact.payload?.markdown === 'string' &&
        artifact.payload.markdown !== artifact.markdown
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['markdown'],
          message: 'Markdown body must equal payload.markdown',
        });
      }
      if (artifactContentHash(artifact) !== artifact.artifactHash) {
        ctx.addIssue({
          code: 'custom',
          path: ['artifactHash'],
          message: 'artifact hash does not match canonical content envelope',
        });
      }
      // Keep this lazy: evaluating every branch would read fields that do not
      // exist on the payload of the artifact currently being parsed.
      let expectedByKind;
      switch (kind) {
        case 'scope':
          // CompileScope has no lineage while ReviseScope cites the prior scope.
          // The transition validates the exact operation-specific set.
          expectedByKind = null;
          break;
        case 'research':
          expectedByKind = [artifact.payload.acceptedScopeArtifactId];
          break;
        case 'plan':
          expectedByKind = [
            artifact.payload.acceptedScopeArtifact.artifactId,
            artifact.payload.researchArtifact.artifactId,
          ];
          break;
        case 'task_result':
          expectedByKind = artifact.payload.sourceArtifacts.map((item) => item.artifactId);
          break;
        case 'evaluation':
          expectedByKind = artifact.payload.sourceArtifacts.map((item) => item.artifactId);
          break;
        case 'final_markdown':
          expectedByKind = artifact.payload.sourceArtifacts.map((item) => item.artifactId);
          break;
        case 'evidence':
          expectedByKind = [];
          break;
        default:
          expectedByKind = [];
      }
      const expected = expectedByKind === null ? null : [...new Set(expectedByKind || [])].sort();
      const observed = [...artifact.sourceArtifactIds];
      const canonicalObserved = [...new Set(observed)].sort();
      if (
        (expectedByKind !== null && (expectedByKind || []).length !== expected.length) ||
        observed.length !== canonicalObserved.length ||
        canonicalJson(observed) !== canonicalJson(canonicalObserved) ||
        (expected !== null && canonicalJson(canonicalObserved) !== canonicalJson(expected))
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['sourceArtifactIds'],
          message: 'artifact lineage must be the exact sorted unique IDs declared by its payload',
        });
      }
    });
}

export const ScopeArtifactFactSchema = typedArtifactFact(
  'scope',
  'application/json',
  ScopeArtifactV2Schema
);
export const ResearchArtifactFactSchema = typedArtifactFact(
  'research',
  'application/json',
  ResearchArtifactPayloadV2Schema
);
export const PlanArtifactFactSchema = typedArtifactFact(
  'plan',
  'application/json',
  PlanningResultSchema
);
export const TaskArtifactFactSchema = typedArtifactFact(
  'task_result',
  'text/markdown',
  TaskResultV2Schema
);
export const EvaluationArtifactFactSchema = typedArtifactFact(
  'evaluation',
  'application/json',
  EvaluationResultV1Schema
);
export const FinalMarkdownArtifactFactSchema = typedArtifactFact(
  'final_markdown',
  'text/markdown',
  FinalArtifactV1Schema
);
export const EvidenceArtifactFactSchema = typedArtifactFact(
  'evidence',
  'application/json',
  SelectedEvidenceArtifactV1Schema
);

export const ArtifactFactSchema = z.discriminatedUnion('kind', [
  ScopeArtifactFactSchema,
  ResearchArtifactFactSchema,
  PlanArtifactFactSchema,
  TaskArtifactFactSchema,
  EvaluationArtifactFactSchema,
  FinalMarkdownArtifactFactSchema,
  EvidenceArtifactFactSchema,
  TranscriptCorpusArtifactFactSchema,
  QualitativeAnalysisArtifactFactSchema,
  SimulationArtifactFactSchema,
]);

const OwnerSchema = z
  .object({
    tenantId: UuidSchema,
    organizationId: ClerkOrganizationIdSchema.nullable(),
    userId: ClerkUserIdSchema,
  })
  .strict();

const WorkflowReferenceSchema = z
  .object({
    runId: UuidSchema,
    stageId: UuidSchema,
    stageAttemptId: UuidSchema,
  })
  .strict();

export const ExecutionAgentAvatarV1Schema = z
  .object({
    kind: z.enum(['icon', 'emoji']),
    value: z.string().trim().min(1).max(32),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/u)
      .transform((value) => value.toUpperCase()),
  })
  .strict()
  .superRefine((avatar, ctx) => {
    const iconKeys = ['smart_toy', 'bolt', 'science', 'support_agent', 'campaign', 'code'];
    if (avatar.kind === 'icon' && !iconKeys.includes(avatar.value)) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'unknown Agent avatar icon',
      });
    }
    if (
      avatar.kind === 'emoji' &&
      (!/\p{So}/u.test(avatar.value) || /[\p{Cc}\p{Cs}]/u.test(avatar.value))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Agent emoji avatar must contain a printable emoji',
      });
    }
  });

export const ExecutionAgentProfileInputV1Schema = z
  .object({
    version: z.literal('orqaly_agent_profile_input_v1'),
    displayName: z.string().trim().min(1).max(160),
    roleLabel: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2_000),
    instructions: z.string().trim().max(12_000),
    avatar: ExecutionAgentAvatarV1Schema,
  })
  .strict();

/**
 * Immutable reference to the exact control-plane profile version plus the
 * normalized profile payload AxWise is allowed to apply during this run.
 */
export const ExecutionAgentProfileSnapshotV1Schema = z
  .object({
    version: z.literal('orqaly_execution_agent_profile_snapshot_v1'),
    profileVersion: z
      .object({
        version: z.literal('orqaly_agent_profile_v1'),
        id: UuidSchema,
        agentId: UuidSchema,
        versionNumber: z.number().int().positive(),
        contentHash: Sha256Schema,
      })
      .strict(),
    profile: ExecutionAgentProfileInputV1Schema,
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    if (canonicalHash(snapshot.profile) !== snapshot.profileVersion.contentHash) {
      ctx.addIssue({
        code: 'custom',
        path: ['profileVersion', 'contentHash'],
        message: 'execution Agent profile hash does not match its normalized contents',
      });
    }
  });

/**
 * Immutable execution identity for an Assistant-delegated Goal. Unlike the
 * presentation card, this contract is hashed into the first persisted stage
 * input and delivered to AxWise in the operation envelope.
 */
export const ExecutionAgentContractV1Schema = z
  .object({
    schemaVersion: z.literal('orqaly.execution-agent.v1'),
    id: UuidSchema,
    runId: UuidSchema,
    owner: z
      .object({
        tenantId: UuidSchema,
        userId: ClerkUserIdSchema,
      })
      .strict(),
    lifetime: z.enum(['temporary', 'persistent']),
    source: z
      .object({
        threadId: UuidSchema,
        turnId: UuidSchema,
        taskHash: Sha256Schema,
      })
      .strict(),
    // Optional only for persisted pre-profile Agent runs. New first-class
    // Agent runs bind the exact immutable control-plane profile version here.
    profileSnapshot: ExecutionAgentProfileSnapshotV1Schema.optional(),
    executorPersona: z
      .object({
        role: z.literal('task_executor'),
        profileVersion: z.literal('axwise_executor_persona_v1'),
        provider: z.literal('axwise'),
        binding: z.literal('fixed_profile_contract'),
      })
      .strict(),
    memory: z
      .object({
        scope: z.literal('thread_and_goal'),
        crossThread: z.literal(false),
      })
      .strict(),
    runtime: z
      .object({
        provider: z.literal('orqaly_workflow_v2'),
        isolation: z.literal('tenant_user'),
      })
      .strict(),
    capabilities: z
      .object({
        research: z.literal(true),
        planning: z.literal(true),
        artifactProduction: z.literal(true),
        approvalGates: z.literal(true),
      })
      .strict(),
    tools: z
      .object({
        externalActions: z.literal(false),
        executionProvider: z.null(),
      })
      .strict(),
  })
  .strict()
  .superRefine((agent, ctx) => {
    if (agent.profileSnapshot && agent.profileSnapshot.profileVersion.agentId !== agent.id) {
      ctx.addIssue({
        code: 'custom',
        path: ['profileSnapshot', 'profileVersion', 'agentId'],
        message: 'execution Agent profile must belong to the bound Agent identity',
      });
    }
  });

export const CompileScopeInputV2Schema = z
  .object({
    type: z.literal('CompileScopeV2'),
    request: z.string().min(1).max(24_000),
    objectiveOnlyContext: z.array(ArtifactRefSchema).max(20).default([]),
    safeDefaults: z
      .object({
        geography: z.array(z.string().min(1).max(160)).max(24).default([]),
        acceptedSourceTypes: sourceTypesSchema().default([]),
        assumptions: z.array(z.string().min(1).max(1000)).max(24).default([]),
        limits: z.array(z.string().min(1).max(1000)).max(40).default([]),
        policies: z.array(z.string().min(1).max(1000)).max(40).default([]),
      })
      .strict()
      .default({}),
  })
  .strict();

const AssistantContextContentKindsV1Schema = z
  .array(z.enum(['text', 'artifact']))
  .min(1)
  .max(2)
  .superRefine((kinds, ctx) => {
    const canonical = ['text', 'artifact'].filter((kind) => kinds.includes(kind));
    if (canonicalJson(kinds) !== canonicalJson(canonical)) {
      ctx.addIssue({
        code: 'custom',
        message: 'assistant context content kinds must be sorted and unique',
      });
    }
  });

const AssistantContextExcerptV1BaseSchema = z
  .object({
    messageId: UuidSchema,
    turnId: UuidSchema,
    contentKinds: AssistantContextContentKindsV1Schema,
    content: utf16String(ASSISTANT_CONTEXT_MAX_EXCERPT_UTF16),
    contentSha256: Sha256Schema,
    sourceMessageHash: Sha256Schema,
    truncated: z.boolean(),
    sourceSpan: SourceSpanSchema,
  })
  .strict()
  .superRefine((excerpt, ctx) => {
    if (sha256Hex(excerpt.content) !== excerpt.contentSha256) {
      ctx.addIssue({
        code: 'custom',
        path: ['contentSha256'],
        message: 'assistant context content hash must match the projected content',
      });
    }
    if (
      excerpt.sourceSpan.text !== excerpt.content ||
      excerpt.sourceSpan.sha256 !== excerpt.contentSha256
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceSpan'],
        message: 'assistant context source span must bind the projected content',
      });
    }
    if (excerpt.truncated !== excerpt.content.endsWith(ASSISTANT_CONTEXT_TRUNCATION_MARKER)) {
      ctx.addIssue({
        code: 'custom',
        path: ['truncated'],
        message: 'assistant context truncation flag must match the canonical marker',
      });
    }
  });

export const AssistantOwnerContextExcerptV1Schema = AssistantContextExcerptV1BaseSchema.safeExtend({
  authority: z.literal('owner_prior'),
  provenance: z.literal('persisted_owner_message'),
}).strict();

export const AssistantReferenceContextExcerptV1Schema =
  AssistantContextExcerptV1BaseSchema.safeExtend({
    authority: z.literal('assistant_reference'),
    provenance: z.enum(['orqaly_local_output', 'axwise_operation_output']),
  }).strict();

export const AssistantContextTurnV1Schema = z
  .object({
    rootTurnId: UuidSchema,
    route: AssistantRouteSchema,
    user: AssistantOwnerContextExcerptV1Schema,
    assistant: AssistantReferenceContextExcerptV1Schema,
  })
  .strict()
  .superRefine((turn, ctx) => {
    if (turn.user.turnId !== turn.rootTurnId) {
      ctx.addIssue({
        code: 'custom',
        path: ['user', 'turnId'],
        message: 'assistant context user must bind the root turn',
      });
    }
    const expectedProvenance = ['DIRECT_ANSWER', 'DISCOVER', 'AXWISE_ONE_SHOT'].includes(turn.route)
      ? 'axwise_operation_output'
      : 'orqaly_local_output';
    if (turn.assistant.provenance !== expectedProvenance) {
      ctx.addIssue({
        code: 'custom',
        path: ['assistant', 'provenance'],
        message: 'assistant context provenance must match the persisted route',
      });
    }
  });

export const AssistantContextEnvelopeV1Schema = z
  .object({
    type: z.literal(ASSISTANT_CONTEXT_ENVELOPE_TYPE),
    source: z.literal(ASSISTANT_CONTEXT_SOURCE),
    purpose: z.literal(ASSISTANT_CONTEXT_PURPOSE),
    threadId: UuidSchema,
    currentMessageId: UuidSchema,
    currentTurnId: UuidSchema,
    currentMessageHash: Sha256Schema,
    instruction: z
      .object({
        content: utf16String(ASSISTANT_CONTEXT_MAX_SOURCE_UTF16),
        authority: z.literal('owner_current'),
        provenance: z.literal('persisted_owner_message_projection'),
        sourceSpan: SourceSpanSchema,
      })
      .strict(),
    selectionPolicy: z.literal(ASSISTANT_CONTEXT_SELECTION_POLICY),
    authorityPolicy: z.literal(ASSISTANT_CONTEXT_AUTHORITY_POLICY),
    turns: z.array(AssistantContextTurnV1Schema).max(ASSISTANT_CONTEXT_MAX_PAIRS),
    omittedTurnCount: z.number().int().nonnegative(),
    truncatedMessageCount: z
      .number()
      .int()
      .nonnegative()
      .max(ASSISTANT_CONTEXT_MAX_PAIRS * 2),
    envelopeHash: Sha256Schema,
  })
  .strict()
  .superRefine((envelope, ctx) => {
    const { envelopeHash, ...hashInput } = envelope;
    if (canonicalHash(hashInput) !== envelopeHash) {
      ctx.addIssue({
        code: 'custom',
        path: ['envelopeHash'],
        message: 'assistant context envelope hash must match its canonical content',
      });
    }
    if (
      envelope.instruction.sourceSpan.text !== envelope.instruction.content ||
      envelope.instruction.sourceSpan.sha256 !== sha256Hex(envelope.instruction.content)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['instruction', 'sourceSpan'],
        message: 'assistant context instruction span must bind the current owner instruction',
      });
    }
    if (
      envelope.truncatedMessageCount !==
      envelope.turns.reduce(
        (total, turn) => total + Number(turn.user.truncated) + Number(turn.assistant.truncated),
        0
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['truncatedMessageCount'],
        message: 'assistant context truncated message count must match included excerpts',
      });
    }
    const identities = [
      envelope.currentMessageId,
      ...envelope.turns.flatMap((turn) => [turn.user.messageId, turn.assistant.messageId]),
    ];
    if (new Set(identities).size !== identities.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['turns'],
        message: 'assistant context message identities must be unique',
      });
    }
    const rootTurnIds = envelope.turns.map((turn) => turn.rootTurnId);
    if (new Set(rootTurnIds).size !== rootTurnIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['turns'],
        message: 'assistant context root turns must be unique',
      });
    }
    const seenTurnIds = new Set([envelope.currentTurnId]);
    envelope.turns.forEach((turn, index) => {
      const turnIds = new Set([turn.rootTurnId, turn.user.turnId, turn.assistant.turnId]);
      if ([...turnIds].some((turnId) => seenTurnIds.has(turnId))) {
        ctx.addIssue({
          code: 'custom',
          path: ['turns', index],
          message: 'assistant context current and completed turn identities must not overlap',
        });
      }
      turnIds.forEach((turnId) => seenTurnIds.add(turnId));
    });
  });

export const CompileScopeInputV3Schema = z
  .object({
    type: z.literal('CompileScopeV3'),
    request: utf16String(ASSISTANT_CONTEXT_MAX_SOURCE_UTF16),
    assistantContext: AssistantContextEnvelopeV1Schema,
    // Optional only for rolling compatibility with V3 runs created before
    // delegated Agents. New Agent starts require this in command-service.
    executionAgent: ExecutionAgentContractV1Schema.optional(),
    objectiveOnlyContext: z.array(ArtifactRefSchema).max(20).default([]),
    safeDefaults: z
      .object({
        geography: z.array(z.string().min(1).max(160)).max(24).default([]),
        acceptedSourceTypes: sourceTypesSchema().default([]),
        assumptions: z.array(z.string().min(1).max(1000)).max(24).default([]),
        limits: z.array(z.string().min(1).max(1000)).max(40).default([]),
        policies: z.array(z.string().min(1).max(1000)).max(40).default([]),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((input, ctx) => {
    const rendered = renderAssistantContextSourceV1(input.assistantContext);
    if (input.request !== rendered.request) {
      ctx.addIssue({
        code: 'custom',
        path: ['request'],
        message: 'CompileScopeV3 request must equal the canonical assistant context rendering',
      });
    }
    if (
      canonicalJson(input.assistantContext.instruction.sourceSpan) !==
      canonicalJson(rendered.instructionSpan)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['assistantContext', 'instruction', 'sourceSpan'],
        message: 'assistant context instruction span must match the rendered request',
      });
    }
    input.assistantContext.turns.forEach((turn, index) => {
      for (const role of ['user', 'assistant']) {
        if (
          canonicalJson(turn[role].sourceSpan) !== canonicalJson(rendered.turnSpans[index]?.[role])
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['assistantContext', 'turns', index, role, 'sourceSpan'],
            message: 'assistant context source span must match the rendered request',
          });
        }
      }
    });
    if (input.executionAgent) {
      if (
        input.executionAgent.source.threadId !== input.assistantContext.threadId ||
        input.executionAgent.source.turnId !== input.assistantContext.currentTurnId
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['executionAgent', 'source'],
          message: 'execution Agent source must match the current Assistant turn',
        });
      }
      if (
        input.executionAgent.source.taskHash !==
        sha256Hex(input.assistantContext.instruction.content)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['executionAgent', 'source', 'taskHash'],
          message: 'execution Agent task hash must bind the current Goal instruction',
        });
      }
    }
  });

export const CompileScopeInputSchema = z.discriminatedUnion('type', [
  CompileScopeInputV2Schema,
  CompileScopeInputV3Schema,
]);

export const ReviseScopeInputV2Schema = z
  .object({
    type: z.literal('ReviseScopeV2'),
    executionAgent: ExecutionAgentContractV1Schema.optional(),
    acceptedScope: ArtifactRefSchema,
    correction: z.string().min(1).max(6000),
    correctionSourceSpans: z.array(SourceSpanSchema).min(1).max(24),
  })
  .strict()
  .refine((input) => input.acceptedScope.kind === 'scope', {
    path: ['acceptedScope', 'kind'],
    message: 'scope revision requires a scope artifact',
  });

export const ExecuteResearchInputV2Schema = z
  .object({
    type: z.literal('ExecuteResearchV2'),
    executionAgent: ExecutionAgentContractV1Schema.optional(),
    acceptedScope: ArtifactRefSchema,
    scope: ScopeArtifactV2Schema,
    selectedEvidence: z.array(ArtifactRefSchema).max(200).default([]),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.acceptedScope.kind !== 'scope') {
      ctx.addIssue({
        code: 'custom',
        path: ['acceptedScope', 'kind'],
        message: 'scope artifact required',
      });
    }
    const ids = input.selectedEvidence.map((artifact) => artifact.artifactId);
    if (
      input.selectedEvidence.some((artifact) => artifact.kind !== 'evidence') ||
      new Set(ids).size !== ids.length ||
      canonicalJson(ids) !== canonicalJson([...ids].sort())
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['selectedEvidence'],
        message: 'selected evidence must be sorted unique evidence artifacts',
      });
    }
  });

export const SelectedAgentSchema = z
  .object({
    id: UuidSchema,
    name: z.string().min(1).max(300),
    capabilities: z.array(z.string().min(1).max(120)).max(100),
    toolIds: z.array(UuidSchema).max(40),
    qualityScoreMicros: z.number().int().min(0).max(1_000_000),
    costPerRunCents: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((agent, ctx) => {
    for (const field of ['capabilities', 'toolIds']) {
      const values = agent[field];
      const sorted = [...new Set(values)].sort();
      if (canonicalJson(values) !== canonicalJson(sorted)) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} must be sorted and unique`,
        });
      }
    }
  });

export const OrqalyPlanInputV2Schema = z
  .object({
    type: z.literal('OrqalyPlanV2'),
    executionAgent: ExecutionAgentContractV1Schema.optional(),
    acceptedScope: ArtifactRefSchema,
    research: ArtifactRefSchema,
    agentCatalogue: z.array(SelectedAgentSchema).max(1000),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.acceptedScope.kind !== 'scope' || input.research.kind !== 'research') {
      ctx.addIssue({ code: 'custom', message: 'planning requires scope and research artifacts' });
    }
    const ids = input.agentCatalogue.map((agent) => agent.id);
    if (canonicalJson(ids) !== canonicalJson([...new Set(ids)].sort())) {
      ctx.addIssue({
        code: 'custom',
        path: ['agentCatalogue'],
        message: 'tenant agent catalogue must be sorted by unique immutable agent ID',
      });
    }
  });

const SynthesizeCommonShape = {
  type: z.literal('SynthesizeArtifactV1'),
  executionAgent: ExecutionAgentContractV1Schema.optional(),
  acceptedScope: ArtifactRefSchema,
  research: ArtifactRefSchema,
  sourceArtifacts: z.array(ArtifactRefSchema).min(2).max(204),
  artifactContents: z.array(ArtifactContentSchema).min(2).max(204),
  outputContract: MarkdownOutputContractSchema,
};

function validateSynthesisAuthority(input, ctx) {
  if (input.acceptedScope.kind !== 'scope' || input.research.kind !== 'research') {
    ctx.addIssue({
      code: 'custom',
      message: 'cognitive activity requires scope and research artifacts',
    });
  }
  const sourceIds = input.sourceArtifacts.map((artifact) => artifact.artifactId);
  const contentRefs = input.artifactContents.map((content) => content.artifact);
  if (
    canonicalJson(sourceIds) !== canonicalJson([...new Set(sourceIds)].sort()) ||
    canonicalJson(contentRefs) !== canonicalJson(input.sourceArtifacts)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['artifactContents'],
      message: 'artifact contents must exactly cover sorted unique source artifact references',
    });
  }
  const researchContent = input.artifactContents.find(
    (content) => canonicalJson(content.artifact) === canonicalJson(input.research)
  );
  if (
    !researchContent?.payload ||
    input.outputContract.sourceAppendixRequired !==
      Boolean(researchContent.payload.sourceCatalogue?.length)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['outputContract', 'sourceAppendixRequired'],
      message: 'source appendix authority must equal the immutable research source catalogue',
    });
  }
}

function validateTaskArtifactRefs(taskArtifacts, ctx) {
  const ids = taskArtifacts.map((artifact) => artifact.artifactId);
  if (
    canonicalJson(ids) !== canonicalJson([...new Set(ids)].sort()) ||
    taskArtifacts.some((artifact) => !['task_result', 'final_markdown'].includes(artifact.kind))
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['taskArtifacts'],
      message: 'task artifacts must be sorted unique task-result or final-Markdown references',
    });
  }
}

export const ExecuteTaskSynthesisInputV1Schema = z
  .object({
    ...SynthesizeCommonShape,
    purpose: z.literal('execute_task'),
    acceptedPlan: ArtifactRefSchema,
    task: ExecutionTaskSchema,
    repairPass: z.literal(0),
  })
  .strict()
  .superRefine((input, ctx) => {
    validateSynthesisAuthority(input, ctx);
    if (
      input.acceptedPlan.kind !== 'plan' ||
      ![input.acceptedScope, input.research, input.acceptedPlan].every((reference) =>
        input.sourceArtifacts.some((source) => canonicalJson(source) === canonicalJson(reference))
      )
    ) {
      ctx.addIssue({ code: 'custom', message: 'task execution has invalid immutable authority' });
    }
  });

export const EvaluateOutputSynthesisInputV1Schema = z
  .object({
    ...SynthesizeCommonShape,
    purpose: z.literal('evaluate_output'),
    acceptedPlan: ArtifactRefSchema,
    taskArtifacts: z.array(ArtifactRefSchema).min(1).max(200),
    repairPass: z.literal(0),
  })
  .strict()
  .superRefine((input, ctx) => {
    validateSynthesisAuthority(input, ctx);
    validateTaskArtifactRefs(input.taskArtifacts, ctx);
    const expected = [
      input.acceptedScope,
      input.research,
      input.acceptedPlan,
      ...input.taskArtifacts,
    ].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    if (
      input.acceptedPlan.kind !== 'plan' ||
      canonicalJson(input.sourceArtifacts) !== canonicalJson(expected)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'evaluation must bind exact plan and task artifacts',
      });
    }
  });

export const FinalSynthesisInputV1Schema = z
  .object({
    ...SynthesizeCommonShape,
    purpose: z.literal('final_synthesis'),
    acceptedPlan: ArtifactRefSchema,
    taskArtifacts: z.array(ArtifactRefSchema).min(1).max(200),
    evaluation: ArtifactRefSchema,
    repairPass: z.literal(1),
  })
  .strict()
  .superRefine((input, ctx) => {
    validateSynthesisAuthority(input, ctx);
    validateTaskArtifactRefs(input.taskArtifacts, ctx);
    const expected = [
      input.acceptedScope,
      input.research,
      input.acceptedPlan,
      ...input.taskArtifacts,
      input.evaluation,
    ].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    if (
      input.acceptedPlan.kind !== 'plan' ||
      input.evaluation.kind !== 'evaluation' ||
      canonicalJson(input.sourceArtifacts) !== canonicalJson(expected)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'final synthesis must bind exact evaluated artifacts',
      });
    }
  });

export const BlockedReportSynthesisInputV1Schema = z
  .object({
    ...SynthesizeCommonShape,
    purpose: z.literal('blocked_report'),
    repairPass: z.literal(0),
  })
  .strict()
  .superRefine((input, ctx) => {
    validateSynthesisAuthority(input, ctx);
    if (
      input.outputContract.evidenceReadiness !== 'blocked' ||
      input.outputContract.launchReadyAllowed ||
      canonicalJson(input.sourceArtifacts) !==
        canonicalJson(
          [input.acceptedScope, input.research].sort((left, right) =>
            left.artifactId.localeCompare(right.artifactId)
          )
        )
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'blocked report must be non-authorizing and bind only scope and blocked research',
      });
    }
  });

export const SynthesizeArtifactInputV1Schema = z.discriminatedUnion('purpose', [
  ExecuteTaskSynthesisInputV1Schema,
  EvaluateOutputSynthesisInputV1Schema,
  FinalSynthesisInputV1Schema,
  BlockedReportSynthesisInputV1Schema,
]);

export const AssistantConversationMessageV1Schema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(24_000),
  })
  .strict();

export const AssistantTurnInputV1Schema = z
  .object({
    type: z.literal('AssistantTurnV1'),
    responseMode: z.enum(['direct_answer', 'discover', 'one_shot']),
    message: z.string().min(1).max(24_000),
    conversation: z.array(AssistantConversationMessageV1Schema).max(20).default([]),
  })
  .strict();

export const AssistantImageAspectRatioV1Schema = z.enum([
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '21:9',
]);

export const AssistantImageMimeTypeV1Schema = z.enum([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

const AssistantCurrencyCodeV1Schema = z.string().regex(/^[A-Z]{3}$/u);
const AssistantUnsignedDecimalV1Schema = z
  .string()
  .min(1)
  .max(31)
  .regex(/^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,12})?$/u);
const AssistantMoneyAmountV1Schema = z
  .string()
  .min(1)
  .max(19)
  .regex(/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/u);
const AssistantTemperatureDecimalV1Schema = z
  .string()
  .min(1)
  .max(7)
  .regex(/^-?(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,2})?$/u);

function canonicalBase64Bytes(value) {
  if (!value || value.length % 4) return null;
  try {
    const bytes = Buffer.from(value, 'base64');
    return bytes.toString('base64') === value ? bytes : null;
  } catch {
    return null;
  }
}

function imageBytesMatchMimeType(mimeType, bytes) {
  if (mimeType === 'image/png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  }
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    mimeType === 'image/webp' &&
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

export const AssistantTextCapabilityV2Schema = z.object({ kind: z.literal('text') }).strict();

export const AssistantImageGenerateCapabilityV2Schema = z
  .object({
    kind: z.literal('image_generate'),
    aspectRatio: AssistantImageAspectRatioV1Schema.optional(),
    imageSize: z.literal('1K').default('1K'),
  })
  .strict();

export const AssistantWeatherCapabilityV2Schema = z
  .object({
    kind: z.literal('weather'),
    location: z.string().min(1).max(500),
    tempUnit: z.enum(['C', 'F']),
  })
  .strict();

export const AssistantCurrencyCapabilityV2Schema = z
  .object({
    kind: z.literal('currency'),
    base: AssistantCurrencyCodeV1Schema,
    quote: AssistantCurrencyCodeV1Schema,
    amount: AssistantMoneyAmountV1Schema,
  })
  .strict();

export const AssistantCapabilityV2Schema = z.discriminatedUnion('kind', [
  AssistantTextCapabilityV2Schema,
  AssistantImageGenerateCapabilityV2Schema,
  AssistantWeatherCapabilityV2Schema,
  AssistantCurrencyCapabilityV2Schema,
]);

export const AssistantTurnInputV2Schema = z
  .object({
    type: z.literal('AssistantTurnV2'),
    responseMode: z.enum(['direct_answer', 'discover', 'one_shot']),
    message: z.string().min(1).max(24_000),
    conversation: z.array(AssistantConversationMessageV1Schema).max(20).default([]),
    capability: AssistantCapabilityV2Schema,
  })
  .strict();

const SolutionPreparationFieldNameV1Schema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/)
  .refine((value) => !['constructor', 'prototype', '__proto__'].includes(value));

export const SolutionPreparationFieldV1Schema = z
  .object({
    source: SolutionPreparationFieldNameV1Schema.nullable(),
    target: SolutionPreparationFieldNameV1Schema.nullable(),
    transform: z.enum(['copy', 'trim', 'lowercase', 'uppercase']).nullable(),
  })
  .strict();

const SolutionPreparationQuestionIdV1Schema = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/);

export const SolutionPreparationQuestionV1Schema = z
  .object({
    id: SolutionPreparationQuestionIdV1Schema,
    kind: z.literal('information'),
    prompt: z.string().min(1).max(1000),
    reason: z.string().min(1).max(1000),
  })
  .strict();

export const PrepareSolutionInputV1Schema = z
  .object({
    type: z.literal('PrepareSolutionV1'),
    buildRequestId: UuidSchema,
    inputVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    instruction: z.string().min(1).max(24_000),
    agent: z
      .object({
        id: UuidSchema,
        name: z.string().min(1).max(120),
        profileVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        roleLabel: z.string().min(1).max(120),
        description: z.string().max(2000),
        instructions: z.string().max(12_000),
        profileHash: Sha256Schema,
      })
      .strict(),
    source: z
      .object({
        runId: UuidSchema,
        taskHash: Sha256Schema,
        title: z.string().min(1).max(500),
        taskText: z.string().min(1).max(24_000),
        contextHash: Sha256Schema,
      })
      .strict(),
    answers: z
      .array(
        z
          .object({
            questionId: SolutionPreparationQuestionIdV1Schema,
            value: z.string().min(1).max(2000),
          })
          .strict()
      )
      .max(32),
    draft: z
      .object({
        kind: z.literal('webhook_transform_v1'),
        fields: z.array(SolutionPreparationFieldV1Schema).max(12),
      })
      .strict()
      .nullable(),
    supportedCapabilities: z.tuple([z.literal('webhook_transform_v1')]),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.answers.map((answer) => answer.questionId)).size === value.answers.length,
    'Solution answers must have unique question IDs'
  );

export const PrepareSolutionResponseV1Schema = z
  .object({
    schemaVersion: z.literal('axwise.solution-preparation.v1'),
    buildRequestId: UuidSchema,
    inputVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    outcome: z.enum(['needs_input', 'candidate', 'unsupported']),
    name: z.string().min(1).max(120),
    purpose: z.string().min(1).max(2000),
    explanation: z.string().min(1).max(2000),
    spec: SolutionSpecSchema.nullable(),
    partialFields: z.array(SolutionPreparationFieldV1Schema).max(12),
    questions: z.array(SolutionPreparationQuestionV1Schema).max(8),
    unsupportedCapabilities: z.array(z.string().min(1).max(120)).max(8),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.questions.map((question) => question.id)).size !== value.questions.length) {
      ctx.addIssue({ code: 'custom', message: 'Solution questions must have unique IDs' });
    }
    const candidate =
      value.outcome === 'candidate' &&
      value.spec !== null &&
      canonicalJson(value.partialFields) === canonicalJson(value.spec.fields) &&
      value.questions.length === 0 &&
      value.unsupportedCapabilities.length === 0;
    const needsInput =
      value.outcome === 'needs_input' &&
      value.spec === null &&
      value.questions.length > 0 &&
      value.unsupportedCapabilities.length === 0;
    const unsupported =
      value.outcome === 'unsupported' &&
      value.spec === null &&
      value.partialFields.length === 0 &&
      value.questions.length === 0 &&
      value.unsupportedCapabilities.length > 0;
    if (!candidate && !needsInput && !unsupported) {
      ctx.addIssue({
        code: 'custom',
        message: 'Solution preparation state does not match its bounded result',
      });
    }
  });

export const {
  AdmitTranscriptCorpusInputV1Schema,
  AnalyzeEvidenceInputV1Schema,
  SimulateInputV1Schema,
  AnalyzeEvidenceDraftInputV1Schema,
  SimulateDraftInputV1Schema,
} = createCapabilityOperationSchemas({
  ArtifactRefSchema, ScopeArtifactV2Schema, ArtifactContentSchema, ExecutionAgentContractV1Schema,
});

export const ActivityInputSchema = capabilityAwareSchema(z.union([
  CompileScopeInputV2Schema,
  CompileScopeInputV3Schema,
  ReviseScopeInputV2Schema,
  ExecuteResearchInputV2Schema,
  OrqalyPlanInputV2Schema,
  SynthesizeArtifactInputV1Schema,
  AdmitTranscriptCorpusInputV1Schema,
  AnalyzeEvidenceInputV1Schema,
  SimulateInputV1Schema,
]));

export const AxWiseOperationInputSchema = capabilityAwareSchema(z.union([
  AssistantTurnInputV1Schema,
  AssistantTurnInputV2Schema,
  PrepareSolutionInputV2Schema,
  PrepareSolutionInputV1Schema,
  CompileScopeInputV2Schema,
  CompileScopeInputV3Schema,
  ReviseScopeInputV2Schema,
  ExecuteResearchInputV2Schema,
  SynthesizeArtifactInputV1Schema,
  AdmitTranscriptCorpusInputV1Schema,
  AnalyzeEvidenceInputV1Schema,
  SimulateInputV1Schema,
]));

const AxWiseOperationEnvelopeObjectSchema = z
  .object({
    operationId: UuidSchema,
    operationType: z.enum([
      'AssistantTurnV1',
      'AssistantTurnV2',
      'PrepareSolutionV1',
      'PrepareSolutionV2',
      'CompileScopeV2',
      'CompileScopeV3',
      'ReviseScopeV2',
      'ExecuteResearchV2',
      'SynthesizeArtifactV1',
      'AdmitTranscriptCorpusV1',
      'AnalyzeEvidenceV1',
      'SimulateV1',
    ]),
    owner: OwnerSchema,
    workflow: WorkflowReferenceSchema,
    contractVersion: z.literal(AXWISE_OPERATION_CONTRACT_VERSION),
    canonicalInputHash: Sha256Schema,
    input: AxWiseOperationInputSchema,
  })
  .strict()
  .superRefine((envelope, ctx) => {
    try {
      validateCapabilityEnvelopeConsent(envelope);
    } catch {
      ctx.addIssue({ code: 'custom', path: ['input', 'processingConsent'], message: 'capability consent must bind this exact operation input and owner' });
    }
    if (envelope.operationType !== envelope.input.type) {
      ctx.addIssue({
        code: 'custom',
        path: ['operationType'],
        message: 'operation type must match typed input',
      });
    }
    // Native node versions/parameters legitimately contain decimals. Keep the
    // historical integer-only canonical contract unchanged for every V1 input.
    const expectedInputHash =
      envelope.input.type === 'PrepareSolutionV2'
        ? sha256Hex(canonicalizeNativeJson(envelope.input))
        : canonicalHash(envelope.input);
    if (expectedInputHash !== envelope.canonicalInputHash) {
      ctx.addIssue({
        code: 'custom',
        path: ['canonicalInputHash'],
        message: 'canonical input hash does not match typed input',
      });
    }
    if (
      ['PrepareSolutionV1', 'PrepareSolutionV2'].includes(envelope.input.type) &&
      envelope.input.source.runId !== envelope.workflow.runId
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['input', 'source', 'runId'],
        message: 'Solution source run must match its workflow envelope',
      });
    }
    const executionAgent = envelope.input.executionAgent;
    if (
      executionAgent &&
      (executionAgent.runId !== envelope.workflow.runId ||
        executionAgent.owner.tenantId !== envelope.owner.tenantId ||
        executionAgent.owner.userId !== envelope.owner.userId)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['input', 'executionAgent'],
        message: 'execution Agent must match the AxWise workflow and owner envelope',
      });
    }
  });

export const AxWiseOperationEnvelopeSchema = capabilityAwareSchema(AxWiseOperationEnvelopeObjectSchema, { envelope: true });

export const RunSnapshotSchema = z
  .object({
    id: UuidSchema,
    tenantId: UuidSchema,
    ownerUserId: ClerkUserIdSchema,
    ownerOrganizationId: ClerkOrganizationIdSchema.nullable().default(null),
    mode: ChatModeSchema,
    workProfile: CapabilityWorkProfileSchema.optional(),
    status: RunStatusSchema,
    // The original request is durable workflow state, not presentation-only
    // client state. Older snapshots may omit it while revisions drain, so keep
    // the additive field nullable during the rolling contract upgrade.
    request: z.string().min(1).max(24_000).nullable().default(null),
    requestHash: Sha256Schema,
    rowVersion: z.number().int().nonnegative(),
    evidenceReadiness: EvidenceReadinessSchema.nullable().default(null),
    finalArtifact: ArtifactRefSchema.nullable().default(null),
  })
  .strict();

export const StageSnapshotSchema = z
  .object({
    id: UuidSchema,
    stageKey: z.string().min(1).max(120),
    kind: StageKindSchema,
    status: StageStatusSchema,
    rowVersion: z.number().int().nonnegative(),
    ordinal: z.number().int().nonnegative(),
    inputHash: Sha256Schema.nullable().default(null),
    outputArtifact: ArtifactRefSchema.nullable().default(null),
  })
  .strict();

export const AttemptSnapshotSchema = z
  .object({
    id: UuidSchema,
    stageId: UuidSchema,
    attemptNumber: z.number().int().positive(),
    status: AttemptStatusSchema,
    operationId: UuidSchema,
    inputHash: Sha256Schema,
    inputPayload: ActivityInputSchema,
    rowVersion: z.number().int().nonnegative(),
    leaseToken: UuidSchema.nullable().default(null),
    leaseExpiresAt: z.string().datetime().nullable().default(null),
  })
  .strict()
  .superRefine(validateAttemptInput);

export const PublicAttemptSnapshotSchema = AttemptSnapshotSchema.transform((attempt) => {
  const publicAttempt = { ...attempt };
  delete publicAttempt.leaseToken;
  return publicAttempt;
});

export const DependencySnapshotSchema = z
  .object({
    stageId: UuidSchema,
    dependsOnStageId: UuidSchema,
  })
  .strict();

export const ApprovalSnapshotSchema = z
  .object({
    id: UuidSchema,
    kind: ApprovalKindSchema,
    stageId: UuidSchema,
    artifact: ArtifactRefSchema,
    inputHash: Sha256Schema,
    idempotencyKey: z.string().min(1).max(200),
    decisionHash: Sha256Schema,
    decision: z.enum(['approved', 'rejected']),
  })
  .strict();

export const WorkflowSnapshotSchema = z
  .object({
    run: RunSnapshotSchema,
    stages: z.array(StageSnapshotSchema).max(120),
    attempts: z.array(AttemptSnapshotSchema).max(500),
    dependencies: z.array(DependencySnapshotSchema).max(1000),
    approvals: z.array(ApprovalSnapshotSchema).max(20),
  })
  .strict();

export const PublicWorkflowSnapshotSchema = z
  .object({
    run: RunSnapshotSchema,
    stages: z.array(StageSnapshotSchema).max(120),
    attempts: z.array(PublicAttemptSnapshotSchema).max(500),
    dependencies: z.array(DependencySnapshotSchema).max(1000),
    approvals: z.array(ApprovalSnapshotSchema).max(20),
  })
  .strict();

const BaseEventSchema = z.object({
  eventId: UuidSchema,
  tenantId: UuidSchema,
  runId: UuidSchema,
  occurredAt: z.string().datetime(),
});

export const {
  CapabilityRunRequestedEventSchema,
  CapabilityScopeApprovedEventSchema,
  CapabilityActivityRequestedEventSchema,
} = createCapabilityWorkEventSchemas({ BaseEventSchema, CompileScopeInputV2Schema, ActivityInputSchema });

export const RunRequestedEventSchema = BaseEventSchema.extend({
  type: z.literal('RunRequested'),
  ownerUserId: ClerkUserIdSchema,
  ownerOrganizationId: ClerkOrganizationIdSchema.nullable(),
  mode: ChatModeSchema,
  request: z.string().min(1).max(24_000),
  requestHash: Sha256Schema,
  stageIds: z
    .object({
      compileScope: UuidSchema,
      gate1: UuidSchema,
      research: UuidSchema,
      planning: UuidSchema,
      gate2: UuidSchema,
      evaluation: UuidSchema,
      synthesis: UuidSchema,
    })
    .strict(),
  attemptId: UuidSchema,
  operationId: UuidSchema,
  inputHash: Sha256Schema,
  inputPayload: CompileScopeInputSchema,
}).strict();

function validateAttemptInput(attempt, ctx) {
  if (canonicalHash(attempt.inputPayload) !== attempt.inputHash) {
    ctx.addIssue({
      code: 'custom',
      path: ['inputHash'],
      message: 'attempt input hash does not match canonical typed input',
    });
  }
}

const NextAttemptBaseSchema = z
  .object({
    attemptId: UuidSchema,
    operationId: UuidSchema,
    inputHash: Sha256Schema,
    inputPayload: ActivityInputSchema,
  })
  .strict();
const NextAttemptSchema = NextAttemptBaseSchema.superRefine(validateAttemptInput);
const NextStageAttemptSchema = NextAttemptBaseSchema.extend({
  stageId: UuidSchema,
})
  .strict()
  .superRefine(validateAttemptInput);

export const ScopeRevisionRequestedEventSchema = BaseEventSchema.extend({
  type: z.literal('ScopeRevisionRequested'),
  stageId: UuidSchema,
  gateStageId: UuidSchema,
  acceptedScope: ArtifactRefSchema,
  correction: z.string().min(1).max(6000),
  idempotencyKey: z.string().min(1).max(200),
  nextAttempt: NextAttemptSchema,
}).strict();

export const ActivityStartedEventSchema = BaseEventSchema.extend({
  type: z.literal('ActivityStarted'),
  stageId: UuidSchema,
  attemptId: UuidSchema,
  leaseToken: UuidSchema,
  deploymentId: z.string().min(1).max(300),
}).strict();

export const ActivityDeferredEventSchema = BaseEventSchema.extend({
  type: z.literal('ActivityDeferred'),
  stageId: UuidSchema,
  attemptId: UuidSchema,
  leaseToken: UuidSchema,
  statusUrl: z.string().url(),
  nextPollAt: z.string().datetime(),
}).strict();

export const ActivityDispatchAmbiguousEventSchema = ActivityDeferredEventSchema.safeExtend({
  type: z.literal('ActivityDispatchAmbiguous'),
}).strict();

export const ActivityRedispatchRequestedEventSchema = BaseEventSchema.extend({
  type: z.literal('ActivityRedispatchRequested'),
  stageId: UuidSchema,
  attemptId: UuidSchema,
  leaseToken: UuidSchema,
  redispatchAt: z.string().datetime(),
}).strict();

export const CompletionMetricsSchema = z
  .object({
    latencyMs: z.number().int().nonnegative(),
    provider: z.literal('google').optional(),
    model: z.string().min(1).max(200).optional(),
    modelVersion: z.string().min(1).max(200).optional(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
    searchCalls: z.number().int().nonnegative().optional(),
    estimatedCostMicros: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

const ScopeCompletionResultSchema = z
  .object({
    resultType: z.literal('scope_compiled'),
    artifact: ScopeArtifactFactSchema,
    metrics: CompletionMetricsSchema.optional(),
  })
  .strict();
const ResearchCompletionResultSchema = z
  .object({
    resultType: z.literal('research_completed'),
    artifact: ResearchArtifactFactSchema,
    evidenceReadiness: EvidenceReadinessSchema,
    metrics: CompletionMetricsSchema.optional(),
  })
  .strict()
  .refine((result) => result.evidenceReadiness === result.artifact.payload.readiness, {
    path: ['evidenceReadiness'],
    message: 'research completion readiness must equal immutable research payload',
  });
const PlanningCompletionResultSchema = z
  .object({
    resultType: z.literal('plan_created'),
    artifact: PlanArtifactFactSchema,
    planning: PlanningResultSchema,
    metrics: CompletionMetricsSchema.optional(),
  })
  .strict()
  .refine((result) => canonicalJson(result.planning) === canonicalJson(result.artifact.payload), {
    path: ['planning'],
    message: 'planning fact must equal immutable plan artifact payload',
  });
const TaskCompletionResultSchema = z
  .object({
    resultType: z.literal('task_completed'),
    artifact: z.union([TaskArtifactFactSchema, FinalMarkdownArtifactFactSchema]),
    evidenceReadiness: EvidenceReadinessSchema,
    metrics: CompletionMetricsSchema.optional(),
  })
  .strict()
  .refine((result) => result.evidenceReadiness === result.artifact.payload.evidenceReadiness, {
    path: ['evidenceReadiness'],
    message: 'task completion readiness must equal immutable task artifact payload',
  });
const EvaluationCompletionResultSchema = z
  .object({
    resultType: z.literal('evaluation_completed'),
    artifact: EvaluationArtifactFactSchema,
    executionOutputContractSatisfied: z.boolean(),
    directPromotionArtifact: ArtifactRefSchema.nullable(),
    metrics: CompletionMetricsSchema.optional(),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (
      result.executionOutputContractSatisfied !== result.artifact.payload.outputContractSatisfied
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['executionOutputContractSatisfied'],
        message: 'completion fact must equal immutable evaluation satisfaction',
      });
    }
    if (result.executionOutputContractSatisfied !== Boolean(result.directPromotionArtifact)) {
      ctx.addIssue({
        code: 'custom',
        path: ['directPromotionArtifact'],
        message: 'direct promotion ref must match evaluation satisfaction fact',
      });
    }
    const promoted = result.artifact.payload.promotedArtifact;
    if (canonicalJson(promoted) !== canonicalJson(result.directPromotionArtifact)) {
      ctx.addIssue({
        code: 'custom',
        path: ['directPromotionArtifact'],
        message: 'direct promotion ref must equal immutable evaluation payload',
      });
    }
  });
const FinalCompletionResultSchema = z
  .object({
    resultType: z.literal('artifact_synthesized'),
    artifact: FinalMarkdownArtifactFactSchema,
    evidenceReadiness: EvidenceReadinessSchema,
    metrics: CompletionMetricsSchema.optional(),
  })
  .strict()
  .refine((result) => result.evidenceReadiness === result.artifact.payload.evidenceReadiness, {
    path: ['evidenceReadiness'],
    message: 'synthesis readiness must equal immutable final artifact payload',
  });

export const AssistantSourceV1Schema = z
  .object({
    title: z.string().min(1).max(500),
    canonicalUrl: PublicHttpsUrlSchema,
    sourceTypes: sourceTypesSchema({ min: 1 }),
  })
  .strict();

export const AssistantFactV1Schema = z
  .object({
    statement: z.string().min(1).max(4000),
    sourceUrls: z.array(PublicHttpsUrlSchema).max(10).default([]),
  })
  .strict()
  .superRefine((fact, ctx) => addCanonicalStringListIssue(ctx, fact, 'sourceUrls'));

export const AssistantRecommendationV1Schema = z
  .object({
    kind: z.enum(['continue_conversation', 'consider_goal']),
    summary: z.string().min(1).max(1000),
  })
  .strict();

export const AssistantTurnV1Schema = z
  .object({
    schemaVersion: z.literal('axwise.assistant-turn.v1'),
    markdown: z.string().min(1).max(120_000),
    sources: z.array(AssistantSourceV1Schema).max(10).default([]),
    facts: z.array(AssistantFactV1Schema).max(50).default([]),
    recommendations: z.array(AssistantRecommendationV1Schema).max(5).default([]),
  })
  .strict();

export const AssistantPresentationSourceV1Schema = z
  .object({
    title: z.string().min(1).max(500),
    url: PublicHttpsUrlSchema,
  })
  .strict();

export const AssistantGeneratedImagePresentationV1Schema = z
  .object({
    schemaVersion: z.literal('axwise.presentation.generated-image.v1'),
    kind: z.literal('generated_image'),
    mimeType: AssistantImageMimeTypeV1Schema,
    data: z.string().min(4).max(14_000_000),
    sha256: Sha256Schema,
    alt: z.string().min(1).max(1000),
    model: z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u),
  })
  .strict()
  .superRefine((presentation, ctx) => {
    const bytes = canonicalBase64Bytes(presentation.data);
    if (!bytes) {
      ctx.addIssue({ code: 'custom', path: ['data'], message: 'image data must be canonical base64' });
      return;
    }
    if (bytes.length > 10_485_760) {
      ctx.addIssue({ code: 'custom', path: ['data'], message: 'generated image data must decode to at most 10485760 bytes' });
    }
    if (!imageBytesMatchMimeType(presentation.mimeType, bytes)) {
      ctx.addIssue({ code: 'custom', path: ['mimeType'], message: 'image bytes must match mimeType' });
    }
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== presentation.sha256) {
      ctx.addIssue({ code: 'custom', path: ['sha256'], message: 'generated image sha256 must match its decoded bytes' });
    }
  });

export const AssistantWeatherForecastV1Schema = z
  .object({
    label: z.string().min(1).max(120),
    condition: z.string().min(1).max(120),
    high: AssistantTemperatureDecimalV1Schema.optional(),
    low: AssistantTemperatureDecimalV1Schema.optional(),
  })
  .strict();

export const AssistantWeatherPresentationV1Schema = z
  .object({
    schemaVersion: z.literal('axwise.presentation.weather.v1'),
    kind: z.literal('weather'),
    location: z.string().min(1).max(500),
    observedAt: UtcRfc3339Schema,
    temperatureUnit: z.enum(['C', 'F']),
    temperature: AssistantTemperatureDecimalV1Schema,
    condition: z.string().min(1).max(120),
    high: AssistantTemperatureDecimalV1Schema.optional(),
    low: AssistantTemperatureDecimalV1Schema.optional(),
    forecast: z.array(AssistantWeatherForecastV1Schema).max(10),
    source: AssistantPresentationSourceV1Schema,
  })
  .strict();

export const AssistantCurrencyPresentationV1Schema = z
  .object({
    schemaVersion: z.literal('axwise.presentation.currency.v1'),
    kind: z.literal('currency'),
    base: AssistantCurrencyCodeV1Schema,
    quote: AssistantCurrencyCodeV1Schema,
    amount: AssistantUnsignedDecimalV1Schema,
    convertedAmount: AssistantUnsignedDecimalV1Schema,
    rate: AssistantUnsignedDecimalV1Schema,
    inverseRate: AssistantUnsignedDecimalV1Schema.optional(),
    asOf: UtcRfc3339Schema,
    source: AssistantPresentationSourceV1Schema,
  })
  .strict();

export const AssistantPresentationV1Schema = z.discriminatedUnion('kind', [
  AssistantGeneratedImagePresentationV1Schema,
  AssistantWeatherPresentationV1Schema,
  AssistantCurrencyPresentationV1Schema,
]);

export const AssistantTurnV2Schema = z
  .object({
    schemaVersion: z.literal('axwise.assistant-turn.v2'),
    markdown: z.string().min(1).max(120_000),
    sources: z.array(AssistantSourceV1Schema).max(10).default([]),
    facts: z.array(AssistantFactV1Schema).max(50).default([]),
    recommendations: z.array(AssistantRecommendationV1Schema).max(5).default([]),
    presentations: z.array(AssistantPresentationV1Schema).min(1).max(8),
  })
  .strict();

export const AssistantTurnResponseSchema = z.discriminatedUnion('schemaVersion', [
  AssistantTurnV1Schema,
  AssistantTurnV2Schema,
]);

const AssistantTurnCompletionResultSchema = z
  .object({
    resultType: z.literal('assistant_turn_completed'),
    response: AssistantTurnResponseSchema,
    metrics: CompletionMetricsSchema.optional(),
  })
  .strict();

export const PrepareSolutionCompletionResultV1Schema = z
  .object({
    resultType: z.literal('solution_prepared'),
    response: PrepareSolutionResponseV1Schema,
    metrics: CompletionMetricsSchema.optional(),
  })
  .strict();

export const CompletionResultSchema = z.discriminatedUnion('resultType', [
  ScopeCompletionResultSchema,
  ResearchCompletionResultSchema,
  PlanningCompletionResultSchema,
  TaskCompletionResultSchema,
  EvaluationCompletionResultSchema,
  FinalCompletionResultSchema,
  TranscriptCorpusAdmittedResultSchema,
  EvidenceAnalyzedResultSchema,
  SimulationCompletedResultSchema,
]);

export const AxWiseCompletionResultSchema = z.discriminatedUnion('resultType', [
  AssistantTurnCompletionResultSchema,
  PrepareSolutionCompletionResultV1Schema.extend({
    response: z.union([PrepareSolutionResponseV1Schema, PrepareSolutionResponseV2Schema]),
  }),
  ScopeCompletionResultSchema,
  ResearchCompletionResultSchema,
  PlanningCompletionResultSchema,
  TaskCompletionResultSchema,
  EvaluationCompletionResultSchema,
  FinalCompletionResultSchema,
  TranscriptCorpusAdmittedResultSchema,
  EvidenceAnalyzedResultSchema,
  SimulationCompletedResultSchema,
]);

export const AxWiseOperationAcceptedSchema = z
  .object({
    operationId: UuidSchema,
    status: z.enum(['accepted', 'running', 'cancel_requested']),
    canonicalInputHash: Sha256Schema,
    statusUrl: z.string().url(),
    retryAfterSeconds: z.number().int().min(1).max(300).default(2),
  })
  .strict();

export const AxWiseOperationCompletedSchema = z
  .object({
    operationId: UuidSchema,
    status: z.literal('completed'),
    canonicalInputHash: Sha256Schema,
    result: AxWiseCompletionResultSchema,
  })
  .strict();

const AxWiseDiagnosticTokenSchema = z.string().regex(/^[A-Za-z0-9_:-]{1,100}$/u);

const AxWiseFailurePhaseDiagnosticsShape = {
  route: AxWiseDiagnosticTokenSchema,
  status: AxWiseDiagnosticTokenSchema,
  elapsedMs: z.number().int().min(0).max(900_000).optional(),
  callCount: z.number().int().min(0).max(100).optional(),
  retryCount: z.number().int().min(0).max(100).optional(),
  inputTokens: z.number().int().min(0).max(2_000_000).optional(),
  outputTokens: z.number().int().min(0).max(2_000_000).optional(),
  totalTokens: z.number().int().min(0).max(2_000_000).optional(),
  reasoningTokens: z.number().int().min(0).max(2_000_000).optional(),
  limitKind: z
    .enum([
      'request',
      'per_request_input',
      'input',
      'output',
      'total',
      'provider_output',
      'deadline',
      'unknown',
    ])
    .optional(),
  usageComplete: z.boolean().optional(),
  upstreamStatusCode: z.number().int().min(100).max(599).optional(),
  primarySkipped: z.boolean().optional(),
  circuitState: z.literal('open').optional(),
  retryAfterSeconds: z.number().int().min(1).max(900).optional(),
};

function validateAxWiseCircuitDiagnostics(diagnostics, context) {
  if (diagnostics.primarySkipped === true && diagnostics.circuitState !== 'open') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['circuitState'],
      message: 'a skipped primary must identify the open circuit',
    });
  }
  if (diagnostics.circuitState === 'open' && diagnostics.primarySkipped !== true) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['primarySkipped'],
      message: 'an open circuit must identify the skipped primary',
    });
  }
}

export const AxWiseFailurePhaseDiagnosticsSchema = z
  .object(AxWiseFailurePhaseDiagnosticsShape)
  .strict()
  .superRefine(validateAxWiseCircuitDiagnostics);

export const AxWiseFailureDiagnosticsSchema = z
  .object({
    ...AxWiseFailurePhaseDiagnosticsShape,
    primaryStatus: AxWiseDiagnosticTokenSchema.optional(),
    fallbackAttempted: z.boolean().optional(),
    fallbackUsed: z.boolean().optional(),
    primary: AxWiseFailurePhaseDiagnosticsSchema.optional(),
    fallback: AxWiseFailurePhaseDiagnosticsSchema.optional(),
    discovery: AxWiseFailurePhaseDiagnosticsSchema.optional(),
  })
  .strict()
  .superRefine(validateAxWiseCircuitDiagnostics);

export const AxWiseOperationFailedSchema = z
  .object({
    operationId: UuidSchema,
    status: z.literal('failed'),
    canonicalInputHash: Sha256Schema,
    retryable: z.boolean(),
    errorClass: z.string().min(1).max(200),
    retryAt: UtcRfc3339Schema.optional(),
    retryAfterSeconds: z.number().int().min(1).max(900).optional(),
    diagnostics: AxWiseFailureDiagnosticsSchema.optional(),
  })
  .strict()
  .superRefine((failure, context) => {
    if (!failure.retryable && (failure.retryAt || failure.retryAfterSeconds)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retryable'],
        message: 'retry timing requires a retryable failure',
      });
    }
  });

export const AxWiseOperationCancelledSchema = z
  .object({
    operationId: UuidSchema,
    status: z.literal('cancelled'),
    canonicalInputHash: Sha256Schema,
  })
  .strict();

export const AxWiseOperationResponseSchema = z.discriminatedUnion('status', [
  AxWiseOperationAcceptedSchema,
  AxWiseOperationCompletedSchema,
  AxWiseOperationFailedSchema,
  AxWiseOperationCancelledSchema,
]);

export const AxWiseOperationEventTypeSchema = z.enum([
  'accepted',
  'running',
  'heartbeat',
  'cancel_requested',
  'cancelled',
  'completed',
  'failed',
]);

export const AxWiseOperationStatusSchema = z.enum([
  'accepted',
  'running',
  'cancel_requested',
  'cancelled',
  'completed',
  'failed',
]);

export const AxWiseOperationEventSchema = z
  .object({
    operationId: UuidSchema,
    sequence: z.number().int().positive(),
    eventType: AxWiseOperationEventTypeSchema,
    status: AxWiseOperationStatusSchema,
    occurredAt: UtcRfc3339Schema,
    retryable: z.boolean().optional(),
    errorClass: z.string().min(1).max(200).optional(),
    retryAt: UtcRfc3339Schema.optional(),
    retryAfterSeconds: z.number().int().min(1).max(900).optional(),
    diagnostics: AxWiseFailureDiagnosticsSchema.optional(),
  })
  .strict()
  .superRefine((event, context) => {
    const allowedStatuses = {
      accepted: ['accepted'],
      running: ['running'],
      heartbeat: ['running', 'cancel_requested'],
      cancel_requested: ['cancel_requested'],
      cancelled: ['cancelled'],
      completed: ['completed'],
      failed: ['failed'],
    }[event.eventType];
    if (!allowedStatuses.includes(event.status)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'event type and operation status are inconsistent',
      });
    }
    const failureFields = [
      event.retryable,
      event.errorClass,
      event.retryAt,
      event.retryAfterSeconds,
      event.diagnostics,
    ];
    if (event.eventType === 'failed') {
      if (event.retryable === undefined || event.errorClass === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['retryable'],
          message: 'failed events require the failure disposition',
        });
      }
      if (!event.retryable && (event.retryAt || event.retryAfterSeconds)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['retryable'],
          message: 'retry timing requires a retryable failed event',
        });
      }
    } else if (failureFields.some((value) => value !== undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['eventType'],
        message: 'only failed events may carry failure details',
      });
    }
  });

export const AxWiseOperationEventPageSchema = z
  .object({
    operationId: UuidSchema,
    after: z.number().int().nonnegative(),
    nextAfter: z.number().int().nonnegative(),
    hasMore: z.boolean(),
    events: z.array(AxWiseOperationEventSchema).max(200),
  })
  .strict()
  .superRefine((page, context) => {
    const sequences = page.events.map((event) => event.sequence);
    if (page.events.some((event) => event.operationId !== page.operationId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['events'],
        message: 'event page operation IDs must match',
      });
    }
    if (
      sequences.some(
        (sequence, index) => sequence <= page.after || (index && sequence <= sequences[index - 1])
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['events'],
        message: 'event sequences must increase strictly after the cursor',
      });
    }
    if (page.nextAfter !== (sequences.at(-1) || page.after)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nextAfter'],
        message: 'nextAfter must equal the last delivered sequence',
      });
    }
  });

export const ActivityCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal('ActivityCompleted'),
  stageId: UuidSchema,
  attemptId: UuidSchema,
  leaseToken: UuidSchema,
  result: CompletionResultSchema,
  nextAttempts: z.array(NextStageAttemptSchema).max(100).default([]),
}).strict();

export const ActivityFailedEventSchema = BaseEventSchema.extend({
  type: z.literal('ActivityFailed'),
  stageId: UuidSchema,
  attemptId: UuidSchema,
  leaseToken: UuidSchema,
  retryable: z.boolean(),
  errorClass: z.string().min(1).max(200),
  nextAttempt: NextAttemptSchema.optional(),
}).strict();

export const LeaseExpiredEventSchema = BaseEventSchema.extend({
  type: z.literal('LeaseExpired'),
  stageId: UuidSchema,
  attemptId: UuidSchema,
  leaseToken: UuidSchema,
  requeueAt: z.string().datetime(),
}).strict();

export const ApprovalGrantedEventSchema = BaseEventSchema.extend({
  type: z.literal('ApprovalGranted'),
  approvalId: UuidSchema,
  approvalKind: ApprovalKindSchema,
  stageId: UuidSchema,
  artifact: ArtifactRefSchema,
  inputHash: Sha256Schema,
  selectedEvidence: z.array(ArtifactRefSchema).max(200).default([]),
  idempotencyKey: z.string().min(1).max(200),
  decisionHash: Sha256Schema,
  decidedBy: ClerkUserIdSchema,
  nextAttempts: z.array(NextStageAttemptSchema).max(100).default([]),
})
  .strict()
  .superRefine((event, ctx) => {
    const ids = event.selectedEvidence.map((artifact) => artifact.artifactId);
    if (
      event.selectedEvidence.some((artifact) => artifact.kind !== 'evidence') ||
      new Set(ids).size !== ids.length ||
      canonicalJson(ids) !== canonicalJson([...ids].sort())
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['selectedEvidence'],
        message: 'approval evidence must be sorted unique evidence artifacts',
      });
    }
    if (event.approvalKind === 'plan' && event.selectedEvidence.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['selectedEvidence'],
        message: 'plan approval cannot change selected evidence',
      });
    }
  });

const WorkflowEventSchemas = [
  RunRequestedEventSchema,
  CapabilityRunRequestedEventSchema,
  CapabilityScopeApprovedEventSchema,
  CapabilityActivityRequestedEventSchema,
  ScopeRevisionRequestedEventSchema,
  ActivityStartedEventSchema,
  ActivityDeferredEventSchema,
  ActivityDispatchAmbiguousEventSchema,
  ActivityRedispatchRequestedEventSchema,
  ActivityCompletedEventSchema,
  ActivityFailedEventSchema,
  LeaseExpiredEventSchema,
  ApprovalGrantedEventSchema,
];

export const WORKFLOW_EVENT_TYPES = Object.freeze(
  WorkflowEventSchemas.map((schema) => schema.shape.type.value)
);

export const WorkflowEventSchema = z.discriminatedUnion('type', WorkflowEventSchemas);

const RowMutationSchema = z
  .object({
    id: UuidSchema,
    expectedVersion: z.number().int().nonnegative(),
    patch: z.record(z.string(), z.unknown()),
  })
  .strict();

const CreatedStageSchema = z
  .object({
    id: UuidSchema,
    stageKey: z.string().min(1).max(120),
    kind: StageKindSchema,
    status: StageStatusSchema,
    ordinal: z.number().int().nonnegative(),
    inputHash: Sha256Schema.nullable(),
  })
  .strict();

const CreatedAttemptSchema = z
  .object({
    id: UuidSchema,
    stageId: UuidSchema,
    attemptNumber: z.number().int().positive(),
    operationId: UuidSchema,
    inputHash: Sha256Schema,
    inputPayload: ActivityInputSchema,
    inputCanonical: z.string().min(2),
    activityType: z.enum([
      'axwise_operation',
      'orqaly_plan',
      'orqaly_execute',
      'orqaly_evaluate',
      'promote_artifact',
    ]),
  })
  .strict()
  .superRefine((attempt, ctx) => {
    const canonical = canonicalJson(attempt.inputPayload);
    if (
      canonical !== attempt.inputCanonical ||
      canonicalHash(attempt.inputPayload) !== attempt.inputHash
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['inputCanonical'],
        message: 'created attempt must persist exact canonical typed input bytes',
      });
    }
  });

const CreatedArtifactSchema = z
  .object({
    artifactId: UuidSchema,
    artifactHash: Sha256Schema,
    kind: z.string().min(1).max(120),
    contentType: z.enum(['application/json', 'text/markdown']),
    payload: z.record(z.string(), z.unknown()),
    markdown: z.string().min(1).nullable(),
    sourceArtifactIds: z.array(UuidSchema).max(204),
    canonicalContent: z.string().min(2),
    stageId: UuidSchema,
    attemptId: UuidSchema,
    operationId: UuidSchema,
    inputHash: Sha256Schema,
  })
  .strict()
  .superRefine((artifact, ctx) => {
    const fact = {
      artifactId: artifact.artifactId,
      artifactHash: artifact.artifactHash,
      kind: artifact.kind,
      contentType: artifact.contentType,
      payload: artifact.payload,
      markdown: artifact.markdown,
      sourceArtifactIds: artifact.sourceArtifactIds,
    };
    const parsed = ArtifactFactSchema.safeParse(fact);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue(issue);
    }
    const expected = canonicalJson({
      contentType: artifact.contentType,
      payload: artifact.payload,
      markdown: artifact.markdown,
    });
    if (expected !== artifact.canonicalContent) {
      ctx.addIssue({
        code: 'custom',
        path: ['canonicalContent'],
        message: 'artifact canonical content bytes do not match content envelope',
      });
    }
  });

export const TransitionPlanSchema = z
  .object({
    contractVersion: z.literal(WORKFLOW_CONTRACT_VERSION),
    event: WorkflowEventSchema,
    eventCanonical: z.string().min(2),
    eventHash: Sha256Schema,
    runMutation: RowMutationSchema.nullable(),
    stageMutations: z.array(RowMutationSchema),
    attemptMutations: z.array(RowMutationSchema),
    createStages: z.array(CreatedStageSchema),
    createDependencies: z.array(DependencySnapshotSchema),
    createAttempts: z.array(CreatedAttemptSchema),
    createArtifacts: z.array(CreatedArtifactSchema),
    createApproval: z
      .object({
        id: UuidSchema,
        kind: ApprovalKindSchema,
        stageId: UuidSchema,
        artifact: ArtifactRefSchema,
        inputHash: Sha256Schema,
        idempotencyKey: z.string().min(1).max(200),
        decisionHash: Sha256Schema,
        decidedBy: ClerkUserIdSchema,
      })
      .strict()
      .nullable(),
    outbox: z.array(
      z
        .object({
          idempotencyKey: z.string().min(1).max(300),
          commandType: z.enum(['dispatch_activity', 'poll_activity', 'export_final_artifact']),
          stageId: UuidSchema,
          attemptId: UuidSchema,
          operationId: UuidSchema,
          inputHash: Sha256Schema,
          artifact: ArtifactRefSchema.nullable().default(null),
          availableAt: z.string().datetime(),
        })
        .strict()
        .superRefine((command, ctx) => {
          if ((command.commandType === 'export_final_artifact') !== Boolean(command.artifact)) {
            ctx.addIssue({
              code: 'custom',
              path: ['artifact'],
              message: 'only final export commands carry an artifact reference',
            });
          }
        })
    ),
    audit: z
      .object({
        eventType: z.string().min(1).max(200),
        payload: z.record(z.string(), z.unknown()),
      })
      .strict(),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const canonical = canonicalJson(plan.event);
    if (plan.eventCanonical !== canonical) {
      ctx.addIssue({
        code: 'custom',
        path: ['eventCanonical'],
        message: 'transition event canonical bytes do not match the typed event',
      });
    }
    if (plan.eventHash !== sha256Hex(plan.eventCanonical)) {
      ctx.addIssue({
        code: 'custom',
        path: ['eventHash'],
        message: 'transition event hash does not match the canonical event bytes',
      });
    }
  });
