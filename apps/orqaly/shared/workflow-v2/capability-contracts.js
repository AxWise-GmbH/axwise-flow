// Server-only capability wire contracts. Existing contracts are passed into the
// operation factory to avoid a circular import or historical schema replacement.
// Pure hashes/schemas do not grant source access, opt-in or execution authority.
import { z } from 'zod';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  artifactContentHash,
  canonicalHash,
  canonicalJson,
} from '../../lib/workflow-v2/canonical.js';
import {
  CapabilitySha256Schema as Sha,
  CapabilityUuidSchema as Uuid,
  CorpusArtifactRefV1Schema as Ref,
  TranscriptCorpusV1Schema,
  capabilityInteger as integer,
  capabilityUtf8,
  validateCapabilityStructure,
  boundedCapabilitySchema,
  refineCapability,
} from './capability-source-contracts.js';
import {
  AnalysisRequestV1Schema,
  QualitativeAnalysisV1Schema,
  validateAnalysisRequest,
} from './capability-analysis-contracts.js';
import {
  SimulationRequestV1Schema,
  SimulationV1Schema,
} from './capability-simulation-contracts.js';

export * from './capability-source-contracts.js';
export * from './capability-analysis-contracts.js';
export * from './capability-simulation-contracts.js';

export const CAPABILITY_OPERATION_TYPES = Object.freeze([
  'AdmitTranscriptCorpusV1',
  'AnalyzeEvidenceV1',
  'SimulateV1',
]);
export const PROCESSING_NOTICE_VERSION = 'google-selected-sources-v1';
const purposes = ['AnalyzeEvidenceV1', 'SimulateV1'];
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const must = (value) => {
  if (!value) throw new TypeError('Invalid bounded capability identity');
};
const sortedIds = (values) => [...new Set(values)].sort();
export const CapabilityLimitsV1Schema = z
  .object({
    deadlineMs: integer(1, 900_000),
    maxModelCalls: integer(1, 32),
    maxInputTokens: integer(1, 2_000_000),
    maxOutputTokens: integer(1, 2_000_000),
  })
  .strict();
export function effectiveCapabilityLimits(requested, policy) {
  const left = CapabilityLimitsV1Schema.parse(requested),
    right = CapabilityLimitsV1Schema.parse(policy);
  return Object.fromEntries(Object.keys(left).map((key) => [key, Math.min(left[key], right[key])]));
}
export const CapabilityProcessingConsentV1Schema = z
  .object({
    schemaVersion: z.literal('axwise.processing-consent.v1'),
    granted: z.literal(true),
    provider: z.literal('google'),
    purpose: z.enum(purposes),
    operationId: Uuid,
    bindingHash: Sha,
    noticeVersion: z.literal('google-selected-sources-v1'),
  })
  .strict();
const Owner = z
  .object({
    tenantId: Uuid,
    organizationId: z
      .string()
      .regex(/^org_[A-Za-z0-9]+$/)
      .nullable(),
    userId: z.string().regex(/^user_[A-Za-z0-9]+$/),
  })
  .strict();
