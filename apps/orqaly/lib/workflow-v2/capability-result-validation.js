import { canonicalJson, sha256Hex } from './canonical.js';
import { ArtifactFactSchema, CompletionResultSchema } from '../../shared/workflow-v2/contracts.js';
import { validateQualitativeAnalysis } from '../../shared/workflow-v2/capability-analysis-contracts.js';
import {
  SimulationV1Schema,
  validateSimulation,
} from '../../shared/workflow-v2/capability-simulation-contracts.js';
import { capabilityArtifactId } from '../../shared/workflow-v2/capability-contracts.js';

const exact = (left, right) => canonicalJson(left) === canonicalJson(right);
const assert = (condition) => {
  if (!condition) throw new TypeError('Capability completion does not bind its exact input');
};
const fact = (record) =>
  ArtifactFactSchema.parse({
    artifactId: record.artifactId,
    artifactHash: record.artifactHash,
    kind: record.kind,
    contentType: record.contentType,
    payload: record.payload,
    markdown: record.markdown,
    sourceArtifactIds: record.sourceArtifactIds,
  });

export function resolveCapabilityGrounding(input, artifacts) {
  assert(new Set(artifacts.map((record) => record.artifactId)).size === artifacts.length);
  const records = new Map(artifacts.map((record) => [record.artifactId, record]));
  const checked = new Map();
  return input.selectedGrounding.map((selection) => {
    const reference = selection.artifact;
    let source = checked.get(reference.artifactId);
    if (!source) {
      const record = records.get(reference.artifactId);
      assert(
        record && record.artifactHash === reference.artifactHash && record.kind === reference.kind
      );
      source = fact(record);
      checked.set(reference.artifactId, source);
    }
    assert(
      (source.kind === 'qualitative_analysis' && selection.entryKind === 'quote') ||
        (source.kind === 'research' && selection.entryKind === 'claim')
    );
    const entries =
      selection.entryKind === 'quote' ? source.payload.quotes : source.payload.selectedClaims;
    const key = selection.entryKind === 'quote' ? 'quoteId' : 'claimId';
    const matches = entries.filter((entry) => entry[key] === selection.entryId);
    assert(matches.length === 1);
    const entry = matches[0];
    assert(typeof entry.text === 'string' && entry.textSha256 === sha256Hex(entry.text));
    return { ...selection, text: entry.text, textSha256: entry.textSha256 };
  });
}

export function validateCapabilityResultForInput(
  input,
  rawResult,
  { operationId, artifacts } = {}
) {
  const result = CompletionResultSchema.parse(rawResult);
  const expected = {
    AdmitTranscriptCorpusV1: 'transcript_corpus_admitted',
    AnalyzeEvidenceV1: 'evidence_analyzed',
    SimulateV1: 'simulation_completed',
  }[input.type];
  assert(expected && result.resultType === expected);
  assert(result.artifact.artifactId === capabilityArtifactId(operationId, result.artifact.kind));
  if (input.type !== 'AdmitTranscriptCorpusV1' && result.metrics != null) {
    assert(result.metrics.modelCalls <= input.limits.maxModelCalls);
    if (result.metrics.inputTokens != null)
      assert(result.metrics.inputTokens <= input.limits.maxInputTokens);
    if (result.metrics.outputTokens != null)
      assert(result.metrics.outputTokens <= input.limits.maxOutputTokens);
  }
  if (input.type === 'AdmitTranscriptCorpusV1') {
    assert(exact(result.artifact.payload, input.corpus));
  } else if (input.type === 'AnalyzeEvidenceV1') {
    validateQualitativeAnalysis(result.artifact.payload, {
      corpus:
        input.source.artifact.kind === 'simulation'
          ? SimulationV1Schema.parse(input.source.payload).corpus
          : input.source.payload,
      request: input.request,
      acceptedScope: input.acceptedScope,
      sourceArtifacts: [input.source.artifact],
    });
  } else {
    const payload = SimulationV1Schema.parse(result.artifact.payload);
    assert(
      payload.operationId === operationId &&
        exact(payload.request, input.request) &&
        exact(payload.acceptedScope, input.acceptedScope)
    );
    const selected = payload.grounding.selectedReferences.map(
      ({ textSha256: _textSha256, ...selection }) => selection
    );
    assert(exact(selected, input.selectedGrounding));
    // The pure state transition checks request/operation/reference identity. The
    // worker additionally supplies same-run owned immutable source records and
    // verifies the exact selected entry bytes before the completion event exists.
    if (artifacts !== undefined || input.selectedGrounding.length === 0) {
      validateSimulation(payload, {
        request: input.request,
        operationId,
        acceptedScope: input.acceptedScope,
        admittedGrounding: resolveCapabilityGrounding(input, artifacts || []),
      });
    }
  }
  return result;
}
