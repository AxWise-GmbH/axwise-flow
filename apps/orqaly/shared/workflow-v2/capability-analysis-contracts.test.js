import { describe, expect, test } from 'vitest';
import { canonicalHash, canonicalJson, sha256Hex } from '../../lib/workflow-v2/canonical.js';
import {
  extractSourceQuote,
  transcriptCorpusHash,
  TranscriptCorpusV1Schema,
} from './capability-source-contracts.js';
import {
  ANALYSIS_LIMITS,
  AnalysisContentV1Schema,
  AnalysisFindingV1Schema,
  AnalysisGapV1Schema,
  AnalysisParticipantRefV1Schema,
  AnalysisPersonaV1Schema,
  AnalysisQuestionV1Schema,
  AnalysisRequestV1Schema,
  QualitativeAnalysisV1Schema,
  buildQualitativeAnalysis,
  createAnalysisFinding,
  createAnalysisPersona,
  deriveAnalysisCoverage,
  validateAnalysisRequest,
  validateQualitativeAnalysis,
} from './capability-analysis-contracts.js';
import goldens from './fixtures/capability-analysis-python-goldens.json';

const clone = (value) => structuredClone(value);
const one = () => clone(goldens.cases[0]);
const mixed = () => clone(goldens.cases.find((value) => value.name === 'mixed_personas'));
const blocked = () => clone(goldens.cases.find((value) => value.name === 'blocked_explicit_gaps'));
const coverageFields = [
  'coverageStatus',
  'documentCoverage',
  'participantCoverage',
  'questionCoverage',
  'outputCoverage',
  'quoteLineage',
];
const findingContent = (value) => {
  const { findingId: _ignored, ...content } = value;
  return content;
};
const personaContent = (value) => {
  const { personaId: _ignored, ...content } = value;
  return content;
};
function contentOf(value) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !coverageFields.includes(key)));
}
function build(fixture, changes = {}) {
  const {
    request,
    acceptedScope,
    sourceArtifacts,
    methodVersion,
    quotes,
    findings,
    personas,
    gaps,
    limitations,
  } = fixture.artifact;
  return buildQualitativeAnalysis({
    corpus: fixture.context.corpus,
    request,
    acceptedScope,
    sourceArtifacts,
    methodVersion,
    quotes,
    findings,
    personas,
    gaps,
    limitations,
    ...changes,
  });
}
const reidentify = (value, changes) =>
  createAnalysisFinding({ ...findingContent(value), ...changes });
const person = (documentId, participantId = 'p1') => ({ documentId, participantId });
const gap = (changes = {}) => ({
  code: 'insufficient_evidence',
  questionId: null,
  participantRef: null,
  output: null,
  message: 'Synthetic fixture: source evidence is insufficient.',
  ...changes,
});

describe('frozen Python golden parity', () => {
  for (const fixture of goldens.cases)
    test(fixture.name, () => {
      const before = canonicalJson(fixture);
      expect(canonicalHash(fixture.artifact)).toBe(fixture.artifactCanonicalHash);
      expect(QualitativeAnalysisV1Schema.parse(fixture.artifact)).toEqual(fixture.artifact);
      expect(validateQualitativeAnalysis(fixture.artifact, fixture.context)).toEqual(
        fixture.artifact
      );
      expect(build(fixture)).toEqual(fixture.artifact);
      const expected = Object.fromEntries(
        coverageFields.map((key) => [key, fixture.artifact[key]])
      );
      expect(deriveAnalysisCoverage(fixture.artifact, fixture.context.corpus)).toEqual(expected);
      expect(deriveAnalysisCoverage(contentOf(fixture.artifact), fixture.context.corpus)).toEqual(
        expected
      );
      for (const value of fixture.artifact.findings)
        expect(createAnalysisFinding(findingContent(value))).toEqual(value);
      for (const value of fixture.artifact.personas)
        expect(createAnalysisPersona(personaContent(value))).toEqual(value);
      expect(canonicalJson(fixture)).toBe(before);
    });
  test('UTF-16 ordering differs deliberately from Python code-point ordering', () => {
    const fixture = goldens.cases.find((value) => value.name === 'utf16_order');
    const actual = deriveAnalysisCoverage(fixture.artifact, fixture.context.corpus);
    expect(actual.participantCoverage.map((row) => row.participantId)).toEqual([
      '\u{10000}',
      '\ue000',
    ]);
    expect(actual.questionCoverage.map((row) => row.questionId)).toEqual(['\u{10000}', '\ue000']);
  });
});