const Workflow = z.object({ runId: Uuid, stageId: Uuid, stageAttemptId: Uuid }).strict();
export function processingConsentBindingHash(envelope) {
  // This helper intentionally accepts validated draft input without consent.
  // Only its top-level member is excluded; nested same-named data stay bound.
  validateCapabilityStructure(envelope);
  must(
    purposes.includes(envelope.operationType) && envelope.contractVersion === 'axwise.operation.v2'
  );
  must(
    envelope.input &&
      typeof envelope.input === 'object' &&
      !Array.isArray(envelope.input) &&
      envelope.input.type === envelope.operationType
  );
  const { processingConsent: _consent, ...input } = envelope.input;
  const payload = {
    schemaVersion: 'axwise.processing-consent-binding.v1',
    provider: 'google',
    purpose: envelope.operationType,
    operationId: Uuid.parse(envelope.operationId),
    owner: Owner.parse(envelope.owner),
    workflow: Workflow.parse(envelope.workflow),
    contractVersion: envelope.contractVersion,
    input,
  };
  validateCapabilityStructure(payload);
  return canonicalHash(payload);
}
export function validateCapabilityEnvelopeConsent(envelope) {
  // Determine whether capability bounds apply without evaluating an untrusted
  // discriminator accessor. Legacy plain-data envelopes remain a no-op here.
  const operationType = Object.getOwnPropertyDescriptor(envelope, 'operationType');
  must(!operationType || Object.hasOwn(operationType, 'value'));
  if (!CAPABILITY_OPERATION_TYPES.includes(operationType?.value)) return envelope;
  validateCapabilityStructure(envelope);
  must(
    envelope.operationType === envelope.input.type &&
      canonicalHash(envelope.input) === envelope.canonicalInputHash
  );
  const operationId = Uuid.parse(envelope.operationId),
    owner = Owner.parse(envelope.owner),
    workflow = Workflow.parse(envelope.workflow);
  if (envelope.input.executionAgent) {
    const agent = envelope.input.executionAgent;
    must(
      agent.runId === workflow.runId &&
        agent.owner.tenantId === owner.tenantId &&
        agent.owner.userId === owner.userId
    );
  }
  if (purposes.includes(envelope.operationType)) {
    const consent = CapabilityProcessingConsentV1Schema.parse(envelope.input.processingConsent);
    must(
      consent.operationId === operationId &&
        consent.purpose === envelope.operationType &&
        consent.bindingHash === processingConsentBindingHash(envelope)
    );
  }
  return envelope;
}
export function capabilityArtifactId(operationId, kind) {
  must(['transcript_corpus', 'qualitative_analysis', 'simulation'].includes(kind));
  const namespace = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');
  const bytes = createHash('sha1')
    .update(namespace)
    .update(`axwise:${Uuid.parse(operationId)}:${kind}`, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x50;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function factSchema(kind, payload, lineage) {
  return refineCapability(
    z
      .object({
        artifactId: Uuid,
        artifactHash: Sha,
        kind: z.literal(kind),
        contentType: z.literal('application/json').default('application/json'),
        payload,
        markdown: z.null().default(null),
        sourceArtifactIds: z.array(Uuid).max(204).default([]),
      })
      .strict(),
    (value) => {
      must(value.artifactHash === artifactContentHash(value));
      must(same(value.sourceArtifactIds, sortedIds(lineage(value.payload))));
      if (kind === 'simulation')
        must(value.artifactId === capabilityArtifactId(value.payload.operationId, kind));
    }
  );
}
export const TranscriptCorpusArtifactFactSchema = factSchema(
  'transcript_corpus',
  TranscriptCorpusV1Schema,
  (corpus) => corpus.documents.flatMap((doc) => doc.originArtifactRefs.map((ref) => ref.artifactId))
);
export const QualitativeAnalysisArtifactFactSchema = factSchema(
  'qualitative_analysis',
  QualitativeAnalysisV1Schema,
  (analysis) => [
    analysis.acceptedScope.artifactId,
    ...analysis.sourceArtifacts.map((ref) => ref.artifactId),
  ]
);
export const SimulationArtifactFactSchema = factSchema(
  'simulation',
  SimulationV1Schema,
  (simulation) => [
    simulation.acceptedScope.artifactId,
    ...simulation.sourceArtifacts.map((ref) => ref.artifactId),
  ]
);
const modelIdentifier = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/)
  .nullable()
  .optional();
export const CapabilityOperationMetricsSchema = refineCapability(
  z
    .object({
      latencyMs: integer(0, Number.MAX_SAFE_INTEGER),
      provider: z.literal('google').nullable().optional(),
      model: modelIdentifier,
      modelVersion: modelIdentifier,
      modelCalls: integer(0, 32),
      usageComplete: z.boolean(),
      budgetScope: z.literal('invocation'),
      inputTokens: integer(0, 2_000_000).nullable().optional(),
      outputTokens: integer(0, 2_000_000).nullable().optional(),
      totalTokens: integer(0, 4_000_000).nullable().optional(),
      searchCalls: z.literal(0),
      estimatedCostMicros: integer(0, Number.MAX_SAFE_INTEGER).nullable().optional(),
    })
    .strict(),
  (value) => {
    const known = value.inputTokens != null && value.outputTokens != null;
    must(value.usageComplete === known);
    must((value.totalTokens ?? null) === (known ? value.inputTokens + value.outputTokens : null));
    if (!known) must(value.estimatedCostMicros == null);
    if (value.modelCalls === 0)
      must(
        known &&
          value.totalTokens === 0 &&
          value.provider == null &&
          value.model == null &&
          value.modelVersion == null
      );
  }
);
function resultSchema(resultType, artifact, modelFree) {
  return refineCapability(
    z
      .object({
        resultType: z.literal(resultType),
        artifact,
        metrics: CapabilityOperationMetricsSchema.nullable().optional(),
      })
      .strict(),
    (value) => {
      if (value.metrics != null)
        must(modelFree ? value.metrics.modelCalls === 0 : value.metrics.modelCalls >= 1);
    }
  );
}
export const TranscriptCorpusAdmittedResultSchema = resultSchema(
  'transcript_corpus_admitted',
  TranscriptCorpusArtifactFactSchema,
  true
);
export const EvidenceAnalyzedResultSchema = resultSchema(
  'evidence_analyzed',
  QualitativeAnalysisArtifactFactSchema,
  false
);
export const SimulationCompletedResultSchema = resultSchema(
  'simulation_completed',
  SimulationArtifactFactSchema,
  false
);
export const SimulationGroundingSelectionV1Schema = z
  .object({ artifact: Ref, entryKind: z.enum(['claim', 'quote']), entryId: Sha })
  .strict();

function normalizeExecutionAgent(value) {
  if (value.executionAgent != null) return value;
  const { executionAgent: _agent, ...wire } = value;
  return wire;
}
function operationInput(schema, validate) {
  return boundedCapabilitySchema(schema)
    .transform(normalizeExecutionAgent)
    .superRefine((value, ctx) => {
      try {
        validate(value);
        must(capabilityUtf8(canonicalJson(value)).length <= 1_000_000);
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Invalid bounded capability input' });
      }
    });
}
export function createCapabilityOperationSchemas({
  ArtifactRefSchema,
  ScopeArtifactV2Schema,
  ArtifactContentSchema,
  ExecutionAgentContractV1Schema,
}) {
  if (
    [
      ArtifactRefSchema,
      ScopeArtifactV2Schema,
      ArtifactContentSchema,
      ExecutionAgentContractV1Schema,
    ].some((schema) => !schema?.parse)
  )
    throw new TypeError('Existing workflow schemas must be supplied explicitly');
  const agent = ExecutionAgentContractV1Schema.nullable().optional();
  const admissionShape = {
    type: z.literal('AdmitTranscriptCorpusV1'),
    corpus: TranscriptCorpusV1Schema,
    admissionProfile: z.literal('supplied_transcript_v1'),
    executionAgent: agent,
  };
  const analyzeShape = {
    type: z.literal('AnalyzeEvidenceV1'),
    acceptedScope: ArtifactRefSchema,
    scope: ScopeArtifactV2Schema,
    source: ArtifactContentSchema,
    request: AnalysisRequestV1Schema,
    limits: CapabilityLimitsV1Schema,
    executionAgent: agent,
  };
  const simulateShape = {
    type: z.literal('SimulateV1'),
    acceptedScope: ArtifactRefSchema,
    scope: ScopeArtifactV2Schema,
    request: SimulationRequestV1Schema,
    selectedGrounding: z.array(SimulationGroundingSelectionV1Schema).max(16),
    limits: CapabilityLimitsV1Schema,
    executionAgent: agent,
  };
  const validateAdmission = (value) => {
    const refs = new Map();
    for (const doc of value.corpus.documents)
      for (const ref of doc.originArtifactRefs) {
        must(!refs.has(ref.artifactId) || same(refs.get(ref.artifactId), ref));
        refs.set(ref.artifactId, ref);
      }
    must(refs.size <= 16);
  };
  const validateAnalysis = (value) => {
    must(
      value.acceptedScope.kind === 'scope' &&
        ['transcript_corpus', 'simulation'].includes(value.source.artifact.kind)
    );
    must(
      value.source.contentType === 'application/json' &&
        value.source.payload !== null &&
        value.source.markdown === null
    );
    must(value.acceptedScope.artifactId !== value.source.artifact.artifactId);
    const corpus =
      value.source.artifact.kind === 'simulation'
        ? SimulationV1Schema.parse(value.source.payload).corpus
        : TranscriptCorpusV1Schema.parse(value.source.payload);
    validateAnalysisRequest(value.request, corpus);
  };
  const validateSimulate = (value) => {
    must(value.acceptedScope.kind === 'scope');
    const expected = new Map(
        value.request.grounding.sourceArtifacts.map((ref) => [ref.artifactId, ref])
      ),
      used = new Set(),
      keys = new Set();
    must(!expected.has(value.acceptedScope.artifactId));
    for (const selection of value.selectedGrounding) {
      const ref = selection.artifact;
      must(expected.has(ref.artifactId) && same(expected.get(ref.artifactId), ref));
      must(
        (ref.kind === 'research' && selection.entryKind === 'claim') ||
          (ref.kind === 'qualitative_analysis' && selection.entryKind === 'quote')
      );
      const key = canonicalJson([ref.artifactId, selection.entryKind, selection.entryId]);
      must(!keys.has(key));
      keys.add(key);
      used.add(ref.artifactId);
    }
    must(used.size === expected.size);
  };
  const validatePurpose = (validate) => (value) => {
    must(value.processingConsent.purpose === value.type);
    validate(value);
  };
  return {
    AdmitTranscriptCorpusInputV1Schema: operationInput(
      z.object(admissionShape).strict(),
      validateAdmission
    ),
    AnalyzeEvidenceInputV1Schema: operationInput(
      z
        .object({ ...analyzeShape, processingConsent: CapabilityProcessingConsentV1Schema })
        .strict(),
      validatePurpose(validateAnalysis)
    ),
    SimulateInputV1Schema: operationInput(
      z
        .object({ ...simulateShape, processingConsent: CapabilityProcessingConsentV1Schema })
        .strict(),
      validatePurpose(validateSimulate)
    ),
    // Internal preparation only: these do not attest opt-in and must never be
    // dispatched as AxWise operation inputs before explicit owner confirmation.
    AnalyzeEvidenceDraftInputV1Schema: operationInput(
      z.object(analyzeShape).strict(),
      validateAnalysis
    ),
    SimulateDraftInputV1Schema: operationInput(z.object(simulateShape).strict(), validateSimulate),
  };
}
