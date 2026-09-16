// Server-only, model-free parity with qualitative_analysis.py. These contracts
// prove exact source binding and evidence/gap accounting, not entailment,
// authenticity, source access, representativeness, or execution authority.
import { z } from 'zod';
import { canonicalHash, canonicalJson } from '../../lib/workflow-v2/canonical.js';
import {
  capabilityText,
  capabilityUtf8,
  CapabilityIdSchema,
  CapabilitySha256Schema,
  CapabilityUuidSchema,
  CorpusArtifactRefV1Schema,
  TranscriptCorpusV1Schema,
  SourceQuoteV1Schema,
  validateSourceQuote,
  transcriptCorpusHash,
  assertUnique,
  refineCapability,
} from './capability-source-contracts.js';

export const ANALYSIS_LIMITS = Object.freeze({
  questions: 16,
  findings: 256,
  quotes: 256,
  gaps: 128,
  quoteBytes: 128_000,
  textBytes: 256_000,
  documents: 16,
  participants: 32,
});
const check = (condition, message) => {
  if (!condition) throw new TypeError(message);
};
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const sameSet = (left, right) =>
  left.size === right.size && [...left].every((key) => right.has(key));
const participantKey = (reference) =>
  canonicalJson({
    documentId: reference.documentId,
    participantId: reference.participantId,
  });
const sortedRefs = (references) => {
  const byHash = new Map(references.map((reference) => [canonicalHash(reference), reference]));
  return [...byHash.keys()].sort().map((key) => byHash.get(key));
};
const unique = (values, message) => assertUnique(values, message);
const boundedIds = (maximum, minimum = 0) =>
  z.array(CapabilitySha256Schema).min(minimum).max(maximum);
const TextSchema = capabilityText(1, 4000);
const LabelSchema = capabilityText(1, 500);
export const AnalysisOutputSchema = z.enum(['personas', 'jobs_pains']);
export const FindingCategorySchema = z.enum(['job', 'pain', 'goal', 'need', 'trait']);
export const FindingBasisSchema = z.enum([
  'source_statement',
  'interpretation',
  'simulation_hypothesis',
]);
export const FindingSupportStatusSchema = z.enum(['supported', 'insufficient', 'conflicting']);
export const AnalysisCoverageStatusSchema = z.enum(['complete', 'partial', 'blocked']);
export const AnalysisGapCodeSchema = z.enum([
  'insufficient_evidence',
  'conflicting_evidence',
  'missing_participant_turns',
  'unanswered_question',
  'no_supported_output',
]);
export const AnalysisParticipantRefV1Schema = z.strictObject({
  documentId: CapabilityUuidSchema,
  participantId: CapabilityIdSchema,
});
export const AnalysisQuestionV1Schema = z.strictObject({
  id: CapabilityIdSchema,
  text: TextSchema,
});
export const AnalysisRequestV1Schema = refineCapability(
  z.strictObject({
    decisionQuestion: TextSchema,
    questions: z.array(AnalysisQuestionV1Schema).min(1).max(ANALYSIS_LIMITS.questions),
    outputs: z.array(AnalysisOutputSchema).min(1).max(2),
    analysisProfile: z.literal('qualitative_v1'),
  }),
  (value) => {
    unique(
      value.questions.map((question) => question.id),
      'analysis question IDs must be unique'
    );
    unique(value.outputs, 'analysis outputs must be unique');
  }
);