describe('strict bounded wire shapes', () => {
  for (const [name, schema, value] of [
    ['request', AnalysisRequestV1Schema, one().artifact.request],
    ['question', AnalysisQuestionV1Schema, one().artifact.request.questions[0]],
    ['participant', AnalysisParticipantRefV1Schema, one().artifact.findings[0].participantRefs[0]],
    ['finding', AnalysisFindingV1Schema, one().artifact.findings[0]],
    ['persona', AnalysisPersonaV1Schema, mixed().artifact.personas[0]],
    ['gap', AnalysisGapV1Schema, blocked().artifact.gaps[0]],
    ['artifact', QualitativeAnalysisV1Schema, one().artifact],
  ]) {
    test(name + ' rejects extra properties and absent required fields', () => {
      expect(schema.safeParse({ ...value, fabricated: true }).success).toBe(false);
      for (const key of Object.keys(value)) {
        const changed = clone(value);
        delete changed[key];
        expect(schema.safeParse(changed).success, key).toBe(false);
      }
    });
  }
  for (const text of ['', ' ', '\r\n', '\u0085', '\u001c', '\ud800', '\udfff']) {
    test('rejects invalid derived text ' + JSON.stringify(text), () => {
      expect(AnalysisQuestionV1Schema.safeParse({ id: 'question', text }).success).toBe(false);
    });
  }
  test('Python code-point limit accepts 4000 astral characters, rejects 4001', () => {
    expect(
      AnalysisQuestionV1Schema.safeParse({ id: 'question', text: '🧭'.repeat(4000) }).success
    ).toBe(true);
    expect(
      AnalysisQuestionV1Schema.safeParse({ id: 'question', text: '🧭'.repeat(4001) }).success
    ).toBe(false);
    expect(AnalysisQuestionV1Schema.safeParse({ id: 'question', text: '\ufeff' }).success).toBe(
      true
    );
  });
  for (const id of ['', ' leading', 'trailing ', 'tab\tid', 'bad\u0000id', 'x'.repeat(121)]) {
    test('rejects noncanonical question identity ' + JSON.stringify(id), () => {
      expect(AnalysisQuestionV1Schema.safeParse({ id, text: 'Valid text' }).success).toBe(false);
    });
  }
  test('request collections remain ordered arrays with unique IDs and outputs', () => {
    const request = one().artifact.request;
    for (const changes of [
      { questions: [] },
      { outputs: [] },
      { outputs: ['personas', 'personas'] },
      { questions: [...request.questions, ...request.questions] },
      { questions: new Set(request.questions) },
      {
        questions: Array.from({ length: 17 }, (_, index) => ({
          id: 'q' + index,
          text: 'Question',
        })),
      },
      { outputs: ['unrequested'] },
      { analysisProfile: 'future_v2' },
    ])
      expect(AnalysisRequestV1Schema.safeParse({ ...request, ...changes }).success).toBe(false);
  });
  test('nullable gap targets must be explicit and match their code', () => {
    for (const value of [
      gap(),
      gap({ code: 'missing_participant_turns', questionId: 'q' }),
      gap({ code: 'unanswered_question', output: 'jobs_pains' }),
      gap({ code: 'no_supported_output', questionId: 'q' }),
    ])
      expect(AnalysisGapV1Schema.safeParse(value).success).toBe(false);
  });
  test('source references must use admitted kinds and unique artifact IDs', () => {
    const value = contentOf(one().artifact);
    for (const changed of [
      { ...value, acceptedScope: { ...value.acceptedScope, kind: 'research' } },
      { ...value, sourceArtifacts: [{ ...value.sourceArtifacts[0], kind: 'research' }] },
      { ...value, sourceArtifacts: [] },
      { ...value, sourceArtifacts: [...value.sourceArtifacts, ...value.sourceArtifacts] },
    ])
      expect(AnalysisContentV1Schema.safeParse(changed).success).toBe(false);
  });
});

