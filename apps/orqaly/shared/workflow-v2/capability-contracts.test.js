// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { canonicalHash, artifactContentHash } from '../../lib/workflow-v2/canonical.js';
import {
  ArtifactRefSchema,
  ScopeArtifactV2Schema,
  ArtifactContentSchema,
  ExecutionAgentContractV1Schema,
} from './contracts.js';
import {
  createCapabilityOperationSchemas,
  CapabilityProcessingConsentV1Schema,
  CapabilityOperationMetricsSchema,
  processingConsentBindingHash,
  validateCapabilityEnvelopeConsent,
  capabilityArtifactId,
  TranscriptCorpusArtifactFactSchema,
  QualitativeAnalysisArtifactFactSchema,
  SimulationArtifactFactSchema,
  TranscriptCorpusAdmittedResultSchema,
  EvidenceAnalyzedResultSchema,
  SimulationCompletedResultSchema,
  CapabilityLimitsV1Schema,
  effectiveCapabilityLimits,
} from './capability-contracts.js';

const vectors = JSON.parse(
  readFileSync(new URL('./fixtures/capability-contract-vectors.json', import.meta.url), 'utf8')
);
const simulationVectors = JSON.parse(
  readFileSync(new URL('./fixtures/capability-simulation-vectors.json', import.meta.url), 'utf8')
);
const sourceVectors = JSON.parse(
  readFileSync(new URL('./fixtures/capability-source-vectors.json', import.meta.url), 'utf8')
);
const schemas = createCapabilityOperationSchemas({
  ArtifactRefSchema,
  ScopeArtifactV2Schema,
  ArtifactContentSchema,
  ExecutionAgentContractV1Schema,
});
const fresh = (name) =>
  structuredClone(vectors.cases.find((row) => row.name === (name ?? 'analysis_unicode')).envelope);
function parseEnvelope(raw) {
  const envelope = structuredClone(raw);
  const schema =
    schemas[
      envelope.operationType === 'AnalyzeEvidenceV1'
        ? 'AnalyzeEvidenceInputV1Schema'
        : envelope.operationType === 'SimulateV1'
          ? 'SimulateInputV1Schema'
          : 'AdmitTranscriptCorpusInputV1Schema'
    ];
  envelope.input = schema.parse(envelope.input);
  validateCapabilityEnvelopeConsent(envelope);
  return envelope;
}
function syntheticConsent(envelope) {
  // Test-only attestation. Production opt-in is captured by the owner command.
  envelope.input.processingConsent = {
    schemaVersion: 'axwise.processing-consent.v1',
    granted: true,
    provider: 'google',
    purpose: envelope.operationType,
    operationId: envelope.operationId,
    bindingHash: processingConsentBindingHash(envelope),
    noticeVersion: 'google-selected-sources-v1',
  };
  envelope.canonicalInputHash = canonicalHash(envelope.input);
  return envelope;
}
const metric = () => ({
  latencyMs: 12,
  provider: 'google',
  model: 'models/gemini-3.8-flash',
  modelVersion: null,
  modelCalls: 1,
  usageComplete: true,
  budgetScope: 'invocation',
  inputTokens: 10,
  outputTokens: 20,
  totalTokens: 30,
  searchCalls: 0,
  estimatedCostMicros: null,
});
function fact(
  kind,
  payload,
  sourceArtifactIds,
  operationId = 'e49c5125-a05c-49fb-93dd-f23989084d7f'
) {
  const content = { contentType: 'application/json', payload, markdown: null };
  return {
    artifactId: capabilityArtifactId(operationId, kind),
    artifactHash: artifactContentHash(content),
    kind,
    ...content,
    sourceArtifactIds,
  };
}

