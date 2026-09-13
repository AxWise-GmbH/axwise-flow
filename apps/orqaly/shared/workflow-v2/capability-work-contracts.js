// Server-only owner command and immutable event contracts for the capability
// profile. A model result can never create one of these owner commands.
import { z } from 'zod';
import {
  CapabilityUuidSchema as Uuid,
  CapabilitySha256Schema as Sha,
  CorpusArtifactRefV1Schema as Ref,
  TranscriptCorpusV1Schema,
  capabilityText,
} from './capability-source-contracts.js';
import { AnalysisRequestV1Schema } from './capability-analysis-contracts.js';
import { SimulationRequestV1Schema } from './capability-simulation-contracts.js';
import {
  CAPABILITY_WORK_PROFILE,
  CAPABILITY_COMPILER_NOTICE,
  CAPABILITY_PROCESSING_NOTICE,
} from './capability-work-primitives.js';

const Type = z.enum(['AnalyzeEvidenceV1', 'SimulateV1']);
const ScopeRef = Ref.refine((reference) => reference.kind === 'scope', 'scope reference required');
const Command = z.object({ commandId: Uuid, issuedAt: z.string().datetime() });
const GroundingSelection = z
  .object({ artifact: Ref, entryKind: z.enum(['claim', 'quote']), entryId: Sha })
  .strict();

export const CapabilityWorkProfileSchema = z
  .object({
    type: z.literal(CAPABILITY_WORK_PROFILE),
    capability: Type,
    purpose: capabilityText(1, 4000),
    allowSimulationAnalysis: z.boolean(),
    compilerNoticeVersion: z.literal(CAPABILITY_COMPILER_NOTICE),
  })
  .strict()
  .refine(
    (profile) => profile.capability === 'SimulateV1' || !profile.allowSimulationAnalysis,
    'analysis work cannot authorize a simulation continuation'
  );

export const StartCapabilityWorkCommandSchema = Command.extend({
  capability: Type,
  request: capabilityText(1, 4000),
  allowSimulationAnalysis: z.boolean(),
  compilerDisclosure: z
    .object({ accepted: z.literal(true), noticeVersion: z.literal(CAPABILITY_COMPILER_NOTICE) })
    .strict(),
})
  .strict()
  .refine(
    (command) => command.capability === 'SimulateV1' || !command.allowSimulationAnalysis,
    'analysis work cannot authorize a simulation continuation'
  );

export const ApproveCapabilityScopeCommandSchema = Command.extend({
  artifact: ScopeRef,
  scopeCompatible: z.literal(true),
}).strict();

export const AdmitCapabilityCorpusCommandSchema = Command.extend({
  expectedRowVersion: z.number().int().nonnegative(),
  corpus: TranscriptCorpusV1Schema,
}).strict();

const Draft = Command.extend({ expectedRowVersion: z.number().int().nonnegative() });
export const PrepareCapabilityOperationCommandSchema = z.discriminatedUnion('operationType', [
  Draft.extend({
    operationType: z.literal('AnalyzeEvidenceV1'),
    request: AnalysisRequestV1Schema,
    sourceArtifact: Ref.refine((ref) => ['transcript_corpus', 'simulation'].includes(ref.kind)),
  }).strict(),
  Draft.extend({
    operationType: z.literal('SimulateV1'),
    request: SimulationRequestV1Schema,
    selectedGrounding: z.array(GroundingSelection).max(16),
  }).strict(),
]);

export const ConfirmCapabilityOperationCommandSchema = z
  .object({
    draft: PrepareCapabilityOperationCommandSchema,
    confirmation: z
      .object({
        granted: z.literal(true),
        provider: z.literal('google'),
        purpose: Type,
        operationId: Uuid,
        bindingHash: Sha,
        reviewId: Sha,
        noticeVersion: z.literal(CAPABILITY_PROCESSING_NOTICE),
        scopeCompatible: z.literal(true),
      })
      .strict(),
  })
  .strict();

// Called from the existing contract module after its input schemas exist, so
// this module does not import that module or create an initialization cycle.
export function createCapabilityWorkEventSchemas({
  BaseEventSchema,
  CompileScopeInputV2Schema,
  ActivityInputSchema,
}) {
  const CapabilityRunRequestedEventSchema = BaseEventSchema.extend({
    type: z.literal('CapabilityRunRequested'),
    ownerCommandHash: Sha,
    ownerUserId: z.string().regex(/^user_[A-Za-z0-9]+$/),
    ownerOrganizationId: z.null(),
    mode: z.literal('simple'),
    workProfile: CapabilityWorkProfileSchema,
    request: z.string().min(1).max(24_000),
    requestHash: Sha,
    stageIds: z.object({ compileScope: Uuid, gate1: Uuid }).strict(),
    attemptId: Uuid,
    operationId: Uuid,
    inputHash: Sha,
    inputPayload: CompileScopeInputV2Schema,
  }).strict();
  const CapabilityScopeApprovedEventSchema = BaseEventSchema.extend({
    type: z.literal('CapabilityScopeApproved'),
    ownerCommandHash: Sha,
    approvalId: Uuid,
    stageId: Uuid,
    artifact: ScopeRef,
    inputHash: Sha,
    idempotencyKey: z.string().min(1).max(200),
    decisionHash: Sha,
    decidedBy: z.string().regex(/^user_[A-Za-z0-9]+$/),
    scopeCompatible: z.literal(true),
  }).strict();
  const CapabilityActivityRequestedEventSchema = BaseEventSchema.extend({
    type: z.literal('CapabilityActivityRequested'),
    ownerCommandHash: Sha,
    decidedBy: z.string().regex(/^user_[A-Za-z0-9]+$/),
    expectedRowVersion: z.number().int().nonnegative(),
    stageId: Uuid,
    stageKey: z.string().regex(/^capability-[a-z0-9-]{1,90}$/),
    ordinal: z.number().int().min(30).max(1000),
    attemptId: Uuid,
    operationId: Uuid,
    inputHash: Sha,
    inputPayload: ActivityInputSchema,
    acceptedScope: ScopeRef,
    scopeApprovalId: Uuid,
    scopeCompatible: z.literal(true),
    reviewId: Sha.nullable(),
  }).strict();
  return {
    CapabilityRunRequestedEventSchema,
    CapabilityScopeApprovedEventSchema,
    CapabilityActivityRequestedEventSchema,
  };
}