const findingShape = {
  category: FindingCategorySchema,
  statement: TextSchema,
  basis: FindingBasisSchema,
  supportStatus: FindingSupportStatusSchema,
  quoteIds: boundedIds(ANALYSIS_LIMITS.quotes),
  questionIds: z.array(CapabilityIdSchema).min(1).max(ANALYSIS_LIMITS.questions),
  participantRefs: z.array(AnalysisParticipantRefV1Schema).min(1).max(ANALYSIS_LIMITS.participants),
};
function validateFindingContent(value) {
  unique(value.quoteIds, 'finding quote IDs must be unique');
  unique(value.questionIds, 'finding question IDs must be unique');
  unique(
    value.participantRefs.map(participantKey),
    'finding participant references must be unique'
  );
  check(
    value.supportStatus !== 'supported' || value.quoteIds.length > 0,
    'supported findings require source quotes'
  );
  check(
    value.basis !== 'source_statement' || value.quoteIds.length > 0,
    'source_statement findings require source quotes'
  );
}
function findingIdentity(value) {
  return canonicalHash({
    category: value.category,
    statement: value.statement,
    basis: value.basis,
    supportStatus: value.supportStatus,
    quoteIds: [...value.quoteIds].sort(),
    questionIds: [...value.questionIds].sort(),
    participantRefs: sortedRefs(value.participantRefs),
  });
}
export const AnalysisFindingContentV1Schema = refineCapability(
  z.strictObject(findingShape),
  validateFindingContent
);
export const AnalysisFindingV1Schema = refineCapability(
  z.strictObject({
    ...findingShape,
    findingId: CapabilitySha256Schema,
  }),
  (value) => {
    validateFindingContent(value);
    check(
      value.findingId === findingIdentity(value),
      'finding ID must bind its semantics and source references'
    );
  }
);
export function createAnalysisFinding(content) {
  const value = AnalysisFindingContentV1Schema.parse(content);
  return AnalysisFindingV1Schema.parse({ ...value, findingId: findingIdentity(value) });
}

const personaShape = {
  participantRefs: z.array(AnalysisParticipantRefV1Schema).min(1).max(1),
  displayLabel: LabelSchema,
  origin: z.enum(['supplied_transcript', 'synthetic_transcript']),
  traitFindingIds: boundedIds(ANALYSIS_LIMITS.findings, 1),
};
function validatePersonaContent(value) {
  unique(value.traitFindingIds, 'persona trait finding IDs must be unique');
}
function personaIdentity(value) {
  return canonicalHash({
    type: 'qualitative_persona_v1',
    participantRefs: sortedRefs(value.participantRefs),
    traitFindingIds: [...value.traitFindingIds].sort(),
    origin: value.origin,
  });
}
export const AnalysisPersonaContentV1Schema = refineCapability(
  z.strictObject(personaShape),
  validatePersonaContent
);
export const AnalysisPersonaV1Schema = refineCapability(
  z.strictObject({
    ...personaShape,
    personaId: CapabilitySha256Schema,
  }),
  (value) => {
    validatePersonaContent(value);
    check(
      value.personaId === personaIdentity(value),
      'persona ID must bind its source identity and traits'
    );
  }
);
export function createAnalysisPersona(content) {
  const value = AnalysisPersonaContentV1Schema.parse(content);
  return AnalysisPersonaV1Schema.parse({ ...value, personaId: personaIdentity(value) });
}