describe('semantic finding and persona identities', () => {
  test('finding bindings sort without mutating display ordering', () => {
    const fixture = mixed();
    const refs = fixture.artifact.findings.map((value) => value.participantRefs[0]);
    const quotes = fixture.artifact.quotes.map((value) => value.quoteId);
    const first = createAnalysisFinding({
      ...findingContent(fixture.artifact.findings[0]),
      quoteIds: quotes,
      participantRefs: refs,
      questionIds: ['\ue000', '\u{10000}'],
    });
    const second = createAnalysisFinding({
      ...findingContent(first),
      quoteIds: [...quotes].reverse(),
      participantRefs: [...refs].reverse(),
      questionIds: ['\u{10000}', '\ue000'],
    });
    expect(first.findingId).toBe(second.findingId);
    expect(first.participantRefs).toEqual(refs);
    for (const changes of [
      { statement: 'Different statement' },
      { basis: 'source_statement' },
      { supportStatus: 'conflicting' },
      { category: 'pain' },
    ]) {
      expect(reidentify(first, changes).findingId).not.toBe(first.findingId);
    }
  });
  test('identity mutations require re-identification', () => {
    const original = one().artifact.findings[0];
    expect(AnalysisFindingV1Schema.safeParse({ ...original, statement: 'Changed' }).success).toBe(
      false
    );
    const persona = mixed().artifact.personas[0];
    expect(
      AnalysisPersonaV1Schema.safeParse({ ...persona, origin: 'synthetic_transcript' }).success
    ).toBe(false);
  });
  test('persona label is presentation, never identity or clustering', () => {
    const fixture = mixed();
    expect(fixture.artifact.personas[0].displayLabel).toBe(
      fixture.artifact.personas[1].displayLabel
    );
    expect(fixture.artifact.personas[0].personaId).not.toBe(fixture.artifact.personas[1].personaId);
    const changed = createAnalysisPersona({
      ...personaContent(fixture.artifact.personas[0]),
      displayLabel: 'New display label',
    });
    expect(changed.personaId).toBe(fixture.artifact.personas[0].personaId);
  });
  test('duplicate finding bindings and duplicate persona traits are rejected', () => {
    const finding = findingContent(one().artifact.findings[0]);
    for (const key of ['quoteIds', 'questionIds', 'participantRefs'])
      expect(() =>
        createAnalysisFinding({ ...finding, [key]: [...finding[key], ...finding[key]] })
      ).toThrow();
    const persona = personaContent(mixed().artifact.personas[0]);
    expect(() =>
      createAnalysisPersona({
        ...persona,
        traitFindingIds: [...persona.traitFindingIds, ...persona.traitFindingIds],
      })
    ).toThrow();
    expect(() =>
      createAnalysisPersona({
        ...persona,
        participantRefs: [...persona.participantRefs, ...persona.participantRefs],
      })
    ).toThrow();
  });
  for (const basis of ['source_statement', 'interpretation', 'simulation_hypothesis']) {
    for (const supportStatus of ['supported', 'insufficient', 'conflicting'])
      test('quote requirement ' + basis + '/' + supportStatus, () => {
        const content = {
          ...findingContent(one().artifact.findings[0]),
          basis,
          supportStatus,
          quoteIds: [],
        };
        expect(
          AnalysisFindingV1Schema.safeParse({ ...content, findingId: 'a'.repeat(64) }).success
        ).toBe(false);
        if (basis === 'source_statement' || supportStatus === 'supported')
          expect(() => createAnalysisFinding(content)).toThrow();
        else expect(createAnalysisFinding(content).quoteIds).toEqual([]);
      });
  }
});

