// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalHash, sha256Hex } from '../../lib/workflow-v2/canonical.js';
import {
  CapabilityIdSchema,
  TranscriptCorpusV1Schema,
  SourceQuoteV1Schema,
  capabilityText,
  exactUtf8Span,
  extractSourceQuote,
  transcriptCorpusHash,
  validateCapabilityStructure,
  validateSourceQuote,
  validateTranscriptCorpus,
} from './capability-source-contracts.js';

const vectors = JSON.parse(
  readFileSync(new URL('./fixtures/capability-source-vectors.json', import.meta.url), 'utf8')
);
const fresh = () => structuredClone(vectors.cases[0]);
const quoted = (value) => {
  const { quoteId: _id, ...content } = value;
  return { ...content, quoteId: canonicalHash(content) };
};

describe('Python canonical corpus/quote parity', () => {
  for (const vector of vectors.cases) {
    it(vector.name, () => {
      expect(TranscriptCorpusV1Schema.parse(vector.corpus)).toEqual(vector.corpus);
      expect(transcriptCorpusHash(vector.corpus)).toBe(vector.corpusHash);
      expect(SourceQuoteV1Schema.parse(vector.quote)).toEqual(vector.quote);
      expect(validateSourceQuote(vector.corpus, vector.quote)).toEqual(vector.quote);
      expect(
        exactUtf8Span(vector.corpus.documents[0].text, vector.quote.start, vector.quote.end)
      ).toBe(vector.quote.text);
    });
  }
  it('retains a source BOM rather than silently decoding it away', () => {
    const row = fresh();
    expect(row.quote.text.codePointAt(0)).toBe(0xfeff);
    expect(
      exactUtf8Span(row.corpus.documents[0].text, row.quote.start, row.quote.end).codePointAt(0)
    ).toBe(0xfeff);
  });
  it('keeps interviewer evidence separate from participant evidence', () => {
    const row = fresh();
    expect(() => validateSourceQuote(row.corpus, row.auditQuote)).toThrow();
    expect(validateSourceQuote(row.corpus, row.auditQuote, { requireParticipant: false })).toEqual(
      row.auditQuote
    );
  });
  it('preserves nullable fields and normalizes UUID case as Python wire serialization does', () => {
    const row = fresh();
    row.corpus.documents[0].documentId = row.corpus.documents[0].documentId.toUpperCase();
    expect(TranscriptCorpusV1Schema.parse(row.corpus)).toEqual(vectors.cases[0].corpus);
    expect(
      TranscriptCorpusV1Schema.parse(row.corpus).documents[0].participants[0].displayName
    ).toBeNull();
  });
});