export const AnalysisGapV1Schema = refineCapability(
  z.strictObject({
    code: AnalysisGapCodeSchema,
    questionId: CapabilityIdSchema.nullable(),
    participantRef: AnalysisParticipantRefV1Schema.nullable(),
    output: AnalysisOutputSchema.nullable(),
    message: TextSchema,
  }),
  (value) => {
    check(
      value.questionId !== null || value.participantRef !== null || value.output !== null,
      'analysis gaps require an explicit coverage target'
    );
    check(
      value.code !== 'missing_participant_turns' || value.participantRef !== null,
      'missing-participant-turn gaps require a participant'
    );
    check(
      value.code !== 'unanswered_question' || value.questionId !== null,
      'unanswered-question gaps require a question'
    );
    check(
      value.code !== 'no_supported_output' || value.output !== null,
      'output gaps require an output'
    );
  }
);
const coverageShape = {
  status: AnalysisCoverageStatusSchema,
  issueCodes: z.array(AnalysisGapCodeSchema).max(5),
};
const validateIssues = (value) => unique(value.issueCodes, 'coverage issue codes must be unique');
export const AnalysisDocumentCoverageV1Schema = refineCapability(
  z.strictObject({
    ...coverageShape,
    documentId: CapabilityUuidSchema,
  }),
  validateIssues
);
export const AnalysisParticipantCoverageV1Schema = refineCapability(
  z.strictObject({
    ...coverageShape,
    documentId: CapabilityUuidSchema,
    participantId: CapabilityIdSchema,
    findingIds: boundedIds(ANALYSIS_LIMITS.findings),
  }),
  validateIssues
);
// Python's question-row wire schema does not independently deduplicate these
// lists. Publication still requires equality with deterministic derived rows.
export const AnalysisQuestionCoverageV1Schema = z.strictObject({
  questionId: CapabilityIdSchema,
  status: z.enum(['answered', 'partial', 'insufficient']),
  findingIds: boundedIds(ANALYSIS_LIMITS.findings),
  issueCodes: z.array(AnalysisGapCodeSchema).max(5),
});
export const AnalysisOutputCoverageV1Schema = refineCapability(
  z.strictObject({
    ...coverageShape,
    output: AnalysisOutputSchema,
    entryIds: boundedIds(ANALYSIS_LIMITS.findings),
  }),
  validateIssues
);
export const AnalysisQuoteLineageV1Schema = z.strictObject({
  quoteId: CapabilitySha256Schema,
  interviewQuestionId: CapabilityIdSchema.nullable(),
});
const contentShape = {
  schemaVersion: z.literal('axwise.qualitative-analysis.v1'),
  acceptedScope: CorpusArtifactRefV1Schema,
  sourceArtifacts: z.array(CorpusArtifactRefV1Schema).min(1).max(16),
  corpusHash: CapabilitySha256Schema,
  request: AnalysisRequestV1Schema,
  methodVersion: CapabilityIdSchema,
  quotes: z.array(SourceQuoteV1Schema).max(ANALYSIS_LIMITS.quotes),
  findings: z.array(AnalysisFindingV1Schema).max(ANALYSIS_LIMITS.findings),
  personas: z.array(AnalysisPersonaV1Schema).max(ANALYSIS_LIMITS.participants),
  gaps: z.array(AnalysisGapV1Schema).max(ANALYSIS_LIMITS.gaps),
  limitations: z.array(TextSchema).max(16),
};
function validateContent(value) {
  check(
    value.acceptedScope.kind === 'scope',
    'analysis accepted scope must reference a scope artifact'
  );
  check(
    value.sourceArtifacts.every((ref) => ['transcript_corpus', 'simulation'].includes(ref.kind)),
    'analysis sources must be transcript-corpus or simulation artifacts'
  );
  unique(
    value.sourceArtifacts.map((ref) => ref.artifactId),
    'source artifact IDs must be unique'
  );
  unique(
    value.quotes.map((quote) => quote.quoteId),
    'analysis quote IDs must be unique'
  );
  unique(
    value.findings.map((finding) => finding.findingId),
    'analysis finding IDs must be unique'
  );
  unique(
    value.personas.map((persona) => persona.personaId),
    'analysis persona IDs must be unique'
  );
  unique(
    value.personas.map((persona) => participantKey(persona.participantRefs[0])),
    'persona source identities must be unique'
  );
  unique(
    value.gaps.map((gap) =>
      canonicalJson([
        gap.code,
        gap.questionId,
        gap.participantRef === null ? null : participantKey(gap.participantRef),
        gap.output,
      ])
    ),
    'analysis gap targets must be unique'
  );
  check(
    value.quotes.reduce((sum, quote) => sum + capabilityUtf8(quote.text).length, 0) <=
      ANALYSIS_LIMITS.quoteBytes,
    'analysis exceeds aggregate quote UTF-8 byte limit'
  );
  const texts = [
    value.request.decisionQuestion,
    ...value.request.questions.map((question) => question.text),
    ...value.findings.map((finding) => finding.statement),
    ...value.personas.map((persona) => persona.displayLabel),
    ...value.gaps.map((gap) => gap.message),
    ...value.limitations,
  ];
  check(
    texts.reduce((sum, text) => sum + capabilityUtf8(text).length, 0) <= ANALYSIS_LIMITS.textBytes,
    'analysis exceeds aggregate derived-text UTF-8 byte limit'
  );
}
export const AnalysisContentV1Schema = refineCapability(
  z.strictObject(contentShape),
  validateContent
);
const coverageFields = Object.freeze([
  'coverageStatus',
  'documentCoverage',
  'participantCoverage',
  'questionCoverage',
  'outputCoverage',
  'quoteLineage',
]);
export const QualitativeAnalysisV1Schema = refineCapability(
  z.strictObject({
    ...contentShape,
    coverageStatus: AnalysisCoverageStatusSchema,
    documentCoverage: z
      .array(AnalysisDocumentCoverageV1Schema)
      .min(1)
      .max(ANALYSIS_LIMITS.documents),
    participantCoverage: z
      .array(AnalysisParticipantCoverageV1Schema)
      .min(1)
      .max(ANALYSIS_LIMITS.participants),
    questionCoverage: z
      .array(AnalysisQuestionCoverageV1Schema)
      .min(1)
      .max(ANALYSIS_LIMITS.questions),
    outputCoverage: z.array(AnalysisOutputCoverageV1Schema).min(1).max(2),
    quoteLineage: z.array(AnalysisQuoteLineageV1Schema).max(ANALYSIS_LIMITS.quotes),
  }),
  validateContent
);