describe('exact corpus binding and no provenance upgrades', () => {
  for (const statement of [
    'I do not lose time copying status updates.',
    'Copying status updates costs time.',
    'I lose time copying status updates',
    'I lose time copying status updates. ',
    'i lose time copying status updates.',
    '"I lose time copying status updates."',
  ])
    for (const supportStatus of ['supported', 'insufficient', 'conflicting']) {
      test('source_statement is exact even with status ' + supportStatus + ': ' + statement, () => {
        const fixture = one();
        fixture.artifact.findings = [
          reidentify(fixture.artifact.findings[0], { statement, supportStatus }),
        ];
        fixture.artifact.gaps = [
          gap({
            code:
              supportStatus === 'conflicting' ? 'conflicting_evidence' : 'insufficient_evidence',
            questionId: 'analysis-pain',
            participantRef: fixture.artifact.findings[0].participantRefs[0],
            output: 'jobs_pains',
          }),
        ];
        expect(() => build(fixture)).toThrow();
        fixture.artifact.findings = [
          reidentify(fixture.artifact.findings[0], { basis: 'interpretation' }),
        ];
        expect(build(fixture).findings[0].statement).toBe(statement);
      });
    }
  test('exact selected Unicode/CRLF/combining text remains unchanged', () => {
    const fixture = one(),
      document = fixture.context.corpus.documents[0];
    document.text = ' Café e\u0301 🧭.\r\n';
    document.textSha256 = sha256Hex(document.text);
    document.turns[0].end = Buffer.byteLength(document.text, 'utf8');
    const quote = extractSourceQuote(fixture.context.corpus, {
      documentId: document.documentId,
      turnId: 't1',
      participantId: 'p1',
      start: 0,
      end: document.turns[0].end,
    });
    fixture.artifact.quotes = [quote];
    fixture.artifact.findings = [
      reidentify(fixture.artifact.findings[0], {
        statement: quote.text,
        quoteIds: [quote.quoteId],
      }),
    ];
    const result = build(fixture);
    expect(result.findings[0].statement).toBe(document.text);
    for (const statement of [
      document.text.trim(),
      document.text.normalize('NFC'),
      document.text.replace('\r\n', '\n'),
    ]) {
      expect(() =>
        build(fixture, { findings: [reidentify(result.findings[0], { statement })] })
      ).toThrow();
    }
  });
  test('one matching quote cannot pad unrelated participant quotes', () => {
    const fixture = mixed();
    const document = fixture.context.corpus.documents[1];
    document.origin = 'supplied_transcript';
    document.text = 'Status updates never consume my time.';
    document.textSha256 = sha256Hex(document.text);
    document.turns[0].end = Buffer.byteLength(document.text);
    const left = fixture.artifact.quotes[0];
    const right = extractSourceQuote(fixture.context.corpus, {
      documentId: document.documentId,
      turnId: 't1',
      participantId: 'p1',
      start: 0,
      end: document.turns[0].end,
    });
    fixture.artifact.quotes = [left, right];
    const finding = createAnalysisFinding({
      ...findingContent(fixture.artifact.findings[0]),
      category: 'pain',
      basis: 'source_statement',
      quoteIds: [left.quoteId, right.quoteId],
      participantRefs: fixture.artifact.findings.map((value) => value.participantRefs[0]),
      statement: left.text,
    });
    expect(() =>
      build(fixture, {
        request: { ...fixture.artifact.request, outputs: ['jobs_pains'] },
        findings: [finding],
        personas: [],
      })
    ).toThrow();
  });
  test('multiple supplied participants may share one exact statement only if every quote matches', () => {
    const fixture = mixed();
    fixture.context.corpus.documents[1].origin = 'supplied_transcript';
    fixture.artifact.quotes = fixture.context.corpus.documents.map((document) =>
      extractSourceQuote(fixture.context.corpus, {
        documentId: document.documentId,
        turnId: 't1',
        participantId: 'p1',
        start: 0,
        end: document.turns[0].end,
      })
    );
    const finding = createAnalysisFinding({
      ...findingContent(fixture.artifact.findings[0]),
      category: 'pain',
      basis: 'source_statement',
      quoteIds: fixture.artifact.quotes.map((quote) => quote.quoteId),
      participantRefs: fixture.artifact.findings.map((value) => value.participantRefs[0]),
      statement: fixture.artifact.quotes[0].text,
    });
    const result = build(fixture, {
      request: { ...fixture.artifact.request, outputs: ['jobs_pains'] },
      findings: [finding],
      personas: [],
    });
    expect(result.coverageStatus).toBe('complete');
    expect(result.participantCoverage).toHaveLength(2);
    expect(result.findings[0].participantRefs).toHaveLength(2);
  });
  test('finding refs must exactly equal all selected quote speakers', () => {
    const fixture = mixed();
    const finding = createAnalysisFinding({
      ...findingContent(fixture.artifact.findings[0]),
      basis: 'simulation_hypothesis',
      quoteIds: fixture.artifact.quotes.map((value) => value.quoteId),
    });
    expect(() => build(fixture, { findings: [finding], personas: [] })).toThrow();
  });
  for (const quoteBacked of [true, false])
    test('synthetic participant findings cannot upgrade, with quotes=' + quoteBacked, () => {
      const fixture = mixed();
      const synthetic = fixture.artifact.findings[1];
      const finding = reidentify(synthetic, {
        basis: 'interpretation',
        supportStatus: quoteBacked ? 'supported' : 'insufficient',
        quoteIds: quoteBacked ? synthetic.quoteIds : [],
      });
      fixture.artifact.findings[1] = finding;
      fixture.artifact.personas = [fixture.artifact.personas[0]];
      if (!quoteBacked) fixture.artifact.quotes = [fixture.artifact.quotes[0]];
      fixture.artifact.gaps = [
        gap({
          questionId: 'analysis-pain',
          participantRef: synthetic.participantRefs[0],
          output: 'personas',
        }),
      ];
      expect(() => build(fixture)).toThrow();
    });
  test('persona origin and traits bind one actual source identity', () => {
    const fixture = mixed();
    for (const changes of [
      { origin: 'supplied_transcript' },
      { participantRefs: fixture.artifact.personas[0].participantRefs },
      { traitFindingIds: fixture.artifact.personas[0].traitFindingIds },
    ]) {
      const changed = createAnalysisPersona({
        ...personaContent(fixture.artifact.personas[1]),
        ...changes,
      });
      expect(() => build(fixture, { personas: [fixture.artifact.personas[0], changed] })).toThrow();
    }
  });
  test('quote provenance, source text, document, and speaker are rebound to corpus', () => {
    const fixture = one();
    for (const changes of [
      { sourceTextSha256: 'f'.repeat(64) },
      { documentId: '00000000-0000-4000-8000-000000000999' },
      { participantId: 'absent' },
      { speakerRole: 'interviewer' },
      { origin: 'synthetic_transcript' },
      { start: 1, end: fixture.artifact.quotes[0].end + 1 },
    ]) {
      const { quoteId: _ignored, ...content } = { ...fixture.artifact.quotes[0], ...changes };
      const quote = { ...content, quoteId: canonicalHash(content) };
      const finding = reidentify(fixture.artifact.findings[0], { quoteIds: [quote.quoteId] });
      expect(() => build(fixture, { quotes: [quote], findings: [finding] })).toThrow();
    }
  });
  test('analyses reject supplied documents, all-interviewer corpora, and no participant turns', () => {
    const fixture = one();
    for (const mutate of [
      (doc) => {
        doc.origin = 'supplied_document';
        doc.turns = [];
      },
      (doc) => {
        doc.participants[0].role = 'interviewer';
      },
      (doc) => {
        doc.participants.push({
          ...doc.participants[0],
          participantId: 'interviewer',
          role: 'interviewer',
        });
        doc.turns[0].participantId = 'interviewer';
      },
    ]) {
      const corpus = clone(fixture.context.corpus);
      mutate(corpus.documents[0]);
      expect(TranscriptCorpusV1Schema.safeParse(corpus).success).toBe(true);
      expect(() => validateAnalysisRequest(fixture.context.request, corpus)).toThrow();
    }
  });
});