describe('source and quotation admission', () => {
  it.each([
    [
      'wrong text',
      (value) => {
        value.documents[0].text += ' changed';
      },
    ],
    [
      'wrong hash',
      (value) => {
        value.documents[0].textSha256 = 'f'.repeat(64);
      },
    ],
    [
      'duplicate documents',
      (value) => {
        value.documents.push(structuredClone(value.documents[0]));
      },
    ],
    [
      'duplicate speakers',
      (value) => {
        value.documents[0].participants.push(structuredClone(value.documents[0].participants[0]));
      },
    ],
    [
      'unknown speaker',
      (value) => {
        value.documents[0].turns[1].participantId = 'absent';
      },
    ],
    [
      'duplicate turns',
      (value) => {
        value.documents[0].turns[1].turnId = value.documents[0].turns[0].turnId;
      },
    ],
    [
      'overlapping turns',
      (value) => {
        value.documents[0].turns[1].start = 10;
      },
    ],
    [
      'split UTF8 start',
      (value) => {
        value.documents[0].turns[1].start += 1;
      },
    ],
    [
      'wrong offset unit',
      (value) => {
        value.documents[0].turns[0].offsetUnit = 'codepoints';
      },
    ],
    [
      'numeric bool',
      (value) => {
        value.documents[0].turns[0].start = true;
      },
    ],
    [
      'coerced number',
      (value) => {
        value.documents[0].turns[0].start = '10';
      },
    ],
    [
      'extra field',
      (value) => {
        value.documents[0].privateMetadata = 'not admitted';
      },
    ],
    [
      'missing required nullable field',
      (value) => {
        delete value.documents[0].participants[0].displayName;
      },
    ],
    [
      'synthetic origin upgrade',
      (value) => {
        value.documents[0].originArtifactRefs = structuredClone(
          vectors.cases[1].corpus.documents[0].originArtifactRefs
        );
      },
    ],
    [
      'invalid Unicode',
      (value) => {
        value.documents[0].title = '\ud800';
      },
    ],
  ])('rejects %s', (_name, mutate) => {
    const corpus = fresh().corpus;
    mutate(corpus);
    expect(TranscriptCorpusV1Schema.safeParse(corpus).success).toBe(false);
  });
  it('requires explicit questions for synthetic turns', () => {
    const corpus = structuredClone(vectors.cases[1].corpus);
    corpus.documents[0].turns[0].questionId = null;
    expect(TranscriptCorpusV1Schema.safeParse(corpus).success).toBe(false);
  });
  it.each([
    [
      'stale source hash',
      (quote) => {
        quote.sourceTextSha256 = 'f'.repeat(64);
      },
    ],
    [
      'wrong speaker role',
      (quote) => {
        quote.speakerRole = 'interviewer';
      },
    ],
    [
      'wrong participant',
      (quote) => {
        quote.participantId = 'interviewer';
      },
    ],
    [
      'changed origin',
      (quote) => {
        quote.origin = 'synthetic_transcript';
      },
    ],
    [
      'wrong document',
      (quote) => {
        quote.documentId = 'a2000000-0000-4000-8000-000000000001';
      },
    ],
  ])('cannot make %s authoritative by rehashing a quote', (_name, mutate) => {
    const { corpus, quote } = fresh();
    mutate(quote);
    const selfConsistent = quoted(quote);
    expect(SourceQuoteV1Schema.safeParse(selfConsistent).success).toBe(true);
    expect(() => validateSourceQuote(corpus, selfConsistent)).toThrow();
  });
  it('rejects wrong exact quote bytes and crossed participant spans', () => {
    const { corpus, quote } = fresh();
    expect(() =>
      extractSourceQuote(corpus, { ...quote, candidateText: 'Invented text' })
    ).toThrow();
    expect(() => extractSourceQuote(corpus, { ...quote, start: quote.start - 1 })).toThrow();
  });
  it('enforces trusted producer origin independently of label/hash consistency', () => {
    const { corpus } = fresh(),
      id = corpus.documents[0].documentId;
    expect(
      validateTranscriptCorpus(corpus, { trustedOrigins: { [id]: 'supplied_transcript' } })
    ).toEqual(corpus);
    expect(() =>
      validateTranscriptCorpus(corpus, { trustedOrigins: { [id]: 'synthetic_transcript' } })
    ).toThrow();
    expect(() =>
      validateTranscriptCorpus(corpus, {
        trustedOrigins: { 'a3000000-0000-4000-8000-000000000001': 'supplied_transcript' },
      })
    ).toThrow();
  });
  it('keeps supplied-document audit quotes out of participant analysis', () => {
    const text = 'A supplied fictional document.';
    const corpus = {
      schemaVersion: 'axwise.transcript-corpus.v1',
      documents: [
        {
          documentId: 'a4000000-0000-4000-8000-000000000001',
          title: 'Document',
          text,
          textSha256: sha256Hex(text),
          origin: 'supplied_document',
          originArtifactRefs: [],
          participants: [],
          turns: [],
        },
      ],
    };
    const args = {
      documentId: corpus.documents[0].documentId,
      turnId: null,
      participantId: null,
      start: 0,
      end: new TextEncoder().encode(text).length,
    };
    expect(() => extractSourceQuote(corpus, args)).toThrow();
    const quote = extractSourceQuote(corpus, { ...args, requireParticipant: false });
    expect(quote.speakerRole).toBeNull();
    expect(validateSourceQuote(corpus, quote, { requireParticipant: false })).toEqual(quote);
  });
  it('never silently ignores an unsupported trusted-origin map or getter', () => {
    const { corpus } = fresh(),
      id = corpus.documents[0].documentId;
    let reads = 0;
    const getter = Object.defineProperty({}, id, {
      enumerable: true,
      get() {
        reads++;
        return 'synthetic_transcript';
      },
    });
    for (const trustedOrigins of [
      new Map([[id, 'synthetic_transcript']]),
      new Date(0),
      getter,
      [],
    ]) {
      expect(() => validateTranscriptCorpus(corpus, { trustedOrigins })).toThrow();
    }
    expect(reads).toBe(0);
    const mapping = Object.assign(Object.create(null), { [id]: 'supplied_transcript' });
    expect(validateTranscriptCorpus(corpus, { trustedOrigins: mapping })).toEqual(corpus);
  });
});