describe('exact Python consent and input vectors', () => {
  for (const vector of vectors.cases)
    it(vector.name, () => {
      expect(parseEnvelope(vector.envelope)).toEqual(vector.envelope);
      expect(processingConsentBindingHash(vector.envelope)).toBe(
        vector.envelope.input.processingConsent.bindingHash
      );
      expect(canonicalHash(vector.envelope.input)).toBe(vector.envelope.canonicalInputHash);
    });
  it('omits only top-level consent from its binding hash', () => {
    const fixture = vectors.bindingOnlyCases[0],
      value = fresh(fixture.baseEnvelopeCase);
    expect(processingConsentBindingHash(value)).toBe(fixture.expectedBaseHash);
    value.input.processingConsent = fixture.setTopLevelConsent;
    expect(processingConsentBindingHash(value)).toBe(fixture.expectedTopLevelReplacementHash);
    value.input.request.processingConsent = fixture.setInputRequestProcessingConsent;
    expect(processingConsentBindingHash(value)).toBe(fixture.expectedNestedAdditionHash);
    expect(() => parseEnvelope(value)).toThrow();
  });
  it('prepares unsigned inputs without manufacturing a granted consent', () => {
    for (const vector of vectors.cases) {
      const envelope = structuredClone(vector.envelope),
        expected = envelope.input.processingConsent.bindingHash;
      delete envelope.input.processingConsent;
      const schema =
        envelope.operationType === 'AnalyzeEvidenceV1'
          ? schemas.AnalyzeEvidenceDraftInputV1Schema
          : schemas.SimulateDraftInputV1Schema;
      expect(schema.parse(envelope.input)).not.toHaveProperty('processingConsent');
      expect(processingConsentBindingHash(envelope)).toBe(expected);
      expect(() => parseEnvelope(envelope)).toThrow();
    }
  });
  it('omits only nullable optional executionAgent, not meaningful nested nulls', () => {
    const value = fresh();
    value.input.executionAgent = null;
    const checked = schemas.AnalyzeEvidenceInputV1Schema.parse(value.input);
    expect(checked).not.toHaveProperty('executionAgent');
    expect(checked.source.markdown).toBeNull();
    expect(parseEnvelope({ ...value, input: checked })).toEqual(fresh());
  });
  it.each([
    [
      'missing consent',
      (value) => {
        delete value.input.processingConsent;
      },
    ],
    [
      'false consent',
      (value) => {
        value.input.processingConsent.granted = false;
      },
    ],
    [
      'numeric consent',
      (value) => {
        value.input.processingConsent.granted = 1;
      },
    ],
    [
      'string consent',
      (value) => {
        value.input.processingConsent.granted = 'true';
      },
    ],
    [
      'different provider',
      (value) => {
        value.input.processingConsent.provider = 'other';
      },
    ],
    [
      'different purpose',
      (value) => {
        value.input.processingConsent.purpose = 'SimulateV1';
      },
    ],
    [
      'different notice',
      (value) => {
        value.input.processingConsent.noticeVersion = 'unreviewed';
      },
    ],
    [
      'different operation',
      (value) => {
        value.operationId = 'a1000000-0000-4000-8000-000000000001';
      },
    ],
    [
      'different owner',
      (value) => {
        value.owner.userId = 'user_different123';
      },
    ],
    [
      'different tenant',
      (value) => {
        value.owner.tenantId = 'a1000000-0000-4000-8000-000000000001';
      },
    ],
    [
      'different organization',
      (value) => {
        value.owner.organizationId = 'org_different123';
      },
    ],
    [
      'different run',
      (value) => {
        value.workflow.runId = 'a1000000-0000-4000-8000-000000000001';
      },
    ],
    [
      'different stage attempt',
      (value) => {
        value.workflow.stageAttemptId = 'a1000000-0000-4000-8000-000000000001';
      },
    ],
    [
      'different decision question',
      (value) => {
        value.input.request.decisionQuestion = 'A changed decision?';
      },
    ],
    [
      'different limits',
      (value) => {
        value.input.limits.maxModelCalls = 2;
      },
    ],
    [
      'different scope hash',
      (value) => {
        value.input.acceptedScope.artifactHash = 'f'.repeat(64);
      },
    ],
    [
      'unknown field',
      (value) => {
        value.input.privateMetadata = 'not admitted';
      },
    ],
  ])('rejects %s even if only the envelope input hash is recomputed', (_name, mutate) => {
    const value = fresh();
    mutate(value);
    value.canonicalInputHash = canonicalHash(value.input);
    expect(() => parseEnvelope(value)).toThrow();
  });
  it('does not reuse consent for changed transcript text even after rehashing its source', () => {
    const value = fresh(),
      doc = value.input.source.payload.documents[0];
    doc.title += ' changed';
    value.input.source.artifact.artifactHash = artifactContentHash(value.input.source);
    value.canonicalInputHash = canonicalHash(value.input);
    expect(schemas.AnalyzeEvidenceInputV1Schema.safeParse(value.input).success).toBe(true);
    expect(() => parseEnvelope(value)).toThrow();
  });
  it('binds selected claim/quote entry IDs as well as artifact hashes', () => {
    const value = fresh('simulation_selected_claim');
    value.input.selectedGrounding[0].entryId = 'f'.repeat(64);
    value.canonicalInputHash = canonicalHash(value.input);
    expect(schemas.SimulateInputV1Schema.safeParse(value.input).success).toBe(true);
    expect(() => parseEnvelope(value)).toThrow();
  });
  it('requires consent for scenario-only Simulation too', () => {
    const value = fresh('simulation_selected_claim');
    value.input.request.grounding = { mode: 'scenario_only', sourceArtifacts: [] };
    value.input.selectedGrounding = [];
    delete value.input.processingConsent;
    expect(schemas.SimulateDraftInputV1Schema.safeParse(value.input).success).toBe(true);
    expect(() => parseEnvelope(value)).toThrow();
    expect(parseEnvelope(syntheticConsent(value))).toEqual(value);
  });
  it('rejects malformed bodies before evaluating their accessors', () => {
    let reads = 0;
    const input = {
      type: 'AnalyzeEvidenceV1',
      get source() {
        reads++;
        return fresh().input.source;
      },
    };
    expect(schemas.AnalyzeEvidenceInputV1Schema.safeParse(input).success).toBe(false);
    expect(reads).toBe(0);
  });
  it.each(['operationType', 'input'])('does not evaluate an envelope %s accessor', (key) => {
    const envelope = fresh(),
      value = envelope[key];
    let reads = 0;
    Object.defineProperty(envelope, key, {
      enumerable: true,
      get() {
        reads++;
        return value;
      },
    });
    expect(() => validateCapabilityEnvelopeConsent(envelope)).toThrow();
    expect(() => processingConsentBindingHash(envelope)).toThrow();
    expect(reads).toBe(0);
  });
  it('leaves plain legacy envelopes outside the capability bound unchanged', () => {
    const legacy = { operationType: 'AssistantTurnV1', input: { unrelated: 1.5 } };
    expect(validateCapabilityEnvelopeConsent(legacy)).toBe(legacy);
  });
});