describe('source accounting and caller authority', () => {
  test('provider coverage cannot override deterministic accounting', () => {
    const fixture = one();
    for (const field of coverageFields) {
      const candidate = clone(fixture.artifact);
      if (field === 'coverageStatus') candidate[field] = 'blocked';
      else if (field === 'quoteLineage') candidate[field][0].interviewQuestionId = 'analysis-pain';
      else if (field === 'participantCoverage' || field === 'questionCoverage')
        candidate[field][0].findingIds = [];
      else if (field === 'outputCoverage') candidate[field][0].entryIds = [];
      else candidate[field][0].status = 'blocked';
      expect(QualitativeAnalysisV1Schema.safeParse(candidate).success).toBe(true);
      expect(() => validateQualitativeAnalysis(candidate, fixture.context), field).toThrow();
    }
  });
  test('analysis question and interview question identities are distinct namespaces', () => {
    const fixture = one(),
      document = fixture.context.corpus.documents[0];
    document.turns[0].questionId = 'interview-not-analysis';
    const quote = extractSourceQuote(fixture.context.corpus, {
      documentId: document.documentId,
      turnId: 't1',
      participantId: 'p1',
      start: 0,
      end: document.turns[0].end,
    });
    fixture.artifact.quotes = [quote];
    fixture.artifact.findings = [
      reidentify(fixture.artifact.findings[0], { quoteIds: [quote.quoteId] }),
    ];
    const result = build(fixture);
    expect(result.questionCoverage[0].questionId).toBe('analysis-pain');
    expect(result.quoteLineage[0].interviewQuestionId).toBe('interview-not-analysis');
  });
  test('unused quotes cannot pad source coverage', () => {
    const fixture = mixed();
    expect(() =>
      build(fixture, {
        findings: [fixture.artifact.findings[0]],
        personas: [fixture.artifact.personas[0]],
        gaps: [gap({ participantRef: fixture.artifact.findings[1].participantRefs[0] })],
      })
    ).toThrow();
  });
  test('each participant, question, and output requires explicit accounting', () => {
    const fixture = blocked();
    for (const key of ['participantRef', 'questionId', 'output']) {
      const changed = clone(fixture.artifact.gaps[0]);
      changed[key] = null;
      expect(() => build(fixture, { gaps: [changed] }), key).toThrow();
    }
  });
  test('unsupported findings require a matching question/participant evidence gap', () => {
    const fixture = one();
    const finding = reidentify(fixture.artifact.findings[0], {
      basis: 'interpretation',
      supportStatus: 'conflicting',
    });
    for (const gaps of [
      [],
      [gap({ output: 'jobs_pains', code: 'conflicting_evidence' })],
      [
        gap({
          questionId: 'analysis-pain',
          participantRef: finding.participantRefs[0],
          output: 'jobs_pains',
        }),
      ],
    ])
      expect(() => build(fixture, { findings: [finding], gaps })).toThrow();
  });
  test('gap claims cannot contradict present participant turns or requested sets', () => {
    const fixture = one();
    for (const value of [
      gap({
        code: 'missing_participant_turns',
        participantRef: fixture.artifact.findings[0].participantRefs[0],
      }),
      gap({ questionId: 'unrequested' }),
      gap({ output: 'personas' }),
      gap({ participantRef: person(fixture.context.corpus.documents[0].documentId, 'absent') }),
    ])
      expect(() => build(fixture, { gaps: [value] })).toThrow();
  });
  test('finding categories and personas cannot invent an unrequested output', () => {
    const fixture = one();
    expect(() =>
      build(fixture, {
        findings: [reidentify(fixture.artifact.findings[0], { category: 'trait' })],
      })
    ).toThrow();
    expect(() => build(fixture, { personas: mixed().artifact.personas })).toThrow();
  });
  test('caller request, corpus hash, scope, source kind/hash/id remain authoritative', () => {
    const fixture = one();
    for (const mutate of [
      (context) => {
        context.request.decisionQuestion = 'Changed decision';
      },
      (context) => {
        context.request.outputs = ['personas'];
      },
      (context) => {
        context.acceptedScope.artifactHash = 'f'.repeat(64);
      },
      (context) => {
        context.sourceArtifacts[0].artifactHash = 'f'.repeat(64);
      },
      (context) => {
        context.sourceArtifacts[0].kind = 'simulation';
      },
      (context) => {
        context.sourceArtifacts[0].artifactId = '00000000-0000-4000-8000-000000000999';
      },
      (context) => {
        context.sourceArtifacts = [];
      },
      (context) => {
        context.sourceArtifacts.push(context.sourceArtifacts[0]);
      },
      (context) => {
        context.corpus.documents[0].title = 'Changed frozen corpus';
      },
    ]) {
      const context = clone(fixture.context);
      mutate(context);
      expect(() => validateQualitativeAnalysis(fixture.artifact, context)).toThrow();
    }
  });
  test('source artifact reference order is not authority but request question order is', () => {
    const fixture = one();
    const refs = [
      ...fixture.artifact.sourceArtifacts,
      {
        ...fixture.artifact.sourceArtifacts[0],
        artifactId: '00000000-0000-4000-8000-000000000777',
      },
    ];
    const result = build(fixture, { sourceArtifacts: refs });
    expect(
      validateQualitativeAnalysis(result, { ...fixture.context, sourceArtifacts: refs.reverse() })
    ).toEqual(result);
    const ordered = goldens.cases.find((value) => value.name === 'utf16_order');
    const changed = clone(ordered.context);
    changed.request.questions.reverse();
    expect(() => validateQualitativeAnalysis(ordered.artifact, changed)).toThrow();
  });
  test('coverage makes no unsupported entailment, business value, or authenticity judgment', () => {
    const fixture = one();
    const finding = reidentify(fixture.artifact.findings[0], {
      basis: 'interpretation',
      statement: 'An intentionally unsupported business interpretation.',
    });
    const result = build(fixture, { findings: [finding] });
    expect(result.coverageStatus).toBe('complete');
    expect(result).not.toHaveProperty('verifiedHuman');
    expect(result).not.toHaveProperty('businessValue');
    expect(result).not.toHaveProperty('confidence');
  });
});