describe('bounded Unicode and JSON structure', () => {
  it('measures Python codepoints, not JavaScript UTF16 units', () => {
    expect(capabilityText(1, 500).safeParse('🙂'.repeat(500)).success).toBe(true);
    expect(capabilityText(1, 500).safeParse('🙂'.repeat(501)).success).toBe(false);
    expect(capabilityText(1, 500).safeParse('\u0085').success).toBe(false);
    expect(CapabilityIdSchema.safeParse('\u0085identity').success).toBe(false);
    expect(CapabilityIdSchema.safeParse('identity\u0000').success).toBe(false);
    expect(CapabilityIdSchema.safeParse('identifier-🙂').success).toBe(true);
  });
  it.each([true, false, null, '3', 1.5, Number.MAX_SAFE_INTEGER + 1, -0, Infinity, NaN])(
    'rejects non-source integer %s',
    (value) => {
      const corpus = fresh().corpus;
      corpus.documents[0].turns[0].start = value;
      expect(TranscriptCorpusV1Schema.safeParse(corpus).success).toBe(false);
    }
  );
  it('enforces aggregate source bytes independently of character count', () => {
    const { corpus } = fresh();
    const doc = corpus.documents[0];
    doc.text = '🙂'.repeat(32_001);
    doc.textSha256 = sha256Hex(doc.text);
    doc.origin = 'supplied_document';
    doc.participants = [];
    doc.turns = [];
    expect(TranscriptCorpusV1Schema.safeParse(corpus).success).toBe(false);
  });
  it('rejects cycles, sparse arrays, arbitrary prototypes and accessors before reads', () => {
    const cycle = {};
    cycle.self = cycle;
    let reads = 0;
    const accessor = {
      get secret() {
        reads++;
        throw new Error('must not execute');
      },
    };
    for (const value of [
      cycle,
      Array(2),
      new Date(),
      accessor,
      { x: undefined },
      { [Symbol('key')]: 'value' },
      Object.assign([], { arbitrary: true }),
    ]) {
      expect(() => validateCapabilityStructure(value)).toThrow();
    }
    expect(reads).toBe(0);
  });
  it('rejects excessive structure and preserves ordinary repeated noncyclic values', () => {
    let deep = {};
    for (let index = 0; index < 66; index++) deep = { deep };
    expect(() => validateCapabilityStructure(deep)).toThrow();
    expect(() => validateCapabilityStructure(Array.from({ length: 40_001 }, () => null))).toThrow();
    expect(() => validateCapabilityStructure({ text: 'x'.repeat(1_000_001) })).toThrow();
    const shared = { text: 'synthetic' };
    expect(() => validateCapabilityStructure([shared, shared])).not.toThrow();
  });
});