describe('model-free corpus admission and artifact facts', () => {
  it('matches Python uuid5 operation artifact IDs for every capability kind', () => {
    const expected = {
      transcript_corpus: 'e331c01a-1acb-551f-b327-df9e65abf48f',
      qualitative_analysis: '83f95628-c0c1-5adc-8332-e57ae540e7fa',
      simulation: '19d08ee9-a88f-58b7-a507-fa072e7deea8',
    };
    for (const [kind, id] of Object.entries(expected)) {
      expect(capabilityArtifactId('e49c5125-a05c-49fb-93dd-f23989084d7f', kind)).toBe(id);
    }
  });
  it('admits exact supplied corpus without processing consent', () => {
    const value = fresh();
    value.operationType = 'AdmitTranscriptCorpusV1';
    value.input = {
      type: 'AdmitTranscriptCorpusV1',
      corpus: structuredClone(sourceVectors.cases[0].corpus),
      admissionProfile: 'supplied_transcript_v1',
    };
    value.canonicalInputHash = canonicalHash(value.input);
    expect(parseEnvelope(value)).toEqual(value);
  });
  it('rejects conflicting aggregate origin references', () => {
    const corpus = structuredClone(sourceVectors.cases[1].corpus);
    const other = structuredClone(corpus.documents[0]);
    other.documentId = 'b1000000-0000-4000-8000-000000000001';
    other.originArtifactRefs[0].artifactHash = 'f'.repeat(64);
    corpus.documents.push(other);
    expect(
      schemas.AdmitTranscriptCorpusInputV1Schema.safeParse({
        type: 'AdmitTranscriptCorpusV1',
        corpus,
        admissionProfile: 'supplied_transcript_v1',
      }).success
    ).toBe(false);
  });
  it('binds corpus lineage to origin references and validates body hashes', () => {
    const corpus = sourceVectors.cases[1].corpus,
      ids = [corpus.documents[0].originArtifactRefs[0].artifactId];
    const value = fact('transcript_corpus', corpus, ids);
    expect(TranscriptCorpusArtifactFactSchema.parse(value)).toEqual(value);
    expect(
      TranscriptCorpusArtifactFactSchema.safeParse({ ...value, sourceArtifactIds: [] }).success
    ).toBe(false);
    expect(
      TranscriptCorpusArtifactFactSchema.safeParse({ ...value, artifactHash: 'f'.repeat(64) })
        .success
    ).toBe(false);
  });
  it('binds Simulation fact ID to its producing operation and exact lineage', () => {
    const row = simulationVectors.cases[0],
      value = fact('simulation', row.artifact, [row.acceptedScope.artifactId], row.operationId);
    expect(SimulationArtifactFactSchema.parse(value)).toEqual(value);
    expect(
      SimulationArtifactFactSchema.safeParse({ ...value, artifactId: row.operationId }).success
    ).toBe(false);
    expect(
      SimulationArtifactFactSchema.safeParse({ ...value, sourceArtifactIds: [] }).success
    ).toBe(false);
    expect(
      SimulationCompletedResultSchema.parse({
        resultType: 'simulation_completed',
        artifact: value,
        metrics: metric(),
      }).artifact
    ).toEqual(value);
  });
  it('supports discriminated artifact/result unions without changing legacy schemas', () => {
    const corpus = sourceVectors.cases[0].corpus,
      artifact = fact('transcript_corpus', corpus, []);
    const union = z.discriminatedUnion('kind', [
      TranscriptCorpusArtifactFactSchema,
      QualitativeAnalysisArtifactFactSchema,
      SimulationArtifactFactSchema,
    ]);
    expect(union.parse(artifact)).toEqual(artifact);
    const results = z.discriminatedUnion('resultType', [
      TranscriptCorpusAdmittedResultSchema,
      EvidenceAnalyzedResultSchema,
      SimulationCompletedResultSchema,
    ]);
    expect(
      results.parse({ resultType: 'transcript_corpus_admitted', artifact, metrics: null })
    ).toEqual({ resultType: 'transcript_corpus_admitted', artifact, metrics: null });
  });
});