describe('aggregate bounds without unrequested generic artifact limits', () => {
  test('derived text UTF-8 byte aggregate is independently bounded', () => {
    const value = contentOf(one().artifact);
    value.findings = Array.from({ length: 65 }, (_, index) =>
      createAnalysisFinding({
        ...findingContent(value.findings[0]),
        statement: 'x'.repeat(3998) + String(index).padStart(2, '0'),
      })
    );
    expect(AnalysisContentV1Schema.safeParse(value).success).toBe(false);
  });
  test('quote UTF-8 byte aggregate rejects oversized repeated independent source spans', () => {
    const value = contentOf(one().artifact);
    value.quotes = [0, 1].map((index) => {
      const { quoteId: _ignored, ...content } = value.quotes[0];
      const text = 'x'.repeat(64_001);
      const quote = {
        ...content,
        documentId: '00000000-0000-4000-8000-00000000000' + (index + 1),
        start: 0,
        end: 64_001,
        text,
        textSha256: sha256Hex(text),
      };
      return { ...quote, quoteId: canonicalHash(quote) };
    });
    expect(AnalysisContentV1Schema.safeParse(value).success).toBe(false);
  });
  test('bounded identity collections may exceed one megabyte without extra Python-incompatible cap', () => {
    const value = contentOf(one().artifact),
      template = findingContent(value.findings[0]);
    const quoteIds = Array.from({ length: ANALYSIS_LIMITS.quotes }, (_, index) =>
      index.toString(16).padStart(64, '0')
    );
    value.findings = Array.from({ length: ANALYSIS_LIMITS.findings }, (_, index) =>
      createAnalysisFinding({
        ...template,
        quoteIds,
        statement: 'Bounded identity fixture ' + index,
      })
    );
    expect(Buffer.byteLength(JSON.stringify(value))).toBeGreaterThan(1_000_000);
    expect(AnalysisContentV1Schema.safeParse(value).success).toBe(true);
    expect(() => deriveAnalysisCoverage(value, one().context.corpus)).toThrow();
  });
  test('derived coverage and quote records are not silently repaired', () => {
    const fixture = one();
    const candidate = clone(fixture.artifact);
    candidate.quoteLineage = [];
    expect(() => validateQualitativeAnalysis(candidate, fixture.context)).toThrow();
    expect(candidate.quoteLineage).toEqual([]);
    expect(transcriptCorpusHash(fixture.context.corpus)).toBe(fixture.artifact.corpusHash);
  });
});