export function validateAnalysisRequest(request, corpus) {
  const result = AnalysisRequestV1Schema.parse(request);
  const source = TranscriptCorpusV1Schema.parse(corpus);
  check(
    source.documents.every((document) => document.origin !== 'supplied_document'),
    'document-only sources are not supported by qualitative_v1'
  );
  check(
    source.documents.every((document) =>
      document.participants.some((person) => person.role === 'participant')
    ),
    'each analysis document requires a source participant identity'
  );
  check(
    source.documents.some((document) => {
      const participants = new Set(
        document.participants
          .filter((person) => person.role === 'participant')
          .map((person) => person.participantId)
      );
      return document.turns.some((turn) => participants.has(turn.participantId));
    }),
    'qualitative_v1 requires participant transcript turns'
  );
  return result;
}
const rowStatus = (entries, issues) =>
  !entries.length ? 'blocked' : issues.length ? 'partial' : 'complete';
const groupStatus = (statuses) =>
  statuses.every((status) => status === 'complete')
    ? 'complete'
    : statuses.every((status) => status === 'blocked')
      ? 'blocked'
      : 'partial';
function deriveCoverage(value, source) {
  validateAnalysisRequest(value.request, source);
  check(
    value.corpusHash === transcriptCorpusHash(source),
    'analysis corpus hash does not match the frozen input'
  );
  const participantRefs = source.documents.flatMap((document) =>
    document.participants
      .filter((person) => person.role === 'participant')
      .map((person) => ({ documentId: document.documentId, participantId: person.participantId }))
  );
  const participants = new Set(participantRefs.map(participantKey));
  const turns = new Map(
    source.documents.flatMap((document) =>
      document.turns.map((turn) => [canonicalJson([document.documentId, turn.turnId]), turn])
    )
  );
  const participantsWithTurns = new Set(
    source.documents.flatMap((document) =>
      document.turns.map((turn) =>
        participantKey({ documentId: document.documentId, participantId: turn.participantId })
      )
    )
  );
  const questions = new Set(value.request.questions.map((question) => question.id));
  const outputs = new Set(value.request.outputs);
  const syntheticParticipants = new Set(
    source.documents
      .filter((document) => document.origin === 'synthetic_transcript')
      .flatMap((document) =>
        document.participants.map((person) =>
          participantKey({
            documentId: document.documentId,
            participantId: person.participantId,
          })
        )
      )
  );
  const quotes = new Map(
    value.quotes.map((quote) => {
      validateSourceQuote(source, quote);
      return [quote.quoteId, quote];
    })
  );
  const usedQuotes = new Set();
  const supported = new Map();
  for (const finding of value.findings) {
    const refs = new Set(finding.participantRefs.map(participantKey));
    check(
      [...refs].every((ref) => participants.has(ref)),
      'finding names an absent or non-participant source identity'
    );
    check(
      finding.questionIds.every((id) => questions.has(id)),
      'finding names an unrequested analysis question'
    );
    check(
      finding.quoteIds.every((id) => quotes.has(id)),
      'finding names an absent source quote'
    );
    const selected = finding.quoteIds.map((id) => quotes.get(id));
    check(
      !selected.length || sameSet(refs, new Set(selected.map(participantKey))),
      'finding participants must exactly match its quote speakers'
    );
    check(
      finding.basis !== 'source_statement' ||
        selected.every((quote) => finding.statement === quote.text),
      'source_statement must be the exact text of every selected source quote'
    );
    check(
      !selected.some((quote) => quote.origin === 'synthetic_transcript') ||
        finding.basis === 'simulation_hypothesis',
      'synthetic or mixed support must remain simulation_hypothesis'
    );
    check(
      ![...refs].some((ref) => syntheticParticipants.has(ref)) ||
        finding.basis === 'simulation_hypothesis',
      'synthetic participant findings must remain simulation_hypothesis'
    );
    check(
      outputs.has(finding.category === 'trait' ? 'personas' : 'jobs_pains'),
      'finding category belongs to an unrequested output'
    );
    finding.quoteIds.forEach((id) => usedQuotes.add(id));
    if (finding.supportStatus === 'supported') supported.set(finding.findingId, finding);
    else {
      const codes =
        finding.supportStatus === 'conflicting'
          ? ['conflicting_evidence']
          : ['insufficient_evidence', 'missing_participant_turns', 'unanswered_question'];
      check(
        value.gaps.some(
          (gap) =>
            (finding.questionIds.includes(gap.questionId) ||
              (gap.participantRef !== null && refs.has(participantKey(gap.participantRef)))) &&
            codes.includes(gap.code)
        ),
        'unsupported findings require an explicit matching evidence gap'
      );
    }
  }
  check(
    sameSet(usedQuotes, new Set(quotes.keys())),
    'unused quotes cannot pad analysis source coverage'
  );
  check(!value.personas.length || outputs.has('personas'), 'personas were not requested');
  for (const persona of value.personas) {
    const identity = participantKey(persona.participantRefs[0]);
    check(participants.has(identity), 'persona names an absent source participant');
    check(
      persona.origin ===
        (syntheticParticipants.has(identity) ? 'synthetic_transcript' : 'supplied_transcript'),
      'persona origin must match its source participant lineage'
    );
    for (const findingId of persona.traitFindingIds) {
      const finding = supported.get(findingId);
      check(
        finding && finding.category === 'trait',
        'persona traits require supported trait findings'
      );
      check(
        sameSet(new Set(finding.participantRefs.map(participantKey)), new Set([identity])),
        'persona traits cannot merge source participant identities'
      );
    }
  }
  for (const gap of value.gaps) {
    check(
      gap.questionId === null || questions.has(gap.questionId),
      'gap names an unrequested analysis question'
    );
    check(gap.output === null || outputs.has(gap.output), 'gap names an unrequested output');
    if (gap.participantRef !== null) {
      const identity = participantKey(gap.participantRef);
      check(participants.has(identity), 'gap names an absent or non-participant source identity');
      check(
        gap.code !== 'missing_participant_turns' || !participantsWithTurns.has(identity),
        'missing-participant-turn gap contradicts the source'
      );
    }
  }
  const issueCodes = (predicate) =>
    [...new Set(value.gaps.filter(predicate).map((gap) => gap.code))].sort();
  const participantRows = [...participantRefs]
    .sort(
      (left, right) =>
        compare(left.documentId, right.documentId) ||
        compare(left.participantId, right.participantId)
    )
    .map((reference) => {
      const key = participantKey(reference);
      const findingIds = [...supported]
        .filter(([, finding]) => finding.participantRefs.some((ref) => participantKey(ref) === key))
        .map(([id]) => id)
        .sort();
      const issues = issueCodes(
        (gap) => gap.participantRef !== null && participantKey(gap.participantRef) === key
      );
      check(
        findingIds.length || issues.length,
        'every source participant requires supported evidence or an explicit gap'
      );
      return {
        ...reference,
        status: rowStatus(findingIds, issues),
        issueCodes: issues,
        findingIds,
      };
    });
  const questionRows = [...questions].sort().map((questionId) => {
    const findingIds = [...supported]
      .filter(([, finding]) => finding.questionIds.includes(questionId))
      .map(([id]) => id)
      .sort();
    const issues = issueCodes((gap) => gap.questionId === questionId);
    check(
      findingIds.length || issues.length,
      'every analysis question requires an answer or an explicit gap'
    );
    return {
      questionId,
      status: !findingIds.length ? 'insufficient' : issues.length ? 'partial' : 'answered',
      findingIds,
      issueCodes: issues,
    };
  });
  const outputRows = [...outputs].sort().map((output) => {
    const entries = (
      output === 'personas'
        ? value.personas.map((persona) => persona.personaId)
        : [...supported].filter(([, finding]) => finding.category !== 'trait').map(([id]) => id)
    ).sort();
    const issues = issueCodes((gap) => gap.output === output);
    check(
      entries.length || issues.length,
      'every requested output requires supported entries or an explicit gap'
    );
    return { output, status: rowStatus(entries, issues), entryIds: entries, issueCodes: issues };
  });
  const documentRows = [...source.documents]
    .sort((left, right) => compare(left.documentId, right.documentId))
    .map((document) => {
      const rows = participantRows.filter((row) => row.documentId === document.documentId);
      return {
        documentId: document.documentId,
        status: groupStatus(rows.map((row) => row.status)),
        issueCodes: [...new Set(rows.flatMap((row) => row.issueCodes))].sort(),
      };
    });
  const complete =
    [...participantRows, ...outputRows].every((row) => row.status === 'complete') &&
    questionRows.every((row) => row.status === 'answered');
  return {
    coverageStatus: complete ? 'complete' : supported.size ? 'partial' : 'blocked',
    documentCoverage: documentRows,
    participantCoverage: participantRows,
    questionCoverage: questionRows,
    outputCoverage: outputRows,
    quoteLineage: [...quotes]
      .sort(([left], [right]) => compare(left, right))
      .map(([identity, quote]) => ({
        quoteId: identity,
        interviewQuestionId: turns.get(canonicalJson([quote.documentId, quote.turnId])).questionId,
      })),
  };
}
export function deriveAnalysisCoverage(value, corpus) {
  const isFull = value && coverageFields.some((field) => Object.hasOwn(value, field));
  const candidate = (isFull ? QualitativeAnalysisV1Schema : AnalysisContentV1Schema).parse(value);
  return deriveCoverage(candidate, TranscriptCorpusV1Schema.parse(corpus));
}
export function buildQualitativeAnalysis({
  corpus,
  request,
  acceptedScope,
  sourceArtifacts,
  methodVersion,
  quotes,
  findings,
  personas,
  gaps,
  limitations,
}) {
  const source = TranscriptCorpusV1Schema.parse(corpus);
  const content = AnalysisContentV1Schema.parse({
    schemaVersion: 'axwise.qualitative-analysis.v1',
    acceptedScope,
    sourceArtifacts,
    corpusHash: transcriptCorpusHash(source),
    request,
    methodVersion,
    quotes,
    findings,
    personas,
    gaps,
    limitations,
  });
  return QualitativeAnalysisV1Schema.parse({ ...content, ...deriveCoverage(content, source) });
}
export function validateQualitativeAnalysis(
  value,
  { corpus, request, acceptedScope, sourceArtifacts }
) {
  const candidate = QualitativeAnalysisV1Schema.parse(value);
  const source = TranscriptCorpusV1Schema.parse(corpus);
  check(
    same(candidate.request, validateAnalysisRequest(request, source)),
    "analysis request differs from the caller's requested decision and outputs"
  );
  check(
    same(candidate.acceptedScope, CorpusArtifactRefV1Schema.parse(acceptedScope)),
    'analysis scope differs from the accepted caller scope'
  );
  const expectedRefs = z.array(CorpusArtifactRefV1Schema).min(1).max(16).parse(sourceArtifacts);
  unique(
    expectedRefs.map((ref) => ref.artifactId),
    'caller source artifact IDs must be unique'
  );
  const sortArtifacts = (refs) =>
    [...refs].sort((left, right) => compare(left.artifactId, right.artifactId));
  check(
    same(sortArtifacts(candidate.sourceArtifacts), sortArtifacts(expectedRefs)),
    "analysis source references differ from the caller's admitted artifacts"
  );
  const derived = deriveCoverage(candidate, source);
  check(
    coverageFields.every((field) => same(candidate[field], derived[field])),
    'analysis coverage and interview-question lineage must equal derived source accounting'
  );
  return candidate;
}