describe('strict invocation accounting', () => {
  it('preserves complete receipts and unknown usage without invented zeroes', () => {
    expect(CapabilityOperationMetricsSchema.parse(metric())).toEqual(metric());
    const unknown = {
      ...metric(),
      usageComplete: false,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      provider: null,
      model: null,
    };
    expect(CapabilityOperationMetricsSchema.parse(unknown)).toEqual(unknown);
    delete unknown.inputTokens;
    delete unknown.outputTokens;
    delete unknown.totalTokens;
    expect(CapabilityOperationMetricsSchema.parse(unknown)).toEqual(unknown);
  });
  it.each([
    [
      'coerced calls',
      (value) => {
        value.modelCalls = '1';
      },
    ],
    [
      'boolean calls',
      (value) => {
        value.modelCalls = true;
      },
    ],
    [
      'incorrect total',
      (value) => {
        value.totalTokens++;
      },
    ],
    [
      'incorrect completeness',
      (value) => {
        value.usageComplete = false;
      },
    ],
    [
      'unknown usage with cost',
      (value) => {
        value.usageComplete = false;
        value.inputTokens = null;
        value.totalTokens = null;
        value.estimatedCostMicros = 1;
      },
    ],
    [
      'model-free work with model identity',
      (value) => {
        value.modelCalls = 0;
        value.inputTokens = 0;
        value.outputTokens = 0;
        value.totalTokens = 0;
      },
    ],
    [
      'unrequested source search',
      (value) => {
        value.searchCalls = 1;
      },
    ],
    [
      'unsafe model label',
      (value) => {
        value.modelVersion = 'PRIVATE content\n';
      },
    ],
    [
      'lifetime budget claim',
      (value) => {
        value.budgetScope = 'lifetime';
      },
    ],
  ])('rejects %s', (_name, mutate) => {
    const value = metric();
    mutate(value);
    expect(CapabilityOperationMetricsSchema.safeParse(value).success).toBe(false);
  });
  it('takes minima against policy without expanding caller limits', () => {
    const value = fresh().input.limits;
    expect(
      effectiveCapabilityLimits(value, { ...value, maxModelCalls: 1, deadlineMs: 1000 })
    ).toEqual({ ...value, maxModelCalls: 1, deadlineMs: 1000 });
    expect(CapabilityLimitsV1Schema.safeParse({ ...value, maxInputTokens: false }).success).toBe(
      false
    );
    expect(
      CapabilityProcessingConsentV1Schema.safeParse({
        ...fresh().input.processingConsent,
        granted: 1,
      }).success
    ).toBe(false);
  });
});
